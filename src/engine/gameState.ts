/**
 * Game state machine — the top-level pure engine API.
 *
 * updateGameState() composes all engine modules into a single pure function
 * that advances the game by one logic tick. Same inputs always produce the
 * same outputs (no side effects, no module-level mutable state).
 */

import type { PieceType, Rotation, GameEvent } from './types.js'
import { GameAction } from './types.js'
import { BOARD_COLS, BOARD_ROWS, emptyBoard, setCell, isCollision } from './board.js'
import type { Board } from './board.js'
import { PIECE_COLORS, getSpawnPosition } from './pieces.js'
import type { ActivePiece } from './rotation.js'
import { tryRotate, getCells } from './rotation.js'
import type { GravityState } from './gravity.js'
import { applyGravity, initialGravityState, resetLockTimer } from './gravity.js'
import { detectFullRows, clearRows } from './lineClear.js'

// Re-export ActivePiece for consumers
export type { ActivePiece }

/** All 7 piece types in order — used for bag randomizer. */
const ALL_PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

/** The complete game state snapshot. Immutable — never mutate directly. */
export interface GameState {
  board: Board
  activePiece: ActivePiece | null
  nextPiece: PieceType
  score: number
  level: number
  lines: number
  phase: 'playing' | 'paused' | 'gameover'
  gravityState: GravityState
  /** 7-bag randomizer queue. Stored in state for purity (no module-level vars). */
  pieceBag: PieceType[]
}

/**
 * Fisher-Yates shuffle — returns a new shuffled array, does not mutate input.
 * Uses Math.random() — deterministic for testing if seeded (but for this game
 * that level of determinism isn't required per spec).
 */
function shuffleBag(bag: PieceType[]): PieceType[] {
  const arr = [...bag]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    const jVal = arr[j]
    if (temp !== undefined && jVal !== undefined) {
      arr[i] = jVal
      arr[j] = temp
    }
  }
  return arr
}

/**
 * Draw the next piece from the bag. If the bag is empty, generate a new
 * shuffled bag first. Returns the drawn piece type and the updated bag.
 */
function drawFromBag(bag: PieceType[]): { type: PieceType; bag: PieceType[] } {
  let currentBag = bag
  if (currentBag.length === 0) {
    currentBag = shuffleBag(ALL_PIECE_TYPES)
  }
  const type = currentBag[0]!
  return { type, bag: currentBag.slice(1) }
}

/**
 * Spawn a new active piece of the given type at its standard spawn position.
 */
function spawnPiece(type: PieceType): ActivePiece {
  const spawn = getSpawnPosition(type)
  return {
    type,
    rotation: 0 as Rotation,
    row: spawn.row,
    col: spawn.col,
  }
}

/**
 * Lock the active piece onto the board. Returns the new board with the piece
 * cells filled with the piece's color index.
 */
function lockPieceOntoBoard(board: Board, piece: ActivePiece): Board {
  const cells = getCells(piece)
  const colorIndex = PIECE_COLORS[piece.type]
  let newBoard = board
  for (const [row, col] of cells) {
    // Only lock cells within board bounds
    if (row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS) {
      newBoard = setCell(newBoard, row, col, colorIndex)
    }
  }
  return newBoard
}

/**
 * Score points for cleared lines (per Guideline scoring):
 * 1 line = 100 × level, 2 = 300 × level, 3 = 500 × level, 4 = 800 × level
 */
function scoreForLines(count: number, level: number): number {
  const multipliers = [0, 100, 300, 500, 800]
  return (multipliers[count] ?? 0) * level
}

/**
 * Create the initial game state. Spawns the first active piece immediately.
 */
export function createGameState(): GameState {
  // Start the bag and draw the first two pieces
  const initialBag = shuffleBag(ALL_PIECE_TYPES)
  const { type: firstType, bag: bag1 } = drawFromBag(initialBag)
  const { type: nextType, bag: bag2 } = drawFromBag(bag1)

  const activePiece = spawnPiece(firstType)

  return {
    board: emptyBoard(),
    activePiece,
    nextPiece: nextType,
    score: 0,
    level: 1,
    lines: 0,
    phase: 'playing',
    gravityState: initialGravityState(),
    pieceBag: bag2,
  }
}

/**
 * Advance the game by one logic tick.
 *
 * This is the single public engine API. It is a pure function:
 * the same inputs always produce the same outputs.
 *
 * Action handling order:
 * 1. Non-playing phase: only handle Pause
 * 2. Process Pause action
 * 3. Process RotateCW / RotateCCW
 * 4. Process MoveLeft / MoveRight
 * 5. Process HardDrop
 * 6. Apply gravity + soft-drop
 * 7. Lock piece if gravity says to
 * 8. Detect and clear full lines
 * 9. Spawn next piece (or game-over if blocked)
 */
export function updateGameState(
  state: GameState,
  actions: GameAction[],
  dtMs: number
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = []

  // --- Phase guard ---
  if (state.phase === 'gameover') {
    return { state, events }
  }

  if (state.phase === 'paused') {
    if (actions.includes(GameAction.Pause)) {
      return { state: { ...state, phase: 'playing' }, events }
    }
    return { state, events }
  }

  // --- state.phase === 'playing' ---

  // Handle pause action
  if (actions.includes(GameAction.Pause)) {
    return { state: { ...state, phase: 'paused' }, events }
  }

  // If there's no active piece, there's nothing to do
  if (state.activePiece === null) {
    return { state, events }
  }

  let board = state.board
  let piece = state.activePiece
  let gravityState = state.gravityState
  let score = state.score
  let level = state.level
  let lines = state.lines
  let pieceBag = state.pieceBag
  let nextPiece = state.nextPiece

  const softDrop = actions.includes(GameAction.SoftDrop)

  // --- Process rotation actions ---
  if (actions.includes(GameAction.RotateCW)) {
    const rotated = tryRotate(board, piece, 'CW')
    if (rotated !== null) {
      piece = rotated
      gravityState = resetLockTimer(gravityState)
    }
  } else if (actions.includes(GameAction.RotateCCW)) {
    const rotated = tryRotate(board, piece, 'CCW')
    if (rotated !== null) {
      piece = rotated
      gravityState = resetLockTimer(gravityState)
    }
  }

  // --- Process lateral movement ---
  if (actions.includes(GameAction.MoveLeft)) {
    const movedLeft: ActivePiece = { ...piece, col: piece.col - 1 }
    if (!isCollision(board, getCells(movedLeft))) {
      piece = movedLeft
      gravityState = resetLockTimer(gravityState)
    }
  }
  if (actions.includes(GameAction.MoveRight)) {
    const movedRight: ActivePiece = { ...piece, col: piece.col + 1 }
    if (!isCollision(board, getCells(movedRight))) {
      piece = movedRight
      gravityState = resetLockTimer(gravityState)
    }
  }

  // --- Process hard drop ---
  if (actions.includes(GameAction.HardDrop)) {
    // Drop piece to the lowest valid row
    let dropRow = piece.row
    while (!isCollision(board, getCells({ ...piece, row: dropRow + 1 }))) {
      dropRow++
    }
    piece = { ...piece, row: dropRow }

    // Lock immediately
    board = lockPieceOntoBoard(board, piece)
    events.push({ type: 'piece-lock' })

    // Check for line clears
    const fullRows = detectFullRows(board)
    if (fullRows.length > 0) {
      board = clearRows(board, fullRows)
      const clearedCount = fullRows.length
      const pointsGained = scoreForLines(clearedCount, level)
      score += pointsGained
      lines += clearedCount

      events.push({ type: 'line-clear', payload: { count: clearedCount, rows: fullRows } })

      // Check level up
      const prevLevel = level
      const newLevel = Math.floor(lines / 10) + 1
      if (newLevel > prevLevel) {
        level = newLevel
        events.push({ type: 'level-up', payload: { level } })
      }
    }

    // Spawn next piece
    const draw = drawFromBag(pieceBag)
    pieceBag = draw.bag
    const newPieceType = nextPiece
    nextPiece = draw.type
    const newPiece = spawnPiece(newPieceType)

    if (isCollision(board, getCells(newPiece))) {
      // Game over — spawn position occupied
      events.push({ type: 'game-over' })
      return {
        state: {
          ...state,
          board,
          activePiece: null,
          nextPiece,
          score,
          level,
          lines,
          phase: 'gameover',
          gravityState: initialGravityState(),
          pieceBag,
        },
        events,
      }
    }

    return {
      state: {
        ...state,
        board,
        activePiece: newPiece,
        nextPiece,
        score,
        level,
        lines,
        phase: 'playing',
        gravityState: initialGravityState(),
        pieceBag,
      },
      events,
    }
  }

  // --- Apply gravity ---
  const gravResult = applyGravity(gravityState, board, piece, dtMs, level, softDrop)
  piece = gravResult.piece
  gravityState = gravResult.gravityState
  const shouldLock = gravResult.locked

  if (shouldLock) {
    // Lock piece onto board
    board = lockPieceOntoBoard(board, piece)
    events.push({ type: 'piece-lock' })

    // Detect and clear full lines
    const fullRows = detectFullRows(board)
    if (fullRows.length > 0) {
      board = clearRows(board, fullRows)
      const clearedCount = fullRows.length
      const pointsGained = scoreForLines(clearedCount, level)
      score += pointsGained
      lines += clearedCount

      events.push({ type: 'line-clear', payload: { count: clearedCount, rows: fullRows } })

      // Check level up
      const prevLevel = level
      const newLevel = Math.floor(lines / 10) + 1
      if (newLevel > prevLevel) {
        level = newLevel
        events.push({ type: 'level-up', payload: { level } })
      }
    }

    // Spawn next piece
    const draw = drawFromBag(pieceBag)
    pieceBag = draw.bag
    const newPieceType = nextPiece
    nextPiece = draw.type
    const newPiece = spawnPiece(newPieceType)

    if (isCollision(board, getCells(newPiece))) {
      // Game over — spawn position occupied
      events.push({ type: 'game-over' })
      return {
        state: {
          ...state,
          board,
          activePiece: null,
          nextPiece,
          score,
          level,
          lines,
          phase: 'gameover',
          gravityState: initialGravityState(),
          pieceBag,
        },
        events,
      }
    }

    return {
      state: {
        ...state,
        board,
        activePiece: newPiece,
        nextPiece,
        score,
        level,
        lines,
        phase: 'playing',
        gravityState: initialGravityState(),
        pieceBag,
      },
      events,
    }
  }

  // No lock event — return updated state
  return {
    state: {
      ...state,
      board,
      activePiece: piece,
      nextPiece,
      score,
      level,
      lines,
      gravityState,
      pieceBag,
    },
    events,
  }
}
