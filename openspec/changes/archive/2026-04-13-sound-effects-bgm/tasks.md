# Tasks: sound-effects-bgm

## Task 1: [config] Add Howler.js dependency and configure audio/ layer ESLint boundary

**Files:**
- Modify: `package.json`
- Modify: `.eslintrc.cjs`

**Steps:**

1. In `package.json`, add `"howler": "^2.2.4"` to `"dependencies"` (runtime, not devDependencies — Howler is browser-loaded) and `"@types/howler": "^2.2.12"` to `"devDependencies"`.

2. Run `npm install` to update `package-lock.json`.

3. In `.eslintrc.cjs`, append a new override block inside the `overrides` array, after the existing `input/` block (before the closing bracket of the `overrides` array). The block must read:

```javascript
// audio/ must not import from renderer/, input/, or ui/
// engine/ sub-modules are restricted; engine/types.ts is allowed
{
  files: ['src/audio/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['*/renderer/*', '../renderer/*', '../../renderer/*', '@renderer*'],
            message: 'audio/ must not import from renderer/',
          },
          {
            group: ['*/input/*', '../input/*', '../../input/*', '@input*'],
            message: 'audio/ must not import from input/',
          },
          {
            group: ['*/ui/*', '../ui/*', '../../ui/*', '@ui*'],
            message: 'audio/ must not import from ui/',
          },
          {
            group: [
              '../engine/gameState*', '../engine/board*', '../engine/pieces*',
              '../engine/rotation*', '../engine/gravity*', '../engine/lineClear*',
            ],
            message: 'audio/ may only import from engine/types.ts, not other engine modules',
          },
        ],
      },
    ],
  },
},
```

**Acceptance check:**
- `npm install` exits 0.
- `package.json` contains `howler` in `dependencies` and `@types/howler` in `devDependencies`.
- `npm run lint` exits 0 (the new override block is syntactically valid).
- A test file placed at `src/audio/test.ts` with `import { BoardRenderer } from '../renderer/boardRenderer.js'` is flagged as an error by ESLint.

**Dependencies:** None — this is the prerequisite for all subsequent tasks.

---

## Task 2: [audio] Create placeholder audio asset files

**Files:**
- Create: `public/audio/bgm.ogg`
- Create: `public/audio/bgm.mp3`
- Create: `public/audio/move.ogg`
- Create: `public/audio/move.mp3`
- Create: `public/audio/rotate.ogg`
- Create: `public/audio/rotate.mp3`
- Create: `public/audio/soft-drop.ogg`
- Create: `public/audio/soft-drop.mp3`
- Create: `public/audio/hard-drop.ogg`
- Create: `public/audio/hard-drop.mp3`
- Create: `public/audio/piece-lock.ogg`
- Create: `public/audio/piece-lock.mp3`
- Create: `public/audio/line-clear-1.ogg`
- Create: `public/audio/line-clear-1.mp3`
- Create: `public/audio/line-clear-2.ogg`
- Create: `public/audio/line-clear-2.mp3`
- Create: `public/audio/line-clear-3.ogg`
- Create: `public/audio/line-clear-3.mp3`
- Create: `public/audio/line-clear-4.ogg`
- Create: `public/audio/line-clear-4.mp3`
- Create: `public/audio/level-up.ogg`
- Create: `public/audio/level-up.mp3`
- Create: `public/audio/game-over.ogg`
- Create: `public/audio/game-over.mp3`

**Steps:**

1. Create the directory `public/audio/` (it does not exist yet — `public/` itself does not exist).

2. Create all 24 files above as empty (0-byte) files. In a shell: `touch public/audio/{bgm,move,rotate,soft-drop,hard-drop,piece-lock,line-clear-1,line-clear-2,line-clear-3,line-clear-4,level-up,game-over}.{ogg,mp3}`.

3. Commit these placeholder files to git so the directory is tracked. Real audio assets must replace these before a production release (see context-bundle.md § Asset sourcing).

**Acceptance check:**
- `ls public/audio/ | wc -l` outputs `24`.
- Each of the 12 base names has both an `.ogg` and `.mp3` variant.
- `npm run build` exits 0 (Vite copies the `public/` directory to `dist/`).

**Dependencies:** Task 1 (npm install must have run so Vite can build).

---

## Task 3: [audio] Create AudioManager class

**Files:**
- Create: `src/audio/audioManager.ts`

**Steps:**

1. Create the file `src/audio/audioManager.ts`. The class must conform to the following structure precisely (see design.md §2.2 for rationale on every decision):

```typescript
import { Howl, Howler } from 'howler'
import type { GameEvent, GameAction } from '../engine/types.js'
import { GameAction as GA } from '../engine/types.js'

// Internal sound identifiers — not exported (implementation detail)
const enum SoundId {
  BGM        = 'bgm',
  Move       = 'move',
  Rotate     = 'rotate',
  SoftDrop   = 'softDrop',
  HardDrop   = 'hardDrop',
  PieceLock  = 'pieceLock',
  LineClear1 = 'lineClear1',
  LineClear2 = 'lineClear2',
  LineClear3 = 'lineClear3',
  LineClear4 = 'lineClear4',
  LevelUp    = 'levelUp',
  GameOver   = 'gameOver',
}
```

2. Implement the constructor to create a `Map<string, Howl>` (TypeScript `const enum` values are erased to strings at runtime when used as map keys). Each `Howl` is constructed with `src: ['.ogg path', '.mp3 path']`, `preload: true`, and an `onloaderror` callback that calls `console.warn`. BGM gets `loop: true, volume: 0.5`; all SFX get `loop: false, volume: 1.0`.

3. Add `private _muted = false` and `private bgmSoundId: number | null = null` instance fields.

4. Implement `onAction(action: GameAction): void`:
   - Guard: if `this._muted` return early (defense in depth).
   - Switch on action: `MoveLeft | MoveRight` → play Move; `RotateCW | RotateCCW` → play Rotate; `SoftDrop` → play SoftDrop; `HardDrop` → set `this._hardDropThisTick = true`, play HardDrop.
   - Add `private _hardDropThisTick = false` field.

5. Implement `onEvents(events: GameEvent[]): void`:
   - At the start, read and immediately reset `this._hardDropThisTick = false` into a local `const hadHardDrop`.
   - For each event: `'piece-lock'` → if `!hadHardDrop` play PieceLock; `'line-clear'` → cast payload as `{ count: number }`, play LineClear1–4 based on count (clamp to 4); `'level-up'` → play LevelUp; `'game-over'` → play GameOver, stop BGM.

6. Implement `onPhaseChange(phase: string): void`:
   - `'playing'` → if BGM Howl is not playing, call `bgm.play()` and store the returned id in `this.bgmSoundId`.
   - `'paused'` → call `bgm.pause(this.bgmSoundId ?? undefined)`.
   - `'gameover' | 'intro'` → call `bgm.stop(this.bgmSoundId ?? undefined)`, set `this.bgmSoundId = null`.

7. Implement `mute(on: boolean): void` — call `Howler.mute(on)`, set `this._muted = on`.

8. Implement `isMuted(): boolean` — return `this._muted`.

9. Wrap all `Howl.play()` calls in try/catch that logs to `console.warn` and returns without throwing.

**Acceptance check:**
- `npm run build` exits 0 with `src/audio/audioManager.ts` present.
- `npm run lint` exits 0 (no boundary violations, no TS errors from howler types).
- Instantiating `new AudioManager()` in the browser console does not throw.

**Dependencies:** Task 1 (Howler installed, ESLint rule in place).

---

## Task 4: [ui] Add mute toggle button to HUD

**Files:**
- Modify: `src/ui/hud.ts`

**Steps:**

1. Add two new private fields to the `HUD` class, after the existing `private nextPreview: Graphics` field declaration (line 31):

```typescript
private muteButton: Text
private _onMuteToggle: ((muted: boolean) => void) | null = null
private _muted = false
```

2. In the constructor, before the closing brace of the constructor body, create the mute button Text element. Use the same monospace style as the HUD labels, but in white (`0xffffff`), `fontSize: 12`. Initial label: `[M] MUTE`.

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

3. In `layoutElements()`, extend the panel height from `280` to `320` (change `this.panel.roundRect(0, 0, HUD_PANEL_WIDTH, 280, 8)` to `320`). Then position the mute button after the `nextPreview` positioning:

```typescript
// After: this.nextPreview.y = y
y += 60  // leave room below next-piece preview
this.muteButton.x = pad
this.muteButton.y = y
```

4. Add the two new public methods after `setVisible()`:

```typescript
setOnMuteToggle(callback: (muted: boolean) => void): void {
  this._onMuteToggle = callback
}

setMuted(muted: boolean): void {
  this._muted = muted
  this.updateMuteLabel()
}
```

5. Add the private helper `updateMuteLabel()`:

```typescript
private updateMuteLabel(): void {
  this.muteButton.text = this._muted ? '[M] UNMUTE' : '[M] MUTE'
}
```

**Acceptance check:**
- `npm run lint` exits 0.
- `npm run build` exits 0.
- The HUD renders a `[M] MUTE` text element below the next-piece preview when the game is in the 'playing' phase.
- Clicking the button visually toggles the label between `[M] MUTE` and `[M] UNMUTE`.

**Dependencies:** None (standalone UI change). Can be done in parallel with Task 3.

---

## Task 5: [core] Wire AudioManager into main.ts

**Files:**
- Modify: `src/main.ts`

**Steps:**

1. Add import block after the `// UI` imports block (after line 36, the `GameAction` import):

```typescript
// Audio
import { AudioManager } from './audio/audioManager.js'
```

2. After `const pauseModal = new PauseModal(modalContainer)` (line 80), add:

```typescript
const audioManager = new AudioManager()
```

3. Immediately after the `audioManager` instantiation, wire the mute button:

```typescript
hud.setOnMuteToggle((muted: boolean) => {
  audioManager.mute(muted)
  hud.setMuted(muted)
})
hud.setMuted(audioManager.isMuted())
```

4. Inside the `while (accumulator >= LOGIC_TICK_MS)` loop, immediately before the `updateGameState` call (currently at line 353), add:

```typescript
// Notify audio layer of player actions (before engine processes them)
for (const action of allActions) {
  audioManager.onAction(action)
}
```

5. In the same while-loop body, change the existing events block at lines 365–367:

```typescript
// Before:
if (result.events.length > 0) {
  effectsRenderer.onEvents(result.events)
}

// After:
if (result.events.length > 0) {
  effectsRenderer.onEvents(result.events)
  audioManager.onEvents(result.events)
}
```

6. In the `intro → playing` transition block (currently lines 358–362):

```typescript
// Before:
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  splashScreen?.destroy()
  splashScreen = null
  hud.setVisible(true)
}

// After:
if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
  audioManager.onPhaseChange('playing')
  splashScreen?.destroy()
  splashScreen = null
  hud.setVisible(true)
}
```

7. In the phase-transition edge detection block, add audio notifications to the `justPaused` and `justResumed` branches. Current `justPaused` block starts at line 377; add `audioManager.onPhaseChange('paused')` as the first statement inside it. In the `justResumed` block (line 388), add `audioManager.onPhaseChange('playing')` as the first statement:

```typescript
if (justPaused) {
  audioManager.onPhaseChange('paused')
  pauseSelectedIndex = 0
  applyPauseBlur()
  // ...
}

if (justResumed) {
  audioManager.onPhaseChange('playing')
  removePauseBlur()
  // ...
}
```

8. In `navigateToTitle()`, add `audioManager.onPhaseChange('intro')` as the first statement in the function body, before `const freshState = createGameState()`:

```typescript
function navigateToTitle(): void {
  audioManager.onPhaseChange('intro')
  const freshState = createGameState()
  // ...
}
```

9. In `restartGame()`, add `audioManager.onPhaseChange('playing')` as the first statement, before `removePauseBlur()`:

```typescript
function restartGame(): void {
  audioManager.onPhaseChange('playing')
  removePauseBlur()
  // ...
}
```

**Acceptance check:**
- `npm run lint` exits 0.
- `npm run build` exits 0.
- Manual smoke test: opening the game in a browser, starting play, pausing, resuming, and restarting all behave correctly with no console errors.

**Dependencies:** Task 3 (AudioManager class must exist), Task 4 (HUD mute API must exist).

---

## Task 6: [audio] Manual verification and final check

**Files:** None (verification only)

**Steps:**

1. Run `npm run lint` — must exit 0.
2. Run `npm run test` — all pre-existing tests must pass.
3. Run `npm run build` — must exit 0 with no TypeScript errors.
4. Open the built game (or `npm run dev`) in Chrome and execute the manual test checklist from design.md §9:
   - Start game; confirm no console exceptions even though audio files are empty (Howler logs `onloaderror` warnings — these are expected).
   - Press P; confirm BGM pause call is reached (can verify via `console.warn` from onloaderror, not a throw).
   - Click `[M] MUTE` button; confirm label changes to `[M] UNMUTE`.
   - Click again; confirm label returns to `[M] MUTE`.
   - Block autoplay in browser settings; reload; confirm game runs without uncaught exceptions.
5. Verify that `npm run build` produces `dist/audio/` directory with all 24 placeholder files.

**Acceptance check:**
- `npm run lint` exits 0.
- `npm run test` exits 0.
- `npm run build` exits 0.
- No uncaught exceptions in browser console during normal gameplay.
- `dist/audio/` contains all 24 files after build.

**Dependencies:** Tasks 1–5 all complete.
