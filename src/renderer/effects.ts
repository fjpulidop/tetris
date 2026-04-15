/**
 * Line-clear particle and flash effects, plus piece-lock burst, scaled line-clear
 * overlays, full-screen Tetris flash, level-up tint, and active-piece shimmer.
 *
 * Flash effect: white rectangle overlay per cleared row, fades over 200ms.
 * Particle effect: pool of 300 pre-allocated sprites, upward bias, alpha fade.
 * Piece-lock burst: ≥20 radial particles in the locked piece's Guideline color.
 * Edge pulse: screen-edge stroke overlay, scaled to line-clear count.
 * Tetris flash: full-viewport white flash for 4-line clears.
 * Level-up tint: gold background tint + edge pulse on level-up event.
 * Shimmer: oscillating white overlay on active-piece cells.
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { GameEvent } from '../engine/types.js'
import { BOARD_COLS } from '../engine/board.js'
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
  life: number     // ms remaining
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
        const payload = event.payload as { rows: number[]; count: number } | undefined
        if (payload && Array.isArray(payload.rows)) {
          this.triggerLineClearEffects(payload.rows, payload.count ?? 1)
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
    const y = row * this.cellSize
    const width = BOARD_COLS * this.cellSize

    g.rect(0, y, width, this.cellSize)
    g.fill({ color: 0xffffff, alpha: 1 })
    this.boardContainer.addChild(g)

    this.activeFlashes.push({ graphics: g, life: FLASH_DURATION_MS })
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

    // Update flash effects
    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const flash = this.activeFlashes[i]!
      flash.life -= dtMs
      flash.graphics.alpha = Math.max(0, flash.life / FLASH_DURATION_MS)

      if (flash.life <= 0) {
        this.boardContainer.removeChild(flash.graphics)
        flash.graphics.destroy()
        this.activeFlashes.splice(i, 1)
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

    // Update Tetris flash overlay
    if (this.tetrisFlashLife > 0) {
      this.tetrisFlashLife -= dtMs
      if (this.tetrisFlashLife <= 0) {
        this.tetrisFlashOverlay.visible = false
        this.tetrisFlashLife = 0
      } else {
        this.tetrisFlashOverlay.alpha = Math.max(
          0,
          (this.tetrisFlashLife / TETRIS_FLASH_DURATION_MS) * TETRIS_FLASH_ALPHA
        )
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
  }
}
