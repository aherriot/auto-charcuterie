/**
 * XPBD cloth solver — host side.
 *
 * Owns the GPU buffers, the ping-pong bind groups, and the per-frame dispatch
 * schedule. Positions never leave the GPU: the render pass binds the same
 * storage buffer this solver writes.
 */

import {
  BUILD_GRID_WGSL,
  CLEAR_GRID_WGSL,
  HASH_TABLE_SIZE,
  INTEGRATE_WGSL,
  MAX_PER_CELL,
  NORMALS_WGSL,
  PARAMS_BYTES,
  SLICE_TICK_WGSL,
  SOLVE_WGSL,
  WORKGROUP_SIZE,
} from "./shaders";

/**
 * Fixed cap on slice-state entries, so changing slice count never resizes the
 * buffer. Doubles as the stride between the energy and sleep halves.
 */
export const MAX_SLICES = 64;

export interface ClothParams {
  /** Particles per side of one slice. Total per slice is grid². */
  grid: number;
  slices: number;
  /** Physics substeps per frame. */
  substeps: number;
  /** Jacobi constraint iterations per substep. Rounded up to even. */
  iterations: number;
  spacing: number;
  gravity: number;
  damping: number;
  kStruct: number;
  kShear: number;
  /** The floppiness dial. Low values let edges curl and fold. */
  kBend: number;
  friction: number;
  relax: number;
  thickness: number;
  boardY: number;
  boardHalf: number;
  windAmp: number;
  /** Minimum separation between particles of *different* slices. */
  sliceSep: number;
  /** How hard slice-vs-slice contacts push apart. 0 disables the spatial hash. */
  selfStiff: number;
  /** Board slab depth. The board is a box, not a half-space. */
  boardThick: number;
  /** Quiet frames before a slice freezes. 0 disables sleeping entirely. */
  sleepFrames: number;
  /** Max per-particle v² below which a slice counts as quiet. */
  sleepEnergy: number;
  /** Per-substep displacement clamp. Anti-explosion guard. */
  maxStep: number;
  /** Where slices spawn, in board coordinates. Presets move this to test overhang. */
  spawnX: number;
  spawnZ: number;
}

/**
 * Validated against the Phase 0 exit criteria on 2026-07-24.
 *
 * The shape of the winning configuration is worth understanding: a *coarse*
 * grid solved very hard beats a fine grid solved lightly. Edge-based collision
 * decoupled fidelity from resolution, so once obstacles could no longer slip
 * between particles there was nothing left for the extra particles to buy —
 * and spending that budget on substeps and iterations instead is what makes
 * the drape hold its shape rather than stretch.
 */
export const DEFAULT_PARAMS: ClothParams = {
  grid: 8,
  slices: 1,
  substeps: 20,
  iterations: 16,
  spacing: 0.062,
  gravity: 9.81,
  damping: 0.985,
  kStruct: 1.0,
  kShear: 0.85,
  // Charcuterie slices hold a fold rather than pooling like silk. Raised from
  // the original 0.08, which read as far too limp.
  kBend: 0.35,
  friction: 0.55,
  relax: 1.4,
  // Doubles as visual thickness: slices render as zero-thickness surfaces, so
  // the collision offset is what stops them looking like paper.
  thickness: 0.014,
  boardY: 0,
  boardHalf: 1.1,
  windAmp: 0.0,
  sliceSep: 0.03,
  selfStiff: 0.8,
  boardThick: 0.09,
  sleepFrames: 45,
  sleepEnergy: 2e-8,
  maxStep: 0.02,
  spawnX: 0,
  spawnZ: 0,
};

/** Sphere obstacles the cloth collides against: xyz centre, w radius. */
export type Obstacle = readonly [number, number, number, number];

const MAX_OBSTACLES = 64;

export class ClothSolver {
  private device: GPUDevice;
  private params: ClothParams;

  private posA!: GPUBuffer;
  private posB!: GPUBuffer;
  private prev!: GPUBuffer;
  private nrm!: GPUBuffer;
  private obst!: GPUBuffer;
  private uniform!: GPUBuffer;
  private indexBuffer!: GPUBuffer;
  private hashGrid!: GPUBuffer;
  private sliceState!: GPUBuffer;

  private integratePipeline!: GPUComputePipeline;
  private solvePipeline!: GPUComputePipeline;
  /** Same kernel with the self-collision scan compiled in. */
  private solveSelfPipeline!: GPUComputePipeline;
  private normalsPipeline!: GPUComputePipeline;
  private clearGridPipeline!: GPUComputePipeline;
  private buildGridPipeline!: GPUComputePipeline;
  private sliceTickPipeline!: GPUComputePipeline;

  private layout!: GPUBindGroupLayout;
  /** posOut = posA — the buffer the renderer reads. */
  private bgA!: GPUBindGroup;
  /** posOut = posB — the scratch half of the ping-pong. */
  private bgB!: GPUBindGroup;

  private paramData = new Float32Array(PARAMS_BYTES / 4);
  private paramView = new Uint32Array(this.paramData.buffer);

  private time = 0;

  particleCount = 0;
  indexCount = 0;

  constructor(device: GPUDevice, params: ClothParams = DEFAULT_PARAMS) {
    this.device = device;
    this.params = { ...params };
    this.buildPipelines();
    this.allocate();
  }

  get positionBuffer(): GPUBuffer {
    return this.posA;
  }
  get normalBuffer(): GPUBuffer {
    return this.nrm;
  }
  /**
   * Per-slice state, so the render pass can tint sleeping slices. Quiet-frame
   * counters live in the second half, starting at index `MAX_SLICES`.
   */
  get sleepBuffer(): GPUBuffer {
    return this.sliceState;
  }
  get indices(): GPUBuffer {
    return this.indexBuffer;
  }
  get current(): Readonly<ClothParams> {
    return this.params;
  }

  private buildPipelines() {
    const d = this.device;

    this.layout = d.createBindGroupLayout({
      label: "cloth-bgl",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });

    const pipelineLayout = d.createPipelineLayout({
      bindGroupLayouts: [this.layout],
    });

    const make = (
      label: string,
      code: string,
      constants?: Record<string, number>,
    ) =>
      d.createComputePipeline({
        label,
        layout: pipelineLayout,
        compute: {
          module: d.createShaderModule({ label, code }),
          entryPoint: "main",
          constants,
        },
      });

    this.integratePipeline = make("cloth-integrate", INTEGRATE_WGSL);
    this.solvePipeline = make("cloth-solve", SOLVE_WGSL, { enableSelf: 0 });
    this.solveSelfPipeline = make("cloth-solve-self", SOLVE_WGSL, { enableSelf: 1 });
    this.normalsPipeline = make("cloth-normals", NORMALS_WGSL);
    this.clearGridPipeline = make("cloth-clear-grid", CLEAR_GRID_WGSL);
    this.buildGridPipeline = make("cloth-build-grid", BUILD_GRID_WGSL);
    this.sliceTickPipeline = make("cloth-slice-tick", SLICE_TICK_WGSL);
  }

  /**
   * (Re)allocates every size-dependent buffer. Called on construction and
   * whenever grid resolution or slice count changes.
   */
  private allocate() {
    const d = this.device;
    const { grid, slices } = this.params;
    const perSlice = grid * grid;
    this.particleCount = perSlice * slices;

    this.destroyBuffers();

    const bytes = this.particleCount * 16; // vec4f
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

    this.posA = d.createBuffer({ label: "cloth-posA", size: bytes, usage: storage });
    this.posB = d.createBuffer({ label: "cloth-posB", size: bytes, usage: storage });
    this.prev = d.createBuffer({ label: "cloth-prev", size: bytes, usage: storage });
    this.nrm = d.createBuffer({ label: "cloth-nrm", size: bytes, usage: storage });

    this.obst = d.createBuffer({
      label: "cloth-obstacles",
      size: MAX_OBSTACLES * 16,
      usage: storage,
    });

    this.uniform = d.createBuffer({
      label: "cloth-params",
      size: PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Spatial hash for slice-vs-slice contacts: bucket counts followed by
    // bucket contents in one allocation. Fixed size — independent of particle
    // count, so changing resolution never reallocates it.
    this.hashGrid = d.createBuffer({
      label: "cloth-hash-grid",
      size: HASH_TABLE_SIZE * (1 + MAX_PER_CELL) * 4,
      usage: storage,
    });

    // Per-slice peak energy followed by quiet-frame counters. Also read by the
    // render pass, to tint slices that have gone to sleep.
    this.sliceState = d.createBuffer({
      label: "cloth-slice-state",
      size: MAX_SLICES * 2 * 4,
      usage: storage,
    });

    const entries = (posIn: GPUBuffer, posOut: GPUBuffer): GPUBindGroupEntry[] => [
      { binding: 0, resource: { buffer: this.uniform } },
      { binding: 1, resource: { buffer: posIn } },
      { binding: 2, resource: { buffer: posOut } },
      { binding: 3, resource: { buffer: this.prev } },
      { binding: 4, resource: { buffer: this.obst } },
      { binding: 5, resource: { buffer: this.nrm } },
      { binding: 6, resource: { buffer: this.hashGrid } },
      { binding: 7, resource: { buffer: this.sliceState } },
    ];

    this.bgA = d.createBindGroup({ layout: this.layout, entries: entries(this.posB, this.posA) });
    this.bgB = d.createBindGroup({ layout: this.layout, entries: entries(this.posA, this.posB) });

    this.buildIndices();
    this.uploadObstacles();
    this.reset();
  }

  /** Triangle indices for every slice's grid, in one buffer. */
  private buildIndices() {
    const { grid, slices } = this.params;
    const quads = (grid - 1) * (grid - 1);
    this.indexCount = quads * 6 * slices;

    const data = new Uint32Array(this.indexCount);
    let n = 0;
    for (let s = 0; s < slices; s++) {
      const base = s * grid * grid;
      for (let r = 0; r < grid - 1; r++) {
        for (let c = 0; c < grid - 1; c++) {
          const i0 = base + r * grid + c;
          const i1 = i0 + 1;
          const i2 = i0 + grid;
          const i3 = i2 + 1;
          data[n++] = i0; data[n++] = i2; data[n++] = i1;
          data[n++] = i1; data[n++] = i2; data[n++] = i3;
        }
      }
    }

    this.indexBuffer = this.device.createBuffer({
      label: "cloth-indices",
      size: data.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.indexBuffer, 0, data);
  }

  /**
   * Drops every slice back to its start pose: flat, above the board, each one
   * offset and rotated a little so a stack of them doesn't look mechanical.
   */
  reset() {
    const { grid, slices, spacing, spawnX, spawnZ } = this.params;
    const perSlice = grid * grid;
    const data = new Float32Array(this.particleCount * 4);
    const half = ((grid - 1) * spacing) / 2;

    for (let s = 0; s < slices; s++) {
      // Deterministic per-slice jitter — reproducible between runs.
      const seed = s * 12.9898;
      const rot = Math.sin(seed) * 0.9;
      const ox = spawnX + Math.sin(seed * 1.7) * 0.22;
      const oz = spawnZ + Math.cos(seed * 2.3) * 0.22;
      const oy = 0.75 + s * 0.16;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
          const i = (s * perSlice + r * grid + c) * 4;
          const lx = c * spacing - half;
          const lz = r * spacing - half;
          data[i + 0] = lx * cos - lz * sin + ox;
          data[i + 1] = oy;
          data[i + 2] = lx * sin + lz * cos + oz;
          data[i + 3] = 1; // inverse mass — nothing pinned
        }
      }
    }

    this.device.queue.writeBuffer(this.posA, 0, data);
    this.device.queue.writeBuffer(this.posB, 0, data);
    this.device.queue.writeBuffer(this.prev, 0, data);

    // Everything wakes up on a re-drop, or a second drop lands on frozen slices.
    this.device.queue.writeBuffer(this.sliceState, 0, new Uint32Array(MAX_SLICES * 2));

    this.time = 0;
  }

  setObstacles(obstacles: readonly Obstacle[]) {
    // Retained so `allocate()` can restore them: reshaping destroys and
    // recreates every buffer, including this one, and a zeroed obstacle buffer
    // with a non-zero count means the cloth silently collides with nothing.
    this.obstacleList = obstacles.slice(0, MAX_OBSTACLES);
    this.uploadObstacles();
  }

  private uploadObstacles() {
    const data = new Float32Array(MAX_OBSTACLES * 4);
    this.obstacleList.forEach(([x, y, z, r], i) => data.set([x, y, z, r], i * 4));
    this.obstacleCount = this.obstacleList.length;
    this.device.queue.writeBuffer(this.obst, 0, data);
  }

  private obstacleList: Obstacle[] = [];
  private obstacleCount = 0;

  /**
   * Applies new tunables. Reallocates only when the buffer shape actually
   * changed, so dragging a stiffness slider doesn't reset the simulation.
   */
  setParams(next: Partial<ClothParams>) {
    const reshape =
      (next.grid !== undefined && next.grid !== this.params.grid) ||
      (next.slices !== undefined && next.slices !== this.params.slices);

    this.params = { ...this.params, ...next };
    if (reshape) this.allocate();
  }

  private writeParams(dt: number) {
    const p = this.params;
    const f = this.paramData;
    const u = this.paramView;

    u[0] = p.grid;
    u[1] = this.particleCount;
    u[2] = this.obstacleCount;
    u[3] = p.slices;
    u[4] = HASH_TABLE_SIZE;
    u[5] = MAX_PER_CELL;
    u[6] = p.sleepFrames;
    u[7] = MAX_SLICES;

    f[8] = dt;
    f[9] = p.spacing;
    f[10] = p.gravity;
    f[11] = p.damping;
    f[12] = p.kStruct;
    f[13] = p.kShear;
    f[14] = p.kBend;
    f[15] = p.friction;
    f[16] = p.boardY;
    f[17] = p.boardHalf;
    f[18] = p.thickness;
    f[19] = p.relax;
    f[20] = p.windAmp;
    f[21] = this.time;
    f[22] = p.sliceSep;
    // Cell size must be >= the largest query radius or the 3×3×3 neighbourhood
    // scan misses contacts.
    f[23] = Math.max(p.sliceSep, p.spacing * 0.5);
    f[24] = p.selfStiff;
    f[25] = p.boardThick;
    f[26] = p.sleepEnergy;
    f[27] = p.maxStep;

    this.device.queue.writeBuffer(this.uniform, 0, this.paramData);
  }

  /**
   * One frame of simulation.
   *
   * Iterations are forced even so the final result lands in `posA`, which is
   * what the render pass is bound to — this keeps the render bind group static.
   */
  step(encoder: GPUCommandEncoder, frameDt: number) {
    const p = this.params;
    // Clamp: a stalled tab shouldn't resume by exploding the sim.
    const dt = Math.min(frameDt, 1 / 30) / p.substeps;
    this.time += frameDt;
    this.writeParams(dt);

    const groups = Math.ceil(this.particleCount / WORKGROUP_SIZE);
    const gridGroups = Math.ceil(HASH_TABLE_SIZE / WORKGROUP_SIZE);
    const iterations = Math.max(2, p.iterations + (p.iterations % 2));
    // Enabled even for a single slice: a slice folded over the board rim can
    // land on itself, and the same-slice skip in the kernel keeps the weave
    // from fighting its own repulsion.
    const selfCollide = p.selfStiff > 0;

    const pass = encoder.beginComputePass({ label: "cloth" });

    for (let s = 0; s < p.substeps; s++) {
      pass.setPipeline(this.integratePipeline);
      pass.setBindGroup(0, this.bgA);
      pass.dispatchWorkgroups(groups);

      // Rebuild the hash every substep rather than once per frame. A stale
      // grid is exactly what lets fast-moving slices slip through each other,
      // which is the failure this exists to prevent.
      if (selfCollide) {
        pass.setPipeline(this.clearGridPipeline);
        pass.setBindGroup(0, this.bgA);
        pass.dispatchWorkgroups(gridGroups);

        pass.setPipeline(this.buildGridPipeline);
        pass.setBindGroup(0, this.bgA);
        pass.dispatchWorkgroups(groups);
      }

      for (let i = 0; i < iterations; i++) {
        // Self-collision only on the first iteration — the expensive variant
        // establishes separation and the cheap iterations preserve it.
        pass.setPipeline(
          selfCollide && i === 0 ? this.solveSelfPipeline : this.solvePipeline,
        );
        // Start on bgB (reads posA, writes posB); even count returns to posA.
        pass.setBindGroup(0, i % 2 === 0 ? this.bgB : this.bgA);
        pass.dispatchWorkgroups(groups);
      }
    }

    // Sleep bookkeeping runs once per frame, after every substep has had a
    // chance to contribute to the peak-velocity reduction.
    pass.setPipeline(this.sliceTickPipeline);
    pass.setBindGroup(0, this.bgA);
    pass.dispatchWorkgroups(Math.ceil(p.slices / WORKGROUP_SIZE));

    pass.setPipeline(this.normalsPipeline);
    pass.setBindGroup(0, this.bgA);
    pass.dispatchWorkgroups(groups);

    pass.end();
  }

  private destroyBuffers() {
    this.posA?.destroy();
    this.posB?.destroy();
    this.prev?.destroy();
    this.nrm?.destroy();
    this.obst?.destroy();
    this.uniform?.destroy();
    this.indexBuffer?.destroy();
    this.hashGrid?.destroy();
    this.sliceState?.destroy();
  }

  destroy() {
    this.destroyBuffers();
  }
}
