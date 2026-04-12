/**
 * Line-clear detection and board collapse.
 * Pure functions — no mutation of the input board.
 */

import { BOARD_COLS, BOARD_ROWS, emptyBoard } from './board.js'
import type { Board } from './board.js'

/**
 * Detect all completely filled rows on the board.
 *
 * @returns Sorted array of row indices (top-to-bottom) that are full.
 *          Returns empty array if no rows are full.
 */
export function detectFullRows(board: Board): number[] {
  const fullRows: number[] = []

  for (let row = 0; row < BOARD_ROWS; row++) {
    let isFull = true
    for (let col = 0; col < BOARD_COLS; col++) {
      if ((board[row * BOARD_COLS + col] ?? 0) === 0) {
        isFull = false
        break
      }
    }
    if (isFull) {
      fullRows.push(row)
    }
  }

  return fullRows
}

/**
 * Remove the specified rows from the board and prepend the same number of
 * empty rows at the top (standard gravity collapse behavior).
 *
 * @param board - Current board state
 * @param rows - Row indices to remove (must be sorted top-to-bottom)
 * @returns New board with the rows cleared and empty rows prepended
 */
export function clearRows(board: Board, rows: number[]): Board {
  if (rows.length === 0) {
    return board.slice() as Board
  }

  // Build a set for O(1) lookup
  const rowSet = new Set(rows)

  // Collect all rows that are NOT being cleared, in order
  const remaining: Uint8Array[] = []
  for (let row = 0; row < BOARD_ROWS; row++) {
    if (!rowSet.has(row)) {
      const rowData = board.slice(row * BOARD_COLS, (row + 1) * BOARD_COLS)
      remaining.push(rowData)
    }
  }

  // Build new board: prepend empty rows, then the remaining rows
  const newBoard = emptyBoard()
  const emptyRowCount = rows.length
  const startRow = emptyRowCount // Empty rows occupy indices 0 to emptyRowCount-1

  for (let i = 0; i < remaining.length; i++) {
    const destRow = startRow + i
    const rowData = remaining[i]
    if (rowData !== undefined) {
      newBoard.set(rowData, destRow * BOARD_COLS)
    }
  }

  return newBoard
}
