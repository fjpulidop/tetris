# Tasks: main-menu-exit

## Task 1: [ui] Create MainMenu component

**Files:**
- Create: `src/ui/mainMenu.ts`

**Steps:**
1. Import `Container`, `Graphics`, `Text`, `TextStyle` from `pixi.js`. Import `Application`, `Filter`, `Ticker` from `pixi.js` (type-only). Import `GlowFilter` from `@pixi/filter-glow`. Import `GameAction` from `../engine/types.js`.
2. Declare module-level constants: `GAME_TITLE = 'BLOCK DROP'`, color constants (`COLOR_TITLE = 0xffffff`, `COLOR_BUTTON_BG = 0x1a1a3a`, `COLOR_BUTTON_TEXT = 0xffffff`, `COLOR_FALLBACK = 0x888888`), and `FONT_FAMILY = 'monospace'`.
3. Define and export the `MainMenu` class with private fields:
   - `container: Container` — root node added to `stage` in the constructor
   - `titleText: Text`
   - `playButton: Container`
   - `exitButton: Container`
   - `fallbackText: Text`
   - `menuActionBuffer: GameAction[]`
   - `ticker: Ticker`
   - `_elapsed = 0`
   - `_fallbackTimer: ReturnType<typeof setTimeout> | null = null`
   - `onTick` arrow function (pulsing title animation, same pattern as `SplashScreen`)
4. Add public field: `onExit: () => void = () => undefined`.
5. Implement the constructor `(stage: Container, app: Application)`:
   a. Create `this.container = new Container()` and call `stage.addChild(this.container)`.
   b. Store `this.ticker = app.ticker`.
   c. Build `titleText`: `fontSize: 64`, `fontWeight: 'bold'`, `fill: COLOR_TITLE`, `fontFamily`, anchor `(0.5, 0.5)`. Apply `GlowFilter` in a try/catch (same guard as `SplashScreen`).
   d. Build the Play button via a private `buildButton(label: string): Container` helper (see step 6). Wire its `pointerup` to push `GameAction.Start` into `menuActionBuffer`.
   e. Build the Exit button via `buildButton`. Wire its `pointerup` to invoke `this.onExit()`.
   f. Build `fallbackText`: `fontSize: 18`, `fill: COLOR_FALLBACK`, `fontFamily`, centered anchor, `text: 'Close this tab to exit'`, `alpha = 0`.
   g. Add all nodes to `this.container`. Register `app.ticker.add(this.onTick)`.
   h. Call `this.resize(app.screen.width, app.screen.height)`.
6. Implement private `buildButton(label: string): Container`:
   - Create a wrapper `Container`. Set `eventMode = 'static'`, `cursor = 'pointer'`.
   - Create a `Graphics` pill background: use `roundRect` with corner radius 8. Fill with `COLOR_BUTTON_BG` at alpha 0.9.
   - Create a `Text` label with `fontSize: 22`, `fontWeight: 'bold'`, `fill: COLOR_BUTTON_TEXT`, `fontFamily`. Set anchor `(0.5, 0.5)`.
   - Add `Graphics` then `Text` as children of the wrapper container. Return the wrapper.
   - (Button dimensions and font scale are adjusted in `resize()`.)
7. Implement `flushActions(): GameAction[]` — return `this.menuActionBuffer.splice(0)`.
8. Implement `resize(width: number, height: number): void`:
   - Position `titleText` at `(width / 2, height * 0.35)`.
   - Compute `buttonW = Math.max(160, Math.min(300, width * 0.4))` and `fontSize = Math.max(18, Math.min(28, Math.floor(width * 0.055)))`.
   - Draw the pill background for each button using `buttonW` and a fixed height of `52px`.
   - Center button text within the pill.
   - Position Play button at `(width / 2, height * 0.56)`, Exit button at `(width / 2, height * 0.56 + 70)` (70px gap).
   - Position `fallbackText` at `(width / 2, height * 0.56 + 150)`.
9. Implement `showExitFallback(): void` — set `this.fallbackText.alpha = 1`. Clear any existing `_fallbackTimer`. Set a new `setTimeout` for 3000ms that sets `this.fallbackText.alpha = 0` and nulls `_fallbackTimer`.
10. Implement `destroy(): void`:
    - `this.ticker.remove(this.onTick)`.
    - If `_fallbackTimer !== null`, `clearTimeout(this._fallbackTimer)`, set to `null`.
    - `this.container.destroy({ children: true })`.

**Acceptance check:**
- TypeScript compiles with no errors (`npm run build`).
- Constructing `new MainMenu(stage, app)` immediately adds one child to `stage`.
- `flushActions()` returns `[]` before any interaction, `[GameAction.Start]` after Play `pointerup` fires, then `[]` on the second call (buffer drained).
- `destroy()` can be called without throwing.

---

## Task 2: [ui] Create GameOverOverlay component

**Files:**
- Create: `src/ui/gameOverOverlay.ts`

**Steps:**
1. Import `Container`, `Graphics`, `Text`, `TextStyle` from `pixi.js`.
2. Declare module-level constants: color constants (`COLOR_TITLE = 0xffffff`, `COLOR_SCORE = 0xaaaaff`, `COLOR_BUTTON_TEXT = 0xffffff`, `COLOR_BUTTON_BG = 0x1a1a3a`, `COLOR_BACKGROUND = 0x0d0d1a`, `BACKGROUND_ALPHA = 0.88`), and `FONT_FAMILY = 'monospace'`.
3. Define and export the `GameOverOverlay` class with private fields:
   - `stage: Container`
   - `panelRoot: Container` — built in constructor, added/removed on show/hide
   - `background: Graphics`
   - `titleText: Text` — label "GAME OVER"
   - `scoreText: Text` — populated in `show()`
   - `returnButton: Container` — interactive, fires `onReturnToMenu`
   - `visible = false`
4. Add public field: `onReturnToMenu: () => void = () => undefined`.
5. Implement the constructor `(stage: Container)`:
   a. Store `this.stage = stage`.
   b. Create `this.panelRoot = new Container()`. Do NOT add it to `stage` yet (hidden-by-default pattern, matching `PauseModal`).
   c. Create `this.background = new Graphics()` and add to `panelRoot`.
   d. Build `titleText`: `text: 'GAME OVER'`, `fontSize: 48`, `fontWeight: 'bold'`, `fill: COLOR_TITLE`, `fontFamily`. Set anchor `(0.5, 0)`.
   e. Build `scoreText`: `text: ''`, `fontSize: 22`, `fill: COLOR_SCORE`, `fontFamily`. Set anchor `(0.5, 0)`.
   f. Build `returnButton` via a private helper identical to `MainMenu.buildButton`. Wire its `pointerup` to invoke `this.onReturnToMenu()`.
   g. Add `titleText`, `scoreText`, `returnButton` to `panelRoot`.
6. Implement `show(score: number, lines: number): void`:
   - Update `scoreText.text` to `Score: ${score}  Lines: ${lines}`.
   - If `!this.visible`, call `this.stage.addChild(this.panelRoot)`, set `this.visible = true`. Idempotent: guard with `!this.visible`.
7. Implement `hide(): void`:
   - If `this.visible`, call `this.stage.removeChild(this.panelRoot)`, set `this.visible = false`. Idempotent guard same as `PauseModal.hide()`.
8. Implement `resize(w: number, h: number): void`:
   - Redraw `background` as a full-viewport rect: `rect(0, 0, w, h)`, fill `COLOR_BACKGROUND` at `BACKGROUND_ALPHA`.
   - Position `titleText` at `(w / 2, h * 0.3)`.
   - Position `scoreText` at `(w / 2, h * 0.45)`.
   - Position `returnButton` at `(w / 2, h * 0.6)`.
   - Redraw `returnButton`'s pill background using `Math.max(160, Math.min(300, w * 0.4))` as width.

**Acceptance check:**
- TypeScript compiles with no errors.
- Constructing `new GameOverOverlay(stage)` does not add any child to `stage`.
- `show(1200, 15)` adds `panelRoot` to `stage`; calling `show()` a second time does not add it twice.
- `hide()` removes `panelRoot`; calling `hide()` when already hidden does not throw.
- `onReturnToMenu` callback fires when the Return to Menu button's `pointerup` event is emitted.

---

## Task 3: [core] Replace SplashScreen with MainMenu in main.ts

**Files:**
- Modify: `src/main.ts`

**Steps:**

### 3a — Import swap (line 34)
Replace:
```typescript
import { SplashScreen } from './ui/splashScreen.js'
```
With:
```typescript
import { MainMenu } from './ui/mainMenu.js'
import { GameOverOverlay } from './ui/gameOverOverlay.js'
```

### 3b — Rename container (lines 59, 68)
Replace the `splashContainer` variable name with `mainMenuContainer` at the declaration site (`new Container()`) and at `app.stage.addChild(...)`. This is a rename-only change; no other container ordering changes.

### 3c — Declare new loop-level state (near line 98, after `removePauseKeyListener`)
Add:
```typescript
/** Teardown function for the Escape-key listener active during 'intro' phase. */
let removeIntroKeyListener: (() => void) | null = null
```

### 3d — Remove splashTapBuffer and onSplashTap; declare mainMenu (lines 147–153)
Remove:
```typescript
let splashScreen: SplashScreen | null = new SplashScreen(splashContainer, app)
const splashTapBuffer: GameAction[] = []
const onSplashTap = () => {
  splashTapBuffer.push(GameAction.Start)
  canvas.removeEventListener('pointerdown', onSplashTap)
}
canvas.addEventListener('pointerdown', onSplashTap)
```
Replace with:
```typescript
let mainMenu: MainMenu | null = new MainMenu(mainMenuContainer, app)
mainMenu.onExit = handleExit
removeIntroKeyListener = attachIntroKeyListener()
```
Note: `handleExit` and `attachIntroKeyListener` are defined before this block (see 3e/3f).

### 3e — Add handleExit() function (place after `navigateToTitle`, before the loop)
```typescript
function handleExit(): void {
  window.close()
  setTimeout(() => {
    mainMenu?.showExitFallback()
  }, 50)
}
```

### 3f — Add attachIntroKeyListener() function (place alongside attachPauseKeyListener)
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

### 3g — Add GameOverOverlay instantiation (after mainMenu block)
```typescript
const gameOverOverlay = new GameOverOverlay(modalContainer)
gameOverOverlay.onReturnToMenu = () => navigateToTitle()
```

### 3h — Fix handleResize() (lines 141–143)
Replace:
```typescript
if (splashScreen !== null) {
  splashScreen.resize(window.innerWidth, window.innerHeight)
}
```
With:
```typescript
mainMenu?.resize(window.innerWidth, window.innerHeight)
gameOverOverlay.resize(window.innerWidth, window.innerHeight)
```

### 3i — Fix action buffering in loop (line 341)
Replace:
```typescript
...splashTapBuffer.splice(0),
```
With:
```typescript
...(mainMenu?.flushActions() ?? []),
```

### 3j — Fix intro → playing transition (lines 358–362)
Replace:
```typescript
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  splashScreen?.destroy()
  splashScreen = null
  hud.setVisible(true)
}
```
With:
```typescript
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

### 3k — Add justGameOver edge detection (in the phase-transition section, after the justResumed block)
```typescript
const justGameOver = prevPhase !== 'gameover' && currentPhase === 'gameover'

if (justGameOver) {
  gameOverOverlay.show(state.score, state.lines)
}
```

### 3l — Update navigateToTitle()
Replace the entire function body with:
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
This removes the old `freshState.phase !== 'intro'` guard (the reload escape hatch) and the `splashTapBuffer`/`onSplashTap` re-wiring.

**Acceptance check:**
- `npm run build` completes with zero TypeScript errors.
- `npm run lint` passes on `src/`.
- All existing engine unit tests pass (`npm test`).
- No references to `splashScreen`, `splashTapBuffer`, or `onSplashTap` remain in `main.ts`.

---

## Task 4: [ui] Write unit tests for MainMenu

**Files:**
- Create: `src/__tests__/ui/mainMenu.test.ts`

**Steps:**
1. Set up the `vi.mock('pixi.js', ...)` factory in the same style as `pauseModal.test.ts` — all mock classes (MockContainer, MockGraphics, MockText, MockTextStyle) defined inside the factory. Additionally mock `@pixi/filter-glow` to avoid WebGL dependency:
   ```typescript
   vi.mock('@pixi/filter-glow', () => ({
     GlowFilter: class { constructor() {} },
   }))
   ```
2. Mock `Application` by constructing a fake app object with a `ticker` that has `add()` and `remove()` methods (vi.fn()) and a `screen` property (`{ width: 800, height: 600 }`).
3. Write test cases covering:
   - **Construction:** `new MainMenu(stage, app)` adds exactly one child to `stage` immediately.
   - **flushActions — empty before interaction:** returns `[]` on the first call before any button tap.
   - **flushActions — Play tap:** after emitting `pointerup` on the Play button, `flushActions()` returns `[GameAction.Start]`.
   - **flushActions — drains buffer:** calling `flushActions()` a second time after a Play tap returns `[]`.
   - **onExit callback:** after assigning `mainMenu.onExit = vi.fn()`, emitting `pointerup` on the Exit button invokes the callback exactly once.
   - **showExitFallback:** calling `showExitFallback()` does not throw (alpha mutation on mock).
   - **resize:** `resize(320, 568)` does not throw.
   - **destroy:** `destroy()` does not throw; `ticker.remove` was called with the ticker callback.
4. Use the `collectInteractives` helper (copy from `pauseModal.test.ts`) to locate Play (index 0) and Exit (index 1) buttons.

**Acceptance check:**
- `npx vitest run src/__tests__/ui/mainMenu.test.ts` passes with all tests green.

---

## Task 5: [ui] Write unit tests for GameOverOverlay

**Files:**
- Create: `src/__tests__/ui/gameOverOverlay.test.ts`

**Steps:**
1. Set up `vi.mock('pixi.js', ...)` factory identical to the one in `pauseModal.test.ts` (MockContainer, MockGraphics, MockText, MockTextStyle inside the factory).
2. Write test cases covering:
   - **Construction — hidden by default:** `new GameOverOverlay(stage)` adds zero children to `stage`.
   - **show() — adds panelRoot:** after `show(1000, 10)`, `stage.children.length` is 1.
   - **show() — idempotent:** calling `show()` twice results in `stage.children.length` still being 1.
   - **hide() — removes panelRoot:** after `show()` then `hide()`, `stage.children.length` is 0.
   - **hide() — idempotent when already hidden:** calling `hide()` before `show()` does not throw.
   - **onReturnToMenu callback:** assigning `vi.fn()`, then emitting `pointerup` on the Return button invokes it exactly once.
   - **resize:** `resize(800, 600)` does not throw when hidden; `resize(320, 568)` does not throw when visible.
   - **score text:** after `show(1500, 20)`, a text node in the panel subtree contains `'1500'` and `'20'`.

**Acceptance check:**
- `npx vitest run src/__tests__/ui/gameOverOverlay.test.ts` passes with all tests green.
- `npm test` (full suite) passes with no regressions.
