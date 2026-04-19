# Spec: Monochrome Mode

**Feature area:** Rendering / Game Mode Selection
**Status:** proposed
**Date:** 2026-04-19

---

## Overview

The game supports a selectable **Monochrome** rendering mode alongside the existing Classic (colorful) mode. Players choose the mode from the main menu before starting a game. The choice applies for the duration of that session and is not persisted.

---

## GameMode type

```
GameMode = 'classic' | 'monochrome'
```

Exported from `src/engine/types.ts`. All layers may import this type.

---

## GameState field

`GameState` contains a `gameMode: GameMode` field. Its value is set once at game creation via `createGameState(mode)` and is never mutated by the engine.

- Default: `'classic'`
- Engine behavior is identical for both values — `gameMode` is opaque data from the engine's perspective.

---

## Main menu

The main menu presents three buttons in vertical order:

| Position | Label | Effect |
|---|---|---|
| 1st | PLAY | Starts a `'classic'` game |
| 2nd | MONOCHROME | Starts a `'monochrome'` game |
| 3rd | EXIT | Existing exit behavior |

Clicking either PLAY or MONOCHROME starts the game (transitions engine from `intro` to `playing`). The chosen mode is encoded in `GameState.gameMode` from the moment the game begins.

---

## Rendering: Classic mode

All existing rendering behavior. Piece colors are drawn from `CELL_COLORS` (index 1–7).

---

## Rendering: Monochrome mode

When `state.gameMode === 'monochrome'`, the following substitutions apply:

| Element | Color | Notes |
|---|---|---|
| Active piece cells | `0xeeeeee` | All 7 piece types use the same color |
| Locked board cells | `0x888888` | All color indices map to this constant |
| Ghost piece cells | `0x555555` at alpha `0.3` | Same alpha as Classic ghost |

**Unchanged in Monochrome mode:**

- Charged-cell white pulse overlay (`0xffffff`) — Chain Blast visual
- Effects/particle system (line-clear flash, chain explosion VFX)
- HUD colors
- Grid background and grid lines

---

## Non-persistence

`GameState.gameMode` is not stored in `localStorage`. When `createGameState()` is called without an argument (restart, navigate-to-title), it defaults to `'classic'`.

---

## Acceptance Criteria

1. The main menu displays a "MONOCHROME" button between PLAY and EXIT.
2. Starting a game via PLAY renders all 7 piece types in their Guideline colors (unchanged Classic behavior).
3. Starting a game via MONOCHROME renders all 7 piece types:
   - Active: `0xeeeeee`
   - Locked: `0x888888`
   - Ghost: `0x555555` at alpha `0.3`
4. The ghost piece is visually distinguishable from both the active piece and locked cells in Monochrome mode.
5. Chain Blast charged-cell overlays (white pulse) appear correctly in both modes — Chain Blast regression-free.
6. Selecting Monochrome, completing a game, and returning to the menu resets the mode to Classic (mode not persisted).
7. `GameState.gameMode` equals `'classic'` for games started via PLAY and `'monochrome'` for games started via MONOCHROME.
8. All tests pass (`npm test`). Build and lint pass (`npm run build`, `npm run lint`).
