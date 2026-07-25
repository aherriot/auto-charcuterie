/**
 * Collider/mesh agreement.
 *
 * A collider whose dimensions or axis don't match its mesh is invisible to the
 * typechecker and shows up only as strange physics: items tumbling end over
 * end, or appearing to sink through the board. Cornichons and grissini shipped
 * exactly that way — the axis alignment had been applied to the rigid body,
 * which rotates the rendered mesh too, leaving collider and mesh 90° apart.
 *
 * These compare declared collider extents against the mesh's actual bounding
 * box. Reads from `COLLIDERS`, which is plain data, so no WASM is loaded.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CATALOG, type MeshId } from "./catalog";
import { buildFoodMesh } from "../engine/mesh/foods";
import { COLLIDERS, colliderExtents } from "../engine/physics/bodies";

/** Half-extents of a mesh's axis-aligned bounding box, about the origin. */
function meshExtents(mesh: MeshId, seed = 0): [number, number, number] {
  const { vertices } = buildFoodMesh(mesh, seed);
  let hx = 0;
  let hy = 0;
  let hz = 0;
  for (let i = 0; i < vertices.length; i += 6) {
    hx = Math.max(hx, Math.abs(vertices[i]));
    hy = Math.max(hy, Math.abs(vertices[i + 1]));
    hz = Math.max(hz, Math.abs(vertices[i + 2]));
  }
  return [hx, hy, hz];
}

const AXES = ["x", "y", "z"] as const;

describe("colliders", () => {
  it("defines a collider for every catalogue mesh", () => {
    for (const food of CATALOG) {
      assert.ok(COLLIDERS[food.mesh], `no collider for ${food.mesh}`);
    }
  });

  it("matches each mesh's bounding box within tolerance", () => {
    for (const food of CATALOG) {
      const spec = COLLIDERS[food.mesh];
      const collider = colliderExtents(spec);
      // Hulls are built from the mesh itself, so there is nothing to compare.
      if (!collider) continue;

      const mesh = meshExtents(food.mesh);
      const dominant = mesh.indexOf(Math.max(...mesh));

      for (let i = 0; i < 3; i++) {
        const ratio = collider[i] / Math.max(mesh[i], 1e-6);

        // The dominant axis is held tightly: getting it wrong means the
        // collider is a different size or orientation from what's drawn, which
        // is the failure this test exists for.
        //
        // Cross axes are allowed to under-cover. Several foods are curved —
        // cornichons and cashews bend through their sweep — and a straight
        // capsule cannot span a curved mesh's bounding box. Over-covering is
        // still held tight in both cases, because a collider larger than its
        // mesh makes items visibly float.
        const min = i === dominant ? 0.75 : 0.4;
        const max = 1.35;

        assert.ok(
          ratio > min && ratio < max,
          `${food.id}: collider ${AXES[i]} half-extent ${collider[i].toFixed(4)} ` +
            `vs mesh ${mesh[i].toFixed(4)} (ratio ${ratio.toFixed(2)}` +
            `${i === dominant ? ", dominant axis" : ""})`,
        );
      }
    }
  });

  it("orients elongated items along their mesh's long axis", () => {
    for (const food of CATALOG) {
      const spec = COLLIDERS[food.mesh];
      if (spec.kind !== "capsule" && spec.kind !== "cylinder") continue;

      const mesh = meshExtents(food.mesh);
      const sorted = [...mesh].sort((a, b) => b - a);

      // Discs are near-symmetric in x and z, so "longest axis" is meaningless
      // for them — only assert where one axis genuinely dominates, which is
      // exactly the case where getting it wrong is visible.
      if (sorted[0] < sorted[1] * 1.3) continue;

      const longestMeshAxis = mesh.indexOf(sorted[0]);
      const collider = colliderExtents(spec)!;
      const longestColliderAxis = collider.indexOf(Math.max(...collider));

      assert.equal(
        longestColliderAxis,
        longestMeshAxis,
        `${food.id}: collider is longest on ${AXES[longestColliderAxis]} but ` +
          `the mesh is longest on ${AXES[longestMeshAxis]} — the collider will ` +
          `not match what is drawn`,
      );
    }
  });

  it("keeps every collider a sane size", () => {
    for (const food of CATALOG) {
      const collider = colliderExtents(COLLIDERS[food.mesh]);
      if (!collider) continue;
      for (const extent of collider) {
        assert.ok(extent > 0.001, `${food.id}: degenerate collider extent`);
        // The board is 2.2 units across; nothing on it should approach that.
        assert.ok(extent < 0.5, `${food.id}: collider extent ${extent} is huge`);
      }
    }
  });
});
