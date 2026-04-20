# Proposal: Sprint Mode (40-Line Challenge)

## Status
Proposed

## Problem Statement

The game currently offers only endless Marathon play. There is no goal-based challenge
with a clear win condition, no elapsed-time metric, and no short-session experience.
Players who want a quick, replayable challenge with a personal-best motivation have
nothing to aim for beyond an ever-growing score.

## Proposed Solution

Add Sprint mode: the player must clear exactly 40 lines as fast as possible. A
count-up timer starts on the first piece lock (not at game start) and stops the moment
the 40th line is confirmed cleared. The game-over overlay shows the final time formatted
as `MM:SS.mmm`. Personal best is stored in localStorage and surfaced on the overlay.

Sprint mode is selectable from the main menu alongside the existing Marathon mode. Both
modes share the same board, piece randomizer, rotation system, and pause/resume flow.
Sprint mode does not alter gravity progression or scoring — only the termination
condition changes.

## Acceptance Criteria

1. Main menu shows "Marathon" and "Sprint" options; selecting either starts the
   corresponding mode.
2. Selecting Sprint starts the game with the HUD showing `0 / 40` for lines and
   `00:00.000` for elapsed time. The score panel is hidden in Sprint.
3. Timer starts on the first `piece-lock` engine event, not when the mode starts.
4. Game ends immediately when the 40th line clears — the engine emits `sprint-complete`
   and transitions to `gameover`.
5. Game-over overlay shows final time as `MM:SS.mmm` in Sprint mode; score in Marathon
   mode (mode-parameterized display, same component).
6. Personal best persists across sessions via localStorage key `tetris_sprint_pb`
   (stored as a raw millisecond integer string).
7. If the run sets a new PB, the game-over overlay shows a "New Best!" indicator.
8. Pause (Escape / P) works identically in both modes.
9. Returning to the main menu resets all Sprint-specific state; no timer bleed.

## Non-Goals

- Online leaderboards or multi-player comparison.
- Countdown (Ultra / Blitz) timer variants.
- Replay recording or ghost playback.
- Difficulty scaling or gravity changes mid-sprint.
- Sprint leaderboard with initials entry (scores are time-based; the existing
  initials-entry flow is score-based and is not adapted for this change).

## Technical Considerations

- A `mode: 'marathon' | 'sprint'` field is added to `GameState`. The engine reads it
  to gate 40-line termination logic.
- `createGameState()` gains an optional `mode` parameter so callers can select mode at
  construction time; the default is `'marathon'` for full backward compatibility.
- A `timerStarted: boolean` flag in `GameState` lets the engine gate timer activation
  on the first lock event without requiring main.ts to track extra state.
- `GameEventType` gains a `'sprint-complete'` variant. The engine emits it (alongside
  `'game-over'`) when the 40th line clears in Sprint mode. `main.ts` uses it to
  distinguish Sprint game-over from Marathon game-over.
- Timer elapsed time is tracked in `main.ts` (not the engine) because it is wall-clock
  state, not deterministic game logic. The engine communicates timer start/stop via
  events.
- Sprint personal best read/write is isolated in a new `src/engine/persistence.ts` 
  module. The engine layer may import from it only for pure types; all localStorage
  calls happen in `persistence.ts`. `main.ts` calls `persistence.ts` directly.
- `HUD` gains a Sprint-mode display path (lines counter `0 / 40`, elapsed timer);
  Marathon path is unchanged.
- `GameOverOverlay` is parameterized by mode to show time vs score.
- `MainMenu` adds a Sprint button using the same `buildButton` helper already used for
  PLAY, RANKINGS, and EXIT.
- Import boundaries are not broken: `persistence.ts` lives in `src/engine/` and has
  zero imports (uses only `localStorage` global); all other layer rules are unchanged.
