/**
 * Piece renderer — draws the active falling piece and its ghost (drop preview).
 *
 * Ghost piece: the piece's projected landing position, rendered at 30% opacity.
 * Ghost position is computed by dropping the piece until isCollision returns true.
 */

import { Container, Graphics } from 'pixi.js'
import { BOARD_COLS, BOARD_ROWS, isCollision } from '../engine/board.js'
import type { GameState } from '../engine/gameState.js'
import { getCells } from '../engine/rotation.js'
import type { ActivePiece } from '../engine/rotation.js'
import { PIECE_COLORS } from '../engine/pieces.js'
import { CELL_COLORS } from './boardRenderer.js'

/** Corner radius for piece cells (matches board renderer). */
const CELL_RADIUS = 2


export class PieceRenderer {
  private container: Container
  /** Graphics objects for active piece cells (4 cells). */
  private pieceCells: Graphics[]
  /** Graphics objects for ghost piece cells (4 cells). */
  private ghostCells: Graphics[]

  private cellSize = 0
  private offsetX = 0
  private offsetY = 0

  constructor(stage: Container) {
    this.container = new Container()
    stage.addChild(this.container)

    // 4 cells for active piece
    this.pieceCells = []
    for (let i = 0; i < 4; i++) {
      const g = new Graphics()
      this.container.addChild(g)
      this.pieceCells.push(g)
    }

    // 4 cells for ghost piece
    this.ghostCells = []
    for (let i = 0; i < 4; i++) {
      const g = new Graphics()
      // Alpha is set per-frame in update() via the ghost pulse animation
      this.container.addChild(g)
      this.ghostCells.push(g)
    }
  }

  resize(cellSize: number, offsetX: number, offsetY: number): void {
    this.cellSize = cellSize
    this.offsetX = offsetX
    this.offsetY = offsetY

    this.container.x = offsetX
    this.container.y = offsetY
  }

  update(state: GameState, elapsedSec = 0): void {
    if (this.cellSize === 0) return

    const piece = state.activePiece

    if (piece === null) {
      // Clear all cells when no active piece (game over)
      this.clearAll()
      return
    }

    const colorIndex = PIECE_COLORS[piece.type]
    const color = CELL_COLORS[colorIndex] ?? 0xffffff

    // Compute ghost position
    const ghostPiece = this.computeGhost(state.board, piece)

    // Draw ghost first (behind active piece)
    const ghostCells = getCells(ghostPiece)
    const activeCells = getCells(piece)

    // Draw ghost piece (only if it's different from active piece position)
    // Alpha oscillates via sin wave: range 0.12–0.32 at ~1Hz
    const ghostAlpha = 0.22 + 0.10 * Math.sin(elapsedSec * Math.PI * 2)
    const ghostDiffers = ghostPiece.row !== piece.row
    for (let i = 0; i < 4; i++) {
      const g = this.ghostCells[i]!
      g.alpha = ghostAlpha
      g.clear()

      if (ghostDiffers) {
        const cellCoords = ghostCells[i]
        if (cellCoords === undefined) continue
        const [row, col] = cellCoords
        if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) continue

        const x = col * this.cellSize + 1
        const y = row * this.cellSize + 1
        const size = this.cellSize - 2
        g.roundRect(x, y, size, size, CELL_RADIUS)
        g.fill({ color, alpha: 1 })
      }
    }

    // Draw active piece
    for (let i = 0; i < 4; i++) {
      const g = this.pieceCells[i]!
      g.clear()

      const cellCoords = activeCells[i]
      if (cellCoords === undefined) continue
      const [row, col] = cellCoords

      // Clip to visible board area (piece spawns above row 0)
      if (row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) continue

      const x = col * this.cellSize + 1
      const y = row * this.cellSize + 1
      const size = this.cellSize - 2
      g.roundRect(x, y, size, size, CELL_RADIUS)
      g.fill({ color, alpha: 1 })
    }
  }

  /**
   * Compute the ghost piece position by dropping until collision.
   * The ghost row is the last valid row (one above where collision occurs).
   */
  private computeGhost(board: Uint8Array, piece: ActivePiece): ActivePiece {
    let ghostRow = piece.row
    while (!isCollision(board, getCells({ ...piece, row: ghostRow + 1 }))) {
      ghostRow++
    }
    return { ...piece, row: ghostRow }
  }

  private clearAll(): void {
    for (const g of this.pieceCells) g.clear()
    for (const g of this.ghostCells) g.clear()
  }
}
