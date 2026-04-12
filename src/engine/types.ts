/**
 * Shared types and enums for the falling-block puzzle game engine.
 * This file has no imports — it is the root of the type tree.
 * All layers (engine, renderer, input, ui) may import from here.
 */

/** The 7 tetromino piece types. */
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

/** Rotation state: 0=North, 1=East, 2=South, 3=West */
export type Rotation = 0 | 1 | 2 | 3

/**
 * Actions the player can take. Defined in engine/types so the engine can
 * accept them without importing from input/, preserving layer boundaries.
 */
export enum GameAction {
  MoveLeft = 'MoveLeft',
  MoveRight = 'MoveRight',
  RotateCW = 'RotateCW',
  RotateCCW = 'RotateCCW',
  SoftDrop = 'SoftDrop',
  HardDrop = 'HardDrop',
  Pause = 'Pause',
  Start = 'Start',
}

/** Types of events the engine can emit during a tick. */
export type GameEventType = 'line-clear' | 'piece-lock' | 'level-up' | 'game-over'

/** An event emitted by the engine. Payload is event-specific. */
export interface GameEvent {
  type: GameEventType
  payload?: unknown
}
