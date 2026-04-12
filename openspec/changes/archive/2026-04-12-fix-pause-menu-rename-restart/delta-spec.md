# Delta Spec: Fix Pause Menu — Rename Title Screen Action and Add Restart Option

**Change name:** fix-pause-menu-rename-restart
**Date:** 2026-04-12

---

## Baseline

`src/ui/pauseModal.ts` has exactly two options: index 0 = "RESUME", index 1 = "TITLE SCREEN".

`src/main.ts` has:
- `OPTION_COUNT = 2` in `attachPauseKeyListener()`
- `navigateToTitle()` that resets state to `createGameState()` but does NOT recreate the splash screen
- No `restartGame()` function

---

## What Changes

### `src/ui/pauseModal.ts`

**Change 1 — OPTION_LABELS constant**

```typescript
// Before
const OPTION_LABELS = ['RESUME', 'TITLE SCREEN'] as const

// After
const OPTION_LABELS = ['RESUME', 'RESTART', 'RETURN TO TITLE SCREEN'] as const
```

**Change 2 — optionTexts field type**

```typescript
// Before
private optionTexts: [Text, Text]

// After
private optionTexts: Text[]
```

**Change 3 — Constructor: build and register third option**

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

**Change 4 — Class-level JSDoc comment**

Update the file-level JSDoc block to list three options and their indices:
```
 *   0 — RESUME
 *   1 — RESTART
 *   2 — RETURN TO TITLE SCREEN
```

**Change 5 — onSelect property JSDoc**

```typescript
// Before
/** Called when the user confirms an option. Index 0 = Resume, 1 = Title Screen. */

// After
/** Called when the user confirms an option. Index 0 = Resume, 1 = Restart, 2 = Return to Title Screen. */
```

No changes to: `buildOptionText()`, `applySelectionStyles()`, `resize()`, `show()`, `hide()`,
`setSelection()`, `getSelection()`. These methods already iterate over `optionTexts.length` and
read from `OPTION_LABELS[i]` — they require no modification.

---

### `src/main.ts`

**Change 6 — pauseModal.onSelect callback routing**

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

**Change 7 — attachPauseKeyListener: OPTION_COUNT**

```typescript
// Before
const OPTION_COUNT = 2

// After
const OPTION_COUNT = 3
```

**Change 8 — attachPauseKeyListener: Enter-key confirm routing**

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

**Change 9 — Add restartGame() function**

New inner function inside `main()`, placed alongside `resumeFromPause()` and `navigateToTitle()`:

```typescript
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

**Change 10 — Fix navigateToTitle() to recreate SplashScreen**

```typescript
// Before
function navigateToTitle(): void {
  const freshState = createGameState()
  if (freshState.phase === 'intro') {
    state = freshState
    removePauseBlur()
    pauseModal.hide()
    if (removePauseKeyListener !== null) {
      removePauseKeyListener()
      removePauseKeyListener = null
    }
    prevPhase = state.phase
  } else {
    window.location.reload()
  }
}

// After
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

---

## What Does Not Change

- `src/engine/types.ts` — `GameAction` enum is not modified
- `src/engine/gameState.ts` — engine logic is not modified
- `src/input/keyboard.ts` — keyboard mapping is not modified
- `src/input/touch.ts` — touch input is not modified
- `src/ui/hud.ts` — HUD is not modified
- `src/ui/splashScreen.ts` — SplashScreen class is not modified (only re-instantiated at runtime)
- `src/renderer/**` — renderer layer is not modified
- `src/__tests__/**` — no test files are modified

---

## Constraints

| Constraint | Enforcement |
|---|---|
| Engine (`src/engine/`) must not be modified | Code review; no engine file imports should change |
| "Tetris" must not appear in any user-facing string | The new label "RESTART" and "RETURN TO TITLE SCREEN" are safe; developer must not add any "Tetris" text |
| `pauseModal.ts` must not import from `renderer/`, `input/`, or `engine/gameState.js` | ESLint no-restricted-imports rule — build will fail if violated |
| `splashScreen` variable must not be null after `navigateToTitle()` completes | Verified by the assignment `splashScreen = new SplashScreen(...)` |
| `canvas` reference must be in scope inside `navigateToTitle()` | It is — `canvas` is a closure variable in `main()`, same scope as all other helpers |
| `onSplashTap` must be re-registered exactly once per `navigateToTitle()` call | The listener removes itself on first invocation, so re-registering is idempotent for one cycle |

---

## Acceptance Test Checklist

- [ ] The pause modal shows exactly three options when opened: "RESUME", "RESTART",
      "RETURN TO TITLE SCREEN" (in that order, top to bottom)
- [ ] ArrowDown from index 0 moves to index 1; from index 1 to index 2; from index 2 wraps to
      index 0
- [ ] ArrowUp from index 2 moves to index 1; from index 1 to index 0; from index 0 wraps to
      index 2
- [ ] Enter on index 0 calls `resumeFromPause()` — gameplay resumes from the exact paused state
- [ ] Enter on index 1 calls `restartGame()` — board is reset, a new game begins in 'playing'
      phase, HUD is visible
- [ ] Enter on index 2 calls `navigateToTitle()` — splash screen is visible and animated, HUD is
      hidden, tapping canvas starts a new game
- [ ] Clicking/tapping "RESTART" with a pointer triggers `restartGame()` (index 1 pointerup)
- [ ] Clicking/tapping "RETURN TO TITLE SCREEN" with a pointer triggers `navigateToTitle()`
      (index 2 pointerup)
- [ ] After `navigateToTitle()`, tapping the canvas once advances to 'playing' phase
- [ ] After `navigateToTitle()`, tapping the canvas a second time does NOT trigger a second start
      action (the listener removed itself after the first tap)
- [ ] After `restartGame()`, pressing P or Escape correctly pauses the game again (pause cycle
      is idempotent)
- [ ] `npm run test` passes with all engine tests green
- [ ] `npm run build` exits with zero errors
