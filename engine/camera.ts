/**
 * Orbit camera with pointer and touch input.
 *
 * Deliberately framework-agnostic: it owns its own listeners and exposes plain
 * matrices, so both the spike and the real scene drive it the same way.
 */

import { mat4, vec3, type Mat4 } from "wgpu-matrix";

export interface OrbitCameraOptions {
  azimuth?: number;
  elevation?: number;
  distance?: number;
  target?: [number, number, number];
  minDistance?: number;
  maxDistance?: number;
  /** Clamped so the camera can't pass under the board or flip over the top. */
  minElevation?: number;
  maxElevation?: number;
  fovDegrees?: number;
}

export class OrbitCamera {
  azimuth: number;
  elevation: number;
  distance: number;
  target: Float32Array;

  private minDistance: number;
  private maxDistance: number;
  private minElevation: number;
  private maxElevation: number;
  private fov: number;

  private detach: (() => void) | null = null;

  constructor(options: OrbitCameraOptions = {}) {
    this.azimuth = options.azimuth ?? 0.7;
    this.elevation = options.elevation ?? 0.72;
    this.distance = options.distance ?? 2.6;
    this.target = vec3.create(...(options.target ?? [0, 0.1, 0])) as Float32Array;
    this.minDistance = options.minDistance ?? 0.9;
    this.maxDistance = options.maxDistance ?? 7;
    this.minElevation = options.minElevation ?? 0.06;
    this.maxElevation = options.maxElevation ?? 1.45;
    this.fov = ((options.fovDegrees ?? 45) * Math.PI) / 180;
  }

  eye(): Float32Array {
    const ce = Math.cos(this.elevation);
    return vec3.create(
      this.target[0] + this.distance * ce * Math.sin(this.azimuth),
      this.target[1] + this.distance * Math.sin(this.elevation),
      this.target[2] + this.distance * ce * Math.cos(this.azimuth),
    ) as Float32Array;
  }

  viewProj(aspect: number): Mat4 {
    const proj = mat4.perspective(this.fov, aspect, 0.05, 100);
    const view = mat4.lookAt(this.eye(), this.target, vec3.create(0, 1, 0));
    return mat4.multiply(proj, view);
  }

  orbit(dx: number, dy: number) {
    this.azimuth -= dx * 0.006;
    this.elevation = clamp(
      this.elevation + dy * 0.006,
      this.minElevation,
      this.maxElevation,
    );
  }

  zoom(delta: number) {
    this.zoomBy(Math.exp(delta * 0.0012));
  }

  /** Scales the orbit distance directly. Pinch is naturally proportional. */
  zoomBy(factor: number) {
    this.distance = clamp(
      this.distance * factor,
      this.minDistance,
      this.maxDistance,
    );
  }

  /**
   * Binds pointer/wheel/pinch handling to a canvas. Returns a teardown function,
   * and also stores it so `dispose()` works.
   */
  attach(canvas: HTMLCanvasElement): () => void {
    this.detach?.();
    canvas.style.touchAction = "none";

    // Tracks every active pointer so two-finger pinch can be distinguished from
    // a one-finger drag without a separate gesture library.
    const active = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;

    const onDown = (e: PointerEvent) => {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (active.size === 2) pinchDistance = spread(active);
    };

    const onMove = (e: PointerEvent) => {
      const prev = active.get(e.pointerId);
      if (!prev) return;

      if (active.size === 1) {
        this.orbit(e.clientX - prev.x, e.clientY - prev.y);
      }

      active.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (active.size === 2) {
        const next = spread(active);
        if (pinchDistance > 0 && next > 0) {
          // Ratio rather than difference. The same finger separation should
          // mean the same zoom whether the fingers started 40px or 400px
          // apart, and a difference-based pinch is unusably twitchy close in.
          // Fingers apart divides the distance, which moves the camera closer.
          this.zoomBy(pinchDistance / next);
        }
        pinchDistance = next;
      }
    };

    const onUp = (e: PointerEvent) => {
      active.delete(e.pointerId);
      if (active.size < 2) pinchDistance = 0;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoom(e.deltaY);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    this.detach = () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      this.detach = null;
    };

    return this.detach;
  }

  dispose() {
    this.detach?.();
  }
}

function spread(pointers: Map<number, { x: number; y: number }>): number {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
