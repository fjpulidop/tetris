/**
 * Keyboard input handler.
 * Buffers GameAction values from keyboard events.
 * Supports held-key auto-repeat for MoveLeft, MoveRight, SoftDrop.
 *
 * Horizontal keys (ArrowLeft, ArrowRight) use DAS/ARR timing:
 *   - Initial press fires one action immediately.
 *   - After DAS_MS of continuous hold, auto-repeat begins.
 *   - Once DAS triggers, subsequent actions fire every ARR_MS.
 *
 * GameAction is imported from engine/types — not from input/ — to comply
 * with layer boundary rules.
 */

import { GameAction } from '../engine/types.js'

/** Delayed Auto Shift delay in milliseconds. */
export const DAS_MS = 133

/** Auto Repeat Rate interval in milliseconds. */
export const ARR_MS = 50

/** Map from key code to GameAction (for immediate tap actions). */
const KEY_ACTION_MAP: Record<string, GameAction> = {
  ArrowLeft: GameAction.MoveLeft,
  ArrowRight: GameAction.MoveRight,
  ArrowDown: GameAction.SoftDrop,
  ArrowUp: GameAction.RotateCW,
  KeyX: GameAction.RotateCW,
  KeyZ: GameAction.RotateCCW,
  Space: GameAction.HardDrop,
  Escape: GameAction.Pause,
  KeyP: GameAction.Pause,
  Enter: GameAction.Start,
}

/** Actions that should be reported while the key is held (for the game loop). */
const HELD_ACTION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowDown',
])

/** Horizontal keys that use DAS/ARR timing. ArrowDown is excluded intentionally. */
const DAS_KEYS = new Set(['ArrowLeft', 'ArrowRight'])

/** Maps each DAS key to its directional opposite for cancellation on press. */
const OPPOSITE_KEY: Record<string, string> = {
  ArrowLeft: 'ArrowRight',
  ArrowRight: 'ArrowLeft',
}

/** Per-key timing state for DAS/ARR. One entry per held DAS key. */
interface DASState {
  dasAccumulator: number
  arrAccumulator: number
  dasTriggered: boolean
}

export class KeyboardInput {
  private buffer: GameAction[] = []
  private heldKeys: Set<string> = new Set()
  private dasStates: Map<string, DASState> = new Map()

  private onKeyDown: (e: KeyboardEvent) => void
  private onKeyUp: (e: KeyboardEvent) => void

  constructor() {
    this.onKeyDown = (e: KeyboardEvent) => {
      const action = KEY_ACTION_MAP[e.code]
      if (action === undefined) return

      // Prevent browser scroll on arrow keys / space
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(e.code)) {
        e.preventDefault()
      }

      if (DAS_KEYS.has(e.code)) {
        // Browser key-repeat for a DAS key: silently ignore
        if (this.dasStates.has(e.code)) return

        // Cancel the opposite key when a new horizontal direction is pressed
        const opposite = OPPOSITE_KEY[e.code]
        if (opposite !== undefined) {
          this.dasStates.delete(opposite)
          this.heldKeys.delete(opposite)
        }

        // Register key as held and fire one immediate action
        this.heldKeys.add(e.code)
        this.buffer.push(action)

        // Start fresh DAS timing
        this.dasStates.set(e.code, {
          dasAccumulator: 0,
          arrAccumulator: 0,
          dasTriggered: false,
        })
        return
      }

      // Non-DAS held keys (ArrowDown / SoftDrop): existing behavior
      if (HELD_ACTION_KEYS.has(e.code)) {
        if (!this.heldKeys.has(e.code)) {
          this.heldKeys.add(e.code)
          this.buffer.push(action)
        }
        return
      }

      // Non-held keys (rotate, hard drop, pause): buffer on every press
      this.buffer.push(action)
    }

    this.onKeyUp = (e: KeyboardEvent) => {
      this.heldKeys.delete(e.code)
      this.dasStates.delete(e.code)
    }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  /**
   * Return and clear the action buffer.
   * Called once per logic tick by main.ts.
   */
  flush(): GameAction[] {
    const actions = this.buffer
    this.buffer = []
    return actions
  }

  /**
   * Return actions for keys that are currently held down, applying DAS/ARR
   * timing for horizontal movement keys.
   *
   * @param deltaMs - Elapsed milliseconds since the last call (provided by the
   *   fixed-timestep loop in main.ts). The caller owns the clock; this class
   *   never reads performance.now() internally.
   */
  getHeldActions(deltaMs: number): GameAction[] {
    const actions: GameAction[] = []

    for (const key of this.heldKeys) {
      const action = KEY_ACTION_MAP[key]
      if (action === undefined) continue

      if (!DAS_KEYS.has(key)) {
        // Non-DAS held key (ArrowDown): fire every tick unconditionally
        actions.push(action)
        continue
      }

      // DAS/ARR path for horizontal keys
      const state = this.dasStates.get(key)
      if (state === undefined) continue

      if (!state.dasTriggered) {
        // Waiting for DAS delay to elapse
        state.dasAccumulator += deltaMs
        if (state.dasAccumulator >= DAS_MS) {
          state.dasTriggered = true
          state.arrAccumulator = state.dasAccumulator - DAS_MS
          actions.push(action)
          // Immediately check if the leftover time is enough for an ARR tick
          while (state.arrAccumulator >= ARR_MS) {
            state.arrAccumulator -= ARR_MS
            actions.push(action)
          }
        }
      } else {
        // DAS has already triggered; fire on ARR interval
        state.arrAccumulator += deltaMs
        while (state.arrAccumulator >= ARR_MS) {
          state.arrAccumulator -= ARR_MS
          actions.push(action)
        }
      }
    }

    return actions
  }

  /**
   * Remove all event listeners. Call when the input handler is no longer needed.
   */
  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.heldKeys.clear()
    this.dasStates.clear()
    this.buffer = []
  }
}
