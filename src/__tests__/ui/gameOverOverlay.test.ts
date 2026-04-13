/**
 * Unit tests for GameOverOverlay.
 *
 * GameOverOverlay depends on PixiJS Container/Graphics/Text. We use a
 * lightweight manual mock so these tests run in jsdom without WebGL.
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

// Import the mocked pixi.js so we can construct stages in tests.
import { Container as PixiContainer } from 'pixi.js'

// Import AFTER mock registration.
import { GameOverOverlay } from '../../ui/gameOverOverlay.js'

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

// ---------------------------------------------------------------------------
// Tree-walking helpers
// ---------------------------------------------------------------------------

/** Collect all nodes in the subtree that have eventMode === 'static'. */
function collectInteractives(root: FakeContainer): FakeContainer[] {
  const results: FakeContainer[] = []
  function walk(node: FakeContainer) {
    if (node.eventMode === 'static') results.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return results
}

/** Collect all nodes that have a non-undefined text property (MockText nodes). */
function collectTexts(root: FakeContainer): FakeContainer[] {
  const results: FakeContainer[] = []
  function walk(node: FakeContainer) {
    if (node.text !== undefined) results.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return results
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GameOverOverlay — construction', () => {
  it('does NOT add any child to stage on construction (hidden by default)', () => {
    const stage = makeStage()
    new GameOverOverlay(stage as never)
    expect(stage.children).toHaveLength(0)
  })
})

describe('GameOverOverlay — show / hide', () => {
  let stage: FakeContainer
  let overlay: GameOverOverlay

  beforeEach(() => {
    stage = makeStage()
    overlay = new GameOverOverlay(stage as never)
  })

  it('show() adds panelRoot to stage', () => {
    overlay.show(1000, 10)
    expect(stage.children).toHaveLength(1)
  })

  it('show() is idempotent — calling twice does not add panelRoot twice', () => {
    overlay.show(1000, 10)
    overlay.show(1000, 10)
    expect(stage.children).toHaveLength(1)
  })

  it('hide() after show() removes panelRoot from stage', () => {
    overlay.show(1000, 10)
    overlay.hide()
    expect(stage.children).toHaveLength(0)
  })

  it('hide() is idempotent — calling when already hidden does not throw', () => {
    expect(() => overlay.hide()).not.toThrow()
  })

  it('hide() before any show() does not throw', () => {
    const freshStage = makeStage()
    const freshOverlay = new GameOverOverlay(freshStage as never)
    expect(() => freshOverlay.hide()).not.toThrow()
  })
})

describe('GameOverOverlay — score text', () => {
  it('show(1500, 20) populates score text with score and lines values', () => {
    const stage = makeStage()
    const overlay = new GameOverOverlay(stage as never)
    overlay.show(1500, 20)

    // Walk the panelRoot subtree for text nodes
    const panelRoot = stage.children[0]!
    const texts = collectTexts(panelRoot)
    const scoreText = texts.find(t => t.text?.includes('1500'))
    expect(scoreText).toBeDefined()
    expect(scoreText!.text).toContain('20')
  })

  it('show(0, 0) sets score text to zero values', () => {
    const stage = makeStage()
    const overlay = new GameOverOverlay(stage as never)
    overlay.show(0, 0)

    const panelRoot = stage.children[0]!
    const texts = collectTexts(panelRoot)
    const scoreText = texts.find(t => t.text?.includes('Score:'))
    expect(scoreText).toBeDefined()
  })

  it('calling show() a second time updates the score text', () => {
    const stage = makeStage()
    const overlay = new GameOverOverlay(stage as never)
    overlay.show(100, 5)
    overlay.show(9999, 99)

    const panelRoot = stage.children[0]!
    const texts = collectTexts(panelRoot)
    const scoreText = texts.find(t => t.text?.includes('9999'))
    expect(scoreText).toBeDefined()
  })
})

describe('GameOverOverlay — onReturnToMenu callback', () => {
  it('invokes onReturnToMenu exactly once when Return button pointerup fires', () => {
    const stage = makeStage()
    const overlay = new GameOverOverlay(stage as never)
    overlay.show(1000, 10)

    const callback = vi.fn()
    overlay.onReturnToMenu = callback

    // panelRoot is the first child of stage after show()
    const panelRoot = stage.children[0]!
    const interactives = collectInteractives(panelRoot)
    interactives[0]?.emit('pointerup')

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('onReturnToMenu is NOT invoked when overlay is constructed (no auto-fire)', () => {
    const stage = makeStage()
    const callback = vi.fn()
    const overlay = new GameOverOverlay(stage as never)
    overlay.onReturnToMenu = callback
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('GameOverOverlay — resize', () => {
  it('resize(800, 600) does not throw when overlay is hidden', () => {
    const stage = makeStage()
    const overlay = new GameOverOverlay(stage as never)
    expect(() => overlay.resize(800, 600)).not.toThrow()
  })

  it('resize(320, 568) does not throw when overlay is visible', () => {
    const stage = makeStage()
    const overlay = new GameOverOverlay(stage as never)
    overlay.show(500, 8)
    expect(() => overlay.resize(320, 568)).not.toThrow()
  })

  it('resize(2560, 1440) does not throw', () => {
    const stage = makeStage()
    const overlay = new GameOverOverlay(stage as never)
    expect(() => overlay.resize(2560, 1440)).not.toThrow()
  })
})

describe('GameOverOverlay — "GAME OVER" title', () => {
  it('panelRoot subtree contains a text node with "GAME OVER"', () => {
    const stage = makeStage()
    const overlay = new GameOverOverlay(stage as never)
    overlay.show(0, 0)

    const panelRoot = stage.children[0]!
    const texts = collectTexts(panelRoot)
    const titleText = texts.find(t => t.text?.includes('GAME OVER'))
    expect(titleText).toBeDefined()
  })
})
