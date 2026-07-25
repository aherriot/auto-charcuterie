/**
 * Scene renderer — the render graph, mesh registry, and instance management.
 *
 * Three passes per frame:
 *   1. shadow   depth-only from the light, into a 2048² depth map
 *   2. forward  PBR into an MSAA HDR target, resolved offscreen
 *   3. tonemap  fullscreen triangle, HDR → ACES → vignette → swapchain
 *
 * Instances for every mesh live in one storage buffer. Draws are batched by
 * mesh with a `firstInstance` offset, so the whole board is a handful of
 * `drawIndexed` calls regardless of how many olives are on it.
 */

import { mat4, vec3 } from "wgpu-matrix";
import { GPUContext, SAMPLE_COUNT } from "./gpu/device";
import { OrbitCamera } from "./camera";
import type { MeshData } from "./mesh/primitives";
import { FRAME_BYTES, INSTANCE_BYTES, SCENE_WGSL, SHADOW_WGSL } from "./shaders/scene";
import { TONEMAP_WGSL } from "./shaders/tonemap";

const SHADOW_SIZE = 2048;
/** Half-width of the light's orthographic frustum, in world units. */
const SHADOW_EXTENT = 1.7;
/**
 * Normal-offset distance, expressed in shadow-map texels converted to world
 * units. Roughly one texel is enough to clear the depth quantisation that
 * causes acne, without a visible gap at the contact point.
 */
const SHADOW_NORMAL_OFFSET_TEXELS = 1.4;
const MAX_INSTANCES = 1024;
const POST_BYTES = 16;

export interface Material {
  /** Linear RGB. Values here are pre-tonemap, so they can be gentle. */
  albedo: [number, number, number];
  roughness: number;
  metallic?: number;
  /** Baked ambient occlusion multiplier. */
  ao?: number;
}

export interface InstanceSpec {
  position: [number, number, number];
  scale?: number;
  /** Rotation about Y, radians. Enough for placement; full quats can come later. */
  rotationY?: number;
  material: Material;
}

export interface MeshHandle {
  readonly id: number;
}

interface MeshRecord {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  instances: InstanceSpec[];
}

export interface LightSettings {
  /** Direction the light travels *from*, i.e. pointing toward the light. */
  direction: [number, number, number];
  color: [number, number, number];
  intensity: number;
  ambientSky: [number, number, number];
  ambientGround: [number, number, number];
}

export const DEFAULT_LIGHT: LightSettings = {
  direction: [0.55, 0.78, 0.32],
  color: [1.0, 0.95, 0.86],
  intensity: 3.4,
  ambientSky: [0.16, 0.18, 0.24],
  ambientGround: [0.14, 0.1, 0.07],
};

export class SceneRenderer {
  readonly ctx: GPUContext;
  readonly camera: OrbitCamera;

  light: LightSettings = { ...DEFAULT_LIGHT };
  exposure = 1.0;
  vignette = 0.45;
  saturation = 1.12;

  private meshes: MeshRecord[] = [];

  private scenePipeline!: GPURenderPipeline;
  private shadowPipeline!: GPURenderPipeline;
  private tonemapPipeline!: GPURenderPipeline;

  private frameBuffer!: GPUBuffer;
  private lightBuffer!: GPUBuffer;
  private postBuffer!: GPUBuffer;
  private instanceBuffer!: GPUBuffer;

  private frameBG!: GPUBindGroup;
  private shadowFrameBG!: GPUBindGroup;
  private instanceBG!: GPUBindGroup;
  private tonemapBG: GPUBindGroup | null = null;
  private tonemapLayout!: GPUBindGroupLayout;

  private shadowTexture!: GPUTexture;
  private hdrSampler!: GPUSampler;

  private frameData = new Float32Array(FRAME_BYTES / 4);
  private lightData = new Float32Array(16);
  private postData = new Float32Array(POST_BYTES / 4);
  private instanceData = new Float32Array((MAX_INSTANCES * INSTANCE_BYTES) / 4);
  private instancesDirty = true;
  /** Rebuilt whenever the canvas resizes, since the HDR view is recreated. */
  private lastWidth = 0;
  private lastHeight = 0;

  private constructor(ctx: GPUContext, camera: OrbitCamera) {
    this.ctx = ctx;
    this.camera = camera;
  }

  static async create(canvas: HTMLCanvasElement): Promise<SceneRenderer> {
    const ctx = await GPUContext.create(canvas, { hdr: true });
    const camera = new OrbitCamera({ distance: 3.1, elevation: 0.62 });
    camera.attach(canvas);

    const scene = new SceneRenderer(ctx, camera);
    scene.build();
    return scene;
  }

  // --- setup ---------------------------------------------------------------

  private build() {
    const d = this.ctx.device;

    this.frameBuffer = d.createBuffer({
      label: "frame-uniform",
      size: FRAME_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.lightBuffer = d.createBuffer({
      label: "light-uniform",
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.postBuffer = d.createBuffer({
      label: "post-uniform",
      size: POST_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.instanceBuffer = d.createBuffer({
      label: "instances",
      size: MAX_INSTANCES * INSTANCE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.shadowTexture = d.createTexture({
      label: "shadow-map",
      size: [SHADOW_SIZE, SHADOW_SIZE],
      format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.hdrSampler = d.createSampler({ magFilter: "linear", minFilter: "linear" });

    // --- layouts
    const frameLayout = d.createBindGroupLayout({
      label: "frame-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "depth" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "comparison" },
        },
      ],
    });

    const instanceLayout = d.createBindGroupLayout({
      label: "instance-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" },
        },
      ],
    });

    const lightLayout = d.createBindGroupLayout({
      label: "light-bgl",
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      ],
    });

    this.tonemapLayout = d.createBindGroupLayout({
      label: "tonemap-bgl",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    // --- bind groups
    this.frameBG = d.createBindGroup({
      layout: frameLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: this.shadowTexture.createView() },
        {
          binding: 2,
          resource: d.createSampler({
            compare: "less",
            magFilter: "linear",
            minFilter: "linear",
          }),
        },
      ],
    });

    this.shadowFrameBG = d.createBindGroup({
      layout: lightLayout,
      entries: [{ binding: 0, resource: { buffer: this.lightBuffer } }],
    });

    this.instanceBG = d.createBindGroup({
      layout: instanceLayout,
      entries: [{ binding: 0, resource: { buffer: this.instanceBuffer } }],
    });

    // --- pipelines
    const vertexBuffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 12, format: "float32x3" },
        ],
      },
    ];

    const sceneModule = d.createShaderModule({ label: "scene", code: SCENE_WGSL });
    this.scenePipeline = d.createRenderPipeline({
      label: "scene",
      layout: d.createPipelineLayout({
        bindGroupLayouts: [frameLayout, instanceLayout],
      }),
      vertex: { module: sceneModule, entryPoint: "vs", buffers: vertexBuffers },
      fragment: {
        module: sceneModule,
        entryPoint: "fs",
        targets: [{ format: this.ctx.sceneFormat }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
      multisample: { count: SAMPLE_COUNT },
    });

    const shadowModule = d.createShaderModule({ label: "shadow", code: SHADOW_WGSL });
    this.shadowPipeline = d.createRenderPipeline({
      label: "shadow",
      layout: d.createPipelineLayout({
        bindGroupLayouts: [lightLayout, instanceLayout],
      }),
      vertex: { module: shadowModule, entryPoint: "vs", buffers: vertexBuffers },
      // Record *front* faces. Culling front faces instead is a common acne
      // trick, but it writes the far side of each object into the depth map, so
      // the shadow detaches from its caster by the object's thickness. Normal
      // offset in the scene shader handles acne instead.
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
        // Hardware slope-scaled bias, in units of the depth format's smallest
        // resolvable difference. Cheaper and better-behaved than doing it in
        // the shader, and it only affects what gets written to the map.
        depthBias: 2,
        depthBiasSlopeScale: 2.0,
        depthBiasClamp: 0.01,
      },
    });

    const tonemapModule = d.createShaderModule({ label: "tonemap", code: TONEMAP_WGSL });
    this.tonemapPipeline = d.createRenderPipeline({
      label: "tonemap",
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.tonemapLayout] }),
      vertex: { module: tonemapModule, entryPoint: "vs" },
      fragment: {
        module: tonemapModule,
        entryPoint: "fs",
        targets: [{ format: this.ctx.format }],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  // --- content -------------------------------------------------------------

  addMesh(mesh: MeshData): MeshHandle {
    const d = this.ctx.device;
    const vertexBuffer = d.createBuffer({
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const indexBuffer = d.createBuffer({
      size: mesh.indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    d.queue.writeBuffer(vertexBuffer, 0, mesh.vertices);
    d.queue.writeBuffer(indexBuffer, 0, mesh.indices);

    const id = this.meshes.length;
    this.meshes.push({
      vertexBuffer,
      indexBuffer,
      indexCount: mesh.indices.length,
      instances: [],
    });
    return { id };
  }

  setInstances(handle: MeshHandle, instances: InstanceSpec[]) {
    this.meshes[handle.id].instances = instances;
    this.instancesDirty = true;
  }

  /**
   * Packs every mesh's instances into the shared buffer, contiguously, and
   * records where each batch starts so draws can use `firstInstance`.
   */
  private uploadInstances(): Array<{ mesh: MeshRecord; first: number; count: number }> {
    const batches: Array<{ mesh: MeshRecord; first: number; count: number }> = [];
    let cursor = 0;
    const stride = INSTANCE_BYTES / 4;

    for (const mesh of this.meshes) {
      const first = cursor;
      for (const inst of mesh.instances) {
        if (cursor >= MAX_INSTANCES) break;

        const model = mat4.identity();
        mat4.translate(model, vec3.create(...inst.position), model);
        if (inst.rotationY) mat4.rotateY(model, inst.rotationY, model);
        const s = inst.scale ?? 1;
        if (s !== 1) mat4.scale(model, vec3.create(s, s, s), model);

        const base = cursor * stride;
        this.instanceData.set(model as Float32Array, base);
        this.instanceData.set(
          [...inst.material.albedo, inst.material.roughness],
          base + 16,
        );
        this.instanceData.set(
          [inst.material.metallic ?? 0, inst.material.ao ?? 1, 0, 0],
          base + 20,
        );
        cursor++;
      }
      batches.push({ mesh, first, count: cursor - first });
    }

    if (this.instancesDirty) {
      this.ctx.device.queue.writeBuffer(
        this.instanceBuffer,
        0,
        this.instanceData,
        0,
        Math.max(cursor, 1) * stride,
      );
      this.instancesDirty = false;
    }

    return batches;
  }

  // --- per-frame -----------------------------------------------------------

  /**
   * Orthographic projection from the light, sized to the board. Directional
   * lights have no position, so the "eye" is placed back along the light
   * direction far enough to enclose the scene.
   */
  private lightViewProj() {
    const dir = vec3.normalize(vec3.create(...this.light.direction));
    const centre = vec3.create(0, 0.15, 0);
    const eye = vec3.addScaled(centre, dir, 6);

    const view = mat4.lookAt(eye, centre, vec3.create(0, 1, 0));
    // Extent covers the board plus headroom for stacked food and overhang.
    const proj = mat4.ortho(
      -SHADOW_EXTENT,
      SHADOW_EXTENT,
      -SHADOW_EXTENT,
      SHADOW_EXTENT,
      0.1,
      12,
    );
    return mat4.multiply(proj, view);
  }

  private writeFrame() {
    const f = this.frameData;
    const viewProj = this.camera.viewProj(this.ctx.aspect);
    const lightVP = this.lightViewProj();
    const eye = this.camera.eye();
    const L = this.light;

    f.set(viewProj as Float32Array, 0);
    f.set(lightVP as Float32Array, 16);
    f.set([eye[0], eye[1], eye[2], 0], 32);
    f.set([...L.direction, L.intensity], 36);
    f.set([...L.color, 0], 40);
    f.set([...L.ambientSky, 0], 44);
    f.set([...L.ambientGround, 0], 48);
    // One shadow texel spans the full ortho width divided by the map resolution.
    const texelWorld = (SHADOW_EXTENT * 2) / SHADOW_SIZE;
    f.set(
      [
        1 / SHADOW_SIZE,                                 // PCF step, in uv
        0.0004,                                          // residual depth bias
        this.exposure,
        texelWorld * SHADOW_NORMAL_OFFSET_TEXELS,        // normal offset, world
      ],
      52,
    );

    // wgpu-matrix returns Float32Array<ArrayBufferLike>; writeBuffer requires a
    // non-shared ArrayBuffer, so copy through owned scratch rather than cast.
    this.lightData.set(lightVP as ArrayLike<number>);
    this.postData[0] = this.exposure;
    this.postData[1] = this.vignette;
    this.postData[2] = this.saturation;

    const q = this.ctx.device.queue;
    q.writeBuffer(this.frameBuffer, 0, this.frameData);
    q.writeBuffer(this.lightBuffer, 0, this.lightData);
    q.writeBuffer(this.postBuffer, 0, this.postData);
  }

  /** The HDR view changes on resize, so the tonemap bind group must follow it. */
  private ensureTonemapBindGroup() {
    if (
      this.tonemapBG &&
      this.lastWidth === this.ctx.width &&
      this.lastHeight === this.ctx.height
    ) {
      return;
    }
    this.lastWidth = this.ctx.width;
    this.lastHeight = this.ctx.height;
    this.tonemapBG = this.ctx.device.createBindGroup({
      layout: this.tonemapLayout,
      entries: [
        { binding: 0, resource: { buffer: this.postBuffer } },
        { binding: 1, resource: this.ctx.hdrView() },
        { binding: 2, resource: this.hdrSampler },
      ],
    });
  }

  render() {
    this.ctx.resize();
    this.ensureTonemapBindGroup();
    this.writeFrame();

    const batches = this.uploadInstances();
    const encoder = this.ctx.device.createCommandEncoder();

    // 1 — shadow
    const shadow = encoder.beginRenderPass({
      label: "shadow",
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    shadow.setPipeline(this.shadowPipeline);
    shadow.setBindGroup(0, this.shadowFrameBG);
    shadow.setBindGroup(1, this.instanceBG);
    for (const b of batches) {
      if (b.count === 0) continue;
      shadow.setVertexBuffer(0, b.mesh.vertexBuffer);
      shadow.setIndexBuffer(b.mesh.indexBuffer, "uint32");
      shadow.drawIndexed(b.mesh.indexCount, b.count, 0, 0, b.first);
    }
    shadow.end();

    // 2 — forward
    const forward = encoder.beginRenderPass({
      label: "forward",
      colorAttachments: [this.ctx.colorAttachment({ r: 0.02, g: 0.02, b: 0.03, a: 1 })],
      depthStencilAttachment: this.ctx.depthAttachment(),
    });
    forward.setPipeline(this.scenePipeline);
    forward.setBindGroup(0, this.frameBG);
    forward.setBindGroup(1, this.instanceBG);
    for (const b of batches) {
      if (b.count === 0) continue;
      forward.setVertexBuffer(0, b.mesh.vertexBuffer);
      forward.setIndexBuffer(b.mesh.indexBuffer, "uint32");
      forward.drawIndexed(b.mesh.indexCount, b.count, 0, 0, b.first);
    }
    forward.end();

    // 3 — tonemap
    const post = encoder.beginRenderPass({
      label: "tonemap",
      colorAttachments: [this.ctx.swapchainAttachment()],
    });
    post.setPipeline(this.tonemapPipeline);
    post.setBindGroup(0, this.tonemapBG!);
    post.draw(3);
    post.end();

    this.ctx.device.queue.submit([encoder.finish()]);
  }

  dispose() {
    this.camera.dispose();
    for (const m of this.meshes) {
      m.vertexBuffer.destroy();
      m.indexBuffer.destroy();
    }
    this.shadowTexture.destroy();
    this.frameBuffer.destroy();
    this.lightBuffer.destroy();
    this.postBuffer.destroy();
    this.instanceBuffer.destroy();
    this.ctx.destroy();
  }
}
