/**
 * Phase 0 spike scene.
 *
 * Renders the cloth directly from the solver's storage buffer — the vertex
 * stage indexes `pos[]` and `nrm[]` with no readback and no vertex buffer at
 * all. That path is the thing being validated here; if it works, Phase 4 reuses
 * it verbatim.
 *
 * Everything in `engine/spike/` is deleted once Phase 0 is signed off.
 */

import { GPUContext, SAMPLE_COUNT } from "../gpu/device";
import { OrbitCamera } from "../camera";
import {
  ClothSolver,
  DEFAULT_PARAMS,
  MAX_SLICES,
  type ClothParams,
  type Obstacle,
} from "../cloth/solver";
import { box, uvSphere, type MeshData } from "./meshes";

const CAMERA_BYTES = 112; // mat4 viewProj + vec4 camPos + vec4 lightDir + vec4 misc

const SHARED = /* wgsl */ `
struct Camera {
  viewProj : mat4x4f,
  camPos   : vec4f,
  lightDir : vec4f,
  // x: particles per slice  y: sleepFrames  z: sleep-tint toggle  w: sleep-half offset
  misc     : vec4f,
};
@group(0) @binding(0) var<uniform> C : Camera;

// Warm key light plus a cool sky/ground ambient. Stand-in for the real PBR
// model in Phase 1 — enough to read silhouette, folds and contact shadowing.
fn shade(n : vec3f, world : vec3f, albedo : vec3f, rough : f32) -> vec3f {
  let L = normalize(C.lightDir.xyz);
  let V = normalize(C.camPos.xyz - world);
  let H = normalize(L + V);

  let ndl = max(dot(n, L), 0.0);
  let sky = mix(vec3f(0.20, 0.22, 0.28), vec3f(0.32, 0.28, 0.24), n.y * 0.5 + 0.5);

  let spec = pow(max(dot(n, H), 0.0), mix(96.0, 6.0, rough)) * (1.0 - rough);

  let direct = albedo * ndl * vec3f(1.25, 1.14, 0.98);
  return direct + albedo * sky + vec3f(spec) * 0.35;
}

fn tonemap(c : vec3f) -> vec3f {
  let x = max(c - 0.004, vec3f(0.0));
  return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
}
`;

const CLOTH_WGSL = /* wgsl */ `
${SHARED}

@group(1) @binding(0) var<storage, read> pos   : array<vec4f>;
@group(1) @binding(1) var<storage, read> nrm   : array<vec4f>;
// Packed per-slice state; quiet-frame counters start at misc.w.
@group(1) @binding(2) var<storage, read> sliceState : array<u32>;

struct VSOut {
  @builtin(position) clip     : vec4f,
  @location(0)       world    : vec3f,
  @location(1)       normal   : vec3f,
  @location(2)       sleeping : f32,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  let p = pos[vi].xyz;

  let perSlice = max(u32(C.misc.x), 1u);
  let frames   = u32(C.misc.y);
  let sliceId  = vi / perSlice;
  let isAsleep = frames > 0u && sliceState[u32(C.misc.w) + sliceId] >= frames;

  var o : VSOut;
  o.clip     = C.viewProj * vec4f(p, 1.0);
  o.world    = p;
  o.normal   = nrm[vi].xyz;
  o.sleeping = select(0.0, 1.0, isAsleep);
  return o;
}

@fragment
fn fs(in : VSOut, @builtin(front_facing) front : bool) -> @location(0) vec4f {
  // Slices are rendered double-sided; flip the normal on backfaces so the
  // underside of a fold isn't pitch black.
  var n = normalize(in.normal);
  if (!front) { n = -n; }

  // Placeholder prosciutto: fat marbling as a cheap band pattern so folds and
  // curvature are legible. Real fBm marbling arrives in Phase 2.
  let lean = vec3f(0.72, 0.24, 0.26);
  let fat  = vec3f(0.94, 0.88, 0.83);
  let band = smoothstep(0.35, 0.65, fract(in.world.x * 7.0 + in.world.z * 4.0) );
  var albedo = mix(lean, fat, band * 0.45);

  // Debug tint: settled slices read cool so it's obvious when sleep engages.
  if (C.misc.z > 0.5 && in.sleeping > 0.5) {
    albedo = mix(albedo, vec3f(0.25, 0.45, 0.72), 0.6);
  }

  return vec4f(tonemap(shade(n, in.world, albedo, 0.55)), 1.0);
}
`;

const SOLID_WGSL = /* wgsl */ `
${SHARED}

struct Instance {
  posScale : vec4f,   // xyz translation, w uniform scale
  color    : vec4f,   // rgb albedo, a roughness
};
@group(1) @binding(0) var<storage, read> insts : array<Instance>;

struct VSOut {
  @builtin(position) clip   : vec4f,
  @location(0)       world  : vec3f,
  @location(1)       normal : vec3f,
  @location(2)       color  : vec4f,
};

@vertex
fn vs(
  @builtin(instance_index) ii : u32,
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
) -> VSOut {
  let inst = insts[ii];
  let world = position * inst.posScale.w + inst.posScale.xyz;

  var o : VSOut;
  o.clip   = C.viewProj * vec4f(world, 1.0);
  o.world  = world;
  o.normal = normal;
  o.color  = inst.color;
  return o;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  let n = normalize(in.normal);
  return vec4f(tonemap(shade(n, in.world, in.color.rgb, in.color.a)), 1.0);
}
`;

export interface SceneStats {
  fps: number;
  particles: number;
  slices: number;
}

export class ClothScene {
  private ctx!: GPUContext;
  private solver!: ClothSolver;
  private camera = new OrbitCamera({
    target: [0, 0.12, 0],
    minElevation: -0.15,
  });

  private clothPipeline!: GPURenderPipeline;
  private solidPipeline!: GPURenderPipeline;

  private cameraBuffer!: GPUBuffer;
  private cameraBG!: GPUBindGroup;
  private clothBG!: GPUBindGroup;
  private solidBG!: GPUBindGroup;

  private sphere!: { vb: GPUBuffer; ib: GPUBuffer; count: number };
  private boardMesh!: { vb: GPUBuffer; ib: GPUBuffer; count: number };
  private instanceBuffer!: GPUBuffer;

  private obstacles: Obstacle[] = [];
  private raf = 0;
  private lastTime = 0;
  private disposed = false;

  private fpsAccum = 0;
  private fpsFrames = 0;
  private cameraData = new Float32Array(CAMERA_BYTES / 4);

  /** Tints frozen slices blue, so it's visible when sleep engages. */
  showSleep = false;

  onStats?: (stats: SceneStats) => void;

  static async create(
    canvas: HTMLCanvasElement,
    params: ClothParams = DEFAULT_PARAMS,
  ): Promise<ClothScene> {
    const scene = new ClothScene();
    await scene.init(canvas, params);
    return scene;
  }

  private async init(canvas: HTMLCanvasElement, params: ClothParams) {
    this.ctx = await GPUContext.create(canvas);
    const d = this.ctx.device;

    this.solver = new ClothSolver(d, params);

    this.cameraBuffer = d.createBuffer({
      label: "camera",
      size: CAMERA_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const cameraLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const clothLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });

    const solidLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });

    this.cameraBG = d.createBindGroup({
      layout: cameraLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
    });

    const depthStencil: GPUDepthStencilState = {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    };

    const clothModule = d.createShaderModule({ label: "cloth-render", code: CLOTH_WGSL });
    this.clothPipeline = d.createRenderPipeline({
      label: "cloth-render",
      layout: d.createPipelineLayout({ bindGroupLayouts: [cameraLayout, clothLayout] }),
      vertex: { module: clothModule, entryPoint: "vs" },
      fragment: {
        module: clothModule,
        entryPoint: "fs",
        targets: [{ format: this.ctx.format }],
      },
      // Slices are infinitely thin — both faces must draw.
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil,
      multisample: { count: SAMPLE_COUNT },
    });

    const solidModule = d.createShaderModule({ label: "solid-render", code: SOLID_WGSL });
    this.solidPipeline = d.createRenderPipeline({
      label: "solid-render",
      layout: d.createPipelineLayout({ bindGroupLayouts: [cameraLayout, solidLayout] }),
      vertex: {
        module: solidModule,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
            ],
          },
        ],
      },
      fragment: {
        module: solidModule,
        entryPoint: "fs",
        targets: [{ format: this.ctx.format }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil,
      multisample: { count: SAMPLE_COUNT },
    });

    this.sphere = this.upload(uvSphere(20, 14));
    this.boardMesh = this.upload(box(params.boardHalf, 0.045, params.boardHalf));

    // One instance per obstacle plus the board itself.
    this.instanceBuffer = d.createBuffer({
      label: "instances",
      size: 128 * 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.solidBG = d.createBindGroup({
      layout: solidLayout,
      entries: [{ binding: 0, resource: { buffer: this.instanceBuffer } }],
    });

    this.rebuildClothBindGroup(clothLayout);
    this.clothLayoutRef = clothLayout;

    this.camera.attach(canvas);
    this.writeInstances();
    this.loop(performance.now());
  }

  private clothLayoutRef!: GPUBindGroupLayout;

  private rebuildClothBindGroup(layout: GPUBindGroupLayout) {
    this.clothBG = this.ctx.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.solver.positionBuffer } },
        { binding: 1, resource: { buffer: this.solver.normalBuffer } },
        { binding: 2, resource: { buffer: this.solver.sleepBuffer } },
      ],
    });
  }

  private upload(mesh: MeshData) {
    const d = this.ctx.device;
    const vb = d.createBuffer({
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const ib = d.createBuffer({
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    d.queue.writeBuffer(vb, 0, mesh.vertices);
    d.queue.writeBuffer(ib, 0, mesh.indices);
    return { vb, ib, count: mesh.indices.length };
  }

  setObstacles(obstacles: Obstacle[]) {
    this.obstacles = obstacles;
    this.solver.setObstacles(obstacles);
    this.writeInstances();
  }

  setParams(next: Partial<ClothParams>) {
    const before = this.solver.current;
    const reshape =
      (next.grid !== undefined && next.grid !== before.grid) ||
      (next.slices !== undefined && next.slices !== before.slices);

    this.solver.setParams(next);
    // Reallocation produces new buffers, so the render bind group is stale.
    if (reshape) this.rebuildClothBindGroup(this.clothLayoutRef);
  }

  reset() {
    this.solver.reset();
  }

  private writeInstances() {
    const data = new Float32Array(128 * 8);
    let n = 0;

    // Board first — it uses its own mesh, but shares the instance buffer.
    data.set([0, -0.045, 0, 1, 0.42, 0.28, 0.17, 0.62], n * 8);
    n++;

    for (const [x, y, z, r] of this.obstacles) {
      data.set([x, y, z, r, 0.35, 0.44, 0.16, 0.35], n * 8);
      n++;
      if (n >= 128) break;
    }

    this.ctx.device.queue.writeBuffer(this.instanceBuffer, 0, data);
  }

  private updateCamera() {
    const eye = this.camera.eye();
    const viewProj = this.camera.viewProj(this.ctx.aspect);

    const p = this.solver.current;
    this.cameraData.set(viewProj as Float32Array, 0);
    this.cameraData.set([eye[0], eye[1], eye[2], 0], 16);
    this.cameraData.set([0.45, 0.82, 0.35, 0], 20);
    this.cameraData.set(
      [p.grid * p.grid, p.sleepFrames, this.showSleep ? 1 : 0, MAX_SLICES],
      24,
    );

    this.ctx.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraData);
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = this.lastTime ? (now - this.lastTime) / 1000 : 1 / 60;
    this.lastTime = now;

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.onStats?.({
        fps: this.fpsFrames / this.fpsAccum,
        particles: this.solver.particleCount,
        slices: this.solver.current.slices,
      });
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.ctx.resize();
    this.updateCamera();

    const encoder = this.ctx.device.createCommandEncoder();

    this.solver.step(encoder, dt);

    const pass = encoder.beginRenderPass({
      colorAttachments: [this.ctx.colorAttachment({ r: 0.055, g: 0.05, b: 0.06, a: 1 })],
      depthStencilAttachment: this.ctx.depthAttachment(),
    });

    pass.setBindGroup(0, this.cameraBG);

    // Board — instance 0.
    pass.setPipeline(this.solidPipeline);
    pass.setBindGroup(1, this.solidBG);
    pass.setVertexBuffer(0, this.boardMesh.vb);
    pass.setIndexBuffer(this.boardMesh.ib, "uint32");
    pass.drawIndexed(this.boardMesh.count, 1, 0, 0, 0);

    // Obstacles — instances 1..n.
    if (this.obstacles.length > 0) {
      pass.setVertexBuffer(0, this.sphere.vb);
      pass.setIndexBuffer(this.sphere.ib, "uint32");
      pass.drawIndexed(this.sphere.count, this.obstacles.length, 0, 0, 1);
    }

    // Cloth — no vertex buffer; the vertex stage reads the solver's storage.
    pass.setPipeline(this.clothPipeline);
    pass.setBindGroup(1, this.clothBG);
    pass.setIndexBuffer(this.solver.indices, "uint32");
    pass.drawIndexed(this.solver.indexCount, 1, 0, 0, 0);

    pass.end();
    this.ctx.device.queue.submit([encoder.finish()]);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.camera.dispose();
    this.solver.destroy();
    this.ctx.destroy();
  }
}
