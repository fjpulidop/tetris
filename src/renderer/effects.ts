/**
 * Line-clear particle and flash effects, plus piece-lock burst, scaled line-clear
 * overlays, full-screen Tetris flash, level-up tint, active-piece shimmer,
 * combo ripple rings, rainbow hue cycling on Tetris flash, and chromatic
 * aberration flash on level-up.
 *
 * Flash effect: left-to-right sweep wipe per cleared row (80ms), then fade (120ms).
 * Particle effect: pool of 300 pre-allocated sprites, upward bias, alpha fade.
 * Piece-lock burst: ≥20 radial particles in the locked piece's Guideline color.
 * Edge pulse: screen-edge stroke overlay, scaled to line-clear count.
 * Tetris flash: full-viewport rainbow flash for 4-line clears (300ms).
 * Level-up tint: chromatic aberration flash (300ms) + gold edge pulse.
 * Combo ripple: expanding ring(s) from board center on consecutive clears.
 * Shimmer: oscillating white overlay on active-piece cells.
 */

import { Container, Graphics, Sprite, Texture, ColorMatrixFilter } from 'pixi.js'
import type { GameEvent } from '../engine/types.js'
import { BOARD_COLS, BOARD_ROWS } from '../engine/board.js'
import { getCells } from '../engine/rotation.js'
import type { ActivePiece } from '../engine/rotation.js'
import { PIECE_COLORS } from '../engine/pieces.js'
import { CELL_COLORS } from './boardRenderer.js'
import type { GameState } from '../engine/gameState.js'

/** Duration of the row flash effect in ms. */
const FLASH_DURATION_MS = 200

/** Duration of particle effects in ms. */
const PARTICLE_DURATION_MS = 400

/** Particles per cleared row. */
const PARTICLES_PER_ROW = 30

/** Total particle pool size. Covers up to 4 rows × 30 particles + burst buffer. */
const PARTICLE_POOL_SIZE = 300

/** Particles emitted per piece lock. */
const LOCK_BURST_COUNT = 25

/** Lifetime for piece-lock burst particles in ms. */
const LOCK_BURST_DURATION_MS = 500

/** Size of lock-burst particles in px. */
const LOCK_BURST_PARTICLE_SIZE = 6

/** Edge pulse intensity levels. */
const EDGE_PULSE_CONFIGS = {
  medium: { strokeWidth: 6,  color: 0x00f0f0, alpha: 0.7,  durationMs: 400 },
  strong: { strokeWidth: 10, color: 0xa000f0, alpha: 0.85, durationMs: 500 },
  max:    { strokeWidth: 14, color: 0xffffff, alpha: 1.0,  durationMs: 600 },
} as const

/** Duration of the Tetris full-screen flash in ms. */
const TETRIS_FLASH_DURATION_MS = 300

/** Starting alpha for the Tetris flash overlay. */
const TETRIS_FLASH_ALPHA = 0.8

/** Level-up tint overlay duration in ms. */
const LEVEL_UP_TINT_DURATION_MS = 800

/** Duration of the row sweep wipe phase in ms (within FLASH_DURATION_MS total). */
const FLASH_SWEEP_PHASE_MS = 80

/** Duration and peak alpha for the chromatic aberration flash on level-up. */
const CHROMA_FLASH_DURATION_MS = 300
const CHROMA_SHIFT_PX = 3
const CHROMA_PEAK_ALPHA = 0.35

/** Duration and maximum radius for combo ripple rings. */
const RIPPLE_DURATION_MS = 400
const RIPPLE_MAX_RADIUS = 160 // px; roughly half the board diagonal at default cell size

interface Particle {
  sprite: Sprite
  vx: number
  vy: number
  life: number
  maxLife: number
  color: number  // tint color for this particle
}

interface FlashEffect {
  graphics: Graphics
  life: number        // ms remaining
  totalLife: number   // total duration (ms)
  sweepPhaseMs: number // duration of the left-to-right wipe phase
  row: number         // board row index (for redrawing during sweep)
}

interface RippleState {
  graphics: Graphics
  life: number
  maxLife: number
  cx: number
  cy: number
  color: number
  peakAlpha: number
}

export class EffectsRenderer {
  private boardContainer: Container

  /** Pre-allocated particle pool. */
  private particlePool: Particle[]
  /** Active flash effects. */
  private activeFlashes: FlashEffect[]

  private cellSize = 0
  private offsetX = 0
  private offsetY = 0

  /** Screen-space container (no board offset). Hosts full-viewport overlays. */
  private screenContainer: Container
  /** Screen width/height for full-viewport effects. Updated by resizeScreen(). */
  private screenW = 800
  private screenH = 600
  /** Pre-allocated edge pulse overlay (screen-space, stroke rect). */
  private edgePulseOverlay: Graphics
  private edgePulseLife = 0
  private edgePulseDuration = 0
  /** Pre-allocated Tetris flash overlay (screen-space, filled rect). */
  private tetrisFlashOverlay: Graphics
  private tetrisFlashLife = 0
  /** Pre-allocated level-up tint overlay (screen-space, filled rect). */
  private levelUpOverlay: Graphics
  private levelUpLife = 0

  /** Oscillating shimmer overlay on the active piece cells. */
  private shimmerGraphics: Graphics
  /** Phase accumulator for shimmer sine wave (radians). */
  private shimmerPhase = 0

  /** PostProcessController for triggering bloom spikes. */
  private postProcessController: import('./postProcess.js').PostProcessController | null = null

  /** ColorMatrixFilter for rainbow hue cycling during Tetris flash. */
  private tetrisHueFilter: ColorMatrixFilter | null = null

  /** Chromatic aberration overlays for level-up flash. */
  private chromaRedOverlay: Graphics
  private chromaBlueOverlay: Graphics
  private chromaFlashLife = 0

  /** Combo ripple rings (pre-allocated, up to 2 simultaneous). */
  private ripples: RippleState[]

  constructor(stage: Container) {
    this.boardContainer = new Container()
    stage.addChild(this.boardContainer)

    this.activeFlashes = []

    // Pre-allocate particle pool using Texture.WHITE (PixiJS v8 built-in white texture)
    this.particlePool = []
    const particleTexture = Texture.WHITE

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const sprite = new Sprite(particleTexture)
      sprite.anchor.set(0.5)
      sprite.width = 4
      sprite.height = 4
      sprite.visible = false
      this.boardContainer.addChild(sprite)

      this.particlePool.push({
        sprite,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: PARTICLE_DURATION_MS,
        color: 0xffffff,
      })
    }

    // Shimmer overlay lives in the board-relative container
    this.shimmerGraphics = new Graphics()
    this.boardContainer.addChild(this.shimmerGraphics)

    // Screen-space container (passed-in stage has no offset — use it directly)
    this.screenContainer = stage

    // Pre-allocate full-viewport overlays (not yet visible)
    this.edgePulseOverlay = new Graphics()
    this.edgePulseOverlay.visible = false
    this.screenContainer.addChild(this.edgePulseOverlay)

    this.tetrisFlashOverlay = new Graphics()
    this.tetrisFlashOverlay.visible = false
    this.screenContainer.addChild(this.tetrisFlashOverlay)

    this.levelUpOverlay = new Graphics()
    this.levelUpOverlay.visible = false
    this.screenContainer.addChild(this.levelUpOverlay)

    // Chromatic aberration overlays for level-up flash
    this.chromaRedOverlay = new Graphics()
    this.chromaRedOverlay.visible = false
    this.screenContainer.addChild(this.chromaRedOverlay)

    this.chromaBlueOverlay = new Graphics()
    this.chromaBlueOverlay.visible = false
    this.screenContainer.addChild(this.chromaBlueOverlay)

    // Pre-allocate two combo ripple ring Graphics (board-relative)
    const ripple0Graphics = new Graphics()
    this.boardContainer.addChild(ripple0Graphics)
    const ripple1Graphics = new Graphics()
    this.boardContainer.addChild(ripple1Graphics)

    this.ripples = [
      { graphics: ripple0Graphics, life: 0, maxLife: RIPPLE_DURATION_MS, cx: 0, cy: 0, color: 0xffffff, peakAlpha: 0.5 },
      { graphics: ripple1Graphics, life: 0, maxLife: RIPPLE_DURATION_MS, cx: 0, cy: 0, color: 0xffffff, peakAlpha: 0.5 },
    ]
  }

  resize(cellSize: number, offsetX: number, offsetY: number): void {
    this.cellSize = cellSize
    this.offsetX = offsetX
    this.offsetY = offsetY

    this.boardContainer.x = offsetX
    this.boardContainer.y = offsetY
  }

  resizeScreen(w: number, h: number): void {
    this.screenW = w
    this.screenH = h
  }

  /** Receives the PostProcessController so EffectsRenderer can trigger bloom spikes. */
  setPostProcessController(controller: import('./postProcess.js').PostProcessController): void {
    this.postProcessController = controller
  }

  /**
   * Process game events and trigger appropriate effects.
   */
  onEvents(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'line-clear') {
        const payload = event.payload as { rows: number[]; count: number; combo?: number } | undefined
        if (payload && Array.isArray(payload.rows)) {
          this.triggerLineClearEffects(payload.rows, payload.count ?? 1)
          const combo = payload.combo ?? 1
          if (combo >= 2) {
            this.triggerComboRipple(combo)
          }
        }
      }
      if (event.type === 'piece-lock') {
        const payload = event.payload as { piece: ActivePiece } | undefined
        if (payload?.piece) {
          this.triggerPieceLockBurst(payload.piece)
        }
      }
      if (event.type === 'level-up') {
        this.triggerLevelUp()
      }
    }
  }

  /**
   * Trigger flash and particle effects for the given cleared row indices,
   * scaled to the number of rows cleared simultaneously.
   */
  private triggerLineClearEffects(rows: number[], count: number): void {
    // Flash and particles per row (unchanged behavior)
    for (const row of rows) {
      this.triggerFlash(row)
      this.triggerParticles(row)
    }

    // Scaled extras based on count
    if (count === 2) {
      this.triggerEdgePulse('medium')
    } else if (count === 3) {
      this.triggerEdgePulse('strong')
    } else if (count >= 4) {
      this.triggerTetrisFlash()
      this.triggerEdgePulse('max')
    }
  }

  private triggerFlash(row: number): void {
    const g = new Graphics()
    // Start with zero width — the sweep phase will expand it left-to-right
    this.boardContainer.addChild(g)

    this.activeFlashes.push({
      graphics: g,
      life: FLASH_DURATION_MS,
      totalLife: FLASH_DURATION_MS,
      sweepPhaseMs: FLASH_SWEEP_PHASE_MS,
      row,
    })
  }

  private triggerParticles(row: number, color = 0xffffff, count = PARTICLES_PER_ROW, size = 4): void {
    const rowY = (row + 0.5) * this.cellSize
    const rowWidth = BOARD_COLS * this.cellSize

    let activated = 0
    for (const particle of this.particlePool) {
      if (activated >= count) break
      if (particle.sprite.visible) continue

      particle.sprite.visible = true
      particle.sprite.alpha = 1
      particle.sprite.width = size
      particle.sprite.height = size
      particle.sprite.tint = color
      particle.sprite.x = Math.random() * rowWidth
      particle.sprite.y = rowY
      particle.sprite.scale.set(Math.random() * 0.5 + 0.5)

      particle.vx = (Math.random() - 0.5) * 4
      particle.vy = -(Math.random() * 3 + 1)
      particle.life = PARTICLE_DURATION_MS
      particle.maxLife = PARTICLE_DURATION_MS
      particle.color = color

      activated++
    }
  }

  /**
   * Emit a radial burst of ≥20 particles from the centroid of the locked piece.
   * Particle color matches the piece type's Guideline color.
   */
  private triggerPieceLockBurst(piece: ActivePiece): void {
    const colorIndex = PIECE_COLORS[piece.type]
    const color = CELL_COLORS[colorIndex] ?? 0xffffff

    const cells = getCells(piece)
    // Compute piece centroid in board-space pixel coordinates
    let sumCol = 0
    let sumRow = 0
    for (const [r, c] of cells) {
      sumRow += r
      sumCol += c
    }
    const cx = (sumCol / 4 + 0.5) * this.cellSize
    const cy = (sumRow / 4 + 0.5) * this.cellSize

    let activated = 0
    for (const particle of this.particlePool) {
      if (activated >= LOCK_BURST_COUNT) break
      if (particle.sprite.visible) continue

      // Uniformly distribute angles around 360°
      const angle = (activated / LOCK_BURST_COUNT) * Math.PI * 2 + Math.random() * 0.4
      const speed = 2 + Math.random() * 4

      particle.sprite.visible = true
      particle.sprite.alpha = 1
      particle.sprite.width = LOCK_BURST_PARTICLE_SIZE
      particle.sprite.height = LOCK_BURST_PARTICLE_SIZE
      particle.sprite.tint = color
      particle.sprite.x = cx
      particle.sprite.y = cy
      particle.sprite.scale.set(Math.random() * 0.5 + 0.5)

      particle.vx = Math.cos(angle) * speed
      particle.vy = Math.sin(angle) * speed
      particle.life = LOCK_BURST_DURATION_MS
      particle.maxLife = LOCK_BURST_DURATION_MS
      particle.color = color

      activated++
    }
  }

  private triggerEdgePulse(intensity: 'medium' | 'strong' | 'max'): void {
    const cfg = EDGE_PULSE_CONFIGS[intensity]
    const g = this.edgePulseOverlay
    g.clear()
    g.setStrokeStyle({ width: cfg.strokeWidth, color: cfg.color, alpha: cfg.alpha })
    g.rect(0, 0, this.screenW, this.screenH)
    g.stroke()
    g.visible = true
    g.alpha = cfg.alpha
    this.edgePulseLife = cfg.durationMs
    this.edgePulseDuration = cfg.durationMs
  }

  /**
   * Full-viewport white flash for Tetris (4-line) clears.
   * Fades from TETRIS_FLASH_ALPHA to 0 over TETRIS_FLASH_DURATION_MS.
   */
  private triggerTetrisFlash(): void {
    const g = this.tetrisFlashOverlay
    g.clear()
    g.rect(0, 0, this.screenW, this.screenH)
    g.fill({ color: 0xffffff, alpha: 1 })
    g.visible = true
    g.alpha = TETRIS_FLASH_ALPHA
    this.tetrisFlashLife = TETRIS_FLASH_DURATION_MS

    // Attach rainbow hue filter — reset to 0 degrees for a fresh cycle
    if (this.tetrisHueFilter === null) {
      this.tetrisHueFilter = new ColorMatrixFilter()
    }
    this.tetrisHueFilter.hue(0, false)
    this.tetrisFlashOverlay.filters = [this.tetrisHueFilter as unknown as import('pixi.js').Filter]

    this.postProcessController?.setBloomSpike(4.0, 500)
  }

  /**
   * Level-up visual: gold screen-edge pulse + translucent gold background tint.
   * If a Tetris flash is currently active, skip the background tint (Tetris takes
   * visual priority); only add the edge pulse.
   */
  private triggerLevelUp(): void {
    // Gold edge pulse
    const g = this.edgePulseOverlay
    g.clear()
    g.setStrokeStyle({ width: 10, color: 0xf0a000, alpha: 0.9 })
    g.rect(0, 0, this.screenW, this.screenH)
    g.stroke()
    g.visible = true
    g.alpha = 0.9
    this.edgePulseLife = LEVEL_UP_TINT_DURATION_MS
    this.edgePulseDuration = LEVEL_UP_TINT_DURATION_MS

    // Background tint only if Tetris flash is not already active
    if (this.tetrisFlashLife <= 0) {
      const overlay = this.levelUpOverlay
      overlay.clear()
      overlay.rect(0, 0, this.screenW, this.screenH)
      overlay.fill({ color: 0xf0a000, alpha: 1 })
      overlay.visible = true
      overlay.alpha = 0.15
      this.levelUpLife = LEVEL_UP_TINT_DURATION_MS
    }

    // RGB-split chromatic aberration flash
    this.triggerChromaFlash()
  }

  private triggerChromaFlash(): void {
    const w = this.screenW
    const h = this.screenH

    this.chromaRedOverlay.clear()
    this.chromaRedOverlay.rect(-CHROMA_SHIFT_PX, 0, w, h)
    this.chromaRedOverlay.fill({ color: 0xff0000, alpha: 1 })
    this.chromaRedOverlay.visible = true
    this.chromaRedOverlay.alpha = CHROMA_PEAK_ALPHA

    this.chromaBlueOverlay.clear()
    this.chromaBlueOverlay.rect(CHROMA_SHIFT_PX, 0, w, h)
    this.chromaBlueOverlay.fill({ color: 0x0000ff, alpha: 1 })
    this.chromaBlueOverlay.visible = true
    this.chromaBlueOverlay.alpha = CHROMA_PEAK_ALPHA

    this.chromaFlashLife = CHROMA_FLASH_DURATION_MS
  }

  private triggerComboRipple(combo: number): void {
    const cx = (BOARD_COLS / 2) * this.cellSize
    const cy = (BOARD_ROWS / 2) * this.cellSize
    const color = CELL_COLORS[(combo % 7) + 1] ?? 0xffffff
    const peakAlpha = Math.min(0.9, 0.4 + combo * 0.1)

    // Find the first inactive ripple slot, or the older (further-decayed) active one
    let slot = this.ripples.find(r => r.life <= 0)
    if (slot === undefined) {
      // Both active — evict the one with less life remaining (older)
      slot = this.ripples[0]!.life <= this.ripples[1]!.life
        ? this.ripples[0]!
        : this.ripples[1]!
    }
    slot.cx = cx
    slot.cy = cy
    slot.color = color
    slot.peakAlpha = peakAlpha
    slot.maxLife = RIPPLE_DURATION_MS
    slot.life = RIPPLE_DURATION_MS

    // For combo >= 3, spawn a second ring slightly ahead in time so it appears 80ms after
    if (combo >= 3) {
      const slot2 = this.ripples.find(r => r !== slot && r.life <= 0)
        ?? (this.ripples[0] === slot ? this.ripples[1]! : this.ripples[0]!)
      slot2.cx = cx
      slot2.cy = cy
      slot2.color = CELL_COLORS[((combo + 1) % 7) + 1] ?? 0xffffff
      slot2.peakAlpha = peakAlpha
      slot2.maxLife = RIPPLE_DURATION_MS
      // Start life shorter so the ring appears to begin 80ms later visually
      slot2.life = RIPPLE_DURATION_MS - 80
    }
  }

  /**
   * Advance all active effects by dtMs. Called every render frame.
   */
  tick(dtMs: number, state: GameState): void {
    // --- Shimmer update ---
    this.shimmerPhase += (2 * Math.PI * 1.5) * (dtMs / 1000)

    if (state.phase === 'playing' && state.activePiece !== null) {
      const piece = state.activePiece
      const cells = getCells(piece)
      const alpha = 0.12 + 0.06 * Math.sin(this.shimmerPhase)
      const size = this.cellSize - 2

      this.shimmerGraphics.clear()
      for (const [row, col] of cells) {
        if (row < 0 || col < 0) continue
        const x = col * this.cellSize + 1
        const y = row * this.cellSize + 1
        this.shimmerGraphics.roundRect(x, y, size, size, 2)
      }
      this.shimmerGraphics.fill({ color: 0xffffff, alpha })
      this.shimmerGraphics.visible = true
    } else {
      this.shimmerGraphics.clear()
      this.shimmerGraphics.visible = false
    }

    // Update flash effects (left-to-right sweep, then alpha fade)
    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const flash = this.activeFlashes[i]!
      flash.life -= dtMs

      if (flash.life <= 0) {
        this.boardContainer.removeChild(flash.graphics)
        flash.graphics.destroy()
        this.activeFlashes.splice(i, 1)
        continue
      }

      const age = flash.totalLife - flash.life
      const g = flash.graphics
      const y = flash.row * this.cellSize
      const maxWidth = BOARD_COLS * this.cellSize

      if (age < flash.sweepPhaseMs) {
        // Sweep phase: expand width left-to-right
        const progress = age / flash.sweepPhaseMs
        g.clear()
        g.rect(0, y, maxWidth * progress, this.cellSize)
        g.fill({ color: 0xffffff, alpha: 1 })
        g.alpha = 1
      } else {
        // Fade phase: full width, decreasing alpha
        const fadeRemaining = flash.life
        const fadeDuration = flash.totalLife - flash.sweepPhaseMs
        g.alpha = Math.max(0, fadeRemaining / fadeDuration)
      }
    }

    // Update particles
    for (const particle of this.particlePool) {
      if (!particle.sprite.visible) continue

      particle.life -= dtMs
      if (particle.life <= 0) {
        particle.sprite.visible = false
        particle.sprite.tint = 0xffffff  // reset tint for pool reuse
        continue
      }

      // Update position
      particle.sprite.x += particle.vx
      particle.sprite.y += particle.vy
      particle.vy += 0.1 // Gravity

      // Fade alpha
      particle.sprite.alpha = Math.max(0, particle.life / particle.maxLife)
    }

    // Update edge pulse
    if (this.edgePulseLife > 0) {
      this.edgePulseLife -= dtMs
      if (this.edgePulseLife <= 0) {
        this.edgePulseOverlay.visible = false
        this.edgePulseLife = 0
      } else {
        this.edgePulseOverlay.alpha = Math.max(0, this.edgePulseLife / this.edgePulseDuration)
      }
    }

    // Update Tetris flash overlay (with rainbow hue cycling)
    if (this.tetrisFlashLife > 0) {
      this.tetrisFlashLife -= dtMs
      if (this.tetrisFlashLife <= 0) {
        this.tetrisFlashOverlay.visible = false
        this.tetrisFlashOverlay.filters = []
        this.tetrisFlashLife = 0
      } else {
        this.tetrisFlashOverlay.alpha = Math.max(
          0,
          (this.tetrisFlashLife / TETRIS_FLASH_DURATION_MS) * TETRIS_FLASH_ALPHA
        )
        // Cycle hue: 90 degrees per second
        if (this.tetrisHueFilter !== null) {
          this.tetrisHueFilter.hue(
            (90 * this.tetrisFlashLife / TETRIS_FLASH_DURATION_MS) % 360,
            false
          )
        }
      }
    }

    // Update level-up tint overlay
    if (this.levelUpLife > 0) {
      this.levelUpLife -= dtMs
      if (this.levelUpLife <= 0) {
        this.levelUpOverlay.visible = false
        this.levelUpLife = 0
      } else {
        this.levelUpOverlay.alpha = Math.max(
          0,
          (this.levelUpLife / LEVEL_UP_TINT_DURATION_MS) * 0.15
        )
      }
    }

    // Update chromatic aberration flash (level-up RGB-split)
    if (this.chromaFlashLife > 0) {
      this.chromaFlashLife -= dtMs
      if (this.chromaFlashLife <= 0) {
        this.chromaRedOverlay.visible = false
        this.chromaBlueOverlay.visible = false
        this.chromaFlashLife = 0
      } else {
        const t = this.chromaFlashLife / CHROMA_FLASH_DURATION_MS
        this.chromaRedOverlay.alpha = CHROMA_PEAK_ALPHA * t
        this.chromaBlueOverlay.alpha = CHROMA_PEAK_ALPHA * t
      }
    }

    // Update combo ripple rings
    for (const ripple of this.ripples) {
      if (ripple.life <= 0) continue

      const t = 1 - (ripple.life / ripple.maxLife) // 0→1 over lifetime
      const radius = RIPPLE_MAX_RADIUS * t
      const alpha = ripple.peakAlpha * (1 - t)
      const g = ripple.graphics

      g.clear()
      g.setStrokeStyle({ width: 2, color: ripple.color, alpha })
      g.circle(ripple.cx, ripple.cy, radius)
      g.stroke()

      ripple.life -= dtMs
      if (ripple.life <= 0) {
        g.clear()
      }
    }
  }
}
