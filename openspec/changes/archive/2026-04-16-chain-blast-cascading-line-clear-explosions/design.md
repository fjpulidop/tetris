# Design: Chain Blast — Cascading Line-Clear Explosions

## Overview

Chain Blast extends the engine's line-clear pipeline with three cooperating subsystems: **charge generation**, **explosion resolution**, and **chain multiplier decay**. All three are pure functions in a new engine module (`chainBlast.ts`). The renderer layer subscribes to new `GameEvent` types to escalate visual feedback without any knowledge of game-state internals.

---

## 1. New State Fields in `GameState`

```typescript
// src/engine/gameState.ts — GameState interface additions
chargedCells: ReadonlySet<number>  // flat board indices (row * BOARD_COLS + col)
chainDepth: number                 // 0 = no active chain, 1+ = chain link count
chainTimer: number                 // ms since last chain event; resets are also tracked here
```

**Why `ReadonlySet<number>` over a flat array or a second `Uint8Array`?**

Flat-index lookup is O(1) with a Set. A second `Uint8Array` would require the renderer to iterate 200 cells per frame to discover which are charged — the Set exposes that list directly. `ReadonlySet` communicates the immutability contract to consumers without requiring a deep-freeze operation.

**Charge timer:** Rather than storing per-cell expiry times, a single `chargedCells` Set is sufficient because all cells charged by one line-clear event share the same expiry horizon. The `chainTimer` field is repurposed as the single decay clock: when charged cells exist and no new explosion fires, `chainTimer` counts up; cells are expired when `chainTimer >= CHARGE_LIFETIME_MS (1500)`.

**Chain reset timer:** The same `chainTimer` field doubles as the chain-reset watchdog. After the last explosion, `chainTimer` ticks up. If it reaches `CHAIN_RESET_MS (2000)` with no new chain event, `chainDepth` resets to 0.

**Serialization:** `ReadonlySet<number>` is natively JSON-serializable via `Array.from()` and is reconstructed with `new Set(array)`. This preserves charged-cell state across pause/resume because `GameState` is held in memory (not localStorage), so no explicit serialization step is needed.

---

## 2. New Event Types in `GameEventType`

```typescript
// src/engine/types.ts — additions to GameEventType union
export type GameEventType =
  | 'line-clear'
  | 'piece-lock'
  | 'level-up'
  | 'game-over'
  | 'cell-charged'       // NEW: one or more cells became charged
  | 'chain-explosion'    // NEW: explosion resolved; carries depth and affected area
  | 'chain-reset'        // NEW: chain depth reset to 0 after timeout
```

### Event payloads

```typescript
// 'cell-charged'
{ chargedIndices: number[] }  // flat board indices of newly charged cells

// 'chain-explosion'
{
  centerRow: number
  centerCol: number
  depth: number           // chain depth at the moment of explosion (1-based)
  affectedArea: [number, number][]  // [row, col] pairs that were destroyed
  bonusRows: number[]     // any full rows formed by the explosion (for scoring)
}

// 'chain-reset'
{}  // no payload; depth was > 0 and timed out
```

---

## 3. New Engine Module: `src/engine/chainBlast.ts`

This module is **entirely pure**. It has no imports outside `engine/` and no side effects.

### 3.1 Constants

```typescript
const CHARGE_PROBABILITY = 0.2          // 20% per cleared cell
const CHARGE_LIFETIME_MS = 1500         // charged cell lives 1.5 s
const CHAIN_RESET_MS = 2000             // multiplier resets after 2 s of inactivity
const EXPLOSION_HALF = 1               // 3x3 = center ± 1 in each axis
```

### 3.2 `generateChargedCells`

```typescript
export function generateChargedCells(
  clearedRows: number[],
  board: Board,                  // board AFTER clearRows() has run
  existingCharged: ReadonlySet<number>
): number[]
```

For each `clearedRow` in `clearedRows`, examine the row **directly above** (`clearedRow - 1` in pre-clear coordinates). After `clearRows()` shifts rows downward, the row above the cleared row in the new board corresponds to `clearedRow - 1` mapped through the row-collapse. Rather than tracking the post-collapse index, we compute the charge candidates from the **pre-clear** board: iterate columns 0–9 for `row = clearedRow - 1`, roll `Math.random() < 0.2` per column, emit flat index `(clearedRow - 1) * BOARD_COLS + col` (bounded check: `clearedRow - 1 >= 0`).

**Edge case — row 0 cleared:** No row exists above it; skip silently.

**Returns** a `number[]` of new charged-cell flat indices (caller merges with existing set).

### 3.3 `resolveExplosions`

```typescript
export interface ExplosionResult {
  board: Board
  newChargedCells: ReadonlySet<number>
  bonusRows: number[]
  affectedArea: [number, number][]
}

export function resolveExplosions(
  board: Board,
  chargedCells: ReadonlySet<number>,
  triggeredRows: number[]          // rows that were just cleared (pre-collapse indices)
): ExplosionResult
```

**Algorithm (O(n) on 10×20 board):**

1. Identify which charged cells are in the set of `triggeredRows` (i.e., their row coordinate matches any cleared row). These are the detonators.
2. For each detonator at `(dr, dc)`:
   a. Compute the 3×3 footprint: all `(dr + dr2, dc + dc2)` for `dr2, dc2 ∈ {-1, 0, +1}`.
   b. Clip to board bounds (`0 ≤ row < BOARD_ROWS`, `0 ≤ col < BOARD_COLS`).
   c. Zero out those cells on a mutable copy of the board.
   d. Record affected `[row, col]` pairs.
3. After zeroing all explosion areas, call `detectFullRows` on the resulting board. Any full rows found are the `bonusRows`.
4. Call `clearRows` to collapse the bonus rows; update the board.
5. For each bonus row cleared, call `generateChargedCells` on that mini-clear (recursion depth is bounded; max chain is 3×3 = 9 cells → max 9 new charges → practically never cascades beyond 2–3 links in a real game).
6. Return `{ board, newChargedCells, bonusRows, affectedArea }`.

**Bounding argument:** The board is 10×20 = 200 cells. Each step zeros at most 9 cells; detecting full rows is 200 iterations; clearing is 200 iterations. This is O(1) in practice.

**Mutability discipline:** Internally use a `let board = inputBoard.slice()` copy; never mutate the input. Each intermediate result is a new `Uint8Array`.

### 3.4 `tickChargeDecay`

```typescript
export interface DecayResult {
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  emitChainReset: boolean
}

export function tickChargeDecay(
  chargedCells: ReadonlySet<number>,
  chainDepth: number,
  chainTimer: number,
  dtMs: number
): DecayResult
```

Called every tick while `chargedCells.size > 0` or `chainDepth > 0`.

- Increment `chainTimer += dtMs`.
- If `chainTimer >= CHARGE_LIFETIME_MS` and `chargedCells.size > 0`: expire all charged cells (return empty set).
- If `chainTimer >= CHAIN_RESET_MS` and `chainDepth > 0`: emit `chain-reset`, reset depth to 0.
- Both expirations can fire in the same tick (timer shared); handle both branches independently so neither suppresses the other.

### 3.5 `chainMultiplier`

```typescript
export function chainMultiplier(depth: number): number {
  if (depth <= 0) return 1
  if (depth === 1) return 1.5
  if (depth === 2) return 2
  return 3  // cap at depth 3+
}
```

---

## 4. Integration into `updateGameState`

The line-lock pipeline in `gameState.ts` runs twice (once for gravity-lock, once for hard-drop). The chain logic is inserted **after** `clearRows()` and **before** spawning the next piece, in both branches. The integration is identical in both branches and can be extracted to a private helper `processLineClearWithChain()`.

### Modified lock pipeline (pseudocode):

```
board = lockPieceOntoBoard(board, piece)
emit piece-lock

fullRows = detectFullRows(board)
if fullRows.length > 0:
  // 1. Check for charged-cell detonations BEFORE clearing
  const { detonators } = findDetonatorsInRows(chargedCells, fullRows)

  // 2. Clear the base rows
  board = clearRows(board, fullRows)
  score += scoreForLines(fullRows.length, level) * chainMultiplier(chainDepth)
  lines += fullRows.length
  emit line-clear { count, rows: fullRows }

  // 3. Generate new charged cells from the cleared rows
  const newCharged = generateChargedCells(fullRows, board, chargedCells)

  // 4. If detonators exist, resolve explosions
  if detonators.length > 0:
    chainDepth += 1
    chainTimer = 0
    const result = resolveExplosions(board, chargedCells, fullRows)
    board = result.board
    score += scoreForLines(result.bonusRows.length, level) * chainMultiplier(chainDepth)
    lines += result.bonusRows.length
    chargedCells = new Set([...newCharged, ...result.newChargedCells])
    emit chain-explosion { centerRow, centerCol, depth: chainDepth, affectedArea, bonusRows }
    if result.bonusRows.length > 0: emit line-clear { count: result.bonusRows.length, rows: result.bonusRows }
  else:
    chargedCells = new Set([...existingCharged, ...newCharged])
    chainTimer = 0  // reset decay clock whenever a new clear happens

  if newly charged cells exist: emit cell-charged { chargedIndices: newCharged }
  check level-up

// 5. Tick charge decay each tick (even when no lock event)
const decayResult = tickChargeDecay(chargedCells, chainDepth, chainTimer, dtMs)
chargedCells = decayResult.chargedCells
chainDepth = decayResult.chainDepth
chainTimer = decayResult.chainTimer
if decayResult.emitChainReset: emit chain-reset {}
```

**Ordering rationale:** Detonators are identified against `fullRows` before `clearRows()` runs, because `clearRows()` renumbers rows. The flat-index arithmetic uses the pre-collapse row number consistently.

---

## 5. Renderer Changes

### 5.1 `boardRenderer.ts` — Charged-cell visual pass

`BoardRenderer.update(state)` receives `GameState`. After the normal cell-draw loop, add a second pass that draws a pulsing glow overlay for each charged cell:

```typescript
// After the normal cell loop:
const now = performance.now()
for (const idx of state.chargedCells) {
  const row = Math.floor(idx / BOARD_COLS)
  const col = idx % BOARD_COLS
  const g = this.chargedOverlayGraphics[idx]  // pre-allocated overlay pool
  if (!g) continue
  const pulse = 0.4 + 0.4 * Math.sin(now * 0.006)  // 0.4–0.8 alpha oscillation, ~1 Hz
  const x = col * this.cellSize
  const y = row * this.cellSize
  g.clear()
  g.roundRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2, CELL_RADIUS)
  g.fill({ color: 0xffffff, alpha: pulse })
  g.visible = true
}
// Hide overlays not in chargedCells
```

Pre-allocate 200 `Graphics` objects in `constructor` alongside `cellGraphics` (same pattern). Track `lastChargedCells: ReadonlySet<number>` for change detection. Only update overlays whose membership changed or on every frame for the pulse animation (pulse requires frame-by-frame redraw of the fill alpha; this is intentional and cheap at 200 rects max).

**Separation of concerns:** `boardRenderer` draws cell states including charge overlays from `GameState`. It does not know about explosion geometry — that is an `EffectsRenderer` concern.

### 5.2 `effects.ts` — Chain event handling

Add handlers in `onEvents()`:

```typescript
case 'cell-charged':
  // No particle effect needed — board overlay handles the charge glow.
  // Reserved for future audio hook.
  break

case 'chain-explosion':
  const { affectedArea, depth } = payload
  this.triggerExplosionEffect(affectedArea, depth)
  break

case 'chain-reset':
  // Reset internal depth tracker used for color-temperature calculation
  this.currentChainDepth = 0
  break
```

`triggerExplosionEffect(area, depth)`:
- For each `[row, col]` in `affectedArea`, spawn 5 particles from `particlePool` at that cell center.
- Particle color shifts with depth: depth 1 = cool blue-white (`0x88ccff`), depth 2 = warm yellow (`0xffcc44`), depth 3+ = hot orange-red (`0xff4400`).
- Particle velocity magnitude scales: `depth * 2` pixels per frame.
- Flash effect: same `triggerFlash()` mechanism but tinted with the chain color.

**New field:** `private currentChainDepth = 0` — updated on `chain-explosion` and reset on `chain-reset`. Used by the post-process controller.

### 5.3 `postProcess.ts` — Mutable bloom intensity

Currently `attachPostProcess()` returns `void`. Change it to return a `PostProcessController`:

```typescript
export interface PostProcessController {
  setChainDepth(depth: number): void
}

export function attachPostProcess(
  boardContainer: Container,
  pieceContainer: Container,
  app: Application
): PostProcessController
```

`setChainDepth(depth)` adjusts `BloomFilter.blur` and `GlowFilter.outerStrength` on the board container:

| depth | bloom blur | glow outerStrength |
|-------|-----------|-------------------|
| 0     | 1.2       | 1.5               |
| 1     | 2.0       | 2.5               |
| 2     | 3.5       | 4.0               |
| 3+    | 5.0       | 6.0               |

On Canvas renderer, return a **Null Object** controller: `{ setChainDepth: () => {} }`. This avoids null checks at every call site in `main.ts`.

**References:** The existing explanation record at `.claude/agent-memory/explanations/2026-04-16-architect-postprocess-controller-return-value.md` already documents the Null Object pattern for this file — this change extends that pattern consistently.

### 5.4 Screen shake in `main.ts`

`main.ts` already owns shake because shake translates `app.stage`. Add `chainShakeMagnitude` scaling:

```typescript
function triggerChainShake(depth: number): void {
  const magnitude = depth === 0 ? 0 : Math.min(depth * 3, 10)  // 3px, 6px, 9px (cap 10px)
  // same shake loop pattern as existing implementation
}
```

Invoke from the `chain-explosion` event branch in the event-handling section of the game loop.

---

## 6. HUD — Chain Multiplier Display

Add a new text element to `HUD` that shows the active chain multiplier when `state.chainDepth >= 1`:

```
CHAIN
×1.5
```

The element is hidden (`visible = false`) when `chainDepth === 0`. It is positioned below the LINES display in the existing panel. The panel height may need to grow from `320` to `360` px.

`HUD.update(state)` reads `state.chainDepth` and computes `chainMultiplier(depth)` by importing the pure function from `engine/chainBlast.ts`. This is permissible because `ui/` is allowed to import from `engine/` (it currently does so for `GameState` and `PieceType`).

---

## 7. Scoring Integration

The existing `scoreForLines()` function is unchanged. The multiplier is applied at the call site in `updateGameState()`:

```typescript
const points = scoreForLines(clearedCount, level)
score += Math.round(points * chainMultiplier(chainDepth))
```

`Math.round()` ensures the score is always an integer (1.5× of 100 = 150, which is exact; for non-trivial cases rounding avoids fractional display).

The bonus-row score from an explosion is calculated independently at the current chain depth after incrementing:

```typescript
// chainDepth already incremented to reflect the new link
const bonusPoints = scoreForLines(bonusRows.length, level)
score += Math.round(bonusPoints * chainMultiplier(chainDepth))
```

---

## 8. Cascade Termination

A cascade can only continue if an explosion produces bonus rows AND those rows contain charged cells from a prior explosion. The practical maximum chain in a 10×20 board is bounded by piece geometry — lines cannot fill faster than pieces lock. The engine will naturally terminate cascades when `resolveExplosions` returns `bonusRows: []` or `newChargedCells` has no overlap with subsequent clears. No artificial depth cap is imposed in the engine; the visual/scoring cap at depth 3+ is purely multiplicative.

---

## 9. Data Flow Diagram

```
                    [updateGameState tick]
                           |
                    ┌──────▼────────┐
                    │  lock piece   │
                    │  detect rows  │
                    └──────┬────────┘
                           │ fullRows found
               ┌───────────▼────────────┐
               │ findDetonators in rows │
               │ clearRows (base)       │
               │ scoreForLines × mult   │
               │ generateChargedCells   │
               └───────────┬────────────┘
                           │ detonators?
              NO ◄──────── ├ ──────────► YES
              │            │              │
      merge chargedCells   │        chainDepth++
      emit cell-charged    │        resolveExplosions
                           │        score bonus rows
                           │        emit chain-explosion
                           │        recurse charged gen
                    ┌──────▼──────┐
                    │ tickDecay   │
                    │ each tick   │
                    └─────────────┘
                           │
                    ┌──────▼──────────────────────────────┐
                    │  GameEvent stream to main.ts        │
                    │  → effectsRenderer.onEvents()       │
                    │  → postProcessController.setChain() │
                    │  → triggerChainShake()              │
                    └─────────────────────────────────────┘
```

---

## 10. Invariants to Preserve

1. `GameState` is always a value type — all fields are replaced, never mutated in place.
2. `chargedCells` is a `ReadonlySet` at the `GameState` boundary; internal engine functions construct plain `Set` and freeze on return.
3. Board cell values remain in the range 0–7 after explosions (zeroing out cells is safe; values in the destroyed area that were already 0 stay 0).
4. `scoreForLines()` signature is unchanged; existing tests continue to call it with the same arguments.
5. The `detectFullRows` + `clearRows` pair is reused, not duplicated, for bonus rows from explosions.
6. All `Math.random()` calls in `generateChargedCells` remain inside `src/engine/chainBlast.ts` — the engine is deterministic except for the intentional randomness in charge generation (same as the existing `shuffleBag` precedent).
7. `BOARD_COLS` and `BOARD_ROWS` are always imported from `engine/board.ts`; never hardcoded.
