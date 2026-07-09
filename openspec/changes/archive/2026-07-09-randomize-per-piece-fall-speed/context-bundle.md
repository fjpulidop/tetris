# Context Bundle: Randomize Per-Piece Fall Speed Around the Level Curve

**Change name:** randomize-per-piece-fall-speed
**Date:** 2026-07-09
**For:** Developer agent — consume before beginning implementation.

---

## What to Build

Pin a randomized (`0.5x`–`1.5x`) drop interval per spawned piece, instead of `applyGravity()` recomputing a fixed `GRAVITY_TABLE[level - 1]` interval on every tick. This is a small, well-bounded change confined to `src/engine/gravity.ts` (core logic), `src/engine/gameState.ts` (5 call-site updates), and `src/__tests__/engine/gravity.test.ts` (test updates). No renderer, input, audio, or UI files change.

## Critical Constraints

1. **`Math.random()` is called exactly once per piece spawn, inside `initialGravityState(level)`.** It must never be called inside `applyGravity()`'s per-tick path — that would re-roll the interval every tick instead of pinning it, breaking the "pinned for piece lifetime" requirement.
2. **`GRAVITY_TABLE` values themselves are unchanged.** Do not edit any of the 20 entries in `src/engine/gravity.ts`. This change adds jitter around the table, it does not replace it.
3. **`LOCK_DELAY_MS` and `MAX_LOCK_RESETS` are unchanged.** Do not touch `resetLockTimer()` or the lock-timer arithmetic inside `applyGravity()` beyond swapping where `interval`'s base value comes from.
4. **Soft drop's 20x multiplier logic is preserved as-is**, just applied to `gravityState.pieceDropIntervalMs` instead of the old locally-computed `baseInterval`. The `Math.max(1, baseInterval / 20)` floor pattern must be preserved for the new source value too.
5. **`applyGravity()` keeps its `level: number` parameter** even though it no longer uses it to look up `baseInterval`. Do not remove it from the signature — see design.md Decision 2 for rationale (call-site compatibility, no scope creep).
6. **All 5 `initialGravityState()` call sites in `gameState.ts` must pass the `level` variable already in scope at that call**, which reflects any level-up that occurred earlier in the same function call (from a line clear in that same tick) — not the stale `state.level` from before the tick. See Exact Changes below for line-by-line detail.
7. **`initialGravityState()`'s new `level` parameter is required, not optional.** A missing/undefined level should not be silently defaulted — TypeScript's compiler is the safety net here (a missed call site is a build error), so do not add a default parameter value that would mask a missed call site.
8. **Never use the word "Tetris"** in any source file, comment, test description, or user-facing string (existing project-wide convention observed in prior changes).

## Exact Changes

### `src/engine/gravity.ts`

**Region 1 — `GravityState` interface:** add `pieceDropIntervalMs: number` field with a doc comment (see current fields `gravityAccum`, `lockTimer`, `lockResetCount` at lines 54–64 for the existing doc-comment style to match).

**Region 2 — `initialGravityState()`:** change signature from `initialGravityState(): GravityState` (line 67) to `initialGravityState(level: number): GravityState`. Compute the randomized `pieceDropIntervalMs` using the same clamping approach as `applyGravity()`'s existing lines 102–104:

```typescript
export function initialGravityState(level: number): GravityState {
  const clampedLevel = Math.max(1, Math.min(level, GRAVITY_TABLE.length))
  const baseInterval = GRAVITY_TABLE[clampedLevel - 1] ?? GRAVITY_TABLE[GRAVITY_TABLE.length - 1]!
  const multiplier = 0.5 + Math.random() * 1.0 // [0.5, 1.5)
  const pieceDropIntervalMs = Math.max(1, Math.round(baseInterval * multiplier))

  return {
    gravityAccum: 0,
    lockTimer: -1,
    lockResetCount: 0,
    pieceDropIntervalMs,
  }
}
```

**Region 3 — `applyGravity()`:** remove the existing `clampedLevel` / `baseInterval` lookup (current lines 102–104) and replace with a read of the pinned value:

```typescript
const interval = softDrop
  ? Math.max(1, gravityState.pieceDropIntervalMs / 20)
  : gravityState.pieceDropIntervalMs
```

The rest of the function (the `while (newAccum >= interval)` drain loop, lock-timer logic, and `ApplyGravityResult` construction) is unchanged in structure — just ensure the returned `gravityState` object carries `pieceDropIntervalMs: gravityState.pieceDropIntervalMs` through unchanged (it is never mutated inside `applyGravity`).

**Net line count change:** roughly +10/-4 lines.

### `src/engine/gameState.ts`

Five call sites currently read `gravityState: initialGravityState(),` (verified via direct read of the file at the time this design was written — line numbers may drift slightly if unrelated edits land first, so match by surrounding context, not line number alone):

1. **Line ~130**, inside `createGameState()` — sibling field is `level: 1` in the same object literal; pass `1`.
2. **Line ~285**, hard-drop → game-over branch — pass the local `level` variable (already updated earlier in this code path if a level-up occurred from the line clear on this hard drop).
3. **Line ~302**, hard-drop → successful next-piece spawn branch — pass the local `level` variable.
4. **Line ~360**, gravity-lock → game-over branch — pass the local `level` variable.
5. **Line ~377**, gravity-lock → successful next-piece spawn branch — pass the local `level` variable.

In all cases the `level` variable is already declared and correctly updated earlier in `updateGameState()` (see `let level = state.level` near the top of the function, and the `if (newLevel > prevLevel) { level = newLevel }` blocks in both the hard-drop and gravity-lock code paths) — no new state threading is required, only passing the existing local into the call.

**Net line count change:** 5 lines changed (no additions/deletions beyond adding the argument).

### `src/__tests__/engine/gravity.test.ts`

See tasks.md Task 3.1 for the complete list of required changes: update all `initialGravityState()` calls to pass a level argument; switch tests that need deterministic intervals to direct `GravityState` object construction; add a new `describe('initialGravityState — randomization', ...)` block with range and non-determinism assertions.

**Approximate size change:** +40–60 lines (new randomization test block), ~15 lines modified (existing call-site signature updates).

## Task Dependencies

```
Task 1.1 (GravityState + initialGravityState)
   └─→ Task 1.2 (applyGravity reads pinned interval)
          └─→ Task 2.1 (gameState.ts call sites)
                 └─→ Task 3.1 (gravity.test.ts)
```

1.1 and 1.2 are both edits to `src/engine/gravity.ts` and will typically land in the same commit. 2.1 depends on 1.1 existing (the new required `level` parameter must exist before call sites can be updated to satisfy it) — practically, 1.1/1.2 and 2.1 should be done together since the file won't type-check with only one side updated. 3.1 depends on all of 1.1, 1.2, and 2.1 being in place so the test suite is testing final behavior, not an intermediate state.

## Risk Assessment

### Risk 1: A missed `initialGravityState()` call site in `gameState.ts`
**Likelihood:** Low (only 5 call sites, all within one file)
**Impact:** Build failure (TypeScript strict mode — the new `level` parameter is required, not optional)
**Mitigation:** `npm run build` will fail loudly and point at the exact missed call site. This is a self-checking risk — there is no way for a missed call site to compile silently, since `initialGravityState()` has no default parameter.

### Risk 2: Randomization re-rolled mid-piece instead of pinned at spawn
**Likelihood:** Low if `Math.random()` is placed correctly in `initialGravityState()`, but this is the single most important correctness property of the whole change
**Impact:** Silent behavioral bug — pieces would appear to change fall speed mid-flight instead of having one fixed randomized speed, defeating the point of "pinned for the piece's whole lifetime"
**Mitigation:** `Math.random()` must appear only inside `initialGravityState()`, never inside `applyGravity()`. Task 3.1's "randomized interval is pinned for the piece's lifetime" scenario (see `specs/gravity/spec.md`) should be exercised by a test that calls `applyGravity()` multiple times in a row with the same `GravityState` object's `pieceDropIntervalMs` and confirms it never changes between calls (it shouldn't need to — `applyGravity` doesn't return a mutated `pieceDropIntervalMs`, but a test asserting this explicitly guards against a future regression).

### Risk 3: Off-by-one / wrong `level` value passed at a call site (stale vs. post-level-up)
**Likelihood:** Medium — it's easy to accidentally pass `state.level` (the pre-tick value) instead of the local `level` variable that reflects an in-tick level-up
**Impact:** A piece spawned immediately after leveling up would have its drop interval randomized around the *old* level instead of the new one — a subtle, hard-to-notice bug that doesn't crash anything
**Mitigation:** Explicitly use the local `level` variable (already mutated by the `if (newLevel > prevLevel) { level = newLevel }` blocks) at every call site, not `state.level`. Task 2.1's acceptance criteria calls this out explicitly; a manual code review pass comparing each call site against the design.md Decision reasoning is the primary safeguard (no automated test currently exercises the exact "level-up on the same tick as piece spawn" interaction, since this is pre-existing behavior for `level` itself, not new to this change).

### Risk 4: Rounding pushes a sampled interval outside the `[0.5x, 1.5x)` range in tests
**Likelihood:** Low
**Impact:** Flaky test failure
**Mitigation:** Use inclusive bounds (`>=` and `<=`) in range-assertion tests to tolerate `Math.round()`'s rounding at the exact edges, rather than strict `<` at the upper bound (see design.md Decision 4 and tasks.md Task 3.1).

### Risk 5: `pieceDropIntervalMs` accidentally treated as mutable/recomputed inside `applyGravity()`
**Likelihood:** Low but easy to introduce accidentally if a developer instinctively "modernizes" the function back to a `GRAVITY_TABLE` lookup during a future refactor
**Impact:** Silently reverts the entire feature — pieces would go back to deterministic, non-randomized speeds
**Mitigation:** The new `specs/gravity/spec.md` "Per-piece randomized drop interval" requirement and its "pinned for the piece's lifetime" scenario exist specifically so future changes are checked against this invariant; the test suite's randomization `describe` block (Task 3.1) will catch a regression immediately (sampled values would collapse to `1.0x` deterministic behavior).
