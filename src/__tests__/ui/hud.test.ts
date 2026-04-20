/**
 * Unit tests for HUD.
 *
 * HUD depends on PixiJS Container/Graphics/Text and imports from
 * engine/persistence.js. We use lightweight manual mocks for both.
 *
 * vi.mock() factories are hoisted to the top of the file by Vitest, so all
 * mock class definitions MUST live inside the factory closure — not at module
 * scope.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// All mock classes are defined INSIDE the factory (hoisting requirement).
// ---------------------------------------------------------------------------
vi.mock('pixi.js', () => {
  class MockContainer {
    children: MockContainer[] = []
    x = 0
    y = 0
    width = 0
    height = 0
    alpha = 1
    visible = true
    eventMode: string = 'none'
    cursor: string = 'default'
    private _listeners: Record<string, Array<() => void>> = {}

    addChild(child: MockContainer): MockContainer {
      this.children.push(child)
      return child
    }

    removeChild(child: MockContainer): MockContainer {
      const idx = this.children.indexOf(child)
      if (idx !== -1) this.children.splice(idx, 1)
      return child
    }

    on(event: string, handler: () => void): this {
      if (!this._listeners[event]) this._listeners[event] = []
      this._listeners[event]!.push(handler)
      return this
    }

    emit(event: string): void {
      for (const h of this._listeners[event] ?? []) h()
    }
  }

  class MockGraphics extends MockContainer {
    clear(): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rect(...args: number[]): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    roundRect(...args: number[]): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fill(opts: unknown): this { return this }
  }

  class MockText extends MockContainer {
    text = ''
    style: Record<string, unknown> = {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    anchor = { set: (x: number, y?: number) => undefined }
    constructor(opts: { text?: string; style?: Record<string, unknown> }) {
      super()
      this.text = opts.text ?? ''
      this.style = opts.style ?? {}
    }
  }

  class MockTextStyle {
    fill: unknown
    fontSize?: number
    fontFamily?: string
    fontWeight?: string
    letterSpacing?: number
    constructor(opts: Record<string, unknown>) { Object.assign(this, opts) }
  }

  return {
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
    TextStyle: MockTextStyle,
  }
})

vi.mock('../../engine/persistence.js', () => ({
  formatSprintTime: (ms: number) => `T:${ms}`,
}))

// boardRenderer and pieces/chainBlast mocks to avoid real imports
vi.mock('../../renderer/boardRenderer.js', () => ({
  CELL_COLORS: [0x000000, 0xff0000, 0x00ff00],
}))

vi.mock('../../engine/pieces.js', () => ({
  PIECE_SHAPES: {},
  PIECE_COLORS: {},
}))

vi.mock('../../engine/chainBlast.js', () => ({
  chainMultiplier: (depth: number) => 1 + depth * 0.5,
}))

// Import the mocked pixi.js so we can construct stages in tests.
import { Container as PixiContainer } from 'pixi.js'

// Import AFTER mock registration.
import { HUD } from '../../ui/hud.js'
import type { GameState } from '../../engine/gameState.js'

// ---------------------------------------------------------------------------
// Type-only interface for the mock container shape.
// ---------------------------------------------------------------------------
interface FakeContainer {
  children: FakeContainer[]
  x: number
  y: number
  width: number
  height: number
  alpha: number
  visible: boolean
  eventMode: string
  cursor: string
  text?: string
  style?: Record<string, unknown>
  addChild(c: FakeContainer): FakeContainer
  removeChild(c: FakeContainer): FakeContainer
  on(event: string, h: () => void): FakeContainer
  emit(event: string): void
}

function makeStage(): FakeContainer {
  return new PixiContainer() as unknown as FakeContainer
}

/** Create a minimal GameState for testing. */
function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    board: new Uint8Array(200),
    activePiece: null,
    nextPiece: 'T',
    score: 0,
    level: 1,
    lines: 0,
    phase: 'playing',
    gravityState: { gravityAccum: 0, lockTimer: 0, lockResetCount: 0 },
    pieceBag: [],
    chargedCells: new Set(),
    chainDepth: 0,
    chainTimer: 0,
    gameMode: 'classic',
    playMode: 'marathon',
    timerStarted: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HUD — setPlayMode', () => {
  let stage: FakeContainer
  let hud: HUD

  beforeEach(() => {
    stage = makeStage()
    hud = new HUD(stage as never)
    // Call resize so cellSize is set (otherwise update() returns early)
    hud.resize(30, 100)
  })

  it('setPlayMode("sprint") — sprint panel becomes visible; marathon panel is hidden', () => {
    hud.setPlayMode('sprint')
    // Access private fields via unknown cast for testing
    const h = hud as unknown as {
      panel: FakeContainer
      sprintPanel: FakeContainer
    }
    expect(h.panel.visible).toBe(false)
    expect(h.sprintPanel.visible).toBe(true)
  })

  it('setPlayMode("marathon") after sprint — marathon panel visible, sprint panel hidden', () => {
    hud.setPlayMode('sprint')
    hud.setPlayMode('marathon')
    const h = hud as unknown as {
      panel: FakeContainer
      sprintPanel: FakeContainer
    }
    expect(h.panel.visible).toBe(true)
    expect(h.sprintPanel.visible).toBe(false)
  })
})

describe('HUD — updateSprintTimer', () => {
  it('updateSprintTimer(61234) updates timer text to the formatted string', () => {
    const stage = makeStage()
    const hud = new HUD(stage as never)
    hud.resize(30, 100)
    hud.updateSprintTimer(61234)
    const h = hud as unknown as { sprintTimerValue: FakeContainer }
    // The mock formatSprintTime returns "T:61234"
    expect(h.sprintTimerValue.text).toBe('T:61234')
  })
})

describe('HUD — update sprint lines', () => {
  let stage: FakeContainer
  let hud: HUD

  beforeEach(() => {
    stage = makeStage()
    hud = new HUD(stage as never)
    hud.resize(30, 100)
  })

  it('update(state) with state.lines=7 in sprint mode sets lines text to "7 / 40"', () => {
    hud.setPlayMode('sprint')
    const state = makeGameState({ lines: 7, playMode: 'sprint' })
    hud.update(state)
    const h = hud as unknown as { sprintLinesValue: FakeContainer }
    expect(h.sprintLinesValue.text).toBe('7 / 40')
  })

  it('update(state) in marathon mode does not change sprint lines text', () => {
    hud.setPlayMode('marathon')
    const h = hud as unknown as { sprintLinesValue: FakeContainer }
    const originalText = h.sprintLinesValue.text
    const state = makeGameState({ lines: 7, playMode: 'marathon' })
    hud.update(state)
    expect(h.sprintLinesValue.text).toBe(originalText)
  })
})

describe('HUD — resize', () => {
  it('resize() does not throw in marathon mode', () => {
    const stage = makeStage()
    const hud = new HUD(stage as never)
    hud.setPlayMode('marathon')
    expect(() => hud.resize(30, 100)).not.toThrow()
  })

  it('resize() does not throw in sprint mode', () => {
    const stage = makeStage()
    const hud = new HUD(stage as never)
    hud.setPlayMode('sprint')
    expect(() => hud.resize(30, 100)).not.toThrow()
  })
})

describe('HUD — setVisible', () => {
  it('setVisible(false) hides the container', () => {
    const stage = makeStage()
    const hud = new HUD(stage as never)
    hud.setVisible(false)
    const h = hud as unknown as { container: FakeContainer }
    expect(h.container.visible).toBe(false)
  })
})
