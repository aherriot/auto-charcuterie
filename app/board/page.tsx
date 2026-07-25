"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BoardScene, type BoardStats } from "@/engine/board";
import { WebGPUGate } from "../components/WebGPUGate";
import styles from "./page.module.css";

export default function BoardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<BoardStats>({ fps: 0, instances: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let scene: BoardScene | null = null;

    BoardScene.create(canvas)
      .then((s) => {
        // The effect can tear down before an async create resolves — in React
        // strict mode it reliably does — so the scene must be disposed rather
        // than leaked.
        if (cancelled) {
          s.dispose();
          return;
        }
        scene = s;
        s.onStats = setStats;
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
      scene?.dispose();
    };
  }, []);

  if (error) return <WebGPUGate reason={error} />;

  return (
    <main className={styles.main}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <header className={styles.overlay}>
        <p className={styles.eyebrow}>Phase 1 · renderer core</p>
        <h1 className={styles.title}>Auto&#8209;Charcuterie</h1>
        <p className={styles.hint}>Drag to orbit · scroll or pinch to zoom</p>
      </header>

      <footer className={styles.footer}>
        <span className={stats.fps < 55 ? styles.bad : styles.good}>
          {stats.fps.toFixed(0)} fps
        </span>
        <Link href="/" className={styles.link}>
          ← home
        </Link>
        <Link href="/spike/cloth" className={styles.link}>
          cloth spike →
        </Link>
      </footer>
    </main>
  );
}
