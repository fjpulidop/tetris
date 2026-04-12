/**
 * Animated splash screen displayed on game load.
 *
 * Shows the game title with a glow effect and a pulsing "Press Enter to Start"
 * subtitle. The splash is destroyed once the player starts the game.
 *
 * Layer boundary: imports only from pixi.js — no engine/, renderer/, or input/.
 */

import { Container, Text, TextStyle } from 'pixi.js'
import type { Application, Filter, Ticker } from 'pixi.js'
import { GlowFilter } from '@pixi/filter-glow'

/** The display title shown on the splash screen. */
const GAME_TITLE = 'BLOCK DROP'

export class SplashScreen {
  private container: Container
  private titleText: Text
  private subtitleText: Text
  private ticker: Ticker
  private _elapsed = 0

  // PixiJS v8 TickerCallback receives a Ticker instance, not a raw number.
  // ticker.deltaTime is the dimensionless scalar (~1.0 at 60fps) used for
  // frame-independent animations, matching the spec's intended pulse rate.
  private onTick = (ticker: Ticker) => {
    this._elapsed += ticker.deltaTime
    this.subtitleText.alpha = 0.5 + 0.5 * Math.sin(this._elapsed * 0.05)
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
      fill: 0xffffff,
      fontFamily: 'monospace',
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
      console.warn('SplashScreen: GlowFilter could not be applied:', e)
    }

    // Subtitle text
    const subtitleStyle = new TextStyle({
      fontSize: 22,
      fill: 0xaaaaff,
      fontFamily: 'monospace',
    })
    this.subtitleText = new Text({ text: 'Press Enter to Start', style: subtitleStyle })
    this.subtitleText.anchor.set(0.5)
    this.container.addChild(this.subtitleText)

    // Register ticker for pulsing animation
    app.ticker.add(this.onTick)

    // Initial centering
    this.resize(app.screen.width, app.screen.height)
  }

  resize(width: number, height: number): void {
    this.titleText.x = width / 2
    this.titleText.y = height * 0.35
    this.subtitleText.x = width / 2
    this.subtitleText.y = height * 0.55
  }

  destroy(): void {
    this.ticker.remove(this.onTick)
    this.container.destroy({ children: true })
  }
}
