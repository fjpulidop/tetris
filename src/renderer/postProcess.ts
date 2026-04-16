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
 * Controller returned by attachPostProcess, allowing callers to dynamically
 * adjust filter intensity based on chain depth.
 */
export interface PostProcessController {
  setChainDepth(depth: number): void
}

/**
 * Attach glow and bloom post-processing to the board and piece containers.
 * Does nothing on Canvas 2D renderer (filters require WebGL).
 *
 * @param boardContainer - Container holding the board grid and locked cells
 * @param pieceContainer - Container holding the active piece and ghost
 * @param app - The PixiJS Application instance
 * @returns A controller for dynamically adjusting filter intensity
 */
export function attachPostProcess(
  boardContainer: Container,
  pieceContainer: Container,
  app: Application
): PostProcessController {
  // Skip on Canvas 2D renderer — filters require WebGL
  // RendererType.CANVAS === 4 (bitfield enum in PixiJS v8)
  if (app.renderer.type === RendererType.CANVAS) {
    return { setChainDepth: () => {} }
  }

  try {
    // Cast is required because @pixi/filter-glow/bloom v5 types reference @pixi/core (v7)
    // rather than pixi.js v8. They are runtime-compatible.
    const boardGlow = new GlowFilter({ distance: 8, outerStrength: 1.5, color: 0xffffff })
    const pieceBloom = new BloomFilter(1.2)

    boardContainer.filters = [boardGlow as unknown as Filter]

    pieceContainer.filters = [
      new GlowFilter({ distance: 12, outerStrength: 2, color: 0xffffff }) as unknown as Filter,
      pieceBloom as unknown as Filter,
    ]

    return {
      setChainDepth(depth: number): void {
        try {
          const d = Math.min(Math.max(depth, 0), 3)
          const strengthTable = [1.5, 2.5, 4.0, 6.0] as const
          const bloomTable    = [1.2, 2.0, 3.5, 5.0] as const
          boardGlow.outerStrength = strengthTable[d] ?? 1.5
          ;(pieceBloom as unknown as { blur: number }).blur = bloomTable[d] ?? 1.2
        } catch {
          // filter mutations should not crash the game
        }
      }
    }
  } catch (e) {
    // If filter initialization fails for any reason, continue without effects
    console.warn('Post-processing filters could not be attached:', e)
    return { setChainDepth: () => {} }
  }
}
