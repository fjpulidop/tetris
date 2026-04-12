/**
 * Tetromino shape tables and SRS wall-kick data.
 *
 * All shapes are encoded as [row, col] offset arrays from the piece origin.
 * Rotation states: 0=North (spawn), 1=East, 2=South, 3=West.
 * Colors: I=1, O=2, T=3, S=4, Z=5, J=6, L=7
 *
 * SRS kick convention: [dRow, dCol] offsets applied to piece position.
 * Key format: "${fromRotation}>${toRotation}" e.g. "0>1"
 */

import type { PieceType } from './types.js'

/** A single rotation state: array of 4 [row, col] offsets from piece origin. */
export type PieceShape = readonly (readonly [number, number])[]

/**
 * All 7 piece shapes with 4 rotation states each.
 * Using standard Guideline spawn orientation (North = rotation 0).
 *
 * Coordinate system: row increases downward, col increases rightward.
 */
export const PIECE_SHAPES: Record<PieceType, readonly PieceShape[]> = {
  // I-piece: horizontal bar of 4 cells
  I: [
    // North (0): rows centered around spawn row
    [[0, 0], [0, 1], [0, 2], [0, 3]],
    // East (1): vertical bar
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    // South (2): horizontal bar (offset from North)
    [[1, 0], [1, 1], [1, 2], [1, 3]],
    // West (3): vertical bar (offset from East)
    [[0, 1], [1, 1], [2, 1], [3, 1]],
  ],
  // O-piece: 2x2 square
  O: [
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
  ],
  // T-piece
  T: [
    // North (0): T pointing up
    [[0, 0], [0, 1], [0, 2], [1, 1]],
    // East (1): T pointing right
    [[0, 1], [1, 0], [1, 1], [2, 1]],
    // South (2): T pointing down
    [[0, 1], [1, 0], [1, 1], [1, 2]],
    // West (3): T pointing left
    [[0, 0], [1, 0], [1, 1], [2, 0]],
  ],
  // S-piece
  S: [
    // North (0)
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    // East (1)
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    // South (2)
    [[0, 1], [0, 2], [1, 0], [1, 1]],
    // West (3)
    [[0, 0], [1, 0], [1, 1], [2, 1]],
  ],
  // Z-piece
  Z: [
    // North (0)
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    // East (1)
    [[0, 2], [1, 1], [1, 2], [2, 1]],
    // South (2)
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    // West (3)
    [[0, 1], [1, 0], [1, 1], [2, 0]],
  ],
  // J-piece
  J: [
    // North (0): J shape pointing left
    [[0, 0], [1, 0], [1, 1], [1, 2]],
    // East (1)
    [[0, 1], [0, 2], [1, 1], [2, 1]],
    // South (2)
    [[0, 0], [0, 1], [0, 2], [1, 2]],
    // West (3)
    [[0, 1], [1, 1], [2, 0], [2, 1]],
  ],
  // L-piece
  L: [
    // North (0): L shape pointing right
    [[0, 2], [1, 0], [1, 1], [1, 2]],
    // East (1)
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    // South (2)
    [[0, 0], [0, 1], [0, 2], [1, 0]],
    // West (3)
    [[0, 0], [0, 1], [1, 1], [2, 1]],
  ],
}

/** Color index for each piece type (1–7, maps to hex colors in renderer). */
export const PIECE_COLORS: Record<PieceType, number> = {
  I: 1,
  O: 2,
  T: 3,
  S: 4,
  Z: 5,
  J: 6,
  L: 7,
}

/**
 * SRS wall-kick data for J/L/S/T/Z pieces.
 * Key: "${fromRotation}>${toRotation}"
 * Value: array of 5 [dRow, dCol] kick offsets to try in order.
 *
 * Standard SRS kick table (Guideline). Offsets are [row_offset, col_offset].
 * Positive row = downward. Positive col = rightward.
 */
export const SRS_KICKS: Record<string, readonly (readonly [number, number])[]> = {
  '0>1': [[0, 0], [0, -1], [1, -1], [-2, 0], [-2, -1]],
  '1>0': [[0, 0], [0, 1], [-1, 1], [2, 0], [2, 1]],
  '1>2': [[0, 0], [0, 1], [-1, 1], [2, 0], [2, 1]],
  '2>1': [[0, 0], [0, -1], [1, -1], [-2, 0], [-2, -1]],
  '2>3': [[0, 0], [0, 1], [-1, 1], [-2, 0], [-2, 1]],
  '3>2': [[0, 0], [0, -1], [1, -1], [2, 0], [2, -1]],
  '3>0': [[0, 0], [0, -1], [1, -1], [-2, 0], [-2, -1]],
  '0>3': [[0, 0], [0, 1], [-1, 1], [2, 0], [2, 1]],
}

/**
 * SRS wall-kick data for the I-piece (separate table from standard pieces).
 */
export const SRS_KICKS_I: Record<string, readonly (readonly [number, number])[]> = {
  '0>1': [[0, 0], [0, -2], [0, 1], [1, -2], [-2, 1]],
  '1>0': [[0, 0], [0, 2], [0, -1], [-1, 2], [2, -1]],
  '1>2': [[0, 0], [0, -1], [0, 2], [-2, -1], [1, 2]],
  '2>1': [[0, 0], [0, 1], [0, -2], [2, 1], [-1, -2]],
  '2>3': [[0, 0], [0, 2], [0, -1], [-1, 2], [2, -1]],
  '3>2': [[0, 0], [0, -2], [0, 1], [1, -2], [-2, 1]],
  '3>0': [[0, 0], [0, 1], [0, -2], [2, 1], [-1, -2]],
  '0>3': [[0, 0], [0, -1], [0, 2], [-2, -1], [1, 2]],
}

/**
 * Standard spawn position for each piece type.
 * I-piece spawns at col=3 (cols 3–6, centered on 10-wide board).
 * O-piece spawns at col=4 (cols 4–5).
 * All others spawn at col=3 (3-wide bounding box).
 */
export function getSpawnPosition(type: PieceType): { row: number; col: number } {
  switch (type) {
    case 'I':
      return { row: 0, col: 3 }
    case 'O':
      return { row: 0, col: 4 }
    default:
      return { row: 0, col: 3 }
  }
}
