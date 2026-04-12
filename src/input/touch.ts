/**
 * Touch / virtual button input handler.
 * Renders 6 virtual buttons using PixiJS Graphics on the canvas.
 * Uses pointerdown/pointerup events (PixiJS v8 interaction API).
 *
 * Layout (portrait):
 *   [ ← ]  [ ↓ ]  [ → ]    (move controls, left side)
 *   [ ↺ ]  [ ⬛ ]  [ ↻ ]    (rotate/hard-drop, right side)
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { GameAction } from '../engine/types.js'

interface ButtonConfig {
  label: string
  action: GameAction
  held: boolean  // true = action repeats while held; false = tap only
}

const BUTTONS: ButtonConfig[] = [
  { label: '←', action: GameAction.MoveLeft, held: true },
  { label: '↓', action: GameAction.SoftDrop, held: true },
  { label: '→', action: GameAction.MoveRight, held: true },
  { label: '↺', action: GameAction.RotateCCW, held: false },
  { label: '⬛', action: GameAction.HardDrop, held: false },
  { label: '↻', action: GameAction.RotateCW, held: false },
]

interface VirtualButton {
  container: Container
  graphics: Graphics
  config: ButtonConfig
  isHeld: boolean
}

export class TouchInput {
  private stage: Container
  private container: Container
  private buffer: GameAction[] = []
  private buttons: VirtualButton[] = []
  private cellSize: number

  constructor(stage: Container, cellSize: number) {
    this.stage = stage
    this.cellSize = cellSize

    this.container = new Container()
    stage.addChild(this.container)

    this.createButtons()
  }

  private createButtons(): void {
    const labelStyle = new TextStyle({
      fill: 0xffffff,
      fontSize: 20,
      fontWeight: 'bold',
    })

    for (let i = 0; i < BUTTONS.length; i++) {
      const config = BUTTONS[i]!

      const btnContainer = new Container()
      btnContainer.eventMode = 'static'
      btnContainer.cursor = 'pointer'

      const graphics = new Graphics()
      btnContainer.addChild(graphics)

      const label = new Text({ text: config.label, style: labelStyle })
      label.anchor.set(0.5)
      btnContainer.addChild(label)

      const vBtn: VirtualButton = {
        container: btnContainer,
        graphics,
        config,
        isHeld: false,
      }

      // Pointer events
      btnContainer.on('pointerdown', (e) => {
        e.stopPropagation()
        if (config.held) {
          vBtn.isHeld = true
        }
        this.buffer.push(config.action)
      })

      btnContainer.on('pointerup', () => {
        vBtn.isHeld = false
      })

      // Handle pointer leaving the button area while held
      btnContainer.on('pointerupoutside', () => {
        vBtn.isHeld = false
      })

      this.container.addChild(btnContainer)
      this.buttons.push(vBtn)
    }

    this.layoutButtons()
  }

  private layoutButtons(): void {
    const btnSize = Math.max(44, this.cellSize * 1.5)
    const padding = 8
    const totalWidth = 3 * btnSize + 2 * padding

    // Position bottom row at bottom of screen with some margin
    const screenHeight = window.innerHeight
    const screenWidth = window.innerWidth
    const bottomY = screenHeight - btnSize - 20

    // Left group: ← ↓ →
    const leftGroupX = (screenWidth / 2 - totalWidth) / 2
    const rightGroupX = screenWidth / 2 + (screenWidth / 2 - totalWidth) / 2

    const positions = [
      // Left group row
      { x: leftGroupX, y: bottomY },
      { x: leftGroupX + btnSize + padding, y: bottomY },
      { x: leftGroupX + (btnSize + padding) * 2, y: bottomY },
      // Right group row
      { x: rightGroupX, y: bottomY },
      { x: rightGroupX + btnSize + padding, y: bottomY },
      { x: rightGroupX + (btnSize + padding) * 2, y: bottomY },
    ]

    for (let i = 0; i < this.buttons.length; i++) {
      const btn = this.buttons[i]!
      const pos = positions[i] ?? { x: 0, y: bottomY }

      btn.container.x = pos.x
      btn.container.y = pos.y

      // Resize hit area and graphics
      btn.graphics.clear()
      btn.graphics.roundRect(0, 0, btnSize, btnSize, 8)
      btn.graphics.fill({ color: 0x333355, alpha: 0.85 })
      btn.graphics.setStrokeStyle({ width: 2, color: 0x6666aa })
      btn.graphics.roundRect(0, 0, btnSize, btnSize, 8)
      btn.graphics.stroke()

      // Center label text within button
      const label = btn.container.children[1] as Text | undefined
      if (label) {
        label.x = btnSize / 2
        label.y = btnSize / 2
      }

      // Set hit area for pointer events
      btn.container.hitArea = {
        contains: (x: number, y: number) => x >= 0 && x <= btnSize && y >= 0 && y <= btnSize,
      }
    }
  }

  resize(cellSize: number): void {
    this.cellSize = cellSize
    this.layoutButtons()
  }

  /**
   * Return and clear the action buffer.
   */
  flush(): GameAction[] {
    const actions = this.buffer
    this.buffer = []
    return actions
  }

  /**
   * Return actions for buttons currently held down.
   */
  getHeldActions(): GameAction[] {
    const actions: GameAction[] = []
    for (const btn of this.buttons) {
      if (btn.isHeld && btn.config.held) {
        actions.push(btn.config.action)
      }
    }
    return actions
  }

  /** Show or hide touch controls. */
  setVisible(visible: boolean): void {
    this.container.visible = visible
  }

  destroy(): void {
    for (const btn of this.buttons) {
      btn.container.removeAllListeners()
    }
    this.stage.removeChild(this.container)
    this.container.destroy({ children: true })
  }
}
