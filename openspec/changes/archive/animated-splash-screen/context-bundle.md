# Context Bundle: Animated Splash Screen

## Exact Changes

### `src/engine/types.ts`
**Region:** `GameAction` enum body (lines 17–25 in current file)
Add one member at the end:
```typescript
Start = 'Start',
```
No other changes. File is the root of the type tree; all layers may import from it.

---

### `src/engine/gameState.ts`
**Region 1:** `GameState` interface, `phase` property (line 34)
```typescript
// Before
phase: 'playing' | 'paused' | 'gameover'
// After
phase: 'intro' | 'playing' | 'paused' | 'gameover'
```

**Region 2:** `createGameState()` return statement (line 129)
```typescript
// Before
phase: 'playing',
// After
phase: 'intro',
```

**Region 3:** Top of `updateGameState()` body — new guard block inserted before the `'gameover'` guard (before line 160)
```typescript
if (state.phase === 'intro') {
  if (actions.includes(GameAction.Start)) {
    return { state: { ...state, phase: 'playing' }, events }
  }
  return { state, events }
}
```

---

### `src/input/keyboard.ts`
**Region:** `KEY_ACTION_MAP` object (lines 13–23)
Add one entry:
```typescript
Enter: GameAction.Start,
```
No changes to `HELD_ACTION_KEYS`.

---

### `src/ui/hud.ts`
**Region:** Public methods section (after `update()` method)
Add:
```typescript
setVisible(visible: boolean): void {
  this.container.visible = visible
}
```

---

### `src/ui/splashScreen.ts` (NEW FILE)
Complete new file. Exports `SplashScreen` class with:
- Constructor: `(stage: Container, app: Application)`
- Public method: `resize(width: number, height: number): void`
- Public method: `destroy(): void`
- Private: `container`, `titleText`, `subtitleText`, `_elapsed`, `onTick`

Imports: `pixi.js` (Container, Text, TextStyle, Ticker), `@pixi/filter-glow` (GlowFilter)
No imports from `engine/`, `renderer/`, or `input/`.

---

### `src/main.ts`
**Region 1:** Import block — add `SplashScreen` import:
```typescript
import { SplashScreen } from './ui/splashScreen.js'
```
Change `GameAction` import from `type` to value import (or add a separate value import):
```typescript
import { GameAction } from './engine/types.js'
```
(Currently imported as `import type { GameAction }` on line 33 — must become a value import to use `GameAction.Start` at runtime.)

**Region 2:** Container setup (after line 60) — add `splashContainer`:
```typescript
const splashContainer = new Container()
app.stage.addChild(splashContainer)
```

**Region 3:** After HUD instantiation — add `setVisible(false)`:
```typescript
hud.setVisible(false)
```

**Region 4:** After all setup, before `handleResize()` call — instantiate splash and register tap listener:
```typescript
let splashScreen: SplashScreen | null = new SplashScreen(splashContainer, app)
let splashTapBuffer: GameAction[] = []
const onSplashTap = () => {
  splashTapBuffer.push(GameAction.Start)
  canvas.removeEventListener('pointerdown', onSplashTap)
}
canvas.addEventListener('pointerdown', onSplashTap)
```

**Region 5:** `handleResize()` function — add splash resize call:
```typescript
if (splashScreen !== null) {
  splashScreen.resize(window.innerWidth, window.innerHeight)
}
```

**Region 6:** Inside loop's `while (accumulator >= LOGIC_TICK_MS)` — drain `splashTapBuffer`:
```typescript
const bufferedActions = [
  ...keyboard.flush(),
  ...touchInput.flush(),
  ...splashTapBuffer.splice(0),
]
```

**Region 7:** Inside loop — detect phase transition after `updateGameState()`:
```typescript
const prevPhase = state.phase
const result = updateGameState(state, allActions, LOGIC_TICK_MS)
state = result.state
if (prevPhase === 'intro' && state.phase === 'playing') {
  splashScreen?.destroy()
  splashScreen = null
  hud.setVisible(true)
}
```

---

### `src/__tests__/engine/gameState.test.ts`
**Region 1:** First test in `describe('createGameState')` (line 8–11)
```typescript
// Before
it('returns phase "playing"', () => {
  const state = createGameState()
  expect(state.phase).toBe('playing')
})

// After
it('returns phase "intro"', () => {
  const state = createGameState()
  expect(state.phase).toBe('intro')
})
```

**Region 2:** New `describe` block added after the existing `describe('updateGameState — paused state returns unchanged for non-pause actions')` block:
```typescript
describe('updateGameState — intro phase', () => {
  it('GameAction.Start transitions intro → playing', () => { ... })
  it('no actions processed in intro phase except Start', () => { ... })
  it('no events emitted in intro phase without Start action', () => { ... })
})
```

---

## Task Dependencies

```
Task 1 (types.ts: GameAction.Start)
  └── Task 2 (gameState.ts: phase union + createGameState)
        └── Task 3 (gameState.ts: intro guard in updateGameState)
              └── Task 8 (tests: update phase assertion + new intro tests)
  └── Task 4 (keyboard.ts: Enter mapping)
  └── Task 5 (hud.ts: setVisible method)
  └── Task 6 (splashScreen.ts: new class — needs Application type from pixi, not engine)

Tasks 2, 3, 4, 5, 6 → Task 7 (main.ts: full wiring — needs all of the above)
Task 7 → Task 9 (smoke test — needs full wiring)
Task 3 → Task 8 (tests: needs intro guard to exist to test it)
```

**Parallelization note:** Tasks 4, 5, and 6 have no dependencies on each other and can be worked in parallel after Task 1 completes. Task 7 must wait for all of Tasks 2–6.

---

## Risk Assessment

### Risk 1: `import type` → value import for `GameAction` in `main.ts` (LOW)
`main.ts` currently imports `GameAction` as `import type { GameAction }`. TypeScript erases `type` imports at runtime. Using `GameAction.Start` in the loop body will cause a runtime `ReferenceError` if the import remains a type import. The fix is straightforward — change the import — but it's easy to miss.

**Mitigation:** The `tsc` compiler will error when `GameAction.Start` is used as a value in runtime code while it is a type-only import. The build will fail before runtime. Catch this in Task 7.

### Risk 2: GlowFilter on Canvas 2D renderer (LOW)
`postProcess.ts` already skips filters on the Canvas renderer and wraps the filter application in a `try/catch`. `SplashScreen` should apply the same guard: skip the glow filter if `app.renderer.type === RendererType.CANVAS`. Without this, the splash screen would throw on browsers that fall back to Canvas 2D rendering.

**Mitigation:** In `SplashScreen` constructor, wrap the `GlowFilter` assignment in a `try/catch` (identical pattern to `postProcess.ts`). Alternatively, check `RendererType.CANVAS` first. The `try/catch` is simpler and more defensive.

### Risk 3: `splashTapBuffer.splice(0)` always allocated (NEGLIGIBLE)
`splice(0)` on an empty array returns `[]` and is called every logic tick for the entire lifetime of the game. After the splash is gone, this is a constant small allocation. In practice, JavaScript engines optimize this to near-zero cost. Not a concern at this scale.

### Risk 4: Existing tests that hardcode `phase: 'playing'` as input state (MEDIUM)
Several tests in `gameState.test.ts` use `createGameState()` and immediately test gameplay behavior (movement, rotation, hard drop). With `createGameState()` now returning `phase: 'intro'`, all of those tests would need to receive `GameAction.Start` first, or be constructed with `phase: 'playing'` manually.

**However:** The `'intro'` phase guard returns state unchanged for non-Start actions, so all existing gameplay tests that call `updateGameState(createGameState(), [GameAction.MoveLeft], 16)` will get back the unchanged state. The assertions in those tests are:
- "MoveLeft decreases active piece col" → will pass if `activePiece` column is unchanged (which it will be — no movement in intro)
- Wait — this is a real regression risk.

**Revised mitigation:** In the gameplay tests, prepend a `Start` action transition to convert the initial state to `'playing'` before running gameplay assertions. OR — simpler — change `createGameState()` to accept an optional parameter: `createGameState({ phase?: 'intro' | 'playing' })` defaulting to `'intro'`, with a convenience helper.

**Preferred approach:** Do NOT change `createGameState()` signature. Instead, in the test file, add a top-level helper:
```typescript
function playingState() {
  const s = createGameState()
  const { state } = updateGameState(s, [GameAction.Start], 0)
  return state
}
```
Replace all calls to `createGameState()` in gameplay tests with `playingState()`. This is a larger test-file change but keeps the production API clean and the tests correct.

**Scope impact:** Task 8 must include replacing `createGameState()` with `playingState()` in all non-phase-check tests in `gameState.test.ts`. This is roughly 30+ call sites.

### Risk 5: Board/piece rendered under splash in 'intro' phase (LOW-MEDIUM)
`boardRenderer.update()` and `pieceRenderer.update()` are called unconditionally in the render loop. During `'intro'` phase, the board is empty (freshly initialized) and the active piece is at its spawn position at the top of the board. Since the splash container is added to `app.stage` last (on top), the board and piece renderers will draw behind the splash — so they are visually hidden but still executing.

This is correct behavior: the board renders first, then the splash renders on top. No gameplay is visible. The only concern is a brief flash if `SplashScreen` initializes asynchronously — but it does not (constructor is synchronous).

**Mitigation:** Add splash container to stage after all other containers (render order). This is already specified in Task 7.

### Risk 6: `TickerCallback` type for private method (LOW)
PixiJS v8 `app.ticker.add()` expects a callback of type `TickerCallback<unknown>`. The inline arrow function `(delta: number) => void` is compatible, but TypeScript may require importing `TickerCallback` from `pixi.js` if the type annotation is explicit. Using `(delta: number) => void` as an implicit type for the private field avoids the import.

**Mitigation:** Declare `private onTick!: (delta: number) => void` (or assign inline in constructor). Avoid explicit `TickerCallback` type annotation to sidestep the v7/v8 compatibility concern.
