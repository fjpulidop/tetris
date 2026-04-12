/**
 * Unit tests for KeyboardInput DAS/ARR timing.
 *
 * Each test gets a fresh KeyboardInput instance (beforeEach) that is
 * destroyed (afterEach) to remove window event listeners cleanly.
 * This prevents listener leakage between tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { KeyboardInput, DAS_MS, ARR_MS } from '../../input/keyboard.js'
import { GameAction } from '../../engine/types.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function pressKey(code: string, options?: Partial<KeyboardEventInit>): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...options }))
}

function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

let kb: KeyboardInput

beforeEach(() => {
  kb = new KeyboardInput()
})

afterEach(() => {
  kb.destroy()
})

// ---------------------------------------------------------------------------
// Group G — Constants (checked first as they are foundational)
// ---------------------------------------------------------------------------

describe('Group G — exported constants', () => {
  it('DAS_MS equals 133', () => {
    expect(DAS_MS).toBe(133)
  })

  it('ARR_MS equals 50', () => {
    expect(ARR_MS).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// Group A — Existing behavior regression guard
// ---------------------------------------------------------------------------

describe('Group A — Regression: existing single-press behavior', () => {
  it('ArrowLeft tap: flush() returns [MoveLeft]; getHeldActions(16) returns [] before DAS', () => {
    pressKey('ArrowLeft')
    expect(kb.flush()).toEqual([GameAction.MoveLeft])
    // DAS has not elapsed — no repeat actions yet
    expect(kb.getHeldActions(16)).toEqual([])
  })

  it('KeyX tap: flush() returns [RotateCW]', () => {
    pressKey('KeyX')
    expect(kb.flush()).toEqual([GameAction.RotateCW])
  })

  it('Space tap: flush() returns [HardDrop]', () => {
    pressKey('Space')
    expect(kb.flush()).toEqual([GameAction.HardDrop])
  })
})

// ---------------------------------------------------------------------------
// Group B — DAS boundary
// ---------------------------------------------------------------------------

describe('Group B — DAS boundary timing', () => {
  it('Hold ArrowLeft, getHeldActions(100) returns [] — DAS not triggered at 100 ms', () => {
    pressKey('ArrowLeft')
    kb.flush() // consume the initial press action
    expect(kb.getHeldActions(100)).toEqual([])
  })

  it('Hold ArrowLeft, getHeldActions(133) returns [MoveLeft] — DAS triggers at exactly 133 ms', () => {
    pressKey('ArrowLeft')
    kb.flush()
    expect(kb.getHeldActions(133)).toEqual([GameAction.MoveLeft])
  })

  it('Hold ArrowLeft, getHeldActions(132) then getHeldActions(1): first [], second [MoveLeft]', () => {
    pressKey('ArrowLeft')
    kb.flush()
    expect(kb.getHeldActions(132)).toEqual([])
    // 132 + 1 = 133 ms total → DAS triggers on the second call
    expect(kb.getHeldActions(1)).toEqual([GameAction.MoveLeft])
  })

  it('Hold ArrowLeft, getHeldActions(200) returns [MoveLeft, MoveLeft]', () => {
    // At deltaMs = 200:
    //   dasAccumulator reaches 200 >= 133 → DAS fires 1 action.
    //   Leftover = 200 - 133 = 67 ms → arrAccumulator = 67 >= ARR_MS (50) → ARR fires 1 more action.
    //   Remaining arrAccumulator = 67 - 50 = 17 ms < 50 → no more actions.
    //   Total: 2 actions.
    pressKey('ArrowLeft')
    kb.flush()
    expect(kb.getHeldActions(200)).toEqual([GameAction.MoveLeft, GameAction.MoveLeft])
  })
})

// ---------------------------------------------------------------------------
// Group C — ARR cadence
// ---------------------------------------------------------------------------

describe('Group C — ARR cadence', () => {
  it('Hold ArrowLeft, advance past DAS then getHeldActions(50) fires one ARR action', () => {
    pressKey('ArrowLeft')
    kb.flush()
    kb.getHeldActions(133) // trigger DAS, arrAccumulator = 0
    expect(kb.getHeldActions(50)).toEqual([GameAction.MoveLeft])
  })

  it('Hold ArrowLeft, advance past DAS, then two getHeldActions(25) calls: first [], second [MoveLeft]', () => {
    pressKey('ArrowLeft')
    kb.flush()
    kb.getHeldActions(133) // trigger DAS, arrAccumulator = 0
    expect(kb.getHeldActions(25)).toEqual([])          // 25 < 50 — no ARR
    expect(kb.getHeldActions(25)).toEqual([GameAction.MoveLeft]) // 25 + 25 = 50 — ARR fires
  })

  it('Hold ArrowLeft, advance past DAS, then getHeldActions(100) returns [MoveLeft, MoveLeft]', () => {
    pressKey('ArrowLeft')
    kb.flush()
    kb.getHeldActions(133) // trigger DAS, arrAccumulator = 0
    // 100 ms contains exactly 2 ARR intervals of 50 ms
    expect(kb.getHeldActions(100)).toEqual([GameAction.MoveLeft, GameAction.MoveLeft])
  })
})

// ---------------------------------------------------------------------------
// Group D — Reset on release
// ---------------------------------------------------------------------------

describe('Group D — DAS reset on key release', () => {
  it('Hold ArrowLeft past DAS, release, press again — DAS restarts from zero', () => {
    pressKey('ArrowLeft')
    kb.flush()
    kb.getHeldActions(133) // DAS triggered
    releaseKey('ArrowLeft')

    // Press again — should restart DAS from 0
    pressKey('ArrowLeft')
    kb.flush() // consume fresh initial-press action

    // 100 ms < DAS_MS — should return []
    expect(kb.getHeldActions(100)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Group E — Opposite-key cancellation
// ---------------------------------------------------------------------------

describe('Group E — Opposite-key cancellation', () => {
  it('Hold ArrowLeft past DAS, then press ArrowRight — getHeldActions(100) returns [] for left (DAS not elapsed for right)', () => {
    pressKey('ArrowLeft')
    kb.flush()
    kb.getHeldActions(133) // trigger left DAS

    // Now press right — left must be cancelled; right DAS starts from 0
    pressKey('ArrowRight')
    kb.flush() // consume ArrowRight's initial-press action

    // 100 ms < DAS_MS — neither direction should produce actions
    const actions = kb.getHeldActions(100)
    expect(actions).not.toContain(GameAction.MoveLeft)
    expect(actions).not.toContain(GameAction.MoveRight)
  })
})

// ---------------------------------------------------------------------------
// Group F — SoftDrop unchanged
// ---------------------------------------------------------------------------

describe('Group F — SoftDrop fires every tick (no DAS/ARR)', () => {
  it('Hold ArrowDown, getHeldActions(16) returns [SoftDrop]', () => {
    pressKey('ArrowDown')
    kb.flush() // consume initial press
    expect(kb.getHeldActions(16)).toEqual([GameAction.SoftDrop])
  })

  it('Hold ArrowDown, 10 consecutive getHeldActions(16) each return [SoftDrop]', () => {
    pressKey('ArrowDown')
    kb.flush()
    for (let i = 0; i < 10; i++) {
      expect(kb.getHeldActions(16)).toEqual([GameAction.SoftDrop])
    }
  })
})
