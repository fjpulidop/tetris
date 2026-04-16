# Context Bundle: enhanced-visual-effects-particle-systems

This file gives a developer all the ambient context they need to implement the tasks
without reading every source file from scratch.

---

## 1. Existing Effect Pattern (follow this exactly)

`src/renderer/effects.ts` implements a **pre-allocated object pool** pattern:

- All `Sprite` objects (particles) are created once in the constructor.
- They start `visible = false`.
- To "emit" a particle: find the first pool entry where `sprite.visible === false`,
  configure it (position, velocity, alpha), and set `visible = true`.
- To "retire" a particle when lifetime expires: set `visible = false` and
  reset `tint = 0xffffff` (so the next user gets a clean sprite).
- `tick(dtMs)` iterates the entire pool every frame, advancing or retiring.

Flash effects (`Graphics`) are different: they are created dynamically (`new Graphics()`)
in `triggerFlash()` and destroyed in `tick()`. The new full-screen overlays should NOT
follow this pattern — they should be pre-allocated at construction time (like particles),
since they are reused repeatedly and dynamic `new Graphics()` creates GC pressure.

---

## 2. Event Types Available

All four `GameEvent` types the engine can emit (from `src/engine/types.ts`):

```typescript
export type GameEventType = 'line-clear' | 'piece-lock' | 'level-up' | 'game-over'
```

### `line-clear` payload
```typescript
{ count: number; rows: number[] }
```
- `count`: number of rows cleared (1–4).
- `rows`: array of board row indices (0-based, top of board = 0). Already used by
  `triggerLineClearEffects()` — `rows` is the vertical position for particle spawn.

### `piece-lock` payload
The engine emits `{ type: 'piece-lock' }` with **no payload**. `main.ts` enriches it
before forwarding to `EffectsRenderer`:
```typescript
{ type: 'piece-lock', payload: { piece: ActivePiece } }
```
`ActivePiece` is the piece that just locked (captured from `stateBeforeTick.activePiece`
in `main.ts` before calling `updateGameState()`).

### `level-up` payload
```typescript
{ level: number }
```
The new level number. Not needed for the visual effect but available if you want to
scale intensity by level in a future iteration.

### `game-over`
No payload. No visual effect added for this ticket.

---

## 3. Piece Color Map

Two maps work together:

**`PIECE_COLORS`** (from `src/engine/pieces.ts`) — maps piece type to color index:
```typescript
{ I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 }
```

**`CELL_COLORS`** (from `src/renderer/boardRenderer.ts`) — maps color index to hex:
```typescript
{
  1: 0x00f0f0,  // I — cyan
  2: 0xf0f000,  // O — yellow
  3: 0xa000f0,  // T — purple
  4: 0x00f000,  // S — green
  5: 0xf00000,  // Z — red
  6: 0x0000f0,  // J — blue
  7: 0xf0a000,  // L — orange
}
```

Usage pattern already in `pieceRenderer.ts`:
```typescript
import { PIECE_COLORS } from '../engine/pieces.js'
import { CELL_COLORS } from './boardRenderer.js'

const colorIndex = PIECE_COLORS[piece.type]
const color = CELL_COLORS[colorIndex] ?? 0xffffff
```

Copy this pattern verbatim into `effects.ts`.

---

## 4. Layout Parameters

The `EffectsRenderer` stores three layout values set by `resize()`:
```typescript
private cellSize = 0   // px per board cell (e.g. 30 on a typical desktop)
private offsetX = 0    // px from left edge of viewport to board left edge
private offsetY = 0    // px from top edge of viewport to board top edge
```

The internal board-relative container (`this.boardContainer`) is positioned:
```typescript
this.boardContainer.x = offsetX
this.boardContainer.y = offsetY
```

This means **all coordinates inside `boardContainer` are relative to the board origin**.
To convert board-space (row, col) to screen-space: `screenX = col * cellSize + offsetX`.
But since you're working inside `boardContainer` already, you only need
`localX = col * cellSize`.

The screen-space container (`this.screenContainer = stage`) has **no offset** — it is
the PixiJS `effectsContainer` passed from `main.ts`, which sits at `(0, 0)` on
`app.stage`. All full-viewport overlays (flash, edge pulse) must use **window
dimensions** (`this.screenW`, `this.screenH`), updated via `resizeScreen(w, h)`.

Board dimensions:
- `BOARD_COLS = 10` (from `src/engine/board.ts`)
- `BOARD_ROWS = 20` (from `src/engine/board.ts`)
- Board pixel width = `cellSize * BOARD_COLS`
- Board pixel height = `cellSize * BOARD_ROWS`

---

## 5. PixiJS 8 APIs Used

### Sprite tinting
```typescript
sprite.tint = 0x00f0f0    // set tint color; Texture.WHITE × tint = final color
sprite.tint = 0xffffff    // neutral (no tint) — reset when retiring a particle
```

### Graphics stroke (PixiJS 8 API — not v7 lineStyle)
```typescript
graphics.clear()
graphics.setStrokeStyle({ width: 6, color: 0x00f0f0, alpha: 0.7 })
graphics.rect(0, 0, w, h)
graphics.stroke()
```

### Graphics fill
```typescript
graphics.clear()
graphics.rect(0, 0, w, h)
graphics.fill({ color: 0xffffff, alpha: 0.8 })
```

### Graphics roundRect (used for shimmer cells, matches boardRenderer)
```typescript
graphics.clear()
graphics.roundRect(x, y, size, size, 2)
graphics.fill({ color: 0xffffff, alpha: 0.12 })
```

### BloomFilter (from `@pixi/filter-bloom`)
The `blur` property controls the bloom radius/strength. The filter was constructed with
`new BloomFilter(1.2)` in `postProcess.ts`. In PixiJS v8 with this filter package, the
bloom strength is readable/writable via `(filter as unknown as { blur: number }).blur`.

---

## 6. Container Hierarchy at Runtime

The draw order in `main.ts` (bottom → top in z-order):
```
app.stage
  boardContainer       ← board grid, locked cells
  pieceContainer       ← active piece, ghost piece
  effectsContainer     ← EffectsRenderer owns this
    [boardContainer]   ← internal, board-offset; holds particles, shimmer, row flashes
    [edgePulseOverlay] ← screen-space, no offset
    [tetrisFlashOverlay] ← screen-space, no offset
    [levelUpOverlay]   ← screen-space, no offset
  uiContainer          ← HUD
  touchContainer       ← touch controls
  mainMenuContainer    ← main menu
  modalContainer       ← pause modal, game-over overlay, leaderboard (if installed)
```

The Tetris flash at `TETRIS_FLASH_ALPHA = 0.8` will visually cover the board and piece
containers. This is intentional — it's a momentary full-screen white-out.

The shimmer lives in the board-relative sub-container, above the PixiJS-rendered piece
cells but below `uiContainer`. Since `pieceContainer` has `GlowFilter` and `BloomFilter`
applied, the piece cells already glow. The shimmer adds an on-top alpha pulse. It is
not affected by `pieceContainer`'s filters (it is in a different container).

---

## 7. Current Pool Status

```typescript
const PARTICLE_POOL_SIZE = 200   // existing — increase to 300 in T1
const PARTICLES_PER_ROW = 30     // 4 rows × 30 = 120 worst case for line-clear
const LOCK_BURST_COUNT = 25      // new — worst case adds 25
// Total worst-case demand: 145; pool of 300 gives safe headroom
```

If the pool is exhausted, the `triggerParticles` and `triggerPieceLockBurst` loops
simply skip additional particles (they `continue` past the `if (particle.sprite.visible)
continue` guard). No crash, no error — just fewer particles.

---

## 8. Import Boundary Rules

The ESLint `no-restricted-imports` rules enforce these boundaries:

| Layer | May import from |
|---|---|
| `src/engine/` | Only itself (`engine/`) and `engine/types.ts` |
| `src/renderer/` | `engine/` (allowed), NOT `input/`, NOT `ui/` |
| `src/input/` | `engine/` only, NOT `renderer/`, NOT `ui/` |
| `src/ui/` | `engine/` allowed, NOT `input/`, NOT `renderer/` |
| `src/main.ts` | All layers |

New imports added by this feature:
- `effects.ts` imports `getCells`, `ActivePiece` from `../engine/rotation.js` — **OK**
- `effects.ts` imports `PIECE_COLORS` from `../engine/pieces.js` — **OK**
- `effects.ts` imports `CELL_COLORS` from `./boardRenderer.js` (same renderer layer) — **OK**
- `effects.ts` imports `GameState` from `../engine/gameState.js` — **OK**
- `main.ts` imports `PostProcessController` type from `./renderer/postProcess.js` — **OK**

No new imports cross a forbidden boundary.

---

## 9. `getCells` Reference

Used for the piece-lock burst centroid and the idle shimmer:
```typescript
import { getCells } from '../engine/rotation.js'
import type { ActivePiece } from '../engine/rotation.js'

const cells = getCells(piece)  // returns [row, col][] for all 4 cells
```

`getCells` is a pure function — no side effects, no PixiJS dependency.
`pieceRenderer.ts` already uses it with an identical import path.

---

## 10. Test Infrastructure

Tests live in `src/__tests__/`. Environment is jsdom (see `vitest.config.ts`).

For renderer tests that need PixiJS mocks, use the pattern from existing tests like
`src/__tests__/ui/pauseModal.test.ts`:
```typescript
vi.mock('pixi.js', () => ({
  Container: class MockContainer { ... },
  Graphics: class MockGraphics { ... },
  Sprite: class MockSprite { ... },
  Texture: { WHITE: {} },
  // etc.
}))
```

`GameState` can be partially constructed for testing:
```typescript
const mockPlayingState = {
  phase: 'playing' as const,
  activePiece: { type: 'T' as const, rotation: 0 as const, row: 5, col: 3 },
} as GameState
```

Run a single test file:
```
npx vitest run src/__tests__/renderer/effects.test.ts
```
