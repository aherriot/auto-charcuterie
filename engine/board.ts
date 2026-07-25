/**
 * The board scene: geometry, physics, placement, and the render loop.
 *
 * Phase 3 makes it interactive — pick a food, click above the board, watch it
 * land. Phase 4 adds draping slices; Phase 5 starts reading snapshots from it.
 */

import { SceneRenderer } from "./scene";
import { roundedBox } from "./mesh/primitives";
import { MaterialId } from "../game/catalog";
import type { BoardSnapshot } from "../game/snapshot";
import { initPhysics, PhysicsWorld } from "./physics/world";
import {
  BoardState,
  BOARD_HALF_X,
  BOARD_HALF_Z,
  BOARD_TOP,
  DROP_HEIGHT,
} from "./boardState";

export { BOARD_HALF_X, BOARD_HALF_Z, BOARD_TOP };

export interface BoardStats {
  fps: number;
  items: number;
  spend: number;
  awake: number;
  settled: boolean;
}

export class BoardScene {
  private renderer: SceneRenderer;
  private physics: PhysicsWorld;
  private state: BoardState;

  private raf = 0;
  private disposed = false;
  private last = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;

  /** Food id to drop on the next board click. Null means clicks only orbit. */
  selected: string | null = null;

  onStats?: (stats: BoardStats) => void;

  private constructor(
    renderer: SceneRenderer,
    physics: PhysicsWorld,
    state: BoardState,
  ) {
    this.renderer = renderer;
    this.physics = physics;
    this.state = state;
  }

  static async create(canvas: HTMLCanvasElement): Promise<BoardScene> {
    // Rapier's WASM has to be ready before any physics call.
    const [renderer] = await Promise.all([
      SceneRenderer.create(canvas),
      initPhysics(),
    ]);

    const physics = new PhysicsWorld({
      boardHalfX: BOARD_HALF_X,
      boardHalfZ: BOARD_HALF_Z,
      boardTop: BOARD_TOP,
    });

    const state = new BoardState(renderer, physics);
    const scene = new BoardScene(renderer, physics, state);

    scene.buildBoard();
    scene.attachPlacement(canvas);
    scene.loop(performance.now());
    return scene;
  }

  get camera() {
    return this.renderer.camera;
  }

  private buildBoard() {
    const mesh = this.renderer.addMesh(
      roundedBox(BOARD_HALF_X, BOARD_TOP, BOARD_HALF_Z, 0.05, 5),
    );
    this.renderer.setInstances(mesh, [
      {
        position: [0, 0, 0],
        material: {
          albedo: [0.31, 0.18, 0.09],
          roughness: 0.62,
          materialId: MaterialId.WOOD,
        },
      },
    ]);
  }

  /**
   * Click-to-drop.
   *
   * Bound to pointerup and suppressed when the pointer moved, otherwise every
   * camera drag would fling food onto the board on release.
   */
  private attachPlacement(canvas: HTMLCanvasElement) {
    let downX = 0;
    let downY = 0;
    let moved = false;

    canvas.addEventListener("pointerdown", (e) => {
      downX = e.clientX;
      downY = e.clientY;
      moved = false;
    });

    canvas.addEventListener("pointermove", (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) moved = true;
    });

    canvas.addEventListener("pointerup", (e) => {
      if (moved || !this.selected) return;

      // Intersect the release plane, so the item appears under the cursor at
      // the height it's dropped from — physics decides where it ends up.
      const hit = this.renderer.pickOnPlane(
        e.clientX,
        e.clientY,
        BOARD_TOP + DROP_HEIGHT,
      );
      if (!hit) return;

      this.state.drop(this.selected, hit[0], hit[1]);
    });
  }

  drop(foodId: string, x = 0, z = 0) {
    this.state.drop(foodId, x, z);
  }

  clear() {
    this.state.clear();
  }

  snapshot(): BoardSnapshot {
    return this.state.snapshot();
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;

    this.state.update(dt);

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.4) {
      this.onStats?.({
        fps: this.fpsFrames / this.fpsAccum,
        items: this.state.count,
        spend: this.state.spend,
        awake: this.physics.awakeCount,
        settled: this.state.settled,
      });
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.renderer.render();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.state.clear();
    this.physics.destroy();
    this.renderer.dispose();
  }
}
