"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BoardScene, type BoardStats } from "@/engine/board";
import { CATALOG, CATEGORY_LABELS, CATEGORY_ORDER } from "@/game/catalog";
import { WebGPUGate } from "../components/WebGPUGate";
import styles from "./page.module.css";

export default function BoardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);

  const [stats, setStats] = useState<BoardStats>({
    fps: 0,
    items: 0,
    spend: 0,
    awake: 0,
    settled: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let scene: BoardScene | null = null;

    BoardScene.create(canvas)
      .then((s) => {
        // The effect can tear down before an async create resolves — in React
        // strict mode it reliably does — so the scene must be disposed.
        if (cancelled) {
          s.dispose();
          return;
        }
        scene = s;
        sceneRef.current = s;
        s.onStats = setStats;
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

  const select = useCallback((id: string) => {
    setSelected((current) => {
      const next = current === id ? null : id;
      if (sceneRef.current) sceneRef.current.selected = next;
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    sceneRef.current?.clear();
  }, []);

  if (error) return <WebGPUGate reason={error} />;

  return (
    <main className={styles.main}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <header className={styles.overlay}>
        <p className={styles.eyebrow}>Phase 3 · physics &amp; placement</p>
        <h1 className={styles.title}>Auto&#8209;Charcuterie</h1>
        <p className={styles.hint}>
          {selected
            ? "Click above the board to drop. Drag to orbit."
            : "Pick something from the tray, then click above the board."}
        </p>
      </header>

      <aside className={styles.tray}>
        <div className={styles.trayHead}>
          <h2>Selections</h2>
          <button onClick={clear} className={styles.clear}>
            Clear
          </button>
        </div>

        {CATEGORY_ORDER.map((c) => (
          <section key={c} className={styles.group}>
            <h3>{CATEGORY_LABELS[c]}</h3>
            {CATALOG.filter((f) => f.category === c).map((f) => (
              <button
                key={f.id}
                onClick={() => select(f.id)}
                className={f.id === selected ? styles.itemActive : styles.item}
              >
                <span
                  className={styles.swatch}
                  style={{
                    // Catalogue colours are linear; the swatch needs sRGB or
                    // everything reads far too dark next to the render.
                    background: `rgb(${f.color
                      .map((v) => Math.round(255 * Math.pow(v, 1 / 2.2)))
                      .join(",")})`,
                  }}
                />
                <span className={styles.itemName}>{f.shortName}</span>
                <em>£{f.price.toFixed(2)}</em>
              </button>
            ))}
          </section>
        ))}

        <div className={styles.total}>
          <span>Total</span>
          <em>£{stats.spend.toFixed(2)}</em>
        </div>
      </aside>

      <footer className={styles.footer}>
        <span className={stats.fps < 55 ? styles.bad : styles.good}>
          {stats.fps.toFixed(0)} fps
        </span>
        <span>{stats.items} items</span>
        <span className={stats.settled ? styles.good : undefined}>
          {stats.settled ? "settled" : `${stats.awake} moving`}
        </span>
        <Link href="/" className={styles.link}>
          ← home
        </Link>
        <Link href="/catalog" className={styles.link}>
          catalogue →
        </Link>
      </footer>
    </main>
  );
}
