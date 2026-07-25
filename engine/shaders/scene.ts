/**
 * Forward PBR pass.
 *
 * Cook-Torrance specular (GGX + Smith + Schlick) with Lambert diffuse, one
 * directional key light, and a hemispheric ambient term standing in for a sky.
 * Deliberately no IBL, SSAO or bloom — the fidelity ceiling is fixed in
 * docs/01-vision-and-decisions.md to stop renderer scope creep.
 */

import { MATERIALS_WGSL } from "./materials";
import { NOISE_WGSL } from "./noise";

/** Matches `Frame` below and `FRAME_BYTES` in the renderer. */
export const FRAME_BYTES = 224;

/**
 * Matches `Instance` below: mat4 model + vec4 albedo/roughness + vec4 material
 * + vec4 extra.
 */
export const INSTANCE_BYTES = 112;

export const SCENE_WGSL = /* wgsl */ `
${NOISE_WGSL}
${MATERIALS_WGSL}

struct Frame {
  viewProj      : mat4x4f,
  lightViewProj : mat4x4f,
  camPos        : vec4f,
  lightDir      : vec4f,   // xyz points *toward* the light; w is intensity
  lightColor    : vec4f,
  ambientSky    : vec4f,
  ambientGround : vec4f,
  params        : vec4f,   // x shadow texel (uv)  y depth bias  z exposure  w normal offset (world)
};

struct Instance {
  model    : mat4x4f,
  albedo   : vec4f,   // rgb base tint, a base roughness
  material : vec4f,   // x metallic, y ambient occlusion, z material id, w seed
  extra    : vec4f,   // x alpha, y rim strength, zw spare
};

@group(0) @binding(0) var<uniform> F : Frame;
@group(0) @binding(1) var shadowMap     : texture_depth_2d;
@group(0) @binding(2) var shadowSampler : sampler_comparison;

@group(1) @binding(0) var<storage, read> instances : array<Instance>;

struct VSOut {
  @builtin(position) clip      : vec4f,
  @location(0)       world     : vec3f,
  @location(1)       normal    : vec3f,
  @location(2)       albedo    : vec4f,
  @location(3)       material  : vec4f,
  // Materials sample in object space so a pattern stays locked to its food as
  // it tumbles, instead of swimming across the surface in world space.
  @location(4)       objectPos : vec3f,
  // Object-space normal too: several materials need to know which *face* they
  // are on — brie's rind wraps the wheel's outer surfaces but not its cut
  // faces, and no function of position alone can tell those apart.
  @location(5)       objectNrm : vec3f,
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
  // Scales are uniform throughout the scene, so the upper 3×3 rotates normals
  // correctly without an inverse-transpose.
  o.normal = normalize((inst.model * vec4f(normal, 0.0)).xyz);
  o.albedo = inst.albedo;
  o.material = inst.material;
  o.objectPos = position;
  o.objectNrm = normal;
  return o;
}

// --- BRDF ------------------------------------------------------------------

fn distributionGGX(ndh : f32, rough : f32) -> f32 {
  let a  = rough * rough;
  let a2 = a * a;
  let d  = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / max(3.14159265 * d * d, 1e-5);
}

fn geometrySmith(ndv : f32, ndl : f32, rough : f32) -> f32 {
  // Schlick-GGX with the direct-lighting remap of k.
  let r = rough + 1.0;
  let k = (r * r) / 8.0;
  let gv = ndv / (ndv * (1.0 - k) + k);
  let gl = ndl / (ndl * (1.0 - k) + k);
  return gv * gl;
}

fn fresnelSchlick(cosTheta : f32, f0 : vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// --- Shadows ---------------------------------------------------------------

fn shadowFactor(world : vec3f, n : vec3f, ndl : f32) -> f32 {
  // Normal-offset shadows: move the *lookup position* along the surface normal
  // rather than pushing the comparison depth away. Depth bias large enough to
  // stop acne also detaches the shadow from the object that casts it
  // ("peter-panning"); offsetting along the normal avoids acne without moving
  // the contact point. Scaled up at grazing angles, where the depth map's
  // finite resolution covers the most world space.
  let offset = F.params.w * (1.0 + 3.0 * (1.0 - ndl));
  let lightClip = F.lightViewProj * vec4f(world + n * offset, 1.0);
  let ndc = lightClip.xyz / lightClip.w;

  // Outside the shadow frustum: fully lit rather than fully dark, so geometry
  // beyond the board doesn't fall into a black slab.
  if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0 || ndc.z > 1.0) {
    return 1.0;
  }

  // Clip space is [-1,1] in xy but [0,1] in z for WebGPU, and y is flipped
  // relative to texture coordinates.
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);

  // Small residual depth bias only. The normal offset above does the heavy
  // lifting, so this stays tiny and doesn't visibly shift the contact edge.
  let depth = ndc.z - F.params.y;

  let texel = F.params.x;
  var sum = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let offset = vec2f(f32(x), f32(y)) * texel;
      // ...CompareLevel, not ...Compare. The latter computes an implicit LOD and
      // so may only be called from uniform control flow — which the frustum
      // early-out above breaks. Explicit level 0 is what shadow maps want anyway;
      // there are no mips to select between.
      sum += textureSampleCompareLevel(shadowMap, shadowSampler, uv + offset, depth);
    }
  }
  return sum / 9.0;
}

// --- Fragment --------------------------------------------------------------

@fragment
fn fs(in : VSOut, @builtin(front_facing) front : bool) -> @location(0) vec4f {
  var n = normalize(in.normal);
  if (!front) { n = -n; }

  let v = normalize(F.camPos.xyz - in.world);
  let l = normalize(F.lightDir.xyz);
  let h = normalize(v + l);

  let ndl = max(dot(n, l), 0.0);
  let ndv = max(dot(n, v), 1e-4);
  let ndh = max(dot(n, h), 0.0);

  let surface = surfaceFor(
    u32(in.material.z),
    in.objectPos,
    normalize(in.objectNrm),
    in.albedo.rgb,
    in.albedo.a,
    in.material.w,
  );
  let albedo = surface.albedo;
  let rough = surface.rough;
  let metallic = in.material.x;
  let ao = in.material.y;

  // Dielectrics reflect ~4% at normal incidence; metals tint their reflection
  // with the albedo and have no diffuse lobe.
  let f0 = mix(vec3f(0.04), albedo, metallic);

  let ndf = distributionGGX(ndh, rough);
  let g   = geometrySmith(ndv, ndl, rough);
  let f   = fresnelSchlick(max(dot(h, v), 0.0), f0);

  let specular = (ndf * g * f) / max(4.0 * ndv * ndl, 1e-4);
  let kd = (vec3f(1.0) - f) * (1.0 - metallic);
  let diffuse = kd * albedo / 3.14159265;

  let shadow = shadowFactor(in.world, n, ndl);
  let radiance = F.lightColor.rgb * F.lightDir.w;
  let direct = (diffuse + specular) * radiance * ndl * shadow;

  // Hemispheric ambient: sky above, bounced warmth from below. Cheap stand-in
  // for IBL that still gives shaded undersides some colour.
  let hemi = mix(F.ambientGround.rgb, F.ambientSky.rgb, n.y * 0.5 + 0.5);
  let ambient = albedo * hemi * ao;

  return vec4f(direct + ambient, 1.0);
}
`;

/**
 * Depth-only pass from the light's point of view. Shares the instance buffer
 * with the forward pass, so nothing has to be uploaded twice.
 */
export const SHADOW_WGSL = /* wgsl */ `
struct Light {
  viewProj : mat4x4f,
};

struct Instance {
  model    : mat4x4f,
  albedo   : vec4f,
  material : vec4f,
  extra    : vec4f,
};

@group(0) @binding(0) var<uniform> L : Light;
@group(1) @binding(0) var<storage, read> instances : array<Instance>;

@vertex
fn vs(
  @builtin(instance_index) ii : u32,
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
) -> @builtin(position) vec4f {
  return L.viewProj * instances[ii].model * vec4f(position, 1.0);
}
`;
