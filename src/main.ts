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

import { Container, RendererType, BlurFilter } from 'pixi.js'
import type { Filter } from 'pixi.js'

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
import { SplashScreen } from './ui/splashScreen.js'
import { PauseModal } from './ui/pauseModal.js'
import { GameAction } from './engine/types.js'

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
  const splashContainer = new Container()
  // modalContainer MUST be last so it renders above all other layers
  const modalContainer = new Container()

  app.stage.addChild(boardContainer)
  app.stage.addChild(pieceContainer)
  app.stage.addChild(effectsContainer)
  app.stage.addChild(uiContainer)
  app.stage.addChild(touchContainer)
  app.stage.addChild(splashContainer)
  app.stage.addChild(modalContainer)

  // Attach post-processing (glow/bloom) to board and piece containers
  attachPostProcess(boardContainer, pieceContainer, app)

  // Instantiate renderers, input handlers, HUD, PauseModal
  const boardRenderer = new BoardRenderer(boardContainer)
  const pieceRenderer = new PieceRenderer(pieceContainer)
  const effectsRenderer = new EffectsRenderer(effectsContainer)
  const hud = new HUD(uiContainer)
  hud.setVisible(false)
  const pauseModal = new PauseModal(modalContainer)
  const keyboard = new KeyboardInput()
  const touchInput = new TouchInput(touchContainer, 30)

  // Wire pause modal selection callback
  pauseModal.onSelect = (index: number) => {
    if (index === 0) {
      resumeFromPause()
    } else if (index === 1) {
      restartGame()
    } else {
      navigateToTitle()
    }
  }

  // Initialize engine state
  let state = createGameState()

  // --- Loop-level pause state ---
  /** Phase observed on the previous loop iteration (edge-detection). */
  let prevPhase = state.phase
  /** Which option is highlighted in the pause modal. */
  let pauseSelectedIndex = 0
  /**
   * Snapshot of each blurred container's original filters array, captured
   * when entering pause so they can be restored exactly on resume.
   */
  const prePauseFilters = new Map<Container, Filter[] | null>()
  /** Teardown function returned by attachPauseKeyListener(). */
  let removePauseKeyListener: (() => void) | null = null

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
    pauseModal.resize(window.innerWidth, window.innerHeight)

    // Show/hide touch controls based on viewport width
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT_PX
    touchInput.setVisible(isMobile)

    // Resize the PixiJS renderer to match window
    app.renderer.resize(window.innerWidth, window.innerHeight)

    if (splashScreen !== null) {
      splashScreen.resize(window.innerWidth, window.innerHeight)
    }
  }

  // Splash screen — rendered on top of everything; destroyed on first Start action
  let splashScreen: SplashScreen | null = new SplashScreen(splashContainer, app)
  const splashTapBuffer: GameAction[] = []
  const onSplashTap = () => {
    splashTapBuffer.push(GameAction.Start)
    canvas.removeEventListener('pointerdown', onSplashTap)
  }
  canvas.addEventListener('pointerdown', onSplashTap)

  // Resize listener
  window.addEventListener('resize', handleResize)
  // Initial layout
  handleResize()

  // ---------------------------------------------------------------------------
  // Pause blur helpers
  // ---------------------------------------------------------------------------

  /**
   * Append a BlurFilter to the board, piece, and effects containers so the
   * game world appears blurred behind the pause modal.
   *
   * Skipped entirely on Canvas 2D renderer — BlurFilter requires WebGL.
   * Stores each container's original filters array in prePauseFilters so
   * removePauseBlur() can restore them precisely.
   */
  function applyPauseBlur(): void {
    // BlurFilter requires WebGL — skip on Canvas renderer
    if (app.renderer.type === RendererType.CANVAS) return

    const blurStrength = 8
    const targets = [boardContainer, pieceContainer, effectsContainer, uiContainer, touchContainer]

    for (const target of targets) {
      // Capture original filters (may be null, undefined, or an existing array)
      const original = (target.filters as Filter[] | null | undefined) ?? null
      prePauseFilters.set(target, original)

      const blur = new BlurFilter({ strength: blurStrength }) as unknown as Filter
      const existing = original ?? []
      target.filters = [...existing, blur]
    }
  }

  /**
   * Restore every blurred container's original filters array exactly as it
   * was before applyPauseBlur() was called.
   */
  function removePauseBlur(): void {
    for (const [container, original] of prePauseFilters) {
      container.filters = original
    }
    prePauseFilters.clear()
  }

  // ---------------------------------------------------------------------------
  // Pause keyboard listener
  // ---------------------------------------------------------------------------

  /**
   * Attach a keyboard listener that intercepts ArrowUp/Down (navigate options)
   * and Enter (confirm selection) while the pause modal is visible.
   *
   * Returns a teardown function. The caller is responsible for invoking it
   * exactly once when the pause modal is dismissed.
   */
  function attachPauseKeyListener(): () => void {
    const OPTION_COUNT = 3

    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'ArrowUp') {
        e.preventDefault()
        pauseSelectedIndex = (pauseSelectedIndex - 1 + OPTION_COUNT) % OPTION_COUNT
        pauseModal.setSelection(pauseSelectedIndex)
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        pauseSelectedIndex = (pauseSelectedIndex + 1) % OPTION_COUNT
        pauseModal.setSelection(pauseSelectedIndex)
      } else if (e.code === 'Enter') {
        e.preventDefault()
        if (pauseSelectedIndex === 0) {
          resumeFromPause()
        } else if (pauseSelectedIndex === 1) {
          restartGame()
        } else {
          navigateToTitle()
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }

  // ---------------------------------------------------------------------------
  // Resume / navigate actions
  // ---------------------------------------------------------------------------

  /**
   * Resume the game from pause:
   *   1. Remove blur from game-world containers.
   *   2. Hide the pause modal.
   *   3. Remove the pause keyboard listener.
   *   4. Dispatch GameAction.Pause to the engine (toggles paused → playing).
   */
  function resumeFromPause(): void {
    removePauseBlur()
    pauseModal.hide()

    if (removePauseKeyListener !== null) {
      removePauseKeyListener()
      removePauseKeyListener = null
    }

    // Tell the engine to resume — it toggles paused → playing on Pause action.
    const result = updateGameState(state, [GameAction.Pause], LOGIC_TICK_MS)
    state = result.state
    // Keep prevPhase in sync so the loop doesn't re-trigger the justResumed edge.
    prevPhase = state.phase
  }

  /**
   * Restart the game immediately from a fresh state, bypassing the intro splash.
   *
   * Creates a new game in 'playing' phase without showing the splash screen.
   * The HUD remains visible. The splash screen is not recreated.
   */
  function restartGame(): void {
    removePauseBlur()
    pauseModal.hide()

    if (removePauseKeyListener !== null) {
      removePauseKeyListener()
      removePauseKeyListener = null
    }

    const fresh = createGameState()
    const result = updateGameState(fresh, [GameAction.Start], 0)
    state = result.state
    prevPhase = state.phase

    hud.setVisible(true)
  }

  /**
   * Navigate back to the title / intro screen, fully restoring the splash experience.
   *
   * Recreates the SplashScreen instance (destroyed on first intro→playing transition)
   * and re-wires the canvas pointer listener for tap-to-start.
   */
  function navigateToTitle(): void {
    const freshState = createGameState()
    if (freshState.phase !== 'intro') {
      window.location.reload()
      return
    }

    removePauseBlur()
    pauseModal.hide()
    if (removePauseKeyListener !== null) {
      removePauseKeyListener()
      removePauseKeyListener = null
    }

    state = freshState
    prevPhase = state.phase

    splashScreen = new SplashScreen(splashContainer, app)
    splashScreen.resize(window.innerWidth, window.innerHeight)

    splashTapBuffer.splice(0)
    // canvas is guaranteed non-null: main() throws before reaching this point otherwise
    canvas!.addEventListener('pointerdown', onSplashTap)

    hud.setVisible(false)
  }

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
        ...splashTapBuffer.splice(0),
      ]
      const heldActions = [
        ...keyboard.getHeldActions(LOGIC_TICK_MS),
        ...touchInput.getHeldActions(LOGIC_TICK_MS),
      ]

      // Deduplicate: combine buffered + held, remove duplicates
      const allActions = deduplicateActions([...bufferedActions, ...heldActions])

      // Advance engine
      const phaseBeforeUpdate = state.phase
      const result = updateGameState(state, allActions, LOGIC_TICK_MS)
      state = result.state
      renderState = state

      // Detect intro → playing transition: destroy splash and reveal HUD
      if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
        splashScreen?.destroy()
        splashScreen = null
        hud.setVisible(true)
      }

      // Pass events to effects renderer
      if (result.events.length > 0) {
        effectsRenderer.onEvents(result.events)
      }

      accumulator -= LOGIC_TICK_MS
    }

    // --- Phase-transition edge detection ---
    const currentPhase = state.phase
    const justPaused = prevPhase !== 'paused' && currentPhase === 'paused'
    const justResumed = prevPhase === 'paused' && currentPhase !== 'paused'

    if (justPaused) {
      // Game just transitioned into pause — show blur and modal
      pauseSelectedIndex = 0
      applyPauseBlur()
      pauseModal.show(pauseSelectedIndex)
      // Attach key listener; guard against double-attach
      if (removePauseKeyListener === null) {
        removePauseKeyListener = attachPauseKeyListener()
      }
    }

    if (justResumed) {
      // Engine resumed externally (e.g. by pressing Escape in normal keyboard flow)
      // Perform cleanup in case the modal/blur are still active
      removePauseBlur()
      pauseModal.hide()
      if (removePauseKeyListener !== null) {
        removePauseKeyListener()
        removePauseKeyListener = null
      }
    }

    prevPhase = currentPhase

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
