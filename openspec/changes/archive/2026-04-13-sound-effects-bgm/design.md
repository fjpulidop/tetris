# Design: Add Sound Effects and Background Music

**Change name:** sound-effects-bgm
**Date:** 2026-04-13

---

## 1. Scope of Change

This change introduces one new layer (`src/audio/`) and modifies two existing files (`src/main.ts`, `src/ui/hud.ts`). No engine, renderer, or input files are touched.

| File | Change type | Summary |
|---|---|---|
| `src/audio/audioManager.ts` | Create | New AudioManager class wrapping Howler.js |
| `src/ui/hud.ts` | Modify | Add mute toggle button; expose `setMuted(on: boolean)` |
| `src/main.ts` | Modify | Import AudioManager; wire onEvents, onPhaseChange, onAction, mute callback |
| `.eslintrc.cjs` | Modify | Add import-boundary rule for `audio/` layer |
| `public/audio/` | Create | Placeholder `.ogg` and `.mp3` files (10 SFX + 1 BGM) |
| `package.json` | Modify | Add `howler` and `@types/howler` dependencies |

---

## 2. New Layer: `src/audio/`

### 2.1 Layer boundary

The `audio/` layer follows the same import-boundary principle as every other layer:

- **Allowed imports:** `src/engine/types.ts` (for `GameEvent`, `GameEventType`, `GameAction`), `howler` (npm package), built-in TypeScript/DOM types.
- **Forbidden imports:** `src/engine/**` (except `types.ts`), `src/renderer/**`, `src/input/**`, `src/ui/**`.

`main.ts` remains the only file that imports across all layers. It imports `AudioManager` from `src/audio/audioManager.ts` and wires it to the game loop.

The ESLint `no-restricted-imports` override for `src/audio/**` must be added to `.eslintrc.cjs`. The pattern set mirrors the existing `input/` layer rule.

### 2.2 AudioManager class

**File:** `src/audio/audioManager.ts`

#### Constructor

```typescript
constructor()
```

Instantiates all `Howl` objects for every sound. Howler preloads audio buffers at construction time. The audio context is not yet started — Howler defers context creation until the first `play()` call, which naturally satisfies browser autoplay policy because `play()` is never called before the first user gesture.

#### Sound catalog

All sounds are keyed by a string enum `SoundId` defined in the same file (not exported — it is an implementation detail).

```typescript
const enum SoundId {
  BGM         = 'bgm',
  Move        = 'move',
  Rotate      = 'rotate',
  SoftDrop    = 'softDrop',
  HardDrop    = 'hardDrop',
  PieceLock   = 'pieceLock',
  LineClear1  = 'lineClear1',
  LineClear2  = 'lineClear2',
  LineClear3  = 'lineClear3',
  LineClear4  = 'lineClear4',
  LevelUp     = 'levelUp',
  GameOver    = 'gameOver',
}
```

Each `SoundId` maps to a `Howl` instance stored in a `Map<SoundId, Howl>`. This is initialized in the constructor.

#### Audio files

All files reside in `public/audio/`. Howler resolves them relative to the page root at runtime, which is correct for Vite's static asset serving.

| SoundId | File (primary) | File (fallback) |
|---|---|---|
| BGM | `public/audio/bgm.ogg` | `public/audio/bgm.mp3` |
| Move | `public/audio/move.ogg` | `public/audio/move.mp3` |
| Rotate | `public/audio/rotate.ogg` | `public/audio/rotate.mp3` |
| SoftDrop | `public/audio/soft-drop.ogg` | `public/audio/soft-drop.mp3` |
| HardDrop | `public/audio/hard-drop.ogg` | `public/audio/hard-drop.mp3` |
| PieceLock | `public/audio/piece-lock.ogg` | `public/audio/piece-lock.mp3` |
| LineClear1 | `public/audio/line-clear-1.ogg` | `public/audio/line-clear-1.mp3` |
| LineClear2 | `public/audio/line-clear-2.ogg` | `public/audio/line-clear-2.mp3` |
| LineClear3 | `public/audio/line-clear-3.ogg` | `public/audio/line-clear-3.mp3` |
| LineClear4 | `public/audio/line-clear-4.ogg` | `public/audio/line-clear-4.mp3` |
| LevelUp | `public/audio/level-up.ogg` | `public/audio/level-up.mp3` |
| GameOver | `public/audio/game-over.ogg` | `public/audio/game-over.mp3` |

#### Howl construction pattern

```typescript
private sounds: Map<SoundId, Howl> = new Map()

private buildHowl(id: SoundId, opts: HowlOptions): void {
  this.sounds.set(id, new Howl(opts))
}
```

BGM is constructed with `loop: true`, `volume: 0.5`, and `preload: true`. SFX are constructed with `loop: false`, `volume: 1.0`, and `preload: true`. Howler's `onloaderror` callback is wired to a `console.warn` for each sound so missing or corrupt files do not throw uncaught exceptions.

#### `onEvents(events: GameEvent[]): void`

Called by `main.ts` each logic tick with the events returned by `updateGameState()`.

```
for each event in events:
  if event.type === 'piece-lock': play(PieceLock) — but only if hard drop did NOT already trigger it this tick (see §2.3)
  if event.type === 'line-clear':
    count = (event.payload as { count: number }).count
    play(LineClear1 | LineClear2 | LineClear3 | LineClear4) based on count
  if event.type === 'level-up': play(LevelUp)
  if event.type === 'game-over': play(GameOver); stop BGM
```

The `line-clear` payload already carries `count` (see `gameState.ts` — `{ count: clearedCount, rows: fullRows }`). The cast is safe because the engine always sets it when emitting `line-clear`.

#### `onAction(action: GameAction): void`

Called by `main.ts` for specific player-initiated actions that need SFX but do not produce engine events. This method is called once per action in the deduplicated action list, before the engine tick.

```
GameAction.MoveLeft | MoveRight → play(Move)
GameAction.RotateCW | RotateCCW → play(Rotate)
GameAction.SoftDrop → play(SoftDrop)
GameAction.HardDrop → play(HardDrop)
```

Note: `HardDrop` also triggers a `piece-lock` engine event. The `onEvents` handler must suppress the `PieceLock` sound when a `HardDrop` action was processed in the same tick to avoid playing two "lock" sounds simultaneously. This is tracked with a per-tick `hardDropOccurred` flag set in `onAction` and cleared at the start of `onEvents`.

#### `onPhaseChange(phase: string): void`

Called by `main.ts` on every phase transition edge (when `phase !== prevPhase`).

```
'playing' → start/resume BGM (if not already playing)
'paused'  → pause BGM
'gameover' → stop BGM (sound position is lost; game-over SFX plays via onEvents)
'intro'   → stop BGM (navigateToTitle resets to intro)
```

Howler provides `.play()`, `.pause()`, `.stop()` on `Howl` instances. BGM uses `.pause()` for the pause transition and `.stop()` for game-over and title navigation, so on resume the music restarts from the beginning (which is the intended behavior for a short looping track).

Internally, the AudioManager tracks a `bgmSoundId: number | null` — the Howler instance ID returned by `bgm.play()`. This is required because Howler allows multiple concurrent instances of the same Howl; tracking the ID ensures `.pause(bgmSoundId)` and `.stop(bgmSoundId)` target the correct instance.

#### `mute(on: boolean): void`

```typescript
mute(on: boolean): void {
  Howler.mute(on)
  this._muted = on
}
```

`Howler.mute(true)` is a global mute that silences all audio instantly without stopping playback position. The internal `_muted: boolean` field is used to prevent SFX from being triggered while muted (defense in depth — Howler would already silence them, but skipping the play call avoids wasting CPU on audio decoding).

#### `isMuted(): boolean`

Returns `this._muted`. Used by the HUD to render the button label correctly on initial load.

#### Graceful degradation

Every `play()` call is wrapped in a try/catch. If Howler has not been unlocked by a user gesture yet, `play()` returns 0 and Howler queues the sound internally for autoplay-policy replay — no exception is thrown. If a sound file fails to load (404 placeholder files in development), the `onloaderror` callback logs a warning and the sound is a no-op.

---

## 3. HUD Changes

### 3.1 Mute toggle button

The mute button is a PixiJS interactive text element appended to the existing HUD container, styled consistently with the HUD's existing monospace aesthetic.

**Position:** Bottom of the HUD panel, below the NEXT piece preview. This avoids repositioning any existing elements.

**Labels:**
- Unmuted: `[M] MUTE`
- Muted: `[M] UNMUTE`

The button uses `eventMode = 'static'` and `cursor = 'pointer'` to match the pattern established in `pauseModal.ts`. It uses `on('pointerup')` to trigger the toggle callback.

**New public API on `HUD`:**

```typescript
/** Register callback invoked when the player clicks the mute button. */
setOnMuteToggle(callback: (muted: boolean) => void): void

/** Update the button label to reflect the current mute state. */
setMuted(muted: boolean): void
```

`setOnMuteToggle` stores the callback; the button's `pointerup` handler flips the current muted state and calls the callback with the new value.

`setMuted` updates the label text to `[M] MUTE` or `[M] UNMUTE`. This is called once at startup (to match `audioManager.isMuted()`) and after each toggle.

**Layout:** The `layoutElements()` private method in `HUD` is extended to position the mute button below the existing content, within the same panel. The panel height is increased from 280px to 320px to accommodate the new element.

---

## 4. main.ts Wiring

Four integration points in `main.ts`:

### 4.1 Import

```typescript
import { AudioManager } from './audio/audioManager.js'
```

Added alongside the existing `HUD`, `SplashScreen`, `PauseModal` imports. Placed in the `// UI` import block since it is a peer layer wired in main.

Actually — `audio/` is its own layer distinct from `ui/`. The import should be placed in a new `// Audio` comment block after the UI imports for clarity.

### 4.2 Instantiation

```typescript
const audioManager = new AudioManager()
```

Constructed immediately after `new HUD(...)` and `new PauseModal(...)`. No constructor arguments required.

### 4.3 Mute button wiring

```typescript
hud.setOnMuteToggle((muted: boolean) => {
  audioManager.mute(muted)
  hud.setMuted(muted)
})
hud.setMuted(audioManager.isMuted())
```

This is placed immediately after `audioManager` is constructed, before `handleResize()` is called.

### 4.4 Action-driven SFX (within the logic tick while-loop)

Before the `updateGameState` call, extract the deduplicated actions and pass each audio-relevant action to `audioManager.onAction()`:

```typescript
const allActions = deduplicateActions([...bufferedActions, ...heldActions])

// Notify audio layer of player actions before engine processes them
for (const action of allActions) {
  audioManager.onAction(action)
}

const result = updateGameState(state, allActions, LOGIC_TICK_MS)
```

### 4.5 Event-driven SFX

Immediately after the existing `effectsRenderer.onEvents(result.events)` call:

```typescript
if (result.events.length > 0) {
  effectsRenderer.onEvents(result.events)
  audioManager.onEvents(result.events)
}
```

### 4.6 Phase change notification

In the phase-transition edge-detection block (after the while loop), add `audioManager.onPhaseChange(currentPhase)` calls at each relevant transition:

```typescript
if (justPaused) {
  audioManager.onPhaseChange('paused')
  // ... existing pause blur logic
}

if (justResumed) {
  audioManager.onPhaseChange('playing')
  // ... existing resume cleanup
}
```

For the `intro → playing` transition detected inside the while loop:

```typescript
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  audioManager.onPhaseChange('playing')
  splashScreen?.destroy()
  splashScreen = null
  hud.setVisible(true)
}
```

For `gameover` — detected via `result.events` containing a `game-over` event (already handled by `onEvents`), so no additional phase-change call is needed for game-over. However, `navigateToTitle()` resets to 'intro', so:

```typescript
function navigateToTitle(): void {
  audioManager.onPhaseChange('intro')
  // ... existing logic
}
```

Similarly for `restartGame()`, which transitions directly to 'playing':

```typescript
function restartGame(): void {
  audioManager.onPhaseChange('playing')
  // ... existing logic
}
```

---

## 5. Audio File Manifest

Placeholder files are created as empty files (0 bytes) in `public/audio/`. Howler will log load errors for 0-byte files during development; this is acceptable and documented. Real assets must be sourced before shipping.

Recommended open-license sources (documented in context-bundle):
- freesound.org (CC0 / CC-BY)
- opengameart.org (CC0)
- kenney.nl/assets/interface-sounds (CC0)

---

## 6. Dependency Changes

### 6.1 `npm install howler @types/howler`

Howler.js is MIT-licensed. `@types/howler` provides TypeScript type definitions. Both are runtime dependencies (Howler ships its own bundled code; Vite will include it in the output bundle via tree-shaking).

Howler is added to `dependencies` (not `devDependencies`) because it is required at runtime in the browser.

### 6.2 ESLint rule for `audio/` layer

New override block in `.eslintrc.cjs`:

```javascript
{
  files: ['src/audio/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['*/renderer/*', '../renderer/*', '../../renderer/*'],
            message: 'audio/ must not import from renderer/',
          },
          {
            group: ['*/input/*', '../input/*', '../../input/*'],
            message: 'audio/ must not import from input/',
          },
          {
            group: ['*/ui/*', '../ui/*', '../../ui/*'],
            message: 'audio/ must not import from ui/',
          },
          // engine/ sub-modules are restricted; engine/types.ts is allowed
          {
            group: ['../engine/gameState*', '../engine/board*', '../engine/pieces*',
                    '../engine/rotation*', '../engine/gravity*', '../engine/lineClear*'],
            message: 'audio/ may only import from engine/types.ts, not other engine modules',
          },
        ],
      },
    ],
  },
},
```

Note: The existing engine/types.ts import path is `../engine/types.js` (or `./engine/types.js` from src root). The restriction targets specific engine sub-modules, not the entire engine directory, because `types.ts` must remain importable.

---

## 7. Data Flow

```
User gesture (keyboard / touch)
         │
         ▼
main.ts: deduplicateActions()
         │
         ├──→ audioManager.onAction(action)  ← SFX: move, rotate, drop
         │
         ▼
updateGameState(state, actions, dt)
         │
         ▼
result.events[]
         │
         ├──→ effectsRenderer.onEvents()   ← existing
         └──→ audioManager.onEvents()      ← SFX: lock, line-clear, level-up, game-over
                    │
                    ▼
               Howler.play() → Web Audio API → speakers

Phase change edge detection
         │
         ├──→ audioManager.onPhaseChange('paused')  → BGM.pause()
         ├──→ audioManager.onPhaseChange('playing') → BGM.play() / resume
         └──→ audioManager.onPhaseChange('intro')   → BGM.stop()

HUD mute button pointerup
         │
         └──→ audioManager.mute(on) → Howler.mute(on)
```

---

## 8. Architectural Decisions

### Decision 1: New `src/audio/` layer rather than placing AudioManager in `src/ui/`

`ui/` is PixiJS-specific. `AudioManager` has no PixiJS dependency and no visual output. Placing it in `ui/` would create a conceptually mixed layer. A dedicated `audio/` layer gives it clear ownership, makes the import boundary unambiguous, and keeps `ui/` focused on visual overlay components.

### Decision 2: Howler.js over raw Web Audio API

The Web Audio API requires significant boilerplate for cross-browser compatibility: `AudioContext` unlock gestures differ between Safari, Chrome, and Firefox; format negotiation requires explicit `canPlayType` checks; and preloading requires manual fetch-and-decode logic. Howler encapsulates all of this correctly and is MIT-licensed. The abstraction cost (one additional npm dependency) is low relative to the implementation complexity it eliminates.

### Decision 3: `onAction()` for player SFX, not a new `GameEvent` type

Move, rotate, soft-drop, and hard-drop SFX could be triggered by adding new event types to `GameEventType` in `engine/types.ts`. This was rejected because: (a) the engine emits events for state changes that matter to the game, not for audio cues; (b) extending `GameEventType` would require changes to the engine layer, violating the principle that this feature has no engine changes; (c) `main.ts` already sees the deduplicated action list before passing it to the engine, making it the natural and zero-cost interception point. The `onAction()` method call is at most 12 actions per tick — the per-call overhead is negligible.

### Decision 4: Howler global mute via `Howler.mute()`, not per-sound volume

Setting volume to 0 on each sound individually would require iterating the sounds map and would not stop in-flight sounds from playing (volume change takes effect on next buffer fill). `Howler.mute(true)` silences the global AudioContext gain node immediately. This matches the acceptance criterion: "clicking silences all audio immediately without stopping playback position." Per-sound volume control is deferred to a future settings screen.

### Decision 5: BGM pauses (not stops) on game pause; stops on game-over and title navigate

The player expects music to resume from where it was when they unpaused. `Howl.pause()` preserves playback position. On game-over the game state is reset, so there is no meaningful "resume" — `Howl.stop()` is correct. On title navigation, a full stop is equally correct because the player is returning to the pre-game state. Starting from the beginning of the track in both cases creates a clean, consistent experience.

### Decision 6: Placeholder audio files rather than omitting `public/audio/`

Howler logs `onloaderror` but does not throw. However, if the `public/audio/` directory does not exist, Vite's build step will not copy it, and production will have no audio at all. Placeholder empty files ensure: (a) the directory is present in git, (b) Vite copies the directory structure, (c) developers can drop real assets in place without any code change. The 404 load errors in development are expected and documented.

---

## 9. Test Strategy

No new unit tests are required for this change under the current testing philosophy (the test suite covers the `src/engine/**` layer with 80% branch coverage threshold, and existing input tests). AudioManager is inherently browser/audio-context-dependent and difficult to unit-test without mocking Howler at the module level.

However, the following manual test checklist should be verified before merging:

1. Open game in Chrome; press Enter at splash screen; confirm BGM starts.
2. Press P (pause); confirm BGM pauses.
3. Unpause; confirm BGM resumes.
4. Let piece lock; confirm lock SFX plays.
5. Clear a line; confirm line-clear SFX plays (try 1, 2, 3, 4 lines).
6. Click mute button; confirm all audio silences immediately.
7. Click unmute; confirm audio resumes.
8. Hard drop; confirm hard-drop SFX plays (no duplicate lock sound).
9. Navigate to title from pause menu; confirm BGM stops.
10. Restart game from pause menu; confirm BGM restarts.
11. Block autoplay (chrome://settings → Content → Sound → Block); open game; confirm game runs without error or console exception.

All pre-existing unit tests must continue to pass with `npm run test`.

---

## 10. Compatibility Impact

Compatibility: No contract surface changes detected.

The `GameEvent`, `GameEventType`, and `GameAction` types in `engine/types.ts` are unchanged. The `HUD`, `PauseModal`, and `SplashScreen` public APIs are additive only (`setOnMuteToggle` and `setMuted` are new methods on HUD; no existing method signatures change). The engine's `updateGameState` and `createGameState` APIs are unchanged. The game loop structure in `main.ts` is unchanged; new calls are additive.
