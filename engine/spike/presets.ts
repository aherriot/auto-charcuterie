/**
 * Obstacle arrangements for the cloth spike.
 *
 * Each preset targets one failure mode we need to rule out before committing to
 * GPU cloth for the real app.
 */

import type { Obstacle } from "../cloth/solver";

export interface Preset {
  id: string;
  name: string;
  /** What this arrangement is actually testing. */
  probes: string;
  obstacles: Obstacle[];
  /** Overrides where slices spawn, for arrangements that aren't centred. */
  spawn?: { x: number; z: number };
}

const ring = (
  count: number,
  radius: number,
  y: number,
  r: number,
  phase = 0,
): Obstacle[] =>
  Array.from({ length: count }, (_, i) => {
    const a = phase + (i / count) * Math.PI * 2;
    return [Math.cos(a) * radius, y, Math.sin(a) * radius, r] as Obstacle;
  });

export const PRESETS: Preset[] = [
  {
    id: "flat",
    name: "Bare board",
    probes:
      "Baseline. Does a slice settle flat without jitter, rippling, or creeping?",
    obstacles: [],
  },
  {
    id: "mound",
    name: "Olive mound",
    probes:
      "The critical case. Does it drape over a dome, or tent across it like a circus canopy?",
    obstacles: [
      ...ring(6, 0.16, 0.05, 0.075),
      ...ring(3, 0.08, 0.14, 0.075, 0.5),
      [0, 0.21, 0, 0.075],
    ],
  },
  {
    id: "scatter",
    name: "Scattered olives",
    probes:
      "Many small contacts. Does the slice bridge convincingly between them and sag in the gaps?",
    obstacles: [
      [-0.32, 0.05, -0.18, 0.07],
      [0.05, 0.05, -0.3, 0.07],
      [0.3, 0.05, 0.1, 0.07],
      [-0.14, 0.05, 0.28, 0.07],
      [0.14, 0.05, 0.02, 0.07],
      [-0.36, 0.05, 0.22, 0.07],
    ],
  },
  {
    id: "ridge",
    name: "Cheese ridge",
    probes:
      "A sharp edge. Do folds form along the crease, or does the surface stretch smoothly and look rubbery?",
    obstacles: [
      [-0.3, 0.06, 0, 0.11],
      [-0.1, 0.06, 0, 0.11],
      [0.1, 0.06, 0, 0.11],
      [0.3, 0.06, 0, 0.11],
    ],
  },
  {
    id: "rim",
    name: "Board edge",
    probes:
      "Overhang. Does a slice dropped near the edge fold over the rim, or clip through it?",
    obstacles: [
      [0.85, 0.05, 0, 0.09],
      [0.85, 0.05, 0.22, 0.09],
      [0.85, 0.05, -0.22, 0.09],
    ],
    spawn: { x: 0.95, z: 0 },
  },
  {
    id: "pile",
    name: "Steep pile",
    probes:
      "Stress case. A tall, unstable mound — does the solver stay stable or explode?",
    obstacles: [
      ...ring(7, 0.22, 0.05, 0.08),
      ...ring(5, 0.15, 0.17, 0.08, 0.4),
      ...ring(3, 0.09, 0.29, 0.08, 0.9),
      [0, 0.4, 0, 0.08],
    ],
  },
];
