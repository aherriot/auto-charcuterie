"use client";

/**
 * Commentary spike.
 *
 * Throwaway. Exists to answer one question the board itself cannot answer
 * without a GPU: does the judge feed enter and evict without jumping?
 *
 * It mounts the real JudgeFeed — same component, same stylesheet — and feeds
 * it scripted remarks, so what is measured here is what ships. `window.spike`
 * is the handle a headless browser drives it through; `trace` samples every
 * line's position and opacity once a frame, which is what actually settles
 * whether the stack moves smoothly or snaps.
 *
 * Deleted once the animation is signed off.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { JudgeFeed, type JudgeFeedHandle } from "@/app/board/JudgeFeed";
import type { Remark } from "@/game/judges/director";
import styles from "./page.module.css";

interface Sample {
  /** ms since the trace started. */
  t: number;
  lines: {
    text: string;
    top: number;
    height: number;
    opacity: number;
    leaving: boolean;
  }[];
}

declare global {
  interface Window {
    spike?: {
      push(text?: string): void;
      clear(): void;
      trace(ms: number): Promise<Sample[]>;
    };
  }
}

const TEXTS = [
  "That is a lot of cheddar for one man.",
  "The grapes are doing heavy lifting here.",
  "Structurally, this is a landslide waiting to happen.",
  "I have never seen prosciutto laid down with such contempt.",
  "Someone has put the olives in charge.",
  "This board has ambitions it cannot support.",
  "The brie is sweating and so am I.",
  "A crackers-to-cheese ratio bordering on the criminal.",
];

export default function FeedSpike() {
  const feed = useRef<JudgeFeedHandle>(null);
  const at = useRef(0);
  const [running, setRunning] = useState(false);

  const push = useCallback((text?: string) => {
    at.current += 900;
    const n = at.current / 900;
    const remark: Remark = {
      judge: n % 2 === 0 ? "kai" : "bartholomew",
      // Numbered, so a long run never repeats a line — the trace identifies
      // each one by its text, and two lines sharing text read as one jumping.
      text: text ?? `${TEXTS[n % TEXTS.length]} (${n})`,
      trigger: "idle",
      at: at.current,
    };
    feed.current?.push(remark);
  }, []);

  // Samples every line once a frame. A jump is a discontinuity in `top`
  // between consecutive frames; the exit bug is a rise in `opacity` after it
  // has started falling. Both are visible in the numbers.
  const trace = useCallback((ms: number) => {
    const started = performance.now();
    const samples: Sample[] = [];
    return new Promise<Sample[]>((resolve) => {
      const tick = () => {
        const lines = [...document.querySelectorAll("p")]
          .filter((p) => p.closest("[aria-live]"))
          .map((p) => {
            const r = p.getBoundingClientRect();
            return {
              text: p.lastChild?.textContent ?? "",
              top: Math.round(r.top * 100) / 100,
              height: Math.round(r.height * 100) / 100,
              opacity: Math.round(
                Number(getComputedStyle(p).opacity) * 1000,
              ) / 1000,
              leaving: p.className.includes("leaving"),
            };
          });
        samples.push({ t: Math.round(performance.now() - started), lines });
        if (performance.now() - started < ms) requestAnimationFrame(tick);
        else resolve(samples);
      };
      requestAnimationFrame(tick);
    });
  }, []);

  useEffect(() => {
    window.spike = {
      push,
      clear: () => {
        at.current = 0;
        feed.current?.clear();
      },
      trace,
    };
    return () => {
      delete window.spike;
    };
  }, [push, trace]);

  // A hands-on mode for watching it at speed, rather than a frame at a time.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(push, 1400);
    return () => clearInterval(id);
  }, [running, push]);

  return (
    <main className={styles.main}>
      <div className={styles.controls}>
        <button onClick={() => push()}>Push one</button>
        <button onClick={() => setRunning((r) => !r)}>
          {running ? "Stop" : "Run"}
        </button>
        <button
          onClick={() => {
            at.current = 0;
            feed.current?.clear();
          }}
        >
          Clear
        </button>
      </div>
      <JudgeFeed ref={feed} />
    </main>
  );
}
