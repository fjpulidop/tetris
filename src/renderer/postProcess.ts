/**
 * Post-processing filters: glow and bloom on board/piece containers.
 *
 * Filters are skipped gracefully when running on Canvas 2D renderer.
 * HUD is NOT filtered — these are scoped to board and piece containers only.
 *
 * Note: @pixi/filter-glow and @pixi/filter-bloom v5 are built for PixiJS v7
 * but work at runtime with PixiJS v8. TypeScript types require casting.
 * RendererType.CANVAS === 4 in PixiJS v8.
 */

import { Container, RendererType } from 'pixi.js'
import type { Application, Filter } from 'pixi.js'
import { GlowFilter } from '@pixi/filter-glow'
import { BloomFilter } from '@pixi/filter-bloom'

/** Controller returned by attachPostProcess() for dynamic post-process adjustments. */
export interface PostProcessController {
  setBloomSpike(strength: number, durationMs: number): void
  tick(dtMs: number): void
}

function noOpController(): PostProcessController {
  return {
    setBloomSpike: () => undefined,
    tick: () => undefined,
  }
}

/**
 * Attach glow and bloom post-processing to the board and piece containers.
 * Does nothing on Canvas 2D renderer (filters require WebGL).
 *
 * @param boardContainer - Container holding the board grid and locked cells
 * @param pieceContainer - Container holding the active piece and ghost
 * @param app - The PixiJS Application instance
 * @returns A PostProcessController for dynamic adjustments
 */
export function attachPostProcess(
  boardContainer: Container,
  pieceContainer: Container,
  app: Application
): PostProcessController {
  // Skip on Canvas 2D renderer — filters require WebGL
  // RendererType.CANVAS === 4 (bitfield enum in PixiJS v8)
  if (app.renderer.type === RendererType.CANVAS) {
    return noOpController()
  }

  try {
    // Cast is required because @pixi/filter-glow/bloom v5 types reference @pixi/core (v7)
    // rather than pixi.js v8. They are runtime-compatible.
    boardContainer.filters = [
      new GlowFilter({ distance: 8, outerStrength: 1.5, color: 0xffffff }) as unknown as Filter,
    ]

    const BASELINE_BLOOM = 1.2
    type BloomFilterType = { blur: number } & Filter
    const bloomFilter = new BloomFilter(BASELINE_BLOOM) as unknown as BloomFilterType
    pieceContainer.filters = [
      new GlowFilter({ distance: 12, outerStrength: 2, color: 0xffffff }) as unknown as Filter,
      bloomFilter as unknown as Filter,
    ]

    let spikeStrength = BASELINE_BLOOM
    let spikeRemainingMs = 0
    let spikeDurationMs = 1

    const controller: PostProcessController = {
      setBloomSpike(strength: number, durationMs: number): void {
        spikeStrength = strength
        spikeRemainingMs = durationMs
        spikeDurationMs = durationMs
        ;(bloomFilter as unknown as { blur: number }).blur = strength
      },
      tick(dtMs: number): void {
        if (spikeRemainingMs <= 0) return
        spikeRemainingMs -= dtMs
        if (spikeRemainingMs <= 0) {
          spikeRemainingMs = 0
          ;(bloomFilter as unknown as { blur: number }).blur = BASELINE_BLOOM
        } else {
          const t = spikeRemainingMs / spikeDurationMs
          const current = BASELINE_BLOOM + (spikeStrength - BASELINE_BLOOM) * t
          ;(bloomFilter as unknown as { blur: number }).blur = current
        }
      },
    }

    return controller
  } catch (e) {
    console.warn('Post-processing filters could not be attached:', e)
    return noOpController()
  }
}
