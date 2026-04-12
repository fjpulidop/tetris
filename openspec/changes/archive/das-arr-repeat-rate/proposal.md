# Proposal: DAS/ARR Repeat Rate for Arrow Key Held Movement

**Change name:** das-arr-repeat-rate
**Ticket:** #4 — Implement DAS/ARR Repeat Rate for Arrow Key Held Movement
**Estimated complexity:** Low (half-day to one day)
**Date:** 2026-04-12

---

## Summary

When a player holds the left or right arrow key, the active piece currently moves at the full 60 Hz logic tick rate — up to 60 columns per second. This makes precise column placement nearly impossible and breaks the fundamental feel of the game. This change adds the two industry-standard timing mechanics that every competitive falling-block puzzle game implements: **DAS (Delayed Auto Shift)** and **ARR (Auto Repeat Rate)**.

DAS is the delay between the initial keypress and when auto-repeat begins. ARR is the interval at which repeat actions fire once auto-repeat is active. Together they give players fine-grained control: a short tap moves one column; holding the key briefly still keeps the piece in place for a beat before accelerating; and at full hold the piece sweeps across the board at a predictable, controllable pace.

## Problem

The `KeyboardInput.getHeldActions()` method currently returns a `MoveLeft` or `MoveRight` action for every single 16.67 ms logic tick that the key is held. At 60 Hz that is 60 lateral movements per second — roughly 6 board widths per second. There is also no initial delay, so even the slightest unintentional key hold causes unintended multi-column movement. Neither behavior matches the standard guideline that players expect from any modern falling-block puzzle game.

## Proposed Solution

Add per-key DAS and ARR accumulators to `KeyboardInput`. The state machine per horizontal key is:

1. **Initial press** — fire one immediate action (already done). Start tracking the key in a `DASState` record.
2. **DAS phase** — accumulate elapsed time. Do not fire additional actions until the accumulator exceeds `DAS_MS` (133 ms).
3. **ARR phase** — once DAS has triggered, fire a repeat action for every `ARR_MS` (50 ms) of elapsed time. Multiple actions may fire in a single tick if the tick delta is large enough relative to ARR, but this is bounded naturally by the fixed-timestep size (≤ 16.67 ms per tick in normal operation).
4. **Release** — delete the key's `DASState` record, resetting both accumulators.
5. **Opposite direction** — pressing the opposite horizontal key cancels the prior key's state entirely (standard "last key wins" behavior).

`SoftDrop` (ArrowDown) is intentionally unchanged — it continues to fire every tick while held, which is the standard behavior.

The method signature changes from `getHeldActions(): GameAction[]` to `getHeldActions(deltaMs: number): GameAction[]`. `TouchInput.getHeldActions()` receives the same signature change for API consistency, but its internal behavior is unchanged (touch held buttons continue to fire every tick; DAS/ARR is not appropriate for virtual buttons).

Two named constants are exported from `keyboard.ts` so that future configuration, tests, and any settings screen can reference them without magic numbers: `DAS_MS = 133` and `ARR_MS = 50`.

## Scope

### In scope

- `src/input/keyboard.ts` — DAS/ARR state machine, new signature, exported constants
- `src/input/touch.ts` — signature update to `getHeldActions(deltaMs: number)` only; no behavioral change
- `src/main.ts` — pass `LOGIC_TICK_MS` as the `deltaMs` argument at the call sites
- `src/__tests__/input/keyboard.test.ts` — new unit tests covering all DAS/ARR timing scenarios

### Out of scope

- User-configurable DAS/ARR values (settings screen does not exist yet)
- DAS/ARR for touch virtual buttons (not standard; touch already has natural press-and-hold latency)
- DAS/ARR for `SoftDrop` — intentionally unchanged
- Any engine or renderer changes
- Any HUD changes

## Non-goals

This change does not introduce a settings screen, persist user preferences, or change the soft-drop speed. The 133 ms / 50 ms defaults are chosen to match the Guideline-approximate values used by most modern falling-block clients; they can be tuned in a future change without a signature change.

## Acceptance Criteria

1. Holding ArrowLeft or ArrowRight for less than 133 ms moves the piece exactly 1 column (the initial press action only).
2. Holding for 133 ms or more begins auto-repeat, injecting at most one additional action per 50 ms interval.
3. Releasing a held key resets both the DAS accumulator and the ARR accumulator for that key.
4. Pressing the opposite horizontal direction cancels the prior key's DAS/ARR state (last-key-wins).
5. Soft-drop (ArrowDown) continues to fire every logic tick — behavior is unchanged.
6. All existing keyboard input unit tests pass without modification.
7. New unit tests verify: single tap = 1 action, DAS boundary (just under / just over 133 ms), ARR cadence, release reset, and opposite-key cancellation.
8. `TouchInput.getHeldActions(deltaMs)` compiles and functions identically to the prior behavior (no regression).
9. `npm run build` exits clean (zero TypeScript errors, zero ESLint errors).
10. Piece placement accuracy is subjectively improved during manual play testing.
