import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  chainMultiplier,
  generateChargedCells,
  resolveExplosions,
  tickChargeDecay,
  CHARGE_LIFETIME_MS,
  CHAIN_RESET_MS,
} from '../../engine/chainBlast.js'
import { emptyBoard, BOARD_COLS } from '../../engine/board.js'

// ---------------------------------------------------------------------------
// chainMultiplier
// ---------------------------------------------------------------------------

describe('chainMultiplier', () => {
  it('returns 1 for depth <= 0', () => {
    expect(chainMultiplier(0)).toBe(1)
    expect(chainMultiplier(-1)).toBe(1)
    expect(chainMultiplier(-100)).toBe(1)
  })

  it('returns 1.5 for depth 1', () => {
    expect(chainMultiplier(1)).toBe(1.5)
  })

  it('returns 2 for depth 2', () => {
    expect(chainMultiplier(2)).toBe(2)
  })

  it('returns 3 for depth 3', () => {
    expect(chainMultiplier(3)).toBe(3)
  })

  it('returns 3 for depth 10 (cap)', () => {
    expect(chainMultiplier(10)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// generateChargedCells
// ---------------------------------------------------------------------------

describe('generateChargedCells', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty when Math.random() >= 0.2 for all cells', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    // 0 < 0.2 is true, so all cells charge. Wait — 0 is less than 0.2 so it charges.
    // We need a value >= 0.2 to get no charges. Use 0.5.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const board = emptyBoard()
    const result = generateChargedCells([5], board, new Set())
    expect(result).toHaveLength(0)
  })

  it('returns 10 indices in row 4 when clearing row 5 with random=0.1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const board = emptyBoard()
    const result = generateChargedCells([5], board, new Set())
    // Row 4 (aboveRow = 5-1 = 4), all 10 columns should be charged
    expect(result).toHaveLength(10)
    for (const idx of result) {
      const row = Math.floor(idx / BOARD_COLS)
      expect(row).toBe(4)
    }
  })

  it('returns empty when clearing row 0 (no row above)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const board = emptyBoard()
    const result = generateChargedCells([0], board, new Set())
    expect(result).toHaveLength(0)
  })

  it('does not add indices already in existingCharged', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const board = emptyBoard()
    // Pre-charge all cells in row 4 (clearing row 5 → looks at row 4)
    const existingCharged = new Set<number>()
    for (let col = 0; col < BOARD_COLS; col++) {
      existingCharged.add(4 * BOARD_COLS + col)
    }
    const result = generateChargedCells([5], board, existingCharged)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// resolveExplosions
// ---------------------------------------------------------------------------

describe('resolveExplosions', () => {
  it('returns original board and empty results when chargedCells is empty', () => {
    const board = emptyBoard()
    const result = resolveExplosions(board, new Set(), [5])
    expect(result.board).toBe(board)
    expect(result.bonusRows).toHaveLength(0)
    expect(result.affectedArea).toHaveLength(0)
    expect(result.newChargedCells.size).toBe(0)
  })

  it('zeroes cells around the detonator at (5, 5) when triggered by row 5', () => {
    const board = emptyBoard()
    // Place a charged cell at flat index 5*10+5 = 55 (row=5, col=5)
    const chargedIdx = 5 * BOARD_COLS + 5
    const chargedCells = new Set<number>([chargedIdx])

    // Fill the entire board with color 1 so we can observe zeroing
    const filledBoard = board.slice()
    filledBoard.fill(1)

    const result = resolveExplosions(filledBoard as typeof board, chargedCells, [5])

    // All 9 neighbours of (5,5) should be zeroed
    for (const dr of [-1, 0, 1]) {
      for (const dc of [-1, 0, 1]) {
        const r = 5 + dr
        const c = 5 + dc
        expect(result.board[r * BOARD_COLS + c]).toBe(0)
      }
    }

    expect(result.affectedArea.length).toBeGreaterThan(0)
  })

  it('does not go out of bounds when center is at corner (0, 0)', () => {
    const board = emptyBoard()
    const filledBoard = board.slice()
    filledBoard.fill(1)
    const chargedCells = new Set<number>([0]) // row=0, col=0
    // Should not throw
    const result = resolveExplosions(filledBoard as typeof board, chargedCells, [0])
    // Only cells that are in-bounds should be cleared: (0,0),(0,1),(1,0),(1,1)
    expect(result.affectedArea.length).toBeGreaterThan(0)
    for (const [r, c] of result.affectedArea) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(c).toBeGreaterThanOrEqual(0)
    }
  })

  it('reports no bonus rows when explosion does not complete any full row', () => {
    const board = emptyBoard()
    const filledBoard = board.slice()
    // Only fill some cells — explosion will zero a small area, not complete any row
    filledBoard[0 * BOARD_COLS + 0] = 1
    const chargedCells = new Set<number>([0]) // row=0, col=0
    const result = resolveExplosions(filledBoard as typeof board, chargedCells, [0])
    // The explosion zeros cells around (0,0), so no full rows should form
    expect(result.bonusRows).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// tickChargeDecay
// ---------------------------------------------------------------------------

describe('tickChargeDecay', () => {
  it('preserves everything when timer stays below CHARGE_LIFETIME_MS', () => {
    const charged = new Set([1, 2, 3])
    const result = tickChargeDecay(charged, 2, 100, 100)
    expect(result.chargedCells).toBe(charged) // same reference — not modified
    expect(result.chainDepth).toBe(2)
    expect(result.chainTimer).toBe(200)
    expect(result.emitChainReset).toBe(false)
  })

  it('clears chargedCells when timer crosses CHARGE_LIFETIME_MS', () => {
    const charged = new Set([1, 2, 3])
    // Start at CHARGE_LIFETIME_MS - 1, add 2ms to cross threshold
    const result = tickChargeDecay(charged, 0, CHARGE_LIFETIME_MS - 1, 2)
    expect(result.chargedCells.size).toBe(0)
    expect(result.emitChainReset).toBe(false)
  })

  it('resets chainDepth and emits chain-reset when timer crosses CHAIN_RESET_MS with depth > 0', () => {
    const charged = new Set<number>()
    const result = tickChargeDecay(charged, 3, CHAIN_RESET_MS - 1, 2)
    expect(result.chainDepth).toBe(0)
    expect(result.emitChainReset).toBe(true)
  })

  it('applies both expirations when timer crosses both thresholds in one tick', () => {
    const charged = new Set([10, 20])
    // Start at 0, add enough to cross both thresholds
    const bigDt = Math.max(CHARGE_LIFETIME_MS, CHAIN_RESET_MS) + 100
    const result = tickChargeDecay(charged, 2, 0, bigDt)
    expect(result.chargedCells.size).toBe(0)
    expect(result.chainDepth).toBe(0)
    expect(result.emitChainReset).toBe(true)
  })
})
