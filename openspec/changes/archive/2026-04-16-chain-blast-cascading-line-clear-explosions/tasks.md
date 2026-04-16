# Tasks: chain-blast-cascading-line-clear-explosions

Tasks are ordered by dependency. Each must pass `npm run lint` and `npm run build` before the next begins. The full test suite (`npm test`) must remain green throughout.

---

## Task 1: [engine] Add chain-blast event types to `types.ts`

**Files:**
- Modify: `src/engine/types.ts`

**Steps:**
1. Extend the `GameEventType` union with three new string literals:
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
2. No other changes to this file.

**Acceptance criteria (AC):**
- AC 7: engine boundary preserved — no new imports.
- `npm run build` passes with no TypeScript errors.
- Existing tests still compile and pass (`npm test` green).

---

## Task 2: [engine] Create `src/engine/chainBlast.ts` — pure chain logic module

**Files:**
- Create: `src/engine/chainBlast.ts`

**Steps:**

1. Imports (engine-only):
   ```typescript
   import { BOARD_COLS, BOARD_ROWS } from './board.js'
   import type { Board } from './board.js'
   import { detectFullRows, clearRows } from './lineClear.js'
   ```

2. Constants:
   ```typescript
   export const CHARGE_PROBABILITY = 0.2
   export const CHARGE_LIFETIME_MS = 1500
   export const CHAIN_RESET_MS = 2000
   ```

3. Implement `chainMultiplier(depth: number): number`:
   - Returns `1` when `depth <= 0`, `1.5` when `depth === 1`, `2` when `depth === 2`, `3` otherwise (cap).

4. Implement `generateChargedCells(clearedRows: number[], board: Board, existingCharged: ReadonlySet<number>): number[]`:
   - For each row index in `clearedRows`:
     - Compute `aboveRow = clearedRow - 1`.
     - If `aboveRow < 0`, skip.
     - For each `col` 0–9: if `Math.random() < CHARGE_PROBABILITY`, add `aboveRow * BOARD_COLS + col` to result array.
   - Do not add indices that are already in `existingCharged`.
   - Return the array of new charged-cell flat indices.
   - Use `const` for all variables that are not reassigned (ESLint `prefer-const`).

5. Export the `ExplosionResult` interface:
   ```typescript
   export interface ExplosionResult {
     board: Board
     newChargedCells: ReadonlySet<number>
     bonusRows: number[]
     affectedArea: ReadonlyArray<[number, number]>
   }
   ```

6. Implement `resolveExplosions(board: Board, chargedCells: ReadonlySet<number>, triggeredRows: number[]): ExplosionResult`:
   - Identify detonators: charged-cell indices whose row coordinate (`Math.floor(idx / BOARD_COLS)`) is in `triggeredRows`.
   - If no detonators, return `{ board, newChargedCells: new Set(), bonusRows: [], affectedArea: [] }` without cloning the board unnecessarily (return `board` unchanged).
   - Build a working board copy: `let workBoard = board.slice() as Board`.
   - For each detonator at `(dr, dc)`:
     - For `dr2` in `[-1, 0, 1]`, `dc2` in `[-1, 0, 1]`:
       - `const r = dr + dr2`, `const c = dc + dc2`.
       - Skip if `r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS`.
       - `workBoard[r * BOARD_COLS + c] = 0`.
       - Record `[r, c]` in `affectedArea`.
   - Deduplicate `affectedArea` (same `[r, c]` may appear from overlapping 3×3 zones).
   - `const bonusRows = detectFullRows(workBoard)`.
   - If `bonusRows.length > 0`: `workBoard = clearRows(workBoard, bonusRows)`.
   - `const newChargedFlat = generateChargedCells(bonusRows, workBoard, chargedCells)`.
   - Return `{ board: workBoard, newChargedCells: new Set(newChargedFlat), bonusRows, affectedArea }`.
   - Do NOT use non-null assertions (`!`); use conditional guards.

7. Export the `DecayResult` interface:
   ```typescript
   export interface DecayResult {
     chargedCells: ReadonlySet<number>
     chainDepth: number
     chainTimer: number
     emitChainReset: boolean
   }
   ```

8. Implement `tickChargeDecay(chargedCells: ReadonlySet<number>, chainDepth: number, chainTimer: number, dtMs: number): DecayResult`:
   - `const nextTimer = chainTimer + dtMs`.
   - `let nextCharged = chargedCells`.
   - `let nextDepth = chainDepth`.
   - `let emitChainReset = false`.
   - If `nextTimer >= CHARGE_LIFETIME_MS` and `chargedCells.size > 0`: `nextCharged = new Set()`.
   - If `nextTimer >= CHAIN_RESET_MS` and `chainDepth > 0`: `nextDepth = 0`, `emitChainReset = true`.
   - Return `{ chargedCells: nextCharged, chainDepth: nextDepth, chainTimer: nextTimer, emitChainReset }`.

**Acceptance criteria (AC):**
- AC 7: zero imports from `renderer/`, `input/`, or `ui/`.
- `npm run build` and `npm run lint` pass.
- (Tests added in Task 7.)

---

## Task 3: [engine] Extend `GameState` and wire chain logic into `updateGameState`

**Files:**
- Modify: `src/engine/gameState.ts`

**Steps:**

1. Import from `chainBlast.ts`:
   ```typescript
   import {
     chainMultiplier,
     generateChargedCells,
     resolveExplosions,
     tickChargeDecay,
     CHAIN_RESET_MS,
   } from './chainBlast.js'
   ```

2. Add fields to the `GameState` interface:
   ```typescript
   chargedCells: ReadonlySet<number>
   chainDepth: number
   chainTimer: number
   ```

3. Initialize new fields in `createGameState()`:
   ```typescript
   chargedCells: new Set<number>(),
   chainDepth: 0,
   chainTimer: 0,
   ```

4. Extract the repeated lock-and-clear pipeline into a private helper function `processLock(...)` to avoid duplicating the chain logic. The helper takes the current mutable working variables (board, score, lines, level, chargedCells, chainDepth, chainTimer) and returns updated values plus events. The hard-drop branch and the gravity-lock branch both call this helper.

5. Inside the lock pipeline (both hard-drop and gravity-lock branches), after `clearRows`:
   a. Call `generateChargedCells(fullRows, board, chargedCells)` to get `newChargedFlat`.
   b. Identify detonators using `resolveExplosions`: if `chargedCells.size > 0`, call `resolveExplosions(board, chargedCells, fullRows)`.
   c. If `explosionResult.bonusRows.length > 0` or `explosionResult.affectedArea.length > 0`:
      - `chainDepth += 1`, `chainTimer = 0`.
      - Apply explosion board changes.
      - Score bonus rows: `score += Math.round(scoreForLines(explosionResult.bonusRows.length, level) * chainMultiplier(chainDepth))`.
      - `lines += explosionResult.bonusRows.length`.
      - Push `chain-explosion` event with payload.
      - If `explosionResult.bonusRows.length > 0`: push `line-clear` event for bonus rows.
      - Merge `newChargedFlat` with `explosionResult.newChargedCells` into updated `chargedCells`.
   d. Else (no explosion):
      - `chargedCells = new Set([...chargedCells, ...newChargedFlat])`.
      - `chainTimer = 0`.
   e. Apply base-clear multiplier to `pointsGained`: `score += Math.round(scoreForLines(clearedCount, level) * chainMultiplier(chainDepth))` — note: do this BEFORE incrementing `chainDepth` for the explosion case so the base clear uses the pre-explosion depth.
   f. If `newChargedFlat.length > 0`: push `cell-charged` event.

6. After the lock/spawn block and before returning (in every tick), apply charge decay:
   ```typescript
   const decay = tickChargeDecay(chargedCells, chainDepth, chainTimer, dtMs)
   chargedCells = decay.chargedCells
   chainDepth = decay.chainDepth
   chainTimer = decay.chainTimer
   if (decay.emitChainReset) events.push({ type: 'chain-reset' })
   ```
   Apply this to all return paths in the playing phase, including the no-lock path.

7. Propagate `chargedCells`, `chainDepth`, and `chainTimer` in all state spread objects returned from `updateGameState`.

8. Preserve existing `scoreForLines` call semantics: the function itself is unchanged. All existing score tests remain valid.

**Acceptance criteria (AC):**
- AC 3: explosion fires when charged cell touched by line clear.
- AC 4: multiplier increments correctly; resets after 2 s.
- AC 5: HUD score reflects multiplied value.
- AC 7: no DOM/PixiJS imports.
- AC 8: `npm test` green.

---

## Task 4: [renderer] Extend `boardRenderer.ts` with charged-cell overlay pass

**Files:**
- Modify: `src/renderer/boardRenderer.ts`

**Steps:**

1. Add a pre-allocated overlay pool as a new field:
   ```typescript
   private chargedOverlayGraphics: Graphics[]
   ```
   Initialize in `constructor` with `BOARD_ROWS * BOARD_COLS` `Graphics` objects, added to `this.container` after `cellGraphics`, all with `visible = false`.

2. Add change-tracking field:
   ```typescript
   private lastChargedCells: ReadonlySet<number> = new Set()
   ```

3. In `resize()`, iterate `chargedOverlayGraphics` and set `visible = false` on all (forces redraw after layout change).

4. Add private method `updateChargedOverlays(state: GameState, now: number): void`:
   - `const pulse = 0.4 + 0.4 * Math.sin(now * 0.006)` (alpha oscillates 0.4–0.8 at ~1 Hz).
   - For each index in `state.chargedCells`:
     - Compute `row = Math.floor(idx / BOARD_COLS)`, `col = idx % BOARD_COLS`.
     - Guard: `if (idx < 0 || idx >= BOARD_ROWS * BOARD_COLS) continue`.
     - Retrieve `const g = this.chargedOverlayGraphics[idx]`; if falsy, continue (no `!` assertion).
     - `g.clear()`.
     - Draw `g.roundRect(col * this.cellSize + 1, row * this.cellSize + 1, this.cellSize - 2, this.cellSize - 2, CELL_RADIUS)`.
     - `g.fill({ color: 0xffffff, alpha: pulse })`.
     - `g.visible = true`.
   - For any index in `this.lastChargedCells` that is NOT in `state.chargedCells`:
     - Retrieve overlay, set `visible = false`, call `clear()`.
   - `this.lastChargedCells = state.chargedCells`.

5. In `update(state: GameState)`, call `this.updateChargedOverlays(state, performance.now())` after the normal cell loop.

**Acceptance criteria (AC):**
- AC 1: charged cells are visually distinct (pulsing white overlay on top of normal cell color).
- AC 2: overlay disappears when cell expires from `chargedCells`.
- `npm run build` and `npm run lint` pass.

---

## Task 5: [renderer] Extend `postProcess.ts` to return `PostProcessController`

**Files:**
- Modify: `src/renderer/postProcess.ts`

**Steps:**

1. Export the controller interface:
   ```typescript
   export interface PostProcessController {
     setChainDepth(depth: number): void
   }
   ```

2. Change `attachPostProcess` return type from `void` to `PostProcessController`.

3. On Canvas renderer path, return the Null Object:
   ```typescript
   return { setChainDepth: (_depth: number) => {} }
   ```

4. In the WebGL path, capture references to the `GlowFilter` on `boardContainer` and the `BloomFilter` on `pieceContainer`:
   ```typescript
   const boardGlow = new GlowFilter({ distance: 8, outerStrength: 1.5, color: 0xffffff })
   const pieceBloom = new BloomFilter(1.2)
   ```
   Assign filters as before. Return:
   ```typescript
   return {
     setChainDepth(depth: number): void {
       const clampedDepth = Math.min(depth, 3)
       const strengthTable = [1.5, 2.5, 4.0, 6.0]
       const bloomTable = [1.2, 2.0, 3.5, 5.0]
       const strength = strengthTable[clampedDepth] ?? 1.5
       const bloom = bloomTable[clampedDepth] ?? 1.2
       boardGlow.outerStrength = strength
       ;(pieceBloom as unknown as { blur: number }).blur = bloom
     }
   }
   ```

5. Wrap filter property mutations in a `try/catch` (same defensive pattern as the existing filter initialization).

**Acceptance criteria (AC):**
- AC 6: bloom visually scales with chain depth.
- AC 7: renderer boundary preserved — no engine imports beyond `types.ts`.
- Calling code in `main.ts` (Task 6) compiles without errors.
- Null Object returned on Canvas renderer — no null checks required at call site.

---

## Task 6: [main][renderer] Wire chain events in `main.ts` and `effects.ts`

**Files:**
- Modify: `src/main.ts`
- Modify: `src/renderer/effects.ts`

### `effects.ts` changes:

1. Add field: `private currentChainDepth = 0`.

2. In `onEvents()`, add cases:
   ```typescript
   if (event.type === 'cell-charged') {
     // Overlay handled by boardRenderer; no particle effect at this stage.
   }
   if (event.type === 'chain-explosion') {
     const payload = event.payload as {
       affectedArea: [number, number][]
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

3. Add private method `triggerExplosionEffect(area: [number, number][], depth: number): void`:
   - Color by depth: `depth <= 1 ? 0x88ccff : depth === 2 ? 0xffcc44 : 0xff4400`.
   - For each `[row, col]` in `area`, activate up to 5 particles from `particlePool` at `(col + 0.5) * cellSize`, `(row + 0.5) * cellSize`.
   - Set particle `vx = (Math.random() - 0.5) * depth * 4`, `vy = -(Math.random() * 2 + 1) * depth`.
   - Tint particle sprite: `particle.sprite.tint = chainColor`.
   - Add a flash via `triggerFlash` for the affected rows (extract row set from `area`), tinted with chain color.

4. `EffectsRenderer` does NOT import from `engine/chainBlast.ts`. Depth is passed in via event payload.

### `main.ts` changes:

1. Import `PostProcessController` from `./renderer/postProcess.js`.

2. Change the `attachPostProcess` call to capture the controller:
   ```typescript
   const postProcessController = attachPostProcess(boardContainer, pieceContainer, app)
   ```

3. In the event-handling section of the game loop (where `effectsRenderer.onEvents` is called), add:
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

4. Add function `triggerChainShake(depth: number): void` in `main.ts`:
   - `const magnitude = Math.min(depth * 3, 10)`.
   - Apply a 200 ms shake to `app.stage` using the same translate-and-restore approach used by the existing shake implementation.
   - Guard: if `magnitude === 0`, return early.

**Acceptance criteria (AC):**
- AC 6: bloom, shake, and color scale with chain depth.
- AC 7: `main.ts` is the only file importing across layers.
- `npm run build` and `npm run lint` pass.

---

## Task 7: [test] Unit tests for `chainBlast.ts`

**Files:**
- Create: `src/__tests__/engine/chainBlast.test.ts`

**Steps:**

Write tests using `vitest` covering:

1. `chainMultiplier`:
   - Returns `1` at depth 0 and below.
   - Returns `1.5` at depth 1.
   - Returns `2` at depth 2.
   - Returns `3` at depth 3 and depth 10 (cap).

2. `generateChargedCells`:
   - With `CHARGE_PROBABILITY` mocked to `1.0` (via `vi.spyOn(Math, 'random').mockReturnValue(0)`), clearing row 5 produces 10 charged indices in row 4.
   - Clearing row 0 produces zero charged cells (no row above).
   - Indices already in `existingCharged` are not re-added.

3. `resolveExplosions`:
   - With a board where row 5 col 5 is a charged cell in `chargedCells`, and `triggeredRows = [5]`, the board cells within the 3×3 around `(5, 5)` are zeroed.
   - Cells outside board bounds are not written (edge cols 0 and 9 with explosion center at col 0 produce no out-of-bounds error).
   - Returns `bonusRows: []` when no full rows form from the explosion.
   - Returns `bonusRows` when the explosion creates a full row.

4. `tickChargeDecay`:
   - Timer below threshold: charged cells and depth preserved.
   - Timer reaches `CHARGE_LIFETIME_MS`: `chargedCells` is emptied, `emitChainReset = false`.
   - Timer reaches `CHAIN_RESET_MS` with `chainDepth > 0`: `chainDepth === 0`, `emitChainReset = true`.
   - Both expirations fire in one tick when timer crosses the higher threshold.

**Use `const` for all test-local variables not reassigned (matches ESLint rule).**

**Acceptance criteria (AC):**
- AC 8: `npm test` green, including new tests.
- Coverage threshold (`npm run test:coverage`) remains ≥ 80% branch for `src/engine/**`.

---

## Task 8: [test] Extend `gameState.test.ts` for chain integration

**Files:**
- Modify: `src/__tests__/engine/gameState.test.ts`

**Steps:**

Add a `describe('chain blast integration')` block with tests:

1. `createGameState` initializes `chargedCells` as an empty Set, `chainDepth = 0`, `chainTimer = 0`.

2. After a line clear with `Math.random` mocked to always return `0` (probability check `< 0.2` fails): `state.chargedCells` is empty.

3. After a line clear with `Math.random` mocked to always return `0.1` (probability check passes): `state.chargedCells.size > 0`.

4. When a charged cell exists and the next line clear includes that cell's row: `state.chainDepth === 1` in the returned state.

5. When chain depth is 1 and another explosion fires: `state.chainDepth === 2`.

6. Score from a line-1 clear at depth 1 equals `Math.round(100 * 1.5)` = 150 (level 1).

7. After `CHAIN_RESET_MS` ms tick with no clears: `state.chainDepth === 0`.

8. `chargedCells` survives pause/resume (state is held in memory; verify fields are present in paused state).

**Acceptance criteria (AC):**
- AC 4, AC 5, AC 8.
- All pre-existing `gameState.test.ts` tests still pass.

---

## Task 9: [ui] Add chain multiplier display to `hud.ts`

**Files:**
- Modify: `src/ui/hud.ts`

**Steps:**

1. Import `chainMultiplier` from `../engine/chainBlast.js`.

2. Add two new `Text` elements: `chainLabel` (style: `LABEL_COLOR`, text `'CHAIN'`) and `chainValue` (style: `VALUE_COLOR`, bold).

3. In `constructor`, add both elements to `this.container` as children.

4. In `layoutElements()`:
   - Position `chainLabel` and `chainValue` below the `linesValue` element (increase panel height from 320 to 370 to accommodate).
   - Both hidden by default: `this.chainLabel.visible = false`, `this.chainValue.visible = false`.

5. Add `private lastChainDepth = -1`.

6. In `update(state: GameState)`, add:
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

7. Do NOT import `GameState` again — it is already imported.

**Acceptance criteria (AC):**
- AC 5: HUD shows chain multiplier when active.
- AC 8: `npm run build` and `npm run lint` pass.
- Element hidden when `chainDepth === 0`.

---

## Compatibility Impact

No contract surface changes detected for the public CLI, command templates, agent templates, or config keys.

The following internal API changes are **non-breaking at the architecture layer** but constitute **intra-codebase interface changes** that all tasks in this feature coordinate:

| Change | Classification | Migration |
|--------|---------------|-----------|
| `GameState` gains `chargedCells`, `chainDepth`, `chainTimer` | Non-breaking addition | All callers of `createGameState()` receive the new fields automatically; callers that spread `GameState` (e.g., `...state` in `updateGameState`) must propagate the new fields — addressed in Task 3. |
| `GameEventType` gains three new string literals | Non-breaking addition | `effects.ts` `onEvents` switch does not use exhaustive matching, so new event types are ignored until Task 6 wires them in. |
| `attachPostProcess` return type changes from `void` to `PostProcessController` | Breaking for existing callers | There is exactly one call site: `main.ts` line 76, which currently discards the return value. Task 6 assigns it. No other call sites exist. |

**Pre-existing tests:** The existing `gameState.test.ts` tests assert on `state.score`, `state.lines`, `state.level`, `state.phase` — none of which are affected by the new fields or the chain logic on a board that never triggers a chain. All existing tests remain valid and require no modification beyond ensuring the spread objects in Task 3 include the new fields.
