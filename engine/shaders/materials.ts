/**
 * Procedural material dispatch.
 *
 * Each material is a function of object-space position and normal returning
 * albedo and roughness. The instance's `albedo` acts as the base tint, so one
 * function can serve several foods — `MAT_CURED_MEAT` covers salami and
 * soppressata — with only the tint and a per-instance seed differing.
 *
 * The normal matters as much as the position: brie's rind wraps the wheel's
 * outer surfaces but not its cut faces, and almond skin covers the domed face
 * but not the split one. Position alone can't distinguish those.
 *
 * Keep these IDs in sync with `MaterialId` in game/catalog.ts.
 */

export const MAT = {
  PLAIN: 0,
  WOOD: 1,
  CURED_MEAT: 2,
  CHEESE_EYED: 3,
  CHEESE_BLUE: 4,
  CHEESE_RIND: 5,
  CHEESE_HARD: 6,
  OLIVE: 7,
  NUT: 8,
  CRACKER: 9,
  BREAD: 10,
  GRAPE: 11,
  FIG: 12,
  HONEYCOMB: 13,
  PICKLE: 14,
  NUT_SKIN: 15,
} as const;

export type MaterialIdValue = (typeof MAT)[keyof typeof MAT];

export const MATERIALS_WGSL = /* wgsl */ `
struct Surface {
  albedo : vec3f,
  rough  : f32,
};

fn surfaceFor(
  id : u32,
  p : vec3f,
  n : vec3f,
  tint : vec3f,
  baseRough : f32,
  seed : f32,
) -> Surface {
  var s : Surface;
  s.albedo = tint;
  s.rough = baseRough;

  let sp = p + vec3f(seed * 13.7, seed * 7.3, seed * 21.1);

  switch id {
    // Cutting board. Rings run along the board's length.
    case ${MAT.WOOD}u: {
      let g = woodGrain(p * vec3f(1.0, 3.4, 3.4), 2.6);
      s.albedo = mix(tint * 0.62, tint * 1.22, g);
      s.rough = baseRough - g * 0.14;
    }

    // Salami, soppressata. Lean paste with distinct fat specks.
    case ${MAT.CURED_MEAT}u: {
      let fat = marbling(sp, 42.0, 0.56);
      let coarse = fbm(sp * 14.0, 3);
      let paste = mix(tint * 0.82, tint * 1.1, coarse);
      s.albedo = mix(paste, vec3f(0.95, 0.92, 0.87), fat * 0.85);
      // Fat catches light far more than the lean does — this contrast is most
      // of what makes it read as cured meat rather than painted plastic.
      s.rough = mix(baseRough, 0.22, fat);
    }

    // Gouda. Voronoi cells punched as eyes.
    case ${MAT.CHEESE_EYED}u: {
      let v = voronoi(sp * 13.0);
      let eye = 1.0 - smoothstep(0.06, 0.17, v.x);
      let body = fbm(sp * 9.0, 3);
      s.albedo = mix(tint * (0.92 + body * 0.16), tint * 0.34, eye);
      s.rough = mix(baseRough, 0.85, eye);
    }

    // Stilton. Blue-green veining, not grey: the mould is Penicillium roqueforti
    // and reads distinctly teal against the pale paste.
    case ${MAT.CHEESE_BLUE}u: {
      let vein = ridged(sp * 15.0, 4);
      let mould = smoothstep(0.48, 0.72, vein);
      let halo = smoothstep(0.38, 0.62, vein);
      let crumb = fbm(sp * 30.0, 2);

      let paste = tint * (0.94 + crumb * 0.12);
      let veinColor = vec3f(0.13, 0.30, 0.44);
      // A wider, softer bleed around each vein — real blue diffuses into the
      // curd rather than stopping at a hard edge.
      let bled = mix(paste, vec3f(0.42, 0.52, 0.55), halo * 0.45);
      s.albedo = mix(bled, veinColor, mould * 0.92);
      s.rough = mix(baseRough, 0.92, mould);
    }

    // Brie. Bloomy white rind on the wheel's outer surfaces, warm beige paste
    // on the cut faces. Keyed off the normal: the flat top and bottom of the
    // wheel and its curved edge are rind; the two straight cuts are not.
    case ${MAT.CHEESE_RIND}u: {
      let bloom = fbm(sp * 26.0, 3);
      let radial = length(p.xz);

      let capFace = smoothstep(0.55, 0.85, abs(n.y));
      let outerEdge = smoothstep(0.19, 0.245, radial) * (1.0 - capFace);
      let rind = clamp(capFace + outerEdge, 0.0, 1.0);

      // Paste is a warm, buttery beige — noticeably yellower than the rind.
      let paste = mix(vec3f(0.94, 0.86, 0.60), vec3f(0.99, 0.94, 0.74), bloom);
      let crust = mix(vec3f(0.95, 0.94, 0.90), vec3f(0.84, 0.82, 0.74), bloom);
      s.albedo = mix(paste, crust, rind);
      // Cut paste is faintly moist; the bloomy rind is completely matte.
      s.rough = mix(baseRough * 0.8, 0.97, rind);
    }

    // Cheddar. Dense and near-uniform; only a faint curd structure.
    case ${MAT.CHEESE_HARD}u: {
      let curd = fbm(sp * 34.0, 3);
      let crack = smoothstep(0.62, 0.78, fbm(sp * 60.0, 2));
      s.albedo = tint * (0.9 + curd * 0.18) - crack * 0.05;
      s.rough = baseRough + curd * 0.08;
    }

    // Castelvetrano olives. Waxy brine-wet skin with a subtle mottle.
    case ${MAT.OLIVE}u: {
      let mottle = fbm(sp * 20.0, 3);
      let v = voronoi(sp * 9.0);
      let blemish = smoothstep(0.3, 0.05, v.x) * 0.12;
      s.albedo = mix(tint * 0.86, tint * 1.14, mottle) * (1.0 - blemish);
      s.rough = baseRough - mottle * 0.1;
    }

    // Cashews. Smooth, buttery, no skin — colour carries it.
    case ${MAT.NUT}u: {
      let grain = fbm(vec3f(sp.x * 40.0, sp.y * 12.0, sp.z * 12.0), 3);
      let roast = smoothstep(0.55, 0.78, fbm(sp * 22.0, 3));
      s.albedo = mix(tint * 0.88, tint * 1.1, grain) - roast * 0.11;
      s.rough = baseRough - grain * 0.05;
    }

    // Almonds with the skin on.
    //
    // The defining feature is directional: fine ridges and grooves running the
    // length of the nut, tip to base. Isotropic noise reads as generic stone no
    // matter how brown it is. So the sample is stretched hard — nearly constant
    // along the long axis (X), varying fast around the circumference — which makes
    // the pattern streak lengthwise the way the real skin does.
    case ${MAT.NUT_SKIN}u: {
      let along = vec3f(p.x * 5.0, p.y * 44.0, p.z * 44.0)
                + vec3f(seed * 3.1, seed * 9.7, seed * 5.3);

      let groove = ridged(along, 4);
      let fine   = fbm(along * 2.4, 2);
      let blotch = fbm(sp * 9.0, 3);

      // Raised fibre catches light; the valleys between stay dark.
      let ridge = smoothstep(0.32, 0.86, groove);

      let dark  = vec3f(0.28, 0.155, 0.085);
      let mid   = vec3f(0.52, 0.32, 0.175);
      let light = vec3f(0.76, 0.55, 0.35);

      var c = mix(dark, mid, blotch);
      c = mix(c, light, ridge * 0.72);
      c = mix(c, c * 0.84, fine * 0.35);

      // Scattered pores — skin-on almonds are never a clean gradient.
      let pore = smoothstep(0.70, 0.86, fbm(along * 3.6 + 31.0, 2));
      c -= pore * 0.11;

      // The pointed end is where the skin gathers and darkens.
      let tip = smoothstep(0.0, -0.038, p.x);
      c = mix(c, c * 0.66, tip * 0.7);

      s.albedo = mix(c, tint, 0.1);
      // Dry, papery, entirely matte — any sheen here reads as plastic.
      s.rough = clamp(0.82 - ridge * 0.1, 0.55, 1.0);
    }

    // Water crackers. Pale and matte, with a regular grid of docking holes,
    // scattered bake blisters, and visible bran flecks.
    case ${MAT.CRACKER}u: {
      let toast = fbm(sp * 13.0, 4);
      let blister = smoothstep(0.60, 0.76, fbm(sp * 26.0, 3));
      let bran = smoothstep(0.68, 0.80, fbm(sp * 90.0, 2));

      // Docking holes are punched mechanically, so they sit on a lattice
      // rather than scattering — that regularity is a strong cracker cue.
      let cell = fract(p.xz * 9.0) - 0.5;
      let hole = 1.0 - smoothstep(0.06, 0.13, length(cell));

      var c = mix(tint * 0.78, tint * 1.06, toast);
      c = mix(c, vec3f(0.55, 0.38, 0.20), blister * 0.55);   // toasted patches
      c = mix(c, vec3f(0.42, 0.33, 0.22), bran * 0.5);       // bran specks
      c = mix(c, c * 0.42, hole);                            // recessed docking
      s.albedo = c;
      s.rough = clamp(baseRough + blister * 0.1 - hole * 0.15, 0.3, 1.0);
    }

    // Breadsticks. Blistered crust with darker bake spots.
    case ${MAT.BREAD}u: {
      let crust = fbm(sp * 19.0, 4);
      let blister = smoothstep(0.58, 0.75, crust);
      s.albedo = mix(tint * 0.82, tint * 1.15, crust) - blister * 0.14;
      s.rough = baseRough - blister * 0.12;
    }

    // Grapes. The bloom is the whole trick — a fine waxy dust that scatters
    // light and kills the mirror highlight. Without it a grape is a marble.
    case ${MAT.GRAPE}u: {
      let blotch = fbm(sp * 11.0, 3);
      let fine = fbm(sp * 48.0, 2);
      // Bloom pools on the upper surface and rubs off where fruit touches.
      let bloom = clamp(blotch * 0.7 + fine * 0.3, 0.0, 1.0)
                * smoothstep(-0.5, 1.0, n.y) * 0.85;

      let skin = mix(tint * 0.72, tint * 1.12, blotch);
      let dusted = mix(skin, skin * 0.55 + vec3f(0.42, 0.40, 0.46), bloom);
      s.albedo = dusted;
      // Heavily bloomed areas are almost chalk; bare skin stays glossy. The
      // *variation* is what stops it reading as polished stone.
      s.rough = mix(baseRough, 0.86, bloom);
    }

    // Fig halves. Pale skin, dense seeded interior radiating from the centre.
    case ${MAT.FIG}u: {
      let r = length(p.xz);
      let seeds = voronoi(sp * 40.0);
      let seedMask = 1.0 - smoothstep(0.04, 0.14, seeds.x);
      let flesh = mix(vec3f(0.78, 0.32, 0.36), vec3f(0.55, 0.16, 0.24), fbm(sp * 12.0, 3));
      let skin = tint * 0.8;
      // The cut face points down in object space; only it shows the interior.
      let cut = smoothstep(-0.5, -0.9, n.y);
      let interior = cut * (1.0 - smoothstep(0.05, 0.082, r));
      s.albedo = mix(skin, mix(flesh, vec3f(0.94, 0.88, 0.72), seedMask * 0.8), interior);
      s.rough = mix(baseRough, 0.34, interior);
    }

    // Honeycomb. Voronoi boundaries drawn as wax walls between filled cells.
    case ${MAT.HONEYCOMB}u: {
      let v = voronoi(sp * 22.0);
      let wall = smoothstep(0.06, 0.0, v.y - v.x);
      s.albedo = mix(tint, vec3f(0.98, 0.86, 0.55), wall);
      s.rough = mix(0.12, 0.7, wall);
    }

    // Cornichons. Knobbly warty skin with pale lengthwise stripes.
    case ${MAT.PICKLE}u: {
      let bumps = voronoi(sp * 42.0);
      let wart = smoothstep(0.24, 0.04, bumps.x);
      // Stripes run the length of the pickle, which lies along X.
      let stripe = smoothstep(0.45, 0.62, fbm(vec3f(sp.x * 3.0, sp.y * 26.0, sp.z * 26.0), 3));

      var c = mix(tint * 0.72, tint * 1.18, stripe);
      // Warts catch the brine and read lighter and glossier than the skin.
      c = mix(c, c * 1.5 + vec3f(0.04, 0.06, 0.02), wart * 0.7);
      s.albedo = c;
      s.rough = clamp(baseRough - wart * 0.14, 0.12, 1.0);
    }

    default: {
      // MAT_PLAIN — flat tint, used by placeholders and the tray backdrop.
    }
  }

  s.rough = clamp(s.rough, 0.045, 1.0);
  return s;
}
`;
