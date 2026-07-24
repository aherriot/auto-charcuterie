"use client";

/**
 * Phase 0 — cloth spike.
 *
 * Throwaway. Exists to answer one question before the real app is built:
 * can GPU-solved XPBD cloth make a slice of prosciutto drape convincingly,
 * given that Rapier has no soft bodies?
 *
 * Deleted once Phase 0 is signed off. See docs/03-phases.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ClothScene, type SceneStats } from "@/engine/spike/clothScene";
import { DEFAULT_PARAMS, type ClothParams } from "@/engine/cloth/solver";
import { PRESETS } from "@/engine/spike/presets";
import styles from "./page.module.css";

type SliderSpec = {
  key: keyof ClothParams;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  /** Reallocates buffers and restarts the sim. */
  reshapes?: boolean;
};

const SLIDERS: SliderSpec[] = [
  { key: "grid", label: "Grid resolution", min: 8, max: 48, step: 1, hint: "Particles per side. Cost is quadratic.", reshapes: true },
  { key: "slices", label: "Slices", min: 1, max: 12, step: 1, hint: "Perf target: 60fps at 8.", reshapes: true },
  { key: "substeps", label: "Substeps", min: 1, max: 20, step: 1, hint: "More substeps, stiffer and more stable." },
  { key: "iterations", label: "Iterations", min: 2, max: 16, step: 2, hint: "Constraint passes per substep. Forced even." },
  { key: "kStruct", label: "Structural stiffness", min: 0, max: 1, step: 0.01, hint: "How much the weave resists stretching." },
  { key: "kShear", label: "Shear stiffness", min: 0, max: 1, step: 0.01, hint: "Resists in-plane racking." },
  { key: "kBend", label: "Bend stiffness", min: 0, max: 1, step: 0.005, hint: "The floppiness dial. High = holds a fold instead of pooling." },
  { key: "damping", label: "Damping", min: 0.9, max: 1, step: 0.001, hint: "Velocity retained per substep." },
  { key: "friction", label: "Friction", min: 0, max: 1, step: 0.01, hint: "Stops slices sliding off domes." },
  { key: "relax", label: "Relaxation", min: 0.5, max: 2, step: 0.05, hint: "Jacobi over-relaxation. Too high oscillates." },
  { key: "gravity", label: "Gravity", min: 0, max: 20, step: 0.1, hint: "" },
  { key: "spacing", label: "Particle spacing", min: 0.02, max: 0.14, step: 0.002, hint: "Rest length. Sets overall slice size." },
  { key: "thickness", label: "Thickness", min: 0.001, max: 0.06, step: 0.001, hint: "Collision offset. Raise it if slices look like paper." },
  { key: "sliceSep", label: "Slice separation", min: 0.005, max: 0.09, step: 0.002, hint: "Gap held between different slices. Reads as slice thickness." },
  { key: "selfStiff", label: "Slice-vs-slice", min: 0, max: 1.5, step: 0.05, hint: "Push-apart strength. 0 disables the spatial hash entirely." },
  { key: "windAmp", label: "Wind", min: 0, max: 2, step: 0.02, hint: "Breaks unnatural symmetry on flat settles." },
  { key: "maxStep", label: "Max step", min: 0.002, max: 0.08, step: 0.002, hint: "Displacement clamp per substep. Anti-explosion guard." },
];

const SLEEP_SLIDERS: SliderSpec[] = [
  { key: "sleepFrames", label: "Sleep delay", min: 0, max: 150, step: 5, hint: "Quiet frames before a slice freezes. 0 disables sleeping." },
  { key: "sleepEnergy", label: "Sleep threshold", min: 0, max: 2e-7, step: 5e-9, hint: "Peak v² below which a slice counts as still. Raise to settle sooner." },
];

const CRITERIA = [
  "Drapes over the mound rather than tenting across it",
  "Edges fold and curl rather than staying flat",
  "Settles without jitter",
  "60fps with 8 slices simulating",
];

export default function ClothSpikePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ClothScene | null>(null);

  const [params, setParams] = useState<ClothParams>(DEFAULT_PARAMS);
  const [preset, setPreset] = useState(PRESETS[1]);
  const [stats, setStats] = useState<SceneStats>({ fps: 0, particles: 0, slices: 1 });
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean[]>(() => CRITERIA.map(() => false));
  const [showSleep, setShowSleep] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let scene: ClothScene | null = null;

    ClothScene.create(canvas, DEFAULT_PARAMS)
      .then((s) => {
        if (cancelled) {
          s.dispose();
          return;
        }
        scene = s;
        sceneRef.current = s;
        s.onStats = setStats;
        s.setObstacles(PRESETS[1].obstacles);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const update = useCallback((key: keyof ClothParams, value: number, reshapes?: boolean) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    sceneRef.current?.setParams({ [key]: value } as Partial<ClothParams>);
    // Reshaping reallocates and re-seeds; other params apply live so you can
    // tune stiffness on a slice mid-drape.
    if (reshapes) sceneRef.current?.reset();
  }, []);

  const applyPreset = useCallback((id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPreset(p);
    const scene = sceneRef.current;
    if (!scene) return;
    const spawn = { spawnX: p.spawn?.x ?? 0, spawnZ: p.spawn?.z ?? 0 };
    setParams((prev) => ({ ...prev, ...spawn }));
    scene.setParams(spawn);
    scene.setObstacles(p.obstacles);
    scene.reset();
  }, []);

  if (error) {
    return (
      <main className={styles.gate}>
        <h1>The party is invite-only.</h1>
        <p>
          This spike needs WebGPU, and your browser isn&apos;t on the list.
          Try Chrome or Edge 113+, or Safari 18+.
        </p>
        <code>{error}</code>
      </main>
    );
  }

  return (
    <main className={styles.layout}>
      <div className={styles.viewport}>
        <canvas ref={canvasRef} className={styles.canvas} />
        <div className={styles.hud}>
          <span className={stats.fps < 55 ? styles.bad : styles.good}>
            {stats.fps.toFixed(0)} fps
          </span>
          <span>{stats.slices} slices</span>
          <span>{stats.particles.toLocaleString()} particles</span>
        </div>
      </div>

      <aside className={styles.panel}>
        <header className={styles.header}>
          <h1>Cloth spike</h1>
          <p>Phase 0 · throwaway</p>
        </header>

        <section className={styles.section}>
          <h2>Arrangement</h2>
          <div className={styles.presets}>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={p.id === preset.id ? styles.presetActive : styles.preset}
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className={styles.probes}>{preset.probes}</p>
          <button className={styles.reset} onClick={() => sceneRef.current?.reset()}>
            Drop again
          </button>
        </section>

        <section className={styles.section}>
          <h2>Solver</h2>
          {SLIDERS.map((s) => (
            <label key={s.key} className={styles.slider}>
              <span className={styles.sliderTop}>
                <span>{s.label}</span>
                <output>{formatValue(params[s.key] as number, s.step)}</output>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={params[s.key] as number}
                onChange={(e) => update(s.key, Number(e.target.value), s.reshapes)}
              />
              {s.hint && <small>{s.hint}</small>}
            </label>
          ))}
        </section>

        <section className={styles.section}>
          <h2>Settling</h2>
          <p className={styles.probes}>
            XPBD never reaches exact equilibrium, so a stack shimmers forever
            unless slices are explicitly put to sleep. A frozen slice stops
            simulating but still collides, and wakes if something lands on it.
          </p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showSleep}
              onChange={(e) => {
                setShowSleep(e.target.checked);
                if (sceneRef.current) sceneRef.current.showSleep = e.target.checked;
              }}
            />
            <span>Tint sleeping slices blue</span>
          </label>
          {SLEEP_SLIDERS.map((s) => (
            <label key={s.key} className={styles.slider}>
              <span className={styles.sliderTop}>
                <span>{s.label}</span>
                <output>{formatValue(params[s.key] as number, s.step)}</output>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={params[s.key] as number}
                onChange={(e) => update(s.key, Number(e.target.value), s.reshapes)}
              />
              {s.hint && <small>{s.hint}</small>}
            </label>
          ))}
        </section>

        <section className={styles.section}>
          <h2>Exit criteria</h2>
          <p className={styles.probes}>
            All four must hold before Phase 1 starts. If they can&apos;t, we fall
            back to rigid slices with baked drape shapes.
          </p>
          {CRITERIA.map((c, i) => (
            <label key={c} className={styles.check}>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={(e) =>
                  setChecked((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                }
              />
              <span>{c}</span>
            </label>
          ))}
        </section>
      </aside>
    </main>
  );
}

function formatValue(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  // Sleep energy lives around 1e-8; fixed notation would render as a wall of zeros.
  if (step < 1e-4) return value === 0 ? "0" : value.toExponential(1);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(decimals);
}
