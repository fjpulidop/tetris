/**
 * Chain Blast — cascading line-clear explosion mechanics.
 *
 * When lines are cleared, cells adjacent to the cleared rows may become
 * "charged". On subsequent clears, charged cells in the affected rows
 * detonate, clearing a 3×3 area around each detonator and potentially
 * triggering bonus line clears (cascading explosions).
 *
 * All functions are pure — no DOM, no PixiJS, no side effects.
 */

import { BOARD_COLS, BOARD_ROWS } from './board.js'
import type { Board } from './board.js'
import { detectFullRows, clearRows } from './lineClear.js'

/** Probability that a cell above a cleared row becomes charged. */
export const CHARGE_PROBABILITY = 0.2

/** Time (ms) after which charged cells decay if no further clears occur. */
export const CHARGE_LIFETIME_MS = 1500

/** Time (ms) after which the chain depth counter resets. */
export const CHAIN_RESET_MS = 2000

/**
 * Score multiplier for a given chain depth.
 * depth 0 → ×1, depth 1 → ×1.5, depth 2 → ×2, depth ≥3 → ×3.
 */
export function chainMultiplier(depth: number): number {
  if (depth <= 0) return 1
  if (depth === 1) return 1.5
  if (depth === 2) return 2
  return 3
}

/**
 * Determine which cells above the cleared rows become charged.
 *
 * For each cleared row, looks at the row immediately above it. Each cell
 * in that row has a CHARGE_PROBABILITY chance of being charged (unless it
 * is already in existingCharged).
 *
 * @param clearedRows   Row indices that were just cleared (pre-collapse coords)
 * @param _board        Post-collapse board (unused in probability pass; reserved for future heuristics)
 * @param existingCharged   Flat indices already charged — excluded from result
 * @returns Array of newly-charged flat cell indices
 */
export function generateChargedCells(
  clearedRows: number[],
  _board: Board,
  existingCharged: ReadonlySet<number>
): number[] {
  const result: number[] = []
  for (const clearedRow of clearedRows) {
    const aboveRow = clearedRow - 1
    if (aboveRow < 0) continue
    for (let col = 0; col < BOARD_COLS; col++) {
      if (Math.random() < CHARGE_PROBABILITY) {
        const idx = aboveRow * BOARD_COLS + col
        if (!existingCharged.has(idx)) {
          result.push(idx)
        }
      }
    }
  }
  return result
}

/** Result of resolving charged-cell explosions. */
export interface ExplosionResult {
  board: Board
  newChargedCells: ReadonlySet<number>
  bonusRows: number[]
  affectedArea: ReadonlyArray<[number, number]>
}

/**
 * Resolve explosions for any charged cells that lie in the triggered rows.
 *
 * Each detonating charged cell clears a 3×3 neighbourhood. After clearing,
 * any newly-complete rows are detected and removed (bonus rows). New charged
 * cells may then be generated above those bonus rows.
 *
 * @param board           Post-collapse board (after the primary clearRows call)
 * @param chargedCells    Flat indices of currently-charged cells
 * @param triggeredRows   Row indices that were just cleared (pre-collapse coords,
 *                        used only to identify which charged cells detonate)
 */
export function resolveExplosions(
  board: Board,
  chargedCells: ReadonlySet<number>,
  triggeredRows: number[]
): ExplosionResult {
  const triggeredRowSet = new Set(triggeredRows)
  const detonators: Array<[number, number]> = []

  for (const idx of chargedCells) {
    const row = Math.floor(idx / BOARD_COLS)
    const col = idx % BOARD_COLS
    if (triggeredRowSet.has(row)) {
      detonators.push([row, col])
    }
  }

  if (detonators.length === 0) {
    return { board, newChargedCells: new Set(), bonusRows: [], affectedArea: [] }
  }

  let workBoard = board.slice() as Board
  const affectedSet = new Set<string>()
  const affectedArea: [number, number][] = []

  for (const [dr, dc] of detonators) {
    for (const dr2 of [-1, 0, 1]) {
      for (const dc2 of [-1, 0, 1]) {
        const r = dr + dr2
        const c = dc + dc2
        if (r < 0 || r >= BOARD_ROWS || c < 0 || c >= BOARD_COLS) continue
        workBoard[r * BOARD_COLS + c] = 0
        const key = `${r},${c}`
        if (!affectedSet.has(key)) {
          affectedSet.add(key)
          affectedArea.push([r, c])
        }
      }
    }
  }

  const bonusRows = detectFullRows(workBoard)
  if (bonusRows.length > 0) {
    workBoard = clearRows(workBoard, bonusRows)
  }
  const newChargedFlat = generateChargedCells(bonusRows, workBoard, chargedCells)

  return { board: workBoard, newChargedCells: new Set(newChargedFlat), bonusRows, affectedArea }
}

/** Result of ticking the charge-decay timer. */
export interface DecayResult {
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  emitChainReset: boolean
}

/**
 * Advance the charge-decay and chain-reset timers by dtMs.
 *
 * - If the accumulated timer crosses CHARGE_LIFETIME_MS, charged cells are cleared.
 * - If the accumulated timer crosses CHAIN_RESET_MS and chainDepth > 0,
 *   the depth is reset to 0 and emitChainReset is set to true.
 *
 * The timer is always incremented (it is reset to 0 externally on each lock).
 */
export function tickChargeDecay(
  chargedCells: ReadonlySet<number>,
  chainDepth: number,
  chainTimer: number,
  dtMs: number
): DecayResult {
  const nextTimer = chainTimer + dtMs
  let nextCharged = chargedCells
  let nextDepth = chainDepth
  let emitChainReset = false

  if (nextTimer >= CHARGE_LIFETIME_MS && chargedCells.size > 0) {
    nextCharged = new Set()
  }
  if (nextTimer >= CHAIN_RESET_MS && chainDepth > 0) {
    nextDepth = 0
    emitChainReset = true
  }

  return { chargedCells: nextCharged, chainDepth: nextDepth, chainTimer: nextTimer, emitChainReset }
}
