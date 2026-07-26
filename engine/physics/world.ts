/**
 * Rapier physics world.
 *
 * Rigid bodies only — Rapier has no soft bodies, which is why slices are XPBD
 * cloth on the GPU instead (see docs/01-vision-and-decisions.md). Nothing here
 * knows about the cloth solver; Phase 4 couples them one-way.
 */

import type * as Rapier from "@dimforge/rapier3d-simd-compat";

/**
 * Fixed physics rate. Decoupling this from the render rate means a 120Hz
 * display and a 60Hz display produce identical stacks — with a variable step,
 * where an olive settles would depend on the monitor.
 */
export const FIXED_STEP = 1 / 120;

/** Guards against the spiral of death after a tab has been backgrounded. */
const MAX_STEPS_PER_FRAME = 8;

export interface BodyHandle {
  readonly id: number;
}

export interface BodyState {
  position: [number, number, number];
  /** Quaternion, xyzw. */
  rotation: [number, number, number, number];
  asleep: boolean;
}

/**
 * Rapier is loaded on demand, not statically imported.
 *
 * The `-compat` build inlines its WASM as base64, so a static import lands 2.3MB
 * in the board route's *initial* client chunk. That delays the board's own first
 * paint, and it also leaks: the homepage prefetches `/board` on sight, so every
 * visitor downloads a physics engine to look at a title card. Behind a dynamic
 * import it becomes a chunk of its own, fetched only when a board is built.
 *
 * Reached through `rapier()` rather than a mutable exported binding: whether a
 * re-exported `let` is still live after bundling is a bundler-specific detail,
 * and this is the app's main path. A function call is unambiguous everywhere,
 * and it can say what went wrong when the module hasn't been initialised.
 */
let loaded: typeof import("@dimforge/rapier3d-simd-compat") | null = null;

/** The Rapier module. Throws unless `initPhysics()` has resolved. */
export function rapier(): typeof import("@dimforge/rapier3d-simd-compat") {
  if (!loaded) throw new Error("Rapier used before initPhysics() resolved");
  return loaded;
}

let rapierReady: Promise<void> | null = null;

/** Loads Rapier and initialises its WASM. Must be awaited before any API call. */
export function initPhysics(): Promise<void> {
  rapierReady ??= (async () => {
    const mod = await import("@dimforge/rapier3d-simd-compat");
    await mod.init();
    loaded = mod;
  })();
  return rapierReady;
}

export interface PhysicsWorldOptions {
  boardHalfX: number;
  boardHalfZ: number;
  boardTop: number;
  /** Items below this are considered off the board and are culled. */
  floorY?: number;
}

export class PhysicsWorld {
  private world: Rapier.World;
  private bodies = new Map<number, Rapier.RigidBody>();
  private nextId = 1;
  private accumulator = 0;
  private options: Required<PhysicsWorldOptions>;

  /** Bodies that have fallen past the floor since the last drain. */
  private fallen: number[] = [];

  constructor(options: PhysicsWorldOptions) {
    this.options = { floorY: -2, ...options };
    this.world = new (rapier().World)({ x: 0, y: -9.81, z: 0 });

    this.world.timestep = FIXED_STEP;
    this.buildBoard();
  }

  private buildBoard() {
    const { boardHalfX, boardHalfZ, boardTop } = this.options;

    // The board slab. Its top surface sits at boardTop, so the collider is
    // centred half a thickness below.
    const thickness = 0.06;
    const R = rapier();
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(0, boardTop - thickness, 0),
    );
    this.world.createCollider(
      R.ColliderDesc.cuboid(boardHalfX, thickness, boardHalfZ)
        // Boards are wooden and food is damp: things should not skate around.
        .setFriction(0.85)
        .setRestitution(0.02),
      body,
    );
  }

  /**
   * Creates a dynamic body. `colliderDesc` comes from `bodies.ts`, which owns
   * the per-food shape decisions.
   */
  addBody(
    colliderDesc: Rapier.ColliderDesc,
    position: [number, number, number],
    rotation?: [number, number, number, number],
    // Damping keeps items from rolling forever on a flat board, which both
    // looks wrong and stops them ever sleeping. How much depends on the shape,
    // so it comes from `dampingFor` in bodies.ts; the defaults here are the
    // flat-item values, for callers that don't care.
    damping: { linear: number; angular: number } = { linear: 0.35, angular: 0.9 },
  ): BodyHandle {
    const desc = rapier()
      .RigidBodyDesc.dynamic()
      .setTranslation(...position)
      .setLinearDamping(damping.linear)
      .setAngularDamping(damping.angular)
      // CCD: an olive dropped from height is small and fast enough to tunnel
      // through the board in a single step without it.
      .setCcdEnabled(true);

    if (rotation) {
      desc.setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] });
    }

    const body = this.world.createRigidBody(desc);
    this.world.createCollider(colliderDesc, body);

    const id = this.nextId++;
    this.bodies.set(id, body);
    return { id };
  }

  removeBody(handle: BodyHandle) {
    const body = this.bodies.get(handle.id);
    if (!body) return;
    this.world.removeRigidBody(body);
    this.bodies.delete(handle.id);
  }

  state(handle: BodyHandle): BodyState | null {
    const body = this.bodies.get(handle.id);
    if (!body) return null;

    const t = body.translation();
    const r = body.rotation();
    return {
      position: [t.x, t.y, t.z],
      rotation: [r.x, r.y, r.z, r.w],
      asleep: body.isSleeping(),
    };
  }

  /** Ids of bodies that dropped past the floor, cleared on read. */
  drainFallen(): number[] {
    const out = this.fallen;
    this.fallen = [];
    return out;
  }

  get bodyCount(): number {
    return this.bodies.size;
  }

  /** Awake bodies only — the useful number when judging whether a board has settled. */
  get awakeCount(): number {
    let n = 0;
    for (const body of this.bodies.values()) if (!body.isSleeping()) n++;
    return n;
  }

  /**
   * Advances the simulation by real elapsed time, in fixed increments.
   *
   * Leftover time stays in the accumulator for the next frame, so the
   * simulation rate never depends on frame rate.
   */
  step(dt: number) {
    this.accumulator += Math.min(dt, 0.25);

    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      this.world.step();
      this.accumulator -= FIXED_STEP;
      steps++;
    }

    // If we hit the cap the tab was likely backgrounded; drop the backlog
    // rather than spending the next several seconds catching up.
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.collectFallen();
  }

  private collectFallen() {
    for (const [id, body] of this.bodies) {
      if (body.translation().y < this.options.floorY) {
        this.fallen.push(id);
      }
    }
  }

  destroy() {
    this.world.free();
    this.bodies.clear();
  }
}


