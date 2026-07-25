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
import { Director, type Remark } from "../game/judges/director";
import { judge, type Judgement } from "../game/judges/index";
import { initPhysics, PhysicsWorld } from "./physics/world";
import { DropIndicator } from "./dropIndicator";
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
  /** Per-food tallies, so the tray can read as an itemised bill. */
  counts: Record<string, number>;
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

  private selectedFood: string | null = null;

  /** Food id to drop on the next board click. Null means clicks only orbit. */
  get selected(): string | null {
    return this.selectedFood;
  }

  set selected(id: string | null) {
    this.selectedFood = id;
    // Clear immediately rather than waiting for the next pointer move, so
    // deselecting makes the indicator disappear at once.
    if (!id) this.indicator?.set(null, null);
  }

  private director = new Director({ seed: Math.floor(Math.random() * 1e9) });
  private indicator!: DropIndicator;
  /** Latest cursor position over the canvas, or null when it has left. */
  private pointer: { x: number; y: number } | null = null;

  onStats?: (stats: BoardStats) => void;
  /** Fires when a judge has something to say. */
  onRemark?: (remark: Remark) => void;

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
    scene.indicator = new DropIndicator(renderer, BOARD_TOP, DROP_HEIGHT);
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
   * Tap-to-drop.
   *
   * Bound to pointerup and suppressed when the pointer moved, otherwise every
   * camera drag would fling food onto the board on release.
   */
  private attachPlacement(canvas: HTMLCanvasElement) {
    const active = new Set<number>();
    /** The pointer allowed to place, if the gesture is still a candidate tap. */
    let placing: number | null = null;
    let downX = 0;
    let downY = 0;
    let moved = false;

    const release = (e: PointerEvent) => {
      active.delete(e.pointerId);
      if (placing === e.pointerId) placing = null;
      // A finger leaves nothing behind when it lifts, so the ring goes with it.
      // A mouse carries on pointing at the board after the click.
      if (e.pointerType !== "mouse") this.pointer = null;
    };

    canvas.addEventListener("pointerdown", (e) => {
      active.add(e.pointerId);

      // A second finger means the gesture is a pinch, not a tap. Placement has
      // to be abandoned for the whole gesture rather than just ignored for this
      // pointer: both fingers still send pointerup, and whichever lifts last
      // would otherwise drop food at the end of every zoom.
      if (active.size > 1) {
        placing = null;
        this.pointer = null;
        return;
      }

      placing = e.pointerId;
      downX = e.clientX;
      downY = e.clientY;
      moved = false;
      // Touch has no hover, so a finger going down is the earliest the ring can
      // appear. Showing it here is what lets you see the aim before committing.
      this.pointer = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener("pointermove", (e) => {
      if (active.size > 1) return;
      this.pointer = { x: e.clientX, y: e.clientY };
      if (e.pointerId !== placing) return;

      // A mouse is held still by a hand resting on a desk; a finger is not.
      // Five pixels of slop reads a deliberate iPad tap as a drag and swallows
      // the placement.
      const slop = e.pointerType === "mouse" ? 5 : 14;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > slop) moved = true;
    });

    canvas.addEventListener("pointerup", (e) => {
      const food = this.selectedFood;
      const placed = placing === e.pointerId && !moved && food !== null;
      release(e);
      if (!placed || !food) return;

      const target = this.targetAt(e.clientX, e.clientY);
      if (!target) return;

      this.state.drop(food, target.x, target.z);
    });

    canvas.addEventListener("pointercancel", release);

    canvas.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") this.pointer = null;
    });
  }

  /**
   * Where the cursor points on the board.
   *
   * Intersects the **board surface**, not the release plane. Picking the
   * release plane means the item falls to a point that isn't under the cursor —
   * perspective puts those two places noticeably apart — so food lands where
   * you weren't looking. Aiming at the board and releasing from directly above
   * that point is what makes placement feel predictable.
   */
  private targetAt(clientX: number, clientY: number) {
    const hit = this.renderer.pickOnPlane(clientX, clientY, BOARD_TOP);
    if (!hit) return null;

    const [x, z] = hit;
    return {
      x,
      z,
      onBoard: DropIndicator.isOnBoard(x, z, BOARD_HALF_X, BOARD_HALF_Z),
    };
  }

  drop(foodId: string, x = 0, z = 0) {
    this.state.drop(foodId, x, z);
  }

  clear() {
    this.state.clear();
    this.director.reset();
  }

  snapshot(): BoardSnapshot {
    return this.state.snapshot();
  }

  /** Runs both scorers and returns the full verdict. */
  judge(): Judgement {
    return judge(this.state.snapshot());
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;

    this.state.update(dt);

    this.indicator.set(
      this.pointer && this.selectedFood
        ? this.targetAt(this.pointer.x, this.pointer.y)
        : null,
      this.selectedFood,
    );
    this.indicator.update(dt);

    // The director needs a snapshot every frame to spot events. Building one is
    // cheap — it's a map over a few dozen items with no allocation beyond the
    // array — and it keeps the judges reacting within a frame of something
    // happening rather than on a polling interval.
    const remark = this.director.update(dt, this.state.snapshot());
    if (remark) this.onRemark?.(remark);

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.4) {
      this.onStats?.({
        fps: this.fpsFrames / this.fpsAccum,
        items: this.state.count,
        spend: this.state.spend,
        awake: this.physics.awakeCount,
        settled: this.state.settled,
        counts: this.state.counts(),
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
