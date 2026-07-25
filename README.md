# Auto-Charcuterie

**Play it now → [auto-charcuterie.vercel.app](https://auto-charcuterie.vercel.app)**

Build a charcuterie board in 3D. Drop food from above and let physics decide where it
lands. Two judges heckle you the entire time, then score you out of 100 and hand you
the bill.

Everything you see below is generated at runtime from math. There are no 3D models, no
textures, no images, and no rendering library — just WebGPU and hand-written WGSL.

![The board scene: a wooden cutting board with cheese wedges, salami, cornichons and
breadsticks scattered across it, a live selections menu on the right, and the judges
heckling on the left](docs/images/board.png)

Click an item, click a spot above the board, and commit. No dragging, no rearranging.
The physics is deliberately outside your control, which is where most of the comedy
comes from — and so is the running total, which the judges will bring up.

![The results card: Kai scores 39 on presentation, Bartholomew scores 39 on the food,
next to an itemised bill totalling $21.20](docs/images/results.png)

> *"It's a board-shaped absence of decisions."* — Kai
>
> *"12 × Cornichons is not a decision, it is a habit."* — Bartholomew

## Why this is interesting

**The renderer is hand-built.** No Three.js, no Babylon. Pipelines, camera, lighting,
shadows and the material system are all ours: Cook-Torrance GGX specular over Lambert
diffuse, one directional key light with a hemispheric ambient term, a 2048² shadow map
with 3×3 PCF, and an ACES-ish tonemap. The fidelity ceiling is written down and
enforced so the renderer can't eat the project.

**Every mesh is procedural.** Superellipsoids, swept béziers, lofted polygons — each
food is generated from parameters with seeded per-instance jitter, so no two salami
rounds are identical. Zero asset pipeline, zero licensing questions, zero bundle
weight.

**Every texture is procedural too.** fBm marbling for the salami, Voronoi cells for
holed cheese, ring-based wood grain for the board. All WGSL, all tweakable live.

**Rapier has no cloth, so we wrote it.** Draping is what makes a charcuterie board
read as real, and Dimforge's engine has no deformables. Slices are XPBD cloth solved
entirely in a WGSL compute shader: particle positions live in GPU storage buffers, the
compute pass solves constraints, and the vertex stage reads the same buffer directly —
no CPU readback anywhere in the render path. Runnable at
[`/spike/cloth`](https://auto-charcuterie.vercel.app/spike/cloth) with live solver
controls.

The surprising result from building it: a *coarse* grid solved very hard beats a fine
grid solved lightly. Once edge-based collision decoupled fidelity from grid
resolution, extra particles bought nothing, and spending that budget on solver
iterations instead is what makes a drape hold its shape.

**The judging is algorithmic, not an LLM.** That's the whole point. Kai scores
aesthetics from pure geometry — coverage, colour variance, spatial entropy, height
variation, minus same-item clustering and edge crowding. Bartholomew scores the food
from a hand-authored symmetric pairing matrix over all 16 items, plus category
balance, repetition penalties and value-for-money. Fig and blue score. Prosciutto and
grapes score. Cornichons and honeycomb do not.

Pairings only count if the two items actually landed near each other, which quietly
ties the two judges' axes together and rewards placement rather than shopping.

**`game/` never imports from `engine/`.** Scoring and dialogue see only a plain
`BoardSnapshot` — ids, positions, radii, colours — and nothing else. No GPU types, no
Rapier types, no React. That boundary is why the entire judging system, the thing most
worth iterating on, runs under `node --test` in under a second instead of needing a
browser and a GPU.

**The interface never acknowledges the joke.** Serif type, cream and charcoal, gold
rules, prices leadered like a tasting menu — played completely straight while the
judges take you apart.

## The dependency list

```
next          App Router shell
react         UI shell only — never touches the render loop
rapier3d      Rigid-body physics (SIMD, base64-inlined WASM)
wgpu-matrix   Matrix math
@webgpu/types Type definitions
```

That's all of it, and it's meant to stay that way. No rendering library, no physics
helpers, no UI kit, no state manager, no Rust toolchain in the build.

## Requirements

**WebGPU only. No WebGL fallback.** Owning the renderer means a fallback would mean
maintaining a second shading language and finding a non-compute path for the cloth.
Browsers without WebGPU get an in-character rejection screen from the judges.

Works on desktop and touch. Body counts scale down on weaker GPUs.

## Running it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run check        # typecheck + WGSL lint + mesh validation + tests
npm test             # 46 tests, pure Node, no browser
```

`npm run lint:wgsl` catches shader mistakes the TypeScript compiler can't see, and
`npm run check:mesh` validates generated geometry — both because the failure mode for
procedural content is a silently wrong picture rather than an error.

## Docs

The design is written down before it's built, and the reasoning is kept when a
decision changes.

| | |
|---|---|
| [Vision & decisions](docs/01-vision-and-decisions.md) | What it is, and the rationale behind every locked-in choice |
| [Architecture](docs/02-architecture.md) | Layout, the `game`/`engine` rule, the 8-storage-buffer budget, data flow |
| [Phases](docs/03-phases.md) | Build order by risk, including the failures each phase had to solve |
| [Catalog & judges](docs/04-catalog-and-judges.md) | The 16 foods, both scoring models, the two characters |
| [Risks & verification](docs/05-risks-and-verification.md) | What could go wrong and how each is checked |

## Status

Playable end to end. One notable gap: cloth is proven and shipped at `/spike/cloth`,
but not yet promoted into the board scene — prosciutto currently lands flat instead of
draping over the olives. That's a scheduling decision, not a technical retreat, and
the [original plan](docs/03-phases.md) is kept for when it's picked back up.
