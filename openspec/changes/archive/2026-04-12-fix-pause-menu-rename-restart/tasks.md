# Tasks: Fix Pause Menu — Rename Title Screen Action and Add Restart Option

**Change name:** fix-pause-menu-rename-restart
**Date:** 2026-04-12

Tasks are ordered by dependency. Each task is independently implementable in a single focused
session (15–45 minutes). A task must not begin until all tasks it depends on are complete.

---

## Group 1: UI Layer

### Task 1.1 — Expand PauseModal to three options
**Layer:** `[frontend]`

**Description:**
Modify `src/ui/pauseModal.ts` to support three selectable options instead of two.

Make the following five changes in order:

**1. Update the file-level JSDoc block** (lines 7–9 of the options list):
```typescript
 *   0 — RESUME
 *   1 — RESTART
 *   2 — RETURN TO TITLE SCREEN
```

**2. Change `OPTION_LABELS`** (around line 18):
```typescript
// Before
const OPTION_LABELS = ['RESUME', 'TITLE SCREEN'] as const

// After
const OPTION_LABELS = ['RESUME', 'RESTART', 'RETURN TO TITLE SCREEN'] as const
```

**3. Update the `onSelect` JSDoc** (the public property comment):
```typescript
// Before
/** Called when the user confirms an option. Index 0 = Resume, 1 = Title Screen. */

// After
/** Called when the user confirms an option. Index 0 = Resume, 1 = Restart, 2 = Return to Title Screen. */
```

**4. Change the `optionTexts` field type** (in the private fields block):
```typescript
// Before
private optionTexts: [Text, Text]

// After
private optionTexts: Text[]
```

**5. Extend the constructor** to build and register the third option text. Find the block that
builds opt0 and opt1, and add opt2:
```typescript
// Before
const opt0 = this.buildOptionText(0)
const opt1 = this.buildOptionText(1)
this.optionTexts = [opt0, opt1]
this.panelRoot.addChild(opt0)
this.panelRoot.addChild(opt1)

// After
const opt0 = this.buildOptionText(0)
const opt1 = this.buildOptionText(1)
const opt2 = this.buildOptionText(2)
this.optionTexts = [opt0, opt1, opt2]
this.panelRoot.addChild(opt0)
this.panelRoot.addChild(opt1)
this.panelRoot.addChild(opt2)
```

**Do NOT modify:** `buildOptionText()`, `applySelectionStyles()`, `resize()`, `show()`, `hide()`,
`setSelection()`, `getSelection()`. These already iterate over `this.optionTexts.length` and read
from `OPTION_LABELS[i]!` — they handle the third option automatically.

**Files:**
- Modify: `src/ui/pauseModal.ts`

**Acceptance criteria:**
- `OPTION_LABELS` has exactly 3 elements: `'RESUME'`, `'RESTART'`, `'RETURN TO TITLE SCREEN'`
- `optionTexts` field is typed as `Text[]`
- Constructor creates and adds three Text nodes to `panelRoot`
- `resize(w, h)` positions all three options correctly (third option at `optionsTop + 2 * 52`)
- `setSelection(2)` highlights the third option and clears the first two
- `getSelection()` returns 2 when the third option is selected
- `onSelect` callback fires with index 2 when the third option's `pointerup` handler fires
- `npm run build` exits with zero TypeScript errors

---

## Group 2: Integration (main.ts wiring)

### Task 2.1 — Add restartGame() function
**Layer:** `[frontend]`
**Depends on:** Task 1.1

**Description:**
In `src/main.ts`, add a new inner function `restartGame()` inside `main()`, placed adjacent to
the existing `resumeFromPause()` and `navigateToTitle()` functions (the "Resume / navigate
actions" section of comments).

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

  // Create a fresh game state and advance past 'intro' → 'playing' via the engine.
  // Driving through updateGameState ensures the engine's full initialization runs
  // (piece spawn, bag seed, board reset) without duplicating that logic here.
  const fresh = createGameState()
  const result = updateGameState(fresh, [GameAction.Start], 0)
  state = result.state
  prevPhase = state.phase

  // Ensure the HUD is visible (it was shown on the first intro→playing transition,
  // but we set it explicitly here for correctness across all code paths).
  hud.setVisible(true)
}
```

Note: `GameAction` is already imported at the top of `main.ts`. No new imports are needed for
this function.

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- `restartGame()` is defined as an inner function inside `main()`
- After `restartGame()` executes, `state.phase === 'playing'`
- After `restartGame()` executes, `prevPhase === 'playing'`
- After `restartGame()` executes, `removePauseKeyListener === null`
- After `restartGame()` executes, `hud` is visible
- The blur filters are removed from all game containers
- The pause modal is hidden (removed from the scene graph)
- No new imports are required

---

### Task 2.2 — Fix navigateToTitle() to recreate SplashScreen
**Layer:** `[frontend]`
**Depends on:** Task 1.1

**Description:**
In `src/main.ts`, replace the body of the existing `navigateToTitle()` function with the fixed
implementation that recreates the `SplashScreen` instance and re-wires the canvas tap listener.

Find the existing `navigateToTitle()` function (in the "Resume / navigate actions" section) and
replace its entire body:

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
    // Engine no longer supports 'intro' phase — fall back to a full reload.
    window.location.reload()
    return
  }

  // Dismiss pause UI.
  removePauseBlur()
  pauseModal.hide()
  if (removePauseKeyListener !== null) {
    removePauseKeyListener()
    removePauseKeyListener = null
  }

  // Reset engine state.
  state = freshState
  prevPhase = state.phase

  // Recreate the splash screen — it was destroyed when the game first started.
  // splashContainer is a permanent stage child and is still in the scene graph;
  // the new SplashScreen adds its display objects back into it.
  splashScreen = new SplashScreen(splashContainer, app)
  splashScreen.resize(window.innerWidth, window.innerHeight)

  // Re-wire the canvas tap-to-start listener. The original onSplashTap closure
  // removed itself after the first tap, so we must register it again.
  canvas.addEventListener('pointerdown', onSplashTap)

  // Hide the HUD — the player is back on the intro screen.
  hud.setVisible(false)
}
```

`SplashScreen` is already imported at the top of `main.ts`. `splashContainer`, `app`, `canvas`,
`onSplashTap`, `splashScreen`, `state`, `prevPhase`, `hud`, `removePauseBlur`, `pauseModal`,
`removePauseKeyListener`, and `createGameState` are all in scope as closure variables inside
`main()`. No new imports are needed.

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- After `navigateToTitle()` executes, `splashScreen` is a non-null `SplashScreen` instance
- After `navigateToTitle()` executes, `state.phase === 'intro'`
- After `navigateToTitle()` executes, `hud` is not visible
- After `navigateToTitle()` executes, the canvas has an active `pointerdown` listener
- Tapping the canvas once after `navigateToTitle()` pushes `GameAction.Start` into
  `splashTapBuffer` and removes the listener (verified by the existing `onSplashTap` closure)
- The blur filters are removed and the pause modal is hidden
- `removePauseKeyListener` is null after the call
- The `SplashScreen` is sized to the current viewport immediately (not deferred to next resize)

---

### Task 2.3 — Route three options in onSelect and attachPauseKeyListener
**Layer:** `[frontend]`
**Depends on:** Task 2.1, Task 2.2

**Description:**
In `src/main.ts`, update the two places that dispatch on the pause selection index to handle all
three options.

**Change A — `pauseModal.onSelect` callback** (wired immediately after `PauseModal` construction):

```typescript
// Before
pauseModal.onSelect = (index: number) => {
  if (index === 0) {
    resumeFromPause()
  } else {
    navigateToTitle()
  }
}

// After
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

**Change B — `attachPauseKeyListener()`: OPTION_COUNT constant**:

```typescript
// Before
const OPTION_COUNT = 2

// After
const OPTION_COUNT = 3
```

**Change C — `attachPauseKeyListener()`: Enter-key handler**:

```typescript
// Before
} else if (e.code === 'Enter') {
  e.preventDefault()
  if (pauseSelectedIndex === 0) {
    resumeFromPause()
  } else {
    navigateToTitle()
  }
}

// After
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

The ArrowUp and ArrowDown modular arithmetic (`(pauseSelectedIndex ± 1 + OPTION_COUNT) %
OPTION_COUNT`) does not need any changes beyond the OPTION_COUNT constant update — the formula
already wraps correctly for any count.

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- `pauseModal.onSelect(0)` calls `resumeFromPause()`
- `pauseModal.onSelect(1)` calls `restartGame()`
- `pauseModal.onSelect(2)` calls `navigateToTitle()`
- `OPTION_COUNT` is `3` inside `attachPauseKeyListener()`
- Enter with `pauseSelectedIndex === 0` calls `resumeFromPause()`
- Enter with `pauseSelectedIndex === 1` calls `restartGame()`
- Enter with `pauseSelectedIndex === 2` calls `navigateToTitle()`
- ArrowDown from index 2 wraps to index 0 (modular arithmetic with OPTION_COUNT = 3)
- ArrowUp from index 0 wraps to index 2

---

## Group 3: Verification

### Task 3.1 — Manual smoke test
**Layer:** `[frontend]`
**Depends on:** Task 2.3

**Description:**
Run the game locally on the `feat/das-arr-splash-pause` branch and manually verify all three
pause menu paths:

1. **RESUME path**: Start a game → pause → arrow to "RESUME" → Enter → game continues from
   paused state. No visual artifacts. Pausing again works correctly.

2. **RESTART path**: Start a game → pause → arrow to "RESTART" → Enter → a fresh board appears
   immediately in 'playing' phase, HUD shows score 0 / level 1. No splash screen. Pausing again
   works correctly.

3. **RETURN TO TITLE SCREEN path**: Start a game → pause → arrow to "RETURN TO TITLE SCREEN" →
   Enter → splash screen is visible and pulsing, HUD is hidden. Tap/click the canvas → game
   starts from a fresh board. Pause again, select "RETURN TO TITLE SCREEN" a second time → same
   behavior (idempotent across multiple cycles).

4. **Pointer/touch path**: Verify that clicking each option with a mouse triggers the correct
   action (not just keyboard).

5. **Keyboard wrapping**: While paused, verify ArrowDown from the last option wraps to the first,
   and ArrowUp from the first wraps to the last.

**Files:**
- No files modified — verification only

**Acceptance criteria:**
- All five scenarios above produce the correct visual outcome
- No blank screen is visible at any point during any scenario
- No JavaScript console errors

---

### Task 3.2 — Automated test suite passes
**Layer:** `[frontend]`
**Depends on:** Task 2.3

**Description:**
Run the full test suite to confirm no regressions:

```bash
npm run test
npm run build
```

All existing engine tests (`src/__tests__/engine/*.test.ts`) must pass without any modification.
The build must produce zero TypeScript errors and zero ESLint errors.

**Files:**
- Verify (no modification): `src/__tests__/engine/board.test.ts`
- Verify (no modification): `src/__tests__/engine/gameState.test.ts`
- Verify (no modification): `src/__tests__/engine/gravity.test.ts`
- Verify (no modification): `src/__tests__/engine/lineClear.test.ts`
- Verify (no modification): `src/__tests__/engine/pieces.test.ts`
- Verify (no modification): `src/__tests__/engine/rotation.test.ts`

**Acceptance criteria:**
- `npm run test` exits 0 with all tests green
- `npm run build` exits 0 with zero TypeScript or ESLint errors
- Zero engine test files were modified during this change

---

## Task Ordering Summary

```
Task 1.1 (PauseModal: 3 options)
    │
    ├── Task 2.1 (restartGame function)   ─────────────────────┐
    │                                                          │
    └── Task 2.2 (fix navigateToTitle)   ─────────────────────┤
                                                              │
                                                    Task 2.3 (route 3 options)
                                                              │
                                              ┌───────────────┴───────────────┐
                                              │                               │
                                        Task 3.1                        Task 3.2
                                    (manual smoke)                (test suite passes)
```

Tasks 2.1 and 2.2 can be implemented in parallel — they modify different functions.
Tasks 3.1 and 3.2 can be run in parallel once 2.3 is complete.
