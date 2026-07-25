/**
 * Fullscreen post pass: HDR scene → tonemap → vignette → swapchain.
 *
 * Drawn as a single oversized triangle rather than a quad. It covers the screen
 * with three vertices instead of six, needs no vertex or index buffer, and
 * avoids the diagonal seam where two triangles meet.
 */

export const TONEMAP_WGSL = /* wgsl */ `
struct Post {
  // x exposure  y vignette strength  z saturation  w spare
  params : vec4f,
};

@group(0) @binding(0) var<uniform> P : Post;
@group(0) @binding(1) var hdr     : texture_2d<f32>;
@group(0) @binding(2) var hdrSamp : sampler;

struct VSOut {
  @builtin(position) clip : vec4f,
  @location(0)       uv   : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  // Vertices at (-1,-1), (3,-1), (-1,3): the triangle overhangs the viewport on
  // two sides and is clipped to exactly the screen.
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  var o : VSOut;
  o.clip = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  // Flip v: clip space is y-up, textures are y-down.
  o.uv = vec2f(uv.x, 1.0 - uv.y);
  return o;
}

/**
 * ACES filmic approximation (Narkowicz). Rolls highlights off smoothly instead
 * of clipping them, which matters because the key light's specular on olives
 * and glazed cheese pushes well above 1.0.
 */
fn acesFilm(x : vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  var color = textureSample(hdr, hdrSamp, in.uv).rgb * P.params.x;

  color = acesFilm(color);

  // Gentle saturation lift — food should look appetising, and ACES desaturates
  // the midtones a little on the way through.
  let luma = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  color = mix(vec3f(luma), color, P.params.z);

  // Vignette, computed on centred coordinates so it stays circular at any aspect.
  let centred = in.uv - vec2f(0.5);
  let vig = 1.0 - P.params.y * dot(centred, centred);
  color *= clamp(vig, 0.0, 1.0);

  // Encode to sRGB by hand. getPreferredCanvasFormat() returns a plain unorm
  // format (bgra8unorm), not the -srgb variant, so nothing applies the transfer
  // function for us. Skipping this is what makes a render look flat and murky.
  color = pow(color, vec3f(1.0 / 2.2));

  return vec4f(color, 1.0);
}
`;
