# Proposal: Add Pause Modal with Blurred Background and Resume / Title Navigation

**Change name:** pause-modal
**Ticket:** #3 — Add Pause Modal with Blurred Background and Resume / Title Navigation
**Estimated complexity:** Medium (1–2 days)
**Date:** 2026-04-12

---

## Problem

When the player presses P or Escape to pause the game, the board freezes in place but provides no visual feedback that the game is paused. There is no way to resume from a paused state using the mouse or touch, and there is no escape hatch back to a title screen. The experience feels broken, especially on mobile where keyboard shortcuts are unavailable.

Specifically:

- The `'paused'` phase is handled silently in the engine — the board stops but shows nothing to indicate the game is paused.
- Resume requires pressing P or Escape again; there is no on-screen affordance.
- There is no "return to title" action at all — the only way to restart is to reload the page.
- The blurred-behind-modal pattern, which is the standard for pause screens in games, is absent.

## Proposed Solution

Introduce a `PauseModal` class in `src/ui/pauseModal.ts` that renders a centered semi-transparent dark panel with two selectable options: "RESUME" and "TITLE SCREEN". On pause, the three gameplay containers (`boardContainer`, `pieceContainer`, `effectsContainer`) receive a `BlurFilter` (strength 8). The HUD and modal container are not blurred. On unpause, blur filters are removed and the modal is hidden.

A new `modalContainer` is added as the topmost child of `app.stage` in `main.ts`. `PauseModal` receives this container in its constructor, following the same constructor pattern as `HUD`.

Keyboard navigation while paused (ArrowUp, ArrowDown, Enter) is intercepted in `main.ts` — it does not flow into the engine. Mouse/touch interaction on modal items uses `eventMode = 'static'` and `on('pointerup', handler)` on each option's Graphics object.

"Title Screen" navigates to `phase: 'intro'` if the splash-screen change (ticket #2) has been applied; otherwise it falls back to `window.location.reload()`.

## Scope

### In scope

- `src/ui/pauseModal.ts` — new `PauseModal` class: `constructor(stage)`, `show(selectedIndex)`, `hide()`, `resize(w, h)`, `setSelection(index)`, `getSelection(): number`
- `src/main.ts` — wire `modalContainer`, instantiate `PauseModal`, apply/remove blur filters, intercept ArrowUp/ArrowDown/Enter while paused
- Blur applied to `boardContainer`, `pieceContainer`, `effectsContainer` using `BlurFilter` from PixiJS v8 built-ins, guarded by `RendererType.CANVAS` check
- Blur filter state management: store original filter arrays before adding blur; restore on resume (preserving existing glow/bloom filters from `postProcess.ts`)
- `PauseModal.resize(w, h)` called from `handleResize()` in `main.ts`
- Touch/mouse on modal options: `eventMode = 'static'`, `on('pointerup', handler)`
- `GameAction.NavigateUp`, `GameAction.NavigateDown`, `GameAction.Confirm` added to `src/engine/types.ts` — consumed only in `main.ts`, never passed to engine `updateGameState` while paused

### Out of scope

- Sound/music on pause
- Animated transitions into/out of the modal
- A "Settings" or "Restart" option in the modal
- Pause modal during `'gameover'` phase (separate feature)
- Changing the engine's `GameState` to track modal selection state (the engine does not own UI selection)

## Non-goals

This change does not introduce a separate "game over" modal or any settings screen. The modal is purely a pause-time affordance. The engine's pause/resume toggle already works correctly; this change only adds the visual and navigation layer on top of it.

## Acceptance Criteria

1. Pressing P or Escape while `phase === 'playing'` pauses the game, blurs `boardContainer`/`pieceContainer`/`effectsContainer`, and shows `PauseModal`.
2. The modal displays two options: "RESUME" (index 0) and "TITLE SCREEN" (index 1), each rendered at ≥ 16px on a semi-transparent dark panel. The currently-selected option is visually highlighted (e.g., different color or cursor indicator).
3. "RESUME" (keyboard Enter or pointer tap) unpauses the engine, removes blur filters, and fully hides the modal — gameplay continues from the exact frozen state.
4. "TITLE SCREEN" resets the game to `phase: 'intro'` if that phase exists (ticket #2), otherwise calls `window.location.reload()`.
5. Pressing P or Escape again while `phase === 'paused'` resumes the game (existing engine toggle is preserved; modal closes).
6. Blur is applied to `boardContainer`, `pieceContainer`, and `effectsContainer` only. The HUD (`uiContainer`, `touchContainer`) and `modalContainer` are never blurred.
7. `PauseModal.resize(w, h)` is called on every `window.resize` event; the modal panel re-centres correctly at all viewport sizes.
8. Existing engine unit tests (`src/__tests__/engine/`) pass without any modification.
9. The modal is fully removed from the stage (not just invisible) after unpause or title-screen reset.
10. On mobile, tapping "RESUME" or "TITLE SCREEN" triggers the correct action.
