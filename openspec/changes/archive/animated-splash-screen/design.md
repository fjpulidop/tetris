# Technical Design: Animated Splash Screen

## Architecture Overview

This feature touches all four layers, but each change is narrow and follows existing patterns:

```
engine/types.ts       — GameAction.Start enum member (new)
engine/gameState.ts   — 'intro' phase added to union; createGameState() starts there;
                        updateGameState() handles Start action
input/keyboard.ts     — Enter key → GameAction.Start mapping
input/touch.ts        — canvas tap in 'intro' phase → GameAction.Start
ui/splashScreen.ts    — new class; PixiJS title + pulsing subtitle + ticker
main.ts               — wire SplashScreen; hide HUD in 'intro'; forward resize
```

The `engine/` layer remains fully isolated. `GameAction.Start` lives in `engine/types.ts` — the same file as all other `GameAction` members — so no new cross-layer imports are introduced anywhere.

## Data Flow

### Startup
```
main() → createGameState()          // phase: 'intro'
       → new SplashScreen(stage)    // renders title + subtitle
       → hud.setVisible(false)      // HUD hidden
       → loop starts
```

### Each tick in 'intro' phase
```
keyboard.flush() + touchInput.flush()
  → possibly [GameAction.Start]
updateGameState(state, actions, dt)
  → 'intro' phase guard: if no Start action → return state unchanged
  → if Start action → return { ...state, phase: 'playing' }
main sees phase changed to 'playing':
  → splashScreen.destroy()
  → hud.setVisible(true)
```

### Resize in 'intro' phase
```
handleResize()
  → splashScreen.resize(window.innerWidth, window.innerHeight)  // (added)
  → existing resize calls unchanged
```

## API Changes

### `src/engine/types.ts`

Add one member to the `GameAction` enum:
```typescript
export enum GameAction {
  // ... existing members ...
  Start = 'Start',
}
```

No other changes to this file.

### `src/engine/gameState.ts`

#### `GameState.phase` type union
```typescript
// Before
phase: 'playing' | 'paused' | 'gameover'

// After
phase: 'intro' | 'playing' | 'paused' | 'gameover'
```

#### `createGameState()` return value
```typescript
// Before
phase: 'playing',

// After
phase: 'intro',
```

The initial `activePiece` is still spawned in `createGameState()`. This is intentional: the board and piece state are fully initialized at creation time. The 'intro' phase guard in `updateGameState()` simply prevents gravity, movement, and scoring from running — the board is ready the moment the player presses Enter.

#### `updateGameState()` phase guard block

A new guard is added before the existing `'gameover'` guard:

```typescript
if (state.phase === 'intro') {
  if (actions.includes(GameAction.Start)) {
    return { state: { ...state, phase: 'playing' }, events }
  }
  return { state, events }
}
```

This follows the identical pattern used for `'paused'` and `'gameover'`. No other logic changes in `updateGameState()`.

### `src/input/keyboard.ts`

Add one entry to `KEY_ACTION_MAP`:
```typescript
Enter: GameAction.Start,
```

`Enter` is not added to `HELD_ACTION_KEYS` — it is a tap action, not a held action. This matches the pattern for `Escape` (Pause) and `Space` (HardDrop).

`e.preventDefault()` is NOT called for `Enter` because Enter does not scroll the page and there is no default browser behavior to suppress in this context.

### `src/input/touch.ts`

The splash-screen tap gesture must not interfere with the existing virtual button mechanism. The cleanest approach is a dedicated canvas `pointerdown` listener registered directly on `window` (or `app.view`) that emits `GameAction.Start` when in `'intro'` phase.

The `TouchInput` class already handles gameplay touch input via its virtual buttons. Rather than coupling `TouchInput` to phase state (which would introduce an engine-state dependency into the input layer — a layer boundary violation), the canvas tap is wired in `main.ts` using a plain DOM event listener.

Design decision: `main.ts` registers a one-time `pointerdown` listener on the canvas element directly. When triggered, it pushes `GameAction.Start` into a small single-element buffer that `main.ts` drains alongside the keyboard and touch buffers. This avoids polluting `TouchInput` with phase-awareness. The listener is removed after the first fire (once-semantics).

```typescript
// In main.ts — setup phase
let splashTapBuffer: GameAction[] = []
const onSplashTap = () => {
  splashTapBuffer.push(GameAction.Start)
  canvas.removeEventListener('pointerdown', onSplashTap)
}
canvas.addEventListener('pointerdown', onSplashTap)
```

In the loop, `splashTapBuffer` is drained alongside `keyboard.flush()` and `touchInput.flush()`. After `SplashScreen` is destroyed, this buffer is simply never written to again (the listener was already removed).

### `src/ui/splashScreen.ts` (new file)

```typescript
export class SplashScreen {
  private container: Container
  private titleText: Text
  private subtitleText: Text
  private ticker: Ticker

  constructor(stage: Container, app: Application)
  resize(width: number, height: number): void
  destroy(): void
}
```

#### Constructor
- Creates a `Container` and adds it to `stage`
- Creates a `Text` for the game title using `TextStyle` with `fontSize: 64`, `fontWeight: 'bold'`, `fill: 0xffffff`, `fontFamily: 'monospace'`
- Creates a `Text` for the subtitle "Press Enter to Start" using `TextStyle` with `fontSize: 22`, `fill: 0xaaaaff`, `fontFamily: 'monospace'`
- Applies a `GlowFilter` to the title (matching the `postProcess.ts` cast pattern for v7/v8 compatibility)
- Registers a `Ticker` callback to animate the subtitle's `alpha` property in a sine wave pattern (pulsing)
- Calls `resize(app.screen.width, app.screen.height)` immediately

#### `resize(width, height)`
- Centers `titleText` at `(width / 2, height * 0.35)`
- Centers `subtitleText` at `(width / 2, height * 0.55)`
- Uses `text.anchor.set(0.5)` for horizontal/vertical centering

#### `destroy()`
- Removes the ticker callback (stops the animation)
- Calls `this.container.destroy({ children: true })` — this recursively destroys all `Text` children and their textures, preventing memory leaks

#### GlowFilter usage
Follows the exact pattern already established in `postProcess.ts`:
```typescript
import { GlowFilter } from '@pixi/filter-glow'
import type { Filter } from 'pixi.js'
// ...
titleText.filters = [new GlowFilter({ distance: 15, outerStrength: 2, color: 0x8888ff }) as unknown as Filter]
```

#### Ticker pattern
```typescript
// In constructor:
this.ticker = app.ticker
this.onTick = (delta: number) => {
  this._elapsed += delta
  this.subtitleText.alpha = 0.5 + 0.5 * Math.sin(this._elapsed * 0.05)
}
this.ticker.add(this.onTick)

// In destroy():
this.ticker.remove(this.onTick)
```

The `delta` from PixiJS ticker is in "frames" (1.0 at 60fps). `0.05 radians/frame` gives a ~2-second pulse cycle, which is perceptible without being distracting.

### `src/main.ts`

Four changes:

1. Import `SplashScreen` from `./ui/splashScreen.js`
2. Add a `splashContainer` — a dedicated `Container` added to `app.stage` above all game containers (so the splash renders on top)
3. Instantiate `SplashScreen` after all other setup; add canvas `pointerdown` listener for tap-to-start
4. In the game loop, after `updateGameState()`, detect the transition from `'intro'` to `'playing'` and call `splashScreen.destroy()`, `hud.setVisible(true)`, remove the canvas listener

#### HUD visibility gating

The `HUD` class currently has no `setVisible()` method. We add one:
```typescript
setVisible(visible: boolean): void {
  this.container.visible = visible
}
```

This is a one-liner following the exact pattern `TouchInput.setVisible()` uses.

`main.ts` calls `hud.setVisible(false)` immediately after instantiation, then `hud.setVisible(true)` when the phase transitions from `'intro'` to `'playing'`.

#### Phase transition detection in the loop

```typescript
const prevPhase = state.phase
const result = updateGameState(state, allActions, LOGIC_TICK_MS)
state = result.state

if (prevPhase === 'intro' && state.phase === 'playing') {
  splashScreen.destroy()
  hud.setVisible(true)
}
```

This check runs once per logic tick and is a trivial string comparison — no performance concern.

## Design Decisions

### Why keep activePiece initialized in 'intro' phase

Two alternatives were considered:
1. Initialize `activePiece: null` in `createGameState()` when starting in `'intro'`, spawn it on `Start`.
2. Initialize `activePiece` immediately (current approach).

Option 2 is preferred because:
- `updateGameState()` already handles `activePiece: null` gracefully (the null guard at line 179)
- It keeps `createGameState()` as a simple, complete snapshot — no partial state
- The board is visually hidden behind the splash screen anyway, so having a piece in state during `'intro'` is harmless
- Option 1 would require the `Start` handler to also call `spawnPiece()`, duplicating logic from `createGameState()`

### Why the canvas tap listener lives in main.ts, not in TouchInput

`TouchInput` would need to know the current `phase` to decide whether to emit `Start` instead of gameplay actions. That would require passing `GameState` into `TouchInput`, which couples the input layer to the engine state. The layer boundary rules explicitly prohibit this.

The `main.ts` canvas listener approach is simpler: `main.ts` is already the cross-layer wiring point for everything else, and a once-fired `pointerdown` listener with a tiny buffer is minimal complexity.

### Why SplashScreen is in src/ui/ not src/renderer/

`SplashScreen` is a UI overlay — it has no relationship to board cells, pieces, or game geometry. It is structurally identical to `HUD`: a `Container` added to the stage, a `resize()` method, a `destroy()` method. Placing it in `src/ui/` is consistent and correct per existing conventions.

### Why the title game name is not specified in this design

Per the trademark constraints in agent memory, the game title must not use "Tetris" or any protected term. The exact display name is a product decision outside this feature's scope. The `SplashScreen` implementation should use a constant `GAME_TITLE` defined at the top of `splashScreen.ts` so it can be changed easily. A reasonable default for development is `"BLOCK DROP"`.

## Compatibility

This feature adds one new member to the `GameAction` enum and one new value to the `GameState.phase` union. Both are additive. No existing enum values are renamed or removed.

One existing test will require updating: the `createGameState` describe block contains `it('returns phase "playing"', ...)`, which must be changed to assert `'intro'`. This is a minor, expected test update, not a regression.

The `'intro'` phase guard in `updateGameState()` is strictly additive — it returns `{ state, events }` unchanged for all input combinations except `GameAction.Start`, which did not exist before.
