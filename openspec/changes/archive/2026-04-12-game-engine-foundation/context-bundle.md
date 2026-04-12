# Context Bundle: Game Engine Foundation

**Change name:** game-engine-foundation
**Date:** 2026-04-12
**For:** Developer agent — consume this before beginning implementation.

---

## What to Build

A complete, playable falling-block puzzle game running in the browser. Start from zero (only `.eslintrc.cjs`, `.gitignore`, and `openspec/` exist). Deliver:

- A working `npm run dev` experience with a 60 fps game.
- All 7 standard tetrominoes with SRS wall-kick rotation.
- Keyboard controls (desktop) and virtual touch controls (mobile).
- PixiJS v8 rendering with glow/bloom post-processing.
- Line-clear particle effects.
- Responsive layout (works at 375 px mobile viewport).
- Unit tests for the engine layer with ≥ 80% branch coverage.

The game must **never** be called "Tetris". Use "falling-block puzzle game" in all user-facing text. The word "tetromino" (referring to pieces) is fine — it predates the trademark.

---

## Critical Constraints

1. **`engine/` is a pure TypeScript module** — no DOM APIs, no PixiJS, no imports from `renderer/`, `input/`, or `ui/`. This is enforced by `.eslintrc.cjs`. Violating it is a lint error that will fail the build.

2. **`renderer/` must not import from `input/` or `ui/`** — also enforced by ESLint.

3. **`input/` must not import from `renderer/` or `ui/`** — enforced by ESLint.

4. **Only `src/main.ts` may import from multiple layers.** All cross-layer wiring happens there.

5. **Use PixiJS v8** — the v8 API differs significantly from v7. Key difference: `Application` is initialized with `await app.init({...})`, not with a constructor. Do not follow v7 tutorials.

---

## File Map and Purposes

| File | Layer | Purpose |
|---|---|---|
| `index.html` | infra | Vite entry point; contains `<canvas id="game-canvas">` |
| `package.json` | infra | Dependencies and scripts |
| `tsconfig.json` | infra | TypeScript settings (strict, ES2022, Bundler resolution) |
| `vite.config.ts` | infra | Vite build config |
| `vitest.config.ts` | infra | Vitest config; coverage threshold 80% branches on engine/ |
| `src/main.ts` | infra | RAF loop, resize handler, layer wiring |
| `src/engine/types.ts` | core | Shared types: PieceType, Rotation, GameAction, GameEvent |
| `src/engine/board.ts` | core | 10×20 Uint8Array board model; pure functions |
| `src/engine/pieces.ts` | core | Piece shapes (4 rotations × 7 types) + SRS kick tables |
| `src/engine/rotation.ts` | core | SRS rotation resolver; ActivePiece type |
| `src/engine/gravity.ts` | core | Drop interval table; lock-delay logic |
| `src/engine/lineClear.ts` | core | Full-row detection and board collapse |
| `src/engine/gameState.ts` | core | Pure state machine; `updateGameState()` is the main engine API |
| `src/renderer/app.ts` | frontend | PixiJS Application init on existing canvas |
| `src/renderer/boardRenderer.ts` | frontend | Draws locked cells and grid |
| `src/renderer/pieceRenderer.ts` | frontend | Draws active piece + ghost piece |
| `src/renderer/effects.ts` | frontend | Particle + flash effects for line-clear events |
| `src/renderer/postProcess.ts` | frontend | Glow/bloom on board/piece containers; skips on Canvas 2D |
| `src/input/keyboard.ts` | frontend | Keyboard → GameAction buffer |
| `src/input/touch.ts` | frontend | Virtual buttons → GameAction buffer |
| `src/ui/hud.ts` | frontend | Score, level, lines, next-piece preview |
| `src/__tests__/engine/*.test.ts` | test | Vitest unit tests for all engine modules |

---

## Critical Interfaces Between Modules

### `engine/gameState.ts` → everything

```typescript
// The primary engine output — produced once per logic tick
export interface UpdateResult {
  state: GameState
  events: GameEvent[]
}

export function updateGameState(
  state: GameState,
  actions: GameAction[],
  dtMs: number
): UpdateResult
```

`main.ts` calls this every tick and passes `state` to all renderers. `events` goes to `effects.onEvents()`.

### `engine/types.ts` — cross-layer contract

```typescript
export enum GameAction {
  MoveLeft = 'MoveLeft',
  MoveRight = 'MoveRight',
  RotateCW = 'RotateCW',
  RotateCCW = 'RotateCCW',
  SoftDrop = 'SoftDrop',
  HardDrop = 'HardDrop',
  Pause = 'Pause',
}

export type GameEventType = 'line-clear' | 'piece-lock' | 'level-up' | 'game-over'
export interface GameEvent { type: GameEventType; payload?: unknown }
```

`input/keyboard.ts` and `input/touch.ts` import `GameAction` from here (not from each other — the enum lives in engine so the engine can accept it as input without importing from input/).

### `engine/board.ts` — used by renderer for ghost piece

```typescript
export function isCollision(board: Board, cells: readonly [number, number][]): boolean
```

`renderer/pieceRenderer.ts` imports this to compute the ghost piece drop position. This import is legal (`renderer/` may import from `engine/`).

### Input → `main.ts` interface

```typescript
// Both keyboard and touch implement this informal interface:
interface InputSource {
  flush(): GameAction[]          // returns and clears action buffer
  getHeldActions(): GameAction[] // actions to repeat while keys/buttons are held
  resize?(cellSize: number): void
  destroy(): void
}
```

`main.ts` calls `flush()` and `getHeldActions()` at the start of each logic tick, concatenates the results, deduplicates, and passes to `updateGameState`.

### Renderer resize interface

All renderers implement a `resize(cellSize: number, offsetX: number, offsetY: number): void` method. `main.ts` calls this on every `window.resize` event and once at startup.

---

## Exact Changes — What Goes in Each File

### `index.html`
Single-page HTML. `<canvas id="game-canvas">` in body. `<script type="module" src="/src/main.ts">`. Body background `#0a0a0f`. No other elements needed.

### `package.json`
```json
{
  "name": "falling-block-puzzle",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts"
  },
  "dependencies": {
    "pixi.js": "^8.0.0",
    "@pixi/filter-glow": "^5.0.0",
    "@pixi/filter-bloom": "^5.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "eslint": "^8.0.0"
  }
}
```

### `tsconfig.json`
Use `"moduleResolution": "Bundler"` — required for PixiJS v8 package.json `exports` field to resolve correctly. `"strict": true`, `"noUncheckedIndexedAccess": true`. Target `"ES2022"`.

### `vite.config.ts`
Minimal config — Vite works well with defaults. Set `build.target: 'es2022'`. No special aliases.

### `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      thresholds: { branches: 80 },
    },
  },
})
```

### `src/engine/board.ts`
The board is `Uint8Array(200)`. Row-major order: index = `row * BOARD_COLS + col`. **All mutation functions return a new array** — `b.slice()` is the clone primitive. `isCollision` checks bounds first (row < 0, col < 0, row >= BOARD_ROWS, col >= BOARD_COLS), then checks `getCell`. This order matters: out-of-bounds check must happen before array access.

### `src/engine/pieces.ts`
Encode all 7 piece shapes as `[row, col]` offset arrays from origin `[0,0]`. Use the Guideline standard spawn orientation. The I-piece is 4 columns wide in rotation 0, so its spawn position is `col = 3` (leftmost cell at column 3, making it columns 3–6 centered on a 10-wide board). The O-piece spawns at `col = 4`.

SRS kicks for JLSTZ pieces: 5 attempts per direction-pair. Example for `0>1` (North→East): `[[0,0], [-1,0], [-1,1], [0,-2], [-1,-2]]`. Full tables available at [tetrominoes.org/srs] — these are public domain.

### `src/engine/rotation.ts`
`getCells(piece)` = `PIECE_SHAPES[piece.type][piece.rotation].map(([dr, dc]) => [piece.row + dr, piece.col + dc])`. `tryRotate` computes `newRotation`, then for each kick `[kr, kc]` in the appropriate table: tests `isCollision(board, getCells({ ...piece, rotation: newRotation, row: piece.row + kr, col: piece.col + kc }))`. First non-collision wins.

### `src/engine/gravity.ts`
`applyGravity` accumulates `dtMs` in `gravityAccum`. When `gravityAccum >= GRAVITY_TABLE[level - 1]`, subtract the interval and move piece down by 1 (repeat if accumulated enough for multiple drops). If the piece cannot move down, enter lock phase. Soft-drop multiplies gravity by 20× (standard guideline value) for the duration the action is held.

### `src/engine/gameState.ts`
`updateGameState` must be pure. Use only local variable mutations (never mutate input `state`). Build the new state step by step: apply moves → apply gravity → maybe lock → maybe clear lines → maybe spawn next piece → return `{ state: newState, events }`. The 7-bag randomizer for piece generation: shuffle all 7 types into a bag; deal from the bag; when empty, shuffle a new bag. Store the bag in `GameState.pieceBag: PieceType[]`.

### `src/renderer/app.ts`
PixiJS v8 init pattern:
```typescript
const app = new Application()
await app.init({
  canvas,
  resizeTo: window,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio, 2),
  backgroundColor: 0x0a0a0f,
})
```
Do **not** use `new Application({ view: canvas })` — that is the v7 API.

### `src/renderer/boardRenderer.ts`
Cache the last-drawn board state as a `Uint8Array` copy. On each `update()`, compare cell by cell. Only re-draw changed cells by calling `graphics.clear()` and redrawing that cell's Graphics object. Alternatively, maintain one `Graphics` object per cell (200 total) — for this board size, either approach is acceptable. The per-cell Graphics approach is simpler to implement and update selectively.

### `src/renderer/pieceRenderer.ts`
Ghost piece calculation:
```typescript
let ghostRow = piece.row
while (!isCollision(board, getCells({ ...piece, row: ghostRow + 1 }))) {
  ghostRow++
}
```
Draw ghost with `alpha = 0.3` and same color as active piece. If `ghostRow === piece.row`, skip drawing ghost (piece is already at floor).

### `src/renderer/effects.ts`
Object pool for particles: pre-allocate 200 `Sprite` objects from a 4×4 white texture, add all to `ParticleContainer`, set `visible = false`. On line-clear event: activate N particles, set initial position/velocity, set `visible = true`. Each tick: update position by velocity, decrease alpha. When alpha <= 0: return to pool (`visible = false`).

Flash effect: one `Graphics` rectangle per row, drawn as white, alpha starts at 1.0. Each tick: alpha -= dtMs / 200. Remove when alpha <= 0.

### `src/renderer/postProcess.ts`
```typescript
import { GlowFilter } from '@pixi/filter-glow'
import { BloomFilter } from '@pixi/filter-bloom'

export function attachPostProcess(
  boardContainer: Container,
  pieceContainer: Container,
  app: Application
): void {
  // Skip on Canvas 2D renderer
  if (!(app.renderer instanceof WebGLRenderer)) return

  boardContainer.filters = [new GlowFilter({ distance: 8, outerStrength: 1.5, color: 0xffffff })]
  pieceContainer.filters = [
    new GlowFilter({ distance: 12, outerStrength: 2, color: 0xffffff }),
    new BloomFilter({ strength: 1.2 }),
  ]
}
```

Check the PixiJS v8 import path for `WebGLRenderer` — it may be `pixi.js` or a subpath. Use `import { WebGLRenderer } from 'pixi.js'`.

### `src/input/keyboard.ts`
Track `heldKeys: Set<string>`. On `keydown`: if not already held, add to set and push the action to `buffer`. On `keyup`: remove from set. `getHeldActions()`: for each key in `heldKeys`, return corresponding `GameAction` for MoveLeft, MoveRight, SoftDrop. This is called every logic tick by `main.ts` to simulate auto-repeat.

### `src/input/touch.ts`
Buttons are `Graphics` rectangles. Use `eventMode = 'static'` and `cursor = 'pointer'` (PixiJS v8 interaction API). Each button: `on('pointerdown', handler)`, `on('pointerup', handler)`. Directional buttons (left/right/down): set a `heldButton` flag on pointerdown, clear on pointerup. `getHeldActions()` checks the flag. Tap buttons (rotate, hard-drop): push to `buffer` on pointerdown only.

### `src/ui/hud.ts`
PixiJS v8 `Text` constructor: `new Text({ text: 'SCORE', style: new TextStyle({ fill: 0xffffff, fontSize: 18 }) })`. Cache last displayed values in instance variables. In `update()`: compare new value to cached, set `text.text = newValue` only if different.

For the next-piece preview: maintain a `Graphics` object. On each update, if `state.nextPiece !== lastNextPiece`: `graphics.clear()`, draw the 4 cells of `PIECE_SHAPES[state.nextPiece][0]` as small squares.

### `src/main.ts`
Key implementation details:
1. RAF loop uses the `accumulator` pattern exactly as specified in design §3. **Do not skip it** — the fixed timestep is required for deterministic lock-delay behavior.
2. Action deduplication: if both keyboard and touch emit `HardDrop` in the same tick (unlikely but possible), `HardDrop` should only be processed once. Deduplicate before passing to `updateGameState`.
3. Held actions: call `keyboard.getHeldActions()` and `touch.getHeldActions()` each tick, merge with `flush()` results.
4. Container hierarchy on `app.stage`:
   - `boardContainer` (has glow filter)
   - `pieceContainer` (has glow + bloom filter)
   - `effectsContainer` (particles — no filter; they should be bright, not additionally blurred)
   - `uiContainer` (HUD — no filter)
5. The `TouchInput` stage container should be a child of `uiContainer` or directly on `app.stage`, but **not** inside `boardContainer` or `pieceContainer` (buttons must not have glow applied to them).

---

## Gotchas and Edge Cases

### PixiJS v8 API differences from v7

- `new Application()` + `await app.init({...})` — NOT `new Application({ view: ... })`
- `Text` constructor: `new Text({ text: '...', style: {...} })` — NOT `new Text('...', style)`
- Interaction: set `container.eventMode = 'static'` (not `interactive = true`)
- Filters on `Container` work the same but filter imports may be from `'pixi.js'` directly in v8
- `ParticleContainer` is now `Container` with `isRenderGroup = true` for batch optimization — verify in v8 docs

### SRS kick table sign convention

The kick tables specify `[col_offset, row_offset]` in some sources and `[row_offset, col_offset]` in others. Choose one convention consistently in `engine/pieces.ts` and make sure `tryRotate` applies offsets in the same order. Recommend `[dRow, dCol]` to match the board coordinate system.

### Ghost piece and collision

Do NOT use the same collision check loop for ghost as for gravity movement. The ghost drops until `isCollision(board, getCells({ ...piece, row: ghostRow + 1, ... }))` is true — it checks one row **below** the candidate position. The ghost position is the last valid `ghostRow`, not the row where collision was detected.

### Lock delay movement reset

The movement reset rule: if the player moves or rotates the piece while it is in lock phase, the lock timer resets to `LOCK_DELAY_MS`. However, to prevent infinite delay (a player holding the piece in lock phase forever by continuously moving it), standard guidelines cap movement resets at 15 per lock phase. Implement this cap in `GravityState` with a `lockResetCount: number` field.

### 7-bag randomizer

The standard piece generator uses a bag of all 7 pieces, shuffled, dealt in sequence. When the bag is empty, a new bag is created. This guarantees at most 12 pieces between any two occurrences of the same type. Store the bag in `GameState` — do not use a module-level variable (that would break the pure function contract).

### Canvas element and PixiJS

PixiJS v8 with `await app.init({ canvas: myCanvas })` attaches to the existing canvas element. Do NOT call `document.body.appendChild(app.canvas)` — the canvas is already in the DOM. Doing so would move it and cause a visual glitch.

### WebGPU detection in PixiJS v8

`app.renderer.type` in PixiJS v8 returns `'webgpu'`, `'webgl'`, or `'canvas'` (lowercase strings). Use this to determine whether to apply filters. If `app.renderer.type === 'canvas'`, skip post-processing.

### Touch buttons and pointer capture

On mobile, a `pointerup` event may fire outside the button area if the finger slides off during a press. Use `setPointerCapture` or handle `pointerupoutside` events in PixiJS to ensure button release is always detected.

### Vitest jsdom environment

`jsdom` does not implement WebGL. Engine unit tests must not import anything from `renderer/` (they won't, due to ESLint rules) or call any DOM API that jsdom doesn't support. `Uint8Array`, `Math`, and plain object operations work fine in jsdom. Tests for `input/keyboard.ts` that attach to `window` will work in jsdom. Tests for PixiJS renderer classes should be skipped or mocked — do not try to test rendering logic with Vitest.

### ESLint configuration already in place

The `.eslintrc.cjs` file is already written and enforces import boundaries. Do not modify it. Run `npm run lint` after every task to catch violations early. The ignorePatterns include `vite.config.ts` and `vitest.config.ts` — they are excluded from linting.

### TypeScript `noUncheckedIndexedAccess`

With this setting, array access `arr[i]` returns `T | undefined`. This means accessing `PIECE_SHAPES[type][rotation]` requires a null check or a non-null assertion. Use the non-null assertion (`!`) sparingly and only where the values are provably defined by the data structure (all 7 piece types with 4 rotations are always present).

---

## Compatibility

Compatibility: No contract surface changes detected.

This is a greenfield project. There is no prior API surface to compare against. All files are new. No breaking changes possible.
