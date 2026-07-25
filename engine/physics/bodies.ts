/**
 * Per-food collider construction.
 *
 * Analytic shapes are strongly preferred over convex hulls: they're cheaper to
 * test, they never fail to build, and their inertia tensors are exact. A hull is
 * only worth it where the silhouette genuinely carries the behaviour — a cashew
 * rocks on its curve, and a box would sit flat and dead.
 *
 * Collider dimensions are matched to `engine/mesh/foods.ts` by hand. They don't
 * need to be exact — they need to feel right when items stack.
 */

import type { Food, MeshId } from "../../game/catalog";
import { buildFoodMesh } from "../mesh/foods";
import { RAPIER } from "./world";

export interface PhysicsProfile {
  /** kg/m³-ish. Relative values are what matter, not absolute realism. */
  density: number;
  friction: number;
  restitution: number;
}

/**
 * Bounciness is the main dial for how a food *feels* when it lands. Nuts skitter,
 * cheese lands with a dead thud, and a cracker should sound brittle even though
 * there's no sound yet.
 */
const PROFILES: Record<string, PhysicsProfile> = {
  meat: { density: 1.0, friction: 0.9, restitution: 0.02 },
  cheese: { density: 1.1, friction: 0.8, restitution: 0.03 },
  produce: { density: 1.0, friction: 0.7, restitution: 0.18 },
  nut: { density: 0.85, friction: 0.55, restitution: 0.3 },
  carb: { density: 0.5, friction: 0.75, restitution: 0.12 },
};

/** Builds the collider for a food, seeded to match its mesh where a hull is used. */
export function colliderFor(food: Food, seed = 0): RAPIER.ColliderDesc {
  const profile = PROFILES[food.category];
  const desc = shapeFor(food.mesh, seed);
  return desc
    .setDensity(profile.density)
    .setFriction(profile.friction)
    .setRestitution(profile.restitution);
}

function shapeFor(mesh: MeshId, seed: number): RAPIER.ColliderDesc {
  switch (mesh) {
    // Thin flat discs. A cylinder matches far better than a box: salami rounds
    // should be able to roll on their edge if they land that way.
    case "salamiRound":
      return RAPIER.ColliderDesc.cylinder(0.008, 0.115);
    case "soppressataRound":
      return RAPIER.ColliderDesc.cylinder(0.01, 0.13);

    // Prosciutto is cloth in play; this collider only exists for tray previews
    // and for the case where cloth is disabled.
    case "slice":
      return RAPIER.ColliderDesc.cylinder(0.003, 0.2);

    case "cracker":
      return RAPIER.ColliderDesc.cuboid(0.095, 0.0055, 0.095);

    case "goudaBlock":
      return RAPIER.ColliderDesc.cuboid(0.15, 0.075, 0.1);
    case "cheddarCube":
      return RAPIER.ColliderDesc.cuboid(0.075, 0.075, 0.075);

    // Wedges genuinely need their shape — a cheese wedge should be able to tip
    // onto a face, and a box can't express that.
    case "brieWedge":
    case "blueWedge":
      return hullFor(mesh, seed);

    case "grape":
      return RAPIER.ColliderDesc.ball(0.05);

    case "figHalf":
      // Flat-bottomed dome: a half-height cylinder sits the way a cut fig does.
      return RAPIER.ColliderDesc.cylinder(0.05, 0.082);

    // Capsules for anything long and round. The mesh's long axis is X, and
    // Rapier capsules run along Y, so these are rotated at spawn.
    case "cornichon":
      return RAPIER.ColliderDesc.capsule(0.086, 0.019);
    case "breadstick":
      return RAPIER.ColliderDesc.capsule(0.285, 0.015);

    case "olive":
      // Elongated along X — a capsule captures the roll better than a ball.
      return RAPIER.ColliderDesc.capsule(0.024, 0.034);

    case "almond":
      return RAPIER.ColliderDesc.cuboid(0.052, 0.017, 0.03);

    // The curve is the point: a cashew should rock rather than sit flat.
    case "cashew":
      return hullFor(mesh, seed);

    case "honeycomb":
      return RAPIER.ColliderDesc.cuboid(0.12, 0.025, 0.12);
  }
}

/**
 * Convex hull from the mesh's own vertices, so collision matches what's drawn.
 *
 * Falls back to a bounding box: `convexHull` returns null for degenerate input,
 * and a silently missing collider would mean food falling through the board.
 */
function hullFor(mesh: MeshId, seed: number): RAPIER.ColliderDesc {
  const data = buildFoodMesh(mesh, seed);

  const points = new Float32Array((data.vertices.length / 6) * 3);
  for (let i = 0, o = 0; i < data.vertices.length; i += 6, o += 3) {
    points[o] = data.vertices[i];
    points[o + 1] = data.vertices[i + 1];
    points[o + 2] = data.vertices[i + 2];
  }

  const hull = RAPIER.ColliderDesc.convexHull(points);
  if (hull) return hull;

  let hx = 0;
  let hy = 0;
  let hz = 0;
  for (let i = 0; i < points.length; i += 3) {
    hx = Math.max(hx, Math.abs(points[i]));
    hy = Math.max(hy, Math.abs(points[i + 1]));
    hz = Math.max(hz, Math.abs(points[i + 2]));
  }
  return RAPIER.ColliderDesc.cuboid(hx || 0.01, hy || 0.01, hz || 0.01);
}

/**
 * Spawn rotation for foods whose collider axis differs from their mesh axis.
 *
 * Rapier capsules and cylinders are built along Y. Discs are modelled lying
 * flat (their axis already Y), but long items — cornichons, breadsticks, olives
 * — run along X in object space and must be rotated to match.
 */
export function spawnRotation(mesh: MeshId): [number, number, number, number] {
  switch (mesh) {
    case "cornichon":
    case "breadstick":
    case "olive": {
      // -90° about Z maps the capsule's Y axis onto the mesh's X axis.
      const h = -Math.PI / 4;
      return [0, 0, Math.sin(h), Math.cos(h)];
    }
    default:
      return [0, 0, 0, 1];
  }
}
