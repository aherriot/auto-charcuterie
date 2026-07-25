/**
 * The board scene: geometry, materials, and the render loop.
 *
 * Phase 1 populates it with the cutting board plus a few placeholder solids so
 * shadows and shading have something to act on. Phase 2 replaces those with the
 * real food catalogue; the renderer beneath doesn't change.
 */

import { SceneRenderer, type InstanceSpec } from "./scene";
import { roundedBox, sphere, superellipsoid } from "./mesh/primitives";

export const BOARD_HALF = 1.1;
export const BOARD_TOP = 0.06;

export interface BoardStats {
  fps: number;
  instances: number;
}

export class BoardScene {
  private renderer: SceneRenderer;
  private raf = 0;
  private disposed = false;
  private last = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;

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
        material: { albedo: [0.29, 0.17, 0.09], roughness: 0.62, ao: 1 },
      },
    ]);

    // Placeholder produce — stand-ins to prove shadowing and shading. These get
    // replaced wholesale by the catalogue in Phase 2.
    const oliveMesh = r.addMesh(superellipsoid(0.055, 0.072, 0.055, 2.3, 20, 14));
    r.setInstances(oliveMesh, scatter(9, 0.42, (i) => ({
      position: [0, BOARD_TOP + 0.072, 0],
      scale: 0.9 + ((i * 37) % 20) / 100,
      material: { albedo: [0.22, 0.26, 0.09], roughness: 0.34, ao: 0.85 },
    })));

    const berryMesh = r.addMesh(sphere(0.062, 20, 14));
    r.setInstances(berryMesh, scatter(7, 0.62, (i) => ({
      position: [0, BOARD_TOP + 0.062, 0],
      scale: 0.85 + ((i * 53) % 25) / 100,
      material: { albedo: [0.31, 0.11, 0.26], roughness: 0.28, ao: 0.85 },
    }), 1.9));

    const wedgeMesh = r.addMesh(roundedBox(0.16, 0.075, 0.11, 0.03, 3));
    r.setInstances(wedgeMesh, [
      {
        position: [-0.52, BOARD_TOP + 0.075, 0.2],
        rotationY: 0.4,
        material: { albedo: [0.86, 0.72, 0.35], roughness: 0.55, ao: 0.95 },
      },
      {
        position: [0.55, BOARD_TOP + 0.075, -0.22],
        rotationY: -0.7,
        material: { albedo: [0.9, 0.85, 0.72], roughness: 0.6, ao: 0.95 },
      },
    ]);
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.onStats?.({ fps: this.fpsFrames / this.fpsAccum, instances: 19 });
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

/**
 * Lays out `count` items on a golden-angle spiral, which distributes them
 * evenly without the grid artefacts of a random scatter or the obvious ring of
 * a circular one.
 */
function scatter(
  count: number,
  radius: number,
  make: (i: number) => InstanceSpec,
  squash = 1,
): InstanceSpec[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const spec = make(i);
    const t = Math.sqrt((i + 0.5) / count) * radius;
    const a = i * golden;
    return {
      ...spec,
      position: [
        Math.cos(a) * t * squash + spec.position[0],
        spec.position[1],
        Math.sin(a) * t * 0.7 + spec.position[2],
      ],
    };
  });
}
