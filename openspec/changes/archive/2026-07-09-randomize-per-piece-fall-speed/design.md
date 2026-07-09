# Design: Randomize Per-Piece Fall Speed Around the Level Curve

**Change name:** randomize-per-piece-fall-speed
**Date:** 2026-07-09

---

## Context

`src/engine/gravity.ts` owns all falling-block gravity and lock-delay logic. Its two public entry points are `initialGravityState()` (called on every piece spawn/reset) and `applyGravity()` (called once per logic tick from `updateGameState()` in `src/engine/gameState.ts`).

Today `applyGravity()` recomputes `baseInterval = GRAVITY_TABLE[clampedLevel - 1]` fresh on every tick from the `level` argument it's passed. Because `level` is stable for the lifetime of a piece (it only changes on line-clear-triggered level-ups, which happen at piece-lock boundaries, not mid-piece), every tick for a given piece currently derives the exact same `baseInterval`. The goal of this change is to instead pin one randomized interval at piece-spawn time and hold it fixed for that piece's entire lifetime, so consecutive pieces at the same level fall at different (but level-appropriate) speeds.

The engine is intentionally pure (`updateGameState` takes `state` + `actions` + `dtMs` and returns new `state` + `events`, no module-level mutable state, no side effects other than the explicitly-accepted non-determinism of `Math.random()` in the 7-bag randomizer). This change must preserve that purity model — `Math.random()` calls are acceptable (per existing precedent) but must happen exactly once per piece spawn, not per tick, to keep the "pinned for piece lifetime" invariant simple and auditable.

## Goals / Non-Goals

**Goals:**
- Each spawned piece gets a single randomized drop interval in `[0.5x, 1.5x)` of `GRAVITY_TABLE[level-1]`, pinned for its whole lifetime.
- `applyGravity()` becomes a pure consumer of the pinned interval — no more `GRAVITY_TABLE` lookups inside the per-tick hot path.
- Soft drop's 20x multiplier, lock delay, and level clamping behavior are bit-for-bit unchanged relative to today, just applied on top of a different (randomized instead of fixed) base interval.
- All 5 call sites of `initialGravityState()` in `gameState.ts` correctly pass the current `level` in scope at that point in the function.

**Non-Goals:**
- Not changing `GRAVITY_TABLE` values or the level formula (`Math.floor(lines / 10) + 1`).
- Not adding seeded/reproducible randomness — plain `Math.random()`, consistent with the existing 7-bag randomizer precedent.
- Not exposing `pieceDropIntervalMs` to the renderer, HUD, or any UI surface.
- Not changing `LOCK_DELAY_MS`, `MAX_LOCK_RESETS`, or `resetLockTimer()` in any way.

## Decisions

### Decision 1: Randomize in `initialGravityState()`, not in a separate "spawn" hook

**Choice:** Move the randomization into `initialGravityState(level: number)` itself, since that is already the single function called at every piece-spawn boundary (game start, post-hard-drop spawn, post-gravity-lock spawn, and the two game-over transitions where a "next" gravity state still needs a well-formed value even though no piece will use it).

**Why:** `initialGravityState()` is already the canonical "new piece begins" signal in this codebase — there is no separate `onPieceSpawn` hook, and introducing one would be a larger, riskier change than extending the existing function's signature. This keeps the diff minimal and keeps all piece-spawn state initialization (`gravityAccum: 0`, `lockTimer: -1`, `lockResetCount: 0`, and now `pieceDropIntervalMs`) in one place.

**Alternative considered:** Compute the randomized interval lazily inside `applyGravity()` the first time it's called for a "fresh" state (e.g., when `gravityAccum === 0 && lockTimer === -1`). Rejected: this conflates "freshly spawned" with "just happens to have zero accumulator," which is not a reliable signal (a piece could legitimately have `gravityAccum === 0` mid-lifetime right after consuming a full interval). Pinning explicitly at construction time in `initialGravityState()` is simpler and unambiguous.

### Decision 2: `applyGravity()` keeps the `level` parameter even though it no longer needs it for `baseInterval`

**Choice:** Do not remove the `level: number` parameter from `applyGravity()`'s signature.

**Why:** Removing it would be an additional breaking signature change beyond what's required, with no functional benefit — the parameter costs nothing to keep, preserves call-site compatibility at `gameState.ts:310` (`applyGravity(gravityState, board, piece, dtMs, level, softDrop)`), and leaves the door open for `level` to matter again in the future (e.g., level-dependent lock delay) without another signature churn. The contract layer in the proposal explicitly keeps `applyGravity(gravityState, ...args)` — this preserves that.

**Alternative considered:** Drop `level` from `applyGravity()` since it's now unused internally. Rejected as unnecessary scope creep — the task is to pin the interval at spawn time, not to minimize every parameter list.

### Decision 3: Randomization formula and clamping

**Choice:**
```typescript
const clampedLevel = Math.max(1, Math.min(level, GRAVITY_TABLE.length))
const baseInterval = GRAVITY_TABLE[clampedLevel - 1] ?? GRAVITY_TABLE[GRAVITY_TABLE.length - 1]!
const multiplier = 0.5 + Math.random() * 1.0 // [0.5, 1.5)
const pieceDropIntervalMs = Math.max(1, Math.round(baseInterval * multiplier))
```

**Why:**
- The `clampedLevel` logic is copy-identical to what `applyGravity()` already does for `level` — reusing it in `initialGravityState()` keeps clamping semantics consistent between the two functions (a level of `0`, negative, or `> 20` behaves the same way in both places).
- `Math.max(1, ...)` mirrors the existing soft-drop clamp (`Math.max(1, baseInterval / 20)`), so the minimum-interval invariant (never `0` or negative, which would cause an infinite/runaway `while` loop in `applyGravity()`) is preserved for the new randomized value too. At level 20 (`baseInterval = 1`), the worst case is `1 * 0.5 = 0.5`, which without the floor would round to `0` or `1` depending on rounding — the explicit `Math.max(1, ...)` removes any ambiguity.
- `Math.round(...)` keeps `pieceDropIntervalMs` an integer, consistent with `GRAVITY_TABLE`'s integer millisecond values and with `dtMs`'s integer-ms usage pattern elsewhere in the engine. This is a minor implementation choice, not a hard requirement from the proposal — but avoids introducing floating-point intervals into a codebase that otherwise uses whole milliseconds throughout gravity/timing logic.

**Alternative considered:** `0.5 + Math.random()` inclusive of 1.5 exactly at the boundary (`Math.random()` returns `[0, 1)`, so `0.5 + Math.random() * 1.0` naturally yields `[0.5, 1.5)`, never reaching `1.5` exactly). This matches the proposal's stated "0.5x–1.5x" range as a half-open interval, which is the natural and simplest mapping from `Math.random()`'s own `[0, 1)` contract — no special-casing needed.

### Decision 4: Test strategy for `gravity.test.ts`

**Choice:** Two complementary approaches, applied per test:
1. Tests that only care about lock-delay, collision-blocking, or level-clamping behavior at a *known* interval should construct `GravityState` directly (object literal) with an explicit `pieceDropIntervalMs`, bypassing `initialGravityState()`'s randomness entirely. This is already the pattern used by the existing `resetLockTimer` "cap reached" test, which constructs a `GravityState` object literal directly (`gravStateAtCap`) rather than calling `initialGravityState()`.
2. Tests that specifically exercise `initialGravityState(level)`'s randomization (a new `describe` block) should call it many times (e.g., 200 iterations) and assert every result falls within `[0.5 * base, 1.5 * base]` (inclusive bounds for the assertion, since floating-point/rounding could land exactly on either edge), and — for an even stronger non-determinism check — assert that not all sampled values are identical.

**Why:** This keeps the majority of the existing test suite (drop timing under a fixed known interval, lock delay expiry, collision blocking, level clamping) fully deterministic and unchanged in spirit, while adding focused new coverage for the randomization itself. It avoids the flakiness trap of asserting exact equality against a `Math.random()`-derived value, and avoids weakening existing lock-delay/collision assertions into ranges where no randomness is actually involved.

**Alternative considered:** Mock `Math.random()` globally (e.g., `vi.spyOn(Math, 'random').mockReturnValue(0.5)`) to make `initialGravityState()` deterministic in every test. Rejected as the primary strategy because it would require touching every existing test that calls `initialGravityState()` (over a dozen call sites) just to add mock setup/teardown boilerplate, for tests that don't otherwise care about the interval's exact value. Direct `GravityState` object construction is simpler and requires no global mocking machinery. A `Math.random()` mock may still be useful for the one or two tests that want to assert an exact `pieceDropIntervalMs` from a known random draw, but is not required project-wide.

## Risks / Trade-offs

- **[Risk] Missed call site** — if any of the 5 `initialGravityState()` call sites in `gameState.ts` is missed and left calling `initialGravityState()` with no argument, this is a TypeScript compile error (the parameter becomes required), not a silent runtime bug. → **Mitigation:** `npm run build` (TypeScript strict mode, per this repo's existing `tsconfig`) will fail loudly on any missed call site before the task can be considered done. This is a strong, low-cost safety net for a breaking signature change.
- **[Risk] Flaky new randomization tests** — asserting "not all sampled values are identical" across N samples has a theoretical (astronomically small) chance of false failure if `Math.random()` returns the same float N times in a row. → **Mitigation:** use a large-enough sample size (e.g., 200) that the false-failure probability is negligible, consistent with how this kind of property is normally tested; do not assert on a single sample.
- **[Risk] `Math.round()` at level 20 boundary** — `baseInterval = 1` at level 20; `0.5 * 1 = 0.5`, which without care could round to `0`. → **Mitigation:** the explicit `Math.max(1, Math.round(...))` clamp (order: round first, then floor at 1) guarantees the result is never below `1`, matching the existing soft-drop minimum-interval invariant and preventing a divide-by-near-zero-style runaway loop in `applyGravity()`'s `while (newAccum >= interval)` drain loop.
- **[Trade-off] Slightly less predictable manual QA** — a developer/tester manually verifying "level 5 pieces fall in exactly 355ms" will now see variance. This is the intended product behavior per the proposal's acceptance criteria, not a defect, but is worth calling out so `npm run test` (not manual timing observation) remains the source of truth for correctness.
