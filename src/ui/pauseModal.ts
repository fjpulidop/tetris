/**
 * Pause overlay modal.
 *
 * Renders a centered panel with a dark semi-transparent background,
 * a "PAUSED" title, and two interactive options:
 *   0 — RESUME
 *   1 — TITLE SCREEN
 *
 * Lifecycle:
 *   - Construction does NOT add anything to the stage (hidden by default).
 *   - show() adds panelRoot to stage; hide() removes it.
 *   - This avoids a visibility-toggle pattern and keeps the scene graph clean
 *     while the game is running.
 *
 * Follows the same constructor signature as HUD: (stage: Container).
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js'

const OPTION_LABELS = ['RESUME', 'TITLE SCREEN'] as const

const COLOR_SELECTED = 0xf0f000
const COLOR_UNSELECTED = 0x888888
const COLOR_TITLE = 0xffffff
const COLOR_BACKGROUND = 0x0d0d1a
const BACKGROUND_ALPHA = 0.88

const FONT_FAMILY = 'monospace'

/** Prefix rendered before the currently selected option. */
const SELECTED_PREFIX = '▶ '
/** Empty prefix for unselected options — same character width as SELECTED_PREFIX
 *  would require a monospace font to align, so we use a blank of the same visual
 *  footprint. Using two spaces ensures column alignment on monospace. */
const UNSELECTED_PREFIX = '  '

export class PauseModal {
  /** Called when the user confirms an option. Index 0 = Resume, 1 = Title Screen. */
  onSelect: (index: number) => void = () => undefined

  private stage: Container
  private panelRoot: Container
  private background: Graphics
  private titleText: Text
  private optionTexts: [Text, Text]
  /** Index of the currently highlighted option. */
  private selectedIndex = 0
  /** Whether panelRoot is currently attached to the stage. */
  private visible = false

  constructor(stage: Container) {
    this.stage = stage

    // --- Build panel hierarchy ---
    this.panelRoot = new Container()

    // Full-viewport dark overlay
    this.background = new Graphics()
    this.panelRoot.addChild(this.background)

    // "PAUSED" title
    const titleStyle = new TextStyle({
      fill: COLOR_TITLE,
      fontSize: 36,
      fontFamily: FONT_FAMILY,
      fontWeight: 'bold',
      letterSpacing: 6,
    })
    this.titleText = new Text({ text: 'PAUSED', style: titleStyle })
    this.panelRoot.addChild(this.titleText)

    // Option 0 — RESUME
    const opt0 = this.buildOptionText(0)
    // Option 1 — TITLE SCREEN
    const opt1 = this.buildOptionText(1)

    this.optionTexts = [opt0, opt1]
    this.panelRoot.addChild(opt0)
    this.panelRoot.addChild(opt1)

    // Apply initial selection styling
    this.applySelectionStyles()
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Show the modal, optionally setting the initially highlighted option.
   * Idempotent: calling show() twice does not add panelRoot twice.
   *
   * @param selectedIndex - Which option to highlight (default: 0)
   */
  show(selectedIndex = 0): void {
    this.selectedIndex = selectedIndex
    this.applySelectionStyles()

    if (!this.visible) {
      this.stage.addChild(this.panelRoot)
      this.visible = true
    }
  }

  /**
   * Remove panelRoot from the stage.
   * Idempotent: safe to call when already hidden.
   */
  hide(): void {
    if (this.visible) {
      this.stage.removeChild(this.panelRoot)
      this.visible = false
    }
  }

  /** Set which option is currently highlighted. */
  setSelection(index: number): void {
    this.selectedIndex = index
    this.applySelectionStyles()
  }

  /** Return the currently highlighted option index. */
  getSelection(): number {
    return this.selectedIndex
  }

  /**
   * Reposition and resize the overlay to match the current viewport dimensions.
   * Should be called from main.ts handleResize().
   *
   * @param w - Viewport width in pixels
   * @param h - Viewport height in pixels
   */
  resize(w: number, h: number): void {
    // Redraw full-viewport background
    this.background.clear()
    this.background.rect(0, 0, w, h)
    this.background.fill({ color: COLOR_BACKGROUND, alpha: BACKGROUND_ALPHA })

    // Center the title horizontally
    this.titleText.x = Math.floor((w - this.titleText.width) / 2)
    this.titleText.y = Math.floor(h * 0.35)

    // Stack options below the title with generous spacing
    const optionSpacing = 52
    const optionsTop = Math.floor(h * 0.52)

    for (let i = 0; i < this.optionTexts.length; i++) {
      const t = this.optionTexts[i]!
      t.x = Math.floor((w - t.width) / 2)
      t.y = optionsTop + i * optionSpacing
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildOptionText(index: number): Text {
    const style = new TextStyle({
      fill: index === 0 ? COLOR_SELECTED : COLOR_UNSELECTED,
      fontSize: 24,
      fontFamily: FONT_FAMILY,
      fontWeight: 'bold',
    })

    const label = OPTION_LABELS[index]!
    const t = new Text({ text: SELECTED_PREFIX + label, style })

    // Make the text interactive
    t.eventMode = 'static'
    t.cursor = 'pointer'
    t.on('pointerup', () => {
      this.selectedIndex = index
      this.applySelectionStyles()
      this.onSelect(index)
    })

    return t
  }

  /**
   * Re-render option text strings and styles to reflect the current selectedIndex.
   * Updates both the text prefix (▶ / spaces) and the fill colour.
   */
  private applySelectionStyles(): void {
    for (let i = 0; i < this.optionTexts.length; i++) {
      const t = this.optionTexts[i]!
      const label = OPTION_LABELS[i]!
      const isSelected = i === this.selectedIndex

      t.text = (isSelected ? SELECTED_PREFIX : UNSELECTED_PREFIX) + label

      // Update style fill colour
      // TextStyle is a plain object in PixiJS v8 — mutate the fill property directly.
      // The Text object picks up the change on the next render.
      const style = t.style as TextStyle
      style.fill = isSelected ? COLOR_SELECTED : COLOR_UNSELECTED
    }
  }
}
