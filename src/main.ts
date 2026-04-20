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
import { loadSprintPB, saveSprintPB } from './engine/persistence.js'

// Renderer
import { createPixiApp } from './renderer/app.js'
import { BoardRenderer } from './renderer/boardRenderer.js'
import { PieceRenderer } from './renderer/pieceRenderer.js'
import { EffectsRenderer } from './renderer/effects.js'
import { attachPostProcess } from './renderer/postProcess.js'
import type { PostProcessController } from './renderer/postProcess.js'

// Input
import { KeyboardInput } from './input/keyboard.js'
import { TouchInput } from './input/touch.js'

// UI
import { HUD } from './ui/hud.js'
import { MainMenu } from './ui/mainMenu.js'
import { GameOverOverlay } from './ui/gameOverOverlay.js'
import { PauseModal } from './ui/pauseModal.js'
import { GameAction } from './engine/types.js'
import type { GameMode } from './engine/types.js'

// Audio
import { AudioManager } from './audio/audioManager.js'

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
  const mainMenuContainer = new Container()
  // modalContainer MUST be last so it renders above all other layers
  const modalContainer = new Container()

  app.stage.addChild(boardContainer)
  app.stage.addChild(pieceContainer)
  app.stage.addChild(effectsContainer)
  app.stage.addChild(uiContainer)
  app.stage.addChild(touchContainer)
  app.stage.addChild(mainMenuContainer)
  app.stage.addChild(modalContainer)

  // Attach post-processing (glow/bloom) to board and piece containers
  const postProcessController: PostProcessController = attachPostProcess(boardContainer, pieceContainer, app)

  // Instantiate renderers, input handlers, HUD, PauseModal
  const boardRenderer = new BoardRenderer(boardContainer)
  const pieceRenderer = new PieceRenderer(pieceContainer)
  const effectsRenderer = new EffectsRenderer(effectsContainer)
  const hud = new HUD(uiContainer)
  hud.setVisible(false)
  const pauseModal = new PauseModal(modalContainer)
  const audioManager = new AudioManager()

  // Wire mute toggle: HUD button → AudioManager → HUD label sync
  hud.setOnMuteToggle((muted: boolean) => {
    audioManager.mute(muted)
    hud.setMuted(muted)
  })
  hud.setMuted(audioManager.isMuted())

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
  /** Mode selected from the main menu; applied to createGameState() when the Start action arrives. */
  let pendingMode: GameMode = 'classic'
  /** Which option is highlighted in the pause modal. */
  let pauseSelectedIndex = 0
  /**
   * Snapshot of each blurred container's original filters array, captured
   * when entering pause so they can be restored exactly on resume.
   */
  const prePauseFilters = new Map<Container, Filter[] | null>()
  /** Teardown function returned by attachPauseKeyListener(). */
  let removePauseKeyListener: (() => void) | null = null
  /** Teardown function for the Escape-key listener active during 'intro' phase. */
  let removeIntroKeyListener: (() => void) | null = null

  // --- Sprint mode state ---
  /** Which play mode was selected at the main menu. */
  let selectedPlayMode: 'marathon' | 'sprint' = 'marathon'
  /** Whether the Sprint wall-clock timer is currently accumulating. */
  let sprintTimerRunning = false
  /** Accumulated elapsed milliseconds for the current Sprint run. */
  let sprintElapsedMs = 0
  /** performance.now() snapshot of the last render frame with timer running. */
  let sprintLastTickTime = 0
  /** Final elapsed ms captured on sprint-complete — used by game-over overlay. */
  let finalSprintTimeMs = 0
  /** Previous value of state.timerStarted — for false→true edge detection. */
  let prevTimerStarted = false

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

    mainMenu?.resize(window.innerWidth, window.innerHeight)
    gameOverOverlay.resize(window.innerWidth, window.innerHeight)
  }

  // Main menu — rendered on top of everything; destroyed on first Start action
  let mainMenu: MainMenu | null = new MainMenu(mainMenuContainer, app)
  mainMenu.onExit = handleExit
  mainMenu.onSprintStart = () => { startGame('sprint') }
  removeIntroKeyListener = attachIntroKeyListener()

  const gameOverOverlay = new GameOverOverlay(modalContainer)
  gameOverOverlay.onReturnToMenu = () => navigateToTitle()

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

  /**
   * Attach a keyboard listener that fires handleExit() when Escape is pressed
   * while in the 'intro' phase (main menu visible).
   *
   * Returns a teardown function. The caller is responsible for invoking it
   * exactly once when the intro phase ends.
   */
  function attachIntroKeyListener(): () => void {
    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'Escape') {
        e.preventDefault()
        handleExit()
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
   * Transition directly from intro to playing for the given play mode.
   * Used by Sprint (bypasses the GameAction.Start accumulator path) and
   * for Marathon when explicit mode is needed.
   */
  function startGame(playMode: 'marathon' | 'sprint'): void {
    selectedPlayMode = playMode
    audioManager.onPhaseChange('playing')
    mainMenu?.destroy()
    mainMenu = null
    if (removeIntroKeyListener !== null) {
      removeIntroKeyListener()
      removeIntroKeyListener = null
    }
    // Build fresh state with correct play mode, then advance past 'intro'
    const fresh = createGameState(pendingMode, playMode)
    const result = updateGameState(fresh, [GameAction.Start], 0)
    state = result.state
    prevPhase = state.phase
    prevTimerStarted = false

    hud.setPlayMode(playMode)
    hud.setVisible(true)

    // Reset Sprint timer state regardless of mode (safe no-op for Marathon)
    sprintTimerRunning = false
    sprintElapsedMs = 0
    finalSprintTimeMs = 0
  }

  /**
   * Restart the game immediately from a fresh state, bypassing the intro splash.
   *
   * Creates a new game in 'playing' phase without showing the splash screen.
   * The HUD remains visible. The splash screen is not recreated.
   */
  function restartGame(): void {
    audioManager.onPhaseChange('intro')    // stop BGM and reset bgmSoundId
    audioManager.onPhaseChange('playing')  // restart BGM from beginning
    removePauseBlur()
    pauseModal.hide()

    if (removePauseKeyListener !== null) {
      removePauseKeyListener()
      removePauseKeyListener = null
    }

    const fresh = createGameState(state.gameMode, selectedPlayMode)
    const result = updateGameState(fresh, [GameAction.Start], 0)
    state = result.state
    prevPhase = state.phase
    prevTimerStarted = false

    sprintTimerRunning = false
    sprintElapsedMs = 0
    finalSprintTimeMs = 0

    hud.setPlayMode(selectedPlayMode)
    hud.setVisible(true)
  }

  /**
   * Navigate back to the title / main menu screen.
   *
   * Tears down the pause state, hides all overlays, resets engine state,
   * and re-instantiates the MainMenu.
   */
  function navigateToTitle(): void {
    audioManager.onPhaseChange('intro')
    removePauseBlur()
    pauseModal.hide()
    gameOverOverlay.hide()

    if (removePauseKeyListener !== null) {
      removePauseKeyListener()
      removePauseKeyListener = null
    }

    sprintTimerRunning = false
    sprintElapsedMs = 0
    finalSprintTimeMs = 0
    prevTimerStarted = false
    selectedPlayMode = 'marathon'
    hud.setPlayMode('marathon')

    // createGameState() defaults to 'classic'; mode choice is not persisted across sessions.
    state = createGameState()
    prevPhase = state.phase

    mainMenu = new MainMenu(mainMenuContainer, app)
    mainMenu.onExit = handleExit
    mainMenu.onSprintStart = () => { startGame('sprint') }
    mainMenu.resize(window.innerWidth, window.innerHeight)
    removeIntroKeyListener = attachIntroKeyListener()

    hud.setVisible(false)
  }

  /**
   * Handle the Exit button action:
   * 1. Attempt window.close() (may be blocked by browser).
   * 2. After 50ms, if the window is still open, show the fallback message.
   */
  function handleExit(): void {
    window.close()
    setTimeout(() => {
      mainMenu?.showExitFallback()
    }, 50)
  }

  /**
   * Apply a screen-shake effect scaled by the chain explosion depth.
   * Shakes the entire stage for a short duration then resets position.
   */
  function triggerChainShake(depth: number): void {
    const magnitude = Math.min(depth * 3, 10)
    if (magnitude === 0) return
    const SHAKE_DURATION_MS = 200
    const startTime = performance.now()
    function shakeFrame(): void {
      const elapsed = performance.now() - startTime
      if (elapsed >= SHAKE_DURATION_MS) {
        app.stage.x = 0
        app.stage.y = 0
        return
      }
      const progress = elapsed / SHAKE_DURATION_MS
      const decay = 1 - progress
      app.stage.x = (Math.random() - 0.5) * 2 * magnitude * decay
      app.stage.y = (Math.random() - 0.5) * 2 * magnitude * decay
      requestAnimationFrame(shakeFrame)
    }
    requestAnimationFrame(shakeFrame)
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
        ...(mainMenu?.flushActions() ?? []),
      ]
      const heldActions = [
        ...keyboard.getHeldActions(LOGIC_TICK_MS),
        ...touchInput.getHeldActions(LOGIC_TICK_MS),
      ]

      // Capture mode selection from main menu (null if player clicked PLAY or no click yet)
      const menuMode = mainMenu?.flushMode() ?? null
      if (menuMode !== null) {
        pendingMode = menuMode
      }

      // If a Start action arrived while in intro, reinitialize state with the chosen mode
      // so that state.gameMode is set before the engine transitions intro → playing.
      if (state.phase === 'intro' && bufferedActions.includes(GameAction.Start)) {
        state = createGameState(pendingMode)
        pendingMode = 'classic' // reset for next game (mode is not persisted)
      }

      // Deduplicate: combine buffered + held, remove duplicates
      const allActions = deduplicateActions([...bufferedActions, ...heldActions])

      // Notify audio layer of player actions (before engine processes them)
      for (const action of allActions) {
        audioManager.onAction(action)
      }

      // Advance engine
      const phaseBeforeUpdate = state.phase
      const result = updateGameState(state, allActions, LOGIC_TICK_MS)
      state = result.state
      renderState = state

      // Sprint timer start: detect false → true transition on timerStarted
      if (!prevTimerStarted && state.timerStarted) {
        sprintTimerRunning = true
        sprintLastTickTime = performance.now()
      }
      prevTimerStarted = state.timerStarted

      // Detect intro → playing transition: destroy main menu and reveal HUD
      if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
        // This path is only reached for Marathon (Sprint uses startGame() directly).
        selectedPlayMode = 'marathon'
        hud.setPlayMode('marathon')
        audioManager.onPhaseChange('playing')
        mainMenu?.destroy()
        mainMenu = null
        if (removeIntroKeyListener !== null) {
          removeIntroKeyListener()
          removeIntroKeyListener = null
        }
        hud.setVisible(true)
        prevTimerStarted = false
      }

      // Pass events to effects renderer and audio layer
      if (result.events.length > 0) {
        effectsRenderer.onEvents(result.events)
        audioManager.onEvents(result.events)
        for (const event of result.events) {
          if (event.type === 'sprint-complete') {
            sprintTimerRunning = false
            finalSprintTimeMs = sprintElapsedMs
          }
          if (event.type === 'chain-explosion') {
            const payload = event.payload as { depth: number } | undefined
            if (payload) {
              postProcessController.setChainDepth(payload.depth)
              triggerChainShake(payload.depth)
            }
          }
          if (event.type === 'chain-reset') {
            postProcessController.setChainDepth(0)
          }
        }
      }

      accumulator -= LOGIC_TICK_MS
    }

    // Sprint wall-clock timer — accumulates on every render frame
    if (sprintTimerRunning) {
      sprintElapsedMs += now - sprintLastTickTime
      sprintLastTickTime = now
      hud.updateSprintTimer(sprintElapsedMs)
    }

    // --- Phase-transition edge detection ---
    const currentPhase = state.phase
    const justPaused = prevPhase !== 'paused' && currentPhase === 'paused'
    const justResumed = prevPhase === 'paused' && currentPhase !== 'paused'

    if (justPaused) {
      audioManager.onPhaseChange('paused')
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
      audioManager.onPhaseChange('playing')
      // Engine resumed externally (e.g. by pressing Escape in normal keyboard flow)
      // Perform cleanup in case the modal/blur are still active
      removePauseBlur()
      pauseModal.hide()
      if (removePauseKeyListener !== null) {
        removePauseKeyListener()
        removePauseKeyListener = null
      }
    }

    const justGameOver = prevPhase !== 'gameover' && currentPhase === 'gameover'

    if (justGameOver) {
      if (selectedPlayMode === 'sprint') {
        const pb = loadSprintPB()
        const isNewPB = pb === null || finalSprintTimeMs < pb
        if (isNewPB) {
          saveSprintPB(finalSprintTimeMs)
        }
        gameOverOverlay.showSprint(finalSprintTimeMs, isNewPB)
      } else {
        gameOverOverlay.show(state.score, state.lines)
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
