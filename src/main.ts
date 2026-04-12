/**
 * Main entry point — fixed-timestep game loop, layer wiring, responsive layout.
 *
 * This is the ONLY file that imports from multiple layers.
 * All cross-layer wiring happens here.
 *
 * Architecture:
 *   input → main.ts → engine → renderers
 *
 * Loop pattern: fixed-timestep accumulator at LOGIC_TICK_MS (16.667ms / 60Hz).
 * Render happens at native display rate; logic is deterministic at 60Hz.
 */

import { Container } from 'pixi.js'

// Engine
import { createGameState, updateGameState } from './engine/gameState.js'
import { BOARD_COLS, BOARD_ROWS } from './engine/board.js'

// Renderer
import { createPixiApp } from './renderer/app.js'
import { BoardRenderer } from './renderer/boardRenderer.js'
import { PieceRenderer } from './renderer/pieceRenderer.js'
import { EffectsRenderer } from './renderer/effects.js'
import { attachPostProcess } from './renderer/postProcess.js'

// Input
import { KeyboardInput } from './input/keyboard.js'
import { TouchInput } from './input/touch.js'

// UI
import { HUD } from './ui/hud.js'
import type { GameAction } from './engine/types.js'

/** Fixed logic update rate (60 Hz). */
const LOGIC_TICK_MS = 1000 / 60

/** Mobile breakpoint — show touch controls below this width. */
const MOBILE_BREAKPOINT_PX = 768

async function main(): Promise<void> {
  // --- Setup ---
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null
  if (!canvas) {
    throw new Error('Cannot find #game-canvas element in DOM')
  }

  const app = await createPixiApp(canvas)

  // Create container hierarchy on app.stage
  const boardContainer = new Container()
  const pieceContainer = new Container()
  const effectsContainer = new Container()
  const uiContainer = new Container()
  const touchContainer = new Container()

  app.stage.addChild(boardContainer)
  app.stage.addChild(pieceContainer)
  app.stage.addChild(effectsContainer)
  app.stage.addChild(uiContainer)
  app.stage.addChild(touchContainer)

  // Attach post-processing (glow/bloom) to board and piece containers
  attachPostProcess(boardContainer, pieceContainer, app)

  // Instantiate renderers, input handlers, HUD
  const boardRenderer = new BoardRenderer(boardContainer)
  const pieceRenderer = new PieceRenderer(pieceContainer)
  const effectsRenderer = new EffectsRenderer(effectsContainer)
  const hud = new HUD(uiContainer)
  const keyboard = new KeyboardInput()
  const touchInput = new TouchInput(touchContainer, 30)

  // Initialize engine state
  let state = createGameState()

  // --- Responsive layout ---
  function computeLayout(): { cellSize: number; offsetX: number; offsetY: number } {
    const cellSize = Math.floor(
      Math.min(window.innerHeight * 0.9, window.innerWidth * 0.55) / BOARD_ROWS
    )
    const boardWidth = cellSize * BOARD_COLS
    const boardHeight = cellSize * BOARD_ROWS
    const offsetX = Math.floor((window.innerWidth - boardWidth) / 2)
    // Center board vertically on mobile, top-align on desktop with margin
    const offsetY = Math.floor((window.innerHeight - boardHeight) / 2)
    return { cellSize, offsetX, offsetY }
  }

  function handleResize(): void {
    const { cellSize, offsetX, offsetY } = computeLayout()

    boardRenderer.resize(cellSize, offsetX, offsetY)
    pieceRenderer.resize(cellSize, offsetX, offsetY)
    effectsRenderer.resize(cellSize, offsetX, offsetY)
    hud.resize(cellSize, offsetX)
    touchInput.resize(cellSize)

    // Show/hide touch controls based on viewport width
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT_PX
    touchInput.setVisible(isMobile)

    // Resize the PixiJS renderer to match window
    app.renderer.resize(window.innerWidth, window.innerHeight)
  }

  // Resize listener
  window.addEventListener('resize', handleResize)
  // Initial layout
  handleResize()

  // --- Fixed-timestep game loop ---
  let accumulator = 0
  let lastTime = performance.now()

  // Snapshot for rendering — updated after each logic tick
  let renderState = state

  function loop(now: DOMHighResTimeStamp): void {
    const delta = Math.min(now - lastTime, 200) // clamp to prevent spiral-of-death
    lastTime = now
    accumulator += delta

    // Drain accumulated time in fixed logic steps
    while (accumulator >= LOGIC_TICK_MS) {
      // Collect all actions from this tick
      const bufferedActions = [
        ...keyboard.flush(),
        ...touchInput.flush(),
      ]
      const heldActions = [
        ...keyboard.getHeldActions(),
        ...touchInput.getHeldActions(),
      ]

      // Deduplicate: combine buffered + held, remove duplicates
      const allActions = deduplicateActions([...bufferedActions, ...heldActions])

      // Advance engine
      const result = updateGameState(state, allActions, LOGIC_TICK_MS)
      state = result.state
      renderState = state

      // Pass events to effects renderer
      if (result.events.length > 0) {
        effectsRenderer.onEvents(result.events)
      }

      accumulator -= LOGIC_TICK_MS
    }

    // Render at native display rate
    boardRenderer.update(renderState)
    pieceRenderer.update(renderState)
    hud.update(renderState)

    // Advance effect animations (every render frame)
    effectsRenderer.tick(delta)

    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)
}

/**
 * Deduplicate an array of GameActions, preserving order of first occurrence.
 * Ensures that if both keyboard and touch emit the same action, it's only
 * processed once per tick.
 */
function deduplicateActions(actions: GameAction[]): GameAction[] {
  const seen = new Set<GameAction>()
  const result: GameAction[] = []
  for (const action of actions) {
    if (!seen.has(action)) {
      seen.add(action)
      result.push(action)
    }
  }
  return result
}

// Bootstrap
main().catch((err) => {
  console.error('Fatal error in main:', err)
})
