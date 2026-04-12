# Tasks: Pause Modal with Blurred Background and Resume / Title Navigation

**Change name:** pause-modal
**Date:** 2026-04-12

Tasks are ordered by dependency. Each task is independently implementable in a single focused session (30–90 minutes). A task must not begin until all tasks it depends on are complete.

---

## Group 1: UI Layer

### Task 1.1 — Create PauseModal class
**Layer:** `[frontend]`

**Description:**
Create `src/ui/pauseModal.ts` with the `PauseModal` class. This class manages all PixiJS display objects for the pause overlay panel. It follows the same constructor-injection pattern as `HUD`: it receives a parent `Container` from `main.ts` and adds its own internal display tree to it.

The internal structure is:
- `panelRoot: Container` — the repositionable root, added/removed from `stage` by `show()`/`hide()`
- `background: Graphics` — semi-transparent dark rectangle (`0x0d0d1a`, alpha 0.88), minimum 280px wide with 32px padding
- `titleText: Text` — "PAUSED" header, `fontSize: 28`, `fontFamily: 'monospace'`, `fill: 0xffffff`, centered
- `optionItems[0]` and `optionItems[1]` — each a `Container` holding a `Graphics` highlight rect and a `Text` label

Option text labels: index 0 = "RESUME", index 1 = "TITLE SCREEN". Font `fontSize: 20`, `fontFamily: 'monospace'` (satisfies the ≥ 16px requirement). Selected state: label `fill: 0xf0f000`, prefixed with `▶ `. Unselected state: `fill: 0x888888`, no prefix. Selection highlight uses a `0xffffff` Graphics rect at alpha 0.08 behind the text.

Each `optionItems[i]` container receives:
```typescript
optionContainer.eventMode = 'static'
optionContainer.cursor = 'pointer'
optionContainer.on('pointerup', () => onOptionSelected(i))
```

The `onOptionSelected` callback is passed in via constructor or set as a property. Design choice: expose it as a settable public callback property `onSelect: (index: number) => void` so `main.ts` can wire it after construction without needing constructor arguments beyond the stage container.

**Files:**
- Create: `src/ui/pauseModal.ts`

**Acceptance criteria:**
- `PauseModal` can be constructed with `new PauseModal(container)`.
- `show(0)` adds `panelRoot` to the stage container and visually highlights "RESUME".
- `show(1)` adds `panelRoot` and visually highlights "TITLE SCREEN".
- `hide()` removes `panelRoot` from the stage container (not just `visible = false`).
- `setSelection(0)` and `setSelection(1)` correctly update label colors and `▶` prefix.
- `getSelection()` returns the current selection index.
- `resize(800, 600)` centres the panel correctly at multiple viewport sizes.
- `onSelect` callback fires with the correct index when a pointer tap occurs on each option.
- Text is ≥ 16px (verified by `fontSize: 20`).
- No imports from `engine/`, `renderer/`, or `input/` — only `pixi.js` and `../engine/types.js` for any type imports needed.

---

## Group 2: Integration (main.ts wiring)

### Task 2.1 — Add modalContainer to app.stage
**Layer:** `[integration]`
**Depends on:** Task 1.1

**Description:**
In `src/main.ts`, add `modalContainer` as the last child of `app.stage`. This guarantees it renders above all other containers.

```typescript
const modalContainer = new Container()
// ... existing addChild calls ...
app.stage.addChild(modalContainer)  // LAST — always on top
```

Instantiate `PauseModal` and store it alongside the other UI objects:

```typescript
const pauseModal = new PauseModal(modalContainer)
```

Wire the `onSelect` callback:
```typescript
pauseModal.onSelect = (index: number) => {
  if (index === 0) resumeFromPause()
  else navigateToTitle()
}
```

Call `pauseModal.resize(window.innerWidth, window.innerHeight)` from within `handleResize()` — unconditionally, whether or not the modal is visible.

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- `modalContainer` is the last `addChild` call on `app.stage`.
- `pauseModal.resize(w, h)` is called inside `handleResize()`.
- `PauseModal` is imported from `./ui/pauseModal.js`.
- No TypeScript errors.

---

### Task 2.2 — Implement blur filter management
**Layer:** `[integration]`
**Depends on:** Task 2.1

**Description:**
In `src/main.ts`, implement the two helper functions that apply and remove the blur effect:

```typescript
import { BlurFilter, RendererType } from 'pixi.js'
import type { Filter } from 'pixi.js'

// Stored filter arrays captured before blur is applied
let prePauseFilters: {
  board: Filter[] | null
  piece: Filter[] | null
  effects: Filter[] | null
} | null = null

function applyPauseBlur(): void {
  if (app.renderer.type === RendererType.CANVAS) return
  const blur = new BlurFilter({ strength: 8 })
  prePauseFilters = {
    board: boardContainer.filters ? [...(boardContainer.filters as Filter[])] : null,
    piece: pieceContainer.filters ? [...(pieceContainer.filters as Filter[])] : null,
    effects: effectsContainer.filters ? [...(effectsContainer.filters as Filter[])] : null,
  }
  boardContainer.filters = [...(prePauseFilters.board ?? []), blur]
  pieceContainer.filters = [...(prePauseFilters.piece ?? []), blur]
  effectsContainer.filters = [...(prePauseFilters.effects ?? []), blur]
}

function removePauseBlur(): void {
  if (prePauseFilters === null) return
  boardContainer.filters = prePauseFilters.board
  pieceContainer.filters = prePauseFilters.piece
  effectsContainer.filters = prePauseFilters.effects
  prePauseFilters = null
}
```

The single `BlurFilter` instance is created fresh on each pause. It is shared across all three containers — this is safe in PixiJS v8 (filters are rendered per-container independently).

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- `applyPauseBlur()` does not modify filters on Canvas 2D renderer.
- After `applyPauseBlur()`, each of the three containers has its original filters plus the blur filter at the end of the array.
- After `removePauseBlur()`, all three containers have exactly their original filter arrays restored.
- `prePauseFilters` is `null` after `removePauseBlur()`.

---

### Task 2.3 — Implement pause keyboard listener
**Layer:** `[integration]`
**Depends on:** Task 2.1

**Description:**
In `src/main.ts`, implement a transient keyboard listener that is active only while the game is in `'paused'` phase. This listener is separate from `KeyboardInput` and handles ArrowUp, ArrowDown, and Enter for modal navigation.

```typescript
let pauseSelectedIndex = 0
let removePauseKeyListener: (() => void) | null = null

function attachPauseKeyListener(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp') {
      pauseSelectedIndex = Math.max(0, pauseSelectedIndex - 1)
      pauseModal.setSelection(pauseSelectedIndex)
      e.preventDefault()
    } else if (e.code === 'ArrowDown') {
      pauseSelectedIndex = Math.min(1, pauseSelectedIndex + 1)
      pauseModal.setSelection(pauseSelectedIndex)
      e.preventDefault()
    } else if (e.code === 'Enter') {
      confirmPauseSelection()
      e.preventDefault()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
```

`confirmPauseSelection()` reads `pauseSelectedIndex` and calls either `resumeFromPause()` or `navigateToTitle()`.

`e.preventDefault()` is called for all three keys to prevent browser default actions (scrolling, form submission).

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- `attachPauseKeyListener()` returns a cleanup function.
- ArrowUp decrements `pauseSelectedIndex` (clamped to 0).
- ArrowDown increments `pauseSelectedIndex` (clamped to 1).
- Enter calls `confirmPauseSelection()`.
- The listener prevents default browser behavior for ArrowUp, ArrowDown, and Enter.
- Calling the returned cleanup function removes the `keydown` listener.

---

### Task 2.4 — Implement resumeFromPause and navigateToTitle
**Layer:** `[integration]`
**Depends on:** Task 2.2, Task 2.3

**Description:**
In `src/main.ts`, implement the two outcome functions:

**`resumeFromPause()`:**
```typescript
function resumeFromPause(): void {
  removePauseBlur()
  pauseModal.hide()
  removePauseKeyListener?.()
  removePauseKeyListener = null
  // Inject Pause action to toggle engine back to 'playing'
  // KeyboardInput has no public inject API, so we call updateGameState directly
  // with a one-shot action array, then update state:
  const result = updateGameState(state, [GameAction.Pause], 0)
  state = result.state
  renderState = state
}
```

Note: calling `updateGameState` with `dtMs = 0` from outside the loop is safe — the engine does no gravity, no lock, no scoring when transitioning `'paused'` → `'playing'`. It is a pure phase toggle.

**`navigateToTitle()`:**
```typescript
function navigateToTitle(): void {
  removePauseBlur()
  pauseModal.hide()
  removePauseKeyListener?.()
  removePauseKeyListener = null
  const freshState = createGameState()
  if (freshState.phase === 'intro') {
    state = freshState
    renderState = state
  } else {
    window.location.reload()
  }
}
```

The runtime check `freshState.phase === 'intro'` means: if the animated splash screen (ticket #2) has been applied and `createGameState()` now returns `'intro'`, use that path; otherwise reload. This requires no compile-time coordination with ticket #2.

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- `resumeFromPause()` calls `removePauseBlur()`, `pauseModal.hide()`, removes the key listener, and transitions `state.phase` to `'playing'`.
- After `resumeFromPause()`, `state.phase === 'playing'`.
- `navigateToTitle()` when `createGameState()` returns `phase: 'intro'` sets `state` to the fresh state without reloading.
- `navigateToTitle()` when `createGameState()` returns `phase: 'playing'` calls `window.location.reload()`.
- Neither function leaves `prePauseFilters` non-null.
- Neither function leaves the pause key listener attached.

---

### Task 2.5 — Wire phase-transition detection into the game loop
**Layer:** `[integration]`
**Depends on:** Task 2.2, Task 2.3, Task 2.4

**Description:**
In `src/main.ts`, add phase-transition tracking to the game loop so that `applyPauseBlur()`, `pauseModal.show()`, and `attachPauseKeyListener()` are called at the moment the game transitions into `'paused'` phase, and cleanup happens when it transitions out.

Add `let prevPhase = state.phase` alongside other loop-level state variables. Inside the `loop()` function, after the fixed-timestep while-loop and state updates:

```typescript
const justPaused  = state.phase === 'paused'  && prevPhase !== 'paused'
const justResumed = state.phase === 'playing' && prevPhase === 'paused'
prevPhase = state.phase

if (justPaused) {
  pauseSelectedIndex = 0
  applyPauseBlur()
  pauseModal.show(0)
  removePauseKeyListener = attachPauseKeyListener()
}

if (justResumed) {
  // justResumed happens when P/Escape is pressed (engine toggles phase directly).
  // resumeFromPause() is the canonical cleanup path; but if the engine toggled it
  // (e.g. user pressed P directly), we must also clean up here.
  if (removePauseKeyListener !== null) {
    removePauseBlur()
    pauseModal.hide()
    removePauseKeyListener()
    removePauseKeyListener = null
  }
}
```

The `if (removePauseKeyListener !== null)` guard in `justResumed` prevents double-cleanup when `resumeFromPause()` has already run (e.g., the user clicked RESUME, which both called `resumeFromPause()` and then the engine toggled to `'playing'`, which would otherwise trigger `justResumed` in the next frame).

**Files:**
- Modify: `src/main.ts`

**Acceptance criteria:**
- `applyPauseBlur()` is called exactly once when transitioning `'playing'` → `'paused'`.
- `pauseModal.show(0)` is called with `selectedIndex = 0` on every new pause entry.
- `attachPauseKeyListener()` is called and its cleanup stored on every pause entry.
- When P/Escape toggles back (engine path), blur is removed and modal is hidden.
- `prevPhase` is updated every loop iteration.
- No double-cleanup panic when `resumeFromPause()` has already run.

---

## Group 3: Tests

### Task 3.1 — Unit tests for PauseModal
**Layer:** `[test]`
**Depends on:** Task 1.1

**Description:**
Create `src/__tests__/ui/pauseModal.test.ts` with Vitest unit tests for the `PauseModal` class. These tests run in `jsdom` (the existing Vitest config), so PixiJS must be mocked or the tests must be written against the class's public interface without triggering WebGL calls.

The recommended approach is to mock `pixi.js` at the module level using `vi.mock('pixi.js')`, providing stubs for `Container`, `Graphics`, `Text`, `TextStyle`. This is the same pattern used by any PixiJS component test that needs to avoid WebGL.

**Test cases to cover:**

1. `constructor` — creates a `PauseModal` without throwing.
2. `show(0)` — calls `addChild` on the stage container (panelRoot added to stage).
3. `show(1)` — sets initial selection to 1.
4. `hide()` — calls `removeChild` on the stage container.
5. `setSelection(0)` — updates `getSelection()` to 0.
6. `setSelection(1)` — updates `getSelection()` to 1.
7. `resize(1024, 768)` — does not throw; can be called before and after `show()`.
8. `onSelect` callback — fires with index 0 when option 0's `pointerup` handler is invoked.
9. `onSelect` callback — fires with index 1 when option 1's `pointerup` handler is invoked.
10. `show()` followed by `hide()` followed by `show()` — second `show()` re-adds `panelRoot`.

**Files:**
- Create: `src/__tests__/ui/pauseModal.test.ts`

**Acceptance criteria:**
- All 10 test cases pass.
- No test modifies or imports from `src/__tests__/engine/` (existing tests untouched).
- `npm run test` exits clean.

---

### Task 3.2 — Verify existing engine tests are unmodified and pass
**Layer:** `[test]`
**Depends on:** Task 2.5 (all main.ts changes complete)

**Description:**
Run the existing engine test suite to confirm acceptance criterion 8. No modification to any file in `src/__tests__/engine/` is required or permitted by this change.

This task is a verification step, not an implementation step. The developer runs:

```bash
npm run test
```

and confirms all `src/__tests__/engine/*.test.ts` files pass without any changes.

**Files:**
- Verify (no modification): `src/__tests__/engine/board.test.ts`
- Verify (no modification): `src/__tests__/engine/gameState.test.ts`
- Verify (no modification): `src/__tests__/engine/gravity.test.ts`
- Verify (no modification): `src/__tests__/engine/lineClear.test.ts`
- Verify (no modification): `src/__tests__/engine/pieces.test.ts`
- Verify (no modification): `src/__tests__/engine/rotation.test.ts`

**Acceptance criteria:**
- `npm run test` passes with all engine tests green.
- Zero engine test files were modified during this change.
- `npm run build` exits clean (zero TypeScript errors, zero ESLint errors).
