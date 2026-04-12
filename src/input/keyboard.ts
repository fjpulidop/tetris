/**
 * Keyboard input handler.
 * Buffers GameAction values from keyboard events.
 * Supports held-key auto-repeat for MoveLeft, MoveRight, SoftDrop.
 *
 * GameAction is imported from engine/types — not from input/ — to comply
 * with layer boundary rules.
 */

import { GameAction } from '../engine/types.js'

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
}

/** Actions that should be reported while the key is held (for the game loop). */
const HELD_ACTION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowDown',
])

export class KeyboardInput {
  private buffer: GameAction[] = []
  private heldKeys: Set<string> = new Set()

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

      // Held keys: only add to buffer on initial press (not browser key-repeat)
      if (HELD_ACTION_KEYS.has(e.code)) {
        if (!this.heldKeys.has(e.code)) {
          this.heldKeys.add(e.code)
          // Add initial press to buffer
          this.buffer.push(action)
        }
        // Subsequent browser key-repeat events are ignored here;
        // main.ts injects the action each tick via getHeldActions()
        return
      }

      // Non-held keys (rotate, hard drop, pause): buffer on every press
      this.buffer.push(action)
    }

    this.onKeyUp = (e: KeyboardEvent) => {
      this.heldKeys.delete(e.code)
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
   * Return actions for keys that are currently held down.
   * Called every logic tick by main.ts to implement continuous movement.
   */
  getHeldActions(): GameAction[] {
    const actions: GameAction[] = []
    for (const key of this.heldKeys) {
      const action = KEY_ACTION_MAP[key]
      if (action !== undefined) {
        actions.push(action)
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
    this.buffer = []
  }
}
