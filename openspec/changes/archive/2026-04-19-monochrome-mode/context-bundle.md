# Context Bundle: monochrome-mode

**Change name:** monochrome-mode
**Ticket:** #33
**Date:** 2026-04-19

---

## 1. Feature Overview

This change adds a **Monochrome** rendering mode to the falling-block puzzle game. A third button on the main menu ("MONOCHROME") starts a game session where every piece — active, locked, and ghost — is drawn in a single achromatic palette rather than the standard Guideline piece colors. The choice is session-scoped and not persisted.

Engine behavior, scoring, audio, input, Chain Blast mechanics, and effects/particles are entirely unchanged. The change is additive: a new type, one new field, one new button, and color-resolution branches in two renderer methods.

---

## 2. Architecture

### Four-layer design (unchanged)

```
input → main.ts → engine → renderer
                         → ui
```

### Files modified

| File | Layer | Change summary |
|---|---|---|
| `src/engine/types.ts` | `[core]` | Add `GameMode = 'classic' \| 'monochrome'` export |
| `src/engine/gameState.ts` | `[core]` | Add `gameMode: GameMode` to `GameState`; extend `createGameState(mode?)` |
| `src/renderer/boardRenderer.ts` | `[renderer]` | Add `resolveCellColor()` helper; use it in `update()` |
| `src/renderer/pieceRenderer.ts` | `[renderer]` | Add `resolveActiveColor()`, `resolveGhostColor()` helpers; use in `update()` |
| `src/ui/mainMenu.ts` | `[ui]` | Add `monochromeButton`, `menuModeBuffer`, `flushMode()` |
| `src/main.ts` | `[main]` | Add `pendingMode` variable; capture from `mainMenu.flushMode()`; reinit state before Start |

### No new files created.

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

---

## 3. Phase state machine (unchanged)

```
intro → playing → paused → playing
                         → gameover → (navigateToTitle) → intro
```

`GameState.gameMode` is set at `intro → playing` transition time and preserved across all subsequent ticks via spread. It is reset to `'classic'` when `createGameState()` is called without an argument (navigate-to-title, restart).

---

## 4. Exact Changes

### `src/engine/types.ts`

Add after the `GameEventType` definition, before the `GameEvent` interface:

```typescript
/** Rendering mode selected by the player at the main menu. */
export type GameMode = 'classic' | 'monochrome'
```

---

### `src/engine/gameState.ts`

**Import line** — extend to include `GameMode`:
```typescript
import type { PieceType, Rotation, GameEvent, GameMode } from './types.js'
```

**`GameState` interface** — add field after `chainTimer`:
```typescript
/** Rendering mode selected at game start. 'classic' renders Guideline colors; 'monochrome' renders grayscale. */
gameMode: GameMode
```

**`createGameState()` signature** — add optional parameter:
```typescript
export function createGameState(mode: GameMode = 'classic'): GameState {
```

**`createGameState()` return object** — add field:
```typescript
gameMode: mode,
```

No changes to `updateGameState()`.

---

### `src/renderer/boardRenderer.ts`

**Import** — add:
```typescript
import type { GameMode } from '../engine/types.js'
```

**New constant** (after `CELL_COLORS`):
```typescript
const MONO_LOCKED_COLOR = 0x888888
```

**New helper function** (before `BoardRenderer` class):
```typescript
function resolveCellColor(colorIndex: number, gameMode: GameMode): number {
  if (gameMode === 'monochrome') return MONO_LOCKED_COLOR
  return CELL_COLORS[colorIndex] ?? 0xffffff
}
```

**In `update()` method** — replace:
```typescript
const color = CELL_COLORS[value] ?? 0xffffff
```
with:
```typescript
const color = resolveCellColor(value, state.gameMode)
```

`updateChargedOverlays()` is unchanged (always uses `0xffffff`).

---

### `src/renderer/pieceRenderer.ts`

**Import** — add:
```typescript
import type { GameMode } from '../engine/types.js'
```

**New constants** (after `GHOST_ALPHA`):
```typescript
const MONO_ACTIVE_COLOR = 0xeeeeee
const MONO_GHOST_COLOR = 0x555555
```

**New helper functions** (before `PieceRenderer` class):
```typescript
function resolveActiveColor(colorIndex: number, gameMode: GameMode): number {
  if (gameMode === 'monochrome') return MONO_ACTIVE_COLOR
  return CELL_COLORS[colorIndex] ?? 0xffffff
}

function resolveGhostColor(gameMode: GameMode, classicColor: number): number {
  return gameMode === 'monochrome' ? MONO_GHOST_COLOR : classicColor
}
```

**In `update()` method** — replace:
```typescript
const colorIndex = PIECE_COLORS[piece.type]
const color = CELL_COLORS[colorIndex] ?? 0xffffff
```
with:
```typescript
const colorIndex = PIECE_COLORS[piece.type]
const color = resolveActiveColor(colorIndex, state.gameMode)
const ghostColor = resolveGhostColor(state.gameMode, color)
```

In the ghost cell draw loop, replace:
```typescript
g.fill({ color, alpha: 1 })
```
with:
```typescript
g.fill({ color: ghostColor, alpha: 1 })
```

---

### `src/ui/mainMenu.ts`

**Import** — add:
```typescript
import type { GameMode } from '../engine/types.js'
```

**New private fields** (in the class body):
```typescript
private monochromeButton: Container
private menuModeBuffer: GameMode[] = []
```

**New button construction** (in constructor, between playButton and exitButton):
```typescript
this.monochromeButton = this.buildButton('MONOCHROME')
this.monochromeButton.on('pointerup', () => {
  this.menuActionBuffer.push(GameAction.Start)
  this.menuModeBuffer.push('monochrome')
})
this.container.addChild(this.monochromeButton)
```

**New public method** (after `flushActions()`):
```typescript
flushMode(): GameMode | null {
  const mode = this.menuModeBuffer.shift()
  return mode ?? null
}
```

**Updated `resize()` positions**:
```typescript
resizeButton(this.playButton, width / 2, height * 0.56)
resizeButton(this.monochromeButton, width / 2, height * 0.56 + 70)
resizeButton(this.exitButton, width / 2, height * 0.56 + 140)

this.fallbackText.x = width / 2
this.fallbackText.y = height * 0.56 + 220
```

---

### `src/main.ts`

**Import** — add:
```typescript
import type { GameMode } from './engine/types.js'
```

**New loop-level variable** (near `let prevPhase = state.phase`):
```typescript
let pendingMode: GameMode = 'classic'
```

**In the fixed-timestep loop** — add after action collection, before `updateGameState()`:
```typescript
// Capture mode selection from main menu
const selectedMode = mainMenu?.flushMode() ?? null
if (selectedMode !== null) {
  pendingMode = selectedMode
}

// Reinitialize state with chosen mode before the engine transitions intro → playing
if (state.phase === 'intro' && bufferedActions.includes(GameAction.Start)) {
  state = createGameState(pendingMode)
  pendingMode = 'classic'
}
```

---

## 5. Behavioral Notes

### Why `resolveCellColor` is in each renderer file, not `types.ts`

The color constants (`0x888888`, `0xeeeeee`, `0x555555`) are rendering concerns — they have no meaning in the engine or UI layers. Placing color resolution helpers inside each renderer file keeps the coloring logic co-located with the drawing code and avoids polluting the shared type root with hex constants.

### Why `flushMode()` returns `null` for PLAY

PLAY uses the existing `GameAction.Start` path unchanged. Classic is the default — returning `null` means "no override, use default." This avoids repeating `'classic'` as a literal in the buffer and makes the common case (Classic play) zero-overhead.

### Why `createGameState()` is called before `updateGameState()` on Start

`createGameState()` sets `gameMode`. If we passed the mode to `updateGameState()` instead (e.g., as a fourth argument), the engine would need to know about mode selection — a UI concern bleeding into a pure logic layer. Recreating state before dispatch keeps the engine pure.

### Ghost alpha unchanged

The ghost `Graphics` objects have `g.alpha = GHOST_ALPHA` (0.3) set in the constructor and never changed. This applies in both modes. In Monochrome mode the ghost color shifts from the active-piece color to `0x555555`, but the 0.3 alpha remains. The three-value grayscale ladder (`0xeeeeee` active, `0x888888` locked, `0x555555` ghost at 0.3 alpha) provides sufficient contrast for distinguishability.

---

## 6. Test Coverage

| Test file | New tests added |
|---|---|
| `src/__tests__/engine/gameState.test.ts` | 4 tests: default mode, explicit monochrome, tick preservation, pause/resume preservation |
| `src/__tests__/ui/mainMenu.test.ts` | 6 tests: button presence, flushMode null baseline, MONOCHROME click → Start, MONOCHROME click → mode, PLAY click → null mode, flush idempotency |

No renderer unit tests are added (renderers have no existing unit tests; visual correctness is verified by acceptance criteria in the spec).

---

## 7. Compatibility

**Compatibility: No contract surface changes detected.**

- `createGameState(mode?: GameMode)` — backward-compatible optional parameter. All existing call sites pass no argument and receive `'classic'`.
- `GameState.gameMode` — new field always populated by `createGameState()`. No callers construct `GameState` literals directly (all test code uses spread from `createGameState()` output).
- No `GameAction` enum extensions.
- No CLI flags, command names, agent names, or config keys changed.
