/**
 * Drop indicator — shows where the selected food will land.
 *
 * Three parts, each answering a different question:
 *
 *   - a **ring** on the board surface: *where will it land?*
 *   - a **ghost** of the actual food at release height: *what am I dropping,
 *     and how big is it?*
 *   - a **guide line** between them: ties the two together, so the ghost reads
 *     as being above that spot rather than floating at an ambiguous depth.
 *
 * The ring turns red past the board edge. Physics still lets you drop there —
 * losing food off the edge is funny — but it shouldn't be a surprise.
 */

import { buildFoodMesh } from "./mesh/foods";
import { ring, sweptTube } from "./mesh/primitives";
import type { MeshHandle, SceneRenderer } from "./scene";
import { CATALOG, type Food } from "../game/catalog";

/**
 * Linear RGB. Muted deliberately: the overlay pass is unlit, so anything
 * saturated reads brighter than lit food and starts competing with the board
 * for attention. The indicator should be findable, not loud.
 */
const SAFE = [0.62, 0.52, 0.30] as [number, number, number];
const OFF_BOARD = [0.66, 0.24, 0.18] as [number, number, number];

export interface DropTarget {
  x: number;
  z: number;
  onBoard: boolean;
}

export class DropIndicator {
  private renderer: SceneRenderer;
  private ringMesh: MeshHandle;
  private lineMesh: MeshHandle;

  /** One ghost mesh per food, built lazily — most sessions use a few. */
  private ghosts = new Map<string, MeshHandle>();

  private boardTop: number;
  private dropHeight: number;

  private target: DropTarget | null = null;
  private food: Food | null = null;
  private pulse = 0;

  constructor(renderer: SceneRenderer, boardTop: number, dropHeight: number) {
    this.renderer = renderer;
    this.boardTop = boardTop;
    this.dropHeight = dropHeight;

    // Unit ring, scaled per food at instance time. A hairline band rather than
    // a thick annulus — thickness is what made it read as a UI element sitting
    // on top of the scene.
    this.ringMesh = renderer.addMesh(ring(0.94, 1.0, 56), { overlay: true });

    // A hairline column from board to release height. Built at unit height and
    // scaled, so one mesh serves any drop height.
    this.lineMesh = renderer.addMesh(
      sweptTube(
        [
          [0, 0, 0],
          [0, 0.5, 0],
          [0, 1, 0],
        ],
        () => 0.0022,
        6,
      ),
      { overlay: true },
    );
  }

  /** Null target hides the indicator entirely. */
  set(target: DropTarget | null, foodId: string | null) {
    this.target = target;
    this.food = foodId ? (CATALOG.find((f) => f.id === foodId) ?? null) : null;
    if (!this.food) this.target = null;
  }

  private ghostFor(food: Food): MeshHandle {
    let handle = this.ghosts.get(food.id);
    if (!handle) {
      handle = this.renderer.addMesh(buildFoodMesh(food.mesh, 1), { overlay: true });
      this.ghosts.set(food.id, handle);
    }
    return handle;
  }

  update(dt: number) {
    this.pulse += dt;

    const hidden = !this.target || !this.food;

    // Clearing every ghost each frame costs nothing (they're empty arrays) and
    // avoids a stale preview lingering when the selection changes.
    for (const handle of this.ghosts.values()) {
      this.renderer.setInstances(handle, []);
    }

    if (hidden) {
      this.renderer.setInstances(this.ringMesh, []);
      this.renderer.setInstances(this.lineMesh, []);
      return;
    }

    const { x, z, onBoard } = this.target!;
    const food = this.food!;
    const colour = onBoard ? SAFE : OFF_BOARD;

    // Ring is sized to the item so you can judge whether it will fit the gap
    // you're aiming at, with a floor so tiny items still give a visible target.
    const radius = Math.max(food.radius * 1.6, 0.058);
    // A very slow, shallow breath — just enough to distinguish the ring from
    // scene geometry without drawing the eye.
    const breathe = 1 + Math.sin(this.pulse * 2.2) * 0.018;

    this.renderer.setInstances(this.ringMesh, [
      {
        // Just clear of the board surface — coplanar would z-fight.
        position: [x, this.boardTop + 0.004, z],
        scale: radius * breathe,
        material: { albedo: colour, roughness: 1, alpha: 0.32, rim: 0.22 },
      },
    ]);

    const releaseY = this.boardTop + this.dropHeight;

    this.renderer.setInstances(this.lineMesh, [
      {
        position: [x, this.boardTop, z],
        scale: this.dropHeight,
        material: { albedo: colour, roughness: 1, alpha: 0.07, rim: 0.0 },
      },
    ]);

    this.renderer.setInstances(this.ghostFor(food), [
      {
        position: [x, releaseY, z],
        seed: 1,
        // Mostly rim: the ghost reads as an outline of the item rather than a
        // translucent solid, which stays legible without obscuring the board.
        material: { albedo: colour, roughness: 1, alpha: 0.05, rim: 0.42 },
      },
    ]);
  }

  /**
   * Whether a point is over the board.
   *
   * Uses a slight inset: an item whose centre is exactly on the rim will
   * topple off, so the honest answer at the boundary is "no".
   */
  static isOnBoard(x: number, z: number, halfX: number, halfZ: number): boolean {
    const inset = 0.04;
    return Math.abs(x) < halfX - inset && Math.abs(z) < halfZ - inset;
  }
}
