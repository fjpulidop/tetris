# Proposal: Fix Pause Menu — Rename Title Screen Action and Add Restart Option

**Change name:** fix-pause-menu-rename-restart
**Ticket:** #7 — Fix Pause Menu: Rename Title Screen Action and Add Restart Option
**Estimated complexity:** Small (2–4 hours)
**Date:** 2026-04-12

---

## Problem

The pause modal introduced in ticket #3 has two options: "RESUME" and "TITLE SCREEN". Both have
bugs or gaps that make the pause screen unsuitable as shipped:

**Bug 1 — "TITLE SCREEN" leaves a blank screen.**
`navigateToTitle()` resets engine state to `createGameState()` (which starts in `'intro'` phase),
removes the blur, and hides the modal. However, the `SplashScreen` instance was destroyed
irreversibly when the game first transitioned from `'intro'` → `'playing'`. After calling
`navigateToTitle()`, the engine is in `'intro'` phase but there is nothing rendering on screen —
no splash screen, no HUD — only the bare board containers (which show an empty board). The player
sees a blank, non-interactive canvas.

**Bug 2 — No "Restart" option.**
There is no way to immediately restart a game from the pause menu. The only available escape is
"TITLE SCREEN", which is currently broken. Restarting a game without navigating through a splash
screen is a standard expectation in any puzzle game.

## Proposed Solution

Expand the pause modal from two options to three, in this order:

1. **RESUME** (index 0): unchanged behavior — continues the paused game.
2. **RESTART** (index 1): new — resets engine state directly to `'playing'`, bypasses the intro
   splash, shows the HUD immediately. Equivalent to starting a brand new game without any title
   screen interstitial.
3. **RETURN TO TITLE SCREEN** (index 2): fixed — resets engine state to `'intro'`, recreates the
   `SplashScreen` instance, re-wires the canvas tap-to-start listener, and hides the HUD. This
   restores the full intro experience as if the page had just loaded.

The label rename from "TITLE SCREEN" to "RETURN TO TITLE SCREEN" also makes the intent clearer to
the player — it is a navigation back, not just a transition to a named screen.

## Scope

### In scope

- `src/ui/pauseModal.ts` — change `OPTION_LABELS` from 2 items to 3, update `optionTexts` type,
  update constructor to build three option texts, update all iteration-based logic
- `src/main.ts` — add `restartGame()` function, fix `navigateToTitle()` to recreate
  `SplashScreen` and re-wire tap listener, update `pauseModal.onSelect` callback routing, update
  `OPTION_COUNT` in `attachPauseKeyListener()`, update Enter-key confirm routing

### Out of scope

- Changing the engine's `GameState` or `GameAction` enum — the engine is not modified
- Adding animation transitions between options or states
- Pause modal during `'gameover'` phase (a separate feature)
- Any changes to `src/__tests__/engine/` — existing engine tests must pass unmodified

## Non-goals

This change does not alter the visual design of the pause modal (font sizes, colors, spacing). It
does not change when the pause modal appears or disappears. It does not affect the blur filter
management logic. The only behavioral changes are: a third option appears, RESTART works, and
RETURN TO TITLE SCREEN works correctly.

## Acceptance Criteria

1. The pause modal displays three options in order: "RESUME", "RESTART", "RETURN TO TITLE SCREEN".
2. Keyboard navigation (ArrowUp/ArrowDown) cycles correctly through all three options, wrapping
   at both ends.
3. Selecting "RESUME" (index 0) resumes gameplay from the exact paused state — unchanged from the
   current implementation.
4. Selecting "RESTART" (index 1) starts a fresh game immediately in `'playing'` phase, with the
   HUD visible and no splash screen shown.
5. Selecting "RETURN TO TITLE SCREEN" (index 2) restores the full intro experience: the
   `SplashScreen` is visible and animated, tapping the canvas starts the game, and the HUD is
   hidden.
6. After "RETURN TO TITLE SCREEN", the canvas tap-to-start listener is active and a single tap
   correctly transitions the game to `'playing'`.
7. After "RESTART", pressing P or Escape pauses the game again correctly (the pause/resume cycle
   is idempotent).
8. All three options respond correctly to both keyboard Enter and pointer tap (mouse/touch).
9. `npm run test` passes — existing engine tests are unmodified and green.
10. `npm run build` exits with zero TypeScript errors and zero ESLint errors.
