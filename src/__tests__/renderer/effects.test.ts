/**
 * Unit tests for EffectsRenderer (src/renderer/effects.ts).
 *
 * PixiJS has no real WebGL context in jsdom, so all Pixi classes are mocked
 * using vi.mock() — the same pattern used in the UI test suite.
 *
 * vi.mock() factories are hoisted above imports by Vitest. All mock class
 * definitions MUST live inside the factory, not at module scope.
 *
 * To reach private fields and assert on visible/alpha we expose them via
 * type-casting helpers (no production code is changed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Pixi mock — must live entirely inside the factory closure.
// ---------------------------------------------------------------------------
vi.mock('pixi.js', () => {
  class MockContainer {
    children: unknown[] = []
    x = 0
    y = 0
    filters: unknown = null

    addChild(child: unknown): unknown {
      this.children.push(child)
      return child
    }

    removeChild(child: unknown): unknown {
      const idx = this.children.indexOf(child)
      if (idx !== -1) this.children.splice(idx, 1)
      return child
    }
  }

  class MockGraphics extends MockContainer {
    alpha = 1
    visible = false

    clear(): this { return this }
    rect(): this { return this }
    roundRect(): this { return this }
    fill(): this { return this }
    setStrokeStyle(): this { return this }
    stroke(): this { return this }
    destroy(): void { /* no-op */ }
  }

  class MockSprite extends MockContainer {
    alpha = 1
    visible = false
    tint = 0xffffff
    width = 0
    height = 0
    anchor = {
      set: vi.fn(),
    }
    scale = {
      set: vi.fn(),
    }
    x = 0
    y = 0
  }

  const MockTexture = {
    WHITE: {},
  }

  return {
    Container: MockContainer,
    Graphics: MockGraphics,
    Sprite: MockSprite,
    Texture: MockTexture,
  }
})

// ---------------------------------------------------------------------------
// Import the mocked pixi.js names so we can construct stages in tests.
// ---------------------------------------------------------------------------
import { Container as PixiContainer } from 'pixi.js'
import { EffectsRenderer } from '../../renderer/effects.js'
import type { GameState } from '../../engine/gameState.js'
import type { ActivePiece } from '../../engine/rotation.js'
import type { GameEvent } from '../../engine/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStage(): InstanceType<typeof PixiContainer> {
  return new PixiContainer()
}

/** A minimal GameState stub for testing tick() behaviour. */
function makeState(phase: GameState['phase'], activePiece: ActivePiece | null = null): GameState {
  return {
    board: new Uint8Array(200),
    activePiece,
    nextPiece: 'I',
    bag: [],
    score: 0,
    lines: 0,
    level: 1,
    lockDelay: 0,
    lockMoves: 0,
    phase,
    highScores: [],
  } as unknown as GameState
}

/** A minimal line-clear event. */
function lineClearEvent(rows: number[], count: number): GameEvent {
  return { type: 'line-clear', payload: { rows, count } }
}

/** A minimal piece-lock event with the piece in the payload. */
function pieceLockEvent(piece: ActivePiece): GameEvent {
  return { type: 'piece-lock', payload: { piece } }
}

/** A level-up event. */
function levelUpEvent(): GameEvent {
  return { type: 'level-up' }
}

/** Cast renderer to access private fields for assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function internals(renderer: EffectsRenderer): Record<string, any> {
  return renderer as unknown as Record<string, any>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EffectsRenderer — pool size', () => {
  it('pool size is 300 after construction', () => {
    const stage = makeStage()
    const renderer = new EffectsRenderer(stage)
    expect(internals(renderer).particlePool).toHaveLength(300)
  })
})

describe('EffectsRenderer — piece-lock burst', () => {
  let renderer: EffectsRenderer

  beforeEach(() => {
    renderer = new EffectsRenderer(makeStage())
    renderer.resize(30, 0, 0)
  })

  it('activates ≥20 particles when piece-lock event is received', () => {
    const piece: ActivePiece = { type: 'T', rotation: 0, row: 5, col: 3 }
    renderer.onEvents([pieceLockEvent(piece)])

    const pool: { sprite: { visible: boolean } }[] = internals(renderer).particlePool
    const active = pool.filter(p => p.sprite.visible)
    expect(active.length).toBeGreaterThanOrEqual(20)
  })
})

describe('EffectsRenderer — line-clear edge pulse scaling', () => {
  let renderer: EffectsRenderer

  beforeEach(() => {
    renderer = new EffectsRenderer(makeStage())
    renderer.resize(30, 0, 0)
    renderer.resizeScreen(800, 600)
  })

  it('count=1 line-clear: no edge pulse overlay shown', () => {
    renderer.onEvents([lineClearEvent([5], 1)])
    const overlay = internals(renderer).edgePulseOverlay
    expect(overlay.visible).toBe(false)
  })

  it('count=2 line-clear: edge pulse overlay is shown', () => {
    renderer.onEvents([lineClearEvent([4, 5], 2)])
    const overlay = internals(renderer).edgePulseOverlay
    expect(overlay.visible).toBe(true)
  })

  it('count=3 line-clear: edge pulse overlay is shown', () => {
    renderer.onEvents([lineClearEvent([3, 4, 5], 3)])
    const overlay = internals(renderer).edgePulseOverlay
    expect(overlay.visible).toBe(true)
  })
})

describe('EffectsRenderer — Tetris flash (count=4)', () => {
  let renderer: EffectsRenderer

  beforeEach(() => {
    renderer = new EffectsRenderer(makeStage())
    renderer.resize(30, 0, 0)
    renderer.resizeScreen(800, 600)
  })

  it('count=4 line-clear: tetrisFlashOverlay is shown', () => {
    renderer.onEvents([lineClearEvent([2, 3, 4, 5], 4)])
    const overlay = internals(renderer).tetrisFlashOverlay
    expect(overlay.visible).toBe(true)
  })

  it('count=4 line-clear: edge pulse overlay is also shown', () => {
    renderer.onEvents([lineClearEvent([2, 3, 4, 5], 4)])
    const overlay = internals(renderer).edgePulseOverlay
    expect(overlay.visible).toBe(true)
  })
})

describe('EffectsRenderer — level-up event', () => {
  let renderer: EffectsRenderer

  beforeEach(() => {
    renderer = new EffectsRenderer(makeStage())
    renderer.resize(30, 0, 0)
    renderer.resizeScreen(800, 600)
  })

  it('level-up event triggers edge pulse overlay', () => {
    renderer.onEvents([levelUpEvent()])
    const overlay = internals(renderer).edgePulseOverlay
    expect(overlay.visible).toBe(true)
  })

  it('level-up event triggers level-up tint overlay when no Tetris flash active', () => {
    renderer.onEvents([levelUpEvent()])
    const overlay = internals(renderer).levelUpOverlay
    expect(overlay.visible).toBe(true)
  })
})

describe('EffectsRenderer — tick drains edge pulse', () => {
  it('edge pulse visible=false after tick(600ms) with gameover state', () => {
    const stage = makeStage()
    const renderer = new EffectsRenderer(stage)
    renderer.resize(30, 0, 0)
    renderer.resizeScreen(800, 600)

    // Trigger double line-clear to activate edge pulse (duration 400ms)
    renderer.onEvents([lineClearEvent([4, 5], 2)])
    expect(internals(renderer).edgePulseOverlay.visible).toBe(true)

    // Tick 600ms (well past the 400ms duration)
    const gameOverState = makeState('gameover')
    renderer.tick(600, gameOverState)

    expect(internals(renderer).edgePulseOverlay.visible).toBe(false)
  })
})

describe('EffectsRenderer — shimmer', () => {
  let renderer: EffectsRenderer

  beforeEach(() => {
    renderer = new EffectsRenderer(makeStage())
    renderer.resize(30, 0, 0)
  })

  it('shimmerGraphics is visible during playing phase with active piece', () => {
    const piece: ActivePiece = { type: 'I', rotation: 0, row: 0, col: 3 }
    const playingState = makeState('playing', piece)

    renderer.tick(16, playingState)

    expect(internals(renderer).shimmerGraphics.visible).toBe(true)
  })

  it('shimmerGraphics is not visible during gameover phase', () => {
    const gameOverState = makeState('gameover')

    renderer.tick(16, gameOverState)

    expect(internals(renderer).shimmerGraphics.visible).toBe(false)
  })
})
