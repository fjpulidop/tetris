# Proposal: Main Menu Screen with Exit Button

## Summary

Add a proper main menu to the game so that players arrive at a branded, interactive screen on page load rather than being dropped into the in-progress splash animation. The menu presents two clear actions — Play and Exit — and is reachable again after Game Over, closing the flow loop cleanly.

## Problem Statement

Currently, the game opens in an `'intro'` phase that shows a splash screen with only "Press Enter to Start". There is no way to quit the browser tab from within the game, and after a game over the player is stranded with no path back to the start other than pressing a keyboard shortcut they may not know exists.

## Proposed Solution

**Evolve the `'intro'` phase rather than adding a new `'menu'` phase.**

The `'intro'` phase and a hypothetical `'menu'` phase would be functionally identical: both gate game logic, both render full-screen UI only, and both transition to `'playing'`. Adding a distinct `'menu'` phase would require changes across `GameState`, `updateGameState`, all phase-guard branches, and every piece of test and documentation that references the phase union — for zero behavioural gain.

Instead, the existing `SplashScreen` component is replaced by a new `MainMenu` component (in `src/ui/mainMenu.ts`) that renders within the same `'intro'` phase, to the same `splashContainer`, with the same lifecycle. The `'intro'` phase retains its engine semantics (only `GameAction.Start` is processed; all else is ignored). The `MainMenu` adds Play and Exit buttons on top of the existing title + subtitle aesthetic.

After Game Over, the game loop detects the `'gameover' → 'intro'` transition and re-instantiates `MainMenu`, giving the player the "Return to Menu" path.

The `PauseModal`'s existing "Return to Title Screen" option remains functionally correct — it already calls `navigateToTitle()` in `main.ts`, which will be updated to instantiate `MainMenu` instead of `SplashScreen`.

## Non-Goals

- No leaderboard, settings, or sub-menus.
- No animated menu backgrounds or particle effects.
- No persistent high-score display (separate ticket).
- No removal of keyboard-based Start (Enter key still works for accessibility).

## Acceptance Criteria (abbreviated)

1. Page load shows main menu with Play and Exit buttons; no game logic runs.
2. Play (click/tap/Enter) starts a new game.
3. Exit calls `window.close()`; fallback message if browser blocks it.
4. After Game Over, a visible "Return to Menu" path leads back to main menu.
5. Menu is tappable/legible at 320px viewport width.
6. All existing engine unit tests continue to pass unchanged.
