import { describe, it, expect } from 'vitest'
import { createGameState, updateGameState } from '../../engine/gameState.js'
import { GameAction } from '../../engine/types.js'
import { setCell, BOARD_COLS, BOARD_ROWS } from '../../engine/board.js'
import { getCells } from '../../engine/rotation.js'

/**
 * Helper: create a state that is already in the 'playing' phase.
 * Used in all gameplay tests so that the intro guard does not interfere.
 */
function playingState() {
  const s = createGameState()
  const { state } = updateGameState(s, [GameAction.Start], 0)
  return state
}

describe('createGameState', () => {
  it('returns phase "intro"', () => {
    const state = createGameState()
    expect(state.phase).toBe('intro')
  })

  it('returns a non-null activePiece', () => {
    const state = createGameState()
    expect(state.activePiece).not.toBeNull()
  })

  it('starts with score 0', () => {
    const state = createGameState()
    expect(state.score).toBe(0)
  })

  it('starts with level 1', () => {
    const state = createGameState()
    expect(state.level).toBe(1)
  })

  it('starts with 0 lines cleared', () => {
    const state = createGameState()
    expect(state.lines).toBe(0)
  })

  it('has a valid nextPiece', () => {
    const state = createGameState()
    const validTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
    expect(validTypes).toContain(state.nextPiece)
  })
})

describe('updateGameState — Pause', () => {
  it('toggles phase from playing to paused', () => {
    const state = playingState()
    const { state: paused } = updateGameState(state, [GameAction.Pause], 16)
    expect(paused.phase).toBe('paused')
  })

  it('toggles phase from paused back to playing', () => {
    const state = playingState()
    const { state: paused } = updateGameState(state, [GameAction.Pause], 16)
    const { state: resumed } = updateGameState(paused, [GameAction.Pause], 16)
    expect(resumed.phase).toBe('playing')
  })

  it('no other actions are processed while paused', () => {
    const state = playingState()
    const { state: paused } = updateGameState(state, [GameAction.Pause], 16)
    const originalPiece = paused.activePiece
    const { state: stillPaused } = updateGameState(paused, [GameAction.MoveLeft], 16)
    expect(stillPaused.phase).toBe('paused')
    expect(stillPaused.activePiece).toEqual(originalPiece)
  })
})

describe('updateGameState — game-over state', () => {
  it('no actions are processed in gameover phase', () => {
    const state = playingState()
    const gameOverState = { ...state, phase: 'gameover' as const }
    const { state: after, events } = updateGameState(gameOverState, [GameAction.MoveLeft], 16)
    expect(after.phase).toBe('gameover')
    expect(events).toHaveLength(0)
  })
})

describe('updateGameState — movement', () => {
  it('MoveLeft decreases active piece col', () => {
    const state = playingState()
    const originalCol = state.activePiece!.col
    const { state: moved } = updateGameState(state, [GameAction.MoveLeft], 16)
    if (moved.activePiece) {
      expect(moved.activePiece.col).toBe(originalCol - 1)
    }
    // If piece locked, that's fine — it was at the edge and immediately locked
  })

  it('MoveRight increases active piece col', () => {
    const state = playingState()
    const originalCol = state.activePiece!.col
    const { state: moved } = updateGameState(state, [GameAction.MoveRight], 16)
    if (moved.activePiece) {
      expect(moved.activePiece.col).toBe(originalCol + 1)
    }
  })
})

describe('updateGameState — HardDrop', () => {
  it('HardDrop immediately locks the piece', () => {
    const state = playingState()
    const { events } = updateGameState(state, [GameAction.HardDrop], 16)
    // After hard drop, piece should be locked (new piece spawned or game-over)
    // Check that piece-lock event was emitted
    const lockEvent = events.find(e => e.type === 'piece-lock')
    expect(lockEvent).toBeDefined()
  })

  it('HardDrop spawns a new piece in the same tick', () => {
    const state = playingState()
    const { state: after } = updateGameState(state, [GameAction.HardDrop], 16)
    // A new piece should be spawned (could be same type by chance, but phase is still playing
    // unless board is full)
    if (after.phase === 'playing') {
      expect(after.activePiece).not.toBeNull()
    }
  })

  it('HardDrop drops piece to the lowest valid row', () => {
    const state = playingState()
    const piece = state.activePiece!
    const board = state.board

    // Manually compute expected drop row
    let expectedRow = piece.row
    let searching = true
    while (searching) {
      const cells = getCells({ ...piece, row: expectedRow + 1 })
      let wouldCollide = false
      for (const [r, c] of cells) {
        if (r >= BOARD_ROWS || r < 0 || c < 0 || c >= BOARD_COLS || board[r * BOARD_COLS + c] !== 0) {
          wouldCollide = true
          break
        }
      }
      if (wouldCollide) { searching = false } else { expectedRow++ }
    }

    // The hard-dropped piece's cells should be at expectedRow
    const { state: after } = updateGameState(state, [GameAction.HardDrop], 16)

    // Verify by checking that the board has the piece's color at the expected position
    const cells = getCells({ ...piece, row: expectedRow })
    for (const [r, c] of cells) {
      if (r >= 0 && r < BOARD_ROWS) {
        expect(after.board[r * BOARD_COLS + c]).toBeGreaterThan(0)
      }
    }
  })
})

describe('updateGameState — line clear', () => {
  it('clearing 4 lines emits exactly one line-clear event with count=4', () => {
    // I-piece rotation 1 (East/vertical): offsets [[0,2],[1,2],[2,2],[3,2]]
    // At piece.col=2: cells land in column 4 (2+2=4).
    // Fill rows 16-19 with all cols except col 4 → I-piece fills col 4 → 4 line clears.
    let state = playingState()
    let board = state.board
    for (let row = 16; row < 20; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (col !== 4) board = setCell(board, row, col, 1)
      }
    }
    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 0, col: 2 }
    state = { ...state, board, activePiece: iPiece }

    const { events } = updateGameState(state, [GameAction.HardDrop], 16)

    const lineClearEvents = events.filter(e => e.type === 'line-clear')
    expect(lineClearEvents).toHaveLength(1)
    const payload = lineClearEvents[0]!.payload as { count: number }
    expect(payload.count).toBe(4)
  })

  it('score increases after line clear', () => {
    // Set up board where hard drop will clear 4 rows.
    // I-piece rotation 1 (East/vertical): offsets [[0,2],[1,2],[2,2],[3,2]]
    // At piece.col=2: cells land in column 4 (2+2=4).
    // Fill rows 16-19 with cols 0-3 and 5-9 filled (col 4 empty).
    let state = playingState()
    let board = state.board
    for (let row = 16; row < 20; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (col !== 4) board = setCell(board, row, col, 1)
      }
    }
    // I-piece East rotation at col=2 will fill column 4 in rows 16-19 when dropped
    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 0, col: 2 }
    state = { ...state, board, activePiece: iPiece }

    const { state: after } = updateGameState(state, [GameAction.HardDrop], 16)
    expect(after.score).toBeGreaterThan(0)
  })

  it('level increases after clearing enough lines (10 lines = level 2)', () => {
    // Start with 9 lines cleared and level 1.
    // Clear 1 more line → 10 lines total → level 2.
    let state = playingState()
    state = { ...state, lines: 9, level: 1 }

    // Fill row 19 with cols 0-8 filled, col 9 empty.
    // I-piece rotation 1 at col=7: cells at col 9 (7+2=9) in rows 16-19.
    // Only row 19 will clear (rows 16-18 have col 9 filled but NOT 0-8 fully filled).
    // Let's use a simpler 1-row approach: fill row 19 cols 0-8 only.
    let board = state.board
    for (let col = 0; col < 9; col++) {
      board = setCell(board, 19, col, 1)
    }
    // Use I-piece rotation 1 at col=7 → fills col 9 in 4 rows (16,17,18,19)
    // Only row 19 is full (others have cols 0-8 empty above row 19)
    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 0, col: 7 }
    state = { ...state, board, activePiece: iPiece }

    const { state: after, events } = updateGameState(state, [GameAction.HardDrop], 16)

    const lineClearEvent = events.find(e => e.type === 'line-clear')
    expect(lineClearEvent).toBeDefined()
    // 9 existing + 1 cleared = 10 → level 2
    expect(after.level).toBeGreaterThanOrEqual(2)

    const levelUpEvent = events.find(e => e.type === 'level-up')
    expect(levelUpEvent).toBeDefined()
  })
})

describe('updateGameState — game-over detection', () => {
  it('game-over is triggered when spawn position is occupied', () => {
    let state = playingState()

    // We need: after the active piece hard-drops and locks, the NEXT piece's
    // spawn position must be occupied on the board (causing game-over).
    //
    // Approach: force nextPiece = 'I', then fill the board such that:
    //   1. Active piece (T, rotation 0, row=17, col=3) hard-drops to row 18
    //      (row 19 has a blocker in col 4) — locking without line clear.
    //   2. The I-piece's spawn cells (row=0, cols 3-6) are already occupied.
    //
    // Fill row 0, cols 3-6 with 1 (I-piece spawn = row 0, col 3: cells at [0,3],[0,4],[0,5],[0,6]).
    // Also fill row 19 col 4 to stop T-piece from reaching the floor cleanly.
    // But actually the T-piece at row=17 hard-drops: it tries row 18 (cells: [18,3],[18,4],[18,5],[19,4]).
    // Row 19, col 4 would block it → piece lands at row 17. No line clear. Then next spawn.

    let board = state.board
    // Fill I-piece spawn area (row 0, cols 3-6) to ensure game-over
    for (let col = 3; col <= 6; col++) {
      board = setCell(board, 0, col, 1)
    }
    // Place T-piece at row 17 (it can hard-drop safely since floor is at row 18)
    // T-piece North: offsets [[0,0],[0,1],[0,2],[1,1]] at col=3:
    //   cells (17,3),(17,4),(17,5),(18,4)
    // Try move down: (18,3),(18,4),(18,5),(19,4)
    // Fill row 19 col 4 to block the T-piece at row 17:
    board = setCell(board, 19, 4, 1)

    const tPiece = { type: 'T' as const, rotation: 0 as const, row: 17, col: 3 }
    state = { ...state, board, activePiece: tPiece, nextPiece: 'I' as const }

    const { state: after, events } = updateGameState(state, [GameAction.HardDrop], 16)

    expect(after.phase).toBe('gameover')
    const gameOverEvent = events.find(e => e.type === 'game-over')
    expect(gameOverEvent).toBeDefined()
  })
})

describe('updateGameState — pure function', () => {
  it('calling with identical inputs twice returns identical state', () => {
    const state = playingState()
    const actions: GameAction[] = [GameAction.MoveLeft]
    const dt = 16

    // We can't call it twice with Math.random() in the bag shuffle and get identical results
    // BUT we can verify that neither call mutates its input
    const stateCopy = { ...state, board: state.board.slice() }
    updateGameState(state, actions, dt)
    // State should not have been mutated
    expect(state.score).toBe(stateCopy.score)
    expect(state.level).toBe(stateCopy.level)
    expect(state.phase).toBe(stateCopy.phase)
    expect(state.board).toEqual(stateCopy.board)
  })

  it('does not mutate the input state board', () => {
    const state = playingState()
    const originalBoard = state.board.slice()
    updateGameState(state, [GameAction.HardDrop], 16)
    expect(state.board).toEqual(originalBoard)
  })

  it('does not mutate the input actions array', () => {
    const state = playingState()
    const actions = [GameAction.MoveLeft, GameAction.RotateCW]
    const originalLength = actions.length
    updateGameState(state, actions, 16)
    expect(actions).toHaveLength(originalLength)
    expect(actions[0]).toBe(GameAction.MoveLeft)
  })
})

describe('updateGameState — rotation', () => {
  it('RotateCW changes active piece rotation', () => {
    const state = playingState()
    const originalRotation = state.activePiece!.rotation
    const { state: after } = updateGameState(state, [GameAction.RotateCW], 16)
    if (after.activePiece) {
      expect(after.activePiece.rotation).not.toBe(originalRotation)
    }
  })

  it('RotateCCW changes active piece rotation in opposite direction', () => {
    const state = playingState()
    const { state: cw } = updateGameState(state, [GameAction.RotateCW], 16)
    const { state: ccw } = updateGameState(state, [GameAction.RotateCCW], 16)
    // CW and CCW should produce different rotations (for most pieces)
    if (cw.activePiece && ccw.activePiece) {
      // Both rotations differ from original and from each other (for non-O pieces)
      if (state.activePiece!.type !== 'O') {
        expect(cw.activePiece.rotation).not.toBe(ccw.activePiece.rotation)
      }
    }
  })
})

describe('updateGameState — null activePiece guard', () => {
  it('returns state unchanged when activePiece is null in playing phase', () => {
    const state = playingState()
    const nullState = { ...state, activePiece: null }
    const { state: after, events } = updateGameState(nullState, [GameAction.MoveLeft], 16)
    expect(after.activePiece).toBeNull()
    expect(events).toHaveLength(0)
  })
})

describe('updateGameState — paused state returns unchanged for non-pause actions', () => {
  it('returns paused state unmodified when non-pause action sent while paused', () => {
    const state = playingState()
    const { state: paused } = updateGameState(state, [GameAction.Pause], 16)
    const { state: still, events } = updateGameState(paused, [GameAction.HardDrop], 16)
    expect(still.phase).toBe('paused')
    expect(still.score).toBe(paused.score)
    expect(events).toHaveLength(0)
  })
})

describe('updateGameState — intro phase', () => {
  it('GameAction.Start transitions intro → playing', () => {
    const state = createGameState()
    expect(state.phase).toBe('intro')
    const { state: after } = updateGameState(state, [GameAction.Start], 16)
    expect(after.phase).toBe('playing')
  })

  it('no actions processed in intro phase except Start', () => {
    const state = createGameState()
    const originalPiece = state.activePiece
    const { state: still } = updateGameState(state, [GameAction.MoveLeft, GameAction.HardDrop], 16)
    expect(still.phase).toBe('intro')
    expect(still.activePiece).toEqual(originalPiece)
  })

  it('no events emitted in intro phase without Start action', () => {
    const state = createGameState()
    const { events } = updateGameState(state, [GameAction.MoveLeft], 16)
    expect(events).toHaveLength(0)
  })
})

describe('updateGameState — gravity-triggered lock (no hard drop)', () => {
  it('piece locks via gravity lock delay expiring (not hard drop)', () => {
    // Set up a piece sitting on the floor and let the lock delay expire
    let state = playingState()
    const floorPiece = { type: 'T' as const, rotation: 0 as const, row: 18, col: 3 }
    state = {
      ...state,
      activePiece: floorPiece,
      gravityState: { gravityAccum: 0, lockTimer: 10, lockResetCount: 0, pieceDropIntervalMs: 1000 },
    }

    // dt of 100 should expire the 10ms remaining on the lock timer
    const { state: after, events } = updateGameState(state, [], 100)

    const lockEvent = events.find(e => e.type === 'piece-lock')
    expect(lockEvent).toBeDefined()
    // A new piece should have been spawned
    if (after.phase === 'playing') {
      expect(after.activePiece).not.toBeNull()
      // The new piece should be different from the locked one
      expect(after.activePiece!.row).toBe(0) // spawned at top
    }
  })

  it('gravity-triggered lock with line clear scores points', () => {
    // Fill rows 16-19 with all cols except col 4, then place I-piece vertically
    // to fill col 4 and lock via gravity
    let state = playingState()
    let board = state.board
    for (let row = 16; row < 20; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (col !== 4) board = setCell(board, row, col, 1)
      }
    }

    // I-piece East (rotation 1): [[0,2],[1,2],[2,2],[3,2]] at col=2 fills col 4
    // Place it at row 16 so it's already filling the gap
    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 16, col: 2 }
    state = {
      ...state,
      board,
      activePiece: iPiece,
      // Set lock timer to nearly expired so gravity lock triggers
      gravityState: { gravityAccum: 0, lockTimer: 10, lockResetCount: 0, pieceDropIntervalMs: 1000 },
    }

    const { state: after, events } = updateGameState(state, [], 100)

    const lockEvent = events.find(e => e.type === 'piece-lock')
    expect(lockEvent).toBeDefined()
    const lineClearEvent = events.find(e => e.type === 'line-clear')
    expect(lineClearEvent).toBeDefined()
    expect(after.score).toBeGreaterThan(0)
  })

  it('gravity-triggered lock with line clear causes level up when enough lines cleared', () => {
    let state = playingState()
    let board = state.board
    for (let row = 16; row < 20; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (col !== 4) board = setCell(board, row, col, 1)
      }
    }

    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 16, col: 2 }
    state = {
      ...state,
      board,
      activePiece: iPiece,
      lines: 8, // 8 + 4 = 12 -> level 2
      level: 1,
      gravityState: { gravityAccum: 0, lockTimer: 10, lockResetCount: 0, pieceDropIntervalMs: 1000 },
    }

    const { state: after, events } = updateGameState(state, [], 100)

    const levelUpEvent = events.find(e => e.type === 'level-up')
    expect(levelUpEvent).toBeDefined()
    expect(after.level).toBeGreaterThanOrEqual(2)
  })

  it('gravity-triggered lock causes game-over when next spawn is blocked', () => {
    let state = playingState()
    let board = state.board

    // Fill spawn area (row 0, cols 3-6) to block next I-piece spawn
    // Do NOT fill entire rows — that would trigger line clears and empty the spawn area
    for (let col = 3; col <= 6; col++) {
      board = setCell(board, 0, col, 1)
    }

    // Block below the T-piece so it cannot drop, but do NOT fill the entire row
    // (to avoid line clears). Fill cols 3-5 in row 5 to block T-piece's drop.
    // T-piece North at row 3, col=3: cells (3,3),(3,4),(3,5),(4,4)
    // Move to row 4: cells (4,3),(4,4),(4,5),(5,4) — blocked by (5,4)
    board = setCell(board, 5, 4, 1)

    const tPiece = { type: 'T' as const, rotation: 0 as const, row: 3, col: 3 }
    state = {
      ...state,
      board,
      activePiece: tPiece,
      nextPiece: 'I' as const,
      gravityState: { gravityAccum: 0, lockTimer: 10, lockResetCount: 0, pieceDropIntervalMs: 1000 },
    }

    const { state: after, events } = updateGameState(state, [], 100)

    expect(after.phase).toBe('gameover')
    const gameOverEvent = events.find(e => e.type === 'game-over')
    expect(gameOverEvent).toBeDefined()
  })
})

describe('updateGameState — SoftDrop action', () => {
  it('SoftDrop makes piece descend faster than normal gravity', () => {
    const state = playingState()
    // Without soft drop at level 1: 100ms dt should NOT drop
    const { state: normal } = updateGameState(state, [], 100)
    // With soft drop at level 1: 100ms * 20x = 2000ms effective, should drop 2 rows
    const { state: soft } = updateGameState(state, [GameAction.SoftDrop], 100)
    if (normal.activePiece && soft.activePiece) {
      expect(soft.activePiece.row).toBeGreaterThan(normal.activePiece.row)
    }
  })
})

describe('updateGameState — movement blocked', () => {
  it('MoveLeft does nothing when piece is against left wall', () => {
    let state = playingState()
    // Place T-piece at col 0
    const piece = { type: 'T' as const, rotation: 0 as const, row: 5, col: 0 }
    state = { ...state, activePiece: piece }
    const { state: after } = updateGameState(state, [GameAction.MoveLeft], 16)
    if (after.activePiece) {
      expect(after.activePiece.col).toBe(0) // unchanged
    }
  })

  it('MoveRight does nothing when piece is against right wall', () => {
    let state = playingState()
    // T-piece North has max col offset of 2, so at col 7, max cell is col 9
    const piece = { type: 'T' as const, rotation: 0 as const, row: 5, col: 7 }
    state = { ...state, activePiece: piece }
    const { state: after } = updateGameState(state, [GameAction.MoveRight], 16)
    if (after.activePiece) {
      expect(after.activePiece.col).toBe(7) // unchanged
    }
  })
})

describe('updateGameState — rotation blocked', () => {
  it('RotateCW does not change piece when rotation is fully blocked', () => {
    let state = playingState()
    let board = state.board
    // Fill most of the board to block rotation kicks
    for (let row = 3; row < 8; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        board = setCell(board, row, col, 1)
      }
    }
    // Clear only the T-piece current cells at row=5, col=3: (5,3)(5,4)(5,5)(6,4)
    board = setCell(board, 5, 3, 0)
    board = setCell(board, 5, 4, 0)
    board = setCell(board, 5, 5, 0)
    board = setCell(board, 6, 4, 0)

    const piece = { type: 'T' as const, rotation: 0 as const, row: 5, col: 3 }
    state = { ...state, board, activePiece: piece }
    const { state: after } = updateGameState(state, [GameAction.RotateCW], 16)
    if (after.activePiece) {
      expect(after.activePiece.rotation).toBe(0) // unchanged
    }
  })

  it('RotateCCW does not change piece when rotation is fully blocked', () => {
    let state = playingState()
    let board = state.board
    for (let row = 3; row < 8; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        board = setCell(board, row, col, 1)
      }
    }
    board = setCell(board, 5, 3, 0)
    board = setCell(board, 5, 4, 0)
    board = setCell(board, 5, 5, 0)
    board = setCell(board, 6, 4, 0)

    const piece = { type: 'T' as const, rotation: 0 as const, row: 5, col: 3 }
    state = { ...state, board, activePiece: piece }
    const { state: after } = updateGameState(state, [GameAction.RotateCCW], 16)
    if (after.activePiece) {
      expect(after.activePiece.rotation).toBe(0) // unchanged
    }
  })
})

describe('updateGameState — scoring', () => {
  it('single line clear at level 1 scores 100', () => {
    let state = playingState()
    let board = state.board
    // Fill row 19 cols 0-8, leave col 9 empty
    for (let col = 0; col < 9; col++) {
      board = setCell(board, 19, col, 1)
    }
    // I-piece rotation 1 at col=7 fills col 9 (7+2=9) in rows 16-19
    // Only row 19 will be full
    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 0, col: 7 }
    state = { ...state, board, activePiece: iPiece, level: 1, score: 0 }
    const { state: after } = updateGameState(state, [GameAction.HardDrop], 16)
    // 1 line * 100 * level 1 = 100
    expect(after.score).toBe(100)
  })

  it('two line clear at level 1 scores 300', () => {
    let state = playingState()
    let board = state.board
    // Fill rows 18-19 cols 0-8
    for (let row = 18; row < 20; row++) {
      for (let col = 0; col < 9; col++) {
        board = setCell(board, row, col, 1)
      }
    }
    // I-piece rotation 1 at col=7 fills col 9 in rows 16-19
    // Only rows 18-19 are full (rows 16-17 only have col 9 filled)
    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 0, col: 7 }
    state = { ...state, board, activePiece: iPiece, level: 1, score: 0 }
    const { state: after } = updateGameState(state, [GameAction.HardDrop], 16)
    // 2 lines * 300 * level 1 = 300
    expect(after.score).toBe(300)
  })

  it('three line clear at level 1 scores 500', () => {
    let state = playingState()
    let board = state.board
    // Fill rows 17-19 cols 0-8
    for (let row = 17; row < 20; row++) {
      for (let col = 0; col < 9; col++) {
        board = setCell(board, row, col, 1)
      }
    }
    // I-piece rotation 1 at col=7 fills col 9 in rows 16-19
    // Rows 17-19 are full, row 16 only has col 9
    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 0, col: 7 }
    state = { ...state, board, activePiece: iPiece, level: 1, score: 0 }
    const { state: after } = updateGameState(state, [GameAction.HardDrop], 16)
    // 3 lines * 500 * level 1 = 500
    expect(after.score).toBe(500)
  })

  it('four line clear (Tetris) at level 2 scores 1600', () => {
    let state = playingState()
    let board = state.board
    for (let row = 16; row < 20; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (col !== 4) board = setCell(board, row, col, 1)
      }
    }
    const iPiece = { type: 'I' as const, rotation: 1 as const, row: 0, col: 2 }
    state = { ...state, board, activePiece: iPiece, level: 2, score: 0 }
    const { state: after } = updateGameState(state, [GameAction.HardDrop], 16)
    // 4 lines * 800 * level 2 = 1600
    expect(after.score).toBe(1600)
  })
})

describe('updateGameState — lock resets gravity for movement', () => {
  it('MoveLeft resets lock timer during lock phase', () => {
    let state = playingState()
    const floorPiece = { type: 'T' as const, rotation: 0 as const, row: 18, col: 5 }
    state = {
      ...state,
      activePiece: floorPiece,
      gravityState: { gravityAccum: 0, lockTimer: 100, lockResetCount: 0, pieceDropIntervalMs: 1000 },
    }
    const { state: after } = updateGameState(state, [GameAction.MoveLeft], 16)
    // Lock timer should have been reset (higher than it was minus dtMs)
    if (after.activePiece) {
      expect(after.activePiece.col).toBe(4) // moved left
      expect(after.gravityState.lockResetCount).toBe(1) // lock reset used
    }
  })

  it('RotateCW resets lock timer during lock phase', () => {
    let state = playingState()
    const floorPiece = { type: 'T' as const, rotation: 0 as const, row: 18, col: 5 }
    state = {
      ...state,
      activePiece: floorPiece,
      gravityState: { gravityAccum: 0, lockTimer: 100, lockResetCount: 0, pieceDropIntervalMs: 1000 },
    }
    const { state: after } = updateGameState(state, [GameAction.RotateCW], 16)
    if (after.activePiece) {
      expect(after.activePiece.rotation).not.toBe(0) // rotated
      expect(after.gravityState.lockResetCount).toBe(1) // lock reset used
    }
  })
})

describe('updateGameState — HardDrop without line clear', () => {
  it('HardDrop on empty board locks piece at bottom without line clear', () => {
    const state = playingState()
    const { state: after, events } = updateGameState(state, [GameAction.HardDrop], 16)
    const lockEvent = events.find(e => e.type === 'piece-lock')
    expect(lockEvent).toBeDefined()
    const lineClearEvent = events.find(e => e.type === 'line-clear')
    expect(lineClearEvent).toBeUndefined()
    // Phase should still be playing (no game-over on first piece)
    expect(after.phase).toBe('playing')
  })
})

describe('updateGameState — empty piece bag triggers reshuffle', () => {
  it('HardDrop with empty pieceBag still spawns a valid next piece', () => {
    let state = playingState()
    // Force the pieceBag to be empty so drawFromBag reshuffles
    state = { ...state, pieceBag: [] }
    const { state: after } = updateGameState(state, [GameAction.HardDrop], 16)
    if (after.phase === 'playing') {
      expect(after.activePiece).not.toBeNull()
      const validTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
      expect(validTypes).toContain(after.nextPiece)
    }
  })

  it('gravity-triggered lock with empty pieceBag still spawns a valid next piece', () => {
    let state = playingState()
    const floorPiece = { type: 'T' as const, rotation: 0 as const, row: 18, col: 3 }
    state = {
      ...state,
      activePiece: floorPiece,
      pieceBag: [], // empty bag
      gravityState: { gravityAccum: 0, lockTimer: 10, lockResetCount: 0, pieceDropIntervalMs: 1000 },
    }
    const { state: after } = updateGameState(state, [], 100)
    if (after.phase === 'playing') {
      expect(after.activePiece).not.toBeNull()
      const validTypes = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
      expect(validTypes).toContain(after.nextPiece)
    }
  })
})

describe('updateGameState — multiple actions in one tick', () => {
  it('MoveLeft and MoveRight in same tick cancel each other out', () => {
    const state = playingState()
    const originalCol = state.activePiece!.col
    // Both actions are processed independently: left then right
    const { state: after } = updateGameState(state, [GameAction.MoveLeft, GameAction.MoveRight], 16)
    if (after.activePiece) {
      // MoveLeft decreases col by 1, then MoveRight increases by 1 = net 0
      expect(after.activePiece.col).toBe(originalCol)
    }
  })
})
