# Delta Spec: Sprint Mode (40-Line Challenge)

This document specifies every API-level change precisely. It is the authoritative
reference for what exists before and after this change.

---

## 1. src/engine/types.ts

### 1.1 GameEventType — ADD variant

**Before:**
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

`sprint-complete` carries no payload. It is emitted before `game-over` in a Sprint
run, always in the same tick, so consumers can distinguish Sprint termination from
board-top-out.

---

## 2. src/engine/gameState.ts

### 2.1 GameState interface — ADD two fields

**Before (relevant excerpt):**
```typescript
export interface GameState {
  // ...existing fields...
  chainTimer: number
}
```

**After:**
```typescript
export interface GameState {
  // ...existing fields...
  chainTimer: number
  /** Which game mode is active. */
  mode: 'marathon' | 'sprint'
  /**
   * True once the first piece has been locked in a Sprint run.
   * main.ts uses the false→true edge to start the wall-clock timer.
   * Always false in Marathon; irrelevant once true in Sprint.
   */
  timerStarted: boolean
}
```

### 2.2 createGameState() — ADD optional parameter

**Before:**
```typescript
export function createGameState(): GameState
```

**After:**
```typescript
export function createGameState(mode: 'marathon' | 'sprint' = 'marathon'): GameState
```

The new fields are initialised:
```typescript
mode,
timerStarted: false,
```

All existing call sites pass zero arguments and continue to receive Marathon state
unchanged.

### 2.3 LockResult interface (internal) — ADD field

**Before (internal, not exported):**
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
  /** True iff mode=sprint and lines reached SPRINT_TARGET after this lock. */
  sprintComplete: boolean
}
```

### 2.4 processLock() — ADD Sprint termination logic

After `currentLines += clearedCount` (and after chain-explosion bonus lines are added),
insert:

```typescript
const SPRINT_TARGET = 40

if (state.mode === 'sprint' && currentLines >= SPRINT_TARGET) {
  currentLines = SPRINT_TARGET
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

`processLock` also requires access to `state.mode`. Its signature changes:

**Before:**
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
): LockResult
```

**After:**
```typescript
function processLock(
  board: Board,
  score: number,
  lines: number,
  level: number,
  chargedCells: ReadonlySet<number>,
  chainDepth: number,
  chainTimer: number,
  piece: ActivePiece,
  mode: 'marathon' | 'sprint'
): LockResult
```

Both call sites in `updateGameState` pass `state.mode` as the final argument.

### 2.5 processLock() — SET timerStarted on first lock in Sprint

Inside `processLock`, immediately after `events.push({ type: 'piece-lock' })`, the
caller (not `processLock` itself) sets `timerStarted`. This is handled in
`updateGameState`:

After receiving `lockResult` in both hard-drop and gravity-lock branches:

```typescript
const newTimerStarted =
  state.mode === 'sprint' && !state.timerStarted
    ? true
    : state.timerStarted
```

This value is passed in the returned state snapshot.

### 2.6 updateGameState() — ADD Sprint-complete early return

In both the hard-drop branch and the gravity-lock branch, after `processLock` returns,
check `lockResult.sprintComplete`. If true, skip the spawn logic entirely:

```typescript
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
      mode: state.mode,
      timerStarted: newTimerStarted,
    },
    events,
  }
}
```

This pattern mirrors the existing top-out game-over return in both branches.

---

## 3. src/engine/persistence.ts (NEW FILE)

Exports:

```typescript
/**
 * Load the Sprint personal-best time in milliseconds.
 * Returns null if no PB is stored or the stored value is not a valid integer.
 */
export function loadSprintPB(): number | null

/**
 * Persist a new Sprint personal-best time in milliseconds.
 * Silently no-ops if localStorage is unavailable (private browsing, quota).
 */
export function saveSprintPB(ms: number): void

/**
 * Format a millisecond count as 'MM:SS.mmm'.
 * Pure function — no side effects.
 */
export function formatSprintTime(ms: number): string
```

Storage key: `'tetris_sprint_pb'`

No imports. This file is importable from `engine/`, `ui/`, and `main.ts`.

---

## 4. src/ui/mainMenu.ts

### 4.1 ADD public callback field

```typescript
/** Called when the Sprint button is tapped/clicked. Default is a no-op. */
onSprintStart: () => void = () => undefined
```

### 4.2 ADD private field

```typescript
private sprintButton: Container
```

### 4.3 BUILD and WIRE sprintButton in constructor

After the existing `this.rankingsButton` block (if leaderboard spec is merged) or
after the `exitButton` block if leaderboard is not yet present:

```typescript
this.sprintButton = this.buildButton('SPRINT')
this.sprintButton.on('pointerup', () => {
  this.onSprintStart()
})
this.container.addChild(this.sprintButton)
```

If the leaderboard spec has been applied, the button order (top to bottom) becomes:
MARATHON (renamed from PLAY), SPRINT, RANKINGS, EXIT.

If the leaderboard spec has NOT been applied, the button order becomes:
MARATHON (renamed from PLAY), SPRINT, EXIT.

See note in section 4.4 on the PLAY → MARATHON rename.

### 4.4 RENAME PLAY to MARATHON

The existing PLAY button label is renamed to MARATHON to clarify the distinction
between modes. The `buildButton` call label changes from `'PLAY'` to `'MARATHON'`.
The `flushActions()` API is unchanged; pressing MARATHON still pushes
`GameAction.Start`.

**Before:**
```typescript
this.playButton = this.buildButton('PLAY')
```

**After:**
```typescript
this.playButton = this.buildButton('MARATHON')
```

This is a visual-only change. The field name `playButton` is retained.

### 4.5 UPDATE resize() button layout

With four buttons (MARATHON, SPRINT, RANKINGS, EXIT) the vertical step shrinks from 70
to 60 px to maintain visual balance. If leaderboard spec is not applied, three buttons
(MARATHON, SPRINT, EXIT) use the original 70 px step.

Four-button layout (with leaderboard):
```typescript
resizeButton(this.playButton,    width / 2, height * 0.52)
resizeButton(this.sprintButton,  width / 2, height * 0.52 + 60)
resizeButton(this.rankingsButton, width / 2, height * 0.52 + 120)
resizeButton(this.exitButton,    width / 2, height * 0.52 + 180)
this.fallbackText.x = width / 2
this.fallbackText.y = height * 0.52 + 260
```

Three-button layout (without leaderboard):
```typescript
resizeButton(this.playButton,   width / 2, height * 0.54)
resizeButton(this.sprintButton, width / 2, height * 0.54 + 70)
resizeButton(this.exitButton,   width / 2, height * 0.54 + 140)
this.fallbackText.x = width / 2
this.fallbackText.y = height * 0.54 + 220
```

---

## 5. src/ui/hud.ts

### 5.1 ADD Sprint display elements

New private fields:
```typescript
private sprintPanel: Container
private sprintLinesLabel: Text
private sprintLinesValue: Text
private sprintTimerLabel: Text
private sprintTimerValue: Text
private lastSprintLines = -1
private lastSprintTimerMs = -1
private currentMode: 'marathon' | 'sprint' = 'marathon'
```

### 5.2 ADD setMode() method

```typescript
setMode(mode: 'marathon' | 'sprint'): void {
  this.currentMode = mode
  // Show/hide the correct panel
  this.panel.visible = mode === 'marathon'
  this.sprintPanel.visible = mode === 'sprint'
  // Reset cached values to force redraw
  this.lastSprintLines = -1
  this.lastSprintTimerMs = -1
}
```

### 5.3 ADD updateSprintTimer() method

```typescript
updateSprintTimer(elapsedMs: number): void {
  if (elapsedMs === this.lastSprintTimerMs) return
  this.lastSprintTimerMs = elapsedMs
  this.sprintTimerValue.text = formatSprintTime(elapsedMs)
}
```

Imports `formatSprintTime` from `'../engine/persistence.js'`.

### 5.4 UPDATE update() method

In `update(state: GameState)`, update Sprint lines display when in Sprint mode:

```typescript
if (this.currentMode === 'sprint' && state.lines !== this.lastSprintLines) {
  this.sprintLinesValue.text = `${state.lines} / 40`
  this.lastSprintLines = state.lines
}
```

---

## 6. src/ui/gameOverOverlay.ts

### 6.1 ADD Sprint-mode fields

```typescript
private pbText: Text
private _sprintMode = false
```

### 6.2 ADD showSprint() method

```typescript
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

Imports `formatSprintTime` from `'../engine/persistence.js'`.

### 6.3 UPDATE hide() to reset _sprintMode and title

```typescript
hide(): void {
  if (this.visible) {
    this.stage.removeChild(this.panelRoot)
    this.visible = false
    this.titleText.text = 'GAME OVER'  // reset for next Marathon use
    this._sprintMode = false
  }
}
```

### 6.4 UPDATE resize() to position pbText

```typescript
this.pbText.x = w / 2
this.pbText.y = h * 0.53
```

(Below `scoreText` at `h * 0.45`, above `returnButton` at `h * 0.6`.)

---

## 7. src/main.ts

### 7.1 ADD import

```typescript
import { loadSprintPB, saveSprintPB } from './engine/persistence.js'
```

### 7.2 ADD loop-level Sprint state variables

```typescript
/** Which mode was selected at the main menu. */
let selectedMode: 'marathon' | 'sprint' = 'marathon'
/** Whether the Sprint wall-clock timer is currently running. */
let sprintTimerRunning = false
/** Accumulated elapsed milliseconds for the current Sprint run. */
let sprintElapsedMs = 0
/** performance.now() timestamp of the last render frame while timer is running. */
let sprintLastTickTime = 0
/** Final elapsed ms when Sprint completes — used on game-over overlay. */
let finalSprintTimeMs = 0
/** Previous value of state.timerStarted — for leading-edge detection. */
let prevTimerStarted = false
```

### 7.3 WIRE mainMenu.onSprintStart

In the initial menu instantiation block and in `navigateToTitle()` re-instantiation:

```typescript
mainMenu.onSprintStart = () => {
  selectedMode = 'sprint'
  mainMenu?.flushActions()  // discard any buffered Start from previous tick
  startGame('sprint')
}
```

And rename / refactor the PLAY / MARATHON button wiring so pressing MARATHON calls:

```typescript
mainMenu.onPlayStart = () => {    // rename of the existing implicit Start push
  selectedMode = 'marathon'
  // GameAction.Start is already buffered by the button's pointerup handler
}
```

Actually, the cleaner approach: the existing MainMenu PLAY button already pushes
`GameAction.Start` into `menuActionBuffer`. For Marathon this still works. For Sprint,
`onSprintStart` is called instead of (not in addition to) pushing `GameAction.Start`.
`onSprintStart` calls a new `startGame('sprint')` helper directly.

### 7.4 ADD startGame() helper

```typescript
/**
 * Transition from 'intro' to 'playing' for the selected mode.
 * Replaces the implicit GameAction.Start path for Sprint
 * (which must pass mode to createGameState before Start).
 */
function startGame(mode: 'marathon' | 'sprint'): void {
  selectedMode = mode
  audioManager.onPhaseChange('playing')
  mainMenu?.destroy()
  mainMenu = null
  if (removeIntroKeyListener !== null) {
    removeIntroKeyListener()
    removeIntroKeyListener = null
  }
  // Create a fresh state in the correct mode, then advance past 'intro'
  const fresh = createGameState(mode)
  const result = updateGameState(fresh, [GameAction.Start], 0)
  state = result.state
  prevPhase = state.phase
  prevTimerStarted = state.timerStarted

  hud.setMode(mode)
  hud.setVisible(true)

  // Reset Sprint timer state
  sprintTimerRunning = false
  sprintElapsedMs = 0
  finalSprintTimeMs = 0
}
```

### 7.5 ADD Sprint timer tick in render loop

In `loop(now)`, after the accumulator while-loop and before phase-transition detection:

```typescript
if (sprintTimerRunning) {
  sprintElapsedMs += now - sprintLastTickTime
  sprintLastTickTime = now
  hud.updateSprintTimer(sprintElapsedMs)
}
```

### 7.6 ADD timerStarted leading-edge detection in logic loop

Inside the accumulator while-loop, after `state = result.state`:

```typescript
// Sprint timer start: leading edge of timerStarted flag
if (!prevTimerStarted && state.timerStarted) {
  sprintTimerRunning = true
  sprintLastTickTime = performance.now()
}
prevTimerStarted = state.timerStarted
```

### 7.7 ADD sprint-complete event handler

In the event processing block inside the accumulator while-loop:

```typescript
if (event.type === 'sprint-complete') {
  sprintTimerRunning = false
  finalSprintTimeMs = sprintElapsedMs
}
```

### 7.8 UPDATE justGameOver block

**Before:**
```typescript
if (justGameOver) {
  gameOverOverlay.show(state.score, state.lines)
}
```

**After:**
```typescript
if (justGameOver) {
  if (selectedMode === 'sprint') {
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

### 7.9 UPDATE restartGame() to reset Sprint state

After `const fresh = createGameState()`:

```typescript
const mode = selectedMode
const freshWithMode = createGameState(mode)
const result = updateGameState(freshWithMode, [GameAction.Start], 0)
state = result.state
prevPhase = state.phase
prevTimerStarted = state.timerStarted
sprintTimerRunning = false
sprintElapsedMs = 0
finalSprintTimeMs = 0
hud.setMode(mode)
hud.setVisible(true)
```

### 7.10 UPDATE navigateToTitle() to reset Sprint state

Add to `navigateToTitle()`:

```typescript
sprintTimerRunning = false
sprintElapsedMs = 0
finalSprintTimeMs = 0
prevTimerStarted = false
selectedMode = 'marathon'  // reset to default; next menu selection will set it
hud.setMode('marathon')
```

---

## 8. Compatibility Impact

### Breaking changes — None

`createGameState()` remains callable with zero arguments; the new `mode` parameter
defaults to `'marathon'`. All existing engine tests pass without modification because
they use the zero-argument form.

### Advisory changes

- `GameEventType` gains `'sprint-complete'`. Any code that exhaustively switch/cases
  over `GameEventType` (none currently exists in the codebase) would need a new case.
  Existing event handlers in `main.ts` and `audioManager.ts` ignore unknown event
  types gracefully.

- `GameState` gains two new required fields (`mode`, `timerStarted`). Any code that
  constructs a `GameState` literal directly (outside of `createGameState`) would fail
  to compile. No such code exists in the test suite or source; all tests obtain state
  via `createGameState()`.

- `MainMenu` PLAY button label changes from `'PLAY'` to `'MARATHON'`. The button
  index in `collectInteractives` depth-first order changes if the leaderboard spec was
  already applied (Sprint button inserts at position 1). Tests for `mainMenu.test.ts`
  must be updated to reflect the new button count and index positions.
