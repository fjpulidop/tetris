/**
 * SRS rotation resolver.
 * tryRotate() attempts a piece rotation and tries SRS wall-kicks until one
 * succeeds or all 5 attempts fail.
 */

import type { PieceType, Rotation } from './types.js'
import type { Board } from './board.js'
import { isCollision } from './board.js'
import { PIECE_SHAPES, SRS_KICKS, SRS_KICKS_I } from './pieces.js'

/** An active piece on the board — type, rotation state, and absolute position. */
export interface ActivePiece {
  type: PieceType
  rotation: Rotation
  row: number
  col: number
}

/**
 * Convert a piece's position + rotation into absolute board [row, col] coordinates.
 */
export function getCells(piece: ActivePiece): readonly [number, number][] {
  const shapes = PIECE_SHAPES[piece.type]
  const shape = shapes[piece.rotation]!
  return shape.map(([dr, dc]) => [piece.row + dr, piece.col + dc] as [number, number])
}

/**
 * Attempt to rotate a piece, trying SRS wall-kick offsets until one works.
 *
 * @param board - Current board state
 * @param piece - Current piece state
 * @param direction - 'CW' (clockwise, +1) or 'CCW' (counter-clockwise, -1)
 * @returns The rotated piece on success, or null if all kicks fail
 */
export function tryRotate(
  board: Board,
  piece: ActivePiece,
  direction: 'CW' | 'CCW'
): ActivePiece | null {
  const fromRotation = piece.rotation
  // CW: (r+1)%4, CCW: (r+3)%4 (equivalent to r-1 mod 4)
  const toRotation = (direction === 'CW'
    ? (fromRotation + 1) % 4
    : (fromRotation + 3) % 4) as Rotation

  const kickKey = `${fromRotation}>${toRotation}`

  // Select the appropriate kick table: I-piece uses its own table
  const kickTable = piece.type === 'I' ? SRS_KICKS_I : SRS_KICKS
  const kicks = kickTable[kickKey]

  if (!kicks) {
    // Should never happen if tables are complete, but defensive return
    return null
  }

  for (const kick of kicks) {
    const dRow = kick[0]!
    const dCol = kick[1]!

    const candidate: ActivePiece = {
      ...piece,
      rotation: toRotation,
      row: piece.row + dRow,
      col: piece.col + dCol,
    }

    if (!isCollision(board, getCells(candidate))) {
      return candidate
    }
  }

  // All kicks failed
  return null
}
