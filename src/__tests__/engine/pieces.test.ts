import { describe, it, expect } from 'vitest'
import { PIECE_SHAPES, SRS_KICKS, SRS_KICKS_I, getSpawnPosition, PIECE_COLORS } from '../../engine/pieces.js'
import type { PieceType } from '../../engine/types.js'

const ALL_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

describe('PIECE_SHAPES', () => {
  it('all 7 piece types are defined', () => {
    for (const type of ALL_TYPES) {
      expect(PIECE_SHAPES[type]).toBeDefined()
    }
  })

  it('each piece type has exactly 4 rotation states', () => {
    for (const type of ALL_TYPES) {
      expect(PIECE_SHAPES[type]).toHaveLength(4)
    }
  })

  it('each rotation state has exactly 4 cell offsets', () => {
    for (const type of ALL_TYPES) {
      const rotations = PIECE_SHAPES[type]!
      for (let rot = 0; rot < 4; rot++) {
        expect(rotations[rot]).toHaveLength(4)
      }
    }
  })

  it('each cell offset is a [row, col] pair', () => {
    for (const type of ALL_TYPES) {
      const rotations = PIECE_SHAPES[type]!
      for (const rotation of rotations) {
        for (const cell of rotation) {
          expect(cell).toHaveLength(2)
        }
      }
    }
  })
})

describe('PIECE_COLORS', () => {
  it('all 7 piece types have color indices', () => {
    for (const type of ALL_TYPES) {
      expect(PIECE_COLORS[type]).toBeDefined()
    }
  })

  it('color indices are between 1 and 7', () => {
    for (const type of ALL_TYPES) {
      const color = PIECE_COLORS[type]!
      expect(color).toBeGreaterThanOrEqual(1)
      expect(color).toBeLessThanOrEqual(7)
    }
  })

  it('each piece type has a unique color index', () => {
    const colors = ALL_TYPES.map((t) => PIECE_COLORS[t])
    const unique = new Set(colors)
    expect(unique.size).toBe(7)
  })
})

describe('getSpawnPosition', () => {
  it('I-piece spawns at col 3', () => {
    const pos = getSpawnPosition('I')
    expect(pos.col).toBe(3)
    expect(pos.row).toBe(0)
  })

  it('O-piece spawns at col 4', () => {
    const pos = getSpawnPosition('O')
    expect(pos.col).toBe(4)
    expect(pos.row).toBe(0)
  })

  it('all pieces spawn at row 0', () => {
    for (const type of ALL_TYPES) {
      expect(getSpawnPosition(type).row).toBe(0)
    }
  })

  it('spawn column centers the piece horizontally on a 10-wide board', () => {
    // I-piece is 4 cells wide at col 3 → occupies cols 3,4,5,6 → center at col 4.5 ✓
    const iPos = getSpawnPosition('I')
    const iShape = PIECE_SHAPES['I']![0]!
    const cols = iShape.map(([, dc]) => iPos.col + dc)
    const minCol = Math.min(...cols)
    const maxCol = Math.max(...cols)
    expect(minCol).toBeGreaterThanOrEqual(0)
    expect(maxCol).toBeLessThanOrEqual(9)
    // Center should be approximately 4-5
    const center = (minCol + maxCol) / 2
    expect(center).toBeGreaterThanOrEqual(3)
    expect(center).toBeLessThanOrEqual(6)
  })
})

describe('SRS_KICKS', () => {
  const transitions = ['0>1', '1>0', '1>2', '2>1', '2>3', '3>2', '3>0', '0>3']

  it('has all 8 rotation transitions', () => {
    for (const t of transitions) {
      expect(SRS_KICKS[t]).toBeDefined()
    }
  })

  it('each transition has exactly 5 kick offsets', () => {
    for (const t of transitions) {
      expect(SRS_KICKS[t]).toHaveLength(5)
    }
  })

  it('first kick is always [0, 0] (no offset)', () => {
    for (const t of transitions) {
      const kicks = SRS_KICKS[t]!
      expect(kicks[0]).toEqual([0, 0])
    }
  })
})

describe('SRS_KICKS_I', () => {
  const transitions = ['0>1', '1>0', '1>2', '2>1', '2>3', '3>2', '3>0', '0>3']

  it('has all 8 rotation transitions for I-piece', () => {
    for (const t of transitions) {
      expect(SRS_KICKS_I[t]).toBeDefined()
    }
  })

  it('each I-piece transition has exactly 5 kick offsets', () => {
    for (const t of transitions) {
      expect(SRS_KICKS_I[t]).toHaveLength(5)
    }
  })

  it('I-piece first kick is always [0, 0]', () => {
    for (const t of transitions) {
      const kicks = SRS_KICKS_I[t]!
      expect(kicks[0]).toEqual([0, 0])
    }
  })
})

describe('getSpawnPosition — all piece types', () => {
  it('T-piece spawns at col 3 (default branch)', () => {
    const pos = getSpawnPosition('T')
    expect(pos.col).toBe(3)
    expect(pos.row).toBe(0)
  })

  it('S-piece spawns at col 3 (default branch)', () => {
    const pos = getSpawnPosition('S')
    expect(pos.col).toBe(3)
    expect(pos.row).toBe(0)
  })

  it('Z-piece spawns at col 3 (default branch)', () => {
    const pos = getSpawnPosition('Z')
    expect(pos.col).toBe(3)
    expect(pos.row).toBe(0)
  })

  it('J-piece spawns at col 3 (default branch)', () => {
    const pos = getSpawnPosition('J')
    expect(pos.col).toBe(3)
    expect(pos.row).toBe(0)
  })

  it('L-piece spawns at col 3 (default branch)', () => {
    const pos = getSpawnPosition('L')
    expect(pos.col).toBe(3)
    expect(pos.row).toBe(0)
  })
})

describe('PIECE_SHAPES — shape consistency', () => {
  it('O-piece has identical shapes across all 4 rotations', () => {
    const shapes = PIECE_SHAPES['O']!
    for (let rot = 1; rot < 4; rot++) {
      expect(shapes[rot]).toEqual(shapes[0])
    }
  })

  it('I-piece North rotation is a horizontal bar of 4 cells in the same row', () => {
    const shape = PIECE_SHAPES['I']![0]!
    const rows = shape.map(([r]) => r)
    // All cells should be in the same row
    expect(new Set(rows).size).toBe(1)
  })

  it('I-piece East rotation is a vertical bar of 4 cells in the same column', () => {
    const shape = PIECE_SHAPES['I']![1]!
    const cols = shape.map(([, c]) => c)
    // All cells should be in the same column
    expect(new Set(cols).size).toBe(1)
  })
})
