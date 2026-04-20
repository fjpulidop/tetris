# Tasks: Sprint Mode (40-Line Challenge)

## Prerequisite Clarification (Gap Addressed)

The existing `createGameState(mode: GameMode)` parameter already controls the
**rendering** mode (`'classic' | 'monochrome'`), stored as `state.gameMode`.
Sprint mode introduces an orthogonal **play** mode (`'marathon' | 'sprint'`).
These are two independent axes. The tasks below reflect this separation:
- `GameState.gameMode: GameMode` — rendering, already exists.
- `GameState.playMode: 'marathon' | 'sprint'` — new field (renamed from the
  spec's `mode` to avoid shadowing the render-mode concept).
- `createGameState` signature becomes:
  `createGameState(gameMode?: GameMode, playMode?: 'marathon' | 'sprint'): GameState`

All delta-spec references to `state.mode` should be read as `state.playMode`.

---

## Task 01 — [types] Add `sprint-complete` to `GameEventType`

**File:** `src/engine/types.ts` — MODIFY

Add `'sprint-complete'` as a new variant to the `GameEventType` union.
No other changes to this file.

**Acceptance criteria:**
- `GameEventType` includes `'sprint-complete'`.
- The TypeScript compiler accepts `{ type: 'sprint-complete' }` as a valid `GameEvent`.
- All existing imports of `GameEventType` compile without change (union is additive).

**Dependencies:** none.

---

## Task 02 — [engine] Add `playMode` and `timerStarted` to `GameState`

**File:** `src/engine/gameState.ts` — MODIFY

1. Add two new fields to the `GameState` interface:
   ```typescript
   /** Which play mode is active for this game. */
   playMode: 'marathon' | 'sprint'
   /**
    * Set to true on the first piece-lock in a Sprint run.
    * main.ts uses the false→true edge to start the wall-clock timer.
    * Always false in Marathon; irrelevant after the first lock in Sprint.
    */
   timerStarted: boolean
   ```
2. Update `createGameState` signature to accept an optional second parameter:
   ```typescript
   export function createGameState(
     gameMode: GameMode = 'classic',
     playMode: 'marathon' | 'sprint' = 'marathon'
   ): GameState
   ```
3. Add the new fields to the returned object literal in `createGameState`:
   ```typescript
   playMode,
   timerStarted: false,
   ```
4. All existing call sites of `createGameState()` (zero or one argument) compile
   without modification because both new parameters have defaults.

**Acceptance criteria:**
- `createGameState()` returns `{ playMode: 'marathon', timerStarted: false }`.
- `createGameState('classic', 'sprint')` returns `{ playMode: 'sprint', timerStarted: false }`.
- TypeScript does not report missing fields anywhere GameState is spread/copied.

**Dependencies:** Task 01 (types).

---

## Task 03 — [engine] Add `sprintComplete` to `LockResult` and `mode` param to `processLock`

**File:** `src/engine/gameState.ts` — MODIFY (continued from Task 02)

1. Add `sprintComplete: boolean` to the internal `LockResult` interface.
2. Add `playMode: 'marathon' | 'sprint'` as a final parameter to `processLock`.
3. Set `sprintComplete: false` in the existing `return` at the bottom of
   `processLock` (the non-sprint path).

**Note:** The sprint termination logic is added in Task 04. This task only
extends the data structure and function signature so Task 04 can be applied
cleanly on top.

**Acceptance criteria:**
- `LockResult` has `sprintComplete: boolean`.
- `processLock` accepts and receives `playMode` without TypeScript errors.
- All existing logic is unchanged; `sprintComplete` is always `false` after this task.

**Dependencies:** Task 02.

---

## Task 04 — [engine] Implement Sprint termination in `processLock`

**File:** `src/engine/gameState.ts` — MODIFY (continued)

Inside `processLock`, after the block that increments `currentLines` (including
the chain-explosion bonus lines addition), insert the Sprint termination guard:

```typescript
const SPRINT_TARGET = 40

if (playMode === 'sprint' && currentLines >= SPRINT_TARGET) {
  currentLines = SPRINT_TARGET   // cap at exactly 40; never exceed
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

The `SPRINT_TARGET` constant should be module-level (above `processLock`) so it
is visible to `updateGameState` as well.

**Insertion point (exact):** After the chain-explosion bonus lines block
(`currentLines += explosionResult.bonusRows.length`) and before the
`if (newChargedFlat.length > 0)` cell-charged event push. This ensures the
cap applies to the full cleared line count including explosion bonuses.

**Acceptance criteria:**
- In a Sprint state with `lines = 38`, locking a piece that clears 3 rows
  yields `lines = 40`, emits `sprint-complete`, and returns `sprintComplete: true`.
- In the same scenario, `lines` never exceeds 40.
- Marathon states (playMode = 'marathon') are unaffected; processLock returns
  `sprintComplete: false` regardless of line count.

**Dependencies:** Task 03.

---

## Task 05 — [engine] Wire `sprintComplete` and `timerStarted` in `updateGameState`

**File:** `src/engine/gameState.ts` — MODIFY (continued)

Update both the hard-drop branch and the gravity-lock branch of
`updateGameState` identically:

1. Pass `state.playMode` as the final argument to both `processLock(...)` calls.

2. After receiving `lockResult`, compute the `timerStarted` edge:
   ```typescript
   const newTimerStarted =
     state.playMode === 'sprint' && !state.timerStarted
       ? true
       : state.timerStarted
   ```

3. If `lockResult.sprintComplete === true`, skip the spawn logic entirely and
   return:
   ```typescript
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
   ```
   Note: `events` here is the accumulator from `updateGameState`, which already
   contains `lockResult.events` (pushed via `events.push(...lockResult.events)`
   immediately above). Do NOT double-push lockResult.events.

4. In the normal (non-sprint-complete) return paths at the end of both lock
   branches, include the two new fields:
   ```typescript
   playMode: state.playMode,
   timerStarted: newTimerStarted,
   ```

5. In the no-lock return at the bottom of `updateGameState`, propagate both
   fields:
   ```typescript
   playMode: state.playMode,
   timerStarted: state.timerStarted,
   ```

**Acceptance criteria:**
- Hard-drop to Sprint completion sets `phase === 'gameover'` and event list
  contains `'sprint-complete'` followed by `'game-over'` in that order.
- Gravity-lock to Sprint completion behaves identically.
- `timerStarted` transitions `false → true` on the very first lock in Sprint.
- `timerStarted` remains `false` throughout Marathon games.

**Dependencies:** Task 04.

---

## Task 06 — [engine] Create `src/engine/persistence.ts`

**File:** `src/engine/persistence.ts` — CREATE

New file with zero imports. Exports three functions:

```typescript
const SPRINT_PB_KEY = 'tetris_sprint_pb'

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

export function saveSprintPB(ms: number): void {
  try {
    localStorage.setItem(SPRINT_PB_KEY, String(ms))
  } catch {
    // quota or private-browsing — silently ignore
  }
}

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

`formatSprintTime` is pure. `loadSprintPB` and `saveSprintPB` use only the
`localStorage` global — no DOM imports, no PixiJS, no engine imports.

**Acceptance criteria:**
- `formatSprintTime(0)` returns `'00:00.000'`.
- `formatSprintTime(61234)` returns `'01:01.234'`.
- `loadSprintPB()` returns `null` when localStorage is empty.
- `saveSprintPB(5000)` followed by `loadSprintPB()` returns `5000`.
- File imports nothing.

**Dependencies:** none (standalone).

---

## Task 07 — [ui] Add Sprint button to `MainMenu`

**File:** `src/ui/mainMenu.ts` — MODIFY

1. Add a public callback field:
   ```typescript
   /** Called when the SPRINT button is tapped/clicked. Default is a no-op. */
   onSprintStart: () => void = () => undefined
   ```

2. Add a private field:
   ```typescript
   private sprintButton: Container
   ```

3. In the constructor, after `this.monochromeButton` block, build and wire the
   Sprint button:
   ```typescript
   this.sprintButton = this.buildButton('SPRINT')
   this.sprintButton.on('pointerup', () => {
     this.onSprintStart()
   })
   this.container.addChild(this.sprintButton)
   ```
   Button order in the container (top to bottom): PLAY (Marathon), MONOCHROME,
   SPRINT, EXIT.

4. Update `resize()` to position the Sprint button. The current three-button
   layout uses steps of 70px starting at `height * 0.56`. With four buttons,
   reduce the step to 60px:
   ```typescript
   resizeButton(this.playButton,       width / 2, height * 0.52)
   resizeButton(this.monochromeButton, width / 2, height * 0.52 + 60)
   resizeButton(this.sprintButton,     width / 2, height * 0.52 + 120)
   resizeButton(this.exitButton,       width / 2, height * 0.52 + 180)
   this.fallbackText.x = width / 2
   this.fallbackText.y = height * 0.52 + 260
   ```

**Note on PLAY → MARATHON rename:** The delta-spec proposes renaming the PLAY
button label to MARATHON. However, the existing `mainMenu.test.ts` tests
reference the PLAY button by index (index 0 in `collectInteractives`), not by
label text. The label rename is a non-breaking visual change; the test comment
mentioning "PLAY button" will need updating. The rename is included in this
task.

**Acceptance criteria:**
- `onSprintStart` is invoked exactly once when the Sprint button emits
  `pointerup`.
- PLAY button label reads `'MARATHON'` (visual rename only; `flushActions`
  behaviour unchanged).
- `resize()` does not throw with any viewport size.
- The interactive button count in `collectInteractives` increases from 3 to 4.

**Dependencies:** none (UI-only change).

---

## Task 08 — [ui] Add Sprint panel to `HUD`

**File:** `src/ui/hud.ts` — MODIFY

1. Add new private fields:
   ```typescript
   private sprintPanel: Container
   private sprintLinesLabel: Text
   private sprintLinesValue: Text
   private sprintTimerLabel: Text
   private sprintTimerValue: Text
   private lastSprintLines = -1
   private lastSprintTimerMs = -1
   private currentPlayMode: 'marathon' | 'sprint' = 'marathon'
   ```

2. In the constructor, build the Sprint panel and its four Text children, then
   add to `this.container`. The panel starts hidden (`sprintPanel.visible = false`).

3. Add `setPlayMode(mode: 'marathon' | 'sprint'): void`:
   ```typescript
   setPlayMode(mode: 'marathon' | 'sprint'): void {
     this.currentPlayMode = mode
     this.panel.visible = mode === 'marathon'
     this.sprintPanel.visible = mode === 'sprint'
     // Reset cache to force next update() to redraw
     this.lastSprintLines = -1
     this.lastSprintTimerMs = -1
   }
   ```
   The existing marathon panel (`this.panel`) and sprint panel (`this.sprintPanel`)
   are mutually exclusive; only one is visible at a time.

4. Add `updateSprintTimer(elapsedMs: number): void`:
   ```typescript
   updateSprintTimer(elapsedMs: number): void {
     if (elapsedMs === this.lastSprintTimerMs) return
     this.lastSprintTimerMs = elapsedMs
     this.sprintTimerValue.text = formatSprintTime(elapsedMs)
   }
   ```
   Import `formatSprintTime` from `'../engine/persistence.js'`.

5. In `update(state: GameState)`, add a Sprint lines update inside the existing
   lines change-detection block, gated on current mode:
   ```typescript
   if (this.currentPlayMode === 'sprint' && state.lines !== this.lastSprintLines) {
     this.sprintLinesValue.text = `${state.lines} / 40`
     this.lastSprintLines = state.lines
   }
   ```

6. In `layoutElements()`, add Sprint panel positioning. The Sprint panel is
   positioned identically to the marathon score/level/lines block (same y
   coordinates), so it fills the same space when visible. The Sprint panel
   itself can be a `Container` with internal positioning of its four Text
   children.

**Acceptance criteria:**
- `setPlayMode('sprint')` hides the marathon panel and shows the sprint panel.
- `setPlayMode('marathon')` restores the marathon panel and hides the sprint panel.
- `updateSprintTimer(61234)` sets the timer text to `'01:01.234'`.
- `update(state)` with `state.lines = 5` sets sprint lines text to `'5 / 40'`
  when in sprint mode.
- `resize()` does not throw in either mode.

**Dependencies:** Task 06 (for `formatSprintTime` import).

---

## Task 09 — [ui] Add `showSprint()` to `GameOverOverlay`

**File:** `src/ui/gameOverOverlay.ts` — MODIFY

1. Add import at top of file:
   ```typescript
   import { formatSprintTime } from '../engine/persistence.js'
   ```

2. Add private fields:
   ```typescript
   private pbText: Text
   private _sprintMode = false
   ```

3. In the constructor, after `this.returnButton` block, create and add `pbText`
   to `panelRoot`. It starts hidden:
   ```typescript
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

4. Add `showSprint(finalTimeMs: number, isNewPB: boolean): void`:
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

5. Update `hide()` to reset Sprint-specific state:
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

6. Update `resize()` to position `pbText` between `scoreText` and
   `returnButton`:
   ```typescript
   this.pbText.x = w / 2
   this.pbText.y = h * 0.53
   ```
   (scoreText sits at `h * 0.45`; returnButton at `h * 0.6`.)

**Acceptance criteria:**
- `showSprint(61234, false)` sets title to `'SPRINT COMPLETE'`, score text to
  `'01:01.234'`, and pbText is not visible.
- `showSprint(61234, true)` additionally makes pbText visible.
- `hide()` after `showSprint()` resets title to `'GAME OVER'` and hides pbText.
- `resize()` does not throw regardless of mode.

**Dependencies:** Task 06.

---

## Task 10 — [main] Wire Sprint mode into `main.ts`

**File:** `src/main.ts` — MODIFY

This is the largest single-file change. Apply in the following sub-steps (all
within the same file edit session):

### 10a — Add import
```typescript
import { loadSprintPB, saveSprintPB } from './engine/persistence.js'
```

### 10b — Add Sprint timer state variables (after existing loop-level vars)
```typescript
/** Which play mode was selected at the main menu. */
let selectedPlayMode: 'marathon' | 'sprint' = 'marathon'
/** Whether the Sprint wall-clock timer is currently accumulating. */
let sprintTimerRunning = false
/** Accumulated elapsed milliseconds for the current Sprint run. */
let sprintElapsedMs = 0
/** performance.now() timestamp of the last render frame while timer is running. */
let sprintLastTickTime = 0
/** Final elapsed ms captured when Sprint completes — used on game-over overlay. */
let finalSprintTimeMs = 0
/** Previous value of state.timerStarted — for false→true leading-edge detection. */
let prevTimerStarted = false
```

### 10c — Add `startGame()` helper (near existing `restartGame`/`navigateToTitle`)
```typescript
/**
 * Transition from 'intro' to 'playing' for the selected play mode.
 * Called directly by onSprintStart; Marathon start continues to use
 * the existing GameAction.Start path via the accumulator loop.
 * Both paths converge here for HUD setup and timer reset.
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
```

### 10d — Wire `mainMenu.onSprintStart` (in the `navigateToTitle()` re-instantiation block and in the initial menu construction block)
```typescript
mainMenu.onSprintStart = () => {
  startGame('sprint')
}
```

### 10e — Update the intro → playing transition in the accumulator loop

The existing logic path (GameAction.Start from the PLAY/MARATHON button) must
also be updated to call `startGame('marathon')` instead of the current inline
destroy/HUD pattern. This keeps both entry points consistent.

Replace the current inline block:
```typescript
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  audioManager.onPhaseChange('playing')
  mainMenu?.destroy()
  mainMenu = null
  if (removeIntroKeyListener !== null) { ... }
  hud.setVisible(true)
}
```
With:
```typescript
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  // Marathon path — Sprint has already been handled by startGame('sprint')
  // before the engine tick, so this branch is only reached for Marathon.
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

Note: For Sprint, `startGame('sprint')` bypasses the engine's intro→playing
transition entirely (it calls `updateGameState` directly and sets `prevPhase`
to `'playing'`). The engine transition block will therefore never fire for
Sprint, avoiding double-initialization.

### 10f — Add Sprint timer tick in the render loop

In `loop(now)`, immediately after the `accumulator` while-loop ends (before
phase-transition edge detection), insert:

```typescript
// Sprint wall-clock timer — updated every render frame
if (sprintTimerRunning) {
  sprintElapsedMs += now - sprintLastTickTime
  sprintLastTickTime = now
  hud.updateSprintTimer(sprintElapsedMs)
}
```

### 10g — Add `timerStarted` leading-edge detection inside the accumulator loop

Inside the while-loop, after `state = result.state` and before event
processing:

```typescript
// Detect first piece-lock in Sprint (false → true edge)
if (!prevTimerStarted && state.timerStarted) {
  sprintTimerRunning = true
  sprintLastTickTime = performance.now()
}
prevTimerStarted = state.timerStarted
```

### 10h — Add `sprint-complete` event handler inside the accumulator event loop

In the existing event-processing loop:
```typescript
if (event.type === 'sprint-complete') {
  sprintTimerRunning = false
  finalSprintTimeMs = sprintElapsedMs
}
```

### 10i — Update the `justGameOver` block

**Before:**
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

### 10j — Update `restartGame()` to pass play mode and reset Sprint state

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

### 10k — Update `navigateToTitle()` to reset Sprint state

Add to `navigateToTitle()`, after `gameOverOverlay.hide()`:
```typescript
sprintTimerRunning = false
sprintElapsedMs = 0
finalSprintTimeMs = 0
prevTimerStarted = false
selectedPlayMode = 'marathon'
hud.setPlayMode('marathon')
```

Also wire `mainMenu.onSprintStart` in the newly constructed `mainMenu` instance
(the one created at the bottom of `navigateToTitle()`):
```typescript
mainMenu.onSprintStart = () => { startGame('sprint') }
```

**Acceptance criteria:**
- Clicking Sprint button starts a sprint game; HUD shows sprint panel.
- Timer starts on first piece lock, not at game start.
- Timer stops on sprint-complete event; finalSprintTimeMs is non-zero.
- Game-over overlay shows sprint time and "New Best!" on first run.
- Second run under PB shows "New Best!"; second run over PB does not.
- Returning to menu and starting Marathon shows marathon HUD; no timer bleed.
- Restarting Sprint from pause restarts timer from zero.
- Escape during Sprint game pauses correctly (no regression).

**Dependencies:** Tasks 02, 05, 06, 07, 08, 09.

---

## Task 11 — [tests] Engine tests for Sprint mode in `gameState.test.ts`

**File:** `src/__tests__/engine/gameState.test.ts` — MODIFY

Add a new `describe('Sprint mode — engine')` block covering:

1. `createGameState('classic', 'sprint')` returns `playMode: 'sprint'` and
   `timerStarted: false`.
2. `createGameState()` defaults to `playMode: 'marathon'`.
3. First piece lock in Sprint sets `timerStarted: true` in returned state.
4. First piece lock in Marathon leaves `timerStarted: false`.
5. Clearing exactly 40 lines in Sprint emits `'sprint-complete'` then
   `'game-over'` (in that order) and sets `phase: 'gameover'`.
6. Clearing 39 lines in Sprint does NOT emit `'sprint-complete'` (game
   continues).
7. Clearing 41+ lines in Sprint caps `state.lines` at exactly 40.
8. Sprint complete via hard-drop and via gravity-lock both work (two separate
   tests using the board-filling helper already in the test file).
9. Marathon game with 50+ lines does not emit `'sprint-complete'`.

Use the existing `playingState()` helper as the base. For Sprint tests:
```typescript
function sprintState() {
  const s = createGameState('classic', 'sprint')
  const { state } = updateGameState(s, [GameAction.Start], 0)
  return state
}
```

**Acceptance criteria:** All nine cases pass. Existing tests remain green.

**Dependencies:** Tasks 02–05.

---

## Task 12 — [tests] Unit tests for `persistence.ts`

**File:** `src/__tests__/engine/persistence.test.ts` — CREATE

Mock `localStorage` using `vi.stubGlobal` or the jsdom environment's built-in
`localStorage`. Tests:

1. `formatSprintTime(0)` → `'00:00.000'`.
2. `formatSprintTime(1000)` → `'00:01.000'`.
3. `formatSprintTime(61234)` → `'01:01.234'`.
4. `formatSprintTime(3600000)` → `'60:00.000'` (edge: no hours wrap).
5. `loadSprintPB()` returns `null` when key is absent.
6. `saveSprintPB(5000)` then `loadSprintPB()` returns `5000`.
7. `saveSprintPB` then `saveSprintPB` (overwrite) — `loadSprintPB()` returns
   the latest value.
8. `loadSprintPB()` returns `null` when key is set to a non-numeric string.
9. `loadSprintPB()` does not throw when localStorage throws (stub throws).
10. `saveSprintPB()` does not throw when localStorage throws (stub throws).

**Acceptance criteria:** All ten cases pass.

**Dependencies:** Task 06.

---

## Task 13 — [tests] Update `mainMenu.test.ts` for Sprint button

**File:** `src/__tests__/ui/mainMenu.test.ts` — MODIFY

1. Update the comment in the "returns [GameAction.Start] after Play button
   pointerup" test: button at index 0 is now labelled "MARATHON" (not "PLAY").
   The behaviour (pushes `GameAction.Start`) is unchanged.
2. Update the existing Exit button index comment: was index 2
   (PLAY + MONOCHROME + EXIT), now index 3 (MARATHON + MONOCHROME + SPRINT +
   EXIT).
3. Update the interactive count assertion in the Exit test:
   `interactives[3]?.emit('pointerup')` (index shifts by one due to Sprint
   button insertion between MONOCHROME and EXIT).
4. Add a new `describe('MainMenu — onSprintStart callback')` block:
   - `onSprintStart` is invoked when Sprint button (index 2) emits `pointerup`.
   - `onSprintStart` is NOT invoked when MARATHON or EXIT is pressed.
   - Default `onSprintStart` (no-op) does not throw.

**Acceptance criteria:** All existing tests pass with updated indices; new
Sprint callback tests pass.

**Dependencies:** Task 07.

---

## Task 14 — [tests] Sprint overlay tests in `gameOverOverlay.test.ts`

**File:** `src/__tests__/ui/gameOverOverlay.test.ts` — MODIFY

Add a new `describe('GameOverOverlay — showSprint')` block. Mock `persistence.ts`
using `vi.mock('../../../engine/persistence.js', () => ({ formatSprintTime: (ms: number) => \`T:${ms}\` }))`.

Tests:
1. `showSprint(5000, false)` sets title text to `'SPRINT COMPLETE'`.
2. `showSprint(5000, false)` calls `formatSprintTime` (score text is formatted
   time, not raw ms — verified via the stub).
3. `showSprint(5000, false)` — pbText is not visible (isNewPB=false).
4. `showSprint(5000, true)` — pbText is visible (isNewPB=true).
5. `showSprint()` adds panelRoot to stage (same as `show()` does).
6. `hide()` after `showSprint()` removes panelRoot and resets title to
   `'GAME OVER'`.
7. `hide()` after `showSprint(5000, true)` hides pbText.

**Acceptance criteria:** All seven cases pass; existing `show()` tests
are unaffected.

**Dependencies:** Tasks 06, 09.

---

## Task 15 — [tests] HUD Sprint panel tests (new file)

**File:** `src/__tests__/ui/hud.test.ts` — CREATE

Use the same PixiJS mock pattern as `mainMenu.test.ts` (all mock class
definitions inside `vi.mock` factory). Mock `persistence.ts` via
`vi.mock('../../../engine/persistence.js', ...)`.

Tests:
1. `setPlayMode('sprint')` — sprint panel becomes visible; marathon panel is
   hidden.
2. `setPlayMode('marathon')` after `setPlayMode('sprint')` — marathon panel
   visible; sprint panel hidden.
3. `updateSprintTimer(61234)` updates timer text to the formatted string.
4. `update(state)` with `state.lines = 7` in sprint mode sets lines text to
   `'7 / 40'`.
5. `update(state)` in marathon mode does not change sprint lines text.
6. `resize()` does not throw in either mode.
7. `setVisible(false)` hides the container.

**Note:** `HUD` currently has no test file; this task creates it from scratch.
Mirror the mock scaffold from `mainMenu.test.ts` exactly.

**Acceptance criteria:** All seven cases pass.

**Dependencies:** Tasks 06, 08.

---

## Execution Order

```
01 → 02 → 03 → 04 → 05   (engine type and logic chain)
06                         (persistence, standalone)
07                         (MainMenu UI, standalone)
08 depends on 06           (HUD Sprint panel)
09 depends on 06           (GameOverOverlay)
10 depends on 02,05,06,07,08,09  (main.ts wiring)
11 depends on 02-05        (engine tests)
12 depends on 06           (persistence tests)
13 depends on 07           (mainMenu tests)
14 depends on 06,09        (gameOverOverlay tests)
15 depends on 06,08        (HUD tests)
```

Tasks 01–09 can be implemented file by file. Task 10 is a single coordinated
edit of `src/main.ts`. Tasks 11–15 are all independent of each other once their
source dependencies are complete.
