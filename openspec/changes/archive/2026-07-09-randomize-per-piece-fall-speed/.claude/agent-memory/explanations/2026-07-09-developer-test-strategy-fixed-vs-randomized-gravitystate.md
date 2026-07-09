---
agent: developer
feature: randomize-per-piece-fall-speed
tags: [testing, determinism, gravity, randomization]
date: 2026-07-09
---

## Decision

Rewrote `src/__tests__/engine/gravity.test.ts` so that every test needing a deterministic drop interval constructs a `GravityState` literal directly via a `fixedGravityState(pieceDropIntervalMs)` helper, while a new, separate `describe('initialGravityState — randomization', ...)` block is the only place that calls `initialGravityState()` and asserts on its randomized output.

## Why This Approach

`initialGravityState(level)` now draws from `Math.random()`, so any test relying on it for a *known* `pieceDropIntervalMs` (lock-delay timing, collision-blocking, soft-drop-is-faster-than-normal comparisons) would become flaky — a random draw near the range's edges could occasionally make two supposedly-different intervals collide, or push a timing assertion across a tick boundary. Design.md's Decision 4 and the project's existing convention (the `resetLockTimer` "cap reached" test already constructed a `GravityState` literal directly, pre-dating this change) both pointed at the same pattern: separate "does the randomization itself work" tests (range bounds, non-determinism across samples, clamping at levels 0/20/25) from "does gravity/lock-delay/collision logic work given a known interval" tests (fixed literals).

Using inclusive bounds (`>=`/`<=`) in the range-assertion tests, per design.md Decision 4 / Risk 4 in context-bundle.md, tolerates `Math.round()`'s edge rounding without introducing flakiness.

## Alternatives Considered

- Seeding `Math.random()` for deterministic test runs — rejected: no seeding utility exists in this codebase, and introducing one would be scope creep beyond the 3-file change described in tasks.md.
- Asserting exact equality against a single `initialGravityState()` call in the deterministic tests — rejected: this is exactly the flakiness pattern the acceptance criteria for task 3.1 explicitly warn against ("no test asserts exact equality against a `Math.random()`-derived value without first pinning it via direct `GravityState` construction").

## See Also

[[2026-07-09-developer-fixed-gravitystate-literals-in-tests]]
