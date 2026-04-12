# Design: Game Engine Foundation

**Change name:** game-engine-foundation
**Date:** 2026-04-12

---

## 1. Architecture Overview

The project is organized as four strictly-bounded layers under `src/`. The ESLint `no-restricted-imports` rules in `.eslintrc.cjs` enforce these boundaries at lint time — they are not conventions, they are compile-time gates.

```
src/
├── engine/          [core]    Pure TypeScript game logic. Zero DOM, zero PixiJS.
│   ├── types.ts               Shared types and enums exported to all layers
│   ├── board.ts               10×20 grid model
│   ├── pieces.ts              7-tetromino shape tables + SRS wall-kick data
│   ├── rotation.ts            SRS kick resolver
│   ├── gravity.ts             Gravity speed table, lock-delay timer
│   ├── lineClear.ts           Line detection and board collapse
│   └── gameState.ts           Top-level state machine orchestrating all of above
│
├── renderer/        [frontend] PixiJS rendering; reads engine state, never writes it.
│   ├── app.ts                 PixiJS Application init (WebGL2 → Canvas fallback)
│   ├── boardRenderer.ts       Draws the board grid and locked cells
│   ├── pieceRenderer.ts       Draws the active falling piece
│   ├── effects.ts             Particle burst + flash for line-clear events
│   └── postProcess.ts         Glow/bloom filter attachment to board+piece containers
│
├── input/           [frontend] Translates raw events to GameAction enum.
│   ├── actions.ts             GameAction enum definition (shared import by engine types)
│   ├── keyboard.ts            Arrow/Z/X/Space bindings
│   └── touch.ts               Virtual on-screen buttons via Pointer Events API
│
├── ui/              [frontend] HUD overlay rendered via PixiJS Text.
│   └── hud.ts                 Score, level, next-piece preview panel
│
└── main.ts          [infra]   Entry point. Fixed-timestep loop. Wires all layers.
```

### Strict dependency rules

| Layer | May import from | Must never import from |
|---|---|---|
| `engine/` | `engine/` only | `renderer/`, `input/`, `ui/`, any DOM API |
| `renderer/` | `engine/types`, `engine/gameState` (read-only) | `input/`, `ui/` |
| `input/` | `engine/types` (for `GameAction` enum) | `renderer/`, `ui/` |
| `ui/` | `engine/types`, PixiJS | `input/` |
| `main.ts` | All four layers | (no restrictions) |

Note: `input/actions.ts` defining `GameAction` is part of `engine/types` re-exports to avoid a cross-boundary import from `input/` into `engine/`. See Decision 5 below.

---

## 2. Data Flow

```
[Raw Events]
     │
     ▼
 input/keyboard.ts          input/touch.ts
     │                           │
     └──────────┬────────────────┘
                │  GameAction[]  (buffered per frame)
                ▼
           main.ts  (fixed-timestep loop)
                │
                │  calls gameState.update(actions, dt)
                ▼
          engine/gameState.ts
                │
                │  returns { state: GameState, events: GameEvent[] }
                ▼
        ┌───────┴────────┐
        │                │
        ▼                ▼
 renderer/               ui/hud.ts
 boardRenderer           (reads state.score, state.level,
 pieceRenderer           state.nextPiece)
 effects (GameEvent[])
 postProcess
```

Key invariant: data flows **downward and rightward**. The engine never calls back into the renderer. The renderer reads a snapshot of engine state produced each tick. Game events (line clears, piece locks) flow as a plain array returned alongside the state snapshot — the renderer consumes them once and discards them.

---

## 3. Game Loop Architecture (Fixed-Timestep Accumulator)

The loop lives entirely in `src/main.ts`. It uses `requestAnimationFrame` with an accumulator pattern to decouple logic update rate (fixed at 60 Hz) from render rate (uncapped, runs as fast as the display allows).

```
LOGIC_TICK_MS = 1000 / 60   // ~16.667 ms

let accumulator = 0
let lastTime = performance.now()

function loop(now: DOMHighResTimeStamp) {
  const delta = Math.min(now - lastTime, 200)   // clamp to avoid spiral-of-death
  lastTime = now
  accumulator += delta

  // Drain accumulated time in fixed steps
  while (accumulator >= LOGIC_TICK_MS) {
    const actions = inputManager.flush()          // consume buffered actions
    const result  = gameState.update(actions, LOGIC_TICK_MS)
    accumulator  -= LOGIC_TICK_MS

    // Renderer consumes events exactly once
    if (result.events.length > 0) {
      effects.onEvents(result.events)
    }
  }

  // Render at whatever frame rate the display supports
  const alpha = accumulator / LOGIC_TICK_MS      // interpolation factor (future use)
  renderer.render(gameState.snapshot(), alpha)
  hud.update(gameState.snapshot())

  requestAnimationFrame(loop)
}
```

**Why the 200 ms clamp:** If the tab is backgrounded or the device stalls, `delta` can be seconds. Without the clamp the accumulator would trigger thousands of logic ticks in one frame, causing the game to "fast-forward" when focus returns. 200 ms means at most ~12 logic ticks per render frame — safe.

**Why `flush()` inside the loop:** Input events are buffered by the event listeners and drained once per logic tick. This prevents the same keypress from being processed multiple times across ticks.

---

## 4. Engine Core Design

### 4.1 Board Model (`engine/board.ts`)

The board is a 10-column × 20-row grid. Internal representation: a flat `Uint8Array` of length 200, indexed as `row * 10 + col`. Value `0` = empty; values `1–7` = locked tetromino color index. The buffer type is chosen deliberately: typed arrays are faster to clone and serialize than nested plain arrays.

```typescript
export type Board = Uint8Array   // length = BOARD_COLS * BOARD_ROWS

export const BOARD_COLS = 10
export const BOARD_ROWS = 20

export function emptyBoard(): Board { return new Uint8Array(200) }
export function cloneBoard(b: Board): Board { return b.slice() }
export function getCell(b: Board, row: number, col: number): number { ... }
export function setCell(b: Board, row: number, col: number, v: number): Board { ... } // returns new board
```

All mutation functions return a **new** board — no in-place writes. This makes unit tests hermetic and opens the door for undo/replay at zero additional cost.

### 4.2 Tetromino Piece Set (`engine/pieces.ts`)

Seven piece types (I, O, T, S, Z, J, L), each with 4 rotation states. Each state is encoded as an array of 4 `[row, col]` offsets from the piece origin. This representation is compact and directly usable for collision detection by adding offsets to the piece's current position.

```typescript
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Rotation = 0 | 1 | 2 | 3    // 0=North, 1=East, 2=South, 3=West

export type PieceShape = readonly [number, number][]  // [row, col] offsets

export const PIECE_SHAPES: Record<PieceType, readonly PieceShape[]>
export const PIECE_COLORS: Record<PieceType, number>   // 1–7 color index
```

Color indices map to PixiJS hex colors in `renderer/boardRenderer.ts` — the engine only stores an integer, preserving renderer independence.

### 4.3 SRS Wall-Kick Tables (`engine/pieces.ts`)

The standard Super Rotation System kick data for J/L/S/T/Z pieces (4×4 kick table) and the separate I-piece kick table (4×4). Each entry is an array of 5 `[dRow, dCol]` kick attempts tried in order.

```typescript
export const SRS_KICKS: Record<string, readonly [number, number][]>
// Key format: `${fromRotation}>${toRotation}` e.g. "0>1", "1>0"

export const SRS_KICKS_I: Record<string, readonly [number, number][]>
```

### 4.4 Rotation Resolver (`engine/rotation.ts`)

`tryRotate(state, direction)` attempts the rotation, then tries each SRS kick in sequence until one succeeds (no collision) or all fail (rotation blocked). Returns a new `ActivePiece` on success, `null` on failure.

```typescript
export function tryRotate(
  board: Board,
  piece: ActivePiece,
  direction: 'CW' | 'CCW'
): ActivePiece | null
```

### 4.5 Gravity and Lock Delay (`engine/gravity.ts`)

Gravity speed in rows-per-second follows the guideline formula (approximated as a lookup table keyed by level 1–20). Lock delay is 500 ms — the piece locks once it cannot move down and the lock timer expires, or immediately on hard drop.

```typescript
export const GRAVITY_TABLE: readonly number[]   // seconds per row drop, index = level-1
export const LOCK_DELAY_MS = 500

export interface GravityState {
  gravityAccum: number    // accumulated fractional rows
  lockTimer: number       // ms remaining before lock; -1 = not in lock phase
}
```

### 4.6 Line Clear (`engine/lineClear.ts`)

```typescript
export function detectFullRows(board: Board): number[]         // returns row indices
export function clearRows(board: Board, rows: number[]): Board // returns new board
```

`clearRows` removes the specified rows and prepends empty rows at the top — the standard "gravity collapse" behavior.

### 4.7 Game State Machine (`engine/gameState.ts`)

The top-level module that composes all engine modules. Owns the authoritative `GameState` object and the `update()` function that advances it by one logic tick.

```typescript
export interface ActivePiece {
  type: PieceType
  rotation: Rotation
  row: number
  col: number
}

export interface GameState {
  board: Board
  activePiece: ActivePiece | null
  nextPiece: PieceType
  score: number
  level: number
  lines: number
  phase: 'playing' | 'paused' | 'gameover'
  gravityState: GravityState
}

export type GameEventType = 'line-clear' | 'piece-lock' | 'level-up' | 'game-over'
export interface GameEvent { type: GameEventType; payload?: unknown }

export function createGameState(): GameState
export function updateGameState(
  state: GameState,
  actions: GameAction[],
  dtMs: number
): { state: GameState; events: GameEvent[] }
```

`updateGameState` is a **pure function**: same inputs always produce the same output. No side effects. This is the keystone property that makes the engine testable, replayable, and framework-agnostic.

---

## 5. Renderer Design

### 5.1 PixiJS Application Init (`renderer/app.ts`)

```typescript
export async function createPixiApp(canvas: HTMLCanvasElement): Promise<Application>
```

PixiJS v8 auto-detects the best renderer: WebGPU (if available) → WebGL2 → Canvas 2D. The `canvas` element is passed in from `index.html` so the renderer does not touch the DOM directly (cleaner for testing and future React integration).

Renderer resolution is set to `window.devicePixelRatio` (clamped to 2 on mobile to avoid excessive fill rate). The stage is not resized here — that is the job of the layout manager in `main.ts`.

### 5.2 Board Renderer (`renderer/boardRenderer.ts`)

Uses PixiJS `Graphics` objects for cells. Each cell is a rounded rectangle drawn with the piece color. The board container is a `Container` with position set to account for the left margin of the responsive layout.

Grid lines are drawn as a separate `Graphics` layer beneath the cell layer. They are static after init and never redrawn unless the window resizes.

```typescript
export class BoardRenderer {
  constructor(stage: Container)
  update(state: GameState): void
  resize(cellSize: number, offsetX: number, offsetY: number): void
}
```

### 5.3 Piece Renderer (`renderer/pieceRenderer.ts`)

Draws the active piece and the ghost piece (the translucent preview of where the piece will land). Ghost piece position is computed by dropping the active piece until it collides — this is a pure calculation using the same `isCollision()` helper from `engine/board.ts` (which `renderer/` may import since `engine/` is a permitted dependency for `renderer/`).

```typescript
export class PieceRenderer {
  constructor(stage: Container)
  update(state: GameState): void
  resize(cellSize: number, offsetX: number, offsetY: number): void
}
```

### 5.4 Particle Effects (`renderer/effects.ts`)

Line-clear events trigger two simultaneous effects:
1. **Row flash** — a white rectangle briefly overlays each cleared row, fading over ~200 ms using PixiJS `Ticker`-based alpha animation.
2. **Particle burst** — 20–40 small square particles emitted from the midpoint of each cleared row, with randomized velocity vectors and alpha fade over ~400 ms.

The `effects.ts` module owns a `ParticleContainer` (PixiJS's batch-optimized container for homogeneous sprites) and recycles particle objects rather than creating/destroying them each event.

```typescript
export class EffectsRenderer {
  constructor(stage: Container)
  onEvents(events: GameEvent[]): void
  tick(dtMs: number): void      // advances animations; called every render frame
  resize(cellSize: number, offsetX: number, offsetY: number): void
}
```

### 5.5 Post-Processing (`renderer/postProcess.ts`)

Glow and bloom filters are applied to two specific containers: `boardContainer` and `pieceContainer`. They are **not** applied to `app.stage` or `uiContainer`. Reasons:
- HUD text (score, level) must not be blurred.
- Filtering only the game area is significantly cheaper on mobile GPU fill rate.

```typescript
import { GlowFilter } from '@pixi/filter-glow'
import { BloomFilter } from '@pixi/filter-bloom'

export function attachPostProcess(
  boardContainer: Container,
  pieceContainer: Container
): void
```

On devices where the renderer falls back to Canvas 2D, post-processing filters are skipped (PixiJS filters require WebGL).

---

## 6. Input Design

### 6.1 GameAction Enum (`engine/types.ts`)

`GameAction` is defined in `engine/types.ts` — not in `input/` — so that `engine/gameState.ts` can reference it without importing from `input/`. The input layer imports `GameAction` from `engine/types`, which is explicitly permitted.

```typescript
export enum GameAction {
  MoveLeft  = 'MoveLeft',
  MoveRight = 'MoveRight',
  RotateCW  = 'RotateCW',
  RotateCCW = 'RotateCCW',
  SoftDrop  = 'SoftDrop',
  HardDrop  = 'HardDrop',
  Pause     = 'Pause',
}
```

### 6.2 Keyboard Input (`input/keyboard.ts`)

```typescript
export class KeyboardInput {
  private buffer: GameAction[] = []

  constructor()    // attaches keydown listener to window
  flush(): GameAction[]  // returns and clears buffer
  destroy(): void
}
```

Key mappings:
| Key | Action |
|---|---|
| `ArrowLeft` | MoveLeft |
| `ArrowRight` | MoveRight |
| `ArrowUp` | RotateCW |
| `z` / `Z` | RotateCCW |
| `x` / `X` | RotateCW |
| `ArrowDown` | SoftDrop |
| `Space` | HardDrop |
| `Escape` / `p` | Pause |

Key-repeat (holding a key) is handled by tracking `keydown` vs `keyup` state per key, then injecting move actions each tick in `main.ts` based on held-key state.

### 6.3 Touch Input (`input/touch.ts`)

Six virtual buttons rendered as PixiJS `Graphics` objects positioned in the lower portion of the canvas. They use `pointerdown` / `pointerup` events (Pointer Events API, not deprecated Touch Events).

```typescript
export class TouchInput {
  private buffer: GameAction[] = []

  constructor(stage: Container, cellSize: number)
  flush(): GameAction[]
  resize(cellSize: number): void
  destroy(): void
}
```

Button layout (portrait orientation):
```
[ ← ]  [ ↓ ]  [ → ]          (left portion)
[ ↺ ]  [ ⬛ ]  [ ↻ ]          (right portion — hard drop center)
```

---

## 7. UI / HUD Design

### 7.1 HUD (`ui/hud.ts`)

Implemented as PixiJS `Text` objects positioned outside the board area (right panel or top bar depending on viewport width). Updates are lightweight — text is only redrawn when values change.

```typescript
export class HUD {
  constructor(stage: Container)
  update(state: GameState): void
  resize(cellSize: number, boardOffsetX: number): void
}
```

Displays: Score (integer), Level (integer), Lines cleared (integer), Next piece preview (draws the next tetromino shape in a small 4×4 grid).

---

## 8. Responsive Layout

Layout logic lives in `main.ts`. On every `window.resize` event:

1. Compute `cellSize = Math.floor(Math.min(window.innerHeight * 0.9, window.innerWidth * 0.55) / BOARD_ROWS)`.
2. Set `boardOffsetX = Math.floor((window.innerWidth - cellSize * BOARD_COLS) / 2)` (center horizontally).
3. Propagate `cellSize` and offsets to `boardRenderer.resize()`, `pieceRenderer.resize()`, `effects.resize()`, `touchInput.resize()`, `hud.resize()`.
4. Resize the PixiJS renderer: `app.renderer.resize(window.innerWidth, window.innerHeight)`.

On mobile (viewport width < 768 px), `TouchInput` buttons are visible. On desktop, they are hidden.

---

## 9. Technology Decisions

### Decision 1: PixiJS v8 (not v7)

PixiJS v8 introduces a new render pipeline with WebGPU support and a significantly revised API. All code in this design targets v8 idioms (e.g., `new Application()` + `await app.init()`, not the v7 constructor). Contributors must not follow v7 tutorials without verifying API compatibility.

### Decision 2: Immutable engine state

All engine mutation functions return new objects. `updateGameState()` is a pure function. This keeps unit tests hermetic (no shared mutable state between test cases) and enables replay/undo at zero additional cost. The performance cost of cloning a 200-byte `Uint8Array` at 60 Hz is negligible.

### Decision 3: Event array (not EventEmitter) for renderer notifications

The engine returns `GameEvent[]` alongside the state snapshot from `updateGameState()`. The renderer consumes the array once per tick. This avoids: (a) the engine holding a reference to the renderer (which would create a circular dependency), (b) the renderer polling state diffs to detect transitions, (c) missed events when multiple lines clear in one tick.

### Decision 4: Filters on board/piece containers, not stage

Glow and bloom are scoped to `boardContainer` and `pieceContainer` specifically. HUD text is in a separate `uiContainer` that has no filters. This preserves text readability and reduces GPU fill-rate cost on mobile.

### Decision 5: GameAction defined in engine/types.ts

Moving `GameAction` into `engine/types.ts` instead of `input/actions.ts` resolves the circular dependency problem: `engine/gameState.ts` needs to accept `GameAction[]` as input, but importing from `input/` would violate the boundary rule. Since actions are an abstract interface consumed by the engine, they belong in the engine's type vocabulary.

### Decision 6: Vitest over Jest

Vitest runs in the same Vite pipeline, requires zero additional configuration, and supports TypeScript natively. Jest requires `ts-jest` or Babel transforms and a separate config file. For a Vite project, Vitest is the lowest-friction choice with no capability trade-off.

---

## 10. WebGL Fallback Strategy

PixiJS v8 `autoDetectRenderer()` tries renderers in order: WebGPU → WebGL2 → Canvas 2D. The game code has no renderer-specific branches — PixiJS abstracts them. The only special case is post-processing: `@pixi/filter-glow` and `@pixi/filter-bloom` are WebGL filters and do nothing on Canvas 2D. `postProcess.ts` checks `app.renderer.type` before attaching filters and skips gracefully if the type is `'canvas'`.

---

## 11. File Inventory (Complete)

```
index.html
package.json
tsconfig.json
vite.config.ts
vitest.config.ts

src/
  main.ts
  engine/
    types.ts
    board.ts
    pieces.ts
    rotation.ts
    gravity.ts
    lineClear.ts
    gameState.ts
  renderer/
    app.ts
    boardRenderer.ts
    pieceRenderer.ts
    effects.ts
    postProcess.ts
  input/
    keyboard.ts
    touch.ts
  ui/
    hud.ts

src/__tests__/
  engine/
    board.test.ts
    pieces.test.ts
    rotation.test.ts
    gravity.test.ts
    lineClear.test.ts
    gameState.test.ts
```
