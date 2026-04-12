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

/**
 * Attach glow and bloom post-processing to the board and piece containers.
 * Does nothing on Canvas 2D renderer (filters require WebGL).
 *
 * @param boardContainer - Container holding the board grid and locked cells
 * @param pieceContainer - Container holding the active piece and ghost
 * @param app - The PixiJS Application instance
 */
export function attachPostProcess(
  boardContainer: Container,
  pieceContainer: Container,
  app: Application
): void {
  // Skip on Canvas 2D renderer — filters require WebGL
  // RendererType.CANVAS === 4 (bitfield enum in PixiJS v8)
  if (app.renderer.type === RendererType.CANVAS) {
    return
  }

  try {
    // Cast is required because @pixi/filter-glow/bloom v5 types reference @pixi/core (v7)
    // rather than pixi.js v8. They are runtime-compatible.
    boardContainer.filters = [
      new GlowFilter({ distance: 8, outerStrength: 1.5, color: 0xffffff }) as unknown as Filter,
    ]

    pieceContainer.filters = [
      new GlowFilter({ distance: 12, outerStrength: 2, color: 0xffffff }) as unknown as Filter,
      new BloomFilter(1.2) as unknown as Filter,
    ]
  } catch (e) {
    // If filter initialization fails for any reason, continue without effects
    console.warn('Post-processing filters could not be attached:', e)
  }
}
