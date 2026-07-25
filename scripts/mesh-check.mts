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
  checkWinding,
  roundedBox,
  sphere,
  superellipsoid,
  type MeshData,
} from "../engine/mesh/primitives.ts";

const cases: Array<[string, MeshData]> = [
  ["roundedBox (board)", roundedBox(1.1, 0.06, 0.79, 0.05, 5)],
  ["roundedBox (cube-ish)", roundedBox(0.16, 0.075, 0.11, 0.03, 3)],
  ["roundedBox (tiny radius)", roundedBox(0.5, 0.5, 0.5, 0.01, 2)],
  ["sphere", sphere(0.5)],
  ["superellipsoid n=2.3 (olive)", superellipsoid(0.055, 0.072, 0.055, 2.3, 20, 14)],
  ["superellipsoid n=4 (boxy)", superellipsoid(0.4, 0.4, 0.4, 4, 20, 14)],
  ["superellipsoid n=1.2 (pinched)", superellipsoid(0.4, 0.4, 0.4, 1.2, 20, 14)],
];

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
console.log(`  self-test: inverted sphere detected (${controlReport.inverted} tris)\n`);

for (const [name, mesh] of cases) {
  const r = checkWinding(mesh);
  const bad = r.inverted > 0;
  if (bad) failed++;

  const detail = `${r.triangles} tris` + (r.degenerate ? `, ${r.degenerate} degenerate` : "");
  console.log(
    bad
      ? `  FAIL  ${name} — ${r.inverted}/${r.triangles} triangles inverted`
      : `  ok    ${name} (${detail})`,
  );
}

if (failed > 0) {
  console.error(`\n${failed} mesh(es) wound inconsistently — they will render inside-out.`);
  process.exit(1);
}

console.log("\nAll meshes wound consistently.");
