/**
 * Catalogue inspection scene.
 *
 * Lays every food out on a grid at gameplay camera distance, which is the only
 * honest way to judge whether an item is recognisable — a food that reads
 * beautifully at 20cm may be an indistinct blob at play distance.
 *
 * Each item is shown several times with different seeds so per-instance
 * variation is visible: if all four olives look identical, the seeding is doing
 * nothing.
 */

import { SceneRenderer, type InstanceSpec } from "./scene";
import { buildFoodMesh } from "./mesh/foods";
import { roundedBox } from "./mesh/primitives";
import { CATALOG, MaterialId, type Food } from "../game/catalog";

/** Spacing between grid cells, in world units. */
const CELL = 0.44;
const COLUMNS = 4;

export interface CatalogStats {
  fps: number;
  items: number;
  triangles: number;
}

export class CatalogScene {
  private renderer: SceneRenderer;
  private raf = 0;
  private disposed = false;
  private last = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private triangles = 0;

  private spin = true;
  private angle = 0;

  onStats?: (stats: CatalogStats) => void;

  private constructor(renderer: SceneRenderer) {
    this.renderer = renderer;
  }

  static async create(canvas: HTMLCanvasElement): Promise<CatalogScene> {
    const renderer = await SceneRenderer.create(canvas);
    const scene = new CatalogScene(renderer);
    scene.populate();
    scene.loop(performance.now());
    return scene;
  }

  get camera() {
    return this.renderer.camera;
  }

  setSpin(on: boolean) {
    this.spin = on;
  }

  private layout(index: number): [number, number] {
    const col = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const rows = Math.ceil(CATALOG.length / COLUMNS);
    return [(col - (COLUMNS - 1) / 2) * CELL, (row - (rows - 1) / 2) * CELL];
  }

  private populate() {
    const r = this.renderer;

    // A dark plinth so items aren't floating in void and shadows have a
    // receiver — shadow behaviour is part of what's being reviewed.
    const rows = Math.ceil(CATALOG.length / COLUMNS);
    const plinth = r.addMesh(
      roundedBox((COLUMNS * CELL) / 2 + 0.1, 0.04, (rows * CELL) / 2 + 0.1, 0.03, 4),
    );
    r.setInstances(plinth, [
      {
        position: [0, -0.04, 0],
        material: {
          albedo: [0.3, 0.18, 0.1],
          roughness: 0.68,
          materialId: MaterialId.WOOD,
        },
      },
    ]);

    CATALOG.forEach((food, i) => {
      const [x, z] = this.layout(i);

      // Four seeds per food, clustered — enough to show variation without
      // crowding neighbouring cells.
      const specs: InstanceSpec[] = [];
      const cluster = [
        [0, 0],
        [-0.075, -0.06],
        [0.08, -0.05],
        [0.01, 0.085],
      ];

      cluster.forEach(([dx, dz], k) => {
        specs.push({
          position: [x + dx, 0.02 + food.radius * 0.5, z + dz],
          rotationY: k * 1.3,
          seed: i * 7.13 + k * 3.77,
          material: {
            albedo: food.color,
            roughness: food.baseRoughness,
            materialId: food.materialId,
            ao: 0.95,
          },
        });
      });

      // One mesh per (food, seed) — outlines are baked in, so seeded variation
      // has to happen at generation time rather than per instance.
      cluster.forEach((_, k) => {
        const mesh = buildFoodMesh(food.mesh, i * 7.13 + k * 3.77);
        this.triangles += mesh.indices.length / 3;
        const handle = r.addMesh(mesh);
        r.setInstances(handle, [specs[k]]);
      });
    });
  }

  /** Grid position of a food, so the UI can label it in screen space. */
  labelPositions(): Array<{ food: Food; world: [number, number, number] }> {
    return CATALOG.map((food, i) => {
      const [x, z] = this.layout(i);
      return { food, world: [x, 0.02, z + CELL * 0.32] as [number, number, number] };
    });
  }

  project(world: [number, number, number]): [number, number] | null {
    return this.renderer.project(world);
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;

    if (this.spin) {
      this.angle += dt * 0.22;
      this.renderer.camera.azimuth = this.angle;
    }

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.onStats?.({
        fps: this.fpsFrames / this.fpsAccum,
        items: CATALOG.length,
        triangles: this.triangles,
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
