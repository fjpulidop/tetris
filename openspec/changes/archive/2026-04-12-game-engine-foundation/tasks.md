# Tasks: Game Engine Foundation

**Change name:** game-engine-foundation
**Date:** 2026-04-12

Tasks are ordered by dependency. A task must not begin until all tasks it depends on are complete. Each task is scoped to be implementable in a single focused session (roughly 30–90 minutes).

---

## Group 1: Project Setup

### Task 1.1 — Initialize package.json and install dependencies
**Layer:** `[infra]`

**Description:**
Create `package.json` with all required runtime and dev dependencies. Install them so `node_modules/` is populated.

**Files:**
- Create: `package.json`

**Dependencies to include:**
- Runtime: `pixi.js@^8`, `@pixi/filter-glow`, `@pixi/filter-bloom`
- Dev: `vite@^5`, `typescript@^5`, `vitest@^1`, `@vitest/coverage-v8`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint`

**Acceptance criteria:**
- `npm install` completes without errors.
- `package.json` has `"type": "module"`.
- Scripts defined: `"dev": "vite"`, `"build": "tsc && vite build"`, `"test": "vitest run"`, `"test:coverage": "vitest run --coverage"`, `"lint": "eslint src --ext .ts"`.

---

### Task 1.2 — TypeScript configuration
**Layer:** `[infra]`

**Description:**
Create `tsconfig.json` with strict TypeScript settings appropriate for a browser ES2022 project.

**Files:**
- Create: `tsconfig.json`

**Key settings:**
- `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`
- `"strict": true`, `"noUncheckedIndexedAccess": true`
- `"lib": ["ES2022", "DOM"]`
- `"outDir": "./dist"`, `"rootDir": "./src"`
- `"include": ["src"]`

**Acceptance criteria:**
- `tsc --noEmit` exits 0 on an empty `src/main.ts`.
- `moduleResolution: Bundler` is set (required for Vite + PixiJS v8 package exports).

---

### Task 1.3 — Vite and Vitest configuration
**Layer:** `[infra]`

**Description:**
Create `vite.config.ts` and `vitest.config.ts`. Configure Vitest for browser-environment DOM testing with V8 coverage.

**Files:**
- Create: `vite.config.ts`
- Create: `vitest.config.ts`

**`vite.config.ts` key settings:**
- `build.target: 'es2022'`
- No special aliases needed — use relative imports throughout.

**`vitest.config.ts` key settings:**
- `environment: 'jsdom'`
- `coverage.provider: 'v8'`
- `coverage.include: ['src/engine/**']`
- `coverage.thresholds.branches: 80`

**Acceptance criteria:**
- `npm run test` runs and exits (even with zero test files).
- `npm run dev` starts the Vite dev server.

---

### Task 1.4 — HTML entry point
**Layer:** `[infra]`

**Description:**
Create `index.html` at the project root. This is the Vite entry point. It must include a `<canvas id="game-canvas">` element and load `src/main.ts` as an ES module.

**Files:**
- Create: `index.html`

**Key markup:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Falling-Block Puzzle</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #0a0a0f; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="game-canvas"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**Acceptance criteria:**
- `npm run dev` opens in browser and shows a black canvas filling the viewport.
- No 404 errors in the browser console.

---

## Group 2: Engine Core

### Task 2.1 — Shared types (`engine/types.ts`)
**Layer:** `[core]`

**Description:**
Define all types and enums shared across layers. This file is the one engine file that `input/`, `renderer/`, and `ui/` are permitted to import.

**Files:**
- Create: `src/engine/types.ts`

**Exports:**
- `PieceType` union type: `'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'`
- `Rotation` type: `0 | 1 | 2 | 3`
- `GameAction` enum (see design §6.1 for values)
- `GameEventType` union: `'line-clear' | 'piece-lock' | 'level-up' | 'game-over'`
- `GameEvent` interface: `{ type: GameEventType; payload?: unknown }`

**Acceptance criteria:**
- No imports in this file (it is the root of the type tree).
- `tsc --noEmit` passes.
- ESLint passes.

---

### Task 2.2 — Board model (`engine/board.ts`)
**Layer:** `[core]`

**Description:**
Implement the 10×20 grid as a `Uint8Array`. Provide pure functions for reading, writing, cloning, and collision detection.

**Files:**
- Create: `src/engine/board.ts`

**Exports:**
- `BOARD_COLS = 10`, `BOARD_ROWS = 20`
- `Board` type alias for `Uint8Array`
- `emptyBoard(): Board`
- `cloneBoard(b: Board): Board`
- `getCell(b: Board, row: number, col: number): number`
- `setCell(b: Board, row: number, col: number, value: number): Board` — returns new board
- `isCollision(b: Board, cells: readonly [number, number][]): boolean` — checks if any cell is out of bounds or occupied

**Acceptance criteria:**
- All functions are pure (no mutation of input board).
- `isCollision` correctly rejects out-of-bounds coordinates (row < 0, row >= 20, col < 0, col >= 10).
- `setCell` does not mutate the input board.
- ESLint passes; no imports from `renderer/`, `input/`, or `ui/`.

---

### Task 2.3 — Tetromino shapes and SRS kick tables (`engine/pieces.ts`)
**Layer:** `[core]`

**Description:**
Define all 7 tetromino piece shapes across 4 rotation states as `[row, col]` offset arrays. Define the SRS wall-kick tables for standard pieces and the I-piece.

**Files:**
- Create: `src/engine/pieces.ts`

**Exports:**
- `PieceShape` type
- `PIECE_SHAPES: Record<PieceType, readonly PieceShape[]>` — 4 rotations per piece, each rotation = array of 4 `[row, col]` offsets
- `PIECE_COLORS: Record<PieceType, number>` — color index 1–7 (I=1, O=2, T=3, S=4, Z=5, J=6, L=7)
- `SRS_KICKS: Record<string, readonly [number, number][]>` — for J/L/S/T/Z pieces; key = `"${from}>${to}"`
- `SRS_KICKS_I: Record<string, readonly [number, number][]>` — for I piece
- `getSpawnPosition(type: PieceType): { row: number; col: number }` — standard spawn column (center-top)

**Rotation encoding note:** Use the standard Guideline North/East/South/West orientation. Spawn state is North (rotation 0).

**Acceptance criteria:**
- All 7 pieces have exactly 4 rotation states.
- Each rotation state has exactly 4 cell offsets (tetrominoes have 4 cells).
- SRS kick tables have 5 kick attempts per rotation transition for all 8 transitions per piece.
- ESLint passes; no imports from `renderer/`, `input/`, or `ui/`.

---

### Task 2.4 — SRS rotation resolver (`engine/rotation.ts`)
**Layer:** `[core]`

**Description:**
Implement `tryRotate()` which attempts a piece rotation and tries SRS kicks until one succeeds or all fail.

**Files:**
- Create: `src/engine/rotation.ts`

**Exports:**
- `ActivePiece` interface: `{ type: PieceType; rotation: Rotation; row: number; col: number }`
- `getCells(piece: ActivePiece): readonly [number, number][]` — converts piece position + rotation to absolute board coordinates
- `tryRotate(board: Board, piece: ActivePiece, direction: 'CW' | 'CCW'): ActivePiece | null`

**Logic for `tryRotate`:**
1. Compute target rotation (CW: `(r+1)%4`, CCW: `(r+3)%4`).
2. Select the correct kick table (I-piece vs standard).
3. For each kick offset: apply offset to piece position, call `isCollision(board, getCells(rotatedPiece))`. Return first non-colliding result.
4. Return `null` if all kicks fail.

**Acceptance criteria:**
- Wall kick works: a piece near the left wall can rotate if a kick pushes it right.
- A piece fully blocked by walls in all kick positions returns `null`.
- ESLint passes; no imports from `renderer/`, `input/`, or `ui/`.

---

### Task 2.5 — Gravity, soft-drop, and lock delay (`engine/gravity.ts`)
**Layer:** `[core]`

**Description:**
Implement gravity speed table and lock-delay timer logic. These are pure functions operating on `GravityState`.

**Files:**
- Create: `src/engine/gravity.ts`

**Exports:**
- `GRAVITY_TABLE: readonly number[]` — drop interval in ms per row, indexed by level (index 0 = level 1). Use guideline-approximate values: level 1 = 1000 ms, level 20 = ~83 ms.
- `LOCK_DELAY_MS = 500`
- `GravityState` interface (see design §4.5)
- `initialGravityState(): GravityState`
- `applyGravity(state: GravityState, board: Board, piece: ActivePiece, dtMs: number, level: number): { piece: ActivePiece; gravityState: GravityState; locked: boolean }`

**Lock logic:** When the piece cannot move down, start the lock timer (if not started). Each tick, decrement timer by `dtMs`. When timer reaches 0, set `locked: true`. Reset timer if the piece successfully moves or rotates (movement reset rule).

**Acceptance criteria:**
- At level 1, piece takes ~1 second to drop one row.
- Lock timer starts only when the piece is on the floor or a surface.
- Timer resets on successful lateral move or rotation.
- `locked: true` is returned exactly once per lock event.
- ESLint passes; no imports from `renderer/`, `input/`, or `ui/`.

---

### Task 2.6 — Line clear detection and board collapse (`engine/lineClear.ts`)
**Layer:** `[core]`

**Description:**
Implement full-row detection and board collapse after line clears.

**Files:**
- Create: `src/engine/lineClear.ts`

**Exports:**
- `detectFullRows(board: Board): number[]` — returns sorted row indices (top-to-bottom) of completely filled rows
- `clearRows(board: Board, rows: number[]): Board` — removes specified rows, prepends empty rows; returns new board

**Scoring note:** The game state module (Task 2.7) will translate count of cleared lines to score points. This module only handles the board geometry.

**Acceptance criteria:**
- `detectFullRows` returns empty array on a board with no full rows.
- Clearing 4 rows (a "Tetris") produces a board with 4 empty rows at top.
- `clearRows` does not mutate the input board.
- ESLint passes; no imports from `renderer/`, `input/`, or `ui/`.

---

### Task 2.7 — Game state machine (`engine/gameState.ts`)
**Layer:** `[core]`

**Description:**
Implement the top-level pure state machine that composes all engine modules. `updateGameState()` is the single entry point for advancing the game by one tick.

**Files:**
- Create: `src/engine/gameState.ts`

**Exports (see design §4.7 for full interface listing):**
- `GameState` interface
- `createGameState(): GameState`
- `updateGameState(state: GameState, actions: GameAction[], dtMs: number): { state: GameState; events: GameEvent[] }`

**Action handling order within one tick:**
1. If phase is not `'playing'`, handle Pause toggle and return early.
2. Process Pause action.
3. Process rotation actions (RotateCW, RotateCCW) via `tryRotate`.
4. Process lateral move actions (MoveLeft, MoveRight) with collision check.
5. Process HardDrop (drop piece to lowest valid position, lock immediately, emit `piece-lock`).
6. Apply gravity + soft-drop modifier.
7. If gravity indicates lock: lock piece onto board, run `detectFullRows`, if any: `clearRows` + emit `line-clear` + update score/level + possibly emit `level-up`.
8. Spawn next piece. If spawn collides: set phase to `'gameover'`, emit `game-over`.

**Acceptance criteria:**
- `createGameState()` returns a valid initial state with a spawned active piece.
- Hard drop locks the piece in the same tick it is issued.
- Clearing 4 lines in one tick emits exactly one `line-clear` event with the correct row count in payload.
- Game-over is triggered when spawn position is occupied.
- `updateGameState` is a pure function: calling it twice with the same inputs returns identical results.
- ESLint passes; no imports from `renderer/`, `input/`, or `ui/`.

---

## Group 3: Renderer

### Task 3.1 — PixiJS application init (`renderer/app.ts`)
**Layer:** `[frontend]`

**Description:**
Initialize a PixiJS v8 `Application` instance. Pass in the canvas element from the DOM. Return the initialized app.

**Files:**
- Create: `src/renderer/app.ts`

**Key points:**
- Use `await app.init({ canvas, resizeTo: window, autoDensity: true, resolution: Math.min(window.devicePixelRatio, 2) })`.
- Do not call `document.body.appendChild` — the canvas already exists in `index.html`.
- Export `createPixiApp(canvas: HTMLCanvasElement): Promise<Application>`.

**Acceptance criteria:**
- PixiJS renders to the existing canvas element without creating a new one.
- `app.renderer.type` is logged to console in dev mode (confirms WebGL or Canvas).
- ESLint passes; no imports from `input/` or `ui/`.

---

### Task 3.2 — Board renderer (`renderer/boardRenderer.ts`)
**Layer:** `[frontend]`

**Description:**
Draw the locked board cells and grid lines using PixiJS `Graphics`. Update on every render frame by comparing current state to last drawn state.

**Files:**
- Create: `src/renderer/boardRenderer.ts`

**Key points:**
- Cell color map: `CELL_COLORS: Record<number, number>` mapping color indices 1–7 to hex values. Value 0 = empty (not drawn, or drawn as dark background).
- Grid lines are static after init/resize — do not redraw them every frame.
- Only redraw cells whose value has changed since last frame to minimize Graphics calls.

**Acceptance criteria:**
- Locked cells appear in the correct colors at the correct grid positions.
- Empty cells show the grid background (dark color, distinct from locked cells).
- Resize correctly repositions all cells.
- ESLint passes; no imports from `input/` or `ui/`.

---

### Task 3.3 — Piece renderer with ghost piece (`renderer/pieceRenderer.ts`)
**Layer:** `[frontend]`

**Description:**
Draw the active falling piece and its ghost (drop preview). The ghost is the piece dropped to the lowest valid row, rendered at 30% opacity.

**Files:**
- Create: `src/renderer/pieceRenderer.ts`

**Ghost calculation:** Starting from the active piece's current row, repeatedly attempt to move down by 1 row until `isCollision` returns true. The row just before collision is the ghost row. Import `isCollision` and `getCells` from `engine/`.

**Acceptance criteria:**
- Active piece renders at correct position with full opacity.
- Ghost piece renders below the active piece with 30% opacity.
- Ghost is not shown when the active piece is already at the lowest valid position (they overlap).
- ESLint passes; no imports from `input/` or `ui/`.

---

### Task 3.4 — Line-clear effects (`renderer/effects.ts`)
**Layer:** `[frontend]`

**Description:**
Implement row flash and particle burst effects triggered by `line-clear` game events.

**Files:**
- Create: `src/renderer/effects.ts`

**Flash effect:** White `Graphics` rectangle overlaid on each cleared row, alpha starting at 1.0 and fading to 0 over 200 ms.

**Particle effect:** 30 small square sprites per cleared row, emitted from random x positions along the row midpoint, with randomized velocities (upward bias) and alpha fade over 400 ms. Use `ParticleContainer` for batch rendering. Recycle particle objects (use an object pool — pre-allocate 200 particles).

**Acceptance criteria:**
- Flash effect is visible for exactly ~200 ms after a line-clear event.
- Particles are visible and animated for ~400 ms.
- Multiple simultaneous line clears (up to 4) all trigger effects correctly.
- No memory leak: particle objects are pooled, not created per event.
- ESLint passes; no imports from `input/` or `ui/`.

---

### Task 3.5 — Post-processing filters (`renderer/postProcess.ts`)
**Layer:** `[frontend]`

**Description:**
Attach glow and bloom filters to the board and piece containers. Skip gracefully when running on Canvas 2D renderer.

**Files:**
- Create: `src/renderer/postProcess.ts`

**Key points:**
- Import `GlowFilter` from `@pixi/filter-glow` and `BloomFilter` from `@pixi/filter-bloom`.
- Check `app.renderer.type !== 'canvas'` before attaching (PixiJS v8: use the renderer's type property or check `WebGLRenderer` instance).
- `boardContainer.filters = [new GlowFilter({ distance: 8, outerStrength: 1.5 })]`
- `pieceContainer.filters = [new GlowFilter({ distance: 12, outerStrength: 2 }), new BloomFilter({ strength: 1.2 })]`

**Acceptance criteria:**
- Glow is visible around board cells in WebGL mode.
- HUD text is not affected by any filter.
- On a Canvas 2D renderer path, no errors are thrown (filters simply not attached).
- ESLint passes; no imports from `input/` or `ui/`.

---

## Group 4: Input

### Task 4.1 — Keyboard input (`input/keyboard.ts`)
**Layer:** `[frontend]`

**Description:**
Implement keyboard event listener that buffers `GameAction` values. Support held-key repeat for MoveLeft, MoveRight, SoftDrop.

**Files:**
- Create: `src/input/keyboard.ts`

**Key repeat logic:** On `keydown`, if the key is a repeat key and is already held, do not add to buffer (the game loop injects moves for held keys each tick based on `heldKeys` state). Export `getHeldActions(): GameAction[]` for use by the game loop.

**Acceptance criteria:**
- Single keypress emits exactly one action via `flush()`.
- `heldKeys` correctly tracks ArrowLeft, ArrowRight, ArrowDown.
- `destroy()` removes all event listeners.
- ESLint passes; no imports from `renderer/` or `ui/`.

---

### Task 4.2 — Touch / virtual controls (`input/touch.ts`)
**Layer:** `[frontend]`

**Description:**
Render six virtual buttons using PixiJS `Graphics` and handle `pointerdown` / `pointerup` events. Buttons are positioned in the bottom portion of the canvas.

**Files:**
- Create: `src/input/touch.ts`

**Buttons and actions:**
- Left arrow → MoveLeft (held)
- Right arrow → MoveRight (held)
- Down arrow → SoftDrop (held)
- CCW rotate → RotateCCW (tap)
- CW rotate → RotateCW (tap)
- Hard drop → HardDrop (tap)

**Held button handling:** While a directional button is held (pointer down), inject the action every tick. Tap buttons inject once on `pointerdown`.

**Acceptance criteria:**
- Buttons are visible on a 375 px wide viewport.
- Tapping each button produces the correct action in `flush()`.
- Holding Left/Right/Down produces the action repeatedly each frame.
- `destroy()` removes all event listeners and removes buttons from stage.
- ESLint passes; no imports from `renderer/` or `ui/`.

---

## Group 5: UI (HUD)

### Task 5.1 — HUD overlay (`ui/hud.ts`)
**Layer:** `[frontend]`

**Description:**
Display score, level, lines cleared, and next-piece preview using PixiJS `Text` objects. Position to the right of the board area.

**Files:**
- Create: `src/ui/hud.ts`

**Key points:**
- Use `new Text({ text: '0', style: { ... } })` (PixiJS v8 API).
- Next-piece preview: draw a 4×4 `Graphics` grid showing the next tetromino in its spawn rotation.
- Only call `text.text = newValue` when the value has actually changed (avoids unnecessary Text redraws).

**Acceptance criteria:**
- Score, level, and lines values update in real time as the game progresses.
- Next-piece preview correctly shows the upcoming piece shape.
- HUD is visible without overlapping the board.
- `resize()` correctly repositions all elements when window size changes.
- ESLint passes.

---

## Group 6: Integration

### Task 6.1 — Main entry point and game loop (`src/main.ts`)
**Layer:** `[infra]`

**Description:**
Wire all four layers together in the fixed-timestep game loop. This is the only file that imports from multiple layers.

**Files:**
- Create: `src/main.ts`

**Responsibilities:**
1. Get the canvas element from the DOM.
2. `await createPixiApp(canvas)` — initialize PixiJS.
3. Create engine state: `let state = createGameState()`.
4. Instantiate all renderers, input handlers, HUD.
5. Set up containers: `boardContainer`, `pieceContainer`, `uiContainer` as children of `app.stage`. Attach post-processing to board/piece containers.
6. Set up resize handler: call all `resize()` methods; call once immediately.
7. Start the RAF loop with fixed-timestep accumulator (see design §3).
8. In the loop:
   - Flush held-key actions from keyboard and touch each tick.
   - Call `updateGameState(state, actions, LOGIC_TICK_MS)`.
   - Pass events to `effects.onEvents()`.
   - Call `boardRenderer.update(state)`, `pieceRenderer.update(state)`.
   - Call `hud.update(state)`.
   - Call `effects.tick(dtMs)` each render frame.

**Acceptance criteria:**
- `npm run dev` opens a playable game in the browser.
- All 7 tetrominoes appear and can be moved and rotated.
- Lines clear when completed.
- Score and level update in the HUD.
- ESLint passes (verify no cross-boundary imports).

---

### Task 6.2 — Responsive layout and viewport adaptation
**Layer:** `[infra]`

**Description:**
Implement the `handleResize()` function in `main.ts` that recalculates `cellSize` and propagates it to all renderers and input. Show/hide touch controls based on viewport width.

**Files:**
- Modify: `src/main.ts`

**Cell size formula:**
```
cellSize = Math.floor(Math.min(window.innerHeight * 0.9, window.innerWidth * 0.55) / BOARD_ROWS)
```

**Acceptance criteria:**
- On a 375 px wide mobile viewport, the board fills the screen correctly with no overflow.
- On a 1440 px desktop viewport, the board is centered with HUD visible beside it.
- Resizing the browser window while the game is running reflows correctly within one frame.
- Touch buttons are visible only on viewports narrower than 768 px.

---

## Group 7: Tests

### Task 7.1 — Board model tests (`engine/board.test.ts`)
**Layer:** `[test]`

**Files:**
- Create: `src/__tests__/engine/board.test.ts`

**Test cases:**
- `emptyBoard()` returns a 200-element `Uint8Array` of all zeros.
- `setCell` returns a new board; original is unchanged.
- `getCell` reads the correct value after `setCell`.
- `isCollision` returns `true` for out-of-bounds coordinates.
- `isCollision` returns `true` for occupied cells.
- `isCollision` returns `false` for empty in-bounds cells.

---

### Task 7.2 — Piece shape tests (`engine/pieces.test.ts`)
**Layer:** `[test]`

**Files:**
- Create: `src/__tests__/engine/pieces.test.ts`

**Test cases:**
- Each of 7 piece types has exactly 4 rotation states.
- Each rotation state has exactly 4 cell offsets.
- `getSpawnPosition` returns a column that centers the piece horizontally.
- SRS kick tables have 5 kick offsets for every rotation transition.

---

### Task 7.3 — Rotation tests (`engine/rotation.test.ts`)
**Layer:** `[test]`

**Files:**
- Create: `src/__tests__/engine/rotation.test.ts`

**Test cases:**
- T-piece CW rotation from North to East succeeds in open space.
- T-piece CW rotation blocked by left wall succeeds via kick.
- I-piece rotation near right wall uses I-specific kick table.
- Rotation returns `null` when all 5 kicks fail.
- CCW rotation produces the correct rotation state.

---

### Task 7.4 — Gravity and lock-delay tests (`engine/gravity.test.ts`)
**Layer:** `[test]`

**Files:**
- Create: `src/__tests__/engine/gravity.test.ts`

**Test cases:**
- At level 1, piece does not drop after 500 ms (less than 1000 ms interval).
- At level 1, piece drops 1 row after 1000 ms.
- Lock timer starts when piece cannot move down.
- Lock timer resets on lateral move.
- `locked: true` is returned after `LOCK_DELAY_MS` with no movement.
- `locked` is not returned before `LOCK_DELAY_MS` expires.

---

### Task 7.5 — Line-clear tests (`engine/lineClear.test.ts`)
**Layer:** `[test]`

**Files:**
- Create: `src/__tests__/engine/lineClear.test.ts`

**Test cases:**
- `detectFullRows` returns empty array on empty board.
- `detectFullRows` returns correct row indices when rows are full.
- `clearRows` on 1 full row: board has 1 new empty row at top.
- `clearRows` on 4 full rows: board has 4 new empty rows at top.
- `clearRows` does not mutate input board.
- Partial rows are not detected as full.

---

### Task 7.6 — Game state machine tests (`engine/gameState.test.ts`)
**Layer:** `[test]`

**Files:**
- Create: `src/__tests__/engine/gameState.test.ts`

**Test cases:**
- `createGameState()` returns phase `'playing'` with a non-null `activePiece`.
- `updateGameState` with HardDrop action immediately locks the piece.
- Clearing 4 lines emits exactly one `line-clear` event with `payload.count = 4`.
- Score increases after line clear (at least 1 point).
- Level increases after clearing enough lines.
- `level-up` event is emitted when level increases.
- Spawning a piece on an occupied spawn position triggers phase `'gameover'` and emits `game-over` event.
- Calling `updateGameState` twice with identical inputs returns identical state (pure function test).
- `updateGameState` with Pause action toggles phase between `'playing'` and `'paused'`.

---

### Task 7.7 — Coverage enforcement
**Layer:** `[test]`

**Description:**
Verify the coverage threshold is met by running `npm run test:coverage` and confirming the Vitest coverage report shows ≥ 80% branch coverage on `src/engine/**`.

**Files:**
- No new files — this task is a verification gate.

**Acceptance criteria:**
- `npm run test:coverage` exits 0 with no coverage threshold failures.
- Coverage report shows branch coverage ≥ 80% for all files in `src/engine/`.

---

## Task Ordering Summary

```
1.1 → 1.2 → 1.3 → 1.4        (infra: sequential)
1.2 → 2.1 → 2.2 → 2.3        (engine: types before logic)
2.2 + 2.3 → 2.4               (rotation needs board + pieces)
2.2 + 2.4 → 2.5               (gravity needs board + rotation)
2.2 → 2.6                     (line clear needs board)
2.4 + 2.5 + 2.6 → 2.7        (game state needs all engine modules)
1.3 + 3.1 → 3.2 + 3.3 + 3.4 + 3.5  (renderer: pixi app first)
1.2 + 2.1 → 4.1 + 4.2        (input: types first)
3.1 + 2.1 → 5.1               (HUD: pixi app + types)
2.7 + 3.1-3.5 + 4.1 + 4.2 + 5.1 → 6.1 → 6.2  (integration last)
2.2–2.7 → 7.1–7.6 → 7.7      (tests: engine complete before writing tests)
```
