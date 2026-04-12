import { describe, it, expect } from 'vitest'
import { emptyBoard, setCell, isCollision } from '../../engine/board.js'
import { getCells, tryRotate } from '../../engine/rotation.js'
import type { ActivePiece } from '../../engine/rotation.js'

/** Helper to create an open board for testing. */
function openBoard() {
  return emptyBoard()
}

/** T-piece at standard spawn position. */
function tPieceNorth(): ActivePiece {
  return { type: 'T', rotation: 0, row: 5, col: 3 }
}

describe('getCells', () => {
  it('returns 4 absolute [row, col] pairs', () => {
    const piece: ActivePiece = { type: 'T', rotation: 0, row: 0, col: 0 }
    const cells = getCells(piece)
    expect(cells).toHaveLength(4)
    for (const cell of cells) {
      expect(cell).toHaveLength(2)
    }
  })

  it('adds piece row and col to each offset', () => {
    // T-piece North rotation 0: offsets [[0,0],[0,1],[0,2],[1,1]]
    const piece: ActivePiece = { type: 'T', rotation: 0, row: 5, col: 3 }
    const cells = getCells(piece)
    // All cells should have row >= 5
    for (const [r] of cells) {
      expect(r).toBeGreaterThanOrEqual(5)
    }
    // All cells should have col >= 3
    for (const [, c] of cells) {
      expect(c).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('tryRotate', () => {
  it('T-piece CW rotation from North to East succeeds in open space', () => {
    const board = openBoard()
    const piece = tPieceNorth()
    const result = tryRotate(board, piece, 'CW')
    expect(result).not.toBeNull()
    expect(result!.rotation).toBe(1)
  })

  it('T-piece CCW rotation from North to West succeeds in open space', () => {
    const board = openBoard()
    const piece = tPieceNorth()
    const result = tryRotate(board, piece, 'CCW')
    expect(result).not.toBeNull()
    expect(result!.rotation).toBe(3)
  })

  it('rotated piece has the same type as original', () => {
    const board = openBoard()
    const piece = tPieceNorth()
    const result = tryRotate(board, piece, 'CW')
    expect(result?.type).toBe('T')
  })

  it('returns null when all 5 kicks fail (piece fully blocked)', () => {
    // Fill the board completely to block all kicks
    let board = emptyBoard()
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        board = setCell(board, row, col, 1)
      }
    }
    // Clear the cells where the T-piece currently sits so it's not in collision
    // But leave the rotated positions blocked
    // Since the board is fully filled, any rotation will collide
    const piece: ActivePiece = { type: 'T', rotation: 0, row: 5, col: 3 }
    const result = tryRotate(board, piece, 'CW')
    expect(result).toBeNull()
  })

  it('CW rotation increments rotation by 1 (mod 4)', () => {
    const board = openBoard()
    const rotations: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0]]
    for (const [from, to] of rotations) {
      const piece: ActivePiece = { type: 'T', rotation: from as 0 | 1 | 2 | 3, row: 5, col: 3 }
      const result = tryRotate(board, piece, 'CW')
      expect(result?.rotation).toBe(to)
    }
  })

  it('CCW rotation decrements rotation by 1 (mod 4)', () => {
    const board = openBoard()
    const rotations: [number, number][] = [[1, 0], [2, 1], [3, 2], [0, 3]]
    for (const [from, to] of rotations) {
      const piece: ActivePiece = { type: 'T', rotation: from as 0 | 1 | 2 | 3, row: 5, col: 3 }
      const result = tryRotate(board, piece, 'CCW')
      expect(result?.rotation).toBe(to)
    }
  })

  it('T-piece rotation near left wall succeeds via wall kick', () => {
    const board = openBoard()
    // Place T-piece at col 0 (against left wall, rotation 1 East pointing right)
    // From East (1) to South (2) should work with a kick
    const piece: ActivePiece = { type: 'T', rotation: 1, row: 5, col: 0 }
    const result = tryRotate(board, piece, 'CW')
    // Should succeed with some kick
    expect(result).not.toBeNull()
  })

  it('I-piece uses a different kick table than standard pieces', () => {
    // The I-piece kick table is separate — test that I-piece can rotate
    const board = openBoard()
    const iPiece: ActivePiece = { type: 'I', rotation: 0, row: 5, col: 3 }
    const result = tryRotate(board, iPiece, 'CW')
    expect(result).not.toBeNull()
    expect(result!.type).toBe('I')
    expect(result!.rotation).toBe(1)
  })

  it('all 7 piece types can rotate CW in open space', () => {
    const board = openBoard()
    const types = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const
    for (const type of types) {
      const piece: ActivePiece = { type, rotation: 0, row: 5, col: 3 }
      const result = tryRotate(board, piece, 'CW')
      expect(result).not.toBeNull()
    }
  })

  it('I-piece rotation uses I-specific kick table and succeeds near right wall', () => {
    const board = openBoard()
    // I-piece East (rotation 1) at col 7, extends to col 9 (7+2=9)
    // Rotating CW to South (rotation 2) should use SRS_KICKS_I
    const iPiece: ActivePiece = { type: 'I', rotation: 1, row: 5, col: 7 }
    const result = tryRotate(board, iPiece, 'CW')
    expect(result).not.toBeNull()
    expect(result!.rotation).toBe(2)
  })

  it('I-piece rotation near left wall uses I-specific kick table', () => {
    const board = openBoard()
    const iPiece: ActivePiece = { type: 'I', rotation: 0, row: 5, col: 0 }
    const result = tryRotate(board, iPiece, 'CCW')
    expect(result).not.toBeNull()
    expect(result!.rotation).toBe(3)
  })

  it('O-piece rotation returns same effective position (all rotations identical)', () => {
    const board = openBoard()
    const oPiece: ActivePiece = { type: 'O', rotation: 0, row: 5, col: 4 }
    const result = tryRotate(board, oPiece, 'CW')
    expect(result).not.toBeNull()
    if (result) {
      // O-piece shape is the same in all rotations
      const originalCells = getCells(oPiece)
      const rotatedCells = getCells(result)
      // Sort and compare — O-piece occupies the same cells regardless of rotation
      const sortCells = (c: readonly [number, number][]) =>
        [...c].sort((a, b) => a[0] - b[0] || a[1] - b[1])
      expect(sortCells(rotatedCells)).toEqual(sortCells(originalCells))
    }
  })

  it('getCells returns correct absolute cells for I-piece rotation 2', () => {
    const piece: ActivePiece = { type: 'I', rotation: 2, row: 3, col: 2 }
    const cells = getCells(piece)
    // I-piece South (rotation 2): [[1,0],[1,1],[1,2],[1,3]]
    // Absolute: row=3+1=4, cols=2+0..2+3 = 2,3,4,5
    expect(cells).toHaveLength(4)
    for (const [r] of cells) {
      expect(r).toBe(4) // all at row 4
    }
    const cols = cells.map(([, c]) => c).sort((a, b) => a - b)
    expect(cols).toEqual([2, 3, 4, 5])
  })

  it('getCells returns correct absolute cells for all 4 rotations of J-piece', () => {
    // Test all rotations to ensure getCells handles each rotation state
    for (let rot = 0; rot < 4; rot++) {
      const piece: ActivePiece = { type: 'J', rotation: rot as 0 | 1 | 2 | 3, row: 5, col: 3 }
      const cells = getCells(piece)
      expect(cells).toHaveLength(4)
      for (const [r, c] of cells) {
        expect(r).toBeGreaterThanOrEqual(5)
        expect(c).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('wall kick applies offset to produce valid position', () => {
    // Create a scenario where the first kick (0,0) fails but a later kick succeeds
    let board = openBoard()
    // T-piece at rotation 1 (East): cells [[0,1],[1,0],[1,1],[2,1]] at row=5, col=0
    // CW to rotation 2 (South): cells [[0,1],[1,0],[1,1],[1,2]] at row=5, col=0
    // Base position (kick 0,0) would place cells at (5,1),(6,0),(6,1),(6,2) — valid
    // But let's block that and force a wall kick
    // Block cells that would be occupied after rotation without kick
    board = setCell(board, 5, 1, 1) // block (5,1) for base T-South position
    board = setCell(board, 6, 0, 1) // block (6,0) as well

    const piece: ActivePiece = { type: 'T', rotation: 1, row: 5, col: 0 }
    const result = tryRotate(board, piece, 'CW')
    // Should either succeed via a kick or fail — verify it handles kick offsets
    // The result position (if non-null) must be valid (no collision)
    if (result) {
      const resultCells = getCells(result)
      expect(isCollision(board, resultCells)).toBe(false)
    }
  })
})
