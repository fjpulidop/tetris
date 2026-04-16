# Context Bundle: Chain Blast — Cascading Line-Clear Explosions

This document is the developer's single reference for implementing ticket #25. It consolidates file-by-file change requirements, exact call signatures, data-flow details, and invariants. Read `design.md` for architectural rationale; read `tasks.md` for task ordering. This file is optimized for execution.

---

## Repository orientation

```
src/
  engine/
    types.ts          ← shared enums/types, no imports, all layers may read
    board.ts          ← Board (Uint8Array), BOARD_COLS=10, BOARD_ROWS=20, pure fns
    lineClear.ts      ← detectFullRows(), clearRows() — pure
    gameState.ts      ← GameState interface + updateGameState() — pure, single public API
    chainBlast.ts     ← NEW — pure chain logic (Task 2)
  renderer/
    boardRenderer.ts  ← BoardRenderer class, cellGraphics pre-allocated 200 Graphics
    effects.ts        ← EffectsRenderer, particle pool, flash effects
    postProcess.ts    ← attachPostProcess(), glow + bloom — currently returns void
  ui/
    hud.ts            ← HUD class, reads GameState each frame
  main.ts             ← ONLY cross-layer import file; fixed-timestep loop at 60Hz
  __tests__/
    engine/
      gameState.test.ts
      chainBlast.test.ts  ← NEW (Task 7)
```

---

## File 1: `src/engine/types.ts` — extend `GameEventType`

**Current `GameEventType`:**
```typescript
export type GameEventType = 'line-clear' | 'piece-lock' | 'level-up' | 'game-over'
```

**Replace with:**
```typescript
export type GameEventType =
  | 'line-clear'
  | 'piece-lock'
  | 'level-up'
  | 'game-over'
  | 'cell-charged'
  | 'chain-explosion'
  | 'chain-reset'
```

No other changes to `types.ts`. The `GameEvent` interface `{ type: GameEventType; payload?: unknown }` does not change.

---

## File 2: `src/engine/chainBlast.ts` — NEW file

Full module skeleton to implement:

```typescript
/**
 * Chain Blast — pure engine module for cascading line-clear explosions.
 * No imports outside engine/. No side effects.
 */

import { BOARD_COLS, BOARD_ROWS } from './board.js'
import type { Board } from './board.js'
import { detectFullRows, clearRows } from './lineClear.js'

export const CHARGE_PROBABILITY = 0.2    // 20% per cleared cell
export const CHARGE_LIFETIME_MS = 1500   // 1.5 s charge lifespan
export const CHAIN_RESET_MS = 2000       // 2 s until multiplier resets

/**
 * Chain score multiplier lookup.
 * depth 0 → 1×, depth 1 → 1.5×, depth 2 → 2×, depth 3+ → 3× (capped)
 */
export function chainMultiplier(depth: number): number { ... }

/**
 * For each cleared row, roll 20% per column and return flat indices
 * of cells on the row directly above that should become charged.
 * Row 0 has no row above — those columns are silently skipped.
 * Indices already in existingCharged are excluded.
 */
export function generateChargedCells(
  clearedRows: number[],
  _board: Board,                       // reserved for future density checks
  existingCharged: ReadonlySet<number>
): number[] { ... }

export interface ExplosionResult {
  board: Board
  newChargedCells: ReadonlySet<number>
  bonusRows: number[]
  affectedArea: ReadonlyArray<[number, number]>
}

/**
 * Identify which charged cells sit in triggeredRows, explode their 3×3
 * neighbourhoods, collect bonus full rows, and generate next-tier charges.
 */
export function resolveExplosions(
  board: Board,
  chargedCells: ReadonlySet<number>,
  triggeredRows: number[]
): ExplosionResult { ... }

export interface DecayResult {
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  emitChainReset: boolean
}

/**
 * Called every tick. Advances the decay timer and expires charged cells
 * or chain depth when their respective timeouts are reached.
 */
export function tickChargeDecay(
  chargedCells: ReadonlySet<number>,
  chainDepth: number,
  chainTimer: number,
  dtMs: number
): DecayResult { ... }
```

**Implementation notes:**

- `generateChargedCells`: the `_board` parameter is accepted but unused in v1 (prefixed `_` to satisfy `no-unused-vars`). Future iterations may use board density to bias charge probability.
- `resolveExplosions` identifies detonators with: `Math.floor(idx / BOARD_COLS)` for row, `idx % BOARD_COLS` for col. A detonator fires when its row is in the `triggeredRows` set.
- `affectedArea` deduplication: use a `Set<string>` keyed by `"${r},${c}"` during construction, then convert to `[number, number][]` for the return value.
- `tickChargeDecay`: do not reset `chainTimer` to 0 when it crosses a threshold — return `nextTimer` as-is. The timer is reset to 0 externally in `gameState.ts` whenever a new chain event fires.

---

## File 3: `src/engine/gameState.ts` — extend `GameState`, wire chain logic

### `GameState` interface additions (insert after `pieceBag`):

```typescript
/** Flat board indices (row * BOARD_COLS + col) of currently charged cells. */
chargedCells: ReadonlySet<number>
/** Number of consecutive chain links in the current chain sequence. 0 = no chain. */
chainDepth: number
/** Milliseconds elapsed since the last chain event (for decay/reset timing). */
chainTimer: number
```

### `createGameState()` initialization additions:

```typescript
chargedCells: new Set<number>(),
chainDepth: 0,
chainTimer: 0,
```

### New imports to add:

```typescript
import {
  chainMultiplier,
  generateChargedCells,
  resolveExplosions,
  tickChargeDecay,
} from './chainBlast.js'
```

### Lock pipeline refactor

Extract the repeated lock+clear body (appears identically in the hard-drop branch and the gravity-lock branch) into a helper to avoid duplicating chain logic. Suggested signature:

```typescript
interface LockResult {
  board: Board
  score: number
  lines: number
  level: number
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  events: GameEvent[]
}

function processLock(
  board: Board,
  piece: ActivePiece,
  score: number,
  lines: number,
  level: number,
  chargedCells: ReadonlySet<number>,
  chainDepth: number,
  chainTimer: number
): LockResult
```

Inside `processLock`:

```
1. board = lockPieceOntoBoard(board, piece)
2. events.push({ type: 'piece-lock' })
3. const fullRows = detectFullRows(board)
4. if fullRows.length > 0:
   a. const baseMultiplier = chainMultiplier(chainDepth)
   b. board = clearRows(board, fullRows)
   c. const clearedCount = fullRows.length
   d. score += Math.round(scoreForLines(clearedCount, level) * baseMultiplier)
   e. lines += clearedCount
   f. events.push({ type: 'line-clear', payload: { count: clearedCount, rows: fullRows } })

   g. const newChargedFlat = generateChargedCells(fullRows, board, chargedCells)

   h. const explosionResult = resolveExplosions(board, chargedCells, fullRows)
   i. if explosionResult.affectedArea.length > 0:
        chainDepth += 1
        chainTimer = 0
        board = explosionResult.board
        const bonusMultiplier = chainMultiplier(chainDepth)
        score += Math.round(scoreForLines(explosionResult.bonusRows.length, level) * bonusMultiplier)
        lines += explosionResult.bonusRows.length
        const allNewCharged = new Set([...newChargedFlat, ...explosionResult.newChargedCells])
        chargedCells = allNewCharged
        events.push({
          type: 'chain-explosion',
          payload: {
            depth: chainDepth,
            affectedArea: explosionResult.affectedArea,
            bonusRows: explosionResult.bonusRows,
          }
        })
        if explosionResult.bonusRows.length > 0:
          events.push({ type: 'line-clear', payload: { count: explosionResult.bonusRows.length, rows: explosionResult.bonusRows } })
      else:
        chainTimer = 0
        chargedCells = new Set([...chargedCells, ...newChargedFlat])

   j. if newChargedFlat.length > 0:
        events.push({ type: 'cell-charged', payload: { chargedIndices: newChargedFlat } })

   k. // Level up check (after all line increments)
      const newLevel = Math.floor(lines / 10) + 1
      if newLevel > level:
        level = newLevel
        events.push({ type: 'level-up', payload: { level } })

5. return { board, score, lines, level, chargedCells, chainDepth, chainTimer, events }
```

### Decay tick — add to BOTH the lock path and the no-lock return path

At the point where the final return state object is assembled (currently two early returns in the lock branches plus one at-bottom return), add before constructing the return:

```typescript
const decay = tickChargeDecay(chargedCells, chainDepth, chainTimer, dtMs)
chargedCells = decay.chargedCells
chainDepth = decay.chainDepth
chainTimer = decay.chainTimer
if (decay.emitChainReset) {
  events.push({ type: 'chain-reset' })
}
```

Apply this to ALL return paths in the `'playing'` phase handler — including the spawn path after lock, the game-over path, and the no-lock bottom path.

### State spread additions

Every `{ ...state, board, ... }` spread object must include:

```typescript
chargedCells,
chainDepth,
chainTimer,
```

There are currently 4 return sites in the playing phase. Each must be updated.

---

## File 4: `src/renderer/boardRenderer.ts` — charged-cell overlay pass

### New field declarations (add alongside existing fields):

```typescript
private chargedOverlayGraphics: Graphics[]
private lastChargedCells: ReadonlySet<number> = new Set()
```

### Constructor additions (after existing `cellGraphics` loop):

```typescript
this.chargedOverlayGraphics = []
for (let i = 0; i < BOARD_ROWS * BOARD_COLS; i++) {
  const g = new Graphics()
  g.visible = false
  this.container.addChild(g)
  this.chargedOverlayGraphics.push(g)
}
```

### `resize()` additions:

```typescript
for (const g of this.chargedOverlayGraphics) {
  g.visible = false
}
this.lastChargedCells = new Set()
```

### New private method `updateChargedOverlays(state: GameState, now: number): void`:

```typescript
private updateChargedOverlays(state: GameState, now: number): void {
  if (this.cellSize === 0) return
  const pulse = 0.4 + 0.4 * Math.sin(now * 0.006)

  for (const idx of state.chargedCells) {
    if (idx < 0 || idx >= BOARD_ROWS * BOARD_COLS) continue
    const g = this.chargedOverlayGraphics[idx]
    if (!g) continue
    const row = Math.floor(idx / BOARD_COLS)
    const col = idx % BOARD_COLS
    g.clear()
    g.roundRect(
      col * this.cellSize + 1,
      row * this.cellSize + 1,
      this.cellSize - 2,
      this.cellSize - 2,
      CELL_RADIUS    // re-use the existing constant
    )
    g.fill({ color: 0xffffff, alpha: pulse })
    g.visible = true
  }

  for (const idx of this.lastChargedCells) {
    if (!state.chargedCells.has(idx)) {
      const g = this.chargedOverlayGraphics[idx]
      if (g) {
        g.visible = false
        g.clear()
      }
    }
  }

  this.lastChargedCells = state.chargedCells
}
```

### `update(state: GameState)` — add at the end:

```typescript
this.updateChargedOverlays(state, performance.now())
```

**Note on `CELL_RADIUS`:** The constant is currently `const CELL_RADIUS = 2` at module scope. It is already in scope for the new method — no re-declaration needed.

**Note on `GameState` import:** `BoardRenderer.update` already receives `GameState`. The `chargedCells` field access requires no new import since `GameState` is imported from `../engine/gameState.js`.

---

## File 5: `src/renderer/postProcess.ts` — expose `PostProcessController`

### Add before `attachPostProcess`:

```typescript
export interface PostProcessController {
  setChainDepth(depth: number): void
}
```

### Change function signature:

```typescript
export function attachPostProcess(
  boardContainer: Container,
  pieceContainer: Container,
  app: Application
): PostProcessController
```

### Canvas path return (replace `return`):

```typescript
return { setChainDepth: (_depth: number) => {} }
```

### WebGL path — capture filter references:

```typescript
const boardGlow = new GlowFilter({ distance: 8, outerStrength: 1.5, color: 0xffffff })
const pieceBloom = new BloomFilter(1.2)

boardContainer.filters = [boardGlow as unknown as Filter]
pieceContainer.filters = [
  new GlowFilter({ distance: 12, outerStrength: 2, color: 0xffffff }) as unknown as Filter,
  pieceBloom as unknown as Filter,
]

return {
  setChainDepth(depth: number): void {
    try {
      const d = Math.min(Math.max(depth, 0), 3)
      const strengthTable = [1.5, 2.5, 4.0, 6.0] as const
      const bloomTable    = [1.2, 2.0, 3.5, 5.0] as const
      boardGlow.outerStrength = strengthTable[d] ?? 1.5
      // BloomFilter.blur exists at runtime; TypeScript cast required.
      ;(pieceBloom as unknown as { blur: number }).blur = bloomTable[d] ?? 1.2
    } catch {
      // Filter property mutations failing should not crash the game
    }
  }
}
```

**Why a separate `boardGlow` variable:** The existing code creates the GlowFilter inline inside the array literal, making it inaccessible afterward. Capturing it in a `const` before assignment is the minimal change needed.

---

## File 6: `src/renderer/effects.ts` — chain event handlers

### New field:

```typescript
private currentChainDepth = 0
```

### In `onEvents(events: GameEvent[])` — add after the existing `line-clear` handler:

```typescript
if (event.type === 'chain-explosion') {
  const payload = event.payload as {
    affectedArea: ReadonlyArray<[number, number]>
    depth: number
  } | undefined
  if (payload) {
    this.currentChainDepth = payload.depth
    this.triggerExplosionEffect(payload.affectedArea, payload.depth)
  }
}

if (event.type === 'chain-reset') {
  this.currentChainDepth = 0
}
```

### New private method `triggerExplosionEffect`:

```typescript
private triggerExplosionEffect(
  area: ReadonlyArray<[number, number]>,
  depth: number
): void {
  const chainColor =
    depth <= 1 ? 0x88ccff
    : depth === 2 ? 0xffcc44
    : 0xff4400

  const rowsAffected = new Set<number>()

  for (const [row, col] of area) {
    rowsAffected.add(row)
    const cx = (col + 0.5) * this.cellSize
    const cy = (row + 0.5) * this.cellSize
    let activated = 0

    for (const particle of this.particlePool) {
      if (activated >= 5) break
      if (particle.sprite.visible) continue

      particle.sprite.visible = true
      particle.sprite.alpha = 1
      particle.sprite.x = cx + (Math.random() - 0.5) * this.cellSize
      particle.sprite.y = cy + (Math.random() - 0.5) * this.cellSize
      particle.sprite.scale.set(Math.random() * 0.8 + 0.4)
      particle.sprite.tint = chainColor

      particle.vx = (Math.random() - 0.5) * depth * 4
      particle.vy = -(Math.random() * 2 + 1) * depth
      particle.life = PARTICLE_DURATION_MS
      particle.maxLife = PARTICLE_DURATION_MS

      activated++
    }
  }

  // Flash affected rows
  for (const row of rowsAffected) {
    this.triggerFlash(row)
  }
}
```

**Tint cleanup:** When a particle returns to the pool (made invisible), its `tint` should be reset to `0xffffff` so it does not carry chain color into future uses. Add to the `particle.life <= 0` branch in `tick()`:

```typescript
particle.sprite.tint = 0xffffff
particle.sprite.visible = false
```

---

## File 7: `src/main.ts` — wire `PostProcessController`, chain shake

### Import addition:

```typescript
import type { PostProcessController } from './renderer/postProcess.js'
```

### Change `attachPostProcess` call (currently line ~76):

```typescript
// Before:
attachPostProcess(boardContainer, pieceContainer, app)

// After:
const postProcessController: PostProcessController = attachPostProcess(boardContainer, pieceContainer, app)
```

### Add `triggerChainShake` function (alongside existing helper functions in `main()`):

```typescript
function triggerChainShake(depth: number): void {
  const magnitude = Math.min(depth * 3, 10)
  if (magnitude === 0) return

  const SHAKE_DURATION_MS = 200
  const startTime = performance.now()

  function shakeFrame(): void {
    const elapsed = performance.now() - startTime
    if (elapsed >= SHAKE_DURATION_MS) {
      app.stage.x = 0
      app.stage.y = 0
      return
    }
    const progress = elapsed / SHAKE_DURATION_MS
    const decay = 1 - progress
    app.stage.x = (Math.random() - 0.5) * 2 * magnitude * decay
    app.stage.y = (Math.random() - 0.5) * 2 * magnitude * decay
    requestAnimationFrame(shakeFrame)
  }

  requestAnimationFrame(shakeFrame)
}
```

### In the game loop, after `effectsRenderer.onEvents(result.events)`:

```typescript
for (const event of result.events) {
  if (event.type === 'chain-explosion') {
    const payload = event.payload as { depth: number } | undefined
    if (payload) {
      postProcessController.setChainDepth(payload.depth)
      triggerChainShake(payload.depth)
    }
  }
  if (event.type === 'chain-reset') {
    postProcessController.setChainDepth(0)
  }
}
```

**Note:** The `audioManager.onEvents(result.events)` call can remain adjacent. The chain event loop above is a separate iteration, which is fine at this event frequency.

---

## File 8: `src/ui/hud.ts` — chain multiplier display

### New import:

```typescript
import { chainMultiplier } from '../engine/chainBlast.js'
```

### New fields:

```typescript
private chainLabel: Text
private chainValue: Text
private lastChainDepth = -1
```

### In `constructor`, after `linesValue` instantiation:

```typescript
const chainLabelStyle = new TextStyle({ fill: LABEL_COLOR, fontSize: 12, fontFamily: 'monospace' })
const chainValueStyle = new TextStyle({ fill: 0xffcc44, fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold' })

this.chainLabel = new Text({ text: 'CHAIN', style: chainLabelStyle })
this.chainValue = new Text({ text: 'x1', style: chainValueStyle })
this.chainLabel.visible = false
this.chainValue.visible = false

this.container.addChild(this.chainLabel)
this.container.addChild(this.chainValue)
```

### In `layoutElements()`, after the `linesValue` positioning block:

```typescript
this.chainLabel.x = pad
this.chainLabel.y = y
y += 18
this.chainValue.x = pad
this.chainValue.y = y
y += 28
```

Also extend the panel height: change `this.panel.roundRect(0, 0, HUD_PANEL_WIDTH, 320, 8)` to `this.panel.roundRect(0, 0, HUD_PANEL_WIDTH, 370, 8)`.

### In `update(state: GameState)`:

```typescript
if (state.chainDepth !== this.lastChainDepth) {
  const isActive = state.chainDepth >= 1
  this.chainLabel.visible = isActive
  this.chainValue.visible = isActive
  if (isActive) {
    const mult = chainMultiplier(state.chainDepth)
    this.chainValue.text = `x${mult}`
  }
  this.lastChainDepth = state.chainDepth
}
```

---

## File 9: `src/__tests__/engine/chainBlast.test.ts` — NEW test file

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  chainMultiplier,
  generateChargedCells,
  resolveExplosions,
  tickChargeDecay,
  CHARGE_LIFETIME_MS,
  CHAIN_RESET_MS,
} from '../../engine/chainBlast.js'
import { emptyBoard, setCell, BOARD_COLS } from '../../engine/board.js'
```

See `tasks.md` Task 7 for the full test case specification. Key invariants to assert:

- `resolveExplosions` with an empty `chargedCells` returns the same board reference unchanged (no unnecessary clone).
- `resolveExplosions` with center at `(0, 0)` (corner): only the 2×2 valid quadrant is zeroed; no exception thrown.
- `tickChargeDecay` with `dtMs` that crosses both `CHARGE_LIFETIME_MS` and `CHAIN_RESET_MS` in a single tick: both expirations apply (`chargedCells` empty AND `emitChainReset = true`).

---

## Data flow summary

```
[user input]
     │
     ▼
[updateGameState tick]
     │
     ├── processLock()
     │     ├── clearRows (base)
     │     ├── generateChargedCells → new chargedCells indices
     │     ├── resolveExplosions → affectedArea, bonusRows, newChargedCells
     │     ├── scoreForLines × chainMultiplier
     │     └── emits: piece-lock, line-clear, cell-charged, chain-explosion
     │
     ├── tickChargeDecay (every tick)
     │     └── emits: chain-reset (when timer expires)
     │
     └── returns { state: GameState, events: GameEvent[] }

[main.ts game loop]
     ├── effectsRenderer.onEvents(events)
     │     ├── 'chain-explosion' → triggerExplosionEffect(affectedArea, depth)
     │     └── 'chain-reset'    → currentChainDepth = 0
     │
     ├── for chain-explosion event:
     │     ├── postProcessController.setChainDepth(depth) → bloom/glow update
     │     └── triggerChainShake(depth) → app.stage translate
     │
     ├── boardRenderer.update(renderState)
     │     └── updateChargedOverlays(state, now) → pulsing white overlay per charged cell
     │
     └── hud.update(renderState)
           └── chainMultiplier display if chainDepth >= 1
```

---

## Invariants to preserve

1. **Engine purity:** `src/engine/chainBlast.ts` imports nothing outside `engine/`. No `Math.random` usage is prohibited — it follows the `shuffleBag` precedent in `gameState.ts`.

2. **Immutability:** Every engine function returns a new object or array. `chargedCells` is a `ReadonlySet<number>` at the `GameState` boundary; internal mutations use plain `new Set()` and only escape as `ReadonlySet` in return values.

3. **Board value range:** Cell values after explosion are 0 (zeroed) or existing values (untouched). No new color indices are introduced.

4. **`prefer-const`:** Every local variable that is never reassigned must use `const`. Mutable loop accumulators use `let`.

5. **No non-null assertions in engine code:** Use conditional guards (`if (!g) continue`) instead of `g!`.

6. **Existing tests unchanged:** `scoreForLines()` is not modified. Its callers in `updateGameState` are extended with a multiplier, but that is additive — existing test scenarios that never trigger a chain will observe `chainMultiplier(0) === 1` and get the same score.

7. **Pause/resume:** `GameState` is held in memory; `chargedCells`, `chainDepth`, and `chainTimer` survive pause because `updateGameState` returns early (`return { state, events }`) when `phase === 'paused'` — the state is frozen in place.

8. **`coverage/` in ESLint ignore:** Already in `.eslintrc.cjs` `ignorePatterns` — no change required.

9. **Vite chunk size:** PixiJS bundle size warning is expected and not a CI failure — no new dependencies are added by this feature.

---

## Common pitfalls

- **Row numbering across `clearRows`:** `clearRows` renumbers rows (empty rows prepended). Charge generation uses `clearedRow - 1` computed in **pre-collapse** space. The board passed to `generateChargedCells` is the **post-collapse** board, but the row index passed is the pre-collapse cleared-row index minus one. This is correct because we want to charge the cells that were immediately above the cleared row before it disappeared — those cells are now at `clearedRow - 1` in the pre-collapse numbering, and after collapse they have shifted up by the number of rows cleared below them. For simplicity and correctness: compute `aboveRow = clearedRow - 1` before `clearRows` is called (or equivalently, use the pre-collapse coordinate directly since `generateChargedCells` only reads the row index to build flat indices).

- **Detonator identification:** Detonators are charged cells whose **row** appears in `triggeredRows`. Identify them BEFORE calling `clearRows`, using the pre-collapse row numbers. The explosion then operates on the board that has already had `clearRows` applied — this is intentional. The detonator's column is unaffected by row collapse.

- **Multiplier ordering:** The base line-clear score uses `chainMultiplier(chainDepth)` at the depth **before** any explosion increments it. The explosion bonus score uses `chainMultiplier(chainDepth)` after `chainDepth += 1`. This means the base clear at the start of a chain gets the 1× rate, and the first chain link's bonus gets the 1.5× rate — which matches the spec's intent of "the explosion triggers the multiplier for subsequent scoring."

- **Particle tint reset:** The `particlePool` is a fixed-size pre-allocated pool. If a particle's `tint` is set during chain explosion effects and never reset, subsequent line-clear particles will inherit the chain color. Always reset `sprite.tint = 0xffffff` when a particle's life expires.

- **`app.stage` shake and layout:** `triggerChainShake` translates `app.stage.x/y`. The existing `handleResize` does not touch `app.stage.position`. Shake must restore `x = 0, y = 0` when it completes to avoid a permanent offset. The `shakeFrame` callback does this on `elapsed >= SHAKE_DURATION_MS`.
