/**
 * The board scene: geometry, materials, and the render loop.
 *
 * Phase 1 populates it with the cutting board plus a few placeholder solids so
 * shadows and shading have something to act on. Phase 2 replaces those with the
 * real food catalogue; the renderer beneath doesn't change.
 */

import { SceneRenderer } from "./scene";
import { roundedBox } from "./mesh/primitives";
import { buildFoodMesh } from "./mesh/foods";
import { CATALOG, MaterialId, type Food } from "../game/catalog";

export const BOARD_HALF = 1.1;
export const BOARD_TOP = 0.06;

export interface BoardStats {
  fps: number;
  instances: number;
  spend: number;
}

export class BoardScene {
  private renderer: SceneRenderer;
  private raf = 0;
  private disposed = false;
  private last = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private instances = 0;
  private spend = 0;

  onStats?: (stats: BoardStats) => void;

  private constructor(renderer: SceneRenderer) {
    this.renderer = renderer;
  }

  static async create(canvas: HTMLCanvasElement): Promise<BoardScene> {
    const renderer = await SceneRenderer.create(canvas);
    const board = new BoardScene(renderer);
    board.populate();
    board.loop(performance.now());
    return board;
  }

  get camera() {
    return this.renderer.camera;
  }

  private populate() {
    const r = this.renderer;

    // The board. Chamfered so the rim catches the key light rather than reading
    // as a flat slab.
    const boardMesh = r.addMesh(roundedBox(BOARD_HALF, BOARD_TOP, BOARD_HALF * 0.72, 0.05, 5));
    r.setInstances(boardMesh, [
      {
        position: [0, 0, 0],
        material: {
          albedo: [0.31, 0.18, 0.09],
          roughness: 0.62,
          materialId: MaterialId.WOOD,
        },
      },
    ]);

    // A hand-arranged sample board. Phase 3 replaces this with real placement,
    // but it exercises every material and gives the lighting something honest
    // to work on in the meantime.
    const arrangement: Array<[string, number, number, number]> = [
      // id, x, z, count
      ["prosciutto", -0.55, -0.14, 2],
      ["soppressata", -0.16, -0.3, 3],
      ["salami", 0.2, -0.3, 3],
      ["brie", -0.66, 0.22, 1],
      ["gouda", 0.62, -0.12, 1],
      ["blue", 0.66, 0.24, 1],
      ["cheddar", 0.3, 0.34, 2],
      ["grapes", -0.02, 0.26, 7],
      ["figs", -0.34, 0.3, 2],
      ["cornichons", 0.45, -0.36, 3],
      ["olives", 0.06, -0.02, 6],
      ["almonds", -0.42, -0.34, 5],
      ["cashews", 0.52, 0.06, 4],
      ["crackers", -0.85, -0.3, 3],
      ["breadsticks", 0.0, 0.42, 2],
      ["honeycomb", 0.86, 0.36, 1],
    ];

    for (const [id, x, z, count] of arrangement) {
      const food = CATALOG.find((f) => f.id === id);
      if (!food) continue;
      this.spend += food.price;

      for (let k = 0; k < count; k++) {
        const seed = hash(id, k);
        const mesh = buildFoodMesh(food.mesh, seed);
        const handle = r.addMesh(mesh);

        // Cluster members spiral out from the anchor so groups read as piles
        // rather than rows.
        const a = k * 2.399;
        const spread = Math.sqrt(k) * food.radius * 1.35;

        r.setInstances(handle, [
          {
            position: [
              x + Math.cos(a) * spread,
              BOARD_TOP + this.restHeight(food),
              z + Math.sin(a) * spread * 0.8,
            ],
            rotationY: seed * 2.2,
            seed,
            material: {
              albedo: food.color,
              roughness: food.baseRoughness,
              materialId: food.materialId,
              ao: 0.95,
            },
          },
        ]);
        this.instances++;
      }
    }
  }

  /**
   * Height at which a food rests on the board. Meshes are built centred on the
   * origin, so this is half their vertical extent — approximated from radius,
   * which is close enough until Phase 3 has real colliders.
   */
  private restHeight(food: Food): number {
    switch (food.mesh) {
      case "slice":
      case "cracker":
        return 0.008;
      case "salamiRound":
      case "soppressataRound":
        return 0.012;
      case "brieWedge":
      case "blueWedge":
        return 0.05;
      case "goudaBlock":
      case "cheddarCube":
        return 0.076;
      case "honeycomb":
        return 0.026;
      case "almond":
        return 0.018;
      case "olive":
        return 0.034;
      case "cashew":
      case "breadstick":
      case "cornichon":
        return 0.02;
      default:
        return food.radius * 0.92;
    }
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.onStats?.({
        fps: this.fpsFrames / this.fpsAccum,
        instances: this.instances,
        spend: this.spend,
      });
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.renderer.render();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}

/** Stable per-item seed, so the sample board looks the same on every load. */
function hash(id: string, k: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = Math.imul(h ^ k, 2654435761);
  return ((h >>> 0) % 10000) / 1000;
}
