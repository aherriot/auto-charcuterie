/**
 * Food geometry — maps catalogue mesh ids to procedural generators.
 *
 * Everything here is built from `primitives.ts`. Sizes are in world units on a
 * board that is 2.2 units across, so an olive at 0.05 radius is about the right
 * fraction of the board a real olive would be.
 *
 * Each generator takes a seed so instances of the same food differ: no two
 * salami rounds should have the same rim wobble.
 */

import type { MeshId } from "../../game/catalog";
import {
  bezierPath,
  disc,
  loftedPolygon,
  polygonOutline,
  roundedBox,
  superellipsoid,
  sweptTube,
  wedge,
  type MeshData,
  type Vec3,
} from "./primitives";

/** Deterministic per-seed pseudorandom, so a given seed always builds the same mesh. */
function rand(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function buildFoodMesh(id: MeshId, seed = 0): MeshData {
  switch (id) {
    /**
     * Prosciutto. Simulated as cloth in play, but a mesh is still needed for
     * the tray preview and for the catalogue page, so it's a thin lofted sheet
     * with a deliberately ragged outline — a hand-torn edge, not a die-cut one.
     */
    case "slice": {
      const points = 22;
      const outline = Array.from({ length: points }, (_, i) => {
        const a = (i / points) * Math.PI * 2;
        const r =
          0.2 *
          (1 +
            Math.sin(a * 2.3 + seed) * 0.16 +
            Math.sin(a * 5.1 - seed * 1.7) * 0.09 +
            rand(seed, i) * 0.05);
        return [Math.cos(a) * r, Math.sin(a) * r * 0.8] as [number, number];
      });
      return loftedPolygon(outline, 0.006);
    }

    case "salamiRound":
      return disc(0.115, 0.016, 30, 0.05, seed + 1);

    case "soppressataRound":
      // Coarser grind, wider round, and a more irregular rim than salami.
      return disc(0.13, 0.02, 30, 0.075, seed + 2);

    case "brieWedge":
      return wedge(0.26, 0.085, Math.PI / 3.4, 9);

    case "goudaBlock":
      // A cut block rather than a wedge — gouda arrives as a slab.
      return roundedBox(0.15, 0.075, 0.1, 0.018, 3);

    case "blueWedge":
      return wedge(0.24, 0.1, Math.PI / 2.8, 9);

    case "cheddarCube":
      return roundedBox(0.075, 0.075, 0.075, 0.012, 3);

    case "grape":
      // Slightly prolate and faintly asymmetric — grapes are never spherical,
      // and a perfect sphere is a large part of why one reads as a marble.
      return superellipsoid(0.046, 0.058, 0.043, 2.15, 22, 16);

    case "figHalf": {
      // A teardrop squashed flat on the cut face: full height above, clipped
      // below, so it sits cut-side up and shows its interior.
      const m = superellipsoid(0.085, 0.1, 0.085, 2.6, 22, 16);
      return clipBelow(m, 0.0);
    }

    case "cornichon": {
      // Long, slim and noticeably curved. Length-to-width is the whole read:
      // a stubby one is a gherkin, a slim one is a cornichon.
      const bend = (rand(seed, 3) - 0.5) * 0.06;
      const path = bezierPath(
        [-0.105, 0, -0.01],
        [-0.04, 0.016 + bend, 0.018],
        [0.04, 0.014 - bend, 0.014],
        [0.105, 0, -0.008],
        16,
      );
      // Blunt at the stem end, tapering to a point at the tip.
      return sweptTube(
        path,
        (t) => 0.019 * (0.5 + Math.sin(Math.min(t * 1.15, 1) * Math.PI) ** 0.45),
        14,
      );
    }

    case "olive": {
      // Castelvetrano are large and distinctly elongated — closer to a rugby
      // ball than a sphere. The high exponent keeps the ends full rather than
      // pointed, which is what separates an olive from an egg.
      //
      // Long axis is X, not Y, so it rests on its side the way an olive
      // actually sits instead of standing upright on one end.
      return superellipsoid(0.058, 0.034, 0.034, 2.8, 22, 16);
    }

    case "almond": {
      // A teardrop, not an ellipsoid: sharply pointed at one end, broad and
      // rounded at the other, and flattened into a lens in cross-section. A
      // symmetric blob is the main reason an almond reads as a pebble.
      //
      // The tip is at -X, which the material keys off to darken the crease.
      const path: Vec3[] = Array.from({ length: 15 }, (_, i) => [
        -0.055 + (i / 14) * 0.11,
        0,
        0,
      ]);

      return sweptTube(
        path,
        (t) => {
          // Warping t before the sine moves the widest point past the middle,
          // toward the blunt end. The outer power rounds that end off; without
          // it the taper is a straight cone at both ends.
          const w = Math.sin(Math.PI * t ** 1.35);
          return 0.032 * Math.max(w, 0) ** 0.62;
        },
        16,
        // Flattened: half as thick as it is wide.
        () => [1, 0.56],
      );
    }

    case "cashew": {
      // The signature comma curve, thicker at the outer end.
      const path = bezierPath(
        [-0.05, 0, 0.012],
        [-0.03, 0, -0.03],
        [0.03, 0, -0.03],
        [0.05, 0, 0.014],
        14,
      );
      return sweptTube(
        path,
        (t) => 0.021 * (0.7 + Math.sin(t * Math.PI) * 0.55) * (1 + (1 - t) * 0.25),
        12,
        () => [1, 0.82],
      );
    }

    case "cracker": {
      // Square, deliberately: the board is otherwise full of discs and rounds,
      // and a straight-edged silhouette is the fastest way to tell a cracker
      // apart from a salami round or a cheese slice at a glance.
      //
      // Corners are eased and edges bow very slightly, so it reads as baked
      // rather than laser-cut.
      const half = 0.095;
      const corner = 0.018;
      const perSide = 5;
      const outline: Array<[number, number]> = [];

      const corners: Array<[number, number]> = [
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
      ];

      for (const [sx, sz] of corners) {
        const cx = sx * (half - corner);
        const cz = sz * (half - corner);
        const start = Math.atan2(sz, sx) - Math.PI / 4;
        for (let i = 0; i <= perSide; i++) {
          const a = start + (i / perSide) * (Math.PI / 2);
          // Sub-millimetre wobble on the radius keeps the edge from being
          // mechanically perfect.
          const r = corner * (1 + (rand(seed, i + sx * 3 + sz * 7) - 0.5) * 0.22);
          outline.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
        }
      }

      // Sweeping each corner from its diagonal through a quarter turn traces
      // the ring counter-clockwise in (x,z), which is what loftedPolygon wants.
      return loftedPolygon(outline, 0.011);
    }

    case "breadstick": {
      // Grissini are long and thin — they should overhang the board's edge.
      const wob = (rand(seed, 5) - 0.5) * 0.05;
      const path = bezierPath(
        [-0.3, 0, 0],
        [-0.1, 0, wob],
        [0.1, 0, -wob],
        [0.3, 0, 0],
        18,
      );
      return sweptTube(path, (t) => 0.015 * (0.78 + Math.sin(t * Math.PI) * 0.36), 10);
    }

    case "honeycomb":
      // An irregular hand-cut chunk, not a tidy hexagon.
      return loftedPolygon(polygonOutline(7, 0.13, 0.06, seed * 1.3), 0.05);
  }
}

/**
 * Removes geometry below a plane and caps the opening.
 *
 * Used for fig halves. Vertices below the cut are snapped up to it rather than
 * the mesh being re-triangulated: at these sizes the difference is invisible,
 * and a proper plane-triangle split would be a lot of code for one food.
 */
function clipBelow(mesh: MeshData, y: number): MeshData {
  const v = mesh.vertices.slice() as Float32Array<ArrayBuffer>;
  for (let i = 0; i < v.length; i += 6) {
    if (v[i + 1] < y) {
      v[i + 1] = y;
      // Flatten the normal toward the cut plane so the face shades as a flat
      // surface rather than inheriting the dome's curvature.
      v[i + 3] *= 0.2;
      v[i + 4] = -1;
      v[i + 5] *= 0.2;
      const l = Math.hypot(v[i + 3], v[i + 4], v[i + 5]) || 1;
      v[i + 3] /= l;
      v[i + 4] /= l;
      v[i + 5] /= l;
    }
  }
  return { vertices: v, indices: mesh.indices };
}
