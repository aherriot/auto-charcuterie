/**
 * Validates that every procedural mesh is wound consistently.
 *
 * A mesh wound backwards renders inside-out under `cullMode: "back"` — the
 * exterior disappears and you see the interior. That happened to `roundedBox`
 * and was only caught by eye. Since Phase 2 adds sixteen more generators, it's
 * worth asserting instead of noticing.
 *
 * Run via `npm run check`. Node runs this .ts file directly.
 */

import {
  bezierPath,
  checkWinding,
  disc,
  loftedPolygon,
  polygonOutline,
  roundedBox,
  sphere,
  superellipsoid,
  sweptTube,
  wedge,
  type MeshData,
} from "../engine/mesh/primitives";
import { buildFoodMesh } from "../engine/mesh/foods";
import { CATALOG } from "../game/catalog";

const cases: Array<[string, MeshData]> = [
  ["roundedBox (board)", roundedBox(1.1, 0.06, 0.79, 0.05, 5)],
  ["roundedBox (cube-ish)", roundedBox(0.16, 0.075, 0.11, 0.03, 3)],
  ["roundedBox (tiny radius)", roundedBox(0.5, 0.5, 0.5, 0.01, 2)],
  ["sphere", sphere(0.5)],
  ["superellipsoid n=2.3 (olive)", superellipsoid(0.055, 0.072, 0.055, 2.3, 20, 14)],
  ["superellipsoid n=4 (boxy)", superellipsoid(0.4, 0.4, 0.4, 4, 20, 14)],
  ["superellipsoid n=1.2 (pinched)", superellipsoid(0.4, 0.4, 0.4, 1.2, 20, 14)],
  ["disc (salami round)", disc(0.14, 0.02, 32, 0.04, 1)],
  ["wedge (brie)", wedge(0.3, 0.09)],
  ["loftedPolygon (cracker)", loftedPolygon(polygonOutline(16, 0.12, 0.03), 0.014)],
  ["loftedPolygon (hex)", loftedPolygon(polygonOutline(6, 0.2), 0.05)],
  [
    "sweptTube (straight)",
    sweptTube(
      [
        [0, 0, 0],
        [0, 0.4, 0],
        [0, 0.8, 0],
      ],
      () => 0.04,
      10,
    ),
  ],
  [
    "sweptTube (cashew arc)",
    sweptTube(
      bezierPath([-0.09, 0, 0], [-0.05, 0.07, 0], [0.05, 0.07, 0], [0.09, 0, 0], 14),
      (t) => 0.032 * (0.65 + Math.sin(t * Math.PI) * 0.5),
      12,
    ),
  ],
  [
    "sweptTube (elliptical profile)",
    sweptTube(
      bezierPath([0, 0, 0], [0, 0.2, 0.05], [0, 0.4, -0.05], [0, 0.6, 0], 12),
      () => 0.05,
      12,
      () => [1.4, 0.7],
    ),
  ],
];

// Every catalogue food, at a couple of seeds each — seeded variation changes
// outlines, and a wobble large enough to fold an outline back on itself would
// show up here as inverted triangles.
for (const food of CATALOG) {
  for (const seed of [0, 3.7]) {
    cases.push([`food: ${food.id} (seed ${seed})`, buildFoodMesh(food.mesh, seed)]);
  }
}

let failed = 0;

// Negative control. If flipping every triangle doesn't trip the detector, the
// passes below mean nothing.
const control = sphere(0.5);
const flipped: MeshData = {
  vertices: control.vertices,
  indices: control.indices.slice() as Uint32Array<ArrayBuffer>,
};
for (let t = 0; t < flipped.indices.length; t += 3) {
  const swap = flipped.indices[t + 1];
  flipped.indices[t + 1] = flipped.indices[t + 2];
  flipped.indices[t + 2] = swap;
}
const controlReport = checkWinding(flipped);
const expectedInverted = controlReport.triangles - controlReport.degenerate;
if (controlReport.inverted !== expectedInverted) {
  console.error(
    `  SELF-TEST FAILED — deliberately inverted sphere reported ` +
      `${controlReport.inverted}/${expectedInverted} inverted. The detector is broken.`,
  );
  process.exit(1);
}
if (controlReport.volume >= 0) {
  console.error(
    "  SELF-TEST FAILED — inverted sphere reported non-negative volume. " +
      "The orientation check is broken.",
  );
  process.exit(1);
}
console.log(
  `  self-test: inverted sphere detected ` +
    `(${controlReport.inverted} tris, volume ${controlReport.volume.toFixed(5)})\n`,
);

for (const [name, mesh] of cases) {
  const r = checkWinding(mesh);
  const problems: string[] = [];
  if (r.inverted > 0) problems.push(`${r.inverted}/${r.triangles} triangles inverted`);
  if (r.volume <= 0) problems.push(`negative volume (${r.volume.toFixed(6)}) — inside-out`);
  if (problems.length > 0) failed++;

  const detail = `${r.triangles} tris` + (r.degenerate ? `, ${r.degenerate} degenerate` : "");
  console.log(
    problems.length > 0
      ? `  FAIL  ${name} — ${problems.join("; ")}`
      : `  ok    ${name} (${detail})`,
  );
}

if (failed > 0) {
  console.error(`\n${failed} mesh(es) failed — they will render inside-out.`);
  process.exit(1);
}

console.log("\nAll meshes wound consistently and oriented outward.");
