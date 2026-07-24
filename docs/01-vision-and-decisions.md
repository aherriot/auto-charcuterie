# Vision & Decisions

## The app

The user is shown a 3D cutting board and a tray of 16 foods, each with a price.
They click an item, then click a spot above the board, and it drops — physics
decides where it actually lands. A running total ticks up. Throughout, two judges
heckle the user in text. When the user hits SERVE, each judge delivers a score and
a verdict: one grades pure aesthetics, the other grades the food choices.

The tone is humorous throughout. The interface, by contrast, is played completely
straight — an elegant tasting menu that never acknowledges the joke while the judges
tear the user apart.

## Locked-in decisions

Each of these was chosen deliberately. The rationale matters more than the choice —
if a rationale stops holding, the decision is worth revisiting.

### Rendering

**Raw WebGPU, hand-written WGSL, no Three.js.** We own the renderer: pipelines,
camera, lighting, shadows, material system.

**Stylized PBR with soft shadows** is the fidelity ceiling. Cook-Torrance GGX
specular plus Lambert diffuse, one directional key light with a hemispheric ambient
term, a single 2048² shadow map with 3×3 PCF, and an ACES-ish tonemap with a subtle
vignette. Explicitly **not** doing: image-based lighting, SSAO, depth of field,
bloom. This ceiling exists to stop renderer scope creep, which is the main risk of
having dropped a rendering library.

**100% procedural geometry.** Every mesh is generated at runtime from math.
No glTF loader, no asset pipeline, no licensing questions, no bundle weight —
and it pairs naturally with procedural texturing, so the whole app is generated
from nothing. The trade is that organic shapes take real effort and everything
reads somewhat stylized. For a comedy app about snack arrangement, that's fine.

**Procedural textures in WGSL.** fBm marbling for salami, Voronoi cells for holed
cheese, ring-based wood grain for the board. Zero image assets, tweakable live.

### Physics

**Rapier for rigid bodies** — `@dimforge/rapier3d-simd-compat`. The `-compat`
build inlines its WASM as base64, sidestepping bundler `.wasm` friction; the SIMD
build is free performance.

**Rapier has no soft bodies or cloth, and this is the project's central constraint.**
Dimforge's 2025–26 work went into BVH rebalancing, SIMD tree traversal and sparse
voxel colliders; deformables remain absent. Since thin slices draping over a mound
of olives is exactly what makes a charcuterie board look right, we write that
ourselves.

**Slices are XPBD cloth solved in a WGSL compute shader.** Particle positions live
in GPU storage buffers; the compute pass solves constraints and the vertex stage
reads the same buffer directly, with no CPU readback in the render path. Chosen
over a Rust→WASM solver because constraint projection is embarrassingly parallel
and we already have a WebGPU pipeline standing — the GPU is the natural home for it.

**Cloth coupling is one-way.** Slices drape over rigid items; rigid items ignore
slices. Two-way coupling would require CPU-side cloth state every frame, defeating
the GPU-resident design. Visually the asymmetry is nearly invisible, because a
paper-thin slice of prosciutto genuinely does not move an olive.

**Custom WASM only where measured.** Rapier's WASM comes free. We add our own only
if profiling shows a hot spot that matters, keeping this a plain Next.js project
with no Rust toolchain in the build.

### Interaction & platform

**Click a tray item, then click to drop.** No dragging, no rearranging once placed.
This keeps the input layer small and keeps the physics comedically out of the user's
control — you commit to a drop and live with where it lands.

**WebGPU only. Desktop and touch. No WebGL fallback.** <a id="platform"></a>
Now that we own the renderer, a fallback would mean maintaining a second shading
language and finding a non-compute path for the cloth. Browsers without WebGPU get
an in-character rejection screen from the judges. Placement works with touch, and
body counts scale down on weaker GPUs.

### Game design

**Unlimited spending, judged on the total.** No budget cap and no failure state —
it's a sandbox. The price total is a stat the judges roast the user over, which
makes spending a comedy lever rather than a constraint.

**Rich geometric and culinary heuristics**, all deterministic and unit-testable.
Real board analysis for aesthetics, a hand-authored pairing matrix for food.
Detailed in [04 — Catalog & Judges](./04-catalog-and-judges.md).

**Event-driven commentary with idle heckling.** Lines fire on specific triggers,
with no-repeat tracking, plus timed heckles when nothing notable is happening.

**The Influencer and The Foodie Snob** — Kai and Bartholomew. Maximum comedic
contrast, and each maps cleanly onto one scoring axis.

**Score card with downloadable render** at the end. Shareable, no backend.

## Non-goals

- Any LLM or network call for judging — the whole point is that it's algorithmic
- A WebGL fallback path
- Multiplayer, accounts, or a server-side leaderboard
- Photorealism
