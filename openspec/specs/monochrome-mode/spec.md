# Monochrome Mode

**Capability:** monochrome-mode
**Change:** monochrome-mode (#33)
**Date:** 2026-04-19

---

## Why

Players who prefer a distraction-free aesthetic or have color-vision deficiencies need a rendering mode that removes Guideline piece colors. Monochrome mode satisfies this by substituting a fixed achromatic palette for all piece rendering while leaving game logic, scoring, and effects completely unchanged.

---

## ADDED Requirements

### Requirement: GameMode type

A `GameMode` type alias MUST be exported from `src/engine/types.ts`. It SHALL be a string union of `'classic'` and `'monochrome'`. All layers may import this type without circular-dependency risk because `types.ts` has no imports of its own.

#### Scenario: GameMode type is exported

- Given the TypeScript compiler resolves `src/engine/types.ts`
- When a consumer imports `GameMode` from `'../engine/types.js'`
- Then the import resolves to the union type `'classic' | 'monochrome'` with no compile error

---

### Requirement: GameState.gameMode field

`GameState` MUST include a `gameMode: GameMode` field. The field SHALL be set once at game creation via `createGameState(mode?)`. It MUST be preserved unchanged by `updateGameState()` across all ticks, phase transitions, and piece-lock events.

#### Scenario: default gameMode is classic

- Given `createGameState()` is called with no argument
- When the returned state is inspected
- Then `state.gameMode` equals `'classic'`

#### Scenario: explicit monochrome gameMode

- Given `createGameState('monochrome')` is called
- When the returned state is inspected
- Then `state.gameMode` equals `'monochrome'`

#### Scenario: gameMode is preserved through ticks

- Given a state with `gameMode: 'monochrome'` in `'playing'` phase
- When `updateGameState(state, [], 16)` is called multiple times
- Then each resulting state still has `gameMode: 'monochrome'`

#### Scenario: gameMode is preserved through pause/resume

- Given a state with `gameMode: 'monochrome'` in `'playing'` phase
- When the state is paused via `GameAction.Pause` and then resumed
- Then the resumed state has `gameMode: 'monochrome'`

---

### Requirement: Main menu MONOCHROME button

The main menu MUST display a button labeled `'MONOCHROME'` positioned between the existing `'PLAY'` button and the existing `'EXIT'` button. Clicking this button SHALL initiate a monochrome game session.

#### Scenario: MONOCHROME button is present

- Given a `MainMenu` instance is constructed
- When the container's interactive children are inspected
- Then exactly three interactive buttons exist: PLAY, MONOCHROME, EXIT (in that vertical order)

#### Scenario: PLAY button starts a classic game

- Given a `MainMenu` instance is constructed
- When the PLAY button receives a `pointerup` event
- Then `flushActions()` returns an array containing `GameAction.Start`
- And `flushMode()` returns `null` (Classic is the default — no override)

#### Scenario: MONOCHROME button starts a monochrome game

- Given a `MainMenu` instance is constructed
- When the MONOCHROME button receives a `pointerup` event
- Then `flushActions()` returns an array containing `GameAction.Start`
- And `flushMode()` returns `'monochrome'`

#### Scenario: mode buffer is drained after flush

- Given the MONOCHROME button was clicked
- When `flushMode()` is called once
- Then a subsequent call to `flushMode()` returns `null`

---

### Requirement: Monochrome locked-cell rendering

When `state.gameMode === 'monochrome'`, `BoardRenderer.update()` MUST render all locked board cells using the constant `0x888888` regardless of the piece color index stored in the board array. Empty cells and grid lines SHALL NOT be affected.

#### Scenario: locked cells rendered in monochrome

- Given `state.gameMode === 'monochrome'`
- And the board contains locked cells of any piece type (color index 1–7)
- When `boardRenderer.update(state)` is called
- Then every non-zero board cell is filled with color `0x888888`

#### Scenario: locked cells rendered in classic (unchanged)

- Given `state.gameMode === 'classic'`
- And the board contains a locked I-piece (color index 1)
- When `boardRenderer.update(state)` is called
- Then the locked cells are filled with color `0x00f0f0` (cyan)

#### Scenario: charged-cell overlays are unaffected by game mode

- Given `state.gameMode === 'monochrome'`
- And `state.chargedCells` is non-empty
- When `boardRenderer.update(state)` is called
- Then the charged-cell overlay uses `0xffffff` (white pulse) unchanged

---

### Requirement: Monochrome active-piece rendering

When `state.gameMode === 'monochrome'`, `PieceRenderer.update()` MUST render the active piece using the constant `0xeeeeee` for all 7 piece types.

#### Scenario: active piece rendered in monochrome

- Given `state.gameMode === 'monochrome'`
- And `state.activePiece` is a non-null piece of any type
- When `pieceRenderer.update(state)` is called
- Then the active piece cells are filled with color `0xeeeeee`

#### Scenario: active piece rendered in classic (unchanged)

- Given `state.gameMode === 'classic'`
- And `state.activePiece` is a T-piece (color index 3)
- When `pieceRenderer.update(state)` is called
- Then the active piece cells are filled with color `0xa000f0` (purple)

---

### Requirement: Monochrome ghost-piece rendering

When `state.gameMode === 'monochrome'`, the ghost piece MUST render using color `0x555555` at alpha `0.3`. This SHALL provide a visually distinct value from both active cells (`0xeeeeee`) and locked cells (`0x888888`). The `0.3` alpha is the same as Classic mode.

#### Scenario: ghost piece rendered in monochrome

- Given `state.gameMode === 'monochrome'`
- And `state.activePiece` is positioned above the ghost landing row
- When `pieceRenderer.update(state)` is called
- Then the ghost cells are filled with color `0x555555` at alpha `0.3`

#### Scenario: ghost piece rendered in classic (unchanged)

- Given `state.gameMode === 'classic'`
- And `state.activePiece` is a Z-piece
- When `pieceRenderer.update(state)` is called
- Then the ghost cells are filled with the Z-piece color at alpha `0.3` (unchanged)

---

### Requirement: Mode is not persisted across sessions

The selected game mode SHALL be session-scoped only. After game-over and navigation back to the main menu, the game mode MUST reset to `'classic'`. The mode MUST NOT be persisted to `localStorage` or any other storage mechanism.

#### Scenario: mode resets after navigate-to-title

- Given a game session was started in `'monochrome'` mode
- When the game ends and `navigateToTitle()` is called in `main.ts`
- Then a new game started via `createGameState()` has `gameMode === 'classic'`

#### Scenario: mode resets after restart via pause menu

- Given a game session was started in `'monochrome'` mode
- When the player restarts via the pause menu (`restartGame()` in `main.ts`)
- Then the new game state has `gameMode === 'classic'`
