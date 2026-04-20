/**
 * Game-over overlay panel.
 *
 * Renders a full-viewport dark overlay with "GAME OVER" title, final score
 * and line count, and a "Return to Menu" button.
 *
 * Lifecycle (matches PauseModal pattern):
 *   - Construction does NOT add anything to the stage (hidden by default).
 *   - show(score, lines) adds panelRoot to stage and updates score text.
 *   - showSprint(finalTimeMs, isNewPB) adds panelRoot with Sprint results.
 *   - hide() removes panelRoot from stage.
 *   - Both show() and hide() are idempotent.
 *
 * Layer boundary: imports from pixi.js and ../engine/persistence.js only.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { formatSprintTime } from '../engine/persistence.js'

const COLOR_TITLE = 0xffffff
const COLOR_SCORE = 0xaaaaff
const COLOR_BUTTON_TEXT = 0xffffff
const COLOR_BUTTON_BG = 0x1a1a3a
const COLOR_BACKGROUND = 0x0d0d1a
const BACKGROUND_ALPHA = 0.88
const FONT_FAMILY = 'monospace'

export class GameOverOverlay {
  /** Called when the "Return to Menu" button is tapped/clicked. Default is a no-op. */
  onReturnToMenu: () => void = () => undefined

  private stage: Container
  private panelRoot: Container
  private background: Graphics
  private titleText: Text
  private scoreText: Text
  private returnButton: Container
  private pbText: Text
  private _sprintMode = false
  /** Whether panelRoot is currently attached to the stage. */
  private visible = false

  constructor(stage: Container) {
    this.stage = stage

    // Build panel hierarchy — NOT added to stage here (hidden by default)
    this.panelRoot = new Container()

    // Full-viewport dark overlay
    this.background = new Graphics()
    this.panelRoot.addChild(this.background)

    // "GAME OVER" title
    const titleStyle = new TextStyle({
      fontSize: 48,
      fontWeight: 'bold',
      fill: COLOR_TITLE,
      fontFamily: FONT_FAMILY,
    })
    this.titleText = new Text({ text: 'GAME OVER', style: titleStyle })
    this.titleText.anchor.set(0.5, 0)
    this.panelRoot.addChild(this.titleText)

    // Score and lines display — populated in show()
    const scoreStyle = new TextStyle({
      fontSize: 22,
      fill: COLOR_SCORE,
      fontFamily: FONT_FAMILY,
    })
    this.scoreText = new Text({ text: '', style: scoreStyle })
    this.scoreText.anchor.set(0.5, 0)
    this.panelRoot.addChild(this.scoreText)

    // Return to Menu button
    this.returnButton = this.buildButton('RETURN TO MENU')
    this.returnButton.on('pointerup', () => {
      this.onReturnToMenu()
    })
    this.panelRoot.addChild(this.returnButton)

    // "New Best!" indicator — shown only when a Sprint PB is set
    const pbStyle = new TextStyle({
      fontSize: 28,
      fontWeight: 'bold',
      fill: 0xffdd44,
      fontFamily: FONT_FAMILY,
    })
    this.pbText = new Text({ text: 'New Best!', style: pbStyle })
    this.pbText.anchor.set(0.5, 0)
    this.pbText.visible = false
    this.panelRoot.addChild(this.pbText)
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a pill-shaped interactive button container.
   * Dimensions are set in resize(); this method only establishes structure.
   */
  private buildButton(label: string): Container {
    const btn = new Container()
    btn.eventMode = 'static'
    btn.cursor = 'pointer'

    const bg = new Graphics()
    btn.addChild(bg)

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
   * Show the overlay with the given final score and line count.
   * Idempotent: calling show() when already visible does not add panelRoot twice
   * but does update the score text each time.
   */
  show(score: number, lines: number): void {
    this.scoreText.text = `Score: ${score}  Lines: ${lines}`
    if (!this.visible) {
      this.stage.addChild(this.panelRoot)
      this.visible = true
    }
  }

  /**
   * Show the overlay in Sprint mode with the final time and optional PB indicator.
   * Idempotent: calling showSprint() when already visible updates text each time.
   */
  showSprint(finalTimeMs: number, isNewPB: boolean): void {
    this.titleText.text = 'SPRINT COMPLETE'
    this.scoreText.text = formatSprintTime(finalTimeMs)
    this.pbText.visible = isNewPB
    this._sprintMode = true
    if (!this.visible) {
      this.stage.addChild(this.panelRoot)
      this.visible = true
    }
  }

  /**
   * Remove the overlay from the stage.
   * Idempotent: safe to call when already hidden.
   */
  hide(): void {
    if (this.visible) {
      this.stage.removeChild(this.panelRoot)
      this.visible = false
      this.titleText.text = 'GAME OVER'   // reset for next Marathon use
      this._sprintMode = false
      this.pbText.visible = false
    }
  }

  /**
   * Reposition and resize the overlay to match the current viewport dimensions.
   * Should be called from main.ts handleResize() regardless of visibility.
   */
  resize(w: number, h: number): void {
    const buttonW = Math.max(160, Math.min(300, w * 0.4))
    const buttonH = 52

    // Redraw full-viewport background
    this.background.clear()
    this.background.rect(0, 0, w, h)
    this.background.fill({ color: COLOR_BACKGROUND, alpha: BACKGROUND_ALPHA })

    // Position title
    this.titleText.x = w / 2
    this.titleText.y = h * 0.3

    // Position score text
    this.scoreText.x = w / 2
    this.scoreText.y = h * 0.45

    // pbText sits between scoreText and returnButton
    this.pbText.x = w / 2
    this.pbText.y = h * 0.53

    // Redraw return button pill and reposition
    const bg = this.returnButton.children[0] as Graphics
    bg.clear()
    bg.roundRect(-buttonW / 2, -buttonH / 2, buttonW, buttonH, 8)
    bg.fill({ color: COLOR_BUTTON_BG, alpha: 0.9 })

    this.returnButton.x = w / 2
    this.returnButton.y = h * 0.6
  }
}
