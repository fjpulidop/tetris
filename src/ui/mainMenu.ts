/**
 * Main menu screen displayed on game load and after returning from game-over.
 *
 * Renders the game title with a glow effect and pulsing animation, a Play
 * button (pushes GameAction.Start into a buffer), and an Exit button (invokes
 * the onExit callback). A fallback message is shown briefly when window.close()
 * is blocked by the browser.
 *
 * Layer boundary: imports from pixi.js, @pixi/filter-glow, and
 * ../engine/types.js (GameAction only). Same pattern as src/input/keyboard.ts.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { Application, Filter, Ticker } from 'pixi.js'
import { GlowFilter } from '@pixi/filter-glow'
import { GameAction } from '../engine/types.js'
import type { GameMode } from '../engine/types.js'

/** The display title shown on the main menu. */
const GAME_TITLE = 'BLOCK DROP'

const COLOR_TITLE = 0xffffff
const COLOR_BUTTON_BG = 0x1a1a3a
const COLOR_BUTTON_TEXT = 0xffffff
const COLOR_FALLBACK = 0x888888
const FONT_FAMILY = 'monospace'

export class MainMenu {
  /** Called when the Exit button is tapped/clicked. Default is a no-op. */
  onExit: () => void = () => undefined
  /** Called when the SPRINT button is tapped/clicked. Default is a no-op. */
  onSprintStart: () => void = () => undefined

  private container: Container
  private titleText: Text
  private playButton: Container
  private monochromeButton: Container
  private sprintButton: Container
  private exitButton: Container
  private fallbackText: Text
  private menuActionBuffer: GameAction[] = []
  private menuModeBuffer: GameMode[] = []
  private ticker: Ticker
  private _elapsed = 0
  private _fallbackTimer: ReturnType<typeof setTimeout> | null = null

  // PixiJS v8 TickerCallback receives a Ticker instance, not a raw number.
  // ticker.deltaTime is the dimensionless scalar (~1.0 at 60fps) used for
  // frame-independent animations, matching the splash screen pulse pattern.
  private onTick = (ticker: Ticker) => {
    this._elapsed += ticker.deltaTime
    this.titleText.alpha = 0.85 + 0.15 * Math.sin(this._elapsed * 0.04)
  }

  constructor(stage: Container, app: Application) {
    this.container = new Container()
    stage.addChild(this.container)

    // Store ticker reference so destroy() can remove the callback
    this.ticker = app.ticker

    // Title text
    const titleStyle = new TextStyle({
      fontSize: 64,
      fontWeight: 'bold',
      fill: COLOR_TITLE,
      fontFamily: FONT_FAMILY,
    })
    this.titleText = new Text({ text: GAME_TITLE, style: titleStyle })
    this.titleText.anchor.set(0.5)
    this.container.addChild(this.titleText)

    // Apply glow filter to title — wrapped in try/catch for Canvas 2D fallback
    try {
      this.titleText.filters = [
        new GlowFilter({ distance: 16, outerStrength: 2, color: 0xffffff }) as unknown as Filter,
      ]
    } catch (e) {
      // GlowFilter requires WebGL — continue without glow on Canvas 2D renderer
      console.warn('MainMenu: GlowFilter could not be applied:', e)
    }

    // Play button — pushes GameAction.Start into the action buffer
    this.playButton = this.buildButton('MARATHON')
    this.playButton.on('pointerup', () => {
      this.menuActionBuffer.push(GameAction.Start)
    })
    this.container.addChild(this.playButton)

    // Monochrome button — pushes Start + records 'monochrome' mode
    this.monochromeButton = this.buildButton('MONOCHROME')
    this.monochromeButton.on('pointerup', () => {
      this.menuActionBuffer.push(GameAction.Start)
      this.menuModeBuffer.push('monochrome')
    })
    this.container.addChild(this.monochromeButton)

    // Sprint button — invokes onSprintStart callback
    this.sprintButton = this.buildButton('SPRINT')
    this.sprintButton.on('pointerup', () => {
      this.onSprintStart()
    })
    this.container.addChild(this.sprintButton)

    // Exit button — invokes the onExit callback
    this.exitButton = this.buildButton('EXIT')
    this.exitButton.on('pointerup', () => {
      this.onExit()
    })
    this.container.addChild(this.exitButton)

    // Fallback text — hidden by default, shown after a blocked window.close()
    const fallbackStyle = new TextStyle({
      fontSize: 18,
      fill: COLOR_FALLBACK,
      fontFamily: FONT_FAMILY,
    })
    this.fallbackText = new Text({ text: 'Close this tab to exit', style: fallbackStyle })
    this.fallbackText.anchor.set(0.5)
    this.fallbackText.alpha = 0
    this.container.addChild(this.fallbackText)

    // Register ticker for pulsing title animation
    app.ticker.add(this.onTick)

    // Initial layout
    this.resize(app.screen.width, app.screen.height)
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a pill-shaped button container.
   *
   * The pill background is a Graphics object drawn in resize() so the button
   * correctly adapts to viewport dimensions. The Text label is centered within
   * the pill.
   */
  private buildButton(label: string): Container {
    const btn = new Container()
    btn.eventMode = 'static'
    btn.cursor = 'pointer'

    // Graphics pill background — dimensions set in resize()
    const bg = new Graphics()
    btn.addChild(bg)

    // Text label centered within the pill
    const txtStyle = new TextStyle({
      fontSize: 22,
      fontWeight: 'bold',
      fill: COLOR_BUTTON_TEXT,
      fontFamily: FONT_FAMILY,
    })
    const txt = new Text({ text: label, style: txtStyle })
    txt.anchor.set(0.5)
    btn.addChild(txt)

    return btn
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Drain and return all queued actions accumulated since the last flush.
   * Called each tick by main.ts alongside keyboard.flush() and touchInput.flush().
   */
  flushActions(): GameAction[] {
    return this.menuActionBuffer.splice(0)
  }

  /**
   * Drain and return the queued game mode selection, or null if none is pending.
   * Returns null when the player clicked PLAY (Classic is the default).
   * Returns 'monochrome' when the player clicked MONOCHROME.
   */
  flushMode(): GameMode | null {
    const mode = this.menuModeBuffer.shift()
    return mode ?? null
  }

  /**
   * Reposition and resize all child elements to match the current viewport.
   * Should be called from main.ts handleResize().
   */
  resize(width: number, height: number): void {
    const buttonW = Math.max(160, Math.min(300, width * 0.4))
    const buttonH = 52
    const fontSize = Math.max(18, Math.min(28, Math.floor(width * 0.055)))

    // Position title
    this.titleText.x = width / 2
    this.titleText.y = height * 0.35

    // Helper to redraw the button pill and reposition label
    const resizeButton = (btn: Container, centerX: number, centerY: number) => {
      const bg = btn.children[0] as Graphics
      const txt = btn.children[1] as Text

      bg.clear()
      bg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 8)
      bg.fill({ color: COLOR_BUTTON_BG, alpha: 0.9 })

      // Update font size to match viewport
      ;(txt.style as TextStyle).fontSize = fontSize

      btn.x = centerX
      btn.y = centerY
    }

    resizeButton(this.playButton,       width / 2, height * 0.52)
    resizeButton(this.monochromeButton, width / 2, height * 0.52 + 60)
    resizeButton(this.sprintButton,     width / 2, height * 0.52 + 120)
    resizeButton(this.exitButton,       width / 2, height * 0.52 + 180)

    // Position fallback message below buttons
    this.fallbackText.x = width / 2
    this.fallbackText.y = height * 0.52 + 260
  }

  /**
   * Show the "Close this tab to exit" fallback text for 3 seconds, then hide it.
   * Called by main.ts handleExit() 50ms after window.close() — by which time
   * the browser would have acted if it could. Clears any in-progress timer so
   * repeated Exit clicks restart the 3-second countdown.
   */
  showExitFallback(): void {
    this.fallbackText.alpha = 1
    if (this._fallbackTimer !== null) {
      clearTimeout(this._fallbackTimer)
    }
    this._fallbackTimer = setTimeout(() => {
      this.fallbackText.alpha = 0
      this._fallbackTimer = null
    }, 3000)
  }

  /**
   * Clean up: remove ticker callback, cancel any pending fallback timer,
   * and destroy the container hierarchy.
   */
  destroy(): void {
    this.ticker.remove(this.onTick)
    if (this._fallbackTimer !== null) {
      clearTimeout(this._fallbackTimer)
      this._fallbackTimer = null
    }
    this.container.destroy({ children: true })
  }
}
