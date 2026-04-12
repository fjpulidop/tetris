/**
 * Board model for the falling-block puzzle game.
 * The board is a 10-column × 20-row grid stored as a flat Uint8Array (row-major).
 * All mutation functions return NEW arrays — the input is never modified.
 */

export const BOARD_COLS = 10
export const BOARD_ROWS = 20

/** The board is a flat Uint8Array of length BOARD_COLS * BOARD_ROWS.
 *  Index = row * BOARD_COLS + col.
 *  Value 0 = empty; values 1–7 = locked tetromino color index.
 */
export type Board = Uint8Array

/** Create a new empty board (all zeros). */
export function emptyBoard(): Board {
  return new Uint8Array(BOARD_COLS * BOARD_ROWS)
}

/** Return a shallow copy of the board. */
export function cloneBoard(b: Board): Board {
  return b.slice()
}

/**
 * Read the cell value at (row, col).
 * Does NOT perform bounds checking — caller must ensure valid coordinates.
 */
export function getCell(b: Board, row: number, col: number): number {
  return b[row * BOARD_COLS + col] ?? 0
}

/**
 * Return a new board with the cell at (row, col) set to value.
 * The original board is not mutated.
 */
export function setCell(b: Board, row: number, col: number, value: number): Board {
  const next = b.slice()
  next[row * BOARD_COLS + col] = value
  return next
}

/**
 * Check whether any of the given cells are out of bounds or occupied.
 * Bounds are checked BEFORE array access to avoid undefined reads.
 *
 * @param b - The current board state
 * @param cells - Array of [row, col] absolute board coordinates to test
 * @returns true if ANY cell is invalid or occupied; false if all are clear
 */
export function isCollision(b: Board, cells: readonly [number, number][]): boolean {
  for (const cell of cells) {
    const row = cell[0]
    const col = cell[1]

    // Out-of-bounds check must happen before array access
    if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) {
      return true
    }

    if (getCell(b, row, col) !== 0) {
      return true
    }
  }
  return false
}
