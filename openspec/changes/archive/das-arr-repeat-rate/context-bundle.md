# Context Bundle: DAS/ARR Repeat Rate for Arrow Key Held Movement

**Change name:** das-arr-repeat-rate
**Date:** 2026-04-12
**For:** Developer agent — consume this before beginning implementation.

---

## What to Build

Add Delayed Auto Shift (DAS) and Auto Repeat Rate (ARR) timing to the keyboard input handler. The goal is to make horizontal piece movement feel controllable: a tap moves exactly one column; a held key starts auto-repeating after a ~133 ms delay, then fires every ~50 ms.

This is a small, well-bounded change. Only three source files change and one new test file is created. The engine, renderer, and UI layers are completely untouched.

---

## Critical Constraints

1. **`engine/` must not be touched.** The engine receives `GameAction[]` per tick and has no awareness of whether an action came from a tap, DAS, or ARR. This boundary must not be crossed.

2. **`input/` must not import from `renderer/` or `ui/`.** The ESLint `no-restricted-imports` rule enforces this. `keyboard.ts` already complies; do not introduce any new imports.

3. **`deltaMs` must come from the caller, not from a clock.** `KeyboardInput` must not call `performance.now()` internally. The caller (`main.ts`) owns the clock. This is what makes the class testable with synthetic deltas.

4. **SoftDrop (ArrowDown) behavior is unchanged.** ArrowDown is in `HELD_ACTION_KEYS` and continues to fire every tick. Do not add DAS/ARR logic for it.

5. **`TouchInput.getHeldActions` signature changes but behavior does not.** The `deltaMs` parameter is accepted and ignored in `touch.ts`. Do not add DAS/ARR accumulator logic to `touch.ts`.

6. **Never use the word "Tetris"** in any source file, comment, test description, or user-facing string.

---

## Exact Changes

### `src/input/keyboard.ts`

**Region 1 — New exports at top of file (before class definition):**
```typescript
export const DAS_MS = 133
export const ARR_MS = 50
```

**Region 2 — New module-level constants (after the existing constants):**
```typescript
const DAS_KEYS = new Set(['ArrowLeft', 'ArrowRight'])
const OPPOSITE_KEY: Record<string, string> = {
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
}
```

**Region 3 — New file-scoped interface (before or inside class, not exported):**
```typescript
interface DASState {
  dasAccumulator: number
  arrAccumulator: number
  dasTriggered: boolean
}
```

**Region 4 — New private field on `KeyboardInput` class:**
```typescript
private dasStates: Map<string, DASState> = new Map()
```

**Region 5 — `keydown` handler: extend the DAS-key branch.** Currently the handler checks `if (HELD_ACTION_KEYS.has(e.code))`. This must be split into:
- If key is in `DAS_KEYS`: apply DAS logic (cancel opposite, create DASState, buffer initial action). Return.
- If key is ArrowDown (or any future held-non-DAS key): existing behavior (add to heldKeys, buffer action on initial press). Return.
- Non-held keys: unchanged.

**Region 6 — `keyup` handler: add DAS cleanup:**
Add `this.dasStates.delete(e.code)` alongside the existing `this.heldKeys.delete(e.code)`.

**Region 7 — `getHeldActions` signature and body:** Full replacement of the existing method. See design §3.4 for the complete algorithm.

**Region 8 — `destroy` method:** Add `this.dasStates.clear()`.

**Net line count change:** approximately +30–40 lines.

---

### `src/input/touch.ts`

**Region 1 — `getHeldActions` signature only:**

Change:
```typescript
getHeldActions(): GameAction[]
```
To:
```typescript
getHeldActions(_deltaMs: number): GameAction[]
```

The underscore prefix on `_deltaMs` signals intentionally unused parameter and suppresses the TypeScript `noUnusedParameters` lint rule.

**Net line count change:** 1 line.

---

### `src/main.ts`

**Region 1 — Two call sites inside the fixed-timestep while loop:**

Change:
```typescript
const heldActions = [
  ...keyboard.getHeldActions(),
  ...touchInput.getHeldActions(),
]
```
To:
```typescript
const heldActions = [
  ...keyboard.getHeldActions(LOGIC_TICK_MS),
  ...touchInput.getHeldActions(LOGIC_TICK_MS),
]
```

**Net line count change:** 2 lines changed (no additions or deletions).

---

### `src/__tests__/input/keyboard.test.ts` (new file)

Full new test file. See tasks.md Task 3.1 for the complete list of test cases. Use the `jsdom` environment (already in `vitest.config.ts`). Use `beforeEach`/`afterEach` to create/destroy `KeyboardInput` per test to avoid listener leakage between tests.

**Approximate size:** 120–160 lines.

---

## Task Dependencies

```
Task 1.1 (keyboard.ts)
  └─→ Task 2.1 (main.ts)   [main.ts must call the new signature; needs 1.1 to compile]
  └─→ Task 3.1 (tests)     [tests import DAS_MS, ARR_MS from keyboard.ts]

Task 1.2 (touch.ts)
  └─→ Task 2.1 (main.ts)   [main.ts calls both getHeldActions; touch must accept the arg]

Task 2.1 (main.ts)
  └─→ Task 3.1 (tests)     [integration tests may spin up the game loop]
```

Execution order: **1.1 → 1.2 → 2.1 → 3.1**

Tasks 1.1 and 1.2 are independent of each other and can be done in either order or in parallel, but both must be complete before 2.1 (TypeScript compilation requires both signatures to be updated before `main.ts` can compile).

---

## Risk Assessment

### Risk 1: `noUnusedParameters` TS error in `touch.ts`
**Likelihood:** High (it is a known TypeScript strict-mode behavior)
**Impact:** Build failure
**Mitigation:** Prefix the parameter with an underscore: `_deltaMs: number`. TypeScript treats underscore-prefixed parameters as intentionally unused and suppresses the error.

### Risk 2: Accumulator state not cleared on `destroy()`
**Likelihood:** Low (easy oversight)
**Impact:** Memory leak if `KeyboardInput` is recreated (e.g., during a game restart flow)
**Mitigation:** Task 1.1 acceptance criteria explicitly require `destroy()` to call `this.dasStates.clear()`.

### Risk 3: Test listener leak between test cases
**Likelihood:** Medium (common Vitest/jsdom pitfall)
**Impact:** Tests interfere with each other; intermittent failures
**Mitigation:** Always instantiate `KeyboardInput` in `beforeEach` and call `destroy()` in `afterEach`. Documented in Task 3.1.

### Risk 4: Off-by-one at DAS/ARR boundary in single large delta
**Likelihood:** Low but subtle
**Impact:** An extra unexpected action fired or missed at the exact `DAS_MS` boundary
**Mitigation:** The `>=` comparisons in the state machine are inclusive. The "200 ms in one delta" test case in Group B specifically exercises the boundary where DAS triggers and ARR immediately fires within the same call. This case is counterintuitive; the test comment should explain the arithmetic.

### Risk 5: Browser key-repeat events sneaking through
**Likelihood:** Low (current code already guards against this)
**Impact:** Extra initial actions on held keys
**Mitigation:** The existing guard (`if (!this.heldKeys.has(e.code))`) already prevents browser key-repeat from adding to the buffer. The new DAS logic checks `if (!this.dasStates.has(e.code))` — the equivalent guard for the DAS path. Both guards must be present.

### Risk 6: Opposite-key cancellation race condition
**Likelihood:** Low
**Impact:** Both MoveLeft and MoveRight actions appear in the same tick
**Mitigation:** Opposite-key cancellation happens synchronously in `keydown` before the new key's DAS state is created. At `getHeldActions` time, the cancelled key is already absent from `heldKeys` and `dasStates`.

---

## Integration with the Existing Loop

The fixed-timestep loop in `main.ts` already cleanly separates `flush()` (one-shot actions) from `getHeldActions()` (continuous actions). DAS/ARR fits entirely within the existing `getHeldActions` call — no changes to the loop structure, the deduplication logic, or the engine API are needed.

The deduplication step (`deduplicateActions`) that follows remains correct: even in the unlikely case that both `flush()` and `getHeldActions()` contain the same action in the same tick (which should not happen given the updated logic), deduplication ensures the engine sees it at most once.
