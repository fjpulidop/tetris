# Design: Monochrome Mode — Black & White Piece Rendering

**Change name:** monochrome-mode
**Ticket:** #33
**Date:** 2026-04-19

---

## 1. Architecture Overview

This change is entirely additive. No engine behavior changes. No new files are created in `src/engine/` beyond an exported type alias. The main architectural decisions are:

1. Where `GameMode` lives in the type tree.
2. How the mode selection is communicated from the menu to `createGameState()`.
3. How renderers resolve the correct color per-frame.

### Files touched

| File | Layer | Nature of change |
|---|---|---|
| `src/engine/types.ts` | `[core]` | Add `GameMode` type export |
| `src/engine/gameState.ts` | `[core]` | Add `gameMode` field to `GameState`; extend `createGameState()` to accept an optional mode argument |
| `src/renderer/boardRenderer.ts` | `[renderer]` | Add `resolveCellColor()` helper; use it in `update()` |
| `src/renderer/pieceRenderer.ts` | `[renderer]` | Add `resolvePieceColor()` helper; use it in `update()` |
| `src/ui/mainMenu.ts` | `[ui]` | Add `monochromeButton`; expose `flushMode()` returning `GameMode | null` |
| `src/main.ts` | `[main]` | Capture pending mode from `mainMenu.flushMode()` each tick; pass it to `createGameState()` on `intro → playing` transition |

### Container stacking order (unchanged)

```
app.stage
  boardContainer
  pieceContainer
  effectsContainer
  uiContainer (HUD)
  touchContainer
  mainMenuContainer      ← MainMenu (adds MONOCHROME button)
  modalContainer         ← PauseModal, GameOverOverlay (unchanged)
```

No new containers. No changes to container count or order.

---

## 2. Type layer: `src/engine/types.ts`

Add one new export — a union type alias:

```typescript
/** Rendering mode selected by the player at the main menu. */
export type GameMode = 'classic' | 'monochrome'
```

This lives in `types.ts` because every layer (`engine`, `renderer`, `ui`, `main.ts`) needs to reference it without creating circular imports. `types.ts` is already the root of the type tree with no imports of its own — placing `GameMode` here is consistent with `PieceType`, `Rotation`, and `GameEventType`.

---

## 3. Engine layer: `src/engine/gameState.ts`

### `GameState` interface

Add one field:

```typescript
export interface GameState {
  // ... existing fields ...
  /** Rendering mode selected at game start. 'classic' is the default. */
  gameMode: GameMode
}
```

This field is purely descriptive metadata for renderers. The engine itself never reads `gameMode` — it is carried through state updates via spread (`{ ...state, ... }`) exactly like all other fields.

### `createGameState()` signature

Extend the existing zero-argument function to accept an optional parameter:

```typescript
export function createGameState(mode: GameMode = 'classic'): GameState
```

The default value of `'classic'` means all existing call sites — including `restartGame()` and the test suite — work without any modification. `main.ts` passes the selected mode only on the `intro → playing` transition when the player has explicitly chosen Monochrome.

### Spread preservation

`updateGameState()` already spreads `...state` in all return paths. Since `gameMode` is a primitive string field, it is preserved automatically by every existing spread. No changes are needed inside `updateGameState()`.

### `restartGame()` in `main.ts`

`restartGame()` calls `createGameState()` (no argument) — this defaults to `'classic'`. This is intentional: when the player restarts mid-game via the pause menu, the game resets to Classic mode. To restart in Monochrome, the player returns to the main menu and selects the Monochrome button again. This matches the "not persisted" acceptance criterion.

---

## 4. Renderer layer

### Color resolution strategy

Both renderers use a private helper function that applies a single conditional branch:

```typescript
function resolveColor(colorIndex: number, gameMode: GameMode): number {
  if (gameMode === 'monochrome') return MONO_LOCKED_COLOR
  return CELL_COLORS[colorIndex] ?? 0xffffff
}
```

For `pieceRenderer.ts`, a separate helper for the active piece is cleaner because it uses a different constant:

```typescript
function resolveActiveColor(colorIndex: number, gameMode: GameMode): number {
  if (gameMode === 'monochrome') return MONO_ACTIVE_COLOR
  return CELL_COLORS[colorIndex] ?? 0xffffff
}
```

This keeps all monochrome constants co-located at the top of each file and avoids scattering mode checks through draw loops.

### Monochrome constants

Per the ticket specification:

| Usage | Constant name | Value |
|---|---|---|
| Active piece | `MONO_ACTIVE_COLOR` | `0xeeeeee` |
| Locked cells | `MONO_LOCKED_COLOR` | `0x888888` |
| Ghost piece | `MONO_GHOST_COLOR` | `0x555555` (drawn at alpha `0.3`, same as Classic ghost) |

These constants are defined module-level in their respective renderer files (not in `types.ts`) because they are pure rendering concerns — not shared across layers.

### `boardRenderer.ts` changes

The `update()` method currently resolves color as:

```typescript
const color = CELL_COLORS[value] ?? 0xffffff
```

This becomes:

```typescript
const color = resolveCellColor(value, state.gameMode)
```

The charged-cell overlay (`0xffffff` pulsing white) is **not affected** — it does not go through `resolveCellColor()`. The overlay is drawn in `updateChargedOverlays()` using the hardcoded constant `0xffffff`, which is the correct behavior in both modes.

### `pieceRenderer.ts` changes

The `update()` method currently resolves piece color as:

```typescript
const colorIndex = PIECE_COLORS[piece.type]
const color = CELL_COLORS[colorIndex] ?? 0xffffff
```

Active piece becomes:
```typescript
const colorIndex = PIECE_COLORS[piece.type]
const color = resolveActiveColor(colorIndex, state.gameMode)
```

Ghost piece currently inherits `color` from the active piece with `GHOST_ALPHA = 0.3` applied via `g.alpha`. In Monochrome mode the ghost needs its own distinct constant (`0x555555`) rather than `0xeeeeee`. The draw loop for ghost cells must therefore use a separate resolved color:

```typescript
const ghostColor = resolveGhostColor(state.gameMode, color)
```

Where:
```typescript
function resolveGhostColor(gameMode: GameMode, classicColor: number): number {
  return gameMode === 'monochrome' ? MONO_GHOST_COLOR : classicColor
}
```

The `g.alpha = GHOST_ALPHA` (0.3) on ghost cells remains unchanged — it applies in both modes.

---

## 5. UI layer: `src/ui/mainMenu.ts`

### New button

A third button labeled `'MONOCHROME'` is added between `PLAY` and `EXIT`. The button layout after this change:

```
PLAY          (y = height * 0.56)
MONOCHROME    (y = height * 0.56 + 70)
EXIT          (y = height * 0.56 + 140)
```

The fallback text (`'Close this tab to exit'`) shifts down accordingly:

```
Fallback      (y = height * 0.56 + 220)
```

### Mode communication pattern

The `MainMenu` class adds a second action buffer — `menuModeBuffer: GameMode[]` — and a new public method:

```typescript
flushMode(): GameMode | null
```

When the PLAY button fires, nothing is pushed to `menuModeBuffer` — `'classic'` is the default. When MONOCHROME fires, both `GameAction.Start` is pushed to `menuActionBuffer` (to advance the engine from `intro → playing`) AND `'monochrome'` is pushed to `menuModeBuffer`.

`main.ts` calls `mainMenu.flushMode()` alongside `mainMenu.flushActions()` each tick. When a non-null value is returned, `main.ts` stores it in a local `pendingMode` variable. On the `intro → playing` edge, `pendingMode` (defaulting to `'classic'`) is passed to `createGameState(pendingMode)`.

This design keeps mode entirely in the UI layer until the moment `createGameState()` is called — no `GameAction` enum extension is needed, no engine changes are needed, and the mode-selection intent is flushed and consumed within the same tick.

**Why not `GameAction.StartMonochrome`?**

Extending `GameAction` would mean the engine enum carries UI-only semantics. The engine already ignores unknown actions (via the existing `includes()` pattern) but adding an enum value that the engine never acts on is misleading. The `flushMode()` pattern keeps the concern in `src/ui/` and `main.ts` where it belongs.

---

## 6. `main.ts` wiring

### New local variable

```typescript
/** Mode captured from the main menu; applied to createGameState() on intro→playing. */
let pendingMode: GameMode = 'classic'
```

### Loop tick changes

In the action collection block inside the fixed-timestep loop:

```typescript
// Collect mode selection from main menu (null if none pending)
const selectedMode = mainMenu?.flushMode() ?? null
if (selectedMode !== null) {
  pendingMode = selectedMode
}
```

### `intro → playing` transition

```typescript
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  audioManager.onPhaseChange('playing')
  mainMenu?.destroy()
  mainMenu = null
  if (removeIntroKeyListener !== null) {
    removeIntroKeyListener()
    removeIntroKeyListener = null
  }
  hud.setVisible(true)
  // (no new code needed here — state already carries gameMode from createGameState())
}
```

The mode is baked into `state` at creation time via `createGameState(pendingMode)` which is called when the `Start` action is processed by the engine. Wait — `createGameState()` is called at initialization, not at the transition. Let me clarify the correct integration point.

**Correct integration point:** The initial `state = createGameState()` at startup uses `'classic'`. When `main.ts` collects a `GameAction.Start` from `mainMenu.flushActions()`, it calls `updateGameState(state, [Start], 0)` which transitions the phase but does NOT re-create the state. Therefore, the mode must be baked into the state **before** the Start action is processed.

The correct approach: `main.ts` detects a pending Start action and replaces `state` with a fresh `createGameState(pendingMode)` before dispatching:

```typescript
// In the fixed-timestep loop, before updateGameState():
const bufferedActions = [
  ...keyboard.flush(),
  ...touchInput.flush(),
  ...(mainMenu?.flushActions() ?? []),
]

// Capture mode selection (may be null)
const selectedMode = mainMenu?.flushMode() ?? null
if (selectedMode !== null) {
  pendingMode = selectedMode
}

// If a Start action arrived while we're still in intro, reinitialize state with the chosen mode
if (state.phase === 'intro' && bufferedActions.includes(GameAction.Start)) {
  state = createGameState(pendingMode)
  pendingMode = 'classic' // reset for next game
}
```

This ensures `state.gameMode` is set correctly before `updateGameState()` processes `Start` and transitions to `'playing'`.

### `navigateToTitle()` reset

`navigateToTitle()` already calls `state = createGameState()` (no argument → `'classic'`). This is correct — returning to the menu should not remember the previous mode choice.

### `restartGame()` reset

`restartGame()` already calls `createGameState()` (no argument → `'classic'`). This is consistent with the "not persisted" requirement.

---

## 7. Test strategy

### Engine tests

`createGameState()` signature change (optional arg) is backward-compatible — all existing call sites continue to work. No existing engine tests need modification.

Add to `src/__tests__/engine/gameState.test.ts`:
- `createGameState()` → `state.gameMode === 'classic'`
- `createGameState('monochrome')` → `state.gameMode === 'monochrome'`
- After several `updateGameState()` ticks, `state.gameMode` is preserved unchanged.

### Renderer tests

Renderer tests live in `src/__tests__/` (none currently exist for renderers — they are tested via visual inspection). No renderer unit tests are added in this change. The render path is covered by the acceptance criteria (manual verification of AC 2 — all 7 pieces render identically in grayscale).

### UI tests

Add to `src/__tests__/ui/mainMenu.test.ts`:
- MONOCHROME button exists in the rendered container after construction.
- Clicking MONOCHROME flushes `GameAction.Start` from `flushActions()`.
- Clicking MONOCHROME flushes `'monochrome'` from `flushMode()`.
- Clicking PLAY flushes `GameAction.Start` and `flushMode()` returns `null`.
- After flush, buffer is empty (idempotent flush).

---

## 8. Compatibility Impact

**No contract surface changes** to CLI flags, commands, agents, placeholders, or config keys.

One `GameAction` enum is **not** extended (see rationale in §5). The only public API change is:

- `createGameState(mode?: GameMode)` — backward-compatible optional parameter.
- `GameState.gameMode` — new required field, but all construction paths go through `createGameState()`, so no callers construct `GameState` literals directly in production code.

Test files that construct partial `GameState` objects using spread will need to add `gameMode: 'classic'` to any literal construction, or use `createGameState()` as the base. The task breakdown flags exactly which test helpers require updating.

**Compatibility: No contract surface changes detected.** (The `createGameState` signature change is backward-compatible due to the default parameter value. The `GameState` field addition is internal to the engine module.)
