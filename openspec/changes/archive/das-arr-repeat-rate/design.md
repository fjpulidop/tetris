# Design: DAS/ARR Repeat Rate for Arrow Key Held Movement

**Change name:** das-arr-repeat-rate
**Date:** 2026-04-12

---

## 1. Scope of Change

This is a tightly bounded change within the `input/` layer and the integration point in `main.ts`. No engine, renderer, or UI files are touched. The engine continues to receive a flat `GameAction[]` per tick — the DAS/ARR logic is purely an input-layer concern.

Affected files:

| File | Change type | Summary |
|---|---|---|
| `src/input/keyboard.ts` | Modify | Add DAS/ARR state machine; change `getHeldActions` signature |
| `src/input/touch.ts` | Modify | Signature update only — `getHeldActions(deltaMs: number)` |
| `src/main.ts` | Modify | Pass `LOGIC_TICK_MS` to both `getHeldActions(LOGIC_TICK_MS)` calls |
| `src/__tests__/input/keyboard.test.ts` | Create | Unit tests for DAS/ARR timing |

---

## 2. Constants

```typescript
/** Delayed Auto Shift — ms before auto-repeat begins after initial press. */
export const DAS_MS = 133

/** Auto Repeat Rate — ms between repeat actions once DAS has triggered. */
export const ARR_MS = 50
```

These are exported named constants so they can be referenced in tests, configuration, and any future settings screen without magic numbers. They live at the top of `keyboard.ts`, before the class definition.

**Rationale for 133 ms / 50 ms:** These match the Guideline-approximate defaults used by Tetrio and Jstris. DAS_MS = 133 is 8 frames at 60 Hz; ARR_MS = 50 is 3 frames at 60 Hz. They are fast enough for aggressive play but slow enough that tapping a key lands exactly one column.

---

## 3. DAS/ARR State Machine

### 3.1 State shape

A new private type tracks per-key DAS/ARR progress. Only horizontal keys (ArrowLeft, ArrowRight) participate.

```typescript
interface DASState {
  dasAccumulator: number   // ms elapsed since key was first pressed; resets never (once DAS fires, stays triggered)
  arrAccumulator: number   // ms elapsed since last ARR action was fired
  dasTriggered: boolean    // true once dasAccumulator >= DAS_MS
}
```

The map is keyed by the browser `KeyboardEvent.code` string:

```typescript
private dasStates: Map<string, DASState> = new Map()
```

Only ArrowLeft and ArrowRight are tracked in `dasStates`. ArrowDown continues to use the existing `heldKeys` Set and fires every tick from `getHeldActions`.

### 3.2 Set of DAS-tracked keys

```typescript
const DAS_KEYS = new Set(['ArrowLeft', 'ArrowRight'])
```

This is a module-level constant. It is distinct from `HELD_ACTION_KEYS` (which includes ArrowDown).

### 3.3 Key event handlers

**`keydown` for DAS keys:**

```
if key is in DAS_KEYS:
  if NOT already in dasStates:
    - cancel the opposite key's DAS state (opposite-key cancellation)
    - add key to heldKeys (existing)
    - push the immediate action to buffer (existing — initial press)
    - create a fresh DASState { dasAccumulator: 0, arrAccumulator: 0, dasTriggered: false }
    - store in dasStates
  // browser repeat events for this key: already in dasStates, so ignore
  return
```

**Opposite-key cancellation:**

```
const OPPOSITE: Record<string, string> = {
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
}
const opposite = OPPOSITE[e.code]
if (opposite && dasStates.has(opposite)) {
  dasStates.delete(opposite)
  heldKeys.delete(opposite)
}
```

This ensures that if the player sweeps left→right quickly, the right-press immediately cancels the left DAS/ARR without waiting for a keyup.

**`keyup` for DAS keys:**

```
if key is in DAS_KEYS:
  dasStates.delete(key)
  heldKeys.delete(key)  // existing
```

### 3.4 `getHeldActions(deltaMs: number): GameAction[]`

This is where the DAS/ARR logic runs each tick.

```
actions = []

for each key in heldKeys:
  action = KEY_ACTION_MAP[key]
  if action is undefined: continue

  if key is NOT in DAS_KEYS:
    // ArrowDown and any future held keys: fire every tick (unchanged)
    actions.push(action)
    continue

  // DAS/ARR path
  state = dasStates.get(key)
  if state is undefined: continue  // defensive; should not happen

  if NOT state.dasTriggered:
    state.dasAccumulator += deltaMs
    if state.dasAccumulator >= DAS_MS:
      state.dasTriggered = true
      state.arrAccumulator = 0
      // Fire one action immediately when DAS triggers
      actions.push(action)
    // else: still in DAS hold-off phase — do not fire
    continue

  // ARR phase
  state.arrAccumulator += deltaMs
  while state.arrAccumulator >= ARR_MS:
    state.arrAccumulator -= ARR_MS
    actions.push(action)

return actions
```

**Key design choices:**

1. **One action at DAS trigger:** When DAS fires, one action is pushed immediately. The ARR accumulator starts at 0, so the next ARR action fires `ARR_MS` ms later — not sooner. This prevents an unintended double-movement at the DAS boundary.

2. **`while` loop for ARR:** If a tick delta happens to be larger than `ARR_MS` (e.g., a dropped frame), the loop fires multiple actions. In normal 60 Hz operation with `LOGIC_TICK_MS = 16.67 ms`, the while body never executes more than once per tick since `ARR_MS (50) > LOGIC_TICK_MS (16.67)`. This is a correctness guarantee, not a performance concern.

3. **ARR accumulator is NOT reset between ticks** — it carries over. This means the cadence is measured in wall-clock time, not tick-count. At 60 Hz, an ARR action fires every 3 ticks (50 ms / 16.67 ms ≈ 3).

4. **`dasAccumulator` is never reset to 0 once DAS triggers** — `dasTriggered` is the permanent gate. There is no reason to reset `dasAccumulator` after DAS has fired; the boolean flag is sufficient.

---

## 4. API Changes

### 4.1 `KeyboardInput.getHeldActions`

Before:
```typescript
getHeldActions(): GameAction[]
```

After:
```typescript
getHeldActions(deltaMs: number): GameAction[]
```

`deltaMs` is the elapsed time for this logic tick in milliseconds. In the fixed-timestep loop this is always `LOGIC_TICK_MS = 16.667 ms`.

### 4.2 `TouchInput.getHeldActions`

Before:
```typescript
getHeldActions(): GameAction[]
```

After:
```typescript
getHeldActions(deltaMs: number): GameAction[]
```

The parameter is accepted but ignored inside `TouchInput`. Touch held buttons continue to fire every tick. DAS/ARR is not applied to touch because the virtual buttons already have natural finger-press latency, and implementing DAS/ARR for touch would require touch-specific accumulator state that adds complexity without a clear user benefit.

The signature change is required for a consistent interface — both input handlers are called identically from `main.ts`.

### 4.3 `main.ts` call sites

Before:
```typescript
const heldActions = [
  ...keyboard.getHeldActions(),
  ...touchInput.getHeldActions(),
]
```

After:
```typescript
const heldActions = [
  ...keyboard.getHeldActions(LOGIC_TICK_MS),
  ...touchInput.getHeldActions(LOGIC_TICK_MS),
]
```

No other changes to `main.ts` are required. `LOGIC_TICK_MS` is already defined at the top of the file.

---

## 5. Data Flow (Updated)

```
keydown event
     │
     ▼
KeyboardInput.onKeyDown
  ├── DAS key (ArrowLeft / ArrowRight):
  │     - if first press: buffer immediate action, create DASState, cancel opposite
  │     - if browser repeat: skip (key already in dasStates)
  └── non-DAS key: buffer action as before
          │
          ▼
     KeyboardInput state:
       heldKeys: Set<string>
       dasStates: Map<string, DASState>
          │
          ▼ (called each logic tick by main.ts)
KeyboardInput.getHeldActions(deltaMs)
  ├── ArrowDown → push action (unchanged)
  ├── DAS key in DAS phase → accumulate, no action
  ├── DAS key at DAS trigger → push 1 action, start ARR
  └── DAS key in ARR phase → push 1 action per ARR_MS interval
          │
          ▼
     GameAction[] → main.ts → engine
```

---

## 6. Test Design

Tests live in `src/__tests__/input/keyboard.test.ts`. Since `KeyboardInput` attaches to `window`, tests must run in a `jsdom` environment (already configured in `vitest.config.ts`).

The test approach is to instantiate a `KeyboardInput`, dispatch synthetic `KeyboardEvent` objects on `window`, call `getHeldActions(deltaMs)` with controlled deltas, and assert the returned action arrays.

### Test groups

**Group A — Existing behavior (regression guard)**
- Single keypress of ArrowLeft: one action via `flush()`, zero via `getHeldActions(0)`
- RotateCW (KeyX): one action via `flush()`
- HardDrop (Space): one action via `flush()`

**Group B — DAS boundary**
- Hold ArrowLeft, call `getHeldActions(100)` (< 133 ms): returns `[]`
- Hold ArrowLeft, call `getHeldActions(133)` (exactly 133 ms): returns `[MoveLeft]`
- Hold ArrowLeft, call `getHeldActions(132)` then `getHeldActions(1)`: returns `[]` then `[MoveLeft]`
- Hold ArrowLeft, call `getHeldActions(200)` (> 133 ms): returns `[MoveLeft]` (one action at DAS trigger only — ARR not yet elapsed)

**Group C — ARR cadence**
- Hold ArrowLeft, advance past DAS, then call `getHeldActions(50)`: returns `[MoveLeft]`
- Hold ArrowLeft, advance past DAS, then call `getHeldActions(25)` twice: first returns `[]`, second returns `[MoveLeft]`
- Hold ArrowLeft, advance past DAS, then call `getHeldActions(100)`: returns `[MoveLeft, MoveLeft]` (two ARR intervals)

**Group D — Reset on release**
- Hold ArrowLeft past DAS, release (keyup), press again, call `getHeldActions(100)`: returns `[]` (DAS restarted from 0)

**Group E — Opposite-key cancellation**
- Hold ArrowLeft past DAS; press ArrowRight; call `getHeldActions(100)`: returns `[]` for left (cancelled), no action yet for right (new DAS)

**Group F — SoftDrop unchanged**
- Hold ArrowDown, call `getHeldActions(16)`: returns `[SoftDrop]`
- Hold ArrowDown, call `getHeldActions(16)` ten times: returns `[SoftDrop]` each time

**Group G — Constants exported**
- `DAS_MS` is exported and equals 133
- `ARR_MS` is exported and equals 50

---

## 7. Architectural Decisions

### Decision 1: DAS/ARR lives in `input/`, not `engine/`

DAS/ARR is a property of the input device interaction, not the game rules. The engine only needs to know whether a move action was requested this tick — it does not need to know whether that action came from a tap, auto-repeat, or a DAS-triggered event. Keeping DAS/ARR in `input/` preserves the engine's purity and allows the engine to be driven by replay systems or AI agents that inject actions without any input-layer latency.

### Decision 2: `deltaMs` passed in, not read from a clock inside the class

`KeyboardInput` does not call `performance.now()`. The caller (`main.ts`) owns the clock. This makes the class fully deterministic and testable — tests pass synthetic delta values without mocking time. It also means DAS/ARR inherits the fixed-timestep guarantee: `deltaMs` is always `LOGIC_TICK_MS` in normal gameplay, so timing is stable regardless of frame rate fluctuations.

### Decision 3: Touch DAS/ARR not implemented

Touch virtual buttons are tapped with a finger that has its own natural press-down latency (~80–100 ms on most devices). Applying DAS on top of that would create a ~230 ms dead zone before a held touch action repeats, which feels sluggish. The existing behavior (fire every tick while held) is acceptable for mobile play. This keeps `touch.ts` simple.

### Decision 4: One action emitted at DAS trigger, ARR starts from 0

An alternative would be: at DAS trigger, start ARR with an accumulator pre-loaded to `ARR_MS` so the first repeat fires immediately. Rejected because this creates an imperceptible "two rapid actions" at the DAS boundary — the initial press fires at t=0, the DAS fires at t=133 ms, and an immediately following ARR would fire at t=133 ms too. Using `arrAccumulator = 0` at DAS trigger means the next repeat fires at t = 133 + 50 = 183 ms, which is the correct Guideline behavior.
