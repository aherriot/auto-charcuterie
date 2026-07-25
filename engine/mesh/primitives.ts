/**
 * Procedural mesh generation.
 *
 * Everything in the app is generated from math — there are no model files. This
 * module holds the reusable primitives; Phase 2 builds the food catalogue on top
 * of them in `foods.ts`.
 *
 * Vertex layout is interleaved position(3) + normal(3), stride 24 bytes, matching
 * the scene pipeline's vertex buffer description.
 */

export interface MeshData {
  /**
   * Explicitly backed by `ArrayBuffer` (not `ArrayBufferLike`) so these can be
   * handed straight to `queue.writeBuffer`, which rejects shared buffers.
   */
  vertices: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
}

/** Accumulates triangles without the caller tracking index offsets. */
class MeshBuilder {
  private verts: number[] = [];
  private idx: number[] = [];

  vertex(px: number, py: number, pz: number, nx: number, ny: number, nz: number): number {
    const index = this.verts.length / 6;
    this.verts.push(px, py, pz, nx, ny, nz);
    return index;
  }

  triangle(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }

  build(): MeshData {
    return {
      vertices: new Float32Array(this.verts),
      indices: new Uint32Array(this.idx),
    };
  }
}

/**
 * Rounded, chamfered box — the cutting board.
 *
 * Built by sweeping a rounded rectangle profile: the corner radius is subdivided
 * so the silhouette reads as a real board with eased edges rather than a slab.
 * A hard box is the single fastest way to make a render look untextured and
 * synthetic, and the chamfer is what catches the key light along the rim.
 */
export function roundedBox(
  hx: number,
  hy: number,
  hz: number,
  radius = Math.min(hx, hy, hz) * 0.35,
  segments = 4,
): MeshData {
  const b = new MeshBuilder();
  const r = Math.min(radius, Math.min(hx, hz) * 0.9, hy * 0.9);

  // Ring of profile points around the top and bottom edges, with the corner
  // radius resolved through `segments` steps.
  const profile: Array<{ x: number; z: number; nx: number; nz: number }> = [];
  const corners: Array<[number, number]> = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];

  for (const [sx, sz] of corners) {
    const cx = sx * (hx - r);
    const cz = sz * (hz - r);
    // Each corner sweeps a quarter turn; the sign pair picks which quadrant.
    const start = Math.atan2(sz, sx) - Math.PI / 4;
    for (let s = 0; s <= segments; s++) {
      const a = start + (s / segments) * (Math.PI / 2);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      profile.push({ x: cx + nx * r, z: cz + nz * r, nx, nz });
    }
  }

  // Sweeping the corners from +X toward +Z traces the ring clockwise when
  // viewed from above, which makes every face built from it — walls, chamfer
  // and both end fans — front-face backwards and get culled, showing the
  // interior. Reversing here flips all four consistently.
  profile.reverse();

  const n = profile.length;
  const yTop = hy - r * 0.5;
  const yBot = -hy;

  // Side wall.
  const sideTop: number[] = [];
  const sideBot: number[] = [];
  for (const p of profile) {
    sideTop.push(b.vertex(p.x, yTop, p.z, p.nx, 0, p.nz));
    sideBot.push(b.vertex(p.x, yBot, p.z, p.nx, 0, p.nz));
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    b.quad(sideBot[i], sideBot[j], sideTop[j], sideTop[i]);
  }

  // Chamfer between the side wall and the top face — a 45° bevel whose normal
  // is the average of the wall and the top.
  const inset = r * 0.5;
  const chamfer: number[] = [];
  const chamferOuter: number[] = [];
  for (const p of profile) {
    const bevelN = normalize3(p.nx, 1, p.nz);
    chamferOuter.push(b.vertex(p.x, yTop, p.z, bevelN[0], bevelN[1], bevelN[2]));
    chamfer.push(
      b.vertex(
        p.x - p.nx * inset,
        hy,
        p.z - p.nz * inset,
        bevelN[0],
        bevelN[1],
        bevelN[2],
      ),
    );
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    b.quad(chamferOuter[i], chamferOuter[j], chamfer[j], chamfer[i]);
  }

  // Top and bottom faces, fanned from a centre vertex.
  const topCentre = b.vertex(0, hy, 0, 0, 1, 0);
  const topRing = profile.map((p) =>
    b.vertex(p.x - p.nx * inset, hy, p.z - p.nz * inset, 0, 1, 0),
  );
  for (let i = 0; i < n; i++) {
    b.triangle(topCentre, topRing[i], topRing[(i + 1) % n]);
  }

  const botCentre = b.vertex(0, yBot, 0, 0, -1, 0);
  const botRing = profile.map((p) => b.vertex(p.x, yBot, p.z, 0, -1, 0));
  for (let i = 0; i < n; i++) {
    b.triangle(botCentre, botRing[(i + 1) % n], botRing[i]);
  }

  return b.build();
}

/**
 * Superellipsoid — the workhorse for produce.
 *
 * `n` controls how boxy the form is: 2 gives a sphere, above 2 tends toward a
 * rounded cube, below 2 pinches toward an octahedron. Olives, grapes and almonds
 * are all this shape with different exponents and axis scales.
 */
export function superellipsoid(
  rx: number,
  ry: number,
  rz: number,
  n = 2,
  segments = 24,
  rings = 16,
): MeshData {
  const b = new MeshBuilder();
  const e = 2 / n;
  const rows: number[][] = [];

  for (let r = 0; r <= rings; r++) {
    const row: number[] = [];
    const phi = -Math.PI / 2 + (r / rings) * Math.PI;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;

      const cp = signedPow(Math.cos(phi), e);
      const sp = signedPow(Math.sin(phi), e);
      const ct = signedPow(Math.cos(theta), e);
      const st = signedPow(Math.sin(theta), e);

      const x = rx * cp * ct;
      const y = ry * sp;
      const z = rz * cp * st;

      // Analytic normal of the implicit surface, which stays correct for any n
      // — a finite-difference normal breaks down at the poles.
      const nx = ct === 0 ? 0 : (2 / rx) * signedPow(Math.cos(phi), 2 - e) * signedPow(Math.cos(theta), 2 - e);
      const ny = (2 / ry) * signedPow(Math.sin(phi), 2 - e);
      const nz = st === 0 ? 0 : (2 / rz) * signedPow(Math.cos(phi), 2 - e) * signedPow(Math.sin(theta), 2 - e);
      const nrm = normalize3(nx, ny, nz);

      row.push(b.vertex(x, y, z, nrm[0], nrm[1], nrm[2]));
    }
    rows.push(row);
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      b.quad(rows[r][s], rows[r + 1][s], rows[r + 1][s + 1], rows[r][s + 1]);
    }
  }

  return b.build();
}

/** Unit sphere. Convenience wrapper — a superellipsoid with n = 2. */
export function sphere(radius = 1, segments = 24, rings = 16): MeshData {
  return superellipsoid(radius, radius, radius, 2, segments, rings);
}

export interface WindingReport {
  triangles: number;
  /** Triangles whose geometric normal opposes their shaded normal. */
  inverted: number;
  /** Zero-area triangles, which are winding-agnostic and excluded. */
  degenerate: number;
}

/**
 * Verifies that triangle winding agrees with the vertex normals.
 *
 * With `cullMode: "back"` and the default counter-clockwise front face, a mesh
 * wound the wrong way renders inside-out: you see its interior and the exterior
 * vanishes. It's an easy mistake to make in a generator and an obvious one on
 * screen, but only if you happen to look at that object from outside — so this
 * catches it in `npm run check` instead.
 */
export function checkWinding(mesh: MeshData): WindingReport {
  const { vertices: v, indices: idx } = mesh;
  const report: WindingReport = { triangles: 0, inverted: 0, degenerate: 0 };

  const pos = (i: number): [number, number, number] => [
    v[i * 6],
    v[i * 6 + 1],
    v[i * 6 + 2],
  ];
  const nrm = (i: number): [number, number, number] => [
    v[i * 6 + 3],
    v[i * 6 + 4],
    v[i * 6 + 5],
  ];

  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const p0 = pos(a);
    const p1 = pos(b);
    const p2 = pos(c);

    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const gx = e1[1] * e2[2] - e1[2] * e2[1];
    const gy = e1[2] * e2[0] - e1[0] * e2[2];
    const gz = e1[0] * e2[1] - e1[1] * e2[0];

    report.triangles++;
    if (Math.hypot(gx, gy, gz) < 1e-12) {
      report.degenerate++;
      continue;
    }

    // Average the three shaded normals — on a curved surface no single vertex
    // normal matches the flat facet, but their mean points the same way.
    const n0 = nrm(a);
    const n1 = nrm(b);
    const n2 = nrm(c);
    const ax = n0[0] + n1[0] + n2[0];
    const ay = n0[1] + n1[1] + n2[1];
    const az = n0[2] + n1[2] + n2[2];

    if (gx * ax + gy * ay + gz * az < 0) report.inverted++;
  }

  return report;
}

function signedPow(v: number, e: number): number {
  const a = Math.abs(v) ** e;
  return v < 0 ? -a : a;
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  if (l < 1e-9) return [0, 1, 0];
  return [x / l, y / l, z / l];
}
