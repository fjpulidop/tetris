# Tasks: Animated Splash Screen

Tasks are ordered by dependency. Complete them in sequence. Each task is atomic and independently verifiable.

---

## Task 1: Add `GameAction.Start` to the enum

**[core]**

Add a `Start` member to the `GameAction` enum. This is the single source of truth for the start action — all other layers (input, engine, main) depend on it existing here.

The `GameAction` enum is defined in `src/engine/types.ts`. It is the root of the type tree with no imports, so this change has zero risk of circular dependencies.

**Files:**
- Modify `src/engine/types.ts` — add `Start = 'Start'` to `GameAction` enum

**Acceptance Criteria:**
- `GameAction.Start` compiles and is importable from any layer
- No other members of `GameAction` are modified
- `tsc` passes with no errors

---

## Task 2: Add `'intro'` phase to `GameState` and update `createGameState()`

**[core]**

Extend the `GameState.phase` type union to include `'intro'`. Update `createGameState()` to return `phase: 'intro'` instead of `phase: 'playing'`.

Do NOT yet add the `'intro'` guard in `updateGameState()` — that is Task 3. After this task, `'intro'` is a valid phase but the engine will still process game actions in that phase (this is a transient state, corrected in Task 3).

**Files:**
- Modify `src/engine/gameState.ts` — extend `GameState.phase` union; change `createGameState()` return value

**Acceptance Criteria:**
- `GameState.phase` type is `'intro' | 'playing' | 'paused' | 'gameover'`
- `createGameState().phase` returns `'intro'`
- TypeScript compilation passes (`tsc`)
- Existing tests may now have one failing assertion (`returns phase "playing"`) — this is expected and is addressed in Task 9

---

## Task 3: Add `'intro'` phase guard to `updateGameState()`

**[core]**

Insert a phase guard at the top of `updateGameState()` that handles the `'intro'` phase. When in `'intro'`:
- If `actions` includes `GameAction.Start` → return `{ state: { ...state, phase: 'playing' }, events }`
- Otherwise → return `{ state, events }` unchanged

Insert this guard before the `'gameover'` guard (first in the function body). This ordering mirrors the existing pattern for `'paused'` and `'gameover'` guards.

**Files:**
- Modify `src/engine/gameState.ts` — add `'intro'` guard block inside `updateGameState()`

**Acceptance Criteria:**
- `updateGameState()` with `phase: 'intro'` and no `GameAction.Start` returns state unchanged with no events
- `updateGameState()` with `phase: 'intro'` and `GameAction.Start` returns `phase: 'playing'`
- `updateGameState()` with `phase: 'intro'` and other actions (e.g., `MoveLeft`) returns state unchanged (Start action is not present → no transition)
- All other phases behave identically to before (guard is strictly additive)

---

## Task 4: Map `Enter` key to `GameAction.Start` in keyboard handler

**[input]**

Add `Enter: GameAction.Start` to `KEY_ACTION_MAP` in `src/input/keyboard.ts`. `Enter` is a tap action — do not add it to `HELD_ACTION_KEYS`.

Do not call `e.preventDefault()` for `Enter` — unlike arrow keys and Space, Enter does not trigger any browser scroll or other default behavior on a canvas-only page.

**Files:**
- Modify `src/input/keyboard.ts` — add `Enter: GameAction.Start` to `KEY_ACTION_MAP`

**Acceptance Criteria:**
- Pressing Enter once adds exactly one `GameAction.Start` to the buffer
- Holding Enter does not continuously add `GameAction.Start` (it is not in `HELD_ACTION_KEYS`)
- No existing key mappings are modified
- `tsc` passes

---

## Task 5: Add `setVisible()` to HUD

**[frontend]**

Add a `setVisible(visible: boolean): void` method to the `HUD` class. This is a one-liner that sets `this.container.visible = visible`. This follows the identical pattern used by `TouchInput.setVisible()`.

**Files:**
- Modify `src/ui/hud.ts` — add `setVisible(visible: boolean): void` method

**Acceptance Criteria:**
- `hud.setVisible(false)` sets `this.container.visible` to `false`
- `hud.setVisible(true)` sets it back to `true`
- Method is public
- No other `HUD` behavior changes

---

## Task 6: Implement `SplashScreen` class

**[frontend]**

Create `src/ui/splashScreen.ts` with a `SplashScreen` class. This is the primary visual deliverable of the feature.

The class must:
- Accept `(stage: Container, app: Application)` in its constructor
- Create an internal `Container` added to `stage`
- Render a title text (constant `GAME_TITLE`, default `"BLOCK DROP"`) with `fontSize: 64`, `fontWeight: 'bold'`, `fill: 0xffffff`, `fontFamily: 'monospace'`, `anchor.set(0.5)`
- Render a subtitle `"Press Enter to Start"` with `fontSize: 22`, `fill: 0xaaaaff`, `fontFamily: 'monospace'`, `anchor.set(0.5)`
- Apply a `GlowFilter` to the title text (cast pattern: `as unknown as Filter`, matching `postProcess.ts`)
- Animate subtitle `alpha` via a sine wave registered on `app.ticker`
- Implement `resize(width: number, height: number): void` — centers title at `(width/2, height*0.35)`, subtitle at `(width/2, height*0.55)`
- Implement `destroy(): void` — removes ticker callback, calls `this.container.destroy({ children: true })`
- Call `resize(app.screen.width, app.screen.height)` at the end of the constructor

GlowFilter import:
```typescript
import { GlowFilter } from '@pixi/filter-glow'
import type { Filter } from 'pixi.js'
```

Ticker pattern:
```typescript
private _elapsed = 0
private onTick = (delta: number) => {
  this._elapsed += delta
  this.subtitleText.alpha = 0.5 + 0.5 * Math.sin(this._elapsed * 0.05)
}
```
The `0.05 radians/frame` constant at 60fps gives approximately a 2.1-second pulse period.

**Files:**
- Create `src/ui/splashScreen.ts`

**Acceptance Criteria:**
- File compiles with no TypeScript errors
- `SplashScreen` constructor adds a container to the provided `stage`
- Title font size is ≥ 48px (64px specified)
- Subtitle text reads exactly `"Press Enter to Start"`
- `destroy()` removes the ticker callback and calls `container.destroy({ children: true })`
- `resize()` re-centers both texts relative to the provided dimensions
- No imports from `engine/`, `renderer/`, or `input/` (ui layer boundary: may import `pixi.js` only; game state is not needed here)

---

## Task 7: Wire `SplashScreen` and canvas tap in `main.ts`

**[integration]**

Wire all the new pieces together in `main.ts`. This task has the most changes but each is mechanical — following existing wiring patterns.

**Changes:**

1. Import `SplashScreen` from `./ui/splashScreen.js`
2. Import `GameAction` (already imported as a type — change to a value import or add value import)
3. Create `splashContainer = new Container()` and add it to `app.stage` last (renders on top of all game containers)
4. Instantiate `splashScreen = new SplashScreen(splashContainer, app)`
5. Call `hud.setVisible(false)` immediately after HUD instantiation
6. Register a one-shot canvas `pointerdown` listener:
   ```typescript
   let splashTapBuffer: GameAction[] = []
   const onSplashTap = () => {
     splashTapBuffer.push(GameAction.Start)
     canvas.removeEventListener('pointerdown', onSplashTap)
   }
   canvas.addEventListener('pointerdown', onSplashTap)
   ```
7. In the loop, drain `splashTapBuffer` alongside `keyboard.flush()` and `touchInput.flush()`:
   ```typescript
   const bufferedActions = [
     ...keyboard.flush(),
     ...touchInput.flush(),
     ...splashTapBuffer.splice(0),
   ]
   ```
8. After `updateGameState()`, detect the `'intro'` → `'playing'` transition:
   ```typescript
   const prevPhase = state.phase
   const result = updateGameState(state, allActions, LOGIC_TICK_MS)
   state = result.state
   if (prevPhase === 'intro' && state.phase === 'playing') {
     splashScreen.destroy()
     hud.setVisible(true)
   }
   ```
9. In `handleResize()`, call `splashScreen.resize(window.innerWidth, window.innerHeight)` — guard it with a null check since `splashScreen` may have been destroyed:
   ```typescript
   if (splashScreen !== null) {
     splashScreen.resize(window.innerWidth, window.innerHeight)
   }
   ```
   Declare `splashScreen` as `SplashScreen | null` and set to `null` after `destroy()`.

**Files:**
- Modify `src/main.ts`

**Acceptance Criteria:**
- Game loads and shows splash screen, no board or HUD visible
- Pressing Enter transitions to gameplay; HUD appears; splash is gone
- Tapping canvas on mobile transitions to gameplay
- Window resize while on splash screen re-centers splash correctly
- After transition, window resize does not error (null check on `splashScreen`)
- No PixiJS warnings or errors in console at transition time

---

## Task 8: Update and extend tests

**[test]**

Two test changes are required:

### Update existing assertion
In `src/__tests__/engine/gameState.test.ts`, the test `it('returns phase "playing"', ...)` must be updated to assert `'intro'`:
```typescript
it('returns phase "intro"', () => {
  const state = createGameState()
  expect(state.phase).toBe('intro')
})
```

### Add new tests
Add a new `describe` block for the `'intro'` phase behavior:

```typescript
describe('updateGameState — intro phase', () => {
  it('GameAction.Start transitions intro → playing', () => {
    const state = createGameState()
    expect(state.phase).toBe('intro')
    const { state: after } = updateGameState(state, [GameAction.Start], 16)
    expect(after.phase).toBe('playing')
  })

  it('no actions processed in intro phase except Start', () => {
    const state = createGameState()
    const originalPiece = state.activePiece
    const { state: still } = updateGameState(state, [GameAction.MoveLeft, GameAction.HardDrop], 16)
    expect(still.phase).toBe('intro')
    expect(still.activePiece).toEqual(originalPiece)
  })

  it('no events emitted in intro phase without Start action', () => {
    const state = createGameState()
    const { events } = updateGameState(state, [GameAction.MoveLeft], 16)
    expect(events).toHaveLength(0)
  })
})
```

**Files:**
- Modify `src/__tests__/engine/gameState.test.ts`

**Acceptance Criteria:**
- All existing tests pass (including the updated phase assertion)
- The three new `'intro'` phase tests pass
- `vitest run` exits with code 0
- No tests are deleted

---

## Task 9: Manual smoke test checklist

**[integration]**

Before marking the feature complete, verify the following manually in the browser:

- [ ] `npm run dev` — page loads and shows splash screen (no board, no HUD)
- [ ] Title text is large (≥ 48px visually), centered
- [ ] "Press Enter to Start" subtitle pulses (alpha oscillates)
- [ ] Pressing Enter → gameplay starts, HUD appears, splash disappears
- [ ] Pressing Enter a second time while playing → Pause (unchanged behavior)
- [ ] On a narrow viewport (< 768px), tapping the canvas starts the game
- [ ] Resizing the window while on the splash screen keeps text centered
- [ ] No browser console errors or PixiJS warnings at any point
- [ ] `npm run build` completes without TypeScript errors

**Files:** (none — this is a verification task)

**Acceptance Criteria:**
- All checklist items above pass
