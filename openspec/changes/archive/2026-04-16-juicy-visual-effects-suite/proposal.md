# Proposal: Juicy Visual Effects Suite

## What

Extend the existing renderer-layer effects system with a richer set of per-event visual
reactions that make every meaningful game moment feel impactful. The six new effects
are: screen shake on hard drop or tetris, a chromatic aberration flash on level-up, a
combo ripple on consecutive line clears (combo >= 2), animated ghost-piece pulse (opacity
oscillation instead of static 30% alpha), a row sweep flash that tracks individual cleared
rows, and a board-wide flash intensity upgrade for tetris clears. All of these layer on
top of the already-working `effects.ts` / `postProcess.ts` infrastructure without
modifying the engine or input layers.

## Why

The current implementation already has particle bursts, a tetris flash, and a level-up
gold tint — good bones, but the feedback loop still feels passive:

- The hard drop (the most decisive player action) produces **zero** extra visual feedback.
- Level-up is a gold tint that is easy to miss because it blends with the board.
- Combos (consecutive line-clear turns) are not rewarded with any escalating visual.
- The ghost piece is static — its 30% alpha is purely functional, not expressive.

Modern Tetris implementations (Tetris Effect, Puyo Puyo Tetris) use a "juice" philosophy:
every consequential action earns a proportional spectacle. Adding these reactions closes
the gap between what the game does and how it *feels* to the player.

## Scope

- **In scope**: All work is in `src/renderer/effects.ts`, `src/renderer/postProcess.ts`,
  `src/renderer/pieceRenderer.ts`, and `src/main.ts` (combo tracking only).
- **Out of scope**: Engine changes, new `GameAction` values, new `GameEvent` types,
  new `GameState` fields, and audio changes.
- **Constraint**: Existing engine tests must pass unchanged. The engine layer must remain
  completely untouched.
