import { describe, it, expect } from 'vitest'
import { emptyBoard, setCell, BOARD_COLS, BOARD_ROWS } from '../../engine/board.js'
import { detectFullRows, clearRows } from '../../engine/lineClear.js'

/** Fill an entire row with value 1. */
function fillRow(board: Uint8Array, row: number): Uint8Array {
  let b = board
  for (let col = 0; col < BOARD_COLS; col++) {
    b = setCell(b, row, col, 1)
  }
  return b
}

describe('detectFullRows', () => {
  it('returns empty array on an empty board', () => {
    const board = emptyBoard()
    expect(detectFullRows(board)).toEqual([])
  })

  it('returns empty array when no rows are full', () => {
    // Fill only 9 of 10 columns in row 5
    let board = emptyBoard()
    for (let col = 0; col < 9; col++) {
      board = setCell(board, 5, col, 1)
    }
    expect(detectFullRows(board)).toEqual([])
  })

  it('detects a single full row', () => {
    const board = fillRow(emptyBoard(), 10)
    const result = detectFullRows(board)
    expect(result).toEqual([10])
  })

  it('detects multiple full rows', () => {
    let board = emptyBoard()
    board = fillRow(board, 15)
    board = fillRow(board, 17)
    board = fillRow(board, 19)
    const result = detectFullRows(board)
    expect(result).toEqual([15, 17, 19])
  })

  it('returns rows in top-to-bottom order (sorted ascending)', () => {
    let board = emptyBoard()
    board = fillRow(board, 19)
    board = fillRow(board, 5)
    board = fillRow(board, 12)
    const result = detectFullRows(board)
    expect(result).toEqual([5, 12, 19])
  })

  it('detects all 20 rows as full', () => {
    let board = emptyBoard()
    for (let row = 0; row < BOARD_ROWS; row++) {
      board = fillRow(board, row)
    }
    const result = detectFullRows(board)
    expect(result).toHaveLength(20)
    expect(result[0]).toBe(0)
    expect(result[19]).toBe(19)
  })

  it('partial rows are NOT detected as full', () => {
    // Each row is partially filled — none should be detected
    let board = emptyBoard()
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS - 1; col++) {
        board = setCell(board, row, col, 1)
      }
    }
    expect(detectFullRows(board)).toEqual([])
  })
})

describe('clearRows', () => {
  it('returns a new board (does not mutate input)', () => {
    const board = fillRow(emptyBoard(), 19)
    const original = board.slice()
    clearRows(board, [19])
    // Original board should be unchanged
    expect(board).toEqual(original)
  })

  it('clears 1 row — board has 1 new empty row at top', () => {
    const board = fillRow(emptyBoard(), 19)
    const result = clearRows(board, [19])
    // Row 0 of result should be empty
    for (let col = 0; col < BOARD_COLS; col++) {
      expect(result[0 * BOARD_COLS + col]).toBe(0)
    }
    // Row 19 of result should now be the old row 18 (which was empty)
    for (let col = 0; col < BOARD_COLS; col++) {
      expect(result[19 * BOARD_COLS + col]).toBe(0)
    }
  })

  it('clears 4 rows — board has 4 new empty rows at top', () => {
    let board = emptyBoard()
    // Fill rows 16-19
    for (let row = 16; row < 20; row++) {
      board = fillRow(board, row)
    }
    const result = clearRows(board, [16, 17, 18, 19])
    // First 4 rows should be empty
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        expect(result[row * BOARD_COLS + col]).toBe(0)
      }
    }
  })

  it('preserves remaining rows above the cleared row', () => {
    // Put a marker value in row 5, then clear row 19
    let board = emptyBoard()
    board = setCell(board, 5, 0, 7) // marker
    board = fillRow(board, 19)      // will be cleared

    const result = clearRows(board, [19])
    // Row 5 should have shifted down by 1 (to row 6 due to new empty row at top)
    // Actually: row 5 remains at row 5+1 = 6? No wait...
    // clearRows removes row 19 and prepends 1 empty row.
    // Old row 5 becomes new row 6 (since 1 empty row is prepended).
    // Actually: remaining rows are rows 0-18 (19 was cleared).
    // They are placed starting at row 1 (after the 1 new empty row at top).
    // So old row 0 → new row 1, old row 5 → new row 6.
    expect(result[6 * BOARD_COLS + 0]).toBe(7)
  })

  it('handles clearing 0 rows (returns same-content board)', () => {
    let board = emptyBoard()
    board = setCell(board, 5, 0, 3)
    const result = clearRows(board, [])
    // Content should match
    expect(result[5 * BOARD_COLS + 0]).toBe(3)
  })

  it('clears non-contiguous rows correctly', () => {
    // Fill rows 5 and 15 (not adjacent)
    let board = emptyBoard()
    board = fillRow(board, 5)
    board = fillRow(board, 15)
    // Put a marker in row 10
    board = setCell(board, 10, 0, 6)

    const result = clearRows(board, [5, 15])
    // 2 rows cleared → 2 empty rows at top
    // Old rows 0-4 → new rows 2-6
    // Old row 6-14 → new rows 7-15 (after skipping cleared row 5)
    // But rows 5 and 15 are removed, so:
    //   rows 0-4 (5 rows) → rows 2-6
    //   rows 6-14 (9 rows) → rows 7-15
    //   rows 16-19 (4 rows) → rows 16-19
    // Old row 10 → after removing rows 5 and 15 (below 10 is only row 15 at position 15),
    //   row 10 is between the two cleared rows.
    //   Remaining (in order): rows 0,1,2,3,4,6,7,8,9,10,11,12,13,14,16,17,18,19
    //   After prepending 2 empty rows:
    //   new row 0: empty, new row 1: empty
    //   new row 2: old row 0, ... new row 7: old row 6, ...
    //   new row 11: old row 10
    expect(result[11 * BOARD_COLS + 0]).toBe(6) // old row 10 → new row 11
  })
})

describe('detectFullRows — edge cases', () => {
  it('detects full row at top (row 0)', () => {
    const board = fillRow(emptyBoard(), 0)
    expect(detectFullRows(board)).toEqual([0])
  })

  it('detects full row at bottom (row 19)', () => {
    const board = fillRow(emptyBoard(), 19)
    expect(detectFullRows(board)).toEqual([19])
  })

  it('row with different non-zero values is still detected as full', () => {
    let board = emptyBoard()
    for (let col = 0; col < BOARD_COLS; col++) {
      board = setCell(board, 10, col, (col % 7) + 1) // values 1-7
    }
    expect(detectFullRows(board)).toEqual([10])
  })

  it('detects exactly 2 adjacent full rows', () => {
    let board = emptyBoard()
    board = fillRow(board, 18)
    board = fillRow(board, 19)
    expect(detectFullRows(board)).toEqual([18, 19])
  })

  it('single empty cell in first column prevents detection', () => {
    let board = emptyBoard()
    // Fill row 10 cols 1-9 (leave col 0 empty)
    for (let col = 1; col < BOARD_COLS; col++) {
      board = setCell(board, 10, col, 1)
    }
    expect(detectFullRows(board)).toEqual([])
  })

  it('single empty cell in last column prevents detection', () => {
    let board = emptyBoard()
    // Fill row 10 cols 0-8 (leave col 9 empty)
    for (let col = 0; col < BOARD_COLS - 1; col++) {
      board = setCell(board, 10, col, 1)
    }
    expect(detectFullRows(board)).toEqual([])
  })
})

describe('clearRows — edge cases', () => {
  it('clearing row 0 prepends one empty row and shifts nothing above', () => {
    let board = emptyBoard()
    board = fillRow(board, 0)
    board = setCell(board, 1, 5, 3) // marker in row 1
    const result = clearRows(board, [0])
    // Row 0 cleared → 1 empty row prepended
    // Old row 1 → new row 1 (since old row 0 is removed and empty prepended)
    // Actually: remaining rows are 1-19, prepended with 1 empty → new row 0=empty, new row 1=old row 1
    expect(result[0 * BOARD_COLS + 5]).toBe(0) // new row 0 is empty
    expect(result[1 * BOARD_COLS + 5]).toBe(3) // marker preserved in row 1
  })

  it('clearing all 20 rows results in completely empty board', () => {
    let board = emptyBoard()
    for (let row = 0; row < BOARD_ROWS; row++) {
      board = fillRow(board, row)
    }
    const allRows = Array.from({ length: BOARD_ROWS }, (_, i) => i)
    const result = clearRows(board, allRows)
    // Should be all zeros
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBe(0)
    }
  })

  it('preserves cell values (color indices) in remaining rows', () => {
    let board = emptyBoard()
    board = setCell(board, 5, 3, 7)  // L-piece color
    board = setCell(board, 5, 4, 3)  // T-piece color
    board = fillRow(board, 19)       // will be cleared

    const result = clearRows(board, [19])
    // Old row 5 → new row 6 (shifted down by 1)
    expect(result[6 * BOARD_COLS + 3]).toBe(7)
    expect(result[6 * BOARD_COLS + 4]).toBe(3)
  })
})
