# Design: Sprint Mode (40-Line Challenge)

## Overview

Sprint mode is a goal-based variant of the existing game loop. It shares all piece,
board, rotation, and scoring logic with Marathon. The only differences are:

1. The game terminates when 40 total lines have been cleared, not when the board tops
   out.
2. An elapsed-time timer is surfaced in the HUD and on the game-over overlay.
3. A personal-best value is read and written from localStorage.

The design minimises change surface by extending existing data structures and keeping
all mode-selection logic in `main.ts` and the UI layer.

---

## Data Model Changes

### `GameState` (src/engine/gameState.ts)

Add two fields:

```typescript
/** Which game mode is running. */
mode: 'marathon' | 'sprint'

/**
 * True once the first piece has been locked in Sprint mode.
 * Used by main.ts to know when to start the wall-clock timer.
 * Always false in Marathon; irrelevant after the first lock.
 */
timerStarted: boolean
```

`createGameState()` gains an optional parameter:

```typescript
export function createGameState(mode: 'marathon' | 'sprint' = 'marathon'): GameState
```

The new fields are initialised as:

```typescript
mode,
timerStarted: false,
```

### `GameEventType` (src/engine/types.ts)

Add one new variant:

```typescript
| 'sprint-complete'
```

The engine emits `sprint-complete` (then immediately emits `game-over`) when
`state.mode === 'sprint'` and `lines >= 40` after a lock. This gives `main.ts` an
unambiguous signal to stop the timer and branch the game-over overlay display.

---

## Component Interactions

```
main.ts
  │ createGameState('sprint')
  │ ─── on first 'piece-lock' event ───► start wall-clock timer
  │ ─── on 'sprint-complete' event ────► stop timer; record finalTimeMs
  │ ─── on 'game-over' event ──────────► show SprintGameOverOverlay or MarathonGameOverOverlay
  │
  ├── engine/gameState.ts
  │     updateGameState(): sees mode='sprint'; when lines≥40 after lock,
  │       sets phase='gameover', emits 'sprint-complete' + 'game-over'
  │
  ├── engine/persistence.ts  (new)
  │     loadSprintPB(): number | null
  │     saveSprintPB(ms: number): void
  │
  ├── ui/mainMenu.ts
  │     adds Sprint button; onSprintStart callback
  │
  ├── ui/hud.ts
  │     Sprint display: '0 / 40' lines counter + 'MM:SS.mmm' timer text
  │     Marathon display: unchanged
  │
  └── ui/gameOverOverlay.ts
        show() overloaded by mode:
          marathon: shows score + lines  (existing)
          sprint:   shows final time + "New Best!" if applicable
```

---

## Engine Changes in Detail

### processLock (internal helper)

After updating `currentLines`, add a Sprint termination check:

```
if mode === 'sprint' AND currentLines >= 40:
  cap currentLines at 40          // never exceed 40
  emit 'sprint-complete'
  return { ..., phase: 'gameover', termination: 'sprint' }
```

The function already returns a `LockResult`. We need the caller (`updateGameState`)
to recognise the termination signal and transition phase to `gameover` immediately,
skipping the normal piece-spawn / top-out check.

Concretely, `processLock` returns an additional field:

```typescript
interface LockResult {
  // ... existing fields ...
  sprintComplete: boolean   // true iff mode=sprint AND lines hit 40
}
```

In both hard-drop and gravity-lock branches of `updateGameState`, after calling
`processLock`, check `lockResult.sprintComplete`. If true, skip spawning the next
piece and return immediately with `phase: 'gameover'`.

### timerStarted flag

After the very first `piece-lock` event in Sprint mode, `updateGameState` sets
`timerStarted: true` in the returned state. `main.ts` detects the leading edge of
`timerStarted` (was false, now true) and starts the wall-clock timer.

Implementation: inside both lock branches, after `events.push({ type: 'piece-lock' })`,
if `state.mode === 'sprint' && !state.timerStarted`:

```typescript
timerStarted = true
// The 'piece-lock' event already pushed above signals main.ts
```

`main.ts` checks `prevState.timerStarted === false && newState.timerStarted === true`
to detect the edge.

---

## Timer Tracking in main.ts

The elapsed timer is wall-clock state (not deterministic game logic), so it lives in
`main.ts`.

```typescript
let sprintTimerRunning = false
let sprintElapsedMs = 0
let sprintLastTickTime = 0
```

On `timerStarted` leading edge:
```
sprintTimerRunning = true
sprintLastTickTime = performance.now()
```

Each render frame (in the `loop` function), after the fixed-timestep accumulator:
```
if sprintTimerRunning:
  sprintElapsedMs += now - sprintLastTickTime
  sprintLastTickTime = now
```

On `sprint-complete` event:
```
sprintTimerRunning = false
finalSprintTimeMs = sprintElapsedMs
```

On `navigateToTitle()` or `restartGame()`:
```
sprintTimerRunning = false
sprintElapsedMs = 0
finalSprintTimeMs = 0
```

---

## Time Formatting

Utility function (lives in `src/engine/persistence.ts` or a dedicated
`src/ui/sprintTimer.ts` — see delta-spec for the chosen location):

```typescript
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

## persistence.ts (new file)

`src/engine/persistence.ts` — zero imports (uses `localStorage` global only).

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
```

`formatSprintTime` is co-located here since it is pure and timer-domain logic.

---

## MainMenu Changes

`MainMenu` currently has: PLAY, RANKINGS, EXIT buttons (post-leaderboard spec).

For Sprint mode, the menu needs a mode-selection step. Two design options were
considered:

**Option A** — Flat menu: four buttons (MARATHON, SPRINT, RANKINGS, EXIT).
**Option B** — Two-step: PLAY opens a sub-screen with MARATHON / SPRINT.

Option A is chosen. It is simpler, requires zero new modal/navigation classes, and fits
well with the existing `buildButton` helper. Button vertical spacing is adjusted to
accommodate four items.

`MainMenu` adds:
- `onSprintStart: () => void` public callback field.
- `sprintButton: Container` private field.
- `buildButton('SPRINT')` wired to `onSprintStart`.
- Updated `resize()` layout for four buttons.

---

## HUD Changes

`HUD` adds a Sprint display panel that is toggled visible/hidden based on mode.

Sprint panel elements:
- `sprintLinesLabel: Text` — static label `'LINES'`
- `sprintLinesValue: Text` — dynamic value `'0 / 40'`
- `sprintTimerLabel: Text` — static label `'TIME'`
- `sprintTimerValue: Text` — dynamic value `'00:00.000'`

Marathon panel elements: unchanged (score, level, lines, chain, next-piece preview).

`HUD` gains:
- `setMode(mode: 'marathon' | 'sprint'): void` — shows/hides respective panels.
- `updateSprintTimer(ms: number): void` — called each render frame by `main.ts`.

The Sprint panel occupies the same vertical space as the score+level block in Marathon.
The score display is hidden in Sprint mode.

---

## GameOverOverlay Changes

`show()` gains an overload for Sprint mode:

```typescript
// Marathon (existing — backward compatible, onSaveScore optional)
show(score: number, lines: number, onSaveScore?: (score: number) => void): void

// Sprint (new overload)
showSprint(finalTimeMs: number, isNewPB: boolean): void
```

`showSprint` sets:
- `titleText.text = 'SPRINT COMPLETE'`
- `scoreText.text = formatSprintTime(finalTimeMs)`
- An additional `pbText: Text` visible only when `isNewPB === true`, text `'New Best!'`

`hide()` already handles removal idempotently; no change needed.

`resize()` is updated to position `pbText` below `scoreText`.

---

## Pseudocode: Sprint Termination in updateGameState

```
// Inside processLock(), after currentLines += clearedCount:
if (state.mode === 'sprint' && currentLines >= SPRINT_TARGET) {
  currentLines = SPRINT_TARGET              // cap at exactly 40
  events.push({ type: 'sprint-complete' })
  return {
    board: currentBoard, score: currentScore,
    lines: currentLines, level: currentLevel,
    chargedCells: currentCharged,
    chainDepth: currentChainDepth, chainTimer: currentChainTimer,
    sprintComplete: true,
    events,
  }
}

// In updateGameState, hard-drop branch:
const lockResult = processLock(...)
if (lockResult.sprintComplete) {
  events.push(...lockResult.events)
  events.push({ type: 'game-over' })
  return {
    state: {
      ...state,
      board: lockResult.board,
      activePiece: null,
      score: lockResult.score,
      lines: lockResult.lines,
      level: lockResult.level,
      phase: 'gameover',
      timerStarted: state.timerStarted,
      mode: state.mode,
      // ...remaining fields
    },
    events,
  }
}
// (same guard in gravity-lock branch)
```

---

## Import Boundary Compliance

| File | Imports from | Permitted? |
|---|---|---|
| `src/engine/persistence.ts` | (none) | Yes |
| `src/engine/gameState.ts` | `./persistence.js` | Yes — same layer |
| `src/ui/hud.ts` | `../engine/persistence.js` (for `formatSprintTime`) | Yes — ui may import engine |
| `src/ui/gameOverOverlay.ts` | `../engine/persistence.js` (for `formatSprintTime`) | Yes |
| `src/main.ts` | all layers | Yes — main.ts is the only cross-layer importer |
| `src/ui/mainMenu.ts` | `../engine/types.js` only | Yes — no new cross-layer import |

`persistence.ts` does NOT import from `renderer/`, `input/`, or `ui/` — boundary
preserved.
