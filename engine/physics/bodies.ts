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

import type * as Rapier from "@dimforge/rapier3d-simd-compat";
import type { Food, MeshId } from "../../game/catalog";
import { buildFoodMesh } from "../mesh/foods";
// Rapier is loaded on demand and reached through this accessor — see world.ts.
// The types come from the type-only import above, which erases rather than
// pulling the WASM back into this chunk.
import { rapier } from "./world";

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
  // Produce and nuts are the round ones, and a bounce is what buys a roll its
  // distance: the piece leaves the board's friction, keeps its spin, and lands
  // already rolling. Trimmed rather than removed — nuts should still skitter,
  // they just shouldn't emigrate.
  produce: { density: 1.0, friction: 0.7, restitution: 0.12 },
  nut: { density: 0.85, friction: 0.55, restitution: 0.18 },
  carb: { density: 0.5, friction: 0.75, restitution: 0.12 },
};

export interface Damping {
  linear: number;
  angular: number;
}

/**
 * Rolling resistance, approximated.
 *
 * Rapier has no rolling-friction term, and raising surface friction is the
 * wrong instinct: friction is what converts a slide into a *roll*, so a
 * high-friction olive rolls further, not less. Angular damping is the only
 * lever that bleeds spin, and how much a food needs is a property of its shape
 * rather than its category — olives are nuts and cornichons are produce, but
 * both roll for the same reason, which is that they are round.
 *
 * The capsule number looks absurd next to the others, and it is load-bearing.
 * A capsule on a flat board settles into rolling without slipping, and there
 * the contact solver restores through friction very nearly what damping takes
 * out each step: measured, an olive holds a constant 3.5cm/s with |w|·r
 * matching its speed exactly, and never sleeps — it will cross the board and
 * go over the edge given long enough. The behaviour collapses only once
 * damping is raised past the point where the solver can sustain the roll,
 * which for these shapes is somewhere between 13 and 25. Below that threshold
 * the value barely matters; above it, items settle in about two and a half
 * seconds. Balls and hulls have no such fixed point and decay normally, so
 * they keep gentle values.
 */
const ROLL_DAMPING: Record<ColliderSpec["kind"], Damping> = {
  /** Rolls in any direction, but decays honestly. Only needs a nudge. */
  ball: { linear: 0.55, angular: 6 },
  /** Olives, cornichons, grissini. See the note above about the threshold. */
  capsule: { linear: 0.5, angular: 22 },
  /** Only rolls if it lands on its edge, which is a nice accident when it happens. */
  cylinder: { linear: 0.4, angular: 1.6 },
  /** Flat faces stop these on their own; damping them hard just looks dead. */
  hull: { linear: 0.35, angular: 1 },
  cuboid: { linear: 0.35, angular: 0.9 },
};

export function dampingFor(food: Food): Damping {
  return ROLL_DAMPING[COLLIDERS[food.mesh].kind];
}

/**
 * Collider shapes as plain data.
 *
 * Declared separately from the Rapier construction so they can be checked
 * against the meshes in Node without loading WASM. A collider that doesn't
 * match its mesh is invisible to the typechecker and shows up only as strange
 * physics — items tumbling, or sinking through the board — so it's worth
 * asserting rather than eyeballing.
 *
 * `axis: "x"` means the shape's natural Y axis must be rotated onto X to match
 * a mesh modelled lengthwise.
 */
export type ColliderSpec =
  | { kind: "ball"; radius: number }
  | { kind: "cuboid"; hx: number; hy: number; hz: number }
  | { kind: "capsule"; halfHeight: number; radius: number; axis: "x" | "y" }
  | { kind: "cylinder"; halfHeight: number; radius: number; axis: "x" | "y" }
  /** Built from the mesh's own vertices, so it matches by construction. */
  | { kind: "hull" };

export const COLLIDERS: Record<MeshId, ColliderSpec> = {
  // Thin flat discs. A cylinder matches far better than a box: salami rounds
  // should be able to roll on their edge if they land that way.
  salamiRound: { kind: "cylinder", halfHeight: 0.008, radius: 0.12, axis: "y" },
  soppressataRound: { kind: "cylinder", halfHeight: 0.01, radius: 0.14, axis: "y" },

  // Prosciutto is cloth in play; this collider covers the rigid fallback. The
  // slice outline is elliptical, so a circle splits the difference between its
  // long and short radii rather than circumscribing the whole thing — an
  // over-sized disc would hold the slice visibly clear of its neighbours.
  slice: { kind: "cylinder", halfHeight: 0.003, radius: 0.2, axis: "y" },

  cracker: { kind: "cuboid", hx: 0.095, hy: 0.0055, hz: 0.095 },

  goudaBlock: { kind: "cuboid", hx: 0.15, hy: 0.075, hz: 0.1 },
  cheddarCube: { kind: "cuboid", hx: 0.045, hy: 0.045, hz: 0.045 },

  // Wedges genuinely need their shape — a cheese wedge should be able to tip
  // onto a face, and a box can't express that.
  brieWedge: { kind: "hull" },
  blueWedge: { kind: "hull" },

  grape: { kind: "ball", radius: 0.05 },

  // Flat-bottomed dome: a half-height cylinder sits the way a cut fig does.
  figHalf: { kind: "cylinder", halfHeight: 0.05, radius: 0.085, axis: "y" },

  // Capsules for anything long and round, aligned onto X to match the mesh.
  cornichon: { kind: "capsule", halfHeight: 0.086, radius: 0.019, axis: "x" },
  breadstick: { kind: "capsule", halfHeight: 0.285, radius: 0.015, axis: "x" },
  olive: { kind: "capsule", halfHeight: 0.024, radius: 0.034, axis: "x" },

  // Matches the swept teardrop: 0.055 long, 0.032 wide, 0.018 thick.
  almond: { kind: "cuboid", hx: 0.055, hy: 0.018, hz: 0.032 },

  // The curve is the point: a cashew should rock rather than sit flat.
  cashew: { kind: "hull" },

  honeycomb: { kind: "cuboid", hx: 0.14, hy: 0.025, hz: 0.14 },
};

/**
 * Half-extents the collider occupies in mesh space, for comparison with the
 * mesh's own bounding box. Null for hulls, which match by construction.
 */
export function colliderExtents(spec: ColliderSpec): [number, number, number] | null {
  switch (spec.kind) {
    case "ball":
      return [spec.radius, spec.radius, spec.radius];
    case "cuboid":
      return [spec.hx, spec.hy, spec.hz];
    case "capsule":
    case "cylinder": {
      const long = spec.halfHeight + (spec.kind === "capsule" ? spec.radius : 0);
      return spec.axis === "x"
        ? [long, spec.radius, spec.radius]
        : [spec.radius, long, spec.radius];
    }
    case "hull":
      return null;
  }
}

/** Builds the collider for a food, seeded to match its mesh where a hull is used. */
export function colliderFor(food: Food, seed = 0): Rapier.ColliderDesc {
  const profile = PROFILES[food.category];
  const spec = COLLIDERS[food.mesh];
  const desc = descFor(spec, food.mesh, seed);

  // Align the collider to the mesh *within* the body, not by rotating the body.
  //
  // Rapier's capsules and cylinders are built along Y; several foods are
  // modelled along X. Rotating the rigid body to compensate also rotates the
  // rendered mesh, since the renderer takes its transform from the body — the
  // collider ends up lying flat while the mesh stands on end, so items tumble
  // and appear to sink through the board. A collider-local rotation fixes the
  // shape without touching the body's orientation.
  if ((spec.kind === "capsule" || spec.kind === "cylinder") && spec.axis === "x") {
    // -90° about Z maps the shape's Y axis onto X. Quaternion for angle theta
    // about axis n is (n·sin(theta/2), cos(theta/2)).
    const half = -Math.PI / 4;
    desc.setRotation({ x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) });
  }

  return desc
    .setDensity(profile.density)
    .setFriction(profile.friction)
    .setRestitution(profile.restitution);
}

function descFor(spec: ColliderSpec, mesh: MeshId, seed: number): Rapier.ColliderDesc {
  switch (spec.kind) {
    case "ball":
      return rapier().ColliderDesc.ball(spec.radius);
    case "cuboid":
      return rapier().ColliderDesc.cuboid(spec.hx, spec.hy, spec.hz);
    case "capsule":
      return rapier().ColliderDesc.capsule(spec.halfHeight, spec.radius);
    case "cylinder":
      return rapier().ColliderDesc.cylinder(spec.halfHeight, spec.radius);
    case "hull":
      return hullFor(mesh, seed);
  }
}

/**
 * Convex hull from the mesh's own vertices, so collision matches what's drawn.
 *
 * Falls back to a bounding box: `convexHull` returns null for degenerate input,
 * and a silently missing collider would mean food falling through the board.
 */
function hullFor(mesh: MeshId, seed: number): Rapier.ColliderDesc {
  const data = buildFoodMesh(mesh, seed);

  const points = new Float32Array((data.vertices.length / 6) * 3);
  for (let i = 0, o = 0; i < data.vertices.length; i += 6, o += 3) {
    points[o] = data.vertices[i];
    points[o + 1] = data.vertices[i + 1];
    points[o + 2] = data.vertices[i + 2];
  }

  const hull = rapier().ColliderDesc.convexHull(points);
  if (hull) return hull;

  let hx = 0;
  let hy = 0;
  let hz = 0;
  for (let i = 0; i < points.length; i += 3) {
    hx = Math.max(hx, Math.abs(points[i]));
    hy = Math.max(hy, Math.abs(points[i + 1]));
    hz = Math.max(hz, Math.abs(points[i + 2]));
  }
  return rapier().ColliderDesc.cuboid(hx || 0.01, hy || 0.01, hz || 0.01);
}

/**
 * Rotation to spawn a body with.
 *
 * Now always identity: collider alignment happens on the collider itself, and
 * the drop rotation is a yaw applied by the caller. Kept as the single place
 * to add per-food spawn poses if any food ever needs one.
 */
export function spawnRotation(_mesh: MeshId): [number, number, number, number] {
  return [0, 0, 0, 1];
}
