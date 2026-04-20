# Context Bundle: Sprint Mode (40-Line Challenge)

This document provides exact-change guidance for the developer implementing
the Sprint Mode feature. Read this alongside `tasks.md`. Each section maps
to one or more tasks and contains the precise before/after state of every
modified construct.

---

## Critical Naming Clarification

The existing codebase already uses `createGameState(mode: GameMode)` where
`GameMode = 'classic' | 'monochrome'` controls **rendering**. This is stored
as `state.gameMode`. The Sprint feature introduces an orthogonal **play mode**
(`'marathon' | 'sprint'`). To avoid ambiguity, the play mode field is named
`playMode` (not `mode` as written in the original design docs).

**Summary of the two mode fields:**

| Field | Type | Controls | Source |
|---|---|---|---|
| `state.gameMode` | `'classic' \| 'monochrome'` | Rendering colors | Existing, unchanged |
| `state.playMode` | `'marathon' \| 'sprint'` | Termination logic | NEW — this feature |

Anywhere the design doc says `state.mode`, read it as `state.playMode`.

---

## File: `src/engine/types.ts`

### Change: Add `'sprint-complete'` to `GameEventType`

**Before (line 32–39):**
```typescript
export type GameEventType =
  | 'line-clear'
  | 'piece-lock'
  | 'level-up'
  | 'game-over'
  | 'cell-charged'
  | 'chain-explosion'
  | 'chain-reset'
```

**After:**
```typescript
export type GameEventType =
  | 'line-clear'
  | 'piece-lock'
  | 'level-up'
  | 'game-over'
  | 'cell-charged'
  | 'chain-explosion'
  | 'chain-reset'
  | 'sprint-complete'
```

No other changes to this file.

---

## File: `src/engine/gameState.ts`

### Change 1: `GameState` interface — add two fields

**Before (line 33–52, excerpt):**
```typescript
export interface GameState {
  board: Board
  activePiece: ActivePiece | null
  nextPiece: PieceType
  score: number
  level: number
  lines: number
  phase: 'intro' | 'playing' | 'paused' | 'gameover'
  gravityState: GravityState
  pieceBag: PieceType[]
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  gameMode: GameMode
}
```

**After:**
```typescript
export interface GameState {
  board: Board
  activePiece: ActivePiece | null
  nextPiece: PieceType
  score: number
  level: number
  lines: number
  phase: 'intro' | 'playing' | 'paused' | 'gameover'
  gravityState: GravityState
  pieceBag: PieceType[]
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  gameMode: GameMode
  /** Which play mode is active for this game. */
  playMode: 'marathon' | 'sprint'
  /**
   * True once the first piece has been locked in a Sprint run.
   * main.ts uses the false→true edge to start the wall-clock timer.
   * Always false in Marathon; irrelevant after the first lock in Sprint.
   */
  timerStarted: boolean
}
```

### Change 2: `createGameState` — add second parameter and initialise new fields

**Before (line 128):**
```typescript
export function createGameState(mode: GameMode = 'classic'): GameState {
```

**After:**
```typescript
export function createGameState(
  gameMode: GameMode = 'classic',
  playMode: 'marathon' | 'sprint' = 'marathon'
): GameState {
```

**Note:** The parameter is renamed from `mode` to `gameMode` for clarity. All
existing call sites either pass zero arguments (`createGameState()`) or one
argument (`createGameState('monochrome')`) — both continue to work unchanged.

**Before (line 136–150, return literal):**
```typescript
  return {
    board: emptyBoard(),
    activePiece,
    nextPiece: nextType,
    score: 0,
    level: 1,
    lines: 0,
    phase: 'intro',
    gravityState: initialGravityState(),
    pieceBag: bag2,
    chargedCells: new Set<number>(),
    chainDepth: 0,
    chainTimer: 0,
    gameMode: mode,
  }
```

**After:**
```typescript
  return {
    board: emptyBoard(),
    activePiece,
    nextPiece: nextType,
    score: 0,
    level: 1,
    lines: 0,
    phase: 'intro',
    gravityState: initialGravityState(),
    pieceBag: bag2,
    chargedCells: new Set<number>(),
    chainDepth: 0,
    chainTimer: 0,
    gameMode,
    playMode,
    timerStarted: false,
  }
```

### Change 3: `LockResult` interface — add `sprintComplete` field

**Before (line 153–163):**
```typescript
interface LockResult {
  board: Board
  score: number
  lines: number
  level: number
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  events: GameEvent[]
}
```

**After:**
```typescript
interface LockResult {
  board: Board
  score: number
  lines: number
  level: number
  chargedCells: ReadonlySet<number>
  chainDepth: number
  chainTimer: number
  events: GameEvent[]
  /** True iff playMode=sprint and lines reached SPRINT_TARGET after this lock. */
  sprintComplete: boolean
}
```

### Change 4: `processLock` — add `playMode` parameter and Sprint termination

**Before (line 175–184, signature):**
```typescript
function processLock(
  board: Board,
  score: number,
  lines: number,
  level: number,
  chargedCells: ReadonlySet<number>,
  chainDepth: number,
  chainTimer: number,
  piece: ActivePiece
): LockResult {
```

**After:**
```typescript
const SPRINT_TARGET = 40

function processLock(
  board: Board,
  score: number,
  lines: number,
  level: number,
  chargedCells: ReadonlySet<number>,
  chainDepth: number,
  chainTimer: number,
  piece: ActivePiece,
  playMode: 'marathon' | 'sprint'
): LockResult {
```

Place `const SPRINT_TARGET = 40` at module level, immediately above
`processLock`. This makes it accessible to `updateGameState` if needed, and
avoids redefining it on every call.

**Sprint termination block — insert after `currentLines += explosionResult.bonusRows.length` (line ~231), before `if (newChargedFlat.length > 0)` (line ~256):**

```typescript
    // Sprint completion check — applied after all line counting (including explosion bonus)
    if (playMode === 'sprint' && currentLines >= SPRINT_TARGET) {
      currentLines = SPRINT_TARGET   // cap; never emit "41 lines"
      events.push({ type: 'sprint-complete' })
      return {
        board: currentBoard,
        score: currentScore,
        lines: currentLines,
        level: currentLevel,
        chargedCells: currentCharged,
        chainDepth: currentChainDepth,
        chainTimer: currentChainTimer,
        events,
        sprintComplete: true,
      }
    }
```

**Also add to the normal (non-sprint) `return` at line 268:**
```typescript
  return {
    board: currentBoard,
    score: currentScore,
    lines: currentLines,
    level: currentLevel,
    chargedCells: currentCharged,
    chainDepth: currentChainDepth,
    chainTimer: currentChainTimer,
    events,
    sprintComplete: false,   // ADD THIS LINE
  }
```

### Change 5: `updateGameState` — both lock branches

There are **two** lock branches that call `processLock`: the hard-drop branch
(line ~390) and the gravity-lock branch (line ~475). Apply the following changes
identically to both:

**a) Pass `state.playMode` as the final argument to `processLock`:**

```typescript
// Hard-drop branch (around line 390):
const lockResult = processLock(
  board, score, lines, level, chargedCells, chainDepth, chainTimer,
  piece,
  state.playMode   // ADD
)

// Gravity-lock branch (around line 475):
const lockResult = processLock(
  board, score, lines, level, chargedCells, chainDepth, chainTimer,
  piece,
  state.playMode   // ADD
)
```

**b) After `events.push(...lockResult.events)`, compute `newTimerStarted`:**

```typescript
// ADD — immediately after events.push(...lockResult.events)
const newTimerStarted =
  state.playMode === 'sprint' && !state.timerStarted
    ? true
    : state.timerStarted
```

**c) After `tickChargeDecay(...)`, add the Sprint-complete early return:**

```typescript
// ADD — after the tickChargeDecay block, before "Spawn next piece" comment
if (lockResult.sprintComplete) {
  events.push({ type: 'game-over' })
  return {
    state: {
      ...state,
      board: lockResult.board,
      activePiece: null,
      nextPiece: state.nextPiece,
      score: lockResult.score,
      level: lockResult.level,
      lines: lockResult.lines,
      phase: 'gameover',
      gravityState: initialGravityState(),
      pieceBag: state.pieceBag,
      chargedCells: lockResult.chargedCells,
      chainDepth: lockResult.chainDepth,
      chainTimer: lockResult.chainTimer,
      gameMode: state.gameMode,
      playMode: state.playMode,
      timerStarted: newTimerStarted,
    },
    events,
  }
}
```

**d) Add new fields to the normal game-over return (spawn-blocked path):**

In the existing `if (isCollision(board, getCells(newPiece)))` block:
```typescript
// ADD to the existing spread:
gameMode: state.gameMode,
playMode: state.playMode,
timerStarted: newTimerStarted,
```

**e) Add new fields to the normal success return (new piece spawned):**

```typescript
// ADD to the existing spread:
gameMode: state.gameMode,
playMode: state.playMode,
timerStarted: newTimerStarted,
```

**f) Add new fields to the no-lock return at the bottom of `updateGameState`:**

```typescript
// ADD to the existing spread:
gameMode: state.gameMode,
playMode: state.playMode,
timerStarted: state.timerStarted,
```

**Event ordering guarantee:** `sprint-complete` is pushed inside `processLock`
(before its return). `lockResult.events` therefore already contains
`sprint-complete` when `events.push(...lockResult.events)` runs.
`game-over` is pushed by `updateGameState` after that. The event array will
always be `[..., 'sprint-complete', 'game-over']` in the sprint-completion tick.

---

## File: `src/engine/persistence.ts` (NEW)

Complete file contents:

```typescript
/**
 * Sprint mode persistence helpers.
 *
 * This file has zero imports — it uses only the `localStorage` global.
 * It may be imported from engine/, ui/, and main.ts.
 */

const SPRINT_PB_KEY = 'tetris_sprint_pb'

/**
 * Load the Sprint personal-best time in milliseconds.
 * Returns null if no PB is stored or the stored value is not a valid integer.
 */
export function loadSprintPB(): number | null {
  try {
    const raw = localStorage.getItem(SPRINT_PB_KEY)
    if (raw === null) return null
    const n = parseInt(raw, 10)
    return isNaN(n) ? null : n
  } catch {
    return null
  }
}

/**
 * Persist a new Sprint personal-best time in milliseconds.
 * Silently no-ops if localStorage is unavailable (private browsing, quota).
 */
export function saveSprintPB(ms: number): void {
  try {
    localStorage.setItem(SPRINT_PB_KEY, String(ms))
  } catch {
    // quota or private-browsing — silently ignore
  }
}

/**
 * Format a millisecond count as 'MM:SS.mmm'.
 * Pure function — no side effects.
 *
 * @example
 * formatSprintTime(0)      // '00:00.000'
 * formatSprintTime(61234)  // '01:01.234'
 */
export function formatSprintTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const millis = ms % 1000
  return (
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + '.' +
    String(millis).padStart(3, '0')
  )
}
```

---

## File: `src/ui/mainMenu.ts`

### Change 1: Add `onSprintStart` callback and `sprintButton` field

After `onExit` (line 30):
```typescript
/** Called when the SPRINT button is tapped/clicked. Default is a no-op. */
onSprintStart: () => void = () => undefined
```

After `private exitButton: Container` (line 36):
```typescript
private sprintButton: Container
```

### Change 2: Build Sprint button in constructor

After the `exitButton` block (around line 98):
```typescript
    // Sprint button — invokes onSprintStart callback
    this.sprintButton = this.buildButton('SPRINT')
    this.sprintButton.on('pointerup', () => {
      this.onSprintStart()
    })
    this.container.addChild(this.sprintButton)
```

### Change 3: Rename PLAY to MARATHON

**Before (line 81):**
```typescript
    this.playButton = this.buildButton('PLAY')
```

**After:**
```typescript
    this.playButton = this.buildButton('MARATHON')
```

The field name `playButton` is deliberately kept unchanged. The internal buffer
behaviour (`menuActionBuffer.push(GameAction.Start)`) is unchanged.

### Change 4: Update `resize()` button layout

**Before (lines 205–211):**
```typescript
    resizeButton(this.playButton,       width / 2, height * 0.56)
    resizeButton(this.monochromeButton, width / 2, height * 0.56 + 70)
    resizeButton(this.exitButton,       width / 2, height * 0.56 + 140)

    // Position fallback message below buttons
    this.fallbackText.x = width / 2
    this.fallbackText.y = height * 0.56 + 220
```

**After:**
```typescript
    resizeButton(this.playButton,       width / 2, height * 0.52)
    resizeButton(this.monochromeButton, width / 2, height * 0.52 + 60)
    resizeButton(this.sprintButton,     width / 2, height * 0.52 + 120)
    resizeButton(this.exitButton,       width / 2, height * 0.52 + 180)

    // Position fallback message below buttons
    this.fallbackText.x = width / 2
    this.fallbackText.y = height * 0.52 + 260
```

---

## File: `src/ui/hud.ts`

### Change 1: Add import

At the top of the file, add:
```typescript
import { formatSprintTime } from '../engine/persistence.js'
```

### Change 2: Add Sprint-specific private fields

After `private lastChainDepth = -1` (around line 39):
```typescript
  // Sprint-mode panel
  private sprintPanel: Container
  private sprintLinesLabel: Text
  private sprintLinesValue: Text
  private sprintTimerLabel: Text
  private sprintTimerValue: Text
  private lastSprintLines = -1
  private lastSprintTimerMs = -1
  private currentPlayMode: 'marathon' | 'sprint' = 'marathon'
```

### Change 3: Construct Sprint panel in constructor

After the existing `this.container.addChild(this.muteButton)` (end of
constructor), add:

```typescript
    // Sprint panel — hidden by default, shown when playMode === 'sprint'
    this.sprintPanel = new Container()
    this.sprintPanel.visible = false

    const sprintLabelStyle = new TextStyle({ fill: LABEL_COLOR, fontSize: 12, fontFamily: 'monospace' })
    const sprintValueStyle = new TextStyle({ fill: VALUE_COLOR, fontSize: 18, fontFamily: 'monospace', fontWeight: 'bold' })

    this.sprintLinesLabel = new Text({ text: 'LINES', style: sprintLabelStyle })
    this.sprintLinesValue = new Text({ text: '0 / 40', style: sprintValueStyle })
    this.sprintTimerLabel = new Text({ text: 'TIME', style: sprintLabelStyle })
    this.sprintTimerValue = new Text({ text: '00:00.000', style: sprintValueStyle })

    for (const elem of [
      this.sprintLinesLabel, this.sprintLinesValue,
      this.sprintTimerLabel, this.sprintTimerValue,
    ]) {
      this.sprintPanel.addChild(elem)
    }
    this.container.addChild(this.sprintPanel)
```

### Change 4: Position Sprint panel in `layoutElements()`

After the `this.muteButton.y = y` line (end of `layoutElements()`), add:

```typescript
    // Sprint panel — positioned starting at same y as score block
    this.sprintPanel.x = pad
    this.sprintPanel.y = 12

    let sy = 0
    this.sprintLinesLabel.x = 0
    this.sprintLinesLabel.y = sy
    sy += 18
    this.sprintLinesValue.x = 0
    this.sprintLinesValue.y = sy
    sy += 32
    this.sprintTimerLabel.x = 0
    this.sprintTimerLabel.y = sy
    sy += 18
    this.sprintTimerValue.x = 0
    this.sprintTimerValue.y = sy
```

### Change 5: Add `setPlayMode()` method

After `setVisible()`:
```typescript
  /**
   * Switch between marathon and sprint display modes.
   * Toggles panel visibility and resets change-detection caches.
   */
  setPlayMode(mode: 'marathon' | 'sprint'): void {
    this.currentPlayMode = mode
    this.panel.visible = mode === 'marathon'
    this.sprintPanel.visible = mode === 'sprint'
    // Reset caches to force next update() / updateSprintTimer() to redraw
    this.lastSprintLines = -1
    this.lastSprintTimerMs = -1
  }
```

### Change 6: Add `updateSprintTimer()` method

```typescript
  /**
   * Update the sprint timer display. Called every render frame by main.ts
   * while the sprint timer is running.
   */
  updateSprintTimer(elapsedMs: number): void {
    if (elapsedMs === this.lastSprintTimerMs) return
    this.lastSprintTimerMs = elapsedMs
    this.sprintTimerValue.text = formatSprintTime(elapsedMs)
  }
```

### Change 7: Update `update()` to refresh Sprint lines counter

Inside `update(state: GameState)`, after the existing
`if (state.lines !== this.lastLines)` block, add:

```typescript
    if (this.currentPlayMode === 'sprint' && state.lines !== this.lastSprintLines) {
      this.sprintLinesValue.text = `${state.lines} / 40`
      this.lastSprintLines = state.lines
    }
```

---

## File: `src/ui/gameOverOverlay.ts`

### Change 1: Add import

After the existing PixiJS import (line 16):
```typescript
import { formatSprintTime } from '../engine/persistence.js'
```

### Change 2: Add private fields

After `private visible = false` (line 37):
```typescript
  private pbText: Text
  private _sprintMode = false
```

### Change 3: Construct `pbText` in constructor

After `this.panelRoot.addChild(this.returnButton)` (around line 75):
```typescript
    // "New Best!" indicator — shown only when a Sprint PB is set
    const pbStyle = new TextStyle({
      fontSize: 28,
      fontWeight: 'bold',
      fill: 0xffdd44,
      fontFamily: FONT_FAMILY,
    })
    this.pbText = new Text({ text: 'New Best!', style: pbStyle })
    this.pbText.anchor.set(0.5, 0)
    this.pbText.visible = false
    this.panelRoot.addChild(this.pbText)
```

### Change 4: Add `showSprint()` method

After the existing `show()` method:
```typescript
  /**
   * Show the overlay in Sprint mode with the final time and optional PB indicator.
   * Idempotent: calling showSprint() when already visible updates text each time.
   */
  showSprint(finalTimeMs: number, isNewPB: boolean): void {
    this.titleText.text = 'SPRINT COMPLETE'
    this.scoreText.text = formatSprintTime(finalTimeMs)
    this.pbText.visible = isNewPB
    this._sprintMode = true
    if (!this.visible) {
      this.stage.addChild(this.panelRoot)
      this.visible = true
    }
  }
```

### Change 5: Update `hide()` to reset Sprint state

**Before:**
```typescript
  hide(): void {
    if (this.visible) {
      this.stage.removeChild(this.panelRoot)
      this.visible = false
    }
  }
```

**After:**
```typescript
  hide(): void {
    if (this.visible) {
      this.stage.removeChild(this.panelRoot)
      this.visible = false
      this.titleText.text = 'GAME OVER'   // reset for next Marathon use
      this._sprintMode = false
      this.pbText.visible = false
    }
  }
```

### Change 6: Update `resize()` to position `pbText`

After `this.scoreText.y = h * 0.45` (line ~154), add:
```typescript
    // pbText sits between scoreText and returnButton
    this.pbText.x = w / 2
    this.pbText.y = h * 0.53
```

---

## File: `src/main.ts`

### Change 1: Add import

After existing engine imports:
```typescript
import { loadSprintPB, saveSprintPB } from './engine/persistence.js'
```

### Change 2: Update `createGameState` call at initialisation

**Before (line 111):**
```typescript
  let state = createGameState()
```

No change needed here — the default arguments produce Marathon/Classic, which
is correct for the initial intro state. Sprint state is created in `startGame()`.

### Change 3: Add Sprint timer state variables

After `let removeIntroKeyListener: (() => void) | null = null` (around line 128):

```typescript
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
```

### Change 4: Add `startGame()` helper

Place this near `restartGame()` and `navigateToTitle()`:

```typescript
  /**
   * Transition directly from intro to playing for the given play mode.
   * Used by Sprint (bypasses the GameAction.Start accumulator path) and
   * optionally by Marathon when explicit mode is needed.
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
    const fresh = createGameState(pendingMode, playMode)
    const result = updateGameState(fresh, [GameAction.Start], 0)
    state = result.state
    prevPhase = state.phase
    prevTimerStarted = false

    hud.setPlayMode(playMode)
    hud.setVisible(true)

    sprintTimerRunning = false
    sprintElapsedMs = 0
    finalSprintTimeMs = 0
  }
```

### Change 5: Wire `mainMenu.onSprintStart` in both construction sites

**Initial construction (around line 165):**
```typescript
  let mainMenu: MainMenu | null = new MainMenu(mainMenuContainer, app)
  mainMenu.onExit = handleExit
  mainMenu.onSprintStart = () => { startGame('sprint') }   // ADD
  removeIntroKeyListener = attachIntroKeyListener()
```

**`navigateToTitle()` re-construction (bottom of function):**
```typescript
    mainMenu = new MainMenu(mainMenuContainer, app)
    mainMenu.onExit = handleExit
    mainMenu.onSprintStart = () => { startGame('sprint') }   // ADD
    mainMenu.resize(window.innerWidth, window.innerHeight)
    removeIntroKeyListener = attachIntroKeyListener()
```

### Change 6: Update intro→playing transition in the accumulator loop

**Before (around line 446):**
```typescript
      if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
        audioManager.onPhaseChange('playing')
        mainMenu?.destroy()
        mainMenu = null
        if (removeIntroKeyListener !== null) {
          removeIntroKeyListener()
          removeIntroKeyListener = null
        }
        hud.setVisible(true)
      }
```

**After:**
```typescript
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
```

### Change 7: Add Sprint timer tick in `loop()`

In `loop(now)`, after the `while (accumulator >= LOGIC_TICK_MS)` block ends and
before the `const currentPhase = state.phase` line:

```typescript
    // Sprint wall-clock timer — accumulates on every render frame
    if (sprintTimerRunning) {
      sprintElapsedMs += now - sprintLastTickTime
      sprintLastTickTime = now
      hud.updateSprintTimer(sprintElapsedMs)
    }
```

### Change 8: Add `timerStarted` edge detection inside accumulator loop

Inside the `while (accumulator >= LOGIC_TICK_MS)` loop, after
`state = result.state` and before `renderState = state`:

```typescript
      // Sprint timer start: detect false → true transition on timerStarted
      if (!prevTimerStarted && state.timerStarted) {
        sprintTimerRunning = true
        sprintLastTickTime = performance.now()
      }
      prevTimerStarted = state.timerStarted
```

### Change 9: Add `sprint-complete` handler in the event loop

Inside the `for (const event of result.events)` loop (around line 461):

```typescript
        if (event.type === 'sprint-complete') {
          sprintTimerRunning = false
          finalSprintTimeMs = sprintElapsedMs
        }
```

### Change 10: Update `justGameOver` block

**Before (line 509):**
```typescript
    if (justGameOver) {
      gameOverOverlay.show(state.score, state.lines)
    }
```

**After:**
```typescript
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
```

### Change 11: Update `restartGame()`

**Before:**
```typescript
  function restartGame(): void {
    audioManager.onPhaseChange('intro')
    audioManager.onPhaseChange('playing')
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
```

**After:**
```typescript
  function restartGame(): void {
    audioManager.onPhaseChange('intro')
    audioManager.onPhaseChange('playing')
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
```

### Change 12: Update `navigateToTitle()`

**After `gameOverOverlay.hide()` (around line 337), add:**
```typescript
    sprintTimerRunning = false
    sprintElapsedMs = 0
    finalSprintTimeMs = 0
    prevTimerStarted = false
    selectedPlayMode = 'marathon'
    hud.setPlayMode('marathon')
```

---

## Notes for Test Authors

### `gameState.test.ts` additions

The `playingState()` helper creates a Marathon state. Add a parallel helper:
```typescript
function sprintPlayingState() {
  const s = createGameState('classic', 'sprint')
  const { state } = updateGameState(s, [GameAction.Start], 0)
  return state
}
```

To force 40 lines cleared in tests, use the existing board-filling pattern
(fill all rows except two, hard-drop to clear them) applied enough times.
Alternatively, construct a state directly with `lines: 38` and a board that
has two full rows ready to be cleared on the next hard-drop.

### `mainMenu.test.ts` index updates

The `collectInteractives` depth-first walk returns interactive nodes in DOM
insertion order. With the Sprint button inserted between MONOCHROME and EXIT:

| Index | Button |
|---|---|
| 0 | MARATHON (was PLAY) |
| 1 | MONOCHROME |
| 2 | SPRINT (new) |
| 3 | EXIT (was index 2) |

Update the Exit button test: `interactives[2]?.emit('pointerup')` →
`interactives[3]?.emit('pointerup')`.

### `persistence.test.ts`

jsdom provides a `localStorage` implementation. Use `localStorage.clear()`
in `beforeEach` to isolate tests. To test failure paths, use
`vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error() })`.

---

## Compatibility Impact

### Breaking changes — None

`createGameState()` remains callable with zero arguments. The new `playMode`
and `timerStarted` fields on `GameState` will cause a TypeScript compile error
only in code that constructs a `GameState` literal directly (outside
`createGameState`). No such code exists in the current test suite or source.

### Advisory changes

- `GameEventType` gains `'sprint-complete'`. Any exhaustive switch/case over
  `GameEventType` would need a new branch. No such exhaustive switches exist
  in the current codebase.
- `MainMenu` interactive button count increases from 3 to 4. Tests that
  hardcode button indices (specifically the Exit button at index 2) must be
  updated to index 3.
- `MainMenu` PLAY button label changes from `'PLAY'` to `'MARATHON'`. Tests
  that assert on button text by label string must be updated.
- `createGameState` renames the first parameter from `mode` to `gameMode`.
  This is signature-only; all call sites use positional arguments.
