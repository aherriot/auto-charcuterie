/**
 * XPBD cloth solver — WGSL compute kernels.
 *
 * WGSL lives in TypeScript template literals rather than `.wgsl` files so we can
 * interpolate compile-time constants (workgroup size) and avoid configuring a
 * bundler raw-text loader.
 *
 * ## Parallelisation strategy
 *
 * Constraints are solved in **gather form**: one thread owns one particle, walks
 * its incident constraints, and writes only its own slot. No atomics, no
 * read-write hazards, no graph colouring. The cost is that it's Jacobi rather
 * than Gauss-Seidel, so it converges more slowly per iteration — paid back by
 * running iterations as separate dispatches over ping-ponged buffers.
 *
 * ## Collision, in three layers
 *
 * Particle-only collision fails in two ways that both showed up immediately:
 * a coarse grid lets obstacles slip *between* particles, and fast motion lets
 * particles tunnel straight through small obstacles in a single step. So:
 *
 *   1. **Point** — the particle itself vs. board and obstacle spheres.
 *   2. **Edge** — each structural edge as a segment vs. obstacle spheres, so
 *      resolution no longer determines whether an olive can slip through.
 *   3. **Swept** — the segment from previous to current position, so a particle
 *      moving fast can't skip over an obstacle between substeps.
 *
 * Slice-vs-slice collision uses a spatial hash rebuilt every substep.
 *
 * Buffer layout (all `vec4f` for 16-byte alignment):
 *   pos[i].xyz  current position      pos[i].w  inverse mass (0 = pinned)
 *   prev[i].xyz previous position     (w unused)
 *   nrm[i].xyz  smooth vertex normal  (w unused)
 */

export const WORKGROUP_SIZE = 64;

/** Must match `Params` in the shader below, and `writeParams` in solver.ts. */
export const PARAMS_BYTES = 112;

/** Spatial-hash buckets. Power of two; plenty for ~20k particles. */
export const HASH_TABLE_SIZE = 16384;

/** Particles recorded per bucket. Overflow is dropped, which is acceptable. */
export const MAX_PER_CELL = 8;

const COMMON = /* wgsl */ `
struct Params {
  grid           : u32,   // particles per side of one slice
  particles      : u32,   // total across all slices
  obstacles      : u32,
  slices         : u32,
  tableSize      : u32,
  maxPerCell     : u32,
  sleepFrames    : u32,   // quiet frames before a slice freezes. 0 disables sleep.
  sliceStride    : u32,   // offset from the energy half to the sleep half of sliceState

  dt             : f32,
  spacing        : f32,   // rest length of a structural constraint
  gravity        : f32,
  damping        : f32,   // velocity retention per substep
  kStruct        : f32,
  kShear         : f32,
  kBend          : f32,
  friction       : f32,
  boardY         : f32,
  boardHalf      : f32,
  thickness      : f32,   // half-thickness of the slice, for collision offset
  relax          : f32,   // Jacobi over-relaxation
  windAmp        : f32,
  time           : f32,
  sliceSep       : f32,   // minimum separation between particles of different slices
  cellSize       : f32,   // spatial hash cell edge
  selfStiff      : f32,   // how hard slice-vs-slice contacts push apart
  boardThick     : f32,   // board slab depth, so the rim is a box not a half-space
  sleepEnergy    : f32,   // max per-particle v² below which a slice counts as quiet
  maxStep        : f32,   // per-substep displacement clamp — anti-explosion guard
};

@group(0) @binding(0) var<uniform>             P          : Params;
@group(0) @binding(1) var<storage, read>       posIn      : array<vec4f>;
@group(0) @binding(2) var<storage, read_write> posOut     : array<vec4f>;
@group(0) @binding(3) var<storage, read_write> prev       : array<vec4f>;
@group(0) @binding(4) var<storage, read>       obst       : array<vec4f>; // xyz centre, w radius
@group(0) @binding(5) var<storage, read_write> nrm        : array<vec4f>;
// Storage bindings are a scarce resource: the WebGPU default is 8 per stage and
// plenty of hardware offers no more, so related buffers are packed rather than
// bound separately. This keeps the solver at 7 and leaves room for the rigid-item
// SDF proxy buffer that Phase 4 adds.
//
// hashGrid  [0 .. tableSize)                          bucket occupancy counts
//           [tableSize .. tableSize*(1+maxPerCell))   bucket contents
@group(0) @binding(6) var<storage, read_write> hashGrid : array<atomic<u32>>;
//
// sliceState [0 .. sliceStride)              per-slice max v² for the frame, as
//                                            raw f32 bits — for non-negative
//                                            floats the IEEE pattern orders
//                                            identically to u32, so atomicMax
//                                            works directly on the bitcast
//            [sliceStride .. 2*sliceStride)  consecutive quiet-frame counts
@group(0) @binding(7) var<storage, read_write> sliceState : array<atomic<u32>>;

const SQRT2 : f32 = 1.41421356;

fn bucketSlot(h : u32, k : u32) -> u32 {
  return P.tableSize + h * P.maxPerCell + k;
}

/** A slice that has been quiet long enough stops simulating entirely. */
fn asleep(s : u32) -> bool {
  if (P.sleepFrames == 0u) { return false; }
  return atomicLoad(&sliceState[P.sliceStride + s]) >= P.sleepFrames;
}

fn hashCell(c : vec3i) -> u32 {
  // Standard Teschner et al. spatial hash. Negative coordinates wrap through
  // u32 conversion, which is fine — we only need a stable scatter.
  let h = (u32(c.x) * 73856093u) ^ (u32(c.y) * 19349663u) ^ (u32(c.z) * 83492791u);
  return h % P.tableSize;
}

fn cellOf(p : vec3f) -> vec3i {
  return vec3i(floor(p / P.cellSize));
}
`;

/** Resets bucket occupancy. Dispatched over `tableSize`, not particle count. */
export const CLEAR_GRID_WGSL = /* wgsl */ `
${COMMON}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid : vec3u) {
  if (gid.x >= P.tableSize) { return; }
  atomicStore(&hashGrid[gid.x], 0u);
}
`;

/** Scatters particle indices into hash buckets. */
export const BUILD_GRID_WGSL = /* wgsl */ `
${COMMON}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i = gid.x;
  if (i >= P.particles) { return; }

  let h = hashCell(cellOf(posOut[i].xyz));
  let slot = atomicAdd(&hashGrid[h], 1u);
  // Overflow is dropped rather than grown. A dropped contact is a missed push,
  // not a crash, and buckets only saturate where the cloth is already dense.
  if (slot < P.maxPerCell) {
    atomicStore(&hashGrid[bucketSlot(h, slot)], i);
  }
}
`;

/**
 * Verlet integration. Each thread touches only its own particle, so this runs
 * in place — no ping-pong needed.
 */
export const INTEGRATE_WGSL = /* wgsl */ `
${COMMON}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i = gid.x;
  if (i >= P.particles) { return; }

  let p = posOut[i];
  let invMass = p.w;
  if (invMass == 0.0) { return; }   // pinned

  let sliceId = i / (P.grid * P.grid);
  if (asleep(sliceId)) {
    // Frozen. Keep prev pinned to the current position so that if the slice is
    // woken later it starts from rest instead of inheriting a stale velocity
    // accumulated across however many frames it spent asleep.
    prev[i] = p;
    return;
  }

  let cur = p.xyz;
  var vel = (cur - prev[i].xyz) * P.damping;

  // Anti-explosion guard. Any single substep that tries to move a particle
  // further than this is a solver failure, not physics; clamping keeps a bad
  // contact local instead of launching the slice off the board.
  let speed = length(vel);
  if (speed > P.maxStep) { vel = vel * (P.maxStep / speed); }

  // Feed the sleep detector before damping is re-applied next step.
  atomicMax(&sliceState[sliceId], bitcast<u32>(dot(vel, vel)));

  var accel = vec3f(0.0, -P.gravity, 0.0);

  // A whisper of wind stops perfectly flat slices from settling into an
  // unnaturally symmetric shape. Cheap, and it reads as "air in the room".
  if (P.windAmp > 0.0) {
    let ph = f32(i) * 0.37 + P.time * 1.7;
    accel.x += sin(ph) * P.windAmp;
    accel.z += cos(ph * 0.7) * P.windAmp;
  }

  posOut[i] = vec4f(cur + vel + accel * P.dt * P.dt, invMass);
  prev[i]   = vec4f(cur, 0.0);
}
`;

/**
 * One Jacobi constraint iteration + collision projection.
 *
 * Reads `posIn`, writes `posOut`. The host ping-pongs the two bind groups and
 * always runs an even number of iterations so the result lands back in the
 * buffer the renderer is bound to.
 */
export const SOLVE_WGSL = /* wgsl */ `
${COMMON}

// Resolves a (row, col) within one slice to a global particle index, or -1 when
// the neighbour falls off the edge of the grid.
fn neighbour(sliceBase : u32, r : i32, c : i32) -> i32 {
  let g = i32(P.grid);
  if (r < 0 || c < 0 || r >= g || c >= g) { return -1; }
  return i32(sliceBase) + r * g + c;
}

// Pipeline-overridable. The self-collision scan visits up to 27 buckets, so
// running it on every constraint iteration is roughly an order of magnitude
// more work than the constraints themselves. The host compiles two variants
// and only enables it on the first iteration of each substep — contacts barely
// move between iterations, so the cheap variants inherit the same separation.
override enableSelf : bool = false;

/** Closest point on segment a→b to point s, as a parameter in [0,1]. */
fn closestT(a : vec3f, b : vec3f, s : vec3f) -> f32 {
  let e = b - a;
  let dd = dot(e, e);
  if (dd < 1e-12) { return 0.0; }
  return clamp(dot(s - a, e) / dd, 0.0, 1.0);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i = gid.x;
  if (i >= P.particles) { return; }

  // NB: 'self' is a WGSL reserved word, as are 'filter', 'set', 'type' and
  // 'shared'. Don't reintroduce them as local names.
  let me = posIn[i];
  let invMass = me.w;
  var p = me.xyz;

  if (invMass == 0.0) {
    posOut[i] = me;
    return;
  }

  let perSlice  = P.grid * P.grid;
  let sliceBase = (i / perSlice) * perSlice;
  let sliceId   = i / perSlice;
  let local     = i % perSlice;
  let r         = i32(local / P.grid);
  let c         = i32(local % P.grid);

  // A sleeping slice still acts as a collider for everything else — other
  // threads read posIn freely — it just stops being integrated itself.
  if (asleep(sliceId)) {
    posOut[i] = me;
    return;
  }

  var delta = vec3f(0.0);
  var count = 0.0;

  // --- distance constraints, gathered ------------------------------------
  // Each incident constraint contributes the half of the correction that this
  // particle is responsible for; the neighbour's own thread applies the other.
  for (var k = 0u; k < 12u; k = k + 1u) {
    var dr = 0; var dc = 0; var rest = 0.0; var stiff = 0.0;

    switch k {
      // structural — the weave itself
      case 0u:  { dr = -1; dc =  0; rest = P.spacing;         stiff = P.kStruct; }
      case 1u:  { dr =  1; dc =  0; rest = P.spacing;         stiff = P.kStruct; }
      case 2u:  { dr =  0; dc = -1; rest = P.spacing;         stiff = P.kStruct; }
      case 3u:  { dr =  0; dc =  1; rest = P.spacing;         stiff = P.kStruct; }
      // shear — resists in-plane racking
      case 4u:  { dr = -1; dc = -1; rest = P.spacing * SQRT2; stiff = P.kShear; }
      case 5u:  { dr = -1; dc =  1; rest = P.spacing * SQRT2; stiff = P.kShear; }
      case 6u:  { dr =  1; dc = -1; rest = P.spacing * SQRT2; stiff = P.kShear; }
      case 7u:  { dr =  1; dc =  1; rest = P.spacing * SQRT2; stiff = P.kShear; }
      // bend — the "floppiness" dial. Low values let edges curl and fold.
      case 8u:  { dr = -2; dc =  0; rest = P.spacing * 2.0;   stiff = P.kBend; }
      case 9u:  { dr =  2; dc =  0; rest = P.spacing * 2.0;   stiff = P.kBend; }
      case 10u: { dr =  0; dc = -2; rest = P.spacing * 2.0;   stiff = P.kBend; }
      default:  { dr =  0; dc =  2; rest = P.spacing * 2.0;   stiff = P.kBend; }
    }

    let j = neighbour(sliceBase, r + dr, c + dc);
    if (j < 0) { continue; }

    let q   = posIn[u32(j)];
    let d   = p - q.xyz;
    let len = length(d);
    if (len < 1e-6) { continue; }

    // Weight the correction by the mass ratio so pinned neighbours act as
    // anchors rather than absorbing half of every correction.
    let wSum = invMass + q.w;
    if (wSum < 1e-6) { continue; }
    let share = invMass / wSum;

    delta += -stiff * share * (len - rest) * (d / len);
    // Weight the average by stiffness, not by raw constraint count. Otherwise
    // the eight near-zero bend constraints dilute the structural corrections
    // and the slice stretches like rubber.
    count += stiff;
  }

  if (count > 1e-6) {
    p += delta * (P.relax / count);
  }

  // --- slice vs. slice ----------------------------------------------------
  // Without this, stacking slices simply pass through one another. Same-slice
  // near neighbours are skipped: they're already governed by the distance
  // constraints above, and repelling them would fight the weave.
  if (enableSelf && P.selfStiff > 0.0) {
    let minSep = P.sliceSep;
    let base = cellOf(p);
    var push = vec3f(0.0);

    for (var oz = -1; oz <= 1; oz = oz + 1) {
      for (var oy = -1; oy <= 1; oy = oy + 1) {
        for (var ox = -1; ox <= 1; ox = ox + 1) {
          let h = hashCell(base + vec3i(ox, oy, oz));
          let n = min(atomicLoad(&hashGrid[h]), P.maxPerCell);

          for (var k = 0u; k < n; k = k + 1u) {
            let j = atomicLoad(&hashGrid[bucketSlot(h, k)]);
            if (j == i) { continue; }

            if (j / perSlice == sliceId) {
              // Same slice: only collide particles that are far apart in the
              // weave, so a fold can rest on itself but the mesh can't fight.
              let jl = j % perSlice;
              let jr = i32(jl / P.grid);
              let jc = i32(jl % P.grid);
              if (abs(jr - r) <= 2 && abs(jc - c) <= 2) { continue; }
            }

            let d = p - posIn[j].xyz;
            let len = length(d);
            if (len < minSep && len > 1e-6) {
              push += (minSep - len) * 0.5 * (d / len);

              // A settled slice that gets landed on has to rejoin the
              // simulation, or new slices sink into a frozen surface.
              let other = j / perSlice;
              if (other != sliceId && (minSep - len) > minSep * 0.3) {
                atomicStore(&sliceState[P.sliceStride + other], 0u);
              }
            }
          }
        }
      }
    }

    p += push * P.selfStiff;
  }

  // --- collision projection ----------------------------------------------
  var hit = false;
  var contactNormal = vec3f(0.0);

  // Board: a genuine box, resolved along the axis of least penetration.
  //
  // Treating it as a half-space (snap y up whenever inside the footprint) meant
  // a particle that had fallen past the rim was teleported the full depth of
  // the board in one step. Verlet reads that jump as enormous velocity and
  // flings the slice into the air. Pushing out of the *nearest face* instead
  // sends an overhanging particle sideways off the edge, which is both stable
  // and what should physically happen.
  {
    let e = P.thickness;
    let lo = vec3f(-P.boardHalf, P.boardY - P.boardThick, -P.boardHalf) - e;
    let hi = vec3f( P.boardHalf, P.boardY,                P.boardHalf) + e;

    if (all(p > lo) && all(p < hi)) {
      let dHi = hi - p;   // distance out through each positive face
      let dLo = p - lo;   // distance out through each negative face

      var best = dHi.x;
      var n = vec3f(1.0, 0.0, 0.0);
      if (dLo.x < best) { best = dLo.x; n = vec3f(-1.0, 0.0, 0.0); }
      if (dHi.y < best) { best = dHi.y; n = vec3f(0.0, 1.0, 0.0); }
      if (dLo.y < best) { best = dLo.y; n = vec3f(0.0, -1.0, 0.0); }
      if (dHi.z < best) { best = dHi.z; n = vec3f(0.0, 0.0, 1.0); }
      if (dLo.z < best) { best = dLo.z; n = vec3f(0.0, 0.0, -1.0); }

      p += n * best;
      hit = true;
      contactNormal = n;
    }
  }

  let motionStart = prev[i].xyz;

  for (var o = 0u; o < P.obstacles; o = o + 1u) {
    let s = obst[o];
    let minDist = s.w + P.thickness;

    // (1) Point: this particle inside the sphere.
    var d = p - s.xyz;
    var len = length(d);
    if (len < minDist && len > 1e-6) {
      let n = d / len;
      p = s.xyz + n * minDist;
      hit = true;
      contactNormal = n;
    }

    // (2) Swept: did the particle pass straight through between substeps?
    // Cheap insurance against tunnelling when frame times get long, which is
    // exactly when many slices are simulating at once.
    let ts = closestT(motionStart, p, s.xyz);
    let cs = motionStart + (p - motionStart) * ts;
    let dsv = cs - s.xyz;
    let dsl = length(dsv);
    if (dsl < minDist && dsl > 1e-6) {
      let n = dsv / dsl;
      p = s.xyz + n * minDist;
      hit = true;
      contactNormal = n;
    }

    // (3) Edge: the obstacle sitting in the gap *between* two particles.
    // This is what decouples collision fidelity from grid resolution.
    for (var e = 0u; e < 4u; e = e + 1u) {
      var dr = 0; var dc = 0;
      switch e {
        case 0u: { dr = -1; dc =  0; }
        case 1u: { dr =  1; dc =  0; }
        case 2u: { dr =  0; dc = -1; }
        default: { dr =  0; dc =  1; }
      }

      let j = neighbour(sliceBase, r + dr, c + dc);
      if (j < 0) { continue; }

      let q = posIn[u32(j)].xyz;
      let t = closestT(p, q, s.xyz);
      let cp = p + (q - p) * t;
      let ed = cp - s.xyz;
      let el = length(ed);
      if (el < minDist && el > 1e-6) {
        // Apply the correction weighted toward this particle's end of the
        // segment — the far end is corrected by its own thread.
        let n = ed / el;
        p += n * (minDist - el) * (1.0 - t);
        hit = true;
        contactNormal = n;
      }
    }
  }

  // Coulomb-ish friction: bleed off the tangential component of this particle's
  // velocity by pulling its previous position toward the current one. Without
  // this, slices slide off domed obstacles like they're buttered.
  if (hit && P.friction > 0.0) {
    let pv = prev[i].xyz;
    let vel = p - pv;
    let vn = dot(vel, contactNormal) * contactNormal;
    let vt = vel - vn;
    prev[i] = vec4f(p - (vn + vt * (1.0 - P.friction)), 0.0);
  }

  posOut[i] = vec4f(p, invMass);
}
`;

/**
 * Per-frame sleep bookkeeping, dispatched over slices rather than particles.
 *
 * A slice whose fastest particle stayed below `sleepEnergy` for `sleepFrames`
 * consecutive frames stops being simulated. This is what stops a stack of
 * slices shimmering forever: XPBD never reaches exact equilibrium, so without
 * an explicit sleep the residual jitter has no reason to ever stop.
 */
export const SLICE_TICK_WGSL = /* wgsl */ `
${COMMON}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let s = gid.x;
  if (s >= P.slices) { return; }

  let peak = bitcast<f32>(atomicLoad(&sliceState[s]));
  let counter = P.sliceStride + s;

  if (peak < P.sleepEnergy) {
    // Saturate rather than wrap; the counter only needs to reach sleepFrames.
    if (atomicLoad(&sliceState[counter]) < P.sleepFrames) {
      atomicAdd(&sliceState[counter], 1u);
    }
  } else {
    atomicStore(&sliceState[counter], 0u);
  }

  atomicStore(&sliceState[s], 0u);
}
`;

/**
 * Smooth per-vertex normals from central differences across the grid, so the
 * render pass gets shading without a CPU round-trip or per-face derivatives.
 */
export const NORMALS_WGSL = /* wgsl */ `
${COMMON}

// Clamped fetch — edge particles reuse themselves, giving a one-sided
// difference at the border rather than a wrapped or out-of-bounds read.
fn gridPos(sliceBase : u32, r : i32, c : i32) -> vec3f {
  let g = i32(P.grid);
  let rr = clamp(r, 0, g - 1);
  let cc = clamp(c, 0, g - 1);
  return posOut[sliceBase + u32(rr * g + cc)].xyz;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i = gid.x;
  if (i >= P.particles) { return; }

  let perSlice  = P.grid * P.grid;
  let sliceBase = (i / perSlice) * perSlice;
  let local     = i % perSlice;
  let r         = i32(local / P.grid);
  let c         = i32(local % P.grid);

  let dc = gridPos(sliceBase, r, c + 1) - gridPos(sliceBase, r, c - 1);
  let dr = gridPos(sliceBase, r + 1, c) - gridPos(sliceBase, r - 1, c);

  var n = cross(dr, dc);
  let l = length(n);
  // Degenerate when the patch is pinched flat; fall back to "up" rather than NaN.
  if (l < 1e-8) { n = vec3f(0.0, 1.0, 0.0); } else { n = n / l; }

  nrm[i] = vec4f(n, 0.0);
}
`;
