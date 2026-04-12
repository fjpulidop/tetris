import { describe, it, expect } from 'vitest'
import { emptyBoard, setCell } from '../../engine/board.js'
import {
  applyGravity,
  initialGravityState,
  resetLockTimer,
  GRAVITY_TABLE,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
} from '../../engine/gravity.js'
import type { ActivePiece } from '../../engine/rotation.js'

/** A T-piece floating in open space. */
function floatingPiece(): ActivePiece {
  return { type: 'T', rotation: 0, row: 0, col: 3 }
}

/** A T-piece sitting on the floor (row 18 = cells at 18,18,18,19 for T-piece). */
function pieceOnFloor(): ActivePiece {
  // T-piece North: offsets [[0,0],[0,1],[0,2],[1,1]]
  // At row 18 the lowest cell is row 19 (== BOARD_ROWS - 1)
  return { type: 'T', rotation: 0, row: 18, col: 3 }
}

describe('GRAVITY_TABLE', () => {
  it('has 20 entries (one per level)', () => {
    expect(GRAVITY_TABLE).toHaveLength(20)
  })

  it('level 1 has ~1000ms interval', () => {
    expect(GRAVITY_TABLE[0]).toBe(1000)
  })

  it('intervals decrease as level increases', () => {
    for (let i = 1; i < GRAVITY_TABLE.length; i++) {
      expect(GRAVITY_TABLE[i]!).toBeLessThanOrEqual(GRAVITY_TABLE[i - 1]!)
    }
  })
})

describe('initialGravityState', () => {
  it('starts with zero accumulator', () => {
    const state = initialGravityState()
    expect(state.gravityAccum).toBe(0)
  })

  it('starts with lock timer at -1 (not in lock phase)', () => {
    const state = initialGravityState()
    expect(state.lockTimer).toBe(-1)
  })

  it('starts with zero lock resets', () => {
    const state = initialGravityState()
    expect(state.lockResetCount).toBe(0)
  })
})

describe('applyGravity — normal drop', () => {
  it('does not drop piece after 500ms at level 1 (interval is 1000ms)', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    const result = applyGravity(gravState, board, piece, 500, 1)
    expect(result.piece.row).toBe(piece.row)
    expect(result.locked).toBe(false)
  })

  it('drops piece by 1 row after 1000ms at level 1', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    const result = applyGravity(gravState, board, piece, 1000, 1)
    expect(result.piece.row).toBe(piece.row + 1)
    expect(result.locked).toBe(false)
  })

  it('accumulates gravity across multiple ticks', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    let gravState = initialGravityState()
    // Two ticks of 500ms each = 1000ms total
    const result1 = applyGravity(gravState, board, piece, 500, 1)
    gravState = result1.gravityState
    const result2 = applyGravity(gravState, board, result1.piece, 500, 1)
    expect(result2.piece.row).toBe(piece.row + 1)
  })

  it('drops multiple rows in one tick if enough time accumulated', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    // 2000ms at level 1 (1000ms/row) should drop 2 rows
    const result = applyGravity(gravState, board, piece, 2000, 1)
    expect(result.piece.row).toBe(piece.row + 2)
  })
})

describe('applyGravity — lock delay', () => {
  it('lock timer starts when piece cannot move down', () => {
    const board = emptyBoard()
    const piece = pieceOnFloor()
    const gravState = initialGravityState()
    const result = applyGravity(gravState, board, piece, 100, 1)
    // Not locked yet (timer has not expired)
    expect(result.locked).toBe(false)
    // Lock timer should be active
    expect(result.gravityState.lockTimer).toBeGreaterThan(0)
  })

  it('locked is false before LOCK_DELAY_MS expires', () => {
    const board = emptyBoard()
    const piece = pieceOnFloor()
    let gravState = initialGravityState()
    // Apply many small ticks that don't sum to LOCK_DELAY_MS
    const halfDelay = LOCK_DELAY_MS / 2
    const result1 = applyGravity(gravState, board, piece, 1, 1) // start lock
    gravState = result1.gravityState
    const result2 = applyGravity(gravState, board, piece, halfDelay - 1, 1)
    expect(result2.locked).toBe(false)
  })

  it('locked is true after LOCK_DELAY_MS expires', () => {
    const board = emptyBoard()
    const piece = pieceOnFloor()
    const gravState = initialGravityState()
    // Large tick to trigger lock timer AND expire it
    const result = applyGravity(gravState, board, piece, LOCK_DELAY_MS + 100, 1)
    expect(result.locked).toBe(true)
  })

  it('lock timer does not start when piece can still move down', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    const result = applyGravity(gravState, board, piece, 100, 1)
    // Piece is not at floor, lock timer should remain -1
    expect(result.gravityState.lockTimer).toBe(-1)
  })
})

describe('applyGravity — soft drop', () => {
  it('soft drop increases gravity speed (drops faster)', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    // Without soft drop: need 1000ms to drop 1 row at level 1
    // With soft drop (20x): 1000/20 = 50ms per row
    const resultNormal = applyGravity(gravState, board, piece, 100, 1, false)
    const resultSoft = applyGravity(gravState, board, piece, 100, 1, true)
    expect(resultSoft.piece.row).toBeGreaterThan(resultNormal.piece.row)
  })
})

describe('resetLockTimer', () => {
  it('resets lock timer to LOCK_DELAY_MS when in lock phase', () => {
    // First simulate entering lock phase
    const board = emptyBoard()
    const piece = pieceOnFloor()
    const gravState = initialGravityState()
    const afterLockStart = applyGravity(gravState, board, piece, 100, 1)
    const timer = afterLockStart.gravityState.lockTimer
    expect(timer).toBeGreaterThan(0)

    const reset = resetLockTimer(afterLockStart.gravityState)
    expect(reset.lockTimer).toBe(LOCK_DELAY_MS)
  })

  it('increments lockResetCount on each reset', () => {
    const board = emptyBoard()
    const piece = pieceOnFloor()
    const gravState = initialGravityState()
    const afterLockStart = applyGravity(gravState, board, piece, 100, 1)

    const reset1 = resetLockTimer(afterLockStart.gravityState)
    expect(reset1.lockResetCount).toBe(1)

    const reset2 = resetLockTimer(reset1)
    expect(reset2.lockResetCount).toBe(2)
  })

  it('does not reset when cap is reached', () => {
    // Simulate a state at the cap
    const gravStateAtCap = {
      gravityAccum: 0,
      lockTimer: 100, // active lock phase but running out
      lockResetCount: MAX_LOCK_RESETS,
    }
    const result = resetLockTimer(gravStateAtCap)
    // Timer should NOT be reset since cap reached
    expect(result.lockTimer).toBe(100)
    expect(result.lockResetCount).toBe(MAX_LOCK_RESETS)
  })

  it('does nothing when not in lock phase (lockTimer === -1)', () => {
    const gravState = initialGravityState() // lockTimer = -1
    const result = resetLockTimer(gravState)
    expect(result.lockTimer).toBe(-1)
    expect(result.lockResetCount).toBe(0)
  })
})

describe('applyGravity — blocked by existing cells', () => {
  it('piece stops above occupied cell', () => {
    // Fill row 5 so T-piece at row 3 can only drop to row 3 (row 4 would collide)
    let board = emptyBoard()
    for (let col = 0; col < 10; col++) {
      board = setCell(board, 5, col, 1)
    }
    // T-piece at row 3, North rotation: cells at [3,3],[3,4],[3,5],[4,4]
    // If it tries to drop, [4,4] is fine but [5,4] is blocked
    const piece: ActivePiece = { type: 'T', rotation: 0, row: 3, col: 3 }
    const gravState = initialGravityState()
    const result = applyGravity(gravState, board, piece, 1000, 1)
    // Piece cannot drop because row below (4+1=5) is blocked
    expect(result.piece.row).toBe(3)
  })
})

describe('applyGravity — level clamping', () => {
  it('clamps level below 1 to level 1 (1000ms interval)', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    // Level 0 (invalid) should be clamped to level 1 = 1000ms interval
    const result = applyGravity(gravState, board, piece, 1000, 0)
    expect(result.piece.row).toBe(piece.row + 1)
  })

  it('clamps level above 20 to level 20', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    // Level 25 should be clamped to level 20 (1ms interval)
    // At level 20 (1ms interval), 100ms dt should drop ~100 rows (but stopped by board floor)
    const result = applyGravity(gravState, board, piece, 100, 25)
    // Piece should have dropped significantly from row 0
    expect(result.piece.row).toBeGreaterThan(piece.row)
  })

  it('negative level is clamped to 1', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    const result = applyGravity(gravState, board, piece, 1000, -5)
    // Should behave like level 1
    expect(result.piece.row).toBe(piece.row + 1)
  })
})

describe('applyGravity — lock timer edge cases', () => {
  it('lock timer starts and piece is not locked on same tick if timer exceeds dtMs', () => {
    const board = emptyBoard()
    const piece = pieceOnFloor()
    const gravState = initialGravityState()
    // Small dt should start the lock timer but NOT lock
    const result = applyGravity(gravState, board, piece, 10, 1)
    expect(result.locked).toBe(false)
    expect(result.gravityState.lockTimer).toBeGreaterThan(0)
  })

  it('piece at floor that drops into floor via gravity enters lock phase', () => {
    // Piece is one row above floor; after 1000ms at level 1 it drops to floor
    const board = emptyBoard()
    // T-piece at row 17: after gravity drops to row 18 (lowest valid), then next drop blocked
    const piece: ActivePiece = { type: 'T', rotation: 0, row: 17, col: 3 }
    const gravState = initialGravityState()
    // After 1000ms: drops 1 row to 18, at floor → lock timer starts
    // But 1000ms dt also consumes the lock timer (500ms). So use 1001ms to just drop,
    // then a small follow-up tick to observe the lock timer.
    const result1 = applyGravity(gravState, board, piece, 1000, 1)
    expect(result1.piece.row).toBe(18) // dropped to floor
    // Now a small tick to see the lock timer is active
    const result2 = applyGravity(result1.gravityState, board, result1.piece, 10, 1)
    expect(result2.piece.row).toBe(18) // still at floor
    expect(result2.gravityState.lockTimer).toBeGreaterThan(-1) // lock timer active
    expect(result2.locked).toBe(false) // not yet locked (timer has time remaining)
  })

  it('piece exits lock phase when it successfully moves down', () => {
    // Place piece on a ledge, then simulate it dropping when ledge is removed
    let board = emptyBoard()
    for (let col = 0; col < 10; col++) {
      board = setCell(board, 10, col, 1)
    }
    // T-piece at row 8: [8,3],[8,4],[8,5],[9,4]; one row above the filled row 10
    const piece: ActivePiece = { type: 'T', rotation: 0, row: 8, col: 3 }
    const gravState = initialGravityState()
    // Small tick — piece is on the ledge (row 9+1=10 is blocked), starts lock timer
    const result = applyGravity(gravState, board, piece, 10, 1)
    expect(result.gravityState.lockTimer).toBeGreaterThan(-1) // in lock phase

    // Now use empty board — piece can drop again, lock timer should clear
    const openBoard = emptyBoard()
    const result2 = applyGravity(result.gravityState, openBoard, result.piece, 1000, 1)
    expect(result2.piece.row).toBeGreaterThan(result.piece.row) // dropped
    expect(result2.gravityState.lockTimer).toBe(-1) // exited lock phase
  })

  it('soft drop at very low interval floors to minimum of 1ms', () => {
    const board = emptyBoard()
    const piece = floatingPiece()
    const gravState = initialGravityState()
    // Level 20 has 1ms interval; soft drop = max(1, 1/20) = max(1, 0.05) = 1ms
    // 100ms dt / 1ms interval = up to 100 rows of drops
    const result = applyGravity(gravState, board, piece, 100, 20, true)
    // Should drop multiple rows
    expect(result.piece.row).toBeGreaterThan(piece.row)
  })
})
