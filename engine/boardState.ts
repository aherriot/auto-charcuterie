/**
 * Placement, physics stepping, and snapshot production.
 *
 * Owns the mapping between a placed item, its Rapier body, and its render
 * instance. This is the layer Phase 4 will extend with cloth slices and Phase 5
 * will read snapshots from.
 */

import { CATALOG, type Food } from "../game/catalog";
import type { BoardSnapshot, PlacedItem } from "../game/snapshot";
import { buildFoodMesh } from "./mesh/foods";
import { colliderFor, spawnRotation } from "./physics/bodies";
import { PhysicsWorld, type BodyHandle } from "./physics/world";
import type { MeshHandle, SceneRenderer } from "./scene";

export const BOARD_HALF_X = 1.1;
export const BOARD_HALF_Z = 0.79;
export const BOARD_TOP = 0.06;

/** Height above the board that items are released from. */
export const DROP_HEIGHT = 0.85;

interface Item {
  instanceId: number;
  food: Food;
  body: BodyHandle;
  mesh: MeshHandle;
  seed: number;
  fellOff: boolean;
}

export class BoardState {
  private renderer: SceneRenderer;
  private physics: PhysicsWorld;
  private items: Item[] = [];
  private nextInstanceId = 1;

  constructor(renderer: SceneRenderer, physics: PhysicsWorld) {
    this.renderer = renderer;
    this.physics = physics;
  }

  get count(): number {
    return this.items.length;
  }

  get spend(): number {
    return this.items.reduce((sum, i) => sum + i.food.price, 0);
  }

  /** How many of each food are on the board, keyed by food id. */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const item of this.items) {
      out[item.food.id] = (out[item.food.id] ?? 0) + 1;
    }
    return out;
  }

  /** True when every body has gone to sleep. */
  get settled(): boolean {
    return this.physics.awakeCount === 0;
  }

  /**
   * Drops a food at a point above the board.
   *
   * Each placement gets its own mesh: outlines are baked in at generation time,
   * so seeded variation can't happen per-instance. That's a real cost — one
   * vertex buffer per item — but at a few dozen items it's far cheaper than the
   * alternative of every salami round being identical.
   */
  drop(foodId: string, x: number, z: number): boolean {
    const food = CATALOG.find((f) => f.id === foodId);
    if (!food) return false;

    const instanceId = this.nextInstanceId++;
    const seed = instanceId * 7.31 + food.price;

    const mesh = this.renderer.addMesh(buildFoodMesh(food.mesh, seed));

    // Spin the item a little as it's released, so it doesn't land in the same
    // orientation every time.
    const spin = spawnRotation(food.mesh);
    const yaw = (seed % 6.28) * 0.5;
    const rotation = composeYaw(spin, yaw);

    const body = this.physics.addBody(
      colliderFor(food, seed),
      [x, BOARD_TOP + DROP_HEIGHT, z],
      rotation,
    );

    this.items.push({ instanceId, food, body, mesh, seed, fellOff: false });
    return true;
  }

  /** Steps physics and pushes the resulting transforms into the renderer. */
  update(dt: number) {
    this.physics.step(dt);

    const fallen = new Set(this.physics.drainFallen());

    for (const item of this.items) {
      if (fallen.has(item.body.id)) item.fellOff = true;

      const state = this.physics.state(item.body);
      if (!state) continue;

      this.renderer.setInstances(item.mesh, [
        {
          position: state.position,
          rotation: state.rotation,
          seed: item.seed,
          material: {
            albedo: item.food.color,
            roughness: item.food.baseRoughness,
            materialId: item.food.materialId,
            ao: 0.95,
          },
        },
      ]);
    }
  }

  snapshot(): BoardSnapshot {
    const items: PlacedItem[] = this.items.map((item) => {
      const state = this.physics.state(item.body);
      return {
        instanceId: item.instanceId,
        foodId: item.food.id,
        category: item.food.category,
        price: item.food.price,
        position: state?.position ?? [0, 0, 0],
        radius: item.food.radius,
        color: item.food.color,
        fellOff: item.fellOff,
        settled: state?.asleep ?? false,
      };
    });

    return {
      items,
      boardHalfX: BOARD_HALF_X,
      boardHalfZ: BOARD_HALF_Z,
      boardTop: BOARD_TOP,
      totalSpend: this.spend,
      settled: this.settled,
    };
  }

  clear() {
    for (const item of this.items) {
      this.physics.removeBody(item.body);
      this.renderer.setInstances(item.mesh, []);
    }
    this.items = [];
  }
}

/** Applies a yaw about world Y on top of an existing orientation. */
function composeYaw(
  q: [number, number, number, number],
  yaw: number,
): [number, number, number, number] {
  const h = yaw / 2;
  const s = Math.sin(h);
  const c = Math.cos(h);
  // Quaternion product yawQuat * q, with yawQuat = (0, s, 0, c).
  return [
    c * q[0] + s * q[2],
    c * q[1] + s * q[3],
    c * q[2] - s * q[0],
    c * q[3] - s * q[1],
  ];
}
