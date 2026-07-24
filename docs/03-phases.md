# Phases

Eight phases. Each ends with something openable in a browser, so the direction can
be steered before the next one starts.

The ordering is driven by risk: the thing most likely to not work is Phase 0.

---

## Phase 0 — Cloth spike *(throwaway)*

**This gates the whole project.** A standalone page at `/spike/cloth`, deleted after
evaluation.

A single slice as a particle grid in a GPU storage buffer, solved by a WGSL compute
pass, rendered by reading that same buffer from the vertex stage — no readback, no
CPU round-trip.

```
positions, prevPositions : storage<array<vec3f>>

compute, ~8 substeps per frame:
  ├ integrate            gravity + velocity damping
  ├ distance constraints structural, Jacobi-style with relaxation
  ├ bending constraints  stiffness parameter = per-food "floppiness"
  └ collide              analytic SDFs: board plane, sphere/capsule proxies

vertex stage reads positions[i] directly
normals from cross products in-shader
```

Ships with sliders for grid resolution, substeps, distance and bend stiffness,
damping and friction, plus 3–4 preset obstacle arrangements to drape over.

### Exit criteria — ✅ passed, 2026-07-24

GPU cloth is confirmed. The rigid-slice fallback is **not** needed and Phase 4
will promote this solver as designed.

Validated settings, now the defaults in `engine/cloth/solver.ts`:
grid **8**, substeps **20**, iterations **16**, bend stiffness 0.35.

The surprise: a *coarse* grid solved very hard beat a fine grid solved lightly.
Once edge-based collision decoupled fidelity from resolution, extra particles
bought nothing, and spending that budget on solver effort instead is what makes
the drape hold its shape.

### What Phase 0 had to solve

Each of these was a real failure found by running it, and each fix carries
forward into Phase 4:

| Problem | Cause | Fix |
|---|---|---|
| Slices looked limp and paper-thin | Bend stiffness far too low; zero-thickness surfaces | Bend 0.08 → 0.35; collision offset doubles as apparent thickness |
| Obstacles slipped through at low resolution | Collision was particle-only, so gaps exceeded obstacle size | Structural **edges** tested as segments against spheres |
| Slices tunnelled through obstacles when busy | Low fps → long substeps → particles skipped past spheres | **Swept** test against the previous position |
| Slices passed through each other | No slice-vs-slice collision existed at all | Spatial hash rebuilt every substep |
| Slices flung into the air at the board edge | Board was a half-space: a particle past the rim was teleported the full board depth in one step, which Verlet read as huge velocity | Board is a **box**, resolved along the axis of least penetration; plus a per-substep displacement clamp |
| A stack never stopped shimmering | XPBD never reaches exact equilibrium | Per-slice **sleeping** with wake-on-contact |
| Collision silently stopped working after changing resolution | `allocate()` recreated the obstacle buffer but `obstacleCount` survived — N spheres of radius 0 | Obstacle list retained and re-uploaded |

### Known rough edge, for Phase 4

Slice size is currently `(grid - 1) × spacing`, so **changing resolution changes
how big the food is**. In the real app, size should be authored in world units
with the particle grid derived from it, or a prosciutto slice will change size
whenever the quality setting moves.

---

## Phase 1 — Renderer core

A lit, shadowed cutting board on screen.

- Device and canvas context, resize handling, 4× MSAA, depth buffer
- `WebGPUGate` — adapter request, in-character rejection screen on failure
- Orbit camera, mouse and touch
- Forward pass: one directional key light, hemispheric ambient
- Shadow map, 2048², 3×3 PCF
- GGX specular + Lambert diffuse
- ACES-ish tonemap and subtle vignette in a fullscreen post pass
- Instanced draw: one pipeline per mesh type, storage buffer of per-instance model
  matrix and material parameters

**Verify:** `npm run dev` — board renders, shadow tracks the light, camera orbits
smoothly on trackpad and touch.

---

## Phase 2 — Procedural geometry and materials

All 16 foods modeled and textured, laid out in a static inspection grid.

Mesh generators:

| Generator | Used for |
|---|---|
| Superellipsoid | olives, grapes, almonds |
| Swept circle along a bezier | cashews, breadsticks |
| Lofted irregular polygon | slices, crackers |
| Rounded / chamfered box | board, cheese wedges |

Plus per-instance shape jitter from a seed, so no two olives are identical.

Materials are WGSL functions producing albedo and roughness from object-space
position — fBm marbling for salami, Voronoi cells for holed cheese, ring-based
wood grain for the board, waxy specular for olives.

**Verify:** every item is individually recognizable at gameplay camera distance.
This phase ends with a joint art-direction review before gameplay is built on it.

---

## Phase 3 — Physics and placement

- Rapier world, fixed timestep with accumulator
- Board as fixed collider — thin cuboid plus rim
- Items as dynamic bodies, convex-hull or primitive colliders
- Click tray item to select; click above the board to drop. Cursor ray intersected
  with a horizontal plane at drop height gives the spawn point — no GPU picking
- Body transforms synced into the instance storage buffer each frame
- Items that fall off the board are detected and flagged (scoring cares, and so
  does Kai)
- Sleeping bodies for settled items, to keep the step cheap

**Verify:** drop 40 items — they stack, tumble, roll off the edge, and the sim
holds 60fps.

---

## Phase 4 — Cloth slices in the real app

Promote the Phase 0 solver into `engine/cloth/`.

Slices are cloth; everything else is rigid. Each frame the CPU writes an SDF proxy
buffer — one sphere, capsule or box per placed item, derived from Rapier — that the
cloth compute pass collides against.

The centroid/AABB reduction pass described in
[02 — Architecture](./02-architecture.md#cloth--cpu-boundary) is added here, so
`game/` can see where slices landed without a per-frame readback.

**Verify:** prosciutto dropped over a pile of olives drapes convincingly;
dropped half off the edge, it folds over the rim.

---

## Phase 5 — Judges and scoring

Pure TypeScript over `BoardSnapshot`, fully unit-tested. Model and characters are
specified in [04 — Catalog & Judges](./04-catalog-and-judges.md).

**Verify:** `node --test` on scoring fixtures — a deliberately good board and a
deliberately awful one score as expected; commentary doesn't repeat across a
30-item session.

---

## Phase 6 — UI shell

Tasting-menu art direction, played completely straight: serif type, cream and
charcoal, gold rules, prices leadered like a menu.

```
────────────────────────
  P L A N C H E
  ── selections ──
Prosciutto di Parma  ···  9.00
Aged Gouda           ···  7.50
Castelvetrano Olives ···  4.00
────────────────────────
           TOTAL    20.50
```

Tray of 16 items with prices, always-visible running total, live judge feed,
SERVE button, results card with both scores and verdicts.

**Verify:** full loop playable start to finish.

---

## Phase 7 — Polish

- **Downloadable render** — re-render one high-res frame into an offscreen texture
  at capture time, then `copyTextureToBuffer` → PNG. Do not try to grab the live
  swapchain.
- Placement and judge-line sound
- Drop and settle juice
- Score-reveal animation
- Perf pass with GPU timestamp queries
- Touch tuning on iPad
