/**
 * Translucent overlay pass — drop indicators and ghost previews.
 *
 * Deliberately unlit. These are interface elements that happen to live in the
 * 3D scene, and shading them like food would make them read as objects on the
 * board rather than as guidance about where food is going to land.
 *
 * A fresnel rim gives them enough form to read as solid shapes at a glance
 * without pretending to be lit.
 */

export const OVERLAY_WGSL = /* wgsl */ `
struct Frame {
  viewProj      : mat4x4f,
  lightViewProj : mat4x4f,
  camPos        : vec4f,
  lightDir      : vec4f,
  lightColor    : vec4f,
  ambientSky    : vec4f,
  ambientGround : vec4f,
  params        : vec4f,
};

struct Instance {
  model    : mat4x4f,
  albedo   : vec4f,   // rgb tint, a unused here
  material : vec4f,   // unused here
  extra    : vec4f,   // x alpha, y rim strength, zw spare
};

@group(0) @binding(0) var<uniform> F : Frame;
@group(0) @binding(1) var shadowMap     : texture_depth_2d;
@group(0) @binding(2) var shadowSampler : sampler_comparison;

@group(1) @binding(0) var<storage, read> instances : array<Instance>;

struct VSOut {
  @builtin(position) clip   : vec4f,
  @location(0)       world  : vec3f,
  @location(1)       normal : vec3f,
  @location(2)       tint   : vec4f,
  @location(3)       extra  : vec4f,
};

@vertex
fn vs(
  @builtin(instance_index) ii : u32,
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
) -> VSOut {
  let inst = instances[ii];
  let world = inst.model * vec4f(position, 1.0);

  var o : VSOut;
  o.clip = F.viewProj * world;
  o.world = world.xyz;
  o.normal = normalize((inst.model * vec4f(normal, 0.0)).xyz);
  o.tint = inst.albedo;
  o.extra = inst.extra;
  return o;
}

@fragment
fn fs(in : VSOut, @builtin(front_facing) front : bool) -> @location(0) vec4f {
  var n = normalize(in.normal);
  if (!front) { n = -n; }

  let v = normalize(F.camPos.xyz - in.world);

  // Fresnel: edges facing away from the camera brighten, which outlines the
  // silhouette. Without it a flat-shaded translucent ghost is an ambiguous blob.
  let facing = 1.0 - abs(dot(n, v));
  let rim = pow(clamp(facing, 0.0, 1.0), 2.0) * in.extra.y;

  let colour = in.tint.rgb + vec3f(rim);

  // Rim also lifts opacity, so the outline stays legible over a busy board
  // while the interior stays see-through.
  let alpha = clamp(in.extra.x + rim * 0.5, 0.0, 1.0);

  // Premultiplied alpha: the blend state expects colour already scaled, which
  // avoids dark fringing where the overlay meets what's behind it.
  return vec4f(colour * alpha, alpha);
}
`;
