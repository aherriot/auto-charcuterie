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

export type Vec3 = [number, number, number];

/**
 * Sweeps a circular cross-section along a path — cashews, breadsticks,
 * cornichons, anything vaguely tubular.
 *
 * Frames are propagated by parallel transport rather than recomputed from a
 * fixed up-vector: a Frenet frame flips wherever the path's curvature reverses,
 * which would twist the mesh at exactly the bends that make a cashew a cashew.
 *
 * `radius` is sampled along the path so ends can taper, and `profile` optionally
 * squashes the cross-section into an ellipse.
 */
export function sweptTube(
  path: Vec3[],
  radius: (t: number) => number,
  segments = 12,
  profile: (t: number) => [number, number] = () => [1, 1],
): MeshData {
  const b = new MeshBuilder();
  const n = path.length;
  if (n < 2) return b.build();

  // Seed the frame with any vector not parallel to the first tangent.
  let tangent = norm(sub(path[1], path[0]));
  let normal = norm(cross(Math.abs(tangent[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], tangent));
  const rings: number[][] = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);

    const nextTangent = norm(
      i === 0 ? sub(path[1], path[0])
      : i === n - 1 ? sub(path[n - 1], path[n - 2])
      : sub(path[i + 1], path[i - 1]),
    );

    // Rotate the previous normal by the same rotation that takes the previous
    // tangent to this one — this is the parallel transport step.
    const axis = cross(tangent, nextTangent);
    const axisLen = len(axis);
    if (axisLen > 1e-8) {
      const angle = Math.atan2(axisLen, dot(tangent, nextTangent));
      normal = norm(rotateAround(normal, scale(axis, 1 / axisLen), angle));
    }
    tangent = nextTangent;

    // Re-orthogonalise against drift accumulated over many steps.
    normal = norm(sub(normal, scale(tangent, dot(normal, tangent))));
    const binormal = cross(tangent, normal);

    const r = radius(t);
    const [sx, sy] = profile(t);
    const ring: number[] = [];

    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      const offset = add(scale(normal, ca * r * sx), scale(binormal, sa * r * sy));
      const p = add(path[i], offset);
      // For a non-circular profile the surface normal isn't the radial vector;
      // scaling each axis by its reciprocal gives the correct ellipse normal.
      const nrm = norm(
        add(scale(normal, (ca * sy) / sx || ca), scale(binormal, (sa * sx) / sy || sa)),
      );
      ring.push(b.vertex(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2]));
    }
    rings.push(ring);
  }

  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < segments; s++) {
      b.quad(rings[i][s], rings[i][s + 1], rings[i + 1][s + 1], rings[i + 1][s]);
    }
  }

  // Cap the ends with fans so tapered tubes aren't hollow.
  const capStart = norm(sub(path[0], path[1]));
  const centreStart = b.vertex(...path[0], ...capStart);
  for (let s = 0; s < segments; s++) {
    b.triangle(centreStart, rings[0][s + 1], rings[0][s]);
  }

  const capEnd = norm(sub(path[n - 1], path[n - 2]));
  const centreEnd = b.vertex(...path[n - 1], ...capEnd);
  for (let s = 0; s < segments; s++) {
    b.triangle(centreEnd, rings[n - 1][s], rings[n - 1][s + 1]);
  }

  return b.build();
}

/**
 * A disc with an irregular, wobbling rim — salami and soppressata rounds.
 *
 * The wobble is what stops it reading as a machined cylinder: real cured
 * sausage is never a perfect circle in cross-section.
 */
export function disc(
  radius: number,
  thickness: number,
  segments = 32,
  wobble = 0.04,
  seed = 1,
): MeshData {
  const b = new MeshBuilder();
  const hy = thickness / 2;

  const rim = Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    // Two incommensurate harmonics — one alone looks like a deliberate oval.
    const r =
      radius *
      (1 + Math.sin(a * 3 + seed) * wobble + Math.sin(a * 5 - seed * 2.1) * wobble * 0.5);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) };
  });

  const top: number[] = [];
  const bot: number[] = [];
  const sideTop: number[] = [];
  const sideBot: number[] = [];

  for (const p of rim) {
    top.push(b.vertex(p.x, hy, p.z, 0, 1, 0));
    bot.push(b.vertex(p.x, -hy, p.z, 0, -1, 0));
    sideTop.push(b.vertex(p.x, hy, p.z, p.nx, 0, p.nz));
    sideBot.push(b.vertex(p.x, -hy, p.z, p.nx, 0, p.nz));
  }

  const topCentre = b.vertex(0, hy, 0, 0, 1, 0);
  const botCentre = b.vertex(0, -hy, 0, 0, -1, 0);

  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    b.triangle(topCentre, top[j], top[i]);
    b.triangle(botCentre, bot[i], bot[j]);
    // Wall winding runs j→i, opposite to the fans. With the ring traversed
    // counter-clockwise in (x,z), i→j puts the outward face inward.
    b.quad(sideBot[j], sideBot[i], sideTop[i], sideTop[j]);
  }

  return b.build();
}

/**
 * Triangular wedge with softened edges — brie and blue, cut from a wheel.
 *
 * `arc` bows the outer edge so it reads as a slice of a round rather than a
 * plain triangle.
 */
export function wedge(
  radius: number,
  height: number,
  angle = Math.PI / 3.2,
  arcSegments = 8,
): MeshData {
  const b = new MeshBuilder();
  const hy = height / 2;

  // Arc runs high-to-low so the outline is counter-clockwise in (x,z), matching
  // every other generator here. Sweeping the other way inverts the whole wedge.
  const outline: Array<{ x: number; z: number }> = [{ x: 0, z: 0 }];
  for (let i = 0; i <= arcSegments; i++) {
    const a = angle / 2 - (i / arcSegments) * angle;
    outline.push({ x: Math.sin(a) * radius, z: Math.cos(a) * radius });
  }

  const n = outline.length;
  const top = outline.map((p) => b.vertex(p.x, hy, p.z, 0, 1, 0));
  const bot = outline.map((p) => b.vertex(p.x, -hy, p.z, 0, -1, 0));

  // Fan both faces from the wedge point.
  for (let i = 1; i < n - 1; i++) {
    b.triangle(top[0], top[i + 1], top[i]);
    b.triangle(bot[0], bot[i], bot[i + 1]);
  }

  // Walls all the way round, including the two straight cut faces.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const edge = norm([outline[j].x - outline[i].x, 0, outline[j].z - outline[i].z]);
    const nrm: Vec3 = [edge[2], 0, -edge[0]];

    const a = b.vertex(outline[i].x, -hy, outline[i].z, ...nrm);
    const c = b.vertex(outline[j].x, -hy, outline[j].z, ...nrm);
    const d = b.vertex(outline[j].x, hy, outline[j].z, ...nrm);
    const e = b.vertex(outline[i].x, hy, outline[i].z, ...nrm);
    b.quad(c, a, e, d);
  }

  return b.build();
}

/**
 * Extrudes a closed 2D outline into a thin slab — crackers, fig halves, any
 * flat item whose silhouette carries the character.
 */
export function loftedPolygon(
  outline: Array<[number, number]>,
  thickness: number,
): MeshData {
  const b = new MeshBuilder();
  const hy = thickness / 2;
  const n = outline.length;

  const top = outline.map(([x, z]) => b.vertex(x, hy, z, 0, 1, 0));
  const bot = outline.map(([x, z]) => b.vertex(x, -hy, z, 0, -1, 0));
  const topCentre = b.vertex(0, hy, 0, 0, 1, 0);
  const botCentre = b.vertex(0, -hy, 0, 0, -1, 0);

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    b.triangle(topCentre, top[j], top[i]);
    b.triangle(botCentre, bot[i], bot[j]);

    const edge = norm([outline[j][0] - outline[i][0], 0, outline[j][1] - outline[i][1]]);
    const nrm: Vec3 = [edge[2], 0, -edge[0]];
    const a = b.vertex(outline[i][0], -hy, outline[i][1], ...nrm);
    const c = b.vertex(outline[j][0], -hy, outline[j][1], ...nrm);
    const d = b.vertex(outline[j][0], hy, outline[j][1], ...nrm);
    const e = b.vertex(outline[i][0], hy, outline[i][1], ...nrm);
    b.quad(c, a, e, d);
  }

  return b.build();
}

/** Regular polygon outline, for crackers and the honeycomb slab. */
export function polygonOutline(
  sides: number,
  radius: number,
  scallop = 0,
  seed = 0,
): Array<[number, number]> {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2 + seed;
    const r = radius * (1 + Math.sin(a * sides * 0.5) * scallop);
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });
}

// --- small vector helpers, local to mesh generation ------------------------

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l < 1e-9 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
}
/** Rodrigues rotation of `v` about unit `axis` by `angle`. */
function rotateAround(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(
    add(scale(v, c), scale(cross(axis, v), s)),
    scale(axis, dot(axis, v) * (1 - c)),
  );
}

/** Cubic Bezier sampled into a path, for swept shapes. */
export function bezierPath(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  steps = 16,
): Vec3[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    return [
      p0[0] * w0 + p1[0] * w1 + p2[0] * w2 + p3[0] * w3,
      p0[1] * w0 + p1[1] * w1 + p2[1] * w2 + p3[1] * w3,
      p0[2] * w0 + p1[2] * w1 + p2[2] * w2 + p3[2] * w3,
    ] as Vec3;
  });
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
  /**
   * Signed volume via the divergence theorem. Positive for a closed mesh wound
   * outward; negative means the whole surface faces inward.
   *
   * This catches what the per-triangle check cannot. Where a generator derives
   * its vertex normals from the same orientation as its winding — extruded
   * walls, for instance — reversing the outline flips *both*, so geometric and
   * shaded normals still agree and every triangle looks consistent. The mesh is
   * nonetheless inside-out. Volume is orientation-absolute and sees it.
   */
  volume: number;
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
  const report: WindingReport = {
    triangles: 0,
    inverted: 0,
    degenerate: 0,
    volume: 0,
  };

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

    // Signed volume of the tetrahedron from the origin to this triangle.
    report.volume +=
      (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) +
        p0[1] * (p1[2] * p2[0] - p1[0] * p2[2]) +
        p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) /
      6;

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
