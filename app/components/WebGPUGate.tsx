"use client";

/**
 * WebGPU capability gate.
 *
 * There is deliberately no WebGL fallback — see docs/01-vision-and-decisions.md.
 * Since we own the renderer, a fallback would mean maintaining a second shading
 * language and a non-compute cloth path. Browsers that can't play get turned
 * away in character instead.
 */

import type { ReactNode } from "react";
import styles from "./WebGPUGate.module.css";

export function WebGPUGate({ reason }: { reason: string }): ReactNode {
  return (
    <main className={styles.gate}>
      <p className={styles.eyebrow}>Guest list</p>
      <h1 className={styles.title}>You&rsquo;re not on it.</h1>
      <p className={styles.body}>
        This board is rendered with WebGPU, and your browser doesn&rsquo;t speak
        it. Kai says the lighting in here wouldn&rsquo;t have worked for you
        anyway. Bartholomew has already stopped listening.
      </p>
      <p className={styles.help}>
        Try Chrome or Edge 113+, Safari 18+, or Firefox with WebGPU enabled.
      </p>
      <code className={styles.detail}>{reason}</code>
    </main>
  );
}
