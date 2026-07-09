---
agent: developer
feature: randomize-per-piece-fall-speed
tags: [testing, determinism, gravity, breaking-change]
date: 2026-07-09
---

## Decision

Used `pieceDropIntervalMs: 1000` as the fixed placeholder value for the 7 pre-existing `GravityState` object literals in `src/__tests__/engine/gameState.test.ts` that became compile errors after adding the new required field.

## Why This Approach

`tasks.md` scoped this change to 3 files (`gravity.ts`, `gameState.ts`, `gravity.test.ts`), but adding a required field to `GravityState` is a breaking interface change that TypeScript strict mode caught at 7 additional call sites in `gameState.test.ts` — object literals directly constructing `GravityState` to simulate a piece already deep into its lock-delay countdown. These tests assert on lock-timer expiry behavior (a piece locking after `dtMs` exceeds the remaining `lockTimer`), not on drop-interval/gravity-tick behavior, so the exact `pieceDropIntervalMs` value is inert to their assertions as long as it's a valid positive number. `1000` was chosen because it matches level 1's `GRAVITY_TABLE` base interval, making the literal read naturally as "a normal, unremarkable piece" to future readers.

This fix was necessary to satisfy the acceptance criterion "`npm run build` and `npm run test` exit clean," even though `gameState.test.ts` wasn't in tasks.md's explicit file list — an unavoidable consequence of the breaking `GravityState` signature change from task 1.1.

## Alternatives Considered

- Leaving these literals unfixed and treating them as pre-existing/out-of-scope — rejected: `npm run build` fails with real compile errors (TS2741) at these exact lines, which are new build breaks introduced by my change to `GravityState`, not pre-existing failures.
- Using a randomized/varied value per literal — rejected: unnecessary complexity for tests that don't assert on the drop interval at all; a single consistent placeholder is more readable.

## See Also

[[2026-07-09-developer-test-strategy-fixed-vs-randomized-gravitystate]]
