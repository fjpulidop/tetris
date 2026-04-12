# Proposal: Animated Splash Screen with "Press Enter to Start"

## Problem

The game launches directly into active gameplay with no introduction. There is no `'intro'` phase in the `GameState` phase union. As soon as the page loads, pieces start falling and the board is active. Players have no moment to orient themselves, adjust their physical position, or even confirm the game is loaded before the first piece is already dropping.

This also creates a subtle architectural problem: `createGameState()` currently returns `phase: 'playing'`, which means there is no way for a player to delay the start of the first game without adding imperative mutable flags outside the engine.

## Proposed Solution

Introduce a new `'intro'` phase into the `GameState` phase union. Wire `createGameState()` to return `phase: 'intro'` instead of `phase: 'playing'`. The engine's `updateGameState()` skips all game-logic processing when in `'intro'` phase — no gravity, no piece movement, no scoring.

A new `SplashScreen` class in `src/ui/splashScreen.ts` renders:
- A large bold game title (≥ 48px)
- A pulsing "Press Enter to Start" subtitle animated via the PixiJS ticker

A new `GameAction.Start` is defined in `src/engine/types.ts`. The keyboard handler maps `Enter` to `GameAction.Start`. On mobile, a tap anywhere on the canvas (while in `'intro'` phase) emits `GameAction.Start`. When the engine receives `GameAction.Start` in `'intro'` phase, it transitions to `'playing'`.

The HUD is hidden during `'intro'` phase. The splash screen destroys its own PixiJS display objects on transition to prevent memory leaks.

## Scope

### In scope
- Adding `'intro'` to `GameState.phase`
- `createGameState()` starting in `'intro'`
- `updateGameState()` skipping logic in `'intro'`, and handling `GameAction.Start` to transition `'intro'` → `'playing'`
- `GameAction.Start` added to the enum in `src/engine/types.ts`
- `SplashScreen` class in `src/ui/splashScreen.ts`
- `Enter` key mapped in `src/input/keyboard.ts`
- Canvas tap in `'intro'` phase mapped in `src/input/touch.ts`
- HUD hidden during `'intro'` phase (gated in `src/main.ts`)
- `SplashScreen.resize(width, height)` for responsive layout
- Full teardown of splash PixiJS objects on transition

### Out of scope
- Animated logo or video intro
- Music or sound on splash
- Restart flow after game-over (separate feature)
- "Press Enter to Continue" after pause (separate feature)

## Acceptance Criteria

1. Game loads to splash screen with title rendered at ≥ 48px font size and "Press Enter to Start" subtitle visible — no board pieces or active gameplay visible.
2. Pressing Enter transitions the game from `'intro'` phase to `'playing'` phase.
3. Tapping the canvas on mobile also triggers the `'intro'` → `'playing'` transition.
4. `GameState.phase` type union includes `'intro'` and `createGameState()` returns `phase: 'intro'`.
5. `GameAction.Start` is defined in `src/engine/types.ts` and `updateGameState()` transitions `'intro'` → `'playing'` when it receives `GameAction.Start`.
6. All PixiJS objects created by `SplashScreen` are fully removed from the stage and destroyed on transition (no memory leak).
7. The HUD is not visible during `'intro'` phase.
8. The splash screen renders correctly and is centered at all viewport sizes; `SplashScreen.resize(width, height)` is called on every window resize.
9. Existing tests pass without modification (except the `createGameState` phase assertion, which must be updated). A new test covers the `'intro'` → `'playing'` transition via `GameAction.Start`.
