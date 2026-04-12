# Context Bundle: Fix Pause Menu — Rename Title Screen Action and Add Restart Option

**Change name:** fix-pause-menu-rename-restart
**Date:** 2026-04-12
**For:** Developer agent — read this in full before beginning implementation.
**Branch:** `feat/das-arr-splash-pause`

---

## What to Build

Three targeted changes to fix two bugs and add one new feature in the pause overlay:

1. **Expand PauseModal** from 2 options to 3: RESUME / RESTART / RETURN TO TITLE SCREEN.
2. **Add `restartGame()`** in `main.ts` — resets to a fresh game in 'playing' phase without
   going through the intro splash.
3. **Fix `navigateToTitle()`** in `main.ts` — recreate the `SplashScreen` instance and re-wire
   the canvas tap listener so the player actually sees the splash screen.

---

## Critical Constraints

1. **The engine (`src/engine/`) is not modified.** No new `GameAction` values, no new fields on
   `GameState`. Use `GameAction.Start` (already defined) to drive the intro → playing transition
   inside `restartGame()`.

2. **`src/__tests__/engine/` tests are not modified.** If any engine test fails, the
   implementation has a bug.

3. **`src/ui/pauseModal.ts` must not import from `renderer/`, `input/`, or `engine/gameState.js`.**
   ESLint enforces this — the build will fail if violated.

4. **`splashContainer` is a permanent stage child.** It was not destroyed when the original
   `SplashScreen` was destroyed. It is still in the scene graph as an empty container. The new
   `new SplashScreen(splashContainer, app)` call will populate it again. Do NOT call
   `app.stage.addChild(splashContainer)` a second time.

5. **`onSplashTap` is a stable closure reference.** It removes itself from the canvas after the
   first invocation. `navigateToTitle()` must re-add it with
   `canvas.addEventListener('pointerdown', onSplashTap)`. Do not create a new closure inside
   `navigateToTitle()`.

6. **`restartGame()` must call `updateGameState(createGameState(), [GameAction.Start], 0)`,
   not a direct phase mutation.** This ensures the engine's full initialization sequence runs
   (piece spawn, bag seed). `dtMs = 0` is safe for a pure action dispatch — the engine performs
   no gravity or lock when dt is 0.

7. **The word "Tetris" must never appear in user-facing text.** The three new/renamed labels
   ("RESTART", "RETURN TO TITLE SCREEN") are safe. Do not add any string containing "Tetris".

---

## Exact Changes

### `src/ui/pauseModal.ts` — MODIFY

Five targeted edits. No method bodies change except the constructor.

**Edit 1 — File-level JSDoc (top of file)**

Find this block in the JSDoc comment:
```
 *   0 — RESUME
 *   1 — TITLE SCREEN
```
Replace with:
```
 *   0 — RESUME
 *   1 — RESTART
 *   2 — RETURN TO TITLE SCREEN
```

**Edit 2 — OPTION_LABELS constant**

```typescript
// Change this line:
const OPTION_LABELS = ['RESUME', 'TITLE SCREEN'] as const
// To:
const OPTION_LABELS = ['RESUME', 'RESTART', 'RETURN TO TITLE SCREEN'] as const
```

**Edit 3 — onSelect JSDoc**

```typescript
// Change this line:
/** Called when the user confirms an option. Index 0 = Resume, 1 = Title Screen. */
// To:
/** Called when the user confirms an option. Index 0 = Resume, 1 = Restart, 2 = Return to Title Screen. */
```

**Edit 4 — optionTexts field type**

```typescript
// Change this line:
private optionTexts: [Text, Text]
// To:
private optionTexts: Text[]
```

**Edit 5 — Constructor: add opt2**

Find the block in the constructor:
```typescript
const opt0 = this.buildOptionText(0)
const opt1 = this.buildOptionText(1)
this.optionTexts = [opt0, opt1]
this.panelRoot.addChild(opt0)
this.panelRoot.addChild(opt1)
```
Replace with:
```typescript
const opt0 = this.buildOptionText(0)
const opt1 = this.buildOptionText(1)
const opt2 = this.buildOptionText(2)
this.optionTexts = [opt0, opt1, opt2]
this.panelRoot.addChild(opt0)
this.panelRoot.addChild(opt1)
this.panelRoot.addChild(opt2)
```

---

### `src/main.ts` — MODIFY

Four targeted edits.

**Edit 1 — pauseModal.onSelect callback**

Find:
```typescript
pauseModal.onSelect = (index: number) => {
  if (index === 0) {
    resumeFromPause()
  } else {
    navigateToTitle()
  }
}
```
Replace with:
```typescript
pauseModal.onSelect = (index: number) => {
  if (index === 0) {
    resumeFromPause()
  } else if (index === 1) {
    restartGame()
  } else {
    navigateToTitle()
  }
}
```

**Edit 2 — Add restartGame() function**

Inside `main()`, in the "Resume / navigate actions" section alongside `resumeFromPause()` and
`navigateToTitle()`, add:

```typescript
/**
 * Restart the game immediately from a fresh state, bypassing the intro splash.
 *
 * Creates a new game in 'playing' phase without showing the splash screen.
 * The HUD remains visible. The splash screen is not recreated.
 */
function restartGame(): void {
  removePauseBlur()
  pauseModal.hide()

  if (removePauseKeyListener !== null) {
    removePauseKeyListener()
    removePauseKeyListener = null
  }

  const fresh = createGameState()
  const result = updateGameState(fresh, [GameAction.Start], 0)
  state = result.state
  prevPhase = state.phase

  hud.setVisible(true)
}
```

**Edit 3 — Fix navigateToTitle() body**

Find the entire body of `navigateToTitle()` and replace it:

```typescript
/**
 * Navigate back to the title / intro screen, fully restoring the splash experience.
 *
 * Recreates the SplashScreen instance (destroyed on first intro→playing transition)
 * and re-wires the canvas pointer listener for tap-to-start.
 */
function navigateToTitle(): void {
  const freshState = createGameState()
  if (freshState.phase !== 'intro') {
    window.location.reload()
    return
  }

  removePauseBlur()
  pauseModal.hide()
  if (removePauseKeyListener !== null) {
    removePauseKeyListener()
    removePauseKeyListener = null
  }

  state = freshState
  prevPhase = state.phase

  splashScreen = new SplashScreen(splashContainer, app)
  splashScreen.resize(window.innerWidth, window.innerHeight)

  canvas.addEventListener('pointerdown', onSplashTap)

  hud.setVisible(false)
}
```

**Edit 4 — attachPauseKeyListener: OPTION_COUNT and Enter routing**

Find inside `attachPauseKeyListener()`:
```typescript
const OPTION_COUNT = 2
```
Change to:
```typescript
const OPTION_COUNT = 3
```

Then find the Enter handler inside the same function:
```typescript
} else if (e.code === 'Enter') {
  e.preventDefault()
  if (pauseSelectedIndex === 0) {
    resumeFromPause()
  } else {
    navigateToTitle()
  }
}
```
Replace with:
```typescript
} else if (e.code === 'Enter') {
  e.preventDefault()
  if (pauseSelectedIndex === 0) {
    resumeFromPause()
  } else if (pauseSelectedIndex === 1) {
    restartGame()
  } else {
    navigateToTitle()
  }
}
```

---

## Files That Are NOT Changed

| File | Reason |
|---|---|
| `src/engine/types.ts` | `GameAction.Start` already exists; no new actions needed |
| `src/engine/gameState.ts` | Engine untouched |
| `src/input/keyboard.ts` | Input layer untouched |
| `src/input/touch.ts` | Input layer untouched |
| `src/ui/hud.ts` | HUD untouched |
| `src/ui/splashScreen.ts` | Class is reused as-is; only re-instantiated at runtime |
| `src/renderer/**` | Renderer layer untouched |
| `src/__tests__/**` | No test files are modified |

---

## Task Dependency Graph

```
Task 1.1 (pauseModal.ts: 3 options)
    │
    ├── Task 2.1 (main.ts: add restartGame)   ──────────────────┐
    │                                                           │
    └── Task 2.2 (main.ts: fix navigateToTitle)  ──────────────┤
                                                               │
                                                     Task 2.3 (main.ts: route 3 options)
                                                               │
                                               ┌──────────────┴──────────────┐
                                               │                             │
                                         Task 3.1                      Task 3.2
                                     (manual smoke)               (test suite passes)
```

Tasks 2.1 and 2.2 are independent — they modify different functions and can be done in any order.
Task 2.3 depends on both because it calls `restartGame()` (added in 2.1) and references the
updated `navigateToTitle()` (fixed in 2.2).

---

## Risk Assessment

### Risk 1 — splashTapBuffer stale state (MEDIUM)

If `splashTapBuffer` contains a `GameAction.Start` entry from a previous cycle when
`navigateToTitle()` is called, the game loop will immediately drain it on the next tick,
transitioning `'intro'` → `'playing'` before the player has tapped anything.

**Mitigation:** Clear `splashTapBuffer` in `navigateToTitle()` before re-registering the
listener:

```typescript
splashTapBuffer.splice(0)  // drain any stale Start action
canvas.addEventListener('pointerdown', onSplashTap)
```

`splashTapBuffer` is a `const` array, so it can be mutated with `splice`. Check whether this
edge case is possible: the buffer is only populated by `onSplashTap`, which removes itself after
one call. Under normal operation the buffer is drained immediately in the next loop tick. The
edge case only occurs if the game transitions `'intro'` → `'playing'` and then `navigateToTitle()`
is called within the same tick before the buffer drains — which cannot happen in the current
architecture. Nonetheless, adding `splashTapBuffer.splice(0)` is a low-cost defensive measure
worth including.

### Risk 2 — prevPhase not updated in restartGame (LOW)

If `prevPhase` is not set to `state.phase` after `restartGame()` runs, the game loop's edge
detection will see `prevPhase === 'paused'` and `state.phase === 'playing'` on the next frame,
triggering the `justResumed` branch and calling `removePauseBlur()` a second time (which is
a no-op because `prePauseFilters` is already cleared). This is harmless but sloppy.

**Mitigation:** Set `prevPhase = state.phase` explicitly in `restartGame()`, as shown in the
task. This matches the pattern in `resumeFromPause()`.

### Risk 3 — Double splashScreen resize (LOW)

After `navigateToTitle()` calls `splashScreen.resize(...)`, the next `window.resize` event will
call `handleResize()`, which calls `splashScreen.resize()` again through the existing guard:

```typescript
if (splashScreen !== null) {
  splashScreen.resize(window.innerWidth, window.innerHeight)
}
```

`SplashScreen.resize()` is idempotent — calling it twice is safe. No mitigation needed beyond
confirming `SplashScreen.resize()` does not accumulate state on repeated calls (verified by
reading the class: it repositions text based on arguments, with no side effects).

### Risk 4 — HUD visible state after restart (LOW)

If the HUD somehow ended up hidden (e.g., a future code path called `hud.setVisible(false)`)
before `restartGame()` runs, the explicit `hud.setVisible(true)` in `restartGame()` ensures it
is shown. The current code only hides the HUD in `main()` initialization and in
`navigateToTitle()`, so this is already correct — the defensive call costs nothing.

---

## Key File References

| File | What to look at |
|---|---|
| `src/ui/pauseModal.ts` | Full current source; all 5 edits are in this file |
| `src/main.ts` | `navigateToTitle()` (lines ~230–260), `resumeFromPause()`, `attachPauseKeyListener()`, `pauseModal.onSelect` wiring |
| `src/ui/splashScreen.ts` | Constructor signature `(stage: Container, app: Application)` and `resize(w, h)` method |
| `src/engine/gameState.ts` | `createGameState()` return type; `updateGameState()` with `GameAction.Start` |
| `src/engine/types.ts` | Confirm `GameAction.Start` exists |
