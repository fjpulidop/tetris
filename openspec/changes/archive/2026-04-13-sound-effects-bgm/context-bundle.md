# Context Bundle: sound-effects-bgm

**Change name:** sound-effects-bgm
**Date:** 2026-04-13

---

## 1. Feature Overview

This change adds background music and sound effects to the falling-block puzzle game. A new `src/audio/` layer is created with a single `AudioManager` class that wraps Howler.js (MIT-licensed). The manager listens to two integration points already present in `main.ts`: the deduplicated action list (for player-input SFX: move, rotate, soft-drop, hard-drop) and the engine event stream returned by `updateGameState()` (for game-state SFX: piece lock, line clear variants 1–4, level up, game over). Background music loops during the 'playing' phase, pauses on 'paused', and stops on 'gameover' or 'intro'. A mute toggle button (`[M] MUTE` / `[M] UNMUTE`) is added to the existing HUD. All audio degrades gracefully when the browser blocks autoplay or when audio files are missing or empty.

---

## 2. Architecture

### How audio/ fits the four-layer design

The project enforces strict import boundaries via ESLint `no-restricted-imports`. The existing layers are:

```
input → main.ts → engine → renderer
                         → ui
```

`audio/` is a new peer layer sitting alongside `ui/`. It is wired exclusively through `main.ts` (the only file permitted to import across layers). The updated topology is:

```
input  → main.ts → engine → renderer
audio  →         → ui
```

**Allowed imports from `src/audio/`:**
- `src/engine/types.ts` — for `GameEvent`, `GameEventType`, `GameAction` (no other engine module)
- `howler` — the only npm runtime dependency added by this change
- Built-in TypeScript / DOM types

**Forbidden imports from `src/audio/`:**
- Any `src/engine/**` module other than `types.ts`
- `src/renderer/**`
- `src/input/**`
- `src/ui/**`

The ESLint override (Task 1) enforces this at lint time. The pattern set mirrors the existing `input/` layer override in `.eslintrc.cjs`.

---

## 3. Exact Changes Per File

### 3.1 `package.json`

Add to `"dependencies"`:
```json
"howler": "^2.2.4"
```

Add to `"devDependencies"`:
```json
"@types/howler": "^2.2.12"
```

Howler goes into `dependencies` (not `devDependencies`) because it is a runtime browser dependency. Vite bundles it into `dist/`.

Current `package.json` has three runtime dependencies: `@pixi/filter-bloom`, `@pixi/filter-glow`, `pixi.js`. Howler is the fourth.

---

### 3.2 `.eslintrc.cjs`

Insert a new override block inside the `overrides` array. The array currently has three items (engine/, renderer/, input/). Append the audio/ block after the input/ block, before the closing `]` of `overrides`. See tasks.md Task 1 step 3 for the exact block text.

The pattern set is conservative: it lists specific engine sub-module globs rather than blocking `../engine/**` wholesale, because `../engine/types.js` must remain importable.

---

### 3.3 `public/audio/` (new directory)

The `public/` directory does not currently exist. Create it with `public/audio/`. Place 24 empty placeholder files (12 base names × 2 formats):

| Base name | .ogg | .mp3 |
|---|---|---|
| bgm | bgm.ogg | bgm.mp3 |
| move | move.ogg | move.mp3 |
| rotate | rotate.ogg | rotate.mp3 |
| soft-drop | soft-drop.ogg | soft-drop.mp3 |
| hard-drop | hard-drop.ogg | hard-drop.mp3 |
| piece-lock | piece-lock.ogg | piece-lock.mp3 |
| line-clear-1 | line-clear-1.ogg | line-clear-1.mp3 |
| line-clear-2 | line-clear-2.ogg | line-clear-2.mp3 |
| line-clear-3 | line-clear-3.ogg | line-clear-3.mp3 |
| line-clear-4 | line-clear-4.ogg | line-clear-4.mp3 |
| level-up | level-up.ogg | level-up.mp3 |
| game-over | game-over.ogg | game-over.mp3 |

Vite serves everything in `public/` at the root URL. Howler requests `/audio/bgm.ogg` etc. The 0-byte placeholder files will cause Howler `onloaderror` warnings in development — this is expected and documented.

**Asset sourcing for production:** Replace placeholder files with real audio before shipping. Recommended CC0 / CC-BY sources:
- freesound.org (filter by CC0)
- opengameart.org (CC0 game audio packs)
- kenney.nl/assets/interface-sounds (CC0 — good for SFX)

---

### 3.4 `src/audio/audioManager.ts` (new file)

**Full public API surface:**

```typescript
export class AudioManager {
  constructor()
  onAction(action: GameAction): void
  onEvents(events: GameEvent[]): void
  onPhaseChange(phase: string): void
  mute(on: boolean): void
  isMuted(): boolean
}
```

**Internal state fields:**
- `private sounds: Map<string, Howl>` — keyed by SoundId const enum value (string at runtime)
- `private _muted: boolean = false`
- `private bgmSoundId: number | null = null` — Howler instance ID for the active BGM playback
- `private _hardDropThisTick: boolean = false` — per-tick flag; set in `onAction`, consumed and cleared at start of `onEvents`

**Sound catalog construction:** Each `Howl` is built with:
```typescript
new Howl({
  src: ['/audio/<name>.ogg', '/audio/<name>.mp3'],
  loop: false,      // true only for BGM
  volume: 1.0,      // 0.5 for BGM
  preload: true,
  onloaderror: (_id, err) => console.warn(`AudioManager: failed to load <name>`, err),
})
```

**`onAction` logic** (called before `updateGameState` in main.ts):

| Action | Sound played |
|---|---|
| `MoveLeft`, `MoveRight` | Move |
| `RotateCW`, `RotateCCW` | Rotate |
| `SoftDrop` | SoftDrop |
| `HardDrop` | HardDrop, and sets `_hardDropThisTick = true` |

Guard: if `_muted`, return immediately without playing.

**`onEvents` logic** (called after `updateGameState` in main.ts):

At entry: `const hadHardDrop = this._hardDropThisTick; this._hardDropThisTick = false`.

| Event type | Condition | Action |
|---|---|---|
| `'piece-lock'` | `!hadHardDrop` | play PieceLock (suppressed after HardDrop to avoid double lock sound) |
| `'line-clear'` | always | cast `event.payload as { count: number }`, play LineClear1–4 |
| `'level-up'` | always | play LevelUp |
| `'game-over'` | always | play GameOver; call `bgm.stop(bgmSoundId)`, set `bgmSoundId = null` |

Line-clear count mapping: `count === 1` → LineClear1, `count === 2` → LineClear2, `count === 3` → LineClear3, `count >= 4` → LineClear4. The engine emits the payload as `{ count: clearedCount, rows: fullRows }` (confirmed in `gameState.ts` lines 254 and 329).

**`onPhaseChange` logic:**

| Phase | BGM action |
|---|---|
| `'playing'` | if `bgmSoundId === null`: `bgmSoundId = bgm.play()` |
| `'paused'` | `bgm.pause(bgmSoundId ?? undefined)` |
| `'gameover'` | `bgm.stop(bgmSoundId ?? undefined)`, `bgmSoundId = null` |
| `'intro'` | `bgm.stop(bgmSoundId ?? undefined)`, `bgmSoundId = null` |

Tracking `bgmSoundId` is necessary because Howler allows multiple concurrent instances of the same `Howl`; without the ID, `.pause()` would affect all instances.

---

### 3.5 `src/ui/hud.ts`

**Current state (as read from file):**

The `HUD` class spans lines 1–184. The panel background is drawn in `layoutElements()` at line 93 with hardcoded height `280`. The last element positioned is `this.nextPreview` (line 127–128).

**Changes:**

1. Add three private fields after `private nextPreview: Graphics` (line 30):
   ```typescript
   private muteButton: Text
   private _onMuteToggle: ((muted: boolean) => void) | null = null
   private _muted = false
   ```

2. In the constructor, after `this.container.addChild(this.nextPreview)` in the child-registration loop (the loop ends at line 70), add:
   ```typescript
   const muteStyle = new TextStyle({ fill: 0xffffff, fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold' })
   this.muteButton = new Text({ text: '[M] MUTE', style: muteStyle })
   this.muteButton.eventMode = 'static'
   this.muteButton.cursor = 'pointer'
   this.muteButton.on('pointerup', () => {
     this._muted = !this._muted
     this.updateMuteLabel()
     this._onMuteToggle?.(this._muted)
   })
   this.container.addChild(this.muteButton)
   ```

3. In `layoutElements()` (line 82), change panel height `280` → `320` on line 93.

4. After `this.nextPreview.y = y` (line 128), add:
   ```typescript
   y += 60
   this.muteButton.x = pad
   this.muteButton.y = y
   ```

5. Add two new public methods after `setVisible()` (after line 163):
   ```typescript
   setOnMuteToggle(callback: (muted: boolean) => void): void {
     this._onMuteToggle = callback
   }

   setMuted(muted: boolean): void {
     this._muted = muted
     this.updateMuteLabel()
   }
   ```

6. Add private helper before `drawNextPiecePreview`:
   ```typescript
   private updateMuteLabel(): void {
     this.muteButton.text = this._muted ? '[M] UNMUTE' : '[M] MUTE'
   }
   ```

---

### 3.6 `src/main.ts`

**Current state (as read from file):**

- UI imports end at line 36 (`import { GameAction } from './engine/types.js'`).
- `const pauseModal = new PauseModal(modalContainer)` is at line 80.
- `handleResize()` is called at line 158.
- The `while (accumulator >= LOGIC_TICK_MS)` loop body starts at line 336.
- `const allActions = ...` is at line 349.
- `const result = updateGameState(...)` is at line 353.
- `if (result.events.length > 0)` block is at lines 365–367.
- `intro → playing` transition block is at lines 358–362.
- `justPaused` block starts at line 377.
- `justResumed` block starts at line 388.
- `navigateToTitle()` starts at line 296.
- `restartGame()` starts at line 273.

**Changes:**

**a) Import (after line 36):**
```typescript
// Audio
import { AudioManager } from './audio/audioManager.js'
```

**b) Instantiation (after line 80, after `const pauseModal = ...`):**
```typescript
const audioManager = new AudioManager()
hud.setOnMuteToggle((muted: boolean) => {
  audioManager.mute(muted)
  hud.setMuted(muted)
})
hud.setMuted(audioManager.isMuted())
```

**c) Inside while-loop — action SFX, before `updateGameState` call (line 353):**
```typescript
for (const action of allActions) {
  audioManager.onAction(action)
}
```

**d) Inside while-loop — event SFX, modify the events block (lines 365–367):**
```typescript
if (result.events.length > 0) {
  effectsRenderer.onEvents(result.events)
  audioManager.onEvents(result.events)   // add this line
}
```

**e) Inside while-loop — intro → playing transition (line 358):**
```typescript
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  audioManager.onPhaseChange('playing')   // add this line first
  splashScreen?.destroy()
  splashScreen = null
  hud.setVisible(true)
}
```

**f) Phase-transition edge detection — justPaused block (line 377):**
```typescript
if (justPaused) {
  audioManager.onPhaseChange('paused')   // add as first statement
  pauseSelectedIndex = 0
  applyPauseBlur()
  pauseModal.show(pauseSelectedIndex)
  if (removePauseKeyListener === null) {
    removePauseKeyListener = attachPauseKeyListener()
  }
}
```

**g) Phase-transition edge detection — justResumed block (line 388):**
```typescript
if (justResumed) {
  audioManager.onPhaseChange('playing')  // add as first statement
  removePauseBlur()
  pauseModal.hide()
  if (removePauseKeyListener !== null) {
    removePauseKeyListener()
    removePauseKeyListener = null
  }
}
```

**h) `navigateToTitle()` — first statement of function body (line 296):**
```typescript
function navigateToTitle(): void {
  audioManager.onPhaseChange('intro')   // add as first statement
  const freshState = createGameState()
  // ...
}
```

**i) `restartGame()` — first statement of function body (line 273):**
```typescript
function restartGame(): void {
  audioManager.onPhaseChange('playing')  // add as first statement
  removePauseBlur()
  // ...
}
```

---

## 4. Integration Points

### Data flow diagram

```
User gesture (keyboard / touch)
        │
        ▼
main.ts: const allActions = deduplicateActions(...)
        │
        ├──→ for each action: audioManager.onAction(action)
        │       └─ plays: move / rotate / softDrop / hardDrop SFX
        │
        ▼
updateGameState(state, allActions, LOGIC_TICK_MS)
        │
        ▼
result.events[]
        │
        ├──→ effectsRenderer.onEvents(result.events)   [existing]
        └──→ audioManager.onEvents(result.events)       [new]
                └─ plays: pieceLock / lineClear / levelUp / gameOver SFX
                   stops BGM on game-over

Phase-change edge detection (after while loop)
        │
        ├──→ justPaused  → audioManager.onPhaseChange('paused')   → bgm.pause()
        └──→ justResumed → audioManager.onPhaseChange('playing')  → bgm.play()/resume

navigateToTitle()  → audioManager.onPhaseChange('intro')   → bgm.stop()
restartGame()      → audioManager.onPhaseChange('playing') → bgm.play()
intro→playing (while loop) → audioManager.onPhaseChange('playing') → bgm.play()

HUD mute button pointerup
        └──→ audioManager.mute(on) → Howler.mute(on)  [global gain node]
```

### Why `onAction` is called before `updateGameState`

`main.ts` already has the deduplicated action list assembled at line 349 before passing it to the engine. Calling `audioManager.onAction()` here costs nothing and avoids any need to inspect engine output for player-intent SFX. If `onAction` were called after `updateGameState`, move and rotate sounds would fire even if the engine rejected the move (e.g., rotation blocked by wall). The current design fires SFX optimistically — this matches the feel of most commercial implementations where audio feedback is immediate rather than gated on physical success. This is an intentional design decision (see design.md §8 Decision 3).

### The `_hardDropThisTick` flag

When the player hard-drops, the engine emits both a `HardDrop` action (intercepted in `onAction`) and a `piece-lock` event (emitted by `updateGameState`). Playing both the hard-drop SFX and the piece-lock SFX simultaneously would sound wrong. The `_hardDropThisTick` flag, set in `onAction` and consumed-and-cleared at the top of `onEvents`, ensures the PieceLock sound is suppressed exactly for the tick where a HardDrop was processed. The flag is always cleared at the start of `onEvents` regardless of whether there are events to process.

---

## 5. Dependencies

### Howler.js

- **Package:** `howler` (runtime) + `@types/howler` (dev)
- **License:** MIT
- **Version:** `^2.2.4` (latest stable as of 2026-04)
- **Bundle impact:** ~30 KB gzipped. Vite tree-shakes the build; only `Howl` and `Howler` (global) are used.
- **Web Audio API:** Howler creates a single `AudioContext` on first `play()` call, which satisfies browser autoplay policy naturally — the context is only created after a user gesture.
- **Format negotiation:** The `src` array `['.ogg', '.mp3']` lets Howler pick the first format the browser supports. Chrome, Firefox, and Edge support OGG Vorbis natively. Safari (pre-2019) does not support OGG; the `.mp3` fallback handles Safari.
- **Global mute:** `Howler.mute(true)` sets the global `AudioContext` gain node to 0 immediately, silencing all sounds without stopping playback position.

### No other new dependencies

The `@types/howler` package provides TypeScript declarations for the `Howl` class and `HowlOptions` interface. It is a pure type package (`devDependencies`) and has zero runtime cost.

---

## 6. Edge Cases

### Autoplay policy

Modern browsers block `AudioContext.resume()` unless called from within a user gesture handler. Howler handles this transparently: if `play()` is called before a gesture, Howler queues the sound internally and plays it when the context is unlocked. In this game, the first user gesture is the Enter key or tap on the splash screen (the `GameAction.Start` action). The intro → playing transition triggers `audioManager.onPhaseChange('playing')`, which calls `bgm.play()`. Since this call happens in the same tick that processed the Enter key, the AudioContext is already unlocked. **No special unlock logic is needed** beyond what Howler provides.

If autoplay remains blocked (e.g., user has blocked audio site-wide in browser settings): Howler logs a warning internally, `play()` returns `0`, and `bgmSoundId` is set to `0`. Subsequent `pause(0)` and `stop(0)` calls are no-ops. No exception is thrown; the game runs silently.

### Missing or empty audio files (development)

The placeholder files in `public/audio/` are 0 bytes. Howler will attempt to decode them, fail, and call the `onloaderror` callback with an error. The callback calls `console.warn` and does nothing else. The associated `Howl.play()` calls after that point return `0` silently (Howler marks the sound as errored and skips playback). The game runs without audio in this state. No uncaught exceptions occur.

### Calling `onPhaseChange('playing')` when BGM is already playing

The `bgmSoundId !== null` guard in `onPhaseChange('playing')` prevents double-starting BGM. This matters for the `justResumed` path: when the player resumes from pause via the keyboard (Escape), the engine toggles `paused → playing` directly, which the game loop detects as `justResumed` and calls `onPhaseChange('playing')`. Without the guard, this would start a second concurrent BGM instance on top of the one that was merely paused.

Note: after a `bgm.pause(bgmSoundId)` call, the Howl is paused but `bgmSoundId` still holds the instance ID. `onPhaseChange('playing')` detects `bgmSoundId !== null` and must call `bgm.play(bgmSoundId)` (passing the existing ID to resume), not `bgm.play()` (which starts a new instance). Adjust the implementation accordingly:

```typescript
case 'playing':
  if (this.bgmSoundId === null) {
    this.bgmSoundId = this.sounds.get(SoundId.BGM)!.play() as number
  } else {
    // Resume paused instance
    this.sounds.get(SoundId.BGM)!.play(this.bgmSoundId)
  }
  break
```

### `restartGame()` while 'playing' (rapid restart)

If the player opens the pause menu during gameplay and selects RESTART, `restartGame()` is called, which fires `audioManager.onPhaseChange('playing')`. At that point the BGM `bgmSoundId` is non-null (BGM was playing). The `bgmSoundId !== null` branch calls `bgm.play(bgmSoundId)` — but the BGM was not paused, it was still playing. Calling `play(id)` on an already-playing Howl instance is a no-op in Howler. This is safe.

However, the design intent is that `restartGame()` restarts the music from the beginning. To achieve this, `restartGame()` should first call `audioManager.onPhaseChange('intro')` (which stops BGM and clears `bgmSoundId`), then `audioManager.onPhaseChange('playing')` (which starts fresh). Adjust task 5 step i:

```typescript
function restartGame(): void {
  audioManager.onPhaseChange('intro')    // stop BGM, reset bgmSoundId
  audioManager.onPhaseChange('playing')  // restart BGM from beginning
  removePauseBlur()
  // ...
}
```

### Mute state not persisted across sessions

This is intentional and documented in the proposal as out of scope. The game always starts unmuted. A future settings screen can add `localStorage` persistence.

---

## 7. Testing Notes

### Automated tests

No new automated tests are required. `AudioManager` depends on Howler's `AudioContext` and the Web Audio API, which are not available in jsdom (the test environment) without significant mocking. The existing test suite (`src/__tests__/`) covers `src/engine/**` only; this change makes no engine modifications.

Verify pre-existing tests still pass after all tasks are complete:
```
npm run test
```
Expected: all tests pass, coverage threshold (`80% branch`, `src/engine/**`) still met.

### Manual test checklist

Execute in Chrome with devtools console open. Expect `console.warn` messages about failed audio loads (placeholder files) — these are correct and do not indicate a bug.

| # | Step | Expected result |
|---|---|---|
| 1 | Open game; press Enter at splash screen | No uncaught exceptions. BGM `play()` called (visible in console via `onloaderror` chain). |
| 2 | Press P | BGM `pause()` called. Game shows pause modal. |
| 3 | Press Enter (Resume) | BGM `play(id)` called (resume). Game resumes. |
| 4 | Move piece left/right | No console error. |
| 5 | Rotate piece | No console error. |
| 6 | Hard-drop a piece | HardDrop SFX called. No duplicate PieceLock SFX (verify `_hardDropThisTick` logic). |
| 7 | Let a piece lock via gravity | PieceLock SFX called. |
| 8 | Clear 1 line | LineClear1 called. |
| 9 | Clear 4 lines (Tetris) | LineClear4 called (not LineClear1). |
| 10 | Reach level 2 | LevelUp SFX called. |
| 11 | Game over condition | GameOver SFX called. BGM stopped. |
| 12 | Pause → Return to Title Screen | BGM stopped (via `navigateToTitle` → `onPhaseChange('intro')`). Splash screen reappears. |
| 13 | Pause → Restart | BGM restarts from beginning. Game in fresh state. |
| 14 | Click `[M] MUTE` | Button label changes to `[M] UNMUTE`. All audio silenced. |
| 15 | Click `[M] UNMUTE` | Button label returns to `[M] MUTE`. Audio resumes. |
| 16 | Block audio in chrome://settings; reload | Game runs without uncaught exceptions. `console.warn` from Howler is acceptable. |

### Build verification

```
npm run build
```

Confirm:
- Exit code 0
- `dist/audio/` directory present with 24 files
- TypeScript compilation reports no errors
