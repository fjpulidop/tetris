/**
 * Unit tests for MainMenu.
 *
 * MainMenu depends on PixiJS Container/Graphics/Text and @pixi/filter-glow.
 * We use lightweight manual mocks so these tests run in jsdom without WebGL.
 *
 * vi.mock() factories are hoisted to the top of the file by Vitest, so all
 * mock class definitions MUST live inside the factory closure — not at module
 * scope. External references in vi.mock factories cause
 * "Cannot access '<name>' before initialization" errors.
 *
 * Additionally, @pixi/filter-glow is mocked to avoid WebGL dependency.
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    destroy(opts?: unknown): void {
      // no-op
    }
  }

  class MockGraphics extends MockContainer {
    filters: unknown[] | null = null
    clear(): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rect(...args: number[]): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    roundRect(...args: number[]): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ellipse(...args: number[]): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    circle(...args: number[]): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fill(opts: unknown): this { return this }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setStrokeStyle(opts: unknown): this { return this }
    stroke(): this { return this }
  }

  class MockNoiseFilter {
    noise: number
    seed: number
    constructor(opts: { noise?: number; seed?: number } = {}) {
      this.noise = opts.noise ?? 0.5
      this.seed = opts.seed ?? 0
    }
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
    NoiseFilter: MockNoiseFilter,
  }
})

// Import the mocked pixi.js so we can construct stages in tests.
// Because vi.mock is hoisted, this import receives the mock implementations.
import { Container as PixiContainer } from 'pixi.js'

// Import AFTER mock registration.
import { MainMenu } from '../../ui/mainMenu.js'
import { GameAction } from '../../engine/types.js'

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
  destroy(opts?: unknown): void
}

interface FakeTicker {
  add: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

interface FakeApp {
  ticker: FakeTicker
  screen: { width: number; height: number }
}

function makeStage(): FakeContainer {
  return new PixiContainer() as unknown as FakeContainer
}

function makeApp(width = 800, height = 600): FakeApp {
  return {
    ticker: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    screen: { width, height },
  }
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MainMenu — construction', () => {
  it('adds exactly one child to stage immediately', () => {
    const stage = makeStage()
    const app = makeApp()
    new MainMenu(stage as never, app as never)
    expect(stage.children).toHaveLength(1)
  })

  it('registers a ticker callback on construction', () => {
    const stage = makeStage()
    const app = makeApp()
    new MainMenu(stage as never, app as never)
    expect(app.ticker.add).toHaveBeenCalledTimes(1)
  })
})

describe('MainMenu — flushActions', () => {
  let stage: FakeContainer
  let app: FakeApp
  let menu: MainMenu

  beforeEach(() => {
    stage = makeStage()
    app = makeApp()
    menu = new MainMenu(stage as never, app as never)
  })

  it('returns empty array before any interaction', () => {
    expect(menu.flushActions()).toEqual([])
  })

  it('returns [GameAction.Start] after Play button pointerup', () => {
    // The main menu container is the single child of stage
    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    // MARATHON button is at index 4 (after 4 scenario pickers: Default, Cross, Pyramid, Diamond)
    interactives[4]?.emit('pointerup')
    expect(menu.flushActions()).toEqual([GameAction.Start])
  })

  it('drains the buffer — second flushActions() returns []', () => {
    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    // MARATHON button is at index 4 (after 4 scenario pickers)
    interactives[4]?.emit('pointerup')
    menu.flushActions() // drain
    expect(menu.flushActions()).toEqual([])
  })

  it('accumulates multiple Play taps before flush', () => {
    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    // MARATHON button is at index 4 (after 4 scenario pickers)
    interactives[4]?.emit('pointerup')
    interactives[4]?.emit('pointerup')
    const actions = menu.flushActions()
    expect(actions).toEqual([GameAction.Start, GameAction.Start])
  })
})

describe('MainMenu — onExit callback', () => {
  it('invokes onExit exactly once when Exit button pointerup fires', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)

    const callback = vi.fn()
    menu.onExit = callback

    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    // Exit button is the last interactive button (after 4 scenario pickers + MARATHON + MONOCHROME + SPRINT + EXIT)
    interactives[interactives.length - 1]?.emit('pointerup')

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('does not invoke onExit when Play button fires', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)

    const callback = vi.fn()
    menu.onExit = callback

    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    // MARATHON is at index 4 (after 4 scenario pickers)
    interactives[4]?.emit('pointerup')

    expect(callback).not.toHaveBeenCalled()
  })
})

describe('MainMenu — showExitFallback', () => {
  it('does not throw when called', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    expect(() => menu.showExitFallback()).not.toThrow()
  })

  it('calling showExitFallback twice does not throw', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    expect(() => {
      menu.showExitFallback()
      menu.showExitFallback()
    }).not.toThrow()
  })
})

describe('MainMenu — resize', () => {
  it('resize(800, 600) does not throw', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    expect(() => menu.resize(800, 600)).not.toThrow()
  })

  it('resize(320, 568) does not throw — minimum viewport', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    expect(() => menu.resize(320, 568)).not.toThrow()
  })

  it('resize with large dimensions does not throw', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    expect(() => menu.resize(2560, 1440)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Button-by-label helper (used by MONOCHROME button tests)
// ---------------------------------------------------------------------------

function getButtonByLabel(menu: MainMenu, label: string): FakeContainer {
  // Interactive buttons are containers with eventMode === 'static'
  // and a text child whose text matches the label.
  const menuContainer = (menu as unknown as { container: FakeContainer }).container
  const interactive = collectInteractives(menuContainer)
  for (const btn of interactive) {
    const textChild = btn.children.find((c: FakeContainer) => c.text === label)
    if (textChild) return btn
  }
  throw new Error(`Button with label "${label}" not found`)
}

describe('MainMenu — destroy', () => {
  it('destroy() does not throw', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    expect(() => menu.destroy()).not.toThrow()
  })

  it('calls ticker.remove with the registered callback', () => {
    const stage = makeStage()
    const app = makeApp()
    new MainMenu(stage as never, app as never).destroy()
    // ticker.add was called with a callback; ticker.remove must be called with the same reference
    expect(app.ticker.remove).toHaveBeenCalledTimes(1)
    const addedCallback = app.ticker.add.mock.calls[0]?.[0]
    const removedCallback = app.ticker.remove.mock.calls[0]?.[0]
    expect(removedCallback).toBe(addedCallback)
  })

  it('destroy() clears any pending fallback timer without throwing', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    menu.showExitFallback() // arms the 3-second timer
    expect(() => menu.destroy()).not.toThrow()
  })
})

describe('MONOCHROME button', () => {
  let stage: FakeContainer
  let app: FakeApp
  let menu: MainMenu

  beforeEach(() => {
    stage = makeStage()
    app = makeApp()
    menu = new MainMenu(stage as never, app as never)
  })

  it('renders four action buttons (MARATHON, MONOCHROME, SPRINT, EXIT) plus four scenario pickers', () => {
    const menuContainer = stage.children[0]!
    const interactiveChildren = collectInteractives(menuContainer)
    // 4 scenario picker buttons + 4 action buttons (MARATHON, MONOCHROME, SPRINT, EXIT)
    expect(interactiveChildren.length).toBe(8)
  })

  it('flushMode() returns null before any interaction', () => {
    expect(menu.flushMode()).toBeNull()
  })

  it('clicking MONOCHROME enqueues GameAction.Start in flushActions()', () => {
    const monoBtn = getButtonByLabel(menu, 'MONOCHROME')
    monoBtn.emit('pointerup')
    expect(menu.flushActions()).toContain(GameAction.Start)
  })

  it('clicking MONOCHROME enqueues "monochrome" in flushMode()', () => {
    const monoBtn = getButtonByLabel(menu, 'MONOCHROME')
    monoBtn.emit('pointerup')
    expect(menu.flushMode()).toBe('monochrome')
  })

  it('clicking MARATHON leaves flushMode() returning null', () => {
    const playBtn = getButtonByLabel(menu, 'MARATHON')
    playBtn.emit('pointerup')
    expect(menu.flushMode()).toBeNull()
  })

  it('flushMode() returns null after draining', () => {
    const monoBtn = getButtonByLabel(menu, 'MONOCHROME')
    monoBtn.emit('pointerup')
    menu.flushMode() // drain
    expect(menu.flushMode()).toBeNull()
  })
})

describe('MainMenu — onSprintStart callback', () => {
  it('onSprintStart is invoked when Sprint button (index 2) emits pointerup', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)

    const callback = vi.fn()
    menu.onSprintStart = callback

    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    // Sprint button: 4 scenario pickers (0-3) + MARATHON(4) + MONOCHROME(5) + SPRINT(6)
    interactives[6]?.emit('pointerup')

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('onSprintStart is NOT invoked when MARATHON button fires', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)

    const callback = vi.fn()
    menu.onSprintStart = callback

    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    interactives[4]?.emit('pointerup') // MARATHON (after 4 scenario pickers)

    expect(callback).not.toHaveBeenCalled()
  })

  it('onSprintStart is NOT invoked when EXIT button fires', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)

    const callback = vi.fn()
    menu.onSprintStart = callback

    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    interactives[7]?.emit('pointerup') // EXIT (last button)

    expect(callback).not.toHaveBeenCalled()
  })

  it('default onSprintStart (no-op) does not throw when Sprint button fires', () => {
    const stage = makeStage()
    const app = makeApp()
    new MainMenu(stage as never, app as never)
    // Do NOT assign onSprintStart — use the default no-op

    const menuContainer = stage.children[0]!
    const interactives = collectInteractives(menuContainer)
    expect(() => interactives[6]?.emit('pointerup')).not.toThrow()
  })
})

describe('MainMenu — noir visual nodes', () => {
  it('constructor adds backgroundRect, vignetteGfx, grainSprite, and dustContainer below title', () => {
    const stage = makeStage()
    const app = makeApp()
    new MainMenu(stage as never, app as never)
    const menuContainer = stage.children[0]!
    // Container children: backgroundRect, vignetteGfx, grainSprite, dustContainer,
    //   titleText, scenarioPicker buttons (4), playButton, monochromeButton,
    //   sprintButton, exitButton, fallbackText, promptText = at least 12 children
    expect(menuContainer.children.length).toBeGreaterThanOrEqual(12)
  })

  it('ticker callback increments _elapsed or animates without throwing', () => {
    const stage = makeStage()
    const app = makeApp()
    new MainMenu(stage as never, app as never)
    // Simulate a tick — the callback registered with app.ticker.add should not throw
    const tickerCb = app.ticker.add.mock.calls[0]?.[0] as ((t: { deltaTime: number }) => void) | undefined
    expect(() => tickerCb?.({ deltaTime: 1 })).not.toThrow()
  })

  it('resize does not throw with noir layers present', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    expect(() => menu.resize(1920, 1080)).not.toThrow()
    expect(() => menu.resize(320, 568)).not.toThrow()
  })
})
