# Proposal: Monochrome Mode — Black & White Piece Rendering

## What We're Building

A selectable Monochrome rendering mode in which every piece — active, locked, and ghost — is drawn using a single achromatic palette instead of the seven Guideline piece colors. Players choose between "Classic" (existing color rendering) and "Monochrome" from a third button on the main menu. The choice is ephemeral (session-only; not persisted to `localStorage`).

## Why

Some players prefer a distraction-free, high-contrast aesthetic when playing at speed. A monochrome mode lets them remove color as a visual cue entirely, focusing attention on shape and placement rather than piece identity. It also improves accessibility for players with color-vision deficiencies where the Guideline palette can be ambiguous under certain display conditions.

## Scope

**In scope:**
- `src/engine/gameState.ts` — add optional `gameMode: 'classic' | 'monochrome'` field to `GameState`; default is `'classic'` so all existing paths are unaffected.
- `src/engine/types.ts` — export the `GameMode` union type so all layers can import it from the shared root.
- `src/renderer/boardRenderer.ts` — read `state.gameMode` and substitute grayscale constants for locked-cell colors when mode is `'monochrome'`.
- `src/renderer/pieceRenderer.ts` — read `state.gameMode` and substitute grayscale constants for active-piece and ghost colors when mode is `'monochrome'`.
- `src/ui/mainMenu.ts` — add a "MONOCHROME" button as a third interactive slot. The button emits a new `GameAction.StartMonochrome` action (or, alternatively, passes a mode flag to `main.ts` via a callback — see Design section for rationale).
- `src/main.ts` — capture the selected mode on `intro → playing` transition; pass it into `createGameState()`.

**Out of scope:**
- Persisting the mode choice across sessions.
- Applying monochrome to the HUD, effects/particles, or Chain Blast charged-cell overlays.
- Any additional rendering modes beyond `classic` and `monochrome`.
- Engine, scoring, audio, input: zero changes.

## High-Level Flow

```
MAIN MENU
  ├── PLAY          → classic game  (existing)
  ├── MONOCHROME    → monochrome game (new)
  └── EXIT          → (existing)

GAME RUNNING
  └── GameState.gameMode = 'classic' | 'monochrome'
        └── BoardRenderer + PieceRenderer read gameMode each frame
```

## Key Constraints

- `src/engine/` must stay pure — `gameMode` is a passive data field, not an engine behavior.
- Renderers only read `GameState`; they never write it.
- `GameAction` enum is extended by exactly one value: `StartMonochrome`. This keeps mode selection decoupled from `main.ts` internal state and follows the existing `Start` pattern.
- Chain Blast charged-cell overlays (`0xffffff` pulsing white) are unchanged — they are renderer-layer constants already independent of piece color.
- Effects/particles are unchanged.
