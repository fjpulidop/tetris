# Proposal: Randomize Per-Piece Fall Speed Around the Level Curve

**Change name:** randomize-per-piece-fall-speed
**Ticket:** #3 — Randomize per-piece fall speed around the level curve
**Estimated complexity:** Low (half-day)
**Date:** 2026-07-09

---

## Why

Drop speed is currently fully deterministic: `applyGravity()` in `src/engine/gravity.ts` looks up a fixed `GRAVITY_TABLE[level - 1]` interval (ms per row) and reuses that exact interval for every piece at a given level. Every piece at level 5 falls at precisely the same speed as every other piece at level 5, with no variation. This makes gameplay feel metronomic within a level — players can fully predict fall timing after the first piece, which reduces tension and doesn't match the slightly irregular feel players expect from more organic drop timing. The fix is small, self-contained to the engine's gravity module, and does not touch the level-progression curve itself.

## What Changes

- `GravityState` (in `src/engine/gravity.ts`) gains a new field, `pieceDropIntervalMs: number`, holding the randomized interval pinned for the current piece's whole lifetime.
- `initialGravityState()` changes signature from `(): GravityState` to `(level: number): GravityState` — **BREAKING** (all callers must now pass the current level). It rolls a random multiplier in `[0.5, 1.5)` via `Math.random()`, applies it to `GRAVITY_TABLE[clampedLevel - 1]`, and clamps the result to a minimum of 1ms (mirroring the existing soft-drop clamp), storing it as `pieceDropIntervalMs`.
- `applyGravity()` no longer recomputes `baseInterval` from `GRAVITY_TABLE[level - 1]` on every tick. It reads `gravityState.pieceDropIntervalMs` as the base interval instead. The `level` parameter is still accepted (used for the `clampedLevel` in `initialGravityState`, and kept in the signature for call-site compatibility and any future consumers), and soft drop's existing 20x multiplier is applied on top of `pieceDropIntervalMs` exactly as it was applied on top of `baseInterval` before.
- Every call site of `initialGravityState()` in `src/engine/gameState.ts` (5 call sites: initial game creation, and 4 piece-spawn/game-over transitions after hard-drop and after gravity-triggered lock) is updated to pass the in-scope `level` variable.
- `src/__tests__/engine/gravity.test.ts` is updated: tests that assert an exact fixed interval per level are changed to assert a range (`[0.5x, 1.5x]` of `GRAVITY_TABLE[level-1]`) or to construct `GravityState` objects directly with a known `pieceDropIntervalMs` to keep deterministic assertions where randomization is not what's under test.

## Capabilities

### New Capabilities
- `gravity`: Codifies the falling-block gravity, lock-delay, and (new) per-piece randomized drop-speed mechanics as a first-class spec. No `openspec/specs/` directory exists yet in this project, so this is the first spec file for the gravity/drop-speed area; it captures both pre-existing behavior (level-based base interval, soft drop multiplier, lock delay) and the new per-piece randomization requirement in one coherent capability.

### Modified Capabilities
_(none — no existing spec files in `openspec/specs/` reference gravity behavior)_

## Impact

- **Affected code:** `src/engine/gravity.ts` (core logic), `src/engine/gameState.ts` (5 call sites), `src/__tests__/engine/gravity.test.ts` (test updates).
- **Affected API:** `initialGravityState()` signature change is a breaking change to an internal engine API. It is not exported outside `src/engine/`, and `gameState.ts` is the only consumer, so the blast radius is fully contained within this repository — no downstream/external consumers exist.
- **Not affected:** `GRAVITY_TABLE` values, `LOCK_DELAY_MS`, `MAX_LOCK_RESETS`, soft drop's 20x multiplier logic, the 7-bag randomizer, rendering, input, or audio layers.
- **Non-determinism:** This follows the existing precedent of the 7-bag randomizer (`src/engine/pieceBag.ts`, already `Math.random()`-based and documented in `gameState.ts` as intentionally non-deterministic "per spec"). No seeded/reproducible RNG is introduced; `gravity.test.ts` assertions must tolerate this.

## Scope

### In scope
- `src/engine/gravity.ts` — `GravityState.pieceDropIntervalMs`, `initialGravityState(level)`, `applyGravity()` reading the pinned interval
- `src/engine/gameState.ts` — pass `level` at all 5 `initialGravityState()` call sites
- `src/__tests__/engine/gravity.test.ts` — update fixed-interval assertions to ranges or direct `GravityState` construction

### Out of scope
- Soft drop's 20x speed-up multiplier and lock delay (`LOCK_DELAY_MS`, `MAX_LOCK_RESETS`) — unchanged
- The `GRAVITY_TABLE` level curve itself — unchanged; this only adds jitter around it, not a replacement for level-based progression
- Seeded/reproducible RNG — plain `Math.random()` only; runs remain non-reproducible
- Any piece-corner-radius visual spec — purely a gameplay mechanics change, no rendering changes

## Non-goals

This change does not alter the average or expected fall speed per level (the mean of a uniform `[0.5, 1.5)` multiplier is 1.0x, so `GRAVITY_TABLE` remains the governing curve on average). It does not add configuration for the jitter range, does not persist or expose the randomized interval to the UI/HUD, and does not change how levels are computed from cleared lines.

## Acceptance Criteria

1. Each newly spawned piece gets its own randomized drop interval, computed once at spawn and centered on that level's `GRAVITY_TABLE` base value, within a `[0.5x, 1.5x)` range.
2. Two consecutive pieces at the same level can fall at different speeds (non-deterministic, but each individually within the `[0.5x, 1.5x)` band).
3. Soft drop's 20x speed multiplier still applies on top of the piece's randomized interval (i.e., `effectiveInterval = softDrop ? max(1, pieceDropIntervalMs / 20) : pieceDropIntervalMs`).
4. Lock delay behavior (`LOCK_DELAY_MS`, `MAX_LOCK_RESETS`) is unchanged — verified by existing lock-delay tests continuing to pass unmodified.
5. `GRAVITY_TABLE` level progression still governs the average/base speed per level — no changes to the table's values or indexing.
6. `gravity.test.ts` is updated so all tests pass against the new randomized-interval behavior, with no loss of meaningful coverage (lock delay, level clamping, and collision-blocking tests remain deterministic).
7. `npm run build` and `npm run test` exit clean.
