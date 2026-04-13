# Design: Main Menu Screen with Exit Button

## 1. Phase Architecture Decision

### Decision: Extend `'intro'`, do not add `'menu'`

The ticket description offers two paths: (a) add a new `'menu'` phase alongside `'intro'`, or (b) evolve `'intro'` to serve as the main menu phase. This design chooses (b).

**Rationale:**

The engine phase union (`'intro' | 'playing' | 'paused' | 'gameover'`) is a discriminated type used across:
- `updateGameState()` phase guard branches (5 branches)
- `GameState` interface declaration
- `createGameState()` default value
- `main.ts` edge-detection logic (`prevPhase`, `justPaused`, transition guards)
- All existing engine unit tests (`createGameState` returns `'intro'`)

Adding `'menu'` would require touching every one of those locations with no change in observable engine behaviour — the engine would still just block game logic and wait for `GameAction.Start`. The only effect of `'menu'` would be on the UI layer, and that is cleanly handled by replacing the `SplashScreen` instance with a `MainMenu` instance in `main.ts`. The engine stays completely untouched.

After Game Over, the existing `navigateToTitle()` function in `main.ts` already resets state to `createGameState()` (phase `'intro'`) and re-instantiates the splash UI. This function simply needs to instantiate `MainMenu` instead of `SplashScreen`.

**The `'intro'` phase semantics remain exactly the same:** only `GameAction.Start` is processed; all other actions are dropped. This is correct for the main menu — no game logic should run.

---

## 2. Component: `MainMenu` (`src/ui/mainMenu.ts`)

### Visual Layout

```
┌──────────────────────────────────────────┐
│                                          │
│            BLOCK DROP          (title)   │
│                                          │
│           [  PLAY  ]           (button)  │
│           [  EXIT  ]           (button)  │
│                                          │
│  Close this tab to exit     (fallback)   │
└──────────────────────────────────────────┘
```

- Title at ~35% from top (matching existing SplashScreen position)
- Buttons centered horizontally, stacked vertically with 60px gap
- Fallback message centered below buttons; hidden by default, shown for 3 seconds after a blocked `window.close()`
- On narrow viewports (min 320px): font sizes use `Math.max(minSize, scaledSize)` to stay legible

### Constructor Signature

```typescript
constructor(stage: Container, app: Application)
```

Matches `SplashScreen` exactly — so `main.ts` substitution is a drop-in.

### Public API

```typescript
resize(width: number, height: number): void
destroy(): void
```

Also matches `SplashScreen`. The `destroy()` method must:
1. Remove the ticker callback (pulsing title animation)
2. Clear any pending `setTimeout` for the fallback message
3. Call `container.destroy({ children: true })`

### Button Implementation

Buttons are PixiJS `Container` objects wrapping a `Graphics` (pill background) and a `Text` label. They use `eventMode = 'static'` and `cursor = 'pointer'`, consistent with `PauseModal` option text interactive pattern.

**Play button:** on `pointerup`, pushes `GameAction.Start` into `menuActionBuffer` (a `GameAction[]` held in `MainMenu`). The buffer is flushed by `main.ts` each tick via a `flushActions()` method — this keeps input wiring in `main.ts` and avoids the `MainMenu` needing to know about the engine loop.

**Exit button:** on `pointerup`, calls the `onExit` callback (injected by `main.ts`). The callback is typed `() => void`. Default is a no-op.

### Exported interface

```typescript
export class MainMenu {
  /** Called when the Exit button is tapped/clicked. */
  onExit: () => void

  constructor(stage: Container, app: Application)
  flushActions(): GameAction[]
  resize(width: number, height: number): void
  destroy(): void
}
```

### Keyboard support

The `'intro'` phase already processes `GameAction.Start` from the keyboard (`KeyboardInput` buffers it on Enter). No new keyboard wiring is needed for Play.

For Exit: pressing Escape while in `'intro'` phase calls `onExit`. This is wired in `main.ts` via a transient `keydown` listener (same pattern used for pause menu navigation), active only while `state.phase === 'intro'`. The listener is attached when `MainMenu` is instantiated and detached when it is destroyed.

### Fallback message for blocked `window.close()`

`window.close()` is blocked by browsers when the tab was not opened by script. The `onExit` callback in `main.ts` will:
1. Call `window.close()`
2. After a synchronous 50ms check (using a `setTimeout` with 0 delay to let the browser process the close), if the window is still open, call `mainMenu.showExitFallback()` — a public method that makes the fallback text visible.
3. `MainMenu` internally uses a `setTimeout` of 3000ms to hide the fallback again.

```typescript
showExitFallback(): void  // added to MainMenu public API
```

### Touch / pointer support on mobile

The canvas `pointerdown` listener used by `SplashScreen` for tap-to-start is replaced by the `MainMenu` Play button's `pointerup` event, which works for both mouse and touch. No separate `onSplashTap` canvas listener is needed. The `app.renderer.plugins.interaction` (PixiJS event system) handles touch correctly when `eventMode = 'static'` is set on containers.

---

## 3. Changes to `src/engine/types.ts`

**None.** The phase union and `GameAction` enum are unchanged.

---

## 4. Changes to `src/engine/gameState.ts`

**None.** `createGameState()` continues to return `phase: 'intro'`. `updateGameState()` phase guards are unchanged.

---

## 5. Changes to `src/main.ts`

### Replace `SplashScreen` with `MainMenu`

```typescript
// Before
import { SplashScreen } from './ui/splashScreen.js'
let splashScreen: SplashScreen | null = new SplashScreen(splashContainer, app)

// After
import { MainMenu } from './ui/mainMenu.js'
let mainMenu: MainMenu | null = new MainMenu(mainMenuContainer, app)
```

The `splashContainer` is renamed to `mainMenuContainer` for clarity (same `Container` instance, just renamed at declaration).

### Remove `splashTapBuffer` and `onSplashTap`

These are replaced by `mainMenu.flushActions()` called each tick alongside `keyboard.flush()` and `touchInput.flush()`.

```typescript
// In the tick loop, replace:
...splashTapBuffer.splice(0),
// With:
...(mainMenu?.flushActions() ?? []),
```

### Wire `onExit` callback

```typescript
function handleExit(): void {
  window.close()
  // Use setTimeout(0) so browser can process the close before we check
  setTimeout(() => {
    mainMenu?.showExitFallback()
  }, 50)
}

// After instantiating mainMenu:
mainMenu.onExit = handleExit
```

### Wire Escape key for Exit (intro phase only)

```typescript
let removeIntroKeyListener: (() => void) | null = null

function attachIntroKeyListener(): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      e.preventDefault()
      handleExit()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
```

Attached when `mainMenu` is instantiated, removed when phase leaves `'intro'`.

### Update `intro → playing` transition

```typescript
// In the tick loop:
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  mainMenu?.destroy()
  mainMenu = null
  if (removeIntroKeyListener !== null) {
    removeIntroKeyListener()
    removeIntroKeyListener = null
  }
  hud.setVisible(true)
}
```

### Update `navigateToTitle()`

```typescript
function navigateToTitle(): void {
  // ... existing teardown (pause blur, modal, key listener) ...

  state = createGameState()
  prevPhase = state.phase

  mainMenu = new MainMenu(mainMenuContainer, app)
  mainMenu.onExit = handleExit
  mainMenu.resize(window.innerWidth, window.innerHeight)
  removeIntroKeyListener = attachIntroKeyListener()

  hud.setVisible(false)
}
```

The runtime `freshState.phase !== 'intro'` guard (which triggered `window.location.reload()`) is removed — it was defensive code against a scenario that no longer applies once `createGameState()` is known to always return `'intro'`.

### Update `handleResize()`

Replace `splashScreen?.resize(...)` with `mainMenu?.resize(...)`.

### Game-over phase: "Return to Menu" path

The game-over state currently has no UI. We add a simple overlay. Two approaches were considered:

**Option A:** Create a `GameOverModal` in `src/ui/` with a "Return to Menu" button.
**Option B:** Add "Return to Menu" handling directly in `main.ts` via a transient keydown listener and a minimal PixiJS text overlay.

Option A is cleaner and more consistent with `PauseModal`. However, the ticket's acceptance criterion only requires a "Return to Menu" button — not a full game-over screen with score display (that is a separate concern). A minimal `GameOverOverlay` component in `src/ui/gameOverOverlay.ts` is the right call: it follows the same show/hide pattern as `PauseModal`, keeps game-over UI out of `main.ts`, and is straightforward to extend later.

**`GameOverOverlay` public API:**
```typescript
export class GameOverOverlay {
  onReturnToMenu: () => void
  constructor(stage: Container)
  show(score: number, lines: number): void
  hide(): void
  resize(w: number, h: number): void
}
```

`show()` accepts score and lines so the overlay can display final stats (even if minimal). The "Return to Menu" button fires `onReturnToMenu`. Keyboard Enter also triggers it (wired in `main.ts` via the same transient listener pattern).

In `main.ts`, a `justGameOver` edge detection triggers `gameOverOverlay.show(state.score, state.lines)`.

---

## 6. Changes to `src/ui/splashScreen.ts`

No changes. The file is retained as-is; `main.ts` simply stops importing it. It can be removed in a follow-up cleanup ticket if desired, but removing it now is out of scope and creates unnecessary diff noise.

---

## 7. Responsive Layout

Both `MainMenu` and `GameOverOverlay` implement `resize(w, h)` and are called from `handleResize()` in `main.ts`.

Button sizing in `MainMenu`:
- Button width: `Math.max(160, Math.min(300, w * 0.4))`
- Font size: `Math.max(18, Math.min(28, Math.floor(w * 0.055)))`
- This ensures buttons are at least 160px wide and text is at least 18px on a 320px-wide viewport.

---

## 8. Layer Boundary Compliance

| File | Imports from |
|---|---|
| `src/ui/mainMenu.ts` | `pixi.js`, `../engine/types.js` (GameAction only) |
| `src/ui/gameOverOverlay.ts` | `pixi.js` only |
| `src/main.ts` | all layers (permitted) |

`MainMenu` imports `GameAction` from `engine/types.ts` because it buffers `GameAction.Start`. This is the same pattern used by `src/input/keyboard.ts` — `engine/types.ts` is the shared root that all layers may import from.

---

## 9. Test Strategy

### Engine tests: zero changes required

All 27+ existing engine tests pass without modification. The phase union and `updateGameState` logic are untouched.

### `src/__tests__/ui/mainMenu.test.ts` (new)

Uses the same PixiJS mock pattern established in `pauseModal.test.ts`. Tests cover:
- Construction creates title, two buttons, fallback text (initially hidden)
- `flushActions()` returns `[]` before interaction, `[GameAction.Start]` after Play tap
- `flushActions()` drains the buffer (calling twice returns `[]` second time)
- `onExit` callback is invoked when Exit button is tapped
- `showExitFallback()` makes fallback text visible
- `resize()` repositions title and buttons within viewport bounds
- `destroy()` is safe to call and removes ticker callback

### `src/__tests__/ui/gameOverOverlay.test.ts` (new)

Tests cover:
- Construction does not add panelRoot to stage (hidden by default)
- `show()` adds panelRoot, `hide()` removes it (idempotent both ways)
- `onReturnToMenu` is invoked when Return to Menu button is tapped
- `resize()` correctly repositions elements

---

## 10. Compatibility Impact

The external API surface (CLI flags, command names, placeholder keys, config keys) is not applicable to this browser game. The relevant surface is the `GameState` type and `GameAction` enum.

**No contract surface changes detected.**

- `GameState.phase` union: unchanged (`'intro' | 'playing' | 'paused' | 'gameover'`)
- `GameAction` enum: unchanged
- `updateGameState()` signature: unchanged
- `createGameState()` signature and return type: unchanged

No migration guide required.
