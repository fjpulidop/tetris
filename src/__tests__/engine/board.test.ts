import { describe, it, expect } from 'vitest'
import {
  emptyBoard,
  cloneBoard,
  getCell,
  setCell,
  isCollision,
  BOARD_COLS,
  BOARD_ROWS,
} from '../../engine/board.js'

describe('emptyBoard', () => {
  it('returns a Uint8Array of length 200', () => {
    const board = emptyBoard()
    expect(board).toBeInstanceOf(Uint8Array)
    expect(board.length).toBe(200)
  })

  it('contains all zeros', () => {
    const board = emptyBoard()
    for (let i = 0; i < board.length; i++) {
      expect(board[i]).toBe(0)
    }
  })
})

describe('cloneBoard', () => {
  it('returns a new Uint8Array with the same content', () => {
    const original = emptyBoard()
    original[5] = 3
    const clone = cloneBoard(original)
    expect(clone).not.toBe(original)
    expect(clone[5]).toBe(3)
  })

  it('cloned board changes do not affect the original', () => {
    const original = emptyBoard()
    const clone = cloneBoard(original)
    clone[0] = 7
    expect(original[0]).toBe(0)
  })
})

describe('setCell', () => {
  it('returns a new board, not the same reference', () => {
    const original = emptyBoard()
    const updated = setCell(original, 0, 0, 1)
    expect(updated).not.toBe(original)
  })

  it('does not mutate the input board', () => {
    const original = emptyBoard()
    setCell(original, 5, 5, 3)
    expect(getCell(original, 5, 5)).toBe(0)
  })

  it('correctly sets a cell value', () => {
    const board = emptyBoard()
    const updated = setCell(board, 3, 4, 5)
    expect(getCell(updated, 3, 4)).toBe(5)
  })

  it('does not affect other cells', () => {
    const board = emptyBoard()
    const updated = setCell(board, 3, 4, 5)
    expect(getCell(updated, 3, 3)).toBe(0)
    expect(getCell(updated, 4, 4)).toBe(0)
  })
})

describe('getCell', () => {
  it('reads the correct value at a position', () => {
    const board = emptyBoard()
    const updated = setCell(board, 10, 7, 6)
    expect(getCell(updated, 10, 7)).toBe(6)
  })

  it('returns 0 for empty cells', () => {
    const board = emptyBoard()
    expect(getCell(board, 0, 0)).toBe(0)
    expect(getCell(board, 19, 9)).toBe(0)
  })
})

describe('isCollision', () => {
  it('returns false for all empty in-bounds cells', () => {
    const board = emptyBoard()
    expect(isCollision(board, [[0, 0], [0, 1], [1, 0], [1, 1]])).toBe(false)
  })

  it('returns true for row below the board (row >= BOARD_ROWS)', () => {
    const board = emptyBoard()
    expect(isCollision(board, [[BOARD_ROWS, 0]])).toBe(true)
  })

  it('returns true for negative row (row < 0)', () => {
    const board = emptyBoard()
    expect(isCollision(board, [[-1, 0]])).toBe(true)
  })

  it('returns true for col past the right edge (col >= BOARD_COLS)', () => {
    const board = emptyBoard()
    expect(isCollision(board, [[0, BOARD_COLS]])).toBe(true)
  })

  it('returns true for negative col (col < 0)', () => {
    const board = emptyBoard()
    expect(isCollision(board, [[0, -1]])).toBe(true)
  })

  it('returns true when a cell is occupied', () => {
    const board = setCell(emptyBoard(), 5, 3, 1)
    expect(isCollision(board, [[5, 3]])).toBe(true)
  })

  it('returns true when any cell in the array is occupied', () => {
    const board = setCell(emptyBoard(), 5, 3, 1)
    // Mix of empty and occupied
    expect(isCollision(board, [[0, 0], [5, 3]])).toBe(true)
  })

  it('returns false when all cells are empty', () => {
    const board = setCell(emptyBoard(), 5, 3, 1)
    // These are all empty
    expect(isCollision(board, [[0, 0], [1, 1], [19, 9]])).toBe(false)
  })

  it('handles empty cells array without collision', () => {
    const board = emptyBoard()
    expect(isCollision(board, [])).toBe(false)
  })
})

describe('getCell — edge cases', () => {
  it('returns 0 via fallback for out-of-bounds row (defensive ?? 0 path)', () => {
    const board = emptyBoard()
    // Access beyond the board dimensions triggers the ?? 0 fallback
    expect(getCell(board, -1, 0)).toBe(0)
  })

  it('returns 0 via fallback for out-of-bounds col', () => {
    const board = emptyBoard()
    expect(getCell(board, 0, BOARD_COLS + 5)).toBe(0)
  })

  it('returns 0 for extremely large row index', () => {
    const board = emptyBoard()
    expect(getCell(board, 999, 0)).toBe(0)
  })
})
