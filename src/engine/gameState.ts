/**
 * Game state machine — the top-level pure engine API.
 *
 * updateGameState() composes all engine modules into a single pure function
 * that advances the game by one logic tick. Same inputs always produce the
 * same outputs (no side effects, no module-level mutable state).
 */

import type { PieceType, Rotation, GameEvent, GameMode } from './types.js'
import { GameAction } from './types.js'
import { BOARD_COLS, BOARD_ROWS, emptyBoard, setCell, isCollision } from './board.js'
import type { Board } from './board.js'
import { PIECE_COLORS, getSpawnPosition } from './pieces.js'
import type { ActivePiece } from './rotation.js'
import { tryRotate, getCells } from './rotation.js'
import type { GravityState } from './gravity.js'
import { applyGravity, initialGravityState, resetLockTimer } from './gravity.js'
import { detectFullRows, clearRows } from './lineClear.js'
import {
  chainMultiplier,
  generateChargedCells,
  resolveExplosions,
  tickChargeDecay,
} from './chainBlast.js'

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
  phase: 'intro' | 'playing' | 'paused' | 'gameover'
  gravityState: GravityState
  /** 7-bag randomizer queue. Stored in state for purity (no module-level vars). */
  pieceBag: PieceType[]
  /** Flat cell indices (row * BOARD_COLS + col) that are currently charged. */
  chargedCells: ReadonlySet<number>
  /** Current chain explosion depth (incremented on each successive explosion). */
  chainDepth: number
  /** Milliseconds elapsed since the last piece lock (used for decay/reset timers). */
  chainTimer: number
  /** Rendering mode selected at game start. 'classic' renders Guideline colors; 'monochrome' renders grayscale. */
  gameMode: GameMode
  /** Which play mode is active for this game. */
  playMode: 'marathon' | 'sprint'
  /**
   * True once the first piece has been locked in a Sprint run.
   * main.ts uses the false→true edge to start the wall-clock timer.
   * Always false in Marathon; irrelevant after the first lock in Sprint.
   */
  timerStarted: boolean
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
export function createGameState(
  gameMode: GameMode = 'classic',
  playMode: 'marathon' | 'sprint' = 'marathon'
): GameState {
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
    phase: 'intro',
    gravityState: initialGravityState(),
    pieceBag: bag2,
    chargedCells: new Set<number>(),
    chainDepth: 0,
    chainTimer: 0,
    gameMode,
    playMode,
    timerStarted: false,
  }
}

/** Result returned by the processLock helper. */
interface LockResult {
  board: Board
  score: number
  lines: number
  level: number
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  events: GameEvent[]
  /** True iff playMode=sprint and lines reached SPRINT_TARGET after this lock. */
  sprintComplete: boolean
}

const SPRINT_TARGET = 40

/**
 * Handle all post-lock processing: line detection, scoring, chain explosions,
 * and level-up checks. Extracted so both hard-drop and gravity-lock branches
 * share the same logic without duplication.
 *
 * CRITICAL: fullRows is computed BEFORE clearRows. generateChargedCells and
 * resolveExplosions receive pre-collapse row coordinates so detonator
 * identification is correct. resolveExplosions operates on the post-collapse
 * board but uses pre-collapse row numbers to find detonators.
 */
function processLock(
  board: Board,
  score: number,
  lines: number,
  level: number,
  chargedCells: ReadonlySet<number>,
  chainDepth: number,
  chainTimer: number,
  piece: ActivePiece,
  playMode: 'marathon' | 'sprint'
): LockResult {
  const events: GameEvent[] = []

  // Lock piece onto board
  let currentBoard = lockPieceOntoBoard(board, piece)
  events.push({ type: 'piece-lock' })

  let currentScore = score
  let currentLines = lines
  let currentLevel = level
  let currentCharged = chargedCells
  let currentChainDepth = chainDepth
  let currentChainTimer = chainTimer

  const fullRows = detectFullRows(currentBoard)
  if (fullRows.length > 0) {
    const clearedCount = fullRows.length

    // Compute base multiplier using current depth (BEFORE any explosion increment)
    const baseMultiplier = chainMultiplier(currentChainDepth)

    // Collapse the board
    currentBoard = clearRows(currentBoard, fullRows)

    currentScore += Math.round(scoreForLines(clearedCount, currentLevel) * baseMultiplier)
    currentLines += clearedCount

    events.push({ type: 'line-clear', payload: { count: clearedCount, rows: fullRows } })

    // Generate new charged cells from rows above the cleared rows (pre-collapse coords)
    const newChargedFlat = generateChargedCells(fullRows, currentBoard, currentCharged)

    // Resolve explosions — detonators identified by pre-collapse row numbers
    const explosionResult = resolveExplosions(currentBoard, currentCharged, fullRows)

    if (explosionResult.affectedArea.length > 0) {
      // Chain explosion occurred
      currentChainDepth += 1
      currentChainTimer = 0
      currentBoard = explosionResult.board

      // Bonus score uses incremented depth
      const bonusMultiplier = chainMultiplier(currentChainDepth)
      currentScore += Math.round(
        scoreForLines(explosionResult.bonusRows.length, currentLevel) * bonusMultiplier
      )
      currentLines += explosionResult.bonusRows.length

      // Merge new charged cells from primary clear and from explosion bonus rows
      currentCharged = new Set([...newChargedFlat, ...explosionResult.newChargedCells])

      events.push({
        type: 'chain-explosion',
        payload: {
          depth: currentChainDepth,
          affectedArea: explosionResult.affectedArea,
          bonusRows: explosionResult.bonusRows,
        },
      })

      if (explosionResult.bonusRows.length > 0) {
        events.push({
          type: 'line-clear',
          payload: { count: explosionResult.bonusRows.length, rows: explosionResult.bonusRows },
        })
      }
    } else {
      // No explosion — reset timer but keep depth
      currentChainTimer = 0
      currentCharged = new Set([...currentCharged, ...newChargedFlat])
    }

    // Sprint completion check — applied after all line counting (including explosion bonus)
    if (playMode === 'sprint' && currentLines >= SPRINT_TARGET) {
      currentLines = SPRINT_TARGET   // cap; never emit "41 lines"
      events.push({ type: 'sprint-complete' })
      return {
        board: currentBoard,
        score: currentScore,
        lines: currentLines,
        level: currentLevel,
        chargedCells: currentCharged,
        chainDepth: currentChainDepth,
        chainTimer: currentChainTimer,
        events,
        sprintComplete: true,
      }
    }

    if (newChargedFlat.length > 0) {
      events.push({ type: 'cell-charged' })
    }

    // Level-up check
    const newLevel = Math.floor(currentLines / 10) + 1
    if (newLevel > currentLevel) {
      currentLevel = newLevel
      events.push({ type: 'level-up', payload: { level: currentLevel } })
    }
  }

  return {
    board: currentBoard,
    score: currentScore,
    lines: currentLines,
    level: currentLevel,
    chargedCells: currentCharged,
    chainDepth: currentChainDepth,
    chainTimer: currentChainTimer,
    events,
    sprintComplete: false,
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
  if (state.phase === 'intro') {
    if (actions.includes(GameAction.Start)) {
      return { state: { ...state, phase: 'playing' }, events }
    }
    return { state, events }
  }

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
  let chargedCells = state.chargedCells
  let chainDepth = state.chainDepth
  let chainTimer = state.chainTimer

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

    // Process lock (line clear, chain explosions, scoring)
    const lockResult = processLock(
      board,
      score,
      lines,
      level,
      chargedCells,
      chainDepth,
      chainTimer,
      piece,
      state.playMode
    )

    board = lockResult.board
    score = lockResult.score
    lines = lockResult.lines
    level = lockResult.level
    chargedCells = lockResult.chargedCells
    chainDepth = lockResult.chainDepth
    chainTimer = lockResult.chainTimer
    events.push(...lockResult.events)

    const newTimerStarted =
      state.playMode === 'sprint' && !state.timerStarted
        ? true
        : state.timerStarted

    // Apply decay tick
    const decay = tickChargeDecay(chargedCells, chainDepth, chainTimer, dtMs)
    chargedCells = decay.chargedCells
    chainDepth = decay.chainDepth
    chainTimer = decay.chainTimer
    if (decay.emitChainReset) events.push({ type: 'chain-reset' })

    // Sprint complete — skip spawn and transition to gameover
    if (lockResult.sprintComplete) {
      events.push({ type: 'game-over' })
      return {
        state: {
          ...state,
          board: lockResult.board,
          activePiece: null,
          nextPiece: state.nextPiece,
          score: lockResult.score,
          level: lockResult.level,
          lines: lockResult.lines,
          phase: 'gameover',
          gravityState: initialGravityState(),
          pieceBag: state.pieceBag,
          chargedCells: lockResult.chargedCells,
          chainDepth: lockResult.chainDepth,
          chainTimer: lockResult.chainTimer,
          gameMode: state.gameMode,
          playMode: state.playMode,
          timerStarted: newTimerStarted,
        },
        events,
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
          chargedCells,
          chainDepth,
          chainTimer,
          gameMode: state.gameMode,
          playMode: state.playMode,
          timerStarted: newTimerStarted,
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
        chargedCells,
        chainDepth,
        chainTimer,
        gameMode: state.gameMode,
        playMode: state.playMode,
        timerStarted: newTimerStarted,
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
    // Process lock (line clear, chain explosions, scoring)
    const lockResult = processLock(
      board,
      score,
      lines,
      level,
      chargedCells,
      chainDepth,
      chainTimer,
      piece,
      state.playMode
    )

    board = lockResult.board
    score = lockResult.score
    lines = lockResult.lines
    level = lockResult.level
    chargedCells = lockResult.chargedCells
    chainDepth = lockResult.chainDepth
    chainTimer = lockResult.chainTimer
    events.push(...lockResult.events)

    const newTimerStarted =
      state.playMode === 'sprint' && !state.timerStarted
        ? true
        : state.timerStarted

    // Apply decay tick
    const decay = tickChargeDecay(chargedCells, chainDepth, chainTimer, dtMs)
    chargedCells = decay.chargedCells
    chainDepth = decay.chainDepth
    chainTimer = decay.chainTimer
    if (decay.emitChainReset) events.push({ type: 'chain-reset' })

    // Sprint complete — skip spawn and transition to gameover
    if (lockResult.sprintComplete) {
      events.push({ type: 'game-over' })
      return {
        state: {
          ...state,
          board: lockResult.board,
          activePiece: null,
          nextPiece: state.nextPiece,
          score: lockResult.score,
          level: lockResult.level,
          lines: lockResult.lines,
          phase: 'gameover',
          gravityState: initialGravityState(),
          pieceBag: state.pieceBag,
          chargedCells: lockResult.chargedCells,
          chainDepth: lockResult.chainDepth,
          chainTimer: lockResult.chainTimer,
          gameMode: state.gameMode,
          playMode: state.playMode,
          timerStarted: newTimerStarted,
        },
        events,
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
          chargedCells,
          chainDepth,
          chainTimer,
          gameMode: state.gameMode,
          playMode: state.playMode,
          timerStarted: newTimerStarted,
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
        chargedCells,
        chainDepth,
        chainTimer,
        gameMode: state.gameMode,
        playMode: state.playMode,
        timerStarted: newTimerStarted,
      },
      events,
    }
  }

  // No lock event — apply decay tick and return updated state
  const decay = tickChargeDecay(chargedCells, chainDepth, chainTimer, dtMs)
  chargedCells = decay.chargedCells
  chainDepth = decay.chainDepth
  chainTimer = decay.chainTimer
  if (decay.emitChainReset) events.push({ type: 'chain-reset' })

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
      chargedCells,
      chainDepth,
      chainTimer,
      gameMode: state.gameMode,
      playMode: state.playMode,
      timerStarted: state.timerStarted,
    },
    events,
  }
}
