/**
 * Line-clear particle and flash effects.
 *
 * Flash effect: white rectangle overlay per cleared row, fades over 200ms.
 * Particle effect: 30 small squares per cleared row, with randomized velocities,
 *   upward bias, alpha fade over 400ms. Uses an object pool (pre-allocated).
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { GameEvent } from '../engine/types.js'
import { BOARD_COLS } from '../engine/board.js'

/** Duration of the row flash effect in ms. */
const FLASH_DURATION_MS = 200

/** Duration of particle effects in ms. */
const PARTICLE_DURATION_MS = 400

/** Particles per cleared row. */
const PARTICLES_PER_ROW = 30

/** Total particle pool size. Covers up to 4 rows × 30 particles + buffer. */
const PARTICLE_POOL_SIZE = 200

interface Particle {
  sprite: Sprite
  vx: number
  vy: number
  life: number     // ms remaining
  maxLife: number  // total lifetime ms
}

interface FlashEffect {
  graphics: Graphics
  life: number     // ms remaining
}

export class EffectsRenderer {
  private container: Container

  /** Pre-allocated particle pool. */
  private particlePool: Particle[]
  /** Active flash effects. */
  private activeFlashes: FlashEffect[]

  private cellSize = 0
  private offsetX = 0
  private offsetY = 0

  constructor(stage: Container) {
    this.container = new Container()
    stage.addChild(this.container)

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
      this.container.addChild(sprite)

      this.particlePool.push({
        sprite,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: PARTICLE_DURATION_MS,
      })
    }
  }

  resize(cellSize: number, offsetX: number, offsetY: number): void {
    this.cellSize = cellSize
    this.offsetX = offsetX
    this.offsetY = offsetY

    this.container.x = offsetX
    this.container.y = offsetY
  }

  /**
   * Process game events and trigger appropriate effects.
   */
  onEvents(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'line-clear') {
        const payload = event.payload as { rows: number[]; count: number } | undefined
        if (payload && Array.isArray(payload.rows)) {
          this.triggerLineClearEffects(payload.rows)
        }
      }
    }
  }

  /**
   * Trigger flash and particle effects for the given cleared row indices.
   */
  private triggerLineClearEffects(rows: number[]): void {
    for (const row of rows) {
      this.triggerFlash(row)
      this.triggerParticles(row)
    }
  }

  private triggerFlash(row: number): void {
    const g = new Graphics()
    const y = row * this.cellSize
    const width = BOARD_COLS * this.cellSize

    g.rect(0, y, width, this.cellSize)
    g.fill({ color: 0xffffff, alpha: 1 })
    this.container.addChild(g)

    this.activeFlashes.push({ graphics: g, life: FLASH_DURATION_MS })
  }

  private triggerParticles(row: number): void {
    const rowY = (row + 0.5) * this.cellSize
    const rowWidth = BOARD_COLS * this.cellSize

    let activated = 0
    for (const particle of this.particlePool) {
      if (activated >= PARTICLES_PER_ROW) break
      if (particle.sprite.visible) continue

      // Activate particle
      particle.sprite.visible = true
      particle.sprite.alpha = 1
      particle.sprite.x = Math.random() * rowWidth
      particle.sprite.y = rowY
      particle.sprite.scale.set(Math.random() * 0.5 + 0.5)

      // Randomize velocity: upward bias
      particle.vx = (Math.random() - 0.5) * 4
      particle.vy = -(Math.random() * 3 + 1)
      particle.life = PARTICLE_DURATION_MS
      particle.maxLife = PARTICLE_DURATION_MS

      activated++
    }
  }

  /**
   * Advance all active effects by dtMs. Called every render frame.
   */
  tick(dtMs: number): void {
    // Update flash effects
    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const flash = this.activeFlashes[i]!
      flash.life -= dtMs
      flash.graphics.alpha = Math.max(0, flash.life / FLASH_DURATION_MS)

      if (flash.life <= 0) {
        this.container.removeChild(flash.graphics)
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
        continue
      }

      // Update position
      particle.sprite.x += particle.vx
      particle.sprite.y += particle.vy
      particle.vy += 0.1 // Gravity

      // Fade alpha
      particle.sprite.alpha = Math.max(0, particle.life / particle.maxLife)
    }
  }
}
