# Architecture

## Layout

```
app/                          Next.js 16 App Router shell
  layout.tsx, page.tsx        page is 'use client' — the canvas is imperative
  components/                 Tray, PriceTotal, JudgeFeed, ResultsCard, WebGPUGate
  spike/cloth/                Phase 0 only. Deleted after evaluation.

engine/                       Zero React. Imperative, framework-agnostic.
  gpu/
    device.ts                 adapter/device request, context config, resize
    pipelines.ts              render + compute pipeline construction
    shadow.ts                 shadow map pass
    capture.ts                offscreen high-res render → PNG
  shaders/                    WGSL lives in .ts template literals — see below
    scene.ts                  forward PBR pass
    shadow.ts                 depth-only pass
    tonemap.ts                fullscreen post
  mesh/
    primitives.ts             superellipsoid, swept-bezier, lofted polygon, rounded box
    foods.ts                  per-food mesh generation with seeded shape jitter
  material/
    procedural.wgsl           noise, fBm, voronoi, wood grain
  physics/
    world.ts                  Rapier world, fixed timestep accumulator
    bodies.ts                 collider construction per food
  cloth/
    solver.ts                 XPBD driver — buffers, ping-pong, dispatch schedule
    shaders.ts                XPBD compute kernels (integrate / solve / normals)
  scene.ts                    render loop, camera, instance buffers

game/                         Pure TypeScript. No GPU, no React. Node-testable.
  catalog.ts                  16 foods: price, category, color, mesh, physics params
  scoring/
    aesthetics.ts             coverage, color variance, entropy, clustering
    food.ts                   pairings, category balance, repetition, value
    pairings.ts               hand-authored symmetric matrix
  judges/
    kai.ts, bartholomew.ts    per-judge voice and thresholds
    lines.ts                  weighted dialogue templates
    director.ts               trigger evaluation, no-repeat ring buffer
```

## The one hard rule

**`game/` never imports from `engine/`.**

Scoring and dialogue operate on a plain `BoardSnapshot` — item ids, positions,
radii, colors, on-board flags — and nothing else. No GPU types, no Rapier types,
no React.

This matters because scoring weights and comedy timing are the things we will
iterate on most, and needing a browser and a GPU to test a pairing matrix would
make that iteration miserable. With the boundary in place, the entire judging
system runs under `node --test` in milliseconds.

The snapshot is produced by `engine/scene.ts` and consumed by `game/`. It is the
only contract between the two halves.

## Storage buffers are a hard budget

**WebGPU guarantees only 8 storage buffers per shader stage.** Some adapters
offer 10, but plenty of hardware — mobile GPUs especially, and we target touch —
stops at 8. Raising `maxStorageBuffersPerShaderStage` via `requiredLimits` is
available but would silently narrow the device pool, so we stay inside the
default and pack related data into shared allocations instead.

Current compute-stage budget, 7 of 8 used:

| # | Buffer | Contents |
|---|---|---|
| 1 | `posIn` | positions, read half of the ping-pong |
| 2 | `posOut` | positions, write half |
| 3 | `prev` | previous positions (Verlet) |
| 4 | `obst` | obstacle spheres |
| 5 | `nrm` | vertex normals |
| 6 | `hashGrid` | bucket counts **and** bucket contents, packed |
| 7 | `sliceState` | per-slice peak energy **and** quiet-frame counters, packed |

The spare slot is reserved for the rigid-item SDF proxy buffer in Phase 4. If
anything else needs storage, pack it into an existing allocation with an offset
rather than adding a binding — see `hashGrid` for the pattern.

## Why WGSL lives in TypeScript

Shaders are exported template literals in `.ts` files rather than `.wgsl` files.
Two reasons: compile-time constants (workgroup size, buffer strides) can be
interpolated and stay in sync with the host code that dispatches them, and it
avoids configuring a bundler raw-text loader. Editors highlight it via the
`/* wgsl */` comment marker.

## Data flow

```
tray click ──▶ selected item
board click ──▶ ray/plane intersect ──▶ spawn point
                                            │
                    ┌───────────────────────┴──────────────────┐
                    ▼                                          ▼
             rigid item                                  cloth slice
        Rapier body + collider                    particle grid in GPU buffer
                    │                                          │
                    │  transforms                              │  positions
                    ▼                                          ▼
            instance storage buffer                    read by vertex stage
                    │                                          │
                    └──────────────┬───────────────────────────┘
                                   ▼
                            forward render pass
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
              BoardSnapshot                    screen
                    │
                    ▼
          game/ scoring + judges ──▶ JudgeFeed / ResultsCard
```

## Cloth ↔ CPU boundary

Cloth positions live on the GPU and never leave it during the render loop. But
scoring needs to know where slices ended up.

Rather than reading back every frame — which would stall the pipeline — a small
compute pass reduces each slice to a **centroid and AABB** written into a tiny
buffer. That buffer is mapped with `mapAsync` only on judgement, plus occasionally
during play to feed commentary triggers. A few dozen bytes, read a handful of times
per session, instead of megabytes per frame.

## Dependencies

| Package | Why |
|---|---|
| `next@16` | App Router shell. Turbopack is the default bundler in 16. |
| `react@19` | UI shell only — never touches the render loop. |
| `@dimforge/rapier3d-simd-compat` | Rigid-body physics. Base64-inlined WASM avoids bundler `.wasm` friction; SIMD build is free performance. |
| `wgpu-matrix` | Matrix/vector math. Tiny, WebGPU-native column-major `Float32Array`. |
| `@webgpu/types` | TypeScript definitions for the WebGPU API. |

That is the entire dependency list, and it should stay that way. No rendering
library, no physics helper, no UI kit, no state manager, no Rust toolchain.

## Fixed timestep

Physics steps at a fixed rate with an accumulator, decoupled from render rate, so
behaviour is identical on a 60Hz and a 120Hz display. Cloth substeps run inside the
same fixed step. Rendering interpolates where it matters.
