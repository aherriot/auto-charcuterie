/**
 * WebGPU device + canvas bootstrap.
 *
 * Owns the adapter/device handshake, the canvas context configuration, and the
 * size-dependent attachments (MSAA colour target + depth buffer). Everything
 * downstream renders into `colorAttachment()` / `depthView()` and never touches
 * the swapchain directly.
 */

export const SAMPLE_COUNT = 4;

export class WebGPUUnavailableError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "WebGPUUnavailableError";
  }
}

export interface GPUContextOptions {
  /** Clamped device pixel ratio. Keeps 4K/Retina from melting integrated GPUs. */
  maxPixelRatio?: number;
  onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

export class GPUContext {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  readonly canvas: HTMLCanvasElement;

  private msaaTexture: GPUTexture | null = null;
  private depthTexture: GPUTexture | null = null;
  private maxPixelRatio: number;

  width = 0;
  height = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    maxPixelRatio: number,
  ) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.format = format;
    this.maxPixelRatio = maxPixelRatio;
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: GPUContextOptions = {},
  ): Promise<GPUContext> {
    if (typeof navigator === "undefined" || !navigator.gpu) {
      throw new WebGPUUnavailableError(
        "This browser does not expose navigator.gpu.",
      );
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) {
      throw new WebGPUUnavailableError(
        "No suitable GPU adapter was returned.",
      );
    }

    const device = await adapter.requestDevice();

    device.lost.then((info) => {
      // Reason "destroyed" is our own teardown; anything else is a real loss.
      if (info.reason !== "destroyed") options.onDeviceLost?.(info);
    });

    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new WebGPUUnavailableError(
        "Failed to acquire a webgpu canvas context.",
      );
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    const ctx = new GPUContext(
      canvas,
      device,
      context,
      format,
      options.maxPixelRatio ?? 2,
    );
    ctx.resize();
    return ctx;
  }

  /**
   * Re-reads the canvas' CSS size and rebuilds size-dependent attachments.
   * Safe to call every frame — it early-outs when nothing changed.
   */
  resize(): boolean {
    const ratio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * ratio));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * ratio));
    if (w === this.width && h === this.height && this.msaaTexture) return false;

    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;

    this.msaaTexture?.destroy();
    this.depthTexture?.destroy();

    this.msaaTexture = this.device.createTexture({
      label: "msaa-color",
      size: [w, h],
      format: this.format,
      sampleCount: SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.depthTexture = this.device.createTexture({
      label: "depth",
      size: [w, h],
      format: "depth24plus",
      sampleCount: SAMPLE_COUNT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    return true;
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  /** MSAA colour attachment resolving into the current swapchain texture. */
  colorAttachment(clear: GPUColor): GPURenderPassColorAttachment {
    return {
      view: this.msaaTexture!.createView(),
      resolveTarget: this.context.getCurrentTexture().createView(),
      clearValue: clear,
      loadOp: "clear",
      storeOp: "store",
    };
  }

  depthAttachment(): GPURenderPassDepthStencilAttachment {
    return {
      view: this.depthTexture!.createView(),
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    };
  }

  destroy() {
    this.msaaTexture?.destroy();
    this.depthTexture?.destroy();
    this.msaaTexture = null;
    this.depthTexture = null;
    this.device.destroy();
  }
}
