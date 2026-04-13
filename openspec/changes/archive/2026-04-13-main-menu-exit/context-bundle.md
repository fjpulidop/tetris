# Context Bundle: main-menu-exit

---

## 1. Feature Overview

The `main-menu-exit` change replaces the bare-bones `SplashScreen` (which displayed only "Press Enter to Start") with a true `MainMenu` component that gives the player named Play and Exit actions on page load. It also adds a `GameOverOverlay` that appears when the engine transitions to `'gameover'` phase, offering "Return to Menu" so the player always has a path back. The feature deliberately reuses the existing `'intro'` engine phase rather than adding a new `'menu'` phase — the engine, its types, and all existing unit tests are untouched. Every change is confined to `src/ui/` (two new files) and `src/main.ts` (wiring changes).

---

## 2. Architecture: How This Fits the Existing Phase System

### Phase state machine (unchanged)

```
createGameState() → phase: 'intro'
                        │
             GameAction.Start received
                        │
                        ▼
                   phase: 'playing'
                        │
               GameAction.Pause / Escape
                        │
                        ▼
                   phase: 'paused'
                        │
           Resume / Restart / NavigateToTitle
                        │
                        ▼
              phase: 'playing' or 'intro'
                        │
                   Board fills up
                        │
                        ▼
                  phase: 'gameover'
```

`updateGameState()` in `src/engine/gameState.ts` (lines 160–165) has a hard phase guard for `'intro'`: only `GameAction.Start` transitions the phase; all other actions are silently dropped. This is exactly the semantics a main menu needs — no game logic runs until Play is pressed.

### What changes in main.ts

`main.ts` is the only file permitted to import across layers. It owns all phase-transition edge detection. The feature adds two new edge detections:

| Edge | Variable | Action |
|---|---|---|
| `'intro'` → `'playing'` | already exists (`phaseBeforeUpdate` check in tick loop, line 358) | Destroy `mainMenu`, null it, detach intro key listener |
| Any phase → `'gameover'` | new: `justGameOver` | Call `gameOverOverlay.show(state.score, state.lines)` |

The existing `justPaused` / `justResumed` edges (lines 374–397) are unaffected.

### Layer boundary compliance

| File | Permitted imports |
|---|---|
| `src/ui/mainMenu.ts` | `pixi.js`, `@pixi/filter-glow`, `../engine/types.js` (`GameAction` only) |
| `src/ui/gameOverOverlay.ts` | `pixi.js` only |
| `src/main.ts` | all layers (this is the one permitted cross-layer file) |

`MainMenu` importing `GameAction` from `engine/types.ts` is the same pattern as `src/input/keyboard.ts`. `engine/types.ts` is the zero-import root of the type tree; all layers may read from it.

---

## 3. Exact Changes Per File

### 3.1 Create `src/ui/mainMenu.ts`

New file. Constructor signature: `(stage: Container, app: Application)` — identical to `SplashScreen`, making the substitution in `main.ts` a drop-in rename.

**Key implementation details:**

```typescript
export class MainMenu {
  onExit: () => void = () => undefined

  private menuActionBuffer: GameAction[] = []
  private ticker: Ticker
  private container: Container
  private titleText: Text
  private playButton: Container       // eventMode = 'static', cursor = 'pointer'
  private exitButton: Container       // eventMode = 'static', cursor = 'pointer'
  private fallbackText: Text          // alpha = 0 by default
  private _fallbackTimer: ReturnType<typeof setTimeout> | null = null
  private _elapsed = 0
  private onTick = (ticker: Ticker) => {
    this._elapsed += ticker.deltaTime
    this.titleText.alpha = 0.85 + 0.15 * Math.sin(this._elapsed * 0.04)
  }

  constructor(stage: Container, app: Application) {
    this.container = new Container()
    stage.addChild(this.container)           // immediately visible on stage
    this.ticker = app.ticker
    // ... build title, buttons, fallbackText ...
    app.ticker.add(this.onTick)
    this.resize(app.screen.width, app.screen.height)
  }

  flushActions(): GameAction[] {
    return this.menuActionBuffer.splice(0)   // drains the buffer
  }

  resize(width: number, height: number): void {
    const buttonW = Math.max(160, Math.min(300, width * 0.4))
    const fontSize = Math.max(18, Math.min(28, Math.floor(width * 0.055)))
    // title at (width/2, height*0.35)
    // play  at (width/2, height*0.56)
    // exit  at (width/2, height*0.56 + 70)
    // fallback at (width/2, height*0.56 + 150)
  }

  showExitFallback(): void {
    this.fallbackText.alpha = 1
    if (this._fallbackTimer !== null) clearTimeout(this._fallbackTimer)
    this._fallbackTimer = setTimeout(() => {
      this.fallbackText.alpha = 0
      this._fallbackTimer = null
    }, 3000)
  }

  destroy(): void {
    this.ticker.remove(this.onTick)
    if (this._fallbackTimer !== null) { clearTimeout(this._fallbackTimer); this._fallbackTimer = null }
    this.container.destroy({ children: true })
  }
}
```

**Play button wiring:**
```typescript
playButton.on('pointerup', () => {
  this.menuActionBuffer.push(GameAction.Start)
})
```

**Exit button wiring:**
```typescript
exitButton.on('pointerup', () => {
  this.onExit()
})
```

**GlowFilter guard** (identical pattern to `SplashScreen`, lines 51–58 of `splashScreen.ts`):
```typescript
try {
  this.titleText.filters = [
    new GlowFilter({ distance: 16, outerStrength: 2, color: 0xffffff }) as unknown as Filter,
  ]
} catch (e) {
  console.warn('MainMenu: GlowFilter could not be applied:', e)
}
```

**Button builder** (matches `PauseModal` interactive pattern — `eventMode`, `cursor`, `on('pointerup', ...)`):
```typescript
private buildButton(label: string): Container {
  const btn = new Container()
  btn.eventMode = 'static'
  btn.cursor = 'pointer'
  const bg = new Graphics()           // pill — redrawn in resize()
  const txt = new Text({ text: label, style: new TextStyle({ ... }) })
  txt.anchor.set(0.5)
  btn.addChild(bg)
  btn.addChild(txt)
  return btn
}
```

---

### 3.2 Create `src/ui/gameOverOverlay.ts`

New file. Constructor signature: `(stage: Container)` — identical to `PauseModal`.

Lifecycle pattern is exactly `PauseModal`: constructor builds but does NOT add `panelRoot` to `stage`; `show()` calls `stage.addChild(panelRoot)`; `hide()` calls `stage.removeChild(panelRoot)`. Both are idempotent via a `visible` boolean flag.

```typescript
export class GameOverOverlay {
  onReturnToMenu: () => void = () => undefined

  private stage: Container
  private panelRoot: Container
  private background: Graphics
  private titleText: Text
  private scoreText: Text
  private returnButton: Container
  private visible = false

  constructor(stage: Container) {
    this.stage = stage
    this.panelRoot = new Container()     // NOT added to stage here
    // ... build background, titleText ('GAME OVER'), scoreText, returnButton ...
    // returnButton.on('pointerup', () => this.onReturnToMenu())
  }

  show(score: number, lines: number): void {
    this.scoreText.text = `Score: ${score}  Lines: ${lines}`
    if (!this.visible) {
      this.stage.addChild(this.panelRoot)
      this.visible = true
    }
  }

  hide(): void {
    if (this.visible) {
      this.stage.removeChild(this.panelRoot)
      this.visible = false
    }
  }

  resize(w: number, h: number): void {
    // background: full-viewport rect (0, 0, w, h) at 0x0d0d1a, alpha 0.88
    // titleText: (w/2, h*0.3)
    // scoreText: (w/2, h*0.45)
    // returnButton: (w/2, h*0.6), buttonW = Math.max(160, Math.min(300, w*0.4))
  }
}
```

---

### 3.3 Modify `src/main.ts`

Full accounting of every line touched. Read `src/main.ts` before editing to get accurate line numbers (current state: 436 lines).

**Line 34 — import swap:**
```typescript
// Remove:
import { SplashScreen } from './ui/splashScreen.js'

// Add:
import { MainMenu } from './ui/mainMenu.js'
import { GameOverOverlay } from './ui/gameOverOverlay.js'
```

**Line 59 — container rename:**
```typescript
// Remove:
const splashContainer = new Container()

// Add:
const mainMenuContainer = new Container()
```

**Line 68 — stage addChild rename:**
```typescript
// Remove:
app.stage.addChild(splashContainer)

// Add:
app.stage.addChild(mainMenuContainer)
```

**After line 109 (`let removePauseKeyListener`) — add:**
```typescript
let removeIntroKeyListener: (() => void) | null = null
```

**Lines 141–143 — handleResize splash block:**
```typescript
// Remove:
if (splashScreen !== null) {
  splashScreen.resize(window.innerWidth, window.innerHeight)
}

// Add:
mainMenu?.resize(window.innerWidth, window.innerHeight)
gameOverOverlay.resize(window.innerWidth, window.innerHeight)
```

**Lines 147–153 — splash instantiation block:**
```typescript
// Remove all of:
let splashScreen: SplashScreen | null = new SplashScreen(splashContainer, app)
const splashTapBuffer: GameAction[] = []
const onSplashTap = () => {
  splashTapBuffer.push(GameAction.Start)
  canvas.removeEventListener('pointerdown', onSplashTap)
}
canvas.addEventListener('pointerdown', onSplashTap)

// Replace with (handleExit and attachIntroKeyListener defined elsewhere before main() closes):
let mainMenu: MainMenu | null = new MainMenu(mainMenuContainer, app)
mainMenu.onExit = handleExit
removeIntroKeyListener = attachIntroKeyListener()

const gameOverOverlay = new GameOverOverlay(modalContainer)
gameOverOverlay.onReturnToMenu = () => navigateToTitle()
```

**New function — place alongside attachPauseKeyListener (after line 238):**
```typescript
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

**New function — place after navigateToTitle (before the loop):**
```typescript
function handleExit(): void {
  window.close()
  setTimeout(() => {
    mainMenu?.showExitFallback()
  }, 50)
}
```

**navigateToTitle() full replacement (lines 296–321):**
```typescript
function navigateToTitle(): void {
  removePauseBlur()
  pauseModal.hide()
  gameOverOverlay.hide()

  if (removePauseKeyListener !== null) {
    removePauseKeyListener()
    removePauseKeyListener = null
  }

  state = createGameState()
  prevPhase = state.phase

  mainMenu = new MainMenu(mainMenuContainer, app)
  mainMenu.onExit = handleExit
  mainMenu.resize(window.innerWidth, window.innerHeight)
  removeIntroKeyListener = attachIntroKeyListener()

  hud.setVisible(false)
}
```

Removed: the `freshState.phase !== 'intro'` guard that called `window.location.reload()`. That guard was defensive code against an impossibility — `createGameState()` always returns `phase: 'intro'` (see `gameState.ts` line 129).

**Line 341 — action buffering:**
```typescript
// Remove:
...splashTapBuffer.splice(0),

// Add:
...(mainMenu?.flushActions() ?? []),
```

**Lines 358–362 — intro → playing transition:**
```typescript
// Remove:
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  splashScreen?.destroy()
  splashScreen = null
  hud.setVisible(true)
}

// Replace:
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

**Phase-transition section (after the justResumed block, before `prevPhase = currentPhase`) — add:**
```typescript
const justGameOver = prevPhase !== 'gameover' && currentPhase === 'gameover'

if (justGameOver) {
  gameOverOverlay.show(state.score, state.lines)
}
```

---

## 4. Integration Points

### MainMenu ↔ main.ts

```
main.ts
  │
  ├─ instantiates MainMenu(mainMenuContainer, app)
  │   └─ mainMenu.onExit = handleExit
  │   └─ removeIntroKeyListener = attachIntroKeyListener()
  │
  ├─ each tick: mainMenu?.flushActions()  →  may contain [GameAction.Start]
  │   └─ engine processes GameAction.Start → phase becomes 'playing'
  │   └─ tick loop detects intro→playing: mainMenu.destroy(), mainMenu = null
  │
  ├─ Escape key (intro phase): attachIntroKeyListener → handleExit()
  │   └─ window.close() + setTimeout → mainMenu?.showExitFallback()
  │
  └─ navigateToTitle(): re-instantiates MainMenu, re-attaches intro listener
```

### main.ts ↔ GameOverOverlay

```
main.ts
  │
  ├─ instantiates GameOverOverlay(modalContainer)
  │   └─ gameOverOverlay.onReturnToMenu = () => navigateToTitle()
  │
  ├─ phase-transition edge: justGameOver → gameOverOverlay.show(score, lines)
  │
  ├─ "Return to Menu" button tap → onReturnToMenu() → navigateToTitle()
  │   └─ navigateToTitle() calls gameOverOverlay.hide()
  │
  └─ handleResize(): gameOverOverlay.resize(w, h) — always called regardless of visibility
```

### Container stacking order (unchanged)

```
app.stage
  boardContainer
  pieceContainer
  effectsContainer
  uiContainer (HUD)
  touchContainer
  mainMenuContainer   ← was splashContainer; same position, same z-order
  modalContainer      ← PauseModal and GameOverOverlay share this container
```

`GameOverOverlay` is placed into `modalContainer` — the topmost container, the same one used by `PauseModal`. This ensures the game-over overlay renders above the board regardless of the game state.

---

## 5. Edge Cases

### window.close() is blocked

Browsers block `window.close()` when the tab was not opened programmatically. The `handleExit()` function calls `window.close()` then defers a 50ms callback that calls `mainMenu?.showExitFallback()`. `showExitFallback()` sets `fallbackText.alpha = 1` (revealing the message "Close this tab to exit") and schedules `alpha = 0` after 3000ms. The `destroy()` path calls `clearTimeout` on the pending timer so there is no after-destroy callback.

### Escape key during intro (new listener)

`attachIntroKeyListener()` follows the exact pattern of `attachPauseKeyListener()`: a `keydown` handler registered on `window`, returning a teardown function stored in `removeIntroKeyListener`. The teardown is called in two places: (1) on `intro → playing` transition in the tick loop, (2) inside `navigateToTitle()` before re-attaching a fresh listener. This prevents the double-attach scenario that the pause listener already guards against.

### Narrow viewport (320px minimum)

`MainMenu.resize()` uses:
- `buttonW = Math.max(160, Math.min(300, width * 0.4))` — at 320px: `Math.max(160, 128) = 160px` minimum
- `fontSize = Math.max(18, Math.min(28, Math.floor(320 * 0.055))) = Math.max(18, 17) = 18px` minimum

Both buttons remain within the viewport at 320px width.

### Game-over → navigateToTitle path

When the player clicks "Return to Menu" on `GameOverOverlay`:
1. `onReturnToMenu()` fires → `navigateToTitle()`
2. `navigateToTitle()` calls `gameOverOverlay.hide()` (idempotent — safe even if already hidden)
3. `pauseModal.hide()` (idempotent — safe even if the pause modal was never shown)
4. Fresh state is created, `mainMenu` is re-instantiated

Because `GameOverOverlay.hide()` guards with `this.visible`, calling it when already hidden (e.g., user pressed the old "Return to Title Screen" option from the pause modal mid-game) does not throw.

### PauseModal "Return to Title Screen" compatibility

`PauseModal`'s third option fires `navigateToTitle()` via `pauseModal.onSelect` (line 91–92 of `main.ts`). This function is being updated (3l above) but its signature and the `pauseModal.onSelect` wiring are unchanged. The pause menu continues to work as before.

### restartGame() from pause modal (unaffected)

`restartGame()` (lines 273–288) does not touch `splashScreen`/`mainMenu` at all. It bypasses `'intro'` entirely by calling `updateGameState(fresh, [GameAction.Start], 0)`. No changes to this function are required.

---

## 6. Testing Notes

### Manual verification checklist

- [ ] Page load: main menu appears with title "BLOCK DROP", Play button, Exit button. No game logic runs (piece does not fall).
- [ ] Play button (mouse click): game starts, HUD becomes visible, menu disappears.
- [ ] Play button (touch/tap on mobile viewport): same result.
- [ ] Enter key on keyboard while on menu: game starts (existing `KeyboardInput` behavior via `GameAction.Start`).
- [ ] Exit button (click): `window.close()` fires. If browser blocks it, fallback text "Close this tab to exit" appears for ~3 seconds then fades.
- [ ] Escape key while on menu: same as Exit button.
- [ ] Game runs until game over: `GameOverOverlay` appears with final score and line count.
- [ ] "Return to Menu" button on `GameOverOverlay`: menu reappears, game state is reset, HUD hides.
- [ ] PauseModal "Return to Title Screen" option still works.
- [ ] Resize during menu: buttons remain centered and legible.
- [ ] Resize during game-over overlay: overlay remains centered.
- [ ] 320px-wide viewport: both menu buttons are at least 160px wide and text is legible.

### Unit test file: `src/__tests__/ui/mainMenu.test.ts`

Uses `vi.mock('pixi.js', ...)` factory pattern from `pauseModal.test.ts` (all mock classes inside factory). Additionally mocks `@pixi/filter-glow` to avoid WebGL. Fake app object supplies `ticker.add`, `ticker.remove` (vi.fn()), and `screen: { width: 800, height: 600 }`.

Key test assertions:
- Construction: `stage.children.length === 1` (container added immediately, unlike PauseModal)
- `flushActions()` before Play tap returns `[]`
- `flushActions()` after Play `pointerup` returns `[GameAction.Start]`
- Second `flushActions()` returns `[]` (buffer drained, not just read)
- Exit `pointerup` invokes `onExit` callback
- `showExitFallback()` does not throw
- `destroy()` calls `ticker.remove` with the same callback registered in the constructor
- `resize(320, 568)` does not throw

Locate interactive buttons using the `collectInteractives` helper (walk tree for `eventMode === 'static'`). The Play button is index 0; Exit button is index 1 in the depth-first traversal order of `this.container.children`.

### Unit test file: `src/__tests__/ui/gameOverOverlay.test.ts`

Uses `vi.mock('pixi.js', ...)` factory pattern (same mock set as `pauseModal.test.ts`, no GlowFilter needed).

Key test assertions mirror `PauseModal` lifecycle tests:
- Construction: `stage.children.length === 0` (panelRoot NOT added on construction)
- `show(1000, 10)`: `stage.children.length === 1`
- `show()` idempotent: second call keeps length at 1
- `hide()` after `show()`: `stage.children.length === 0`
- `hide()` idempotent: no throw when called on a fresh (never-shown) instance
- Return button `pointerup`: `onReturnToMenu` callback invoked once
- `resize(800, 600)` when hidden: no throw
- `resize(320, 568)` when visible: no throw
- After `show(1500, 20)`: a text node in the panelRoot subtree contains `'1500'`

### Engine test stability

All tests in `src/__tests__/engine/` pass without modification. The engine module files (`gameState.ts`, `types.ts`, `board.ts`, etc.) are completely untouched. Verify with `npm test` after completing Task 3.
