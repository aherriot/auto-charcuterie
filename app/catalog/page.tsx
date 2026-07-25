"use client";

/**
 * Phase 2 art-direction review.
 *
 * The bar to clear: every item recognisable at gameplay camera distance. If a
 * fig reads as "some dark lump", that's a Phase 2 failure, not a Phase 6 one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CatalogScene, type CatalogStats } from "@/engine/catalogScene";
import { CATALOG, CATEGORY_LABELS, CATEGORY_ORDER, type Food } from "@/game/catalog";
import { WebGPUGate } from "../components/WebGPUGate";
import styles from "./page.module.css";

interface Label {
  food: Food;
  x: number;
  y: number;
}

export default function CatalogPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CatalogScene | null>(null);

  const [stats, setStats] = useState<CatalogStats>({ fps: 0, items: 0, triangles: 0 });
  const [error, setError] = useState<string | null>(null);
  const [spin, setSpin] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [labels, setLabels] = useState<Label[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let scene: CatalogScene | null = null;
    let raf = 0;

    CatalogScene.create(canvas)
      .then((s) => {
        if (cancelled) {
          s.dispose();
          return;
        }
        scene = s;
        sceneRef.current = s;
        s.onStats = setStats;

        // Labels track the 3D grid, so they're re-projected each frame rather
        // than positioned once — the camera is orbiting.
        const track = () => {
          if (cancelled) return;
          raf = requestAnimationFrame(track);
          setLabels(
            s
              .labelPositions()
              .map(({ food, world }) => {
                const p = s.project(world);
                return p ? { food, x: p[0], y: p[1] } : null;
              })
              .filter((l): l is Label => l !== null),
          );
        };
        track();
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const toggleSpin = useCallback(() => {
    setSpin((s) => {
      sceneRef.current?.setSpin(!s);
      return !s;
    });
  }, []);

  if (error) return <WebGPUGate reason={error} />;

  return (
    <main className={styles.main}>
      <canvas ref={canvasRef} className={styles.canvas} />

      {showLabels && (
        <div className={styles.labels}>
          {labels.map(({ food, x, y }) => (
            <span
              key={food.id}
              className={styles.label}
              style={{ transform: `translate(-50%, 0) translate(${x}px, ${y}px)` }}
            >
              {food.shortName}
              <em>${food.price.toFixed(2)}</em>
            </span>
          ))}
        </div>
      )}

      <header className={styles.overlay}>
        <p className={styles.eyebrow}>Phase 2 · art direction review</p>
        <h1 className={styles.title}>The catalogue</h1>
        <p className={styles.hint}>
          Sixteen items, four seeds each. Every mesh and every texture is
          generated from maths — no models, no image assets.
        </p>

        <div className={styles.controls}>
          <button onClick={toggleSpin} className={styles.button}>
            {spin ? "Stop rotation" : "Rotate"}
          </button>
          <button onClick={() => setShowLabels((v) => !v)} className={styles.button}>
            {showLabels ? "Hide labels" : "Show labels"}
          </button>
        </div>
      </header>

      <aside className={styles.legend}>
        {CATEGORY_ORDER.map((c) => (
          <div key={c} className={styles.legendGroup}>
            <h2>{CATEGORY_LABELS[c]}</h2>
            <ul>
              {CATALOG.filter((f) => f.category === c).map((f) => (
                <li key={f.id}>
                  <span>{f.name}</span>
                  <em>${f.price.toFixed(2)}</em>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <footer className={styles.footer}>
        <span className={stats.fps < 55 ? styles.bad : styles.good}>
          {stats.fps.toFixed(0)} fps
        </span>
        <span>{stats.triangles.toLocaleString()} tris</span>
        <Link href="/" className={styles.link}>
          ← home
        </Link>
        <Link href="/board" className={styles.link}>
          board →
        </Link>
      </footer>
    </main>
  );
}
