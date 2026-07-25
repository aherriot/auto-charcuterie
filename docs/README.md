# Auto-Charcuterie — Documentation

A tongue-in-cheek web app: drop food onto a 3D cutting board while two insufferable
party-goers heckle you, then receive their verdict.

Built on raw WebGPU with hand-written WGSL — **no Three.js** — with Rapier for
rigid-body physics and Next.js 16 as a thin React shell. All geometry and textures
are generated procedurally in code. There are no art assets in this repository.

The judges are deterministic heuristics plus authored copy. **No LLM API calls.**

## Contents

| Document | What's in it |
|---|---|
| [01 — Vision & Decisions](./01-vision-and-decisions.md) | What we're building, and every locked-in decision with its rationale |
| [02 — Architecture](./02-architecture.md) | Directory layout, module boundaries, dependencies |
| [03 — Phases](./03-phases.md) | The eight delivery phases, each independently runnable |
| [04 — Catalog & Judges](./04-catalog-and-judges.md) | The 16 foods, the scoring model, the two judges |
| [05 — Risks & Verification](./05-risks-and-verification.md) | What could go wrong, and how we check each phase |

## Current status

Phases 0, 1, 2, 3 and 5 are complete. **Phase 4 (cloth slices) is deferred by
decision** — the solver is proven and runnable, it just isn't wired into the
board yet. Remaining: Phase 6 (tasting-menu UI) and Phase 7 (polish).

The loop is playable end to end at `/board`: pick from the tray, drop, get
heckled, hit Serve.

| Route | What it is |
|---|---|
| `/` | Landing page |
| `/board` | The game — placement, physics, judges, verdict |
| `/catalog` | Art-direction review of all 16 foods |
| `/spike/cloth` | Phase 0 cloth spike, kept for when Phase 4 resumes |

## Quick start

```bash
npm install
npm run dev     # http://localhost:3000
npm run check   # typecheck + WGSL lint + mesh validation + tests
npm test        # scoring and judge tests alone (no GPU needed)
```

Requires a browser with WebGPU enabled. There is deliberately no WebGL fallback —
see [01 — Vision & Decisions](./01-vision-and-decisions.md#platform).
