/**
 * Main menu screen displayed on game load and after returning from game-over.
 *
 * Renders the game title with film-noir aesthetic: pitch-black background,
 * spotlight vignette, animated film-grain overlay (NoiseFilter), falling dust
 * particles, condensed serif typography, and a typewriter/blink prompt.
 *
 * Scenario picker buttons (Default/Cross/Pyramid/Diamond) and action buttons
 * (MARATHON/MONOCHROME/SPRINT/EXIT) retain all existing game logic. Only the
 * visual presentation layer changes.
 *
 * Layer boundary: imports from pixi.js and
 * ../engine/types.js (GameAction), and
 * ../engine/scenarios.js (SCENARIOS, DEFAULT_SCENARIO_ID, ScenarioDef).
 * scenarios.ts has no DOM/PixiJS imports — safe to import from the UI layer.
 */

import { Container, Graphics, NoiseFilter, Text, TextStyle } from 'pixi.js'
import type { Application, Filter, Ticker } from 'pixi.js'
import { GameAction } from '../engine/types.js'
import { SCENARIOS, DEFAULT_SCENARIO_ID } from '../engine/scenarios.js'
import type { ScenarioDef } from '../engine/scenarios.js'

/** The display title shown on the main menu. */
const GAME_TITLE = 'BLOCK DROP'

// Film noir palette — two accent hues: warm silver + cold blue-grey
const COLOR_BG = 0x000000
const COLOR_TITLE = 0xd8d0c0              // warm silver
const COLOR_PROMPT = 0x8899aa             // cold blue-grey
const COLOR_BUTTON_BG = 0x0a0a0a          // near-black
const COLOR_BUTTON_TEXT = 0xffffff
const COLOR_FALLBACK = 0x555566
const COLOR_SCENARIO_SELECTED_STROKE = 0x8899aa   // matches COLOR_PROMPT
const COLOR_SCENARIO_IDLE_STROKE = 0x2a2a2a
const FONT_FAMILY = '"Playfair Display", Georgia, serif'
const GRAIN_STRENGTH = 0.18
const DUST_PARTICLE_COUNT = 60
const TYPEWRITER_TICKS = 3   // frames per character
const BLINK_TICKS = 30       // frames per cursor blink toggle

interface DustParticle {
  gfx: Graphics
  x: number
  y: number
  vy: number    // pixels per frame at 60fps
  alpha: number
}

export class MainMenu {
  /** Called when the Exit button is tapped/clicked. Default is a no-op. */
  onExit: () => void = () => undefined
  /** Called when the SPRINT button is tapped/clicked. Default is a no-op. */
  onSprintStart: () => void = () => undefined

  private container: Container
  private backgroundRect: Graphics
  private vignetteGfx: Graphics
  private grainSprite: Graphics
  private dustContainer: Container
  private dustParticles: DustParticle[] = []
  private _width = 800
  private _height = 600
  private titleText: Text
  private promptText: Text
  private _promptRevealed = 0
  private _promptBlink = false
  private _promptTickAcc = 0
  private readonly PROMPT_FULL = 'press enter or tap to start'
  private playButton: Container
  private monochromeButton: Container
  private sprintButton: Container
  private exitButton: Container
  private fallbackText: Text
  private menuActionBuffer: GameAction[] = []
  private menuModeBuffer: string[] = []
  private ticker: Ticker
  private _elapsed = 0
  private _fallbackTimer: ReturnType<typeof setTimeout> | null = null

  // Scenario picker state
  private scenarioButtons: Container[] = []
  private selectedScenarioId: string = DEFAULT_SCENARIO_ID
  private menuScenarioBuffer: string[] = []

  // PixiJS v8 TickerCallback receives a Ticker instance, not a raw number.
  // ticker.deltaTime is the dimensionless scalar (~1.0 at 60fps) used for
  // frame-independent animations.
  private onTick = (ticker: Ticker) => {
    this._elapsed += ticker.deltaTime

    // Animate film grain — increment seed for per-frame variation
    if (this.grainSprite.filters && this.grainSprite.filters.length > 0) {
      (this.grainSprite.filters[0] as NoiseFilter).seed = Math.random()
    }

    // Title: static alpha (no pulse in noir)
    this.titleText.alpha = 1

    // Advance dust particles — no heap allocation per frame
    for (const p of this.dustParticles) {
      p.y += p.vy * ticker.deltaTime
      if (p.y > this._height + 4) {
        p.y = -4
        p.x = Math.random() * this._width
      }
      p.gfx.x = p.x
      p.gfx.y = p.y
    }

    // Typewriter reveal then cursor blink
    this._promptTickAcc++
    if (this._promptRevealed < this.PROMPT_FULL.length) {
      if (this._promptTickAcc >= TYPEWRITER_TICKS) {
        this._promptTickAcc = 0
        this._promptRevealed++
        this.promptText.text = this.PROMPT_FULL.slice(0, this._promptRevealed)
      }
    } else {
      if (this._promptTickAcc >= BLINK_TICKS) {
        this._promptTickAcc = 0
        this._promptBlink = !this._promptBlink
        this.promptText.text = this.PROMPT_FULL + (this._promptBlink ? '_' : ' ')
      }
    }
  }

  constructor(stage: Container, app: Application) {
    this.container = new Container()
    stage.addChild(this.container)

    // Store ticker reference so destroy() can remove the callback
    this.ticker = app.ticker

    // --- Noir background ---
    this.backgroundRect = new Graphics()
    this.container.addChild(this.backgroundRect)

    // --- Spotlight vignette (radial dark ring over centre) ---
    this.vignetteGfx = new Graphics()
    this.container.addChild(this.vignetteGfx)

    // --- Film-grain overlay ---
    this.grainSprite = new Graphics()
    try {
      this.grainSprite.filters = [
        new NoiseFilter({ noise: GRAIN_STRENGTH, seed: Math.random() }) as unknown as Filter,
      ]
    } catch (e) {
      // NoiseFilter requires WebGL — continue without grain on Canvas 2D renderer
      console.warn('MainMenu: NoiseFilter unavailable (Canvas renderer):', e)
    }
    this.container.addChild(this.grainSprite)

    // --- Dust / rain particle pool ---
    this.dustContainer = new Container()
    this.container.addChild(this.dustContainer)

    for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
      const gfx = new Graphics()
      gfx.circle(0, 0, 1 + Math.random())
      gfx.fill({ color: 0xaabbcc, alpha: 1 })
      const particle: DustParticle = {
        gfx,
        x: Math.random() * (app.screen.width),
        y: Math.random() * (app.screen.height),
        vy: 0.3 + Math.random() * 0.7,   // pixels per frame at 60fps
        alpha: 0.08 + Math.random() * 0.22,
      }
      gfx.alpha = particle.alpha
      gfx.x = particle.x
      gfx.y = particle.y
      this.dustContainer.addChild(gfx)
      this.dustParticles.push(particle)
    }

    // Title text — Playfair Display with drop-shadow (no glow: noir aesthetic)
    const titleStyle = new TextStyle({
      fontSize: 72,
      fontWeight: '700',
      fontFamily: FONT_FAMILY,
      fill: COLOR_TITLE,
      letterSpacing: 4,
      dropShadow: {
        alpha: 0.5,
        blur: 0,
        color: 0x000000,
        distance: 3,
        angle: Math.PI / 4,
      },
    })
    this.titleText = new Text({ text: GAME_TITLE, style: titleStyle })
    this.titleText.anchor.set(0.5)
    this.container.addChild(this.titleText)

    // No glow filter — noir aesthetic relies on shadow, not bloom.

    // Scenario picker buttons — one per entry in SCENARIOS catalog
    for (const scenarioDef of SCENARIOS) {
      const btn = this.buildScenarioButton(scenarioDef)
      this.scenarioButtons.push(btn)
      this.container.addChild(btn)
    }
    // Draw initial highlights
    this.updateScenarioButtonHighlights()

    // Play button — pushes GameAction.Start into the action buffer
    this.playButton = this.buildButton('MARATHON')
    this.playButton.on('pointerup', () => {
      this.menuScenarioBuffer.push(this.selectedScenarioId)
      this.menuActionBuffer.push(GameAction.Start)
    })
    this.container.addChild(this.playButton)

    // Monochrome button — pushes Start + records 'monochrome' mode
    this.monochromeButton = this.buildButton('MONOCHROME')
    this.monochromeButton.on('pointerup', () => {
      this.menuScenarioBuffer.push(this.selectedScenarioId)
      this.menuActionBuffer.push(GameAction.Start)
      this.menuModeBuffer.push('monochrome')
    })
    this.container.addChild(this.monochromeButton)

    // Sprint button — invokes onSprintStart callback
    this.sprintButton = this.buildButton('SPRINT')
    this.sprintButton.on('pointerup', () => {
      this.menuScenarioBuffer.push(this.selectedScenarioId)
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

    // Prompt text — typewriter/blink animation, added last
    const promptStyle = new TextStyle({
      fontSize: 14,
      fontFamily: FONT_FAMILY,
      fill: COLOR_PROMPT,
      letterSpacing: 6,
    })
    this.promptText = new Text({ text: '', style: promptStyle })
    this.promptText.anchor.set(0.5)
    this.container.addChild(this.promptText)

    // Register ticker for animations
    app.ticker.add(this.onTick)

    // Initial layout
    this.resize(app.screen.width, app.screen.height)
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a pill-shaped action button container (MARATHON/MONOCHROME/SPRINT/EXIT).
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

  /**
   * Build a small pill-shaped scenario picker button for one ScenarioDef.
   * The button highlights when its id matches selectedScenarioId.
   */
  private buildScenarioButton(scenarioDef: ScenarioDef): Container {
    const btn = new Container()
    btn.eventMode = 'static'
    btn.cursor = 'pointer'

    // Graphics pill — dimensions and stroke set in resize() / updateScenarioButtonHighlights()
    const bg = new Graphics()
    btn.addChild(bg)

    const txtStyle = new TextStyle({
      fontSize: 14,
      fontWeight: 'bold',
      fill: COLOR_BUTTON_TEXT,
      fontFamily: FONT_FAMILY,
    })
    const txt = new Text({ text: scenarioDef.name, style: txtStyle })
    txt.anchor.set(0.5)
    btn.addChild(txt)

    btn.on('pointerup', () => {
      this.selectedScenarioId = scenarioDef.id
      this.updateScenarioButtonHighlights()
    })

    return btn
  }

  /**
   * Redraw each scenario button's stroke based on whether its id matches
   * selectedScenarioId. Called after selection changes and on resize.
   */
  private updateScenarioButtonHighlights(): void {
    for (let i = 0; i < this.scenarioButtons.length; i++) {
      const btn = this.scenarioButtons[i]
      if (!btn) continue
      const scenarioDef = SCENARIOS[i]
      if (!scenarioDef) continue
      const bg = btn.children[0] as Graphics
      const isSelected = scenarioDef.id === this.selectedScenarioId
      const strokeColor = isSelected ? COLOR_SCENARIO_SELECTED_STROKE : COLOR_SCENARIO_IDLE_STROKE
      const w = (btn as { _pillW?: number })._pillW ?? 90
      const h = (btn as { _pillH?: number })._pillH ?? 36
      bg.clear()
      bg.roundRect(-w / 2, -h / 2, w, h, 6)
      bg.fill({ color: COLOR_BUTTON_BG, alpha: 0.9 })
      bg.setStrokeStyle({ width: 2, color: strokeColor, alpha: 1 })
      bg.roundRect(-w / 2, -h / 2, w, h, 6)
      bg.stroke()
    }
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
  flushMode(): string | null {
    const mode = this.menuModeBuffer.shift()
    return mode ?? null
  }

  /**
   * Drain and return the scenario id queued by the most recent start-button tap.
   * Returns null if no start button has been pressed since the last drain.
   * Paired with flushActions() — both are drained by main.ts each tick.
   */
  flushScenario(): string | null {
    return this.menuScenarioBuffer.shift() ?? null
  }

  /**
   * Reposition and resize all child elements to match the current viewport.
   * Should be called from main.ts handleResize().
   *
   * Scenario buttons:
   *   - width >= 480px: single horizontal row of 4 above MARATHON.
   *   - width  < 480px: 2x2 grid to handle narrow mobile viewports.
   */
  resize(width: number, height: number): void {
    this._width = width
    this._height = height

    // Full-screen background
    this.backgroundRect.clear()
    this.backgroundRect.rect(0, 0, width, height)
    this.backgroundRect.fill({ color: COLOR_BG, alpha: 1 })

    // Vignette: dark ellipse fading from transparent centre to full-black edge.
    // Approximated with two overlaid draws: a near-opaque black rectangle with
    // a zero-alpha ellipse punched out. The result is a dark ring with a lighter
    // oval window over the title — visually equivalent to a simple vignette.
    const cx = width / 2
    const cy = height * 0.28   // title vertical position
    const rx = width * 0.55
    const ry = height * 0.5
    this.vignetteGfx.clear()
    // Outer black ring
    this.vignetteGfx.rect(0, 0, width, height)
    this.vignetteGfx.fill({ color: 0x000000, alpha: 0.7 })
    // Cut-out highlight around title — draw an ellipse with near-zero alpha
    this.vignetteGfx.ellipse(cx, cy, rx, ry)
    this.vignetteGfx.fill({ color: 0x000000, alpha: 0 })

    // Grain sprite covers full screen
    this.grainSprite.clear()
    this.grainSprite.rect(0, 0, width, height)
    this.grainSprite.fill({ color: 0xffffff, alpha: 0.04 })

    const buttonW = Math.max(160, Math.min(300, width * 0.4))
    const buttonH = 52
    const fontSize = Math.max(18, Math.min(28, Math.floor(width * 0.055)))

    // Position title
    this.titleText.x = width / 2
    this.titleText.y = height * 0.28

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

    // Scenario picker layout
    const pillW = Math.max(60, Math.min(100, (buttonW / 4) - 6))
    const pillH = 36
    const scenarioRowY = height * 0.44

    if (width >= 480) {
      // Single horizontal row
      const totalPillsWidth = pillW * SCENARIOS.length + 8 * (SCENARIOS.length - 1)
      const pillStartX = width / 2 - totalPillsWidth / 2 + pillW / 2
      for (let i = 0; i < this.scenarioButtons.length; i++) {
        const btn = this.scenarioButtons[i]
        if (!btn) continue
        ;(btn as { _pillW?: number })._pillW = pillW
        ;(btn as { _pillH?: number })._pillH = pillH
        btn.x = pillStartX + i * (pillW + 8)
        btn.y = scenarioRowY
      }
    } else {
      // 2x2 grid
      const gridGapX = pillW + 6
      const gridGapY = pillH + 6
      const gridStartX = width / 2 - gridGapX / 2
      const gridStartY = scenarioRowY - gridGapY / 2
      for (let i = 0; i < this.scenarioButtons.length; i++) {
        const btn = this.scenarioButtons[i]
        if (!btn) continue
        ;(btn as { _pillW?: number })._pillW = pillW
        ;(btn as { _pillH?: number })._pillH = pillH
        const col = i % 2
        const row = Math.floor(i / 2)
        btn.x = gridStartX + col * gridGapX
        btn.y = gridStartY + row * gridGapY
      }
    }

    // Redraw scenario button highlights with updated dimensions
    this.updateScenarioButtonHighlights()

    // Action buttons — below scenario row
    const actionStartY = scenarioRowY + pillH + 24
    resizeButton(this.playButton,       width / 2, actionStartY)
    resizeButton(this.monochromeButton, width / 2, actionStartY + 60)
    resizeButton(this.sprintButton,     width / 2, actionStartY + 120)
    resizeButton(this.exitButton,       width / 2, actionStartY + 180)

    // Position fallback message below buttons
    this.fallbackText.x = width / 2
    this.fallbackText.y = actionStartY + 260

    // Position prompt text below the EXIT button
    this.promptText.x = width / 2
    this.promptText.y = actionStartY + 240
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
   * clear dust particle pool, and destroy the container hierarchy.
   */
  destroy(): void {
    this.ticker.remove(this.onTick)
    if (this._fallbackTimer !== null) {
      clearTimeout(this._fallbackTimer)
      this._fallbackTimer = null
    }
    this.dustParticles.length = 0
    this.container.destroy({ children: true })
  }
}
