# Tasks: Randomize Per-Piece Fall Speed Around the Level Curve

**Change name:** randomize-per-piece-fall-speed
**Date:** 2026-07-09

Tasks are ordered by dependency. Each task is scoped to be implementable in a single focused session.

---

## 1. Engine — Gravity Module

- [x] 1.1 Add `pieceDropIntervalMs` to `GravityState` and randomize it in `initialGravityState(level)`

**Layer:** `[engine]`

**Description:**
In `src/engine/gravity.ts`:
- Add `pieceDropIntervalMs: number` to the `GravityState` interface, with a doc comment explaining it is the randomized per-piece drop interval, pinned for the piece's lifetime.
- Change `initialGravityState(): GravityState` to `initialGravityState(level: number): GravityState`.
- Inside `initialGravityState`, reuse the same level-clamping logic already present in `applyGravity` (`clampedLevel = Math.max(1, Math.min(level, GRAVITY_TABLE.length))`, then look up `GRAVITY_TABLE[clampedLevel - 1] ?? GRAVITY_TABLE[GRAVITY_TABLE.length - 1]!`).
- Compute `multiplier = 0.5 + Math.random() * 1.0` (yields `[0.5, 1.5)`).
- Compute `pieceDropIntervalMs = Math.max(1, Math.round(baseInterval * multiplier))`.
- Return the new field alongside the existing `gravityAccum: 0`, `lockTimer: -1`, `lockResetCount: 0`.

**Files:**
- Modify: `src/engine/gravity.ts`

**Acceptance criteria:**
- `GravityState` has a `pieceDropIntervalMs: number` field.
- `initialGravityState(level: number): GravityState` compiles and is exported with this new required signature.
- Calling `initialGravityState(5)` 200+ times yields only values within `[0.5 * GRAVITY_TABLE[4], 1.5 * GRAVITY_TABLE[4]]` and not all values are identical.
- Calling `initialGravityState(20)` never yields `pieceDropIntervalMs < 1`.
- Calling `initialGravityState(0)` and `initialGravityState(25)` clamp to level 1 and level 20's base interval respectively, same as `applyGravity`'s existing clamping behavior.

---

- [x] 1.2 Update `applyGravity()` to read the pinned `pieceDropIntervalMs` instead of recomputing from `GRAVITY_TABLE`

**Layer:** `[engine]`

**Description:**
In `src/engine/gravity.ts`, inside `applyGravity()`:
- Remove the per-tick `baseInterval` lookup from `GRAVITY_TABLE` (the `clampedLevel` / `GRAVITY_TABLE[clampedLevel - 1]` lines currently at the top of the function).
- Read `gravityState.pieceDropIntervalMs` as the base interval instead.
- Keep the `level` parameter in the function signature unchanged (do not remove it — see design.md Decision 2) even though it's no longer used to derive `baseInterval`.
- Keep the soft-drop multiplier logic exactly as-is, just applied to `gravityState.pieceDropIntervalMs` instead of the old locally-computed `baseInterval`: `const interval = softDrop ? Math.max(1, gravityState.pieceDropIntervalMs / 20) : gravityState.pieceDropIntervalMs`.
- Ensure the returned `gravityState` in `ApplyGravityResult` continues to carry `pieceDropIntervalMs` through unchanged (it must be copied into the returned object alongside `gravityAccum`, `lockTimer`, `lockResetCount` — it does not get recomputed inside `applyGravity`).

**Files:**
- Modify: `src/engine/gravity.ts`

**Acceptance criteria:**
- `applyGravity()` no longer references `GRAVITY_TABLE` directly.
- The `level` parameter remains part of `applyGravity`'s signature (unused for interval lookup, retained for compatibility).
- Soft drop continues to apply a 20x speed-up on top of whatever `pieceDropIntervalMs` is pinned, with the same `Math.max(1, ...)` floor as before.
- The `pieceDropIntervalMs` value in the returned `gravityState` is identical to the input `gravityState.pieceDropIntervalMs` (never mutated mid-piece by `applyGravity`).
- Existing lock-delay, collision-blocking, and level-clamping test scenarios (adapted per task 3.1) continue to pass.

---

## 2. Engine — Call Site Updates

- [x] 2.1 Pass current `level` at every `initialGravityState()` call site in `src/engine/gameState.ts`

**Layer:** `[engine]`

**Description:**
Update all 5 call sites of `initialGravityState()` in `src/engine/gameState.ts` to pass the `level` variable in scope at that point:
1. `createGameState()` — the object literal that sets `level: 1` alongside `gravityState: initialGravityState()`; pass `1` (matches the sibling `level: 1` field) or reference the same literal value.
2. Hard-drop branch, game-over path (`events.push({ type: 'game-over' })` after hard drop) — pass the local `level` variable (post any level-up check in that branch).
3. Hard-drop branch, successful spawn path (new piece placed, no collision) — pass the local `level` variable.
4. Gravity-lock branch, game-over path (`events.push({ type: 'game-over' })` after a gravity-triggered lock) — pass the local `level` variable.
5. Gravity-lock branch, successful spawn path (new piece placed, no collision) — pass the local `level` variable.

In every case, use the `level` value already computed earlier in the same function body (which reflects any level-up that just occurred from the line clear immediately preceding that call), not `state.level` (the pre-tick value), so a newly spawned piece immediately after a level-up gets a drop interval randomized around its *new* level, not the old one.

**Files:**
- Modify: `src/engine/gameState.ts`

**Acceptance criteria:**
- All 5 `initialGravityState()` call sites pass a `level` argument; `npm run build` (TypeScript) compiles with zero errors (this is the primary safety net — a missed call site is a compile error, not a silent bug, per design.md's Risks section).
- A piece that spawns immediately after a level-up (e.g., clearing the 10th line and leveling from 1 to 2) receives a drop interval randomized around the new level's `GRAVITY_TABLE` base value, not the previous level's.
- No behavioral change to level computation, scoring, line-clear detection, or the 7-bag randomizer — only the `initialGravityState()` call arguments change.

---

## 3. Tests

- [x] 3.1 Update `src/__tests__/engine/gravity.test.ts` for randomized-interval behavior

**Layer:** `[test]`

**Description:**
Update the existing test file to account for `initialGravityState` now requiring a `level` argument and no longer producing a deterministic `pieceDropIntervalMs`:

- Update every existing `initialGravityState()` call to `initialGravityState(<level>)`, passing whatever level that test is already exercising (most call `applyGravity(..., 1)`, so pass `1`; the level-clamping tests should pass the same level used in the corresponding `applyGravity` call).
- For tests that need a *known, fixed* drop interval to make deterministic assertions about drop timing, lock delay, or collision blocking (i.e., most of the existing suite), construct the `GravityState` object directly as a literal (e.g., `{ gravityAccum: 0, lockTimer: -1, lockResetCount: 0, pieceDropIntervalMs: 1000 }`) instead of relying on `initialGravityState()`'s now-randomized output. This mirrors the existing pattern already used by the `resetLockTimer` "cap reached" test, which constructs a `GravityState` literal directly.
- Add a new `describe('initialGravityState — randomization', ...)` block with:
  - A test that samples `initialGravityState(level)` many times (e.g., 200 iterations) for a representative level (e.g., level 5, base interval 355ms) and asserts every sampled `pieceDropIntervalMs` falls within `[Math.round(355 * 0.5), Math.round(355 * 1.5)]` (use inclusive bounds to tolerate rounding at the edges).
  - A test asserting that not all 200 sampled values are identical (guards against a broken/no-op randomization implementation), using a large enough sample that false-failure probability is negligible.
  - A test that level 20 (base interval 1ms) never produces `pieceDropIntervalMs < 1` across many samples.
  - A test that level clamping in `initialGravityState` matches `applyGravity`'s existing clamping (level 0 and level 25 produce results bounded by level 1's and level 20's base intervals respectively).
- Update the `describe('applyGravity — soft drop', ...)` test to use a fixed-`pieceDropIntervalMs` `GravityState` literal (not `initialGravityState()`) so the "soft drop is faster than normal drop" assertion remains deterministic rather than potentially comparing two different randomized intervals.
- Verify `describe('applyGravity — level clamping', ...)` tests still pass — since `applyGravity` no longer clamps `level` for interval lookup itself, these tests should construct a `GravityState` with a known `pieceDropIntervalMs` (e.g., derived by calling `initialGravityState(0)` / `initialGravityState(25)` once and reading back the value, or by constructing the literal directly with the expected clamped `GRAVITY_TABLE` value) — confirm with task 1.2's implementation which approach is cleanest once the code is written.

**Files:**
- Modify: `src/__tests__/engine/gravity.test.ts`

**Acceptance criteria:**
- `npm run test` passes with zero failures and zero flaky/non-deterministic assertions (no test asserts exact equality against a `Math.random()`-derived value without first pinning it via direct `GravityState` construction).
- New randomization-specific tests exist and would fail if `initialGravityState` returned a constant multiplier (e.g., always `1.0x`) or an out-of-range multiplier (e.g., `[0, 2)`).
- Existing lock-delay, collision-blocking, and soft-drop tests remain deterministic (no reliance on the actual random draw).
- `npm run test:coverage` (if configured) exits 0 with coverage thresholds satisfied.

---

## Task Ordering Summary

```
1.1 (GravityState + initialGravityState randomization)
   └─→ 1.2 (applyGravity reads pinned interval)
          └─→ 2.1 (gameState.ts call sites pass level)
                 └─→ 3.1 (gravity.test.ts updated for new signature + randomization coverage)
```

1.1 must land before 1.2 (applyGravity needs `pieceDropIntervalMs` to exist on `GravityState`). 1.2 must land before 2.1 only in the sense that both are required before the module compiles cleanly against its own tests — in practice 1.1 and 1.2 are two edits to the same file and will typically land together. 2.1 must land before `npm run build` succeeds project-wide (call sites won't compile against the new `initialGravityState(level)` signature otherwise). 3.1 should land last since it validates the finished behavior of 1.1 + 1.2 + 2.1 together.
