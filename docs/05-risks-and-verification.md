# Risks & Verification

## Risks

| Risk | Mitigation |
|---|---|
| **Cloth never looks right** — the central technical bet | Phase 0 is a throwaway spike with explicit exit criteria and a defined fallback (rigid slices with baked drape shapes) that leaves every later phase unchanged |
| **Custom renderer scope creep** — the cost of dropping Three.js | Fidelity ceiling is fixed in writing: stylized PBR, one shadow map. No IBL, no SSAO, no DOF, no bloom |
| **Procedural food looks generic** | Phase 2 ends with a joint art-direction review before any gameplay is built on top of it |
| **Cloth ↔ scoring readback stalls the pipeline** | Centroid/AABB reduction into a tiny buffer, mapped on judgement rather than per frame |
| **Scoring feels arbitrary or unfunny** | `game/` is GPU-free and Node-testable, so weights tune rapidly against fixtures |
| **Comedy gets repetitive** | No-repeat ring buffer, weighted templates conditioned on board state, idle heckling separate from event lines |
| **WebGPU device loss or driver quirks** | `WebGPUGate` handles adapter failure in-character; device-lost handler attempts recreation |

## Known non-risks

Worth writing down so they don't get re-litigated:

- **No WebGL fallback** is a deliberate scope decision, not an oversight. Adding one
  means a second shading language and a non-compute cloth path.
- **One-way cloth coupling** is physically defensible. A paper-thin slice of
  prosciutto does not move an olive.
- **`npm audit` reports high-severity findings** in ESLint's transitive dependencies
  (`brace-expansion` DoS via `minimatch`). These are dev-only, unreachable at
  runtime in a client-side app, and the fix is a breaking ESLint 10 upgrade. Left
  alone deliberately.

## Verification per phase

| Phase | How we check it |
|---|---|
| 0 — Cloth spike | Open `/spike/cloth`, work the sliders, evaluate against the four exit criteria together |
| 1 — Renderer | Board renders, shadow tracks the light, camera orbits smoothly on trackpad and touch |
| 2 — Geometry | Every one of the 16 items is individually recognizable at gameplay camera distance |
| 3 — Physics | Drop 40 items — they stack, tumble, roll off the edge, sim holds 60fps |
| 4 — Cloth | Prosciutto over a pile of olives drapes convincingly; half off the edge, it folds over the rim |
| 5 — Judges | `node --test` — good and awful board fixtures score as expected; no repeated lines across a 30-item session |
| 6 — UI | Full loop playable start to finish |
| 7 — Polish | Downloaded PNG is high-res and correct; audio fires; no frame-time regressions under GPU timing |

From Phase 3 onward, a GPU-timing overlay stays in the build so performance
regressions are caught in the phase that causes them rather than at the end.

## End-to-end acceptance

The final check, run in a real browser:

1. Load with WebGPU disabled → the in-character gate screen appears
2. Load with WebGPU enabled → board renders
3. Build a board of 20+ items including at least two draped slices
4. Judges heckle during the build, without repeating themselves
5. Hit SERVE → both scores and verdicts appear
6. Download the render → high-res PNG of the finished board
