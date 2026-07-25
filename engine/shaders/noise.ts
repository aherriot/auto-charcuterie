/**
 * WGSL procedural noise library.
 *
 * Every texture in this project is generated here — there are no image assets.
 * Sampling is in object space, so a food's pattern stays locked to the food as
 * it tumbles rather than swimming across it in world space.
 */

export const NOISE_WGSL = /* wgsl */ `
// --- hashing ---------------------------------------------------------------

fn hash3(p : vec3f) -> f32 {
  // Integer-free hash. Sufficient scatter for texture work and considerably
  // cheaper than a permutation table.
  var q = fract(p * 0.3183099 + vec3f(0.1, 0.2, 0.3));
  q += dot(q, q.yzx + 19.19);
  return fract((q.x + q.y) * q.z);
}

fn hash33(p : vec3f) -> vec3f {
  var q = vec3f(
    dot(p, vec3f(127.1, 311.7, 74.7)),
    dot(p, vec3f(269.5, 183.3, 246.1)),
    dot(p, vec3f(113.5, 271.9, 124.6))
  );
  return fract(sin(q) * 43758.5453);
}

// --- value noise -----------------------------------------------------------

fn valueNoise(p : vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  // Quintic smoothstep: continuous second derivative, so fBm built on it has
  // no visible grid creases under specular light.
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  let n000 = hash3(i + vec3f(0.0, 0.0, 0.0));
  let n100 = hash3(i + vec3f(1.0, 0.0, 0.0));
  let n010 = hash3(i + vec3f(0.0, 1.0, 0.0));
  let n110 = hash3(i + vec3f(1.0, 1.0, 0.0));
  let n001 = hash3(i + vec3f(0.0, 0.0, 1.0));
  let n101 = hash3(i + vec3f(1.0, 0.0, 1.0));
  let n011 = hash3(i + vec3f(0.0, 1.0, 1.0));
  let n111 = hash3(i + vec3f(1.0, 1.0, 1.0));

  let x00 = mix(n000, n100, u.x);
  let x10 = mix(n010, n110, u.x);
  let x01 = mix(n001, n101, u.x);
  let x11 = mix(n011, n111, u.x);

  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}

/** Fractional Brownian motion — the general-purpose "organic variation" dial. */
fn fbm(p : vec3f, octaves : i32) -> f32 {
  var sum = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  var norm = 0.0;

  for (var i = 0; i < octaves; i = i + 1) {
    sum += valueNoise(p * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;   // Slightly off 2.0 so octaves don't align into a lattice.
  }

  return sum / max(norm, 1e-5);
}

/** Ridged fBm — sharper, vein-like structures. Used for blue cheese marbling. */
fn ridged(p : vec3f, octaves : i32) -> f32 {
  var sum = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  var norm = 0.0;

  for (var i = 0; i < octaves; i = i + 1) {
    let n = 1.0 - abs(valueNoise(p * freq) * 2.0 - 1.0);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }

  return sum / max(norm, 1e-5);
}

// --- Voronoi ---------------------------------------------------------------

/**
 * Returns the two nearest feature-point distances.
 *
 * F1 alone gives cell interiors (cheese eyes, olive mottling); F2 - F1 gives the
 * boundaries between cells, which is what draws honeycomb walls and the crazed
 * edges of a cracker.
 */
fn voronoi(p : vec3f) -> vec2f {
  let base = floor(p);
  var f1 = 8.0;
  var f2 = 8.0;

  for (var k = -1; k <= 1; k = k + 1) {
    for (var j = -1; j <= 1; j = j + 1) {
      for (var i = -1; i <= 1; i = i + 1) {
        let cell = base + vec3f(f32(i), f32(j), f32(k));
        let point = cell + hash33(cell);
        let d = length(point - p);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }

  return vec2f(f1, f2);
}

// --- patterns --------------------------------------------------------------

/**
 * Wood grain: concentric rings around the long axis, warped by fBm so they
 * wander like real growth rings, plus a fine pore texture along the grain.
 */
fn woodGrain(p : vec3f, ringScale : f32) -> f32 {
  // Rings run along X, so the board's grain follows its length.
  let warped = p + vec3f(0.0, fbm(p * 1.7, 3) * 0.35, fbm(p * 2.1 + 5.0, 3) * 0.35);
  let radius = length(warped.yz) * ringScale;

  let rings = fract(radius + fbm(p * 0.6, 2) * 0.7);
  // Sharpen one side of each ring: latewood is a hard boundary, earlywood fades.
  let ring = smoothstep(0.0, 0.35, rings) * smoothstep(1.0, 0.62, rings);

  let pores = fbm(vec3f(p.x * 22.0, p.y * 3.0, p.z * 3.0), 2);
  return clamp(ring * 0.75 + pores * 0.25, 0.0, 1.0);
}

/**
 * Marbled fat through cured meat. Large-scale fBm decides where fat pools; a
 * threshold turns it into distinct specks rather than a smooth gradient, which
 * is what separates salami from a beige blob.
 */
fn marbling(p : vec3f, scale : f32, coverage : f32) -> f32 {
  let n = fbm(p * scale, 4);
  let speck = fbm(p * scale * 3.7 + 11.0, 3);
  let combined = n * 0.65 + speck * 0.35;
  return smoothstep(coverage - 0.06, coverage + 0.06, combined);
}
`;
