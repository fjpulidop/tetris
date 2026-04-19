/**
 * Board renderer — draws the locked board cells and grid lines using PixiJS Graphics.
 *
 * Grid lines are drawn once at init/resize (static).
 * Cell contents are only redrawn when they change (change-detection optimization).
 */

import { Container, Graphics } from 'pixi.js'
import { BOARD_COLS, BOARD_ROWS } from '../engine/board.js'
import type { GameState } from '../engine/gameState.js'
import type { GameMode } from '../engine/types.js'

/** Hex colors for each piece color index (1–7). Index 0 = empty (not drawn). */
export const CELL_COLORS: Record<number, number> = {
  1: 0x00f0f0, // I — cyan
  2: 0xf0f000, // O — yellow
  3: 0xa000f0, // T — purple
  4: 0x00f000, // S — green
  5: 0xf00000, // Z — red
  6: 0x0000f0, // J — blue
  7: 0xf0a000, // L — orange
}

/** Locked-cell color in monochrome mode. */
const MONO_LOCKED_COLOR = 0x888888

/** Background color for empty cells. */
const EMPTY_CELL_COLOR = 0x1a1a2e

/** Color for grid lines. */
const GRID_LINE_COLOR = 0x2a2a4e

/** Corner radius for cell rectangles. */
const CELL_RADIUS = 2

/**
 * Resolve the fill color for a locked board cell.
 * In monochrome mode all color indices map to MONO_LOCKED_COLOR.
 */
function resolveCellColor(colorIndex: number, gameMode: GameMode): number {
  if (gameMode === 'monochrome') return MONO_LOCKED_COLOR
  return CELL_COLORS[colorIndex] ?? 0xffffff
}

export class BoardRenderer {
  private container: Container
  private gridGraphics: Graphics
  /** One Graphics object per cell (200 total). Keyed by row * BOARD_COLS + col. */
  private cellGraphics: Graphics[]
  /** Cached board state for change detection. */
  private lastBoard: Uint8Array
  /** Overlay graphics for charged-cell pulse effect. One per cell. */
  private chargedOverlayGraphics: Graphics[]
  /** Set of charged cell indices from the previous frame (for cleanup). */
  private lastChargedCells: ReadonlySet<number> = new Set()

  private cellSize = 0
  private offsetX = 0
  private offsetY = 0

  constructor(stage: Container) {
    this.container = new Container()
    stage.addChild(this.container)

    this.gridGraphics = new Graphics()
    this.container.addChild(this.gridGraphics)

    // Pre-allocate one Graphics per cell
    this.cellGraphics = []
    for (let i = 0; i < BOARD_ROWS * BOARD_COLS; i++) {
      const g = new Graphics()
      this.container.addChild(g)
      this.cellGraphics.push(g)
    }

    // Pre-allocate charged overlay graphics (one per cell, initially invisible)
    this.chargedOverlayGraphics = []
    for (let i = 0; i < BOARD_ROWS * BOARD_COLS; i++) {
      const g = new Graphics()
      g.visible = false
      this.container.addChild(g)
      this.chargedOverlayGraphics.push(g)
    }

    // Initialize last board state as all zeros
    this.lastBoard = new Uint8Array(BOARD_ROWS * BOARD_COLS)
  }

  /**
   * Called on window resize and at startup.
   * Redraws grid lines and repositions all cell graphics.
   */
  resize(cellSize: number, offsetX: number, offsetY: number): void {
    this.cellSize = cellSize
    this.offsetX = offsetX
    this.offsetY = offsetY

    // Reposition the container
    this.container.x = offsetX
    this.container.y = offsetY

    // Redraw static grid lines
    this.drawGrid()

    // Force full redraw of all cells
    this.lastBoard = new Uint8Array(BOARD_ROWS * BOARD_COLS)
    // Mark as needs redraw by filling with an impossible value (-1 via 255 trick)
    // Actually just reset so all cells differ from current board state
    this.lastBoard.fill(255)

    // Hide all charged overlays and reset tracking
    for (const g of this.chargedOverlayGraphics) {
      g.visible = false
    }
    this.lastChargedCells = new Set()
  }

  /** Draw static grid lines. Called only on resize. */
  private drawGrid(): void {
    const g = this.gridGraphics
    g.clear()

    const width = BOARD_COLS * this.cellSize
    const height = BOARD_ROWS * this.cellSize

    // Background
    g.rect(0, 0, width, height)
    g.fill({ color: EMPTY_CELL_COLOR, alpha: 1 })

    // Vertical lines
    g.setStrokeStyle({ width: 1, color: GRID_LINE_COLOR, alpha: 0.5 })
    for (let col = 0; col <= BOARD_COLS; col++) {
      g.moveTo(col * this.cellSize, 0)
      g.lineTo(col * this.cellSize, height)
    }
    // Horizontal lines
    for (let row = 0; row <= BOARD_ROWS; row++) {
      g.moveTo(0, row * this.cellSize)
      g.lineTo(width, row * this.cellSize)
    }
    g.stroke()
  }

  /**
   * Update cell visuals. Only redraws cells that changed since last frame.
   */
  update(state: GameState): void {
    if (this.cellSize === 0) return

    const board = state.board

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const idx = row * BOARD_COLS + col
        const value = board[idx] ?? 0
        const lastValue = this.lastBoard[idx] ?? 0

        if (value === lastValue) continue

        const g = this.cellGraphics[idx]
        if (!g) continue

        g.clear()

        if (value !== 0) {
          const color = resolveCellColor(value, state.gameMode)
          const x = col * this.cellSize + 1
          const y = row * this.cellSize + 1
          const size = this.cellSize - 2

          g.roundRect(x, y, size, size, CELL_RADIUS)
          g.fill({ color, alpha: 1 })
        }
        // value === 0: clear graphics (cell is empty — grid background shows through)
      }
    }

    // Cache current board for next frame's change detection
    this.lastBoard = board.slice()

    // Update charged cell overlay pulse
    this.updateChargedOverlays(state, performance.now())
  }

  /**
   * Draw a pulsing white overlay on each charged cell.
   * Hides overlays for cells that were charged last frame but are no longer charged.
   */
  private updateChargedOverlays(state: GameState, now: number): void {
    if (this.cellSize === 0) return
    const pulse = 0.4 + 0.4 * Math.sin(now * 0.006)

    for (const idx of state.chargedCells) {
      if (idx < 0 || idx >= BOARD_ROWS * BOARD_COLS) continue
      const g = this.chargedOverlayGraphics[idx]
      if (!g) continue
      const row = Math.floor(idx / BOARD_COLS)
      const col = idx % BOARD_COLS
      g.clear()
      g.roundRect(
        col * this.cellSize + 1,
        row * this.cellSize + 1,
        this.cellSize - 2,
        this.cellSize - 2,
        CELL_RADIUS
      )
      g.fill({ color: 0xffffff, alpha: pulse })
      g.visible = true
    }

    for (const idx of this.lastChargedCells) {
      if (!state.chargedCells.has(idx)) {
        const g = this.chargedOverlayGraphics[idx]
        if (g) {
          g.visible = false
          g.clear()
        }
      }
    }

    this.lastChargedCells = state.chargedCells
  }
}
