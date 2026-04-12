# Tasks: DAS/ARR Repeat Rate for Arrow Key Held Movement

**Change name:** das-arr-repeat-rate
**Date:** 2026-04-12

Tasks are ordered by dependency. Each task is scoped to be implementable in a single focused session (roughly 20–60 minutes).

---

## Group 1: Input Layer

### Task 1.1 — Add DAS/ARR state machine to `KeyboardInput`
**Layer:** `[input]`

**Description:**
Modify `src/input/keyboard.ts` to implement the full DAS/ARR timing logic for horizontal movement keys (ArrowLeft, ArrowRight). This is the core of the change.

Export two named constants at the top of the file:

```typescript
export const DAS_MS = 133
export const ARR_MS = 50
```

Add a private `DASState` interface (file-scoped, not exported) and a `dasStates: Map<string, DASState>` field on the class:

```typescript
interface DASState {
  dasAccumulator: number
  arrAccumulator: number
  dasTriggered: boolean
}
```

Add a module-level constant:

```typescript
const DAS_KEYS = new Set(['ArrowLeft', 'ArrowRight'])
```

And a module-level map for opposite-key lookup:

```typescript
const OPPOSITE_KEY: Record<string, string> = {
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
}
```

**`keydown` handler changes:** For keys in `DAS_KEYS`, on the initial press (not already in `dasStates`):
1. Cancel the opposite key's DAS state: delete from `dasStates` and `heldKeys`.
2. Add the key to `heldKeys` (existing).
3. Push the initial action to `buffer` (existing — one immediate action on press).
4. Insert a fresh `DASState` into `dasStates`.
5. Return early (do not fall through to non-held-key path).

Browser key-repeat events for a DAS key (key already in `dasStates`) must be silently ignored.

**`keyup` handler changes:** For keys in `DAS_KEYS`, delete from `dasStates` in addition to the existing `heldKeys.delete()`.

**`getHeldActions` signature and implementation:**

```typescript
getHeldActions(deltaMs: number): GameAction[]
```

Logic:
- For each key in `heldKeys`:
  - If the key is NOT in `DAS_KEYS` (i.e., ArrowDown): push action unconditionally (unchanged).
  - If the key IS in `DAS_KEYS`:
    - Retrieve `DASState` from `dasStates`.
    - If `dasTriggered` is false: add `deltaMs` to `dasAccumulator`; if `>= DAS_MS`, set `dasTriggered = true`, reset `arrAccumulator = 0`, push one action.
    - If `dasTriggered` is true: add `deltaMs` to `arrAccumulator`; while `arrAccumulator >= ARR_MS`, subtract `ARR_MS` and push one action.

**`destroy` method:** Clear `dasStates` in addition to the existing cleanup.

**Files:**
- Modify: `src/input/keyboard.ts`

**Acceptance criteria:**
- `DAS_MS` and `ARR_MS` are exported named constants with values 133 and 50 respectively.
- A single ArrowLeft tap still produces exactly one action via `flush()` and zero actions via `getHeldActions(16)`.
- Calling `getHeldActions(100)` while ArrowLeft is held returns `[]` (DAS not yet triggered).
- Calling `getHeldActions(133)` while ArrowLeft is held returns `[MoveLeft]` (DAS fires).
- Calling `getHeldActions(50)` while in ARR phase returns `[MoveLeft]`.
- Releasing ArrowLeft (keyup) clears its entry from `dasStates`.
- ESLint passes; no imports from `renderer/` or `ui/`.

---

### Task 1.2 — Update `TouchInput.getHeldActions` signature
**Layer:** `[input]`

**Description:**
Modify `src/input/touch.ts` to update the `getHeldActions` method signature from `getHeldActions(): GameAction[]` to `getHeldActions(deltaMs: number): GameAction[]`. The parameter is accepted but intentionally ignored — touch held buttons continue to fire every tick. No logic changes.

This is a pure signature alignment task to maintain a consistent interface between `KeyboardInput` and `TouchInput` at the `main.ts` call sites.

**Files:**
- Modify: `src/input/touch.ts`

**Acceptance criteria:**
- `TouchInput.getHeldActions(16)` returns the same results as `getHeldActions()` did before.
- `npm run build` (TypeScript compilation) exits clean.
- ESLint passes.

---

## Group 2: Integration

### Task 2.1 — Update `main.ts` call sites
**Layer:** `[integration]`

**Description:**
Modify `src/main.ts` to pass `LOGIC_TICK_MS` as the `deltaMs` argument to both `getHeldActions` calls. This is a two-line change.

Locate the existing code inside the fixed-timestep `while` loop:

```typescript
const heldActions = [
  ...keyboard.getHeldActions(),
  ...touchInput.getHeldActions(),
]
```

Change it to:

```typescript
const heldActions = [
  ...keyboard.getHeldActions(LOGIC_TICK_MS),
  ...touchInput.getHeldActions(LOGIC_TICK_MS),
]
```

`LOGIC_TICK_MS` is already defined at the top of `main.ts` as `1000 / 60`. No other changes to `main.ts` are required.

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- `npm run build` exits clean (TypeScript call-site type checks pass).
- ESLint passes.
- The game loop logic is otherwise unchanged.

---

## Group 3: Tests

### Task 3.1 — Unit tests for DAS/ARR timing
**Layer:** `[test]`

**Description:**
Create `src/__tests__/input/keyboard.test.ts`. The test file must cover all DAS/ARR behaviors described in the design's test groups. Vitest is already configured with `environment: 'jsdom'`, so `window.addEventListener` is available.

**Test helper pattern:**

```typescript
function pressKey(code: string, options?: Partial<KeyboardEventInit>): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...options }))
}

function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
}
```

Instantiate a fresh `KeyboardInput` before each test (`beforeEach`), call `destroy()` after each test (`afterEach`) to remove event listeners cleanly.

**Required test cases:**

*Group A — Existing behavior regression guard:*
- Single ArrowLeft press: `flush()` returns `[MoveLeft]`; subsequent `getHeldActions(16)` returns `[]` (DAS not elapsed)
- Single KeyX press: `flush()` returns `[RotateCW]`
- Single Space press: `flush()` returns `[HardDrop]`

*Group B — DAS boundary:*
- Hold ArrowLeft, `getHeldActions(100)`: returns `[]` (DAS not triggered at 100 ms)
- Hold ArrowLeft, `getHeldActions(133)`: returns `[MoveLeft]` (DAS triggers at exactly 133 ms)
- Hold ArrowLeft, `getHeldActions(132)` then `getHeldActions(1)`: first returns `[]`, second returns `[MoveLeft]`
- Hold ArrowLeft, `getHeldActions(200)` (exceeds DAS but not DAS + ARR): returns `[MoveLeft]` (one action at DAS trigger; no ARR yet since 200 - 133 = 67 ms < ARR_MS 50... wait: 67 ms >= 50 ms so ARR fires once too; test should expect `[MoveLeft, MoveLeft]` — see note below)

Note on the 200 ms case: At `deltaMs = 200`, DAS triggers (133 ms consumed), leaving 67 ms remainder. `arrAccumulator = 67`, which is >= `ARR_MS (50)`, so one ARR action fires. Total: 2 actions. The test must assert `[MoveLeft, MoveLeft]`.

*Group C — ARR cadence:*
- Hold ArrowLeft, advance past DAS with `getHeldActions(133)`, then `getHeldActions(50)`: second call returns `[MoveLeft]`
- Hold ArrowLeft, advance past DAS, then `getHeldActions(25)` twice: first returns `[]`, second returns `[MoveLeft]`
- Hold ArrowLeft, advance past DAS, then `getHeldActions(100)`: returns `[MoveLeft, MoveLeft]` (two ARR intervals)

*Group D — Reset on release:*
- Hold ArrowLeft, advance past DAS, release, press again, `getHeldActions(100)`: returns `[]` (DAS restarted)

*Group E — Opposite-key cancellation:*
- Hold ArrowLeft, advance past DAS (fire initial ARR actions), then press ArrowRight; `getHeldActions(100)` returns `[]` for left (cancelled) — the left key produces no actions, right key's DAS has not elapsed

*Group F — SoftDrop unchanged:*
- Hold ArrowDown, `getHeldActions(16)`: returns `[SoftDrop]`
- Hold ArrowDown, call `getHeldActions(16)` ten times in a row: each call returns `[SoftDrop]`

*Group G — Constants:*
- `DAS_MS === 133`
- `ARR_MS === 50`

**Files:**
- Create: `src/__tests__/input/keyboard.test.ts`

**Acceptance criteria:**
- All test cases in groups A–G pass with `npm run test`.
- No existing engine test files are modified.
- `npm run test:coverage` exits 0 (coverage thresholds remain satisfied).

---

## Task Ordering Summary

```
1.1 (keyboard.ts)  ──┐
1.2 (touch.ts)     ──┤──→ 2.1 (main.ts) ──→ 3.1 (tests)
```

Tasks 1.1 and 1.2 can be done in parallel but both must be complete before 2.1 (main.ts must compile against the new signatures). Task 3.1 requires both 1.1 and 2.1 to be complete (tests import from keyboard.ts and exercise the game through main's logic tick).

In practice, a single developer will work them top-to-bottom: 1.1 → 1.2 → 2.1 → 3.1.
