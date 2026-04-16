/**
 * Screen shake effect — applies a damped sinusoidal translation to the root
 * stage container, creating a physically-plausible shake that decays to rest.
 *
 * Used for: hard-drop piece lock (intensity 6) and Tetris 4-line clear (intensity 10).
 *
 * Formula: offset(t) = intensity * sin(frequency * t) * e^(-decay * t)
 * frequency = 40 rad/s, decay = 20 (damps to ~2% peak in ~200ms).
 */

import type { Container } from 'pixi.js'

export class ShakeEffect {
  private stage: Container
  private intensity = 0
  private elapsed = 0
  private duration = 0

  constructor(stage: Container) {
    this.stage = stage
  }

  /**
   * Trigger a screen shake. If a stronger shake is already active, the new
   * call is ignored. A weaker ongoing shake is overridden by a stronger one.
   */
  triggerShake(intensity: number, durationMs = 250): void {
    // Only upgrade if new shake is stronger, or current shake has expired
    if (intensity > this.intensity || this.elapsed >= this.duration) {
      this.intensity = intensity
      this.duration = durationMs
      this.elapsed = 0
    }
  }

  /**
   * Immediately zero the stage offset and mark the shake as expired.
   * Call on pause to avoid freezing the stage at a displaced offset.
   */
  reset(): void {
    this.intensity = 0
    this.elapsed = this.duration // force expired
    this.stage.x = 0
    this.stage.y = 0
  }

  /**
   * Advance the shake animation by dtMs milliseconds. Call every render frame.
   */
  tick(dtMs: number): void {
    if (this.elapsed >= this.duration) {
      this.stage.x = 0
      this.stage.y = 0
      return
    }

    this.elapsed += dtMs
    const t = this.elapsed / 1000 // seconds
    const decay = Math.exp(-20 * t)
    const offset = this.intensity * Math.sin(40 * t) * decay
    this.stage.x = offset
    this.stage.y = offset * 0.4 // less vertical shake than horizontal
  }
}
