# Design: Fix Pause Menu — Rename Title Screen Action and Add Restart Option

**Change name:** fix-pause-menu-rename-restart
**Date:** 2026-04-12

---

## 1. Architecture Overview

This change is entirely within the `ui/` layer and `main.ts`. The engine is not touched.

```
src/
├── engine/          [core]    UNCHANGED
├── renderer/        [frontend] UNCHANGED
├── input/           [frontend] UNCHANGED
├── ui/              [frontend]
│   ├── hud.ts                 UNCHANGED
│   ├── splashScreen.ts        UNCHANGED (class is reused, not recreated from scratch)
│   └── pauseModal.ts          MODIFY — 3 options instead of 2
└── main.ts          [infra]   MODIFY — restartGame(), fixed navigateToTitle(), 3-option routing
```

---

## 2. Root Cause Analysis

### Bug 1 — Blank screen after "TITLE SCREEN"

The intro → playing transition in the game loop:

```typescript
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  splashScreen?.destroy()   // <-- SplashScreen.destroy() removes ticker callback,
  splashScreen = null       //     destroys all PixiJS display objects, removes from
  hud.setVisible(true)      //     splashContainer. These objects are gone permanently.
}
```

`SplashScreen.destroy()` is destructive: it removes the animated ticker callback, destroys all
Text and Container objects inside `splashContainer`, and sets the container's children to zero.
Calling `splashScreen = null` then removes the JS reference. The `splashContainer` itself still
exists as a child of `app.stage`, but it is now empty.

When `navigateToTitle()` runs:

```typescript
state = createGameState()   // phase = 'intro' ✓
removePauseBlur()           // ✓
pauseModal.hide()           // ✓
```

The engine is in `'intro'` phase, so the game loop does not drive gameplay rendering. But nothing
re-populates `splashContainer`. The player sees empty containers and has no way to advance.

### Bug 2 — Missing restart

`resumeFromPause()` continues from the paused state. There is no path that resets `state` to a
fresh `'playing'` game without going through `'intro'`. The two current options (resume, title
screen) do not cover this case.

---

## 3. pauseModal.ts Changes

### 3.1 OPTION_LABELS

```typescript
// Before
const OPTION_LABELS = ['RESUME', 'TITLE SCREEN'] as const

// After
const OPTION_LABELS = ['RESUME', 'RESTART', 'RETURN TO TITLE SCREEN'] as const
```

The `as const` assertion is preserved, which makes `OPTION_LABELS[i]` a string-literal type.
The non-null assertion `OPTION_LABELS[i]!` in `buildOptionText` and `applySelectionStyles` remains
correct — the array has exactly 3 elements and the loop iterates over indices 0–2.

### 3.2 optionTexts type

```typescript
// Before
private optionTexts: [Text, Text]

// After
private optionTexts: Text[]
```

The tuple type `[Text, Text]` is widened to `Text[]`. A `[Text, Text, Text]` tuple would also
work, but `Text[]` is simpler, matches how the array is already iterated (for loops over
`this.optionTexts.length`), and requires no change to the iteration code in `resize()` or
`applySelectionStyles()`.

### 3.3 Constructor — third option

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

`buildOptionText(index)` already uses `OPTION_LABELS[index]!` to fetch the label, so calling it
with index 2 produces a Text node with "RETURN TO TITLE SCREEN" automatically. No other changes
to `buildOptionText` are needed.

### 3.4 resize() — no change needed

`resize()` already uses a `for` loop over `this.optionTexts.length`:

```typescript
for (let i = 0; i < this.optionTexts.length; i++) {
  const t = this.optionTexts[i]!
  t.x = Math.floor((w - t.width) / 2)
  t.y = optionsTop + i * optionSpacing
}
```

With three options, this loop naturally positions all three at `optionsTop`, `optionsTop + 52`,
and `optionsTop + 104`. No explicit change needed.

### 3.5 applySelectionStyles() — no change needed

`applySelectionStyles()` already loops over `this.optionTexts.length` and uses
`OPTION_LABELS[i]!`. With the array expanded to 3 items, this loop handles all three options
automatically.

### 3.6 JSDoc comment update

The class-level JSDoc and the `onSelect` property JSDoc must be updated to reflect the new index
mapping:

```typescript
// onSelect: (index: number) => void
// index 0 = Resume, 1 = Restart, 2 = Return to Title Screen
```

---

## 4. main.ts Changes

### 4.1 onSelect callback routing

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

### 4.2 attachPauseKeyListener — OPTION_COUNT and Enter routing

```typescript
// Before
const OPTION_COUNT = 2
// ...
} else if (e.code === 'Enter') {
  e.preventDefault()
  if (pauseSelectedIndex === 0) {
    resumeFromPause()
  } else {
    navigateToTitle()
  }
}

// After
const OPTION_COUNT = 3
// ...
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

The ArrowUp/ArrowDown modular arithmetic `(pauseSelectedIndex ± 1 + OPTION_COUNT) % OPTION_COUNT`
already handles any count correctly — only the constant changes.

### 4.3 New function: restartGame()

```typescript
/**
 * Restart the game immediately from a fresh state, bypassing the intro splash.
 *
 * Produces a new game in 'playing' phase without showing the splash screen.
 * The HUD remains visible. The splash screen is not recreated.
 */
function restartGame(): void {
  removePauseBlur()
  pauseModal.hide()
  if (removePauseKeyListener !== null) {
    removePauseKeyListener()
    removePauseKeyListener = null
  }

  // Build a fresh state and immediately advance past 'intro' → 'playing'.
  // We construct a state that starts in 'playing' directly rather than going
  // through the intro flow, because the splash screen is already destroyed.
  const fresh = createGameState()
  // Dispatch GameAction.Start to transition intro → playing in the engine.
  const result = updateGameState(fresh, [GameAction.Start], 0)
  state = result.state
  prevPhase = state.phase

  // HUD should already be visible (it was shown when the original intro→playing
  // transition happened). Ensure it is visible defensively.
  hud.setVisible(true)
}
```

**Why `updateGameState(fresh, [GameAction.Start], 0)` rather than a direct state mutation?**
`createGameState()` returns `phase: 'intro'`. The engine's `updateGameState` handles the
`GameAction.Start` action in `'intro'` phase by returning a new state with `phase: 'playing'` and
a fully initialized board, active piece, and bag. Driving the transition through the engine keeps
the state mutation in one place and avoids duplicating the initialization logic.

Calling with `dtMs = 0` is safe for a pure phase-transition dispatch — the engine performs no
gravity or lock logic when `dtMs` is 0 (or extremely small). This is the same pattern already
used in `resumeFromPause()`.

### 4.4 Fixed function: navigateToTitle()

```typescript
/**
 * Navigate back to the title / intro screen, fully restoring the splash experience.
 *
 * Recreates the SplashScreen instance (which was destroyed on first intro→playing
 * transition) and re-wires the canvas pointer listener for tap-to-start.
 */
function navigateToTitle(): void {
  const freshState = createGameState()
  if (freshState.phase !== 'intro') {
    // Engine no longer has an 'intro' phase — fall back to a full reload.
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
  splashScreen = new SplashScreen(splashContainer, app)
  splashScreen.resize(window.innerWidth, window.innerHeight)

  // Re-wire the canvas tap-to-start listener.
  // The previous listener removed itself after the first tap (in the original
  // onSplashTap closure). We must register a new one.
  canvas.addEventListener('pointerdown', onSplashTap)

  // Hide the HUD — the player is back at the intro screen.
  hud.setVisible(false)
}
```

**Key detail — `onSplashTap` reuse:**
The original `onSplashTap` closure and `splashTapBuffer` are defined once at the top of `main()`:

```typescript
const splashTapBuffer: GameAction[] = []
const onSplashTap = () => {
  splashTapBuffer.push(GameAction.Start)
  canvas.removeEventListener('pointerdown', onSplashTap)
}
canvas.addEventListener('pointerdown', onSplashTap)
```

`onSplashTap` removes itself after the first tap, so after the first game start the listener is
gone. `navigateToTitle()` re-adds the same `onSplashTap` reference with
`canvas.addEventListener('pointerdown', onSplashTap)`. Because `onSplashTap` still removes itself
on the next tap, this works correctly for any number of title → play → pause → title cycles.

**Key detail — `splashScreen.resize()` after recreation:**
The newly created `SplashScreen` must be sized to the current viewport before it becomes visible.
`handleResize()` is not called automatically here — we call `splashScreen.resize()` directly.
This avoids a one-frame flash at the wrong size.

**Key detail — `splashContainer` reuse:**
`splashContainer` is a permanent child of `app.stage` that persists for the lifetime of the
application. When `SplashScreen` is destroyed, its internal display objects are removed from
`splashContainer` but `splashContainer` itself remains. The new `SplashScreen(splashContainer, app)`
call adds fresh display objects into the same container. No `app.stage.addChild` is needed.

---

## 5. Interaction with the Game Loop

After `restartGame()`:
- `state.phase === 'playing'`
- `prevPhase` is set to `'playing'`
- The `justPaused` / `justResumed` edge detection in the loop will not fire spuriously
- On the next loop iteration, `boardRenderer`, `pieceRenderer`, and `hud` render the fresh playing
  state normally

After `navigateToTitle()`:
- `state.phase === 'intro'`
- `prevPhase` is set to `'intro'`
- The loop will not try to destroy the new splash screen until the player taps again
- The `intro → playing` transition block (`splashScreen?.destroy(); splashScreen = null;
  hud.setVisible(true)`) fires correctly when the player taps

---

## 6. Data Flow

```
Player opens pause menu (P or Escape)
        │
        ▼  [existing behavior — unchanged]
applyPauseBlur() / pauseModal.show(0) / attachPauseKeyListener()

Player selects RESUME (index 0)
        │
        ▼  [unchanged]
resumeFromPause() → engine 'paused' → 'playing'

Player selects RESTART (index 1)
        │
        ▼
restartGame():
  removePauseBlur() + pauseModal.hide() + remove listener
  createGameState() → updateGameState([GameAction.Start], 0)
  state.phase = 'playing'
  hud.setVisible(true)
  [loop continues rendering normally]

Player selects RETURN TO TITLE SCREEN (index 2)
        │
        ▼
navigateToTitle():
  removePauseBlur() + pauseModal.hide() + remove listener
  state = createGameState()   // phase = 'intro'
  splashScreen = new SplashScreen(splashContainer, app)
  splashScreen.resize(window.innerWidth, window.innerHeight)
  canvas.addEventListener('pointerdown', onSplashTap)
  hud.setVisible(false)
        │
        ▼  [player is on intro screen]
Player taps canvas
        │
        ▼
onSplashTap() → splashTapBuffer.push(GameAction.Start)
  [removes itself]
        │
        ▼  [next game loop tick]
updateGameState(state, [GameAction.Start], dt)
  → state.phase = 'playing'
        │
        ▼
splashScreen?.destroy(); splashScreen = null; hud.setVisible(true)
  [game is running]
```

---

## 7. Files Changed

| File | Status | Summary of changes |
|---|---|---|
| `src/ui/pauseModal.ts` | MODIFY | Add 3rd option, widen optionTexts type, update JSDoc |
| `src/main.ts` | MODIFY | restartGame(), fixed navigateToTitle(), 3-option routing |
| `src/engine/types.ts` | NO CHANGE | Engine enum untouched |
| `src/engine/gameState.ts` | NO CHANGE | Engine untouched |
| `src/input/keyboard.ts` | NO CHANGE | Input layer untouched |
| `src/ui/splashScreen.ts` | NO CHANGE | Class is reused as-is |
| `src/__tests__/engine/**` | NO CHANGE | Engine tests must pass unmodified |

---

## 8. Key Design Decisions

### Decision A: restartGame() drives through GameAction.Start rather than direct phase mutation

Calling `updateGameState(createGameState(), [GameAction.Start], 0)` to produce a `'playing'`
state is preferable to constructing a partial state manually (e.g., `{ ...createGameState(),
phase: 'playing' }`). The engine's `updateGameState` ensures the full initialization sequence
runs — the active piece is spawned, the bag is seeded, and the board is in a valid starting
configuration. Direct mutation would require knowledge of the engine's internal initialization
invariants, coupling `main.ts` to those details.

**Alternative rejected:** Setting `phase: 'playing'` via direct spread and calling
`createGameState()` produces a state whose other fields are correct for `'intro'` (e.g., no
active piece spawned yet). The engine initialization at the `Start` action handles this correctly.

### Decision B: onSplashTap closure is reused, not recreated

`onSplashTap` is a stable function reference defined once in `main()`. Re-registering it with
`canvas.addEventListener('pointerdown', onSplashTap)` works because `onSplashTap` removes itself
on the first invocation. Creating a new closure inside `navigateToTitle()` would be equivalent
but would also require changing the original registration to use the new reference — which would
require either a `let` variable or a function declaration. Reusing the stable reference is
simpler.

### Decision C: splashScreen.resize() called immediately after recreation

If we relied on the next `window.resize` event or the next `handleResize()` call, the splash
screen would render at 0×0 or an incorrect size for the first one or two frames. Calling
`splashScreen.resize(window.innerWidth, window.innerHeight)` immediately after construction
ensures the splash is correctly sized on the very first render frame.

### Decision D: widening optionTexts from [Text, Text] to Text[]

A fixed-length tuple `[Text, Text, Text]` would be more precise but would require changing the
type annotation in one place and provide no runtime benefit. The existing code already accesses
elements via `this.optionTexts[i]!` in loops — the tuple length is never relied upon structurally
elsewhere. `Text[]` is the minimal change that unblocks the constructor assignment without
introducing TypeScript errors.

---

## 9. Compatibility Impact

### Surface changes

| Element | Change type | Description |
|---|---|---|
| `PauseModal.onSelect` index mapping | Category 4 (Behavioral) | Index 1 now means Restart; index 2 means Title Screen (previously index 1) |
| Pause modal option count | Category 4 (Behavioral) | Three options instead of two |

Both changes are contained within `main.ts`'s `onSelect` wiring and `attachPauseKeyListener`.
No external module calls `pauseModal.onSelect` directly — it is set and consumed entirely within
`main.ts`. No TypeScript interface or exported type changes.

**Compatibility Notes:**
The `onSelect` index-to-action mapping is an internal behavioral change. No code outside `main.ts`
depends on the numeric index values. If any future module were to call `pauseModal.onSelect`
directly and pass `index = 1` expecting "title screen" behavior, it would now receive "restart"
behavior instead. This is unlikely given the current architecture (onSelect is only wired in
main.ts), but callers should be aware the mapping has shifted.
