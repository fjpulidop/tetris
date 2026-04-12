/**
 * Gravity and lock-delay logic for the falling-block puzzle game.
 * All functions are pure — they operate on GravityState and return new state.
 */

import type { Board } from './board.js'
import { isCollision } from './board.js'
import { getCells } from './rotation.js'
import type { ActivePiece } from './rotation.js'

/**
 * Drop interval in milliseconds per row, indexed by level - 1.
 * Level 1 = index 0 = 1000ms per row drop.
 * Level 20 = index 19 = ~83ms per row drop.
 *
 * Values approximate the Guideline gravity formula.
 */
export const GRAVITY_TABLE: readonly number[] = [
  1000, // Level 1
  793,  // Level 2
  618,  // Level 3
  473,  // Level 4
  355,  // Level 5
  262,  // Level 6
  190,  // Level 7
  135,  // Level 8
  94,   // Level 9
  64,   // Level 10
  43,   // Level 11
  28,   // Level 12
  18,   // Level 13
  11,   // Level 14
  7,    // Level 15
  5,    // Level 16
  4,    // Level 17
  3,    // Level 18
  2,    // Level 19
  1,    // Level 20 (~83ms, capped)
]

/** Lock delay: piece locks after this many ms without movement at floor level. */
export const LOCK_DELAY_MS = 500

/**
 * Maximum number of lock-delay resets per piece placement.
 * Prevents infinite-hold cheese strategies.
 */
export const MAX_LOCK_RESETS = 15

/**
 * Gravity accumulator and lock-delay timer state.
 * This is stored inside GameState to keep updateGameState pure.
 */
export interface GravityState {
  /** Accumulated milliseconds toward the next gravity drop. */
  gravityAccum: number
  /**
   * Ms remaining before the piece locks.
   * -1 means the piece is NOT in lock phase (it can still move down).
   */
  lockTimer: number
  /** Number of times the lock timer has been reset for this piece. */
  lockResetCount: number
}

/** Return the initial gravity state for a newly spawned piece. */
export function initialGravityState(): GravityState {
  return {
    gravityAccum: 0,
    lockTimer: -1,
    lockResetCount: 0,
  }
}

/** Result of applying gravity for one tick. */
export interface ApplyGravityResult {
  piece: ActivePiece
  gravityState: GravityState
  /** True when the piece should be locked to the board on this tick. */
  locked: boolean
}

/**
 * Apply gravity (and lock delay) for a single logic tick.
 *
 * @param gravityState - Current gravity state
 * @param board - Current board (used for collision detection)
 * @param piece - Current active piece
 * @param dtMs - Elapsed time in milliseconds for this tick
 * @param level - Current game level (1-indexed), determines drop speed
 * @param softDrop - If true, gravity is applied at 20x speed this tick
 * @returns New piece position, updated gravity state, and whether the piece locked
 */
export function applyGravity(
  gravityState: GravityState,
  board: Board,
  piece: ActivePiece,
  dtMs: number,
  level: number,
  softDrop = false
): ApplyGravityResult {
  // Clamp level to valid range
  const clampedLevel = Math.max(1, Math.min(level, GRAVITY_TABLE.length))
  const baseInterval = GRAVITY_TABLE[clampedLevel - 1] ?? GRAVITY_TABLE[GRAVITY_TABLE.length - 1]!

  // Soft drop multiplies speed by 20x (Guideline standard)
  const interval = softDrop ? Math.max(1, baseInterval / 20) : baseInterval

  let newAccum = gravityState.gravityAccum + dtMs
  let currentPiece = piece
  let newLockTimer = gravityState.lockTimer
  const newLockResetCount = gravityState.lockResetCount

  // Drain accumulated time in row-drop intervals
  while (newAccum >= interval) {
    newAccum -= interval

    // Try to move down by 1
    const movedDown: ActivePiece = { ...currentPiece, row: currentPiece.row + 1 }
    const blocked = isCollision(board, getCells(movedDown))

    if (!blocked) {
      currentPiece = movedDown
      // Successfully moved down — exit lock phase
      newLockTimer = -1
    } else {
      // Cannot move down — enter or continue lock phase
      if (newLockTimer < 0) {
        // Start lock timer
        newLockTimer = LOCK_DELAY_MS
      }
      // Stop trying to drop further
      break
    }
  }

  // Check if piece is at floor (cannot move down) after gravity resolution
  const atFloor = isCollision(board, getCells({ ...currentPiece, row: currentPiece.row + 1 }))

  if (atFloor && newLockTimer < 0) {
    // Start lock timer if we didn't already
    newLockTimer = LOCK_DELAY_MS
  }

  // Advance lock timer if active
  let locked = false
  if (newLockTimer >= 0) {
    newLockTimer -= dtMs
    if (newLockTimer <= 0) {
      locked = true
      newLockTimer = -1
    }
  }

  return {
    piece: currentPiece,
    gravityState: {
      gravityAccum: newAccum,
      lockTimer: newLockTimer,
      lockResetCount: newLockResetCount,
    },
    locked,
  }
}

/**
 * Reset the lock timer when the player successfully moves or rotates
 * during the lock phase. Capped by MAX_LOCK_RESETS.
 *
 * @returns Updated GravityState with reset lock timer, or unchanged if cap reached
 */
export function resetLockTimer(gravityState: GravityState): GravityState {
  if (gravityState.lockTimer < 0) {
    // Not in lock phase, nothing to reset
    return gravityState
  }

  if (gravityState.lockResetCount >= MAX_LOCK_RESETS) {
    // Cap reached — do not reset
    return gravityState
  }

  return {
    ...gravityState,
    lockTimer: LOCK_DELAY_MS,
    lockResetCount: gravityState.lockResetCount + 1,
  }
}
