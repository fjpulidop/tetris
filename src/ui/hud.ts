/**
 * HUD overlay — score, level, lines, next-piece preview.
 * Uses PixiJS v8 Text API: new Text({ text, style }).
 * Only updates text when values change to avoid unnecessary redraws.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { GameState } from '../engine/gameState.js'
import { PIECE_SHAPES } from '../engine/pieces.js'
import { CELL_COLORS } from '../renderer/boardRenderer.js'
import { PIECE_COLORS } from '../engine/pieces.js'
import { chainMultiplier } from '../engine/chainBlast.js'

const LABEL_COLOR = 0x8888cc
const VALUE_COLOR = 0xffffff
const PANEL_BACKGROUND = 0x12122a

/** Width of the HUD panel in pixels (used for layout). */
const HUD_PANEL_WIDTH = 120

export class HUD {
  private container: Container
  private panel: Graphics

  // Text elements
  private scoreLabel: Text
  private scoreValue: Text
  private levelLabel: Text
  private levelValue: Text
  private linesLabel: Text
  private linesValue: Text
  private nextLabel: Text
  private nextPreview: Graphics
  private muteButton: Text
  private _onMuteToggle: ((muted: boolean) => void) | null = null
  private _muted = false
  private chainLabel: Text
  private chainValue: Text
  private lastChainDepth = -1

  // Cached values for change detection
  private lastScore = -1
  private lastLevel = -1
  private lastLines = -1
  private lastNextPiece = ''

  private boardOffsetX = 0
  private cellSize = 0

  constructor(stage: Container) {
    this.container = new Container()
    stage.addChild(this.container)

    this.panel = new Graphics()
    this.container.addChild(this.panel)

    const labelStyle = new TextStyle({ fill: LABEL_COLOR, fontSize: 12, fontFamily: 'monospace' })
    const valueStyle = new TextStyle({ fill: VALUE_COLOR, fontSize: 18, fontFamily: 'monospace', fontWeight: 'bold' })

    this.scoreLabel = new Text({ text: 'SCORE', style: labelStyle })
    this.scoreValue = new Text({ text: '0', style: valueStyle })
    this.levelLabel = new Text({ text: 'LEVEL', style: labelStyle })
    this.levelValue = new Text({ text: '1', style: valueStyle })
    this.linesLabel = new Text({ text: 'LINES', style: labelStyle })
    this.linesValue = new Text({ text: '0', style: valueStyle })
    this.nextLabel = new Text({ text: 'NEXT', style: labelStyle })
    this.nextPreview = new Graphics()

    const chainLabelStyle = new TextStyle({ fill: LABEL_COLOR, fontSize: 12, fontFamily: 'monospace' })
    const chainValueStyle = new TextStyle({ fill: 0xffcc44, fontSize: 20, fontFamily: 'monospace', fontWeight: 'bold' })
    this.chainLabel = new Text({ text: 'CHAIN', style: chainLabelStyle })
    this.chainValue = new Text({ text: 'x1', style: chainValueStyle })
    this.chainLabel.visible = false
    this.chainValue.visible = false

    for (const elem of [
      this.scoreLabel, this.scoreValue,
      this.levelLabel, this.levelValue,
      this.linesLabel, this.linesValue,
      this.nextLabel,
      this.nextPreview,
      this.chainLabel,
      this.chainValue,
    ]) {
      this.container.addChild(elem)
    }

    const muteStyle = new TextStyle({ fill: 0xffffff, fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' })
    this.muteButton = new Text({ text: '[M] MUTE', style: muteStyle })
    this.muteButton.eventMode = 'static'
    this.muteButton.cursor = 'pointer'
    this.muteButton.on('pointerup', () => {
      this._muted = !this._muted
      this.updateMuteLabel()
      this._onMuteToggle?.(this._muted)
    })
    this.container.addChild(this.muteButton)
  }

  resize(cellSize: number, boardOffsetX: number): void {
    this.cellSize = cellSize
    this.boardOffsetX = boardOffsetX

    this.layoutElements()
    // Force redraw of next piece preview on resize
    this.lastNextPiece = ''
  }

  private layoutElements(): void {
    const boardWidth = 10 * this.cellSize
    // Position HUD to the right of the board
    const hudX = this.boardOffsetX + boardWidth + 12
    const hudY = 20

    this.container.x = hudX
    this.container.y = hudY

    // Draw panel background
    this.panel.clear()
    this.panel.roundRect(0, 0, HUD_PANEL_WIDTH, 370, 8)
    this.panel.fill({ color: PANEL_BACKGROUND, alpha: 0.85 })

    let y = 12
    const pad = 8

    this.scoreLabel.x = pad
    this.scoreLabel.y = y
    y += 18

    this.scoreValue.x = pad
    this.scoreValue.y = y
    y += 28

    this.levelLabel.x = pad
    this.levelLabel.y = y
    y += 18

    this.levelValue.x = pad
    this.levelValue.y = y
    y += 28

    this.linesLabel.x = pad
    this.linesLabel.y = y
    y += 18

    this.linesValue.x = pad
    this.linesValue.y = y
    y += 36

    this.chainLabel.x = pad
    this.chainLabel.y = y
    y += 18
    this.chainValue.x = pad
    this.chainValue.y = y
    y += 28

    this.nextLabel.x = pad
    this.nextLabel.y = y
    y += 18

    this.nextPreview.x = pad
    this.nextPreview.y = y

    y += 60  // leave room below next-piece preview
    this.muteButton.x = pad
    this.muteButton.y = y
  }

  update(state: GameState): void {
    if (this.cellSize === 0) return

    // Only update text that has changed
    if (state.score !== this.lastScore) {
      this.scoreValue.text = String(state.score)
      this.lastScore = state.score
    }

    if (state.level !== this.lastLevel) {
      this.levelValue.text = String(state.level)
      this.lastLevel = state.level
    }

    if (state.lines !== this.lastLines) {
      this.linesValue.text = String(state.lines)
      this.lastLines = state.lines
    }

    if (state.nextPiece !== this.lastNextPiece) {
      this.drawNextPiecePreview(state.nextPiece)
      this.lastNextPiece = state.nextPiece
    }

    if (state.chainDepth !== this.lastChainDepth) {
      const isActive = state.chainDepth >= 1
      this.chainLabel.visible = isActive
      this.chainValue.visible = isActive
      if (isActive) {
        const mult = chainMultiplier(state.chainDepth)
        this.chainValue.text = `x${mult}`
      }
      this.lastChainDepth = state.chainDepth
    }

    // Show game over overlay
    if (state.phase === 'gameover') {
      // Could show a game-over indicator — for now handled by main.ts
    }
  }

  setVisible(visible: boolean): void {
    this.container.visible = visible
  }

  /** Register callback invoked when the player clicks the mute button. */
  setOnMuteToggle(callback: (muted: boolean) => void): void {
    this._onMuteToggle = callback
  }

  /** Update the button label to reflect the current mute state. */
  setMuted(muted: boolean): void {
    this._muted = muted
    this.updateMuteLabel()
  }

  private updateMuteLabel(): void {
    this.muteButton.text = this._muted ? '[M] UNMUTE' : '[M] MUTE'
  }

  private drawNextPiecePreview(pieceType: string): void {
    this.nextPreview.clear()

    const previewCellSize = 14
    const shapes = PIECE_SHAPES[pieceType as keyof typeof PIECE_SHAPES]
    if (!shapes) return
    const shape = shapes[0]
    if (!shape) return

    const colorIndex = PIECE_COLORS[pieceType as keyof typeof PIECE_COLORS] ?? 1
    const color = CELL_COLORS[colorIndex] ?? 0xffffff

    for (const [dr, dc] of shape) {
      const x = dc * previewCellSize
      const y = dr * previewCellSize
      this.nextPreview.roundRect(x, y, previewCellSize - 1, previewCellSize - 1, 2)
      this.nextPreview.fill({ color, alpha: 1 })
    }
  }
}
