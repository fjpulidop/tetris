/**
 * Unit tests for PauseModal.
 *
 * PauseModal depends on PixiJS Container/Graphics/Text. We use a lightweight
 * manual mock so these tests run in jsdom without a real WebGL context.
 *
 * vi.mock() factories are hoisted to the top of the file by Vitest, so all
 * mock class definitions MUST live inside the factory closure — not at module
 * scope. External references in vi.mock factories cause
 * "Cannot access '<name>' before initialization" errors.
 *
 * To get mock constructors into the test body we import the already-mocked
 * 'pixi.js' module at the top level. Because vi.mock is hoisted before all
 * imports, the named imports from 'pixi.js' are the mock implementations.
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
    alpha = 1
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
// Because vi.mock is hoisted, this import receives the mock implementations.
import { Container as PixiContainer } from 'pixi.js'

// Import AFTER mock registration.
import { PauseModal } from '../../ui/pauseModal.js'

// ---------------------------------------------------------------------------
// Type-only interface for the mock container shape.
// ---------------------------------------------------------------------------
interface FakeContainer {
  children: FakeContainer[]
  x: number
  y: number
  width: number
  height: number
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
// Tests
// ---------------------------------------------------------------------------

describe('PauseModal — construction', () => {
  it('does NOT add panelRoot to stage on construction (hidden by default)', () => {
    const stage = makeStage()
    new PauseModal(stage as never)
    expect(stage.children).toHaveLength(0)
  })
})

describe('PauseModal — show / hide', () => {
  let stage: FakeContainer
  let modal: PauseModal

  beforeEach(() => {
    stage = makeStage()
    modal = new PauseModal(stage as never)
  })

  it('show() adds panelRoot to stage', () => {
    modal.show()
    expect(stage.children).toHaveLength(1)
  })

  it('hide() removes panelRoot from stage', () => {
    modal.show()
    modal.hide()
    expect(stage.children).toHaveLength(0)
  })

  it('calling show() twice does not add panelRoot twice', () => {
    modal.show()
    modal.show()
    expect(stage.children).toHaveLength(1)
  })

  it('calling hide() when not shown does not throw', () => {
    expect(() => modal.hide()).not.toThrow()
  })
})

describe('PauseModal — selection state', () => {
  let modal: PauseModal

  beforeEach(() => {
    const stage = makeStage()
    modal = new PauseModal(stage as never)
  })

  it('default selected index is 0', () => {
    expect(modal.getSelection()).toBe(0)
  })

  it('show() with explicit selectedIndex sets selection', () => {
    modal.show(1)
    expect(modal.getSelection()).toBe(1)
  })

  it('show() without argument preserves 0 default', () => {
    modal.show()
    expect(modal.getSelection()).toBe(0)
  })

  it('setSelection(1) sets index to 1', () => {
    modal.setSelection(1)
    expect(modal.getSelection()).toBe(1)
  })

  it('setSelection(0) sets index back to 0', () => {
    modal.setSelection(1)
    modal.setSelection(0)
    expect(modal.getSelection()).toBe(0)
  })
})

describe('PauseModal — onSelect callback', () => {
  it('onSelect is called with index 0 when option 0 pointer-up fires', () => {
    const stage = makeStage()
    const modal = new PauseModal(stage as never)
    modal.show()

    const callback = vi.fn()
    modal.onSelect = callback

    // Locate interactive options by scanning the panel tree for eventMode 'static'
    const panelRoot = stage.children[0]!
    const interactives = collectInteractives(panelRoot)

    interactives[0]?.emit('pointerup')
    expect(callback).toHaveBeenCalledWith(0)
  })

  it('onSelect is called with index 1 when option 1 pointer-up fires', () => {
    const stage = makeStage()
    const modal = new PauseModal(stage as never)
    modal.show()

    const callback = vi.fn()
    modal.onSelect = callback

    const panelRoot = stage.children[0]!
    const interactives = collectInteractives(panelRoot)

    interactives[1]?.emit('pointerup')
    expect(callback).toHaveBeenCalledWith(1)
  })
})

describe('PauseModal — three options', () => {
  let stage: FakeContainer
  let modal: PauseModal

  beforeEach(() => {
    stage = makeStage()
    modal = new PauseModal(stage as never)
    modal.show()
  })

  it('renders exactly 3 interactive options', () => {
    const panelRoot = stage.children[0]!
    const interactives = collectInteractives(panelRoot)
    expect(interactives).toHaveLength(3)
  })

  it('option labels are RESUME, RESTART, RETURN TO TITLE SCREEN', () => {
    const allTexts = collectTexts(stage)
    // Filter out the "PAUSED" title — option texts contain the label substring
    const optionTexts = allTexts.filter(
      t => t.text?.includes('RESUME') || t.text?.includes('RESTART') || t.text?.includes('RETURN TO TITLE SCREEN'),
    )
    expect(optionTexts).toHaveLength(3)
    expect(optionTexts[0]!.text).toContain('RESUME')
    expect(optionTexts[1]!.text).toContain('RESTART')
    expect(optionTexts[2]!.text).toContain('RETURN TO TITLE SCREEN')
  })

  it('setSelection(2) highlights the third option with triangle prefix', () => {
    modal.setSelection(2)
    expect(modal.getSelection()).toBe(2)

    const allTexts = collectTexts(stage)
    const prefixed = allTexts.find(t => t.text?.startsWith('▶'))
    expect(prefixed?.text).toContain('RETURN TO TITLE SCREEN')
  })

  it('setSelection(2) removes triangle prefix from other options', () => {
    modal.setSelection(2)

    const allTexts = collectTexts(stage)
    const prefixedTexts = allTexts.filter(t => t.text?.startsWith('▶'))
    expect(prefixedTexts).toHaveLength(1)
    expect(prefixedTexts[0]!.text).toContain('RETURN TO TITLE SCREEN')
  })

  it('onSelect fires with index 2 when third option is clicked', () => {
    const callback = vi.fn()
    modal.onSelect = callback

    const panelRoot = stage.children[0]!
    const interactives = collectInteractives(panelRoot)

    interactives[2]?.emit('pointerup')
    expect(callback).toHaveBeenCalledWith(2)
  })

  it('clicking third option also updates internal selection to 2', () => {
    const panelRoot = stage.children[0]!
    const interactives = collectInteractives(panelRoot)

    interactives[2]?.emit('pointerup')
    expect(modal.getSelection()).toBe(2)
  })

  it('show(2) highlights the third option', () => {
    modal.show(2)
    expect(modal.getSelection()).toBe(2)

    const allTexts = collectTexts(stage)
    const prefixed = allTexts.find(t => t.text?.startsWith('▶'))
    expect(prefixed?.text).toContain('RETURN TO TITLE SCREEN')
  })
})

describe('PauseModal — selection wrapping with 3 options', () => {
  let stage: FakeContainer
  let modal: PauseModal
  const OPTION_COUNT = 3

  beforeEach(() => {
    stage = makeStage()
    modal = new PauseModal(stage as never)
    modal.show()
  })

  it('wrapping down from last option (2) lands on 0', () => {
    modal.setSelection(2)
    // Simulate the wrap-around logic from main.ts: (2 + 1) % 3 === 0
    const wrapped = (2 + 1) % OPTION_COUNT
    modal.setSelection(wrapped)
    expect(modal.getSelection()).toBe(0)

    const allTexts = collectTexts(stage)
    const prefixed = allTexts.find(t => t.text?.startsWith('▶'))
    expect(prefixed?.text).toContain('RESUME')
  })

  it('wrapping up from first option (0) lands on 2', () => {
    modal.setSelection(0)
    // Simulate the wrap-around logic from main.ts: (0 - 1 + 3) % 3 === 2
    const wrapped = (0 - 1 + OPTION_COUNT) % OPTION_COUNT
    modal.setSelection(wrapped)
    expect(modal.getSelection()).toBe(2)

    const allTexts = collectTexts(stage)
    const prefixed = allTexts.find(t => t.text?.startsWith('▶'))
    expect(prefixed?.text).toContain('RETURN TO TITLE SCREEN')
  })

  it('cycling through all 3 options updates selection correctly each time', () => {
    modal.setSelection(0)
    expect(modal.getSelection()).toBe(0)

    modal.setSelection(1)
    expect(modal.getSelection()).toBe(1)

    modal.setSelection(2)
    expect(modal.getSelection()).toBe(2)

    // Wrap back to 0
    const wrapped = (2 + 1) % OPTION_COUNT
    modal.setSelection(wrapped)
    expect(modal.getSelection()).toBe(0)
  })
})

describe('PauseModal — resize', () => {
  it('resize() does not throw when visible', () => {
    const stage = makeStage()
    const modal = new PauseModal(stage as never)
    modal.show()
    expect(() => modal.resize(800, 600)).not.toThrow()
  })

  it('resize() can be called before show without throwing', () => {
    const stage = makeStage()
    const modal = new PauseModal(stage as never)
    expect(() => modal.resize(320, 568)).not.toThrow()
  })
})

describe('PauseModal — visual state after setSelection', () => {
  it('selected option text starts with the triangle prefix', () => {
    const stage = makeStage()
    const modal = new PauseModal(stage as never)
    modal.show()
    modal.setSelection(0)

    const allTexts = collectTexts(stage)
    const hasPrefix = allTexts.some(t => t.text?.startsWith('▶'))
    expect(hasPrefix).toBe(true)
  })

  it('only one option has the triangle prefix at a time', () => {
    const stage = makeStage()
    const modal = new PauseModal(stage as never)
    modal.show()
    modal.setSelection(1)

    const allTexts = collectTexts(stage)
    const prefixedTexts = allTexts.filter(t => t.text?.startsWith('▶'))
    expect(prefixedTexts).toHaveLength(1)
  })

  it('setSelection changes which option has the prefix', () => {
    const stage = makeStage()
    const modal = new PauseModal(stage as never)
    modal.show()
    modal.setSelection(1)

    const allTexts = collectTexts(stage)
    const prefixed = allTexts.find(t => t.text?.startsWith('▶'))
    expect(prefixed?.text).toContain('RESTART')
  })
})

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
