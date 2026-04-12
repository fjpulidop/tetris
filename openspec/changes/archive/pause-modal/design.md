# Design: Pause Modal with Blurred Background and Resume / Title Navigation

**Change name:** pause-modal
**Date:** 2026-04-12

---

## 1. Architecture Overview

This change lives entirely in the `ui/` and `main.ts` layers. The engine is not modified. The layer boundary rules are fully preserved:

```
src/
├── engine/          [core]    UNCHANGED — engine already supports 'paused' phase.
├── renderer/        [frontend] UNCHANGED
├── input/           [frontend] UNCHANGED (keyboard.ts unchanged)
├── ui/              [frontend]
│   ├── hud.ts                 UNCHANGED
│   └── pauseModal.ts          NEW — modal panel, option items, pointer events
└── main.ts          [infra]   MODIFIED — modalContainer, blur wiring, pause navigation
```

The `PauseModal` follows the exact same constructor injection pattern as `HUD`: it receives a `Container` from `main.ts` and manages all its own child display objects. It never reaches upward to `app.stage` or sideways to any other layer.

---

## 2. Container Stack

The current `app.stage` child order is:

```
app.stage
  ├── boardContainer       (index 0) — BlurFilter applied on pause
  ├── pieceContainer       (index 1) — BlurFilter applied on pause
  ├── effectsContainer     (index 2) — BlurFilter applied on pause
  ├── uiContainer          (index 3) — HUD: NOT blurred
  ├── touchContainer       (index 4) — Touch controls: NOT blurred
  └── modalContainer       (index 5) — NEW: always on top; NOT blurred
```

`modalContainer` is the last `addChild` call in `main.ts`, ensuring it renders above everything else. This is a pure ordering guarantee — no `zIndex` sorting is needed.

---

## 3. Blur Filter Management

### The problem with naive filter assignment

The board and piece containers already have post-processing filters assigned by `attachPostProcess()` in `renderer/postProcess.ts` (glow on `boardContainer`; glow + bloom on `pieceContainer`). Writing `container.filters = [blurFilter]` would destroy those existing filters.

### The solution: capture-and-restore

In `main.ts`, before applying blur, capture the existing filter arrays:

```typescript
let prePauseFilters: {
  board: Filter[] | null
  piece: Filter[] | null
  effects: Filter[] | null
} | null = null
```

On pause:
```typescript
prePauseFilters = {
  board: boardContainer.filters ? [...boardContainer.filters] : null,
  piece: pieceContainer.filters ? [...pieceContainer.filters] : null,
  effects: effectsContainer.filters ? [...effectsContainer.filters] : null,
}
const blur = new BlurFilter({ strength: 8 })
boardContainer.filters = [...(prePauseFilters.board ?? []), blur]
pieceContainer.filters = [...(prePauseFilters.piece ?? []), blur]
effectsContainer.filters = [...(prePauseFilters.effects ?? []), blur]
```

On resume:
```typescript
boardContainer.filters = prePauseFilters.board
pieceContainer.filters = prePauseFilters.piece
effectsContainer.filters = prePauseFilters.effects
prePauseFilters = null
```

A single `BlurFilter` instance is shared across all three containers. This is safe because PixiJS filters are stateless render passes — the same instance can appear in multiple containers' filter arrays.

### WebGL guard

`BlurFilter` in PixiJS v8 requires the GPU renderer. The same guard pattern used in `postProcess.ts` applies here:

```typescript
import { RendererType } from 'pixi.js'

if (app.renderer.type !== RendererType.CANVAS) {
  // apply blur
}
```

On Canvas 2D, blur is silently skipped. The modal still shows normally — it just appears without blur behind it. This is the correct graceful degradation.

---

## 4. PauseModal Class API

File: `src/ui/pauseModal.ts`

```typescript
export class PauseModal {
  constructor(stage: Container)

  /**
   * Add modal display objects to stage and make them visible.
   * selectedIndex: 0 = RESUME, 1 = TITLE SCREEN
   */
  show(selectedIndex?: number): void

  /**
   * Remove all modal display objects from stage.
   * Fully removes from scene graph — not just alpha=0.
   */
  hide(): void

  /**
   * Update visual highlight to reflect the currently selected item.
   */
  setSelection(index: number): void

  /**
   * Returns the current selection index (0 = RESUME, 1 = TITLE SCREEN).
   */
  getSelection(): number

  /**
   * Re-centre the panel within the given viewport dimensions.
   * Called by main.ts handleResize().
   */
  resize(width: number, height: number): void
}
```

### Internal structure (PixiJS display tree)

```
modalContainer (passed in from main.ts)
  └── panelRoot: Container  (positioned by resize())
        ├── background: Graphics  (semi-transparent dark rect)
        ├── titleText: Text       ("PAUSED" header)
        ├── optionItems[0]: Container
        │     ├── highlight: Graphics  (shown when selected)
        │     └── label: Text         ("RESUME")
        └── optionItems[1]: Container
              ├── highlight: Graphics  (shown when selected)
              └── label: Text         ("TITLE SCREEN")
```

The `panelRoot` container is added/removed from `modalContainer` by `show()`/`hide()`. This satisfies acceptance criterion 9 (modal fully removed on unpause).

### Option sizing and styling

- Panel: minimum width 280px, padding 32px all sides, `alpha = 0.88`, background color `0x0d0d1a`
- "PAUSED" title: `fontSize: 28`, `fontFamily: 'monospace'`, `fill: 0xffffff`, centered
- Option text: `fontSize: 20`, `fontFamily: 'monospace'` (≥ 16px per AC #2)
- Selected state: option label `fill: 0xf0f000` (yellow), non-selected: `fill: 0x888888`
- A `▶` prefix character on the selected option's label provides an additional cue

### Pointer events

Each option's outer `Container` receives:
```typescript
optionContainer.eventMode = 'static'
optionContainer.cursor = 'pointer'
optionContainer.on('pointerup', () => { /* confirm this option */ })
```

`pointerup` is used rather than `pointerdown` or `click` because it fires on both mouse release and touch end, and it avoids triggering on scroll gestures that happen to start on the button.

---

## 5. Pause Navigation in main.ts

### Modal selection state

Selection state is owned by `main.ts` as a local variable, not by the engine. The engine's `GameState` is not modified.

```typescript
let pauseSelectedIndex = 0
```

### Keyboard intercept while paused

During `phase === 'paused'`, `main.ts` intercepts ArrowUp, ArrowDown, and Enter before the engine receives them. This is done by inspecting the flushed action buffer in the game loop — not by adding a new keyboard listener.

The implementation adds two new `GameAction` values — `NavigateUp` and `NavigateDown` — to `src/engine/types.ts`. These are mapped in `keyboard.ts` (`ArrowUp` and `ArrowDown` already exist for `RotateCW` and `SoftDrop` during gameplay; the new actions are separate enum values). `main.ts` intercepts them when `phase === 'paused'` and does not forward them to `updateGameState`.

Wait — this creates a conflict. `ArrowUp` is currently mapped to `GameAction.RotateCW` in `keyboard.ts`. During `'paused'`, forwarding `RotateCW` to the engine is a no-op (the engine ignores non-Pause actions in `'paused'` phase). But for clean semantics, the modal navigation should not depend on the engine's behavior for unknown actions.

**Decision:** Rather than adding new `GameAction` values (which would pollute the engine's public enum), `main.ts` adds a dedicated `keydown` listener active only while paused, separate from the normal input pipeline. This listener handles `ArrowUp`, `ArrowDown`, and `Enter` directly, calling `pauseModal.setSelection()` and the confirm action. The listener is added when the game enters `'paused'` phase and removed when it exits. This keeps the engine enum clean and avoids shipping "UI navigation" as game actions.

```typescript
function attachPauseKeyListener(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp') {
      pauseSelectedIndex = Math.max(0, pauseSelectedIndex - 1)
      pauseModal.setSelection(pauseSelectedIndex)
    } else if (e.code === 'ArrowDown') {
      pauseSelectedIndex = Math.min(1, pauseSelectedIndex + 1)
      pauseModal.setSelection(pauseSelectedIndex)
    } else if (e.code === 'Enter') {
      confirmPauseSelection()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

let removePauseKeyListener: (() => void) | null = null
```

`removePauseKeyListener` is called when the game transitions out of `'paused'` phase.

### Detecting phase transitions in the game loop

The game loop currently does not track the previous phase. A one-line addition handles this:

```typescript
let prevPhase = state.phase  // declared alongside other loop state
```

In the game loop, after `updateGameState`:
```typescript
const justPaused  = state.phase === 'paused'  && prevPhase === 'playing'
const justResumed = state.phase === 'playing' && prevPhase === 'paused'
prevPhase = state.phase
```

### Confirm selection action

```typescript
function confirmPauseSelection(): void {
  if (pauseSelectedIndex === 0) {
    // RESUME — feed GameAction.Pause into next tick to toggle engine back to 'playing'
    // (keyboard.ts already does this for P/Escape; we replicate the buffer injection)
    resumeFromPause()
  } else {
    // TITLE SCREEN
    navigateToTitle()
  }
}
```

`resumeFromPause()` — removes blur, hides modal, removes keyboard listener, then calls `updateGameState` with `[GameAction.Pause]` or simply calls a local helper that sets `state = { ...state, phase: 'playing' }` directly. Because `main.ts` is the only file that owns the mutable `state` reference, it can do this without any engine changes. The cleanest approach is to inject `GameAction.Pause` into the action buffer for the next tick, which causes the engine to toggle back to `'playing'` — this keeps the state transition in the engine where it belongs.

`navigateToTitle()` — checks if `GameState.phase` can hold `'intro'` (at runtime, checks if `state.phase !== undefined` is not the right guard; the actual guard is whether `createGameState()` returns `phase: 'intro'`). The practical approach: attempt `state = createGameState()` — if `createGameState()` returns `phase: 'intro'`, the splash screen (ticket #2) handles the rest; if it returns `phase: 'playing'`, the game restarts immediately. As a fallback for environments that do not have ticket #2 applied, `window.location.reload()` is used. This is determined at design time by a compile-time `'intro'` check:

```typescript
function navigateToTitle(): void {
  removeBlur()
  pauseModal.hide()
  removePauseKeyListener?.()
  removePauseKeyListener = null

  const freshState = createGameState()
  if (freshState.phase === 'intro') {
    state = freshState
  } else {
    window.location.reload()
  }
}
```

This is safe, forward-compatible, and requires zero coordination with ticket #2's implementation.

---

## 6. Data Flow on Pause

```
Player presses P/Escape
        │
        ▼
keyboard.ts buffers GameAction.Pause
        │
        ▼
main.ts game loop: updateGameState([..., Pause], dt)
        │
        ▼
engine returns state.phase === 'paused'
        │
        ▼
main.ts detects justPaused === true
        ├── applyBlurToGameContainers()
        ├── pauseModal.show(0)          ← reset selection to 0
        ├── pauseSelectedIndex = 0
        └── removePauseKeyListener = attachPauseKeyListener()
```

```
Player selects RESUME (keyboard Enter or pointer tap)
        │
        ▼
confirmPauseSelection() → resumeFromPause()
        ├── removeBlur()                ← restore pre-pause filter arrays
        ├── pauseModal.hide()           ← remove from stage
        ├── removePauseKeyListener()
        ├── removePauseKeyListener = null
        └── inject GameAction.Pause into keyboard buffer for next tick
                │
                ▼
        engine: 'paused' + Pause → 'playing'
```

---

## 7. Resize Handling

`PauseModal.resize(w, h)` repositions `panelRoot` to `(w/2 - panelWidth/2, h/2 - panelHeight/2)`. It is called unconditionally from `handleResize()` in `main.ts` — whether or not the modal is currently visible. The modal re-centres correctly even if the viewport changes while paused.

---

## 8. Key Design Decisions

### Decision A: No new GameAction values for modal navigation

Navigation (ArrowUp/Down, Enter) while paused is handled by a dedicated transient `keydown` listener in `main.ts`, not through the `GameAction` enum. This keeps the engine's public contract clean — the engine never needs to know that a modal exists.

**Trade-off rejected:** Adding `GameAction.NavigateUp`, `GameAction.NavigateDown`, `GameAction.Confirm` to `engine/types.ts` would make these values globally visible and invite future callers to use them in the engine's state machine, which would couple the engine to UI concerns.

### Decision B: Single BlurFilter instance shared across three containers

One `BlurFilter({ strength: 8 })` object is appended to all three containers' filter arrays. PixiJS v8 renders filters per-container, so the same filter instance being referenced by multiple containers is safe — it is executed independently for each container during rendering. This avoids creating three identical filter objects.

### Decision C: Filter capture-and-restore rather than a BlurFilter wrapper

The post-processing filters applied by `attachPostProcess()` must survive a pause/resume cycle. Storing the original arrays and restoring them exactly is the simplest and most robust approach. A wrapper approach (e.g., a custom container that conditionally appends blur) would require changing `attachPostProcess()`'s signature, which touches the renderer layer.

### Decision D: panelRoot added/removed (not alpha toggled)

`hide()` calls `modalContainer.removeChild(panelRoot)` rather than `panelRoot.alpha = 0` or `panelRoot.visible = false`. This satisfies acceptance criterion 9 exactly ("modal fully removed from stage on unpause/reset") and avoids any risk of the modal intercept pointer events while "hidden."

### Decision E: navigateToTitle() runtime-detects 'intro' phase

Rather than gating `navigateToTitle()` behind a compile-time flag or import, it inspects the result of `createGameState().phase` at runtime. This is the minimal coordination contract with ticket #2 — if `'intro'` is present, use it; otherwise reload. No import of `SplashScreen` or any splash-screen module is needed in this change.

---

## 9. Files Changed

| File | Status | Change |
|---|---|---|
| `src/ui/pauseModal.ts` | CREATE | New `PauseModal` class |
| `src/main.ts` | MODIFY | modalContainer, blur wiring, pause navigation, resize call |
| `src/engine/types.ts` | NO CHANGE | Engine enum is not modified (see Decision A) |
| `src/input/keyboard.ts` | NO CHANGE | No new mappings needed (pause nav handled in main.ts) |
| `src/__tests__/engine/**` | NO CHANGE | Engine tests require no modification (AC #8) |

---

## 10. Compatibility Impact

No engine API is changed. `GameState`, `GameAction`, `updateGameState()`, and all renderer/input interfaces are unmodified.

The only public surface addition is the new `PauseModal` class in `src/ui/pauseModal.ts`, which is a new file with no prior contract.

**Compatibility: No contract surface changes detected.**
