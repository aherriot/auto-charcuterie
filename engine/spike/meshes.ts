/**
 * Throwaway primitives for the Phase 0 spike — just enough to give the cloth
 * something recognisable to drape over.
 *
 * The real procedural mesh library lands in Phase 2 (`engine/mesh/`).
 */

export interface MeshData {
  /**
   * Interleaved position(3) + normal(3), stride 24 bytes.
   *
   * Explicitly backed by `ArrayBuffer` (not `ArrayBufferLike`) so these can be
   * handed straight to `queue.writeBuffer`, which rejects shared buffers.
   */
  vertices: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
}

export function uvSphere(segments = 24, rings = 16): MeshData {
  const verts: number[] = [];
  const idx: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    const y = Math.cos(phi);
    const rad = Math.sin(phi);
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = rad * Math.cos(theta);
      const z = rad * Math.sin(theta);
      verts.push(x, y, z, x, y, z); // unit sphere: position doubles as normal
    }
  }

  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = a + stride;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

export function box(hx: number, hy: number, hz: number): MeshData {
  const faces: Array<[number[], number[]]> = [
    [[0, 0, 1], [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]],
    [[0, 0, -1], [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1]],
    [[1, 0, 0], [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1]],
    [[-1, 0, 0], [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1]],
    [[0, 1, 0], [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1]],
    [[0, -1, 0], [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1]],
  ];

  const verts: number[] = [];
  const idx: number[] = [];

  for (const [n, quad] of faces) {
    const base = verts.length / 6;
    for (let i = 0; i < 4; i++) {
      verts.push(quad[i * 3] * hx, quad[i * 3 + 1] * hy, quad[i * 3 + 2] * hz, n[0], n[1], n[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}
