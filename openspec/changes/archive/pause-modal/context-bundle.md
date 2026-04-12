# Context Bundle: Pause Modal with Blurred Background and Resume / Title Navigation

**Change name:** pause-modal
**Date:** 2026-04-12
**For:** Developer agent — read this in full before beginning implementation.

---

## What to Build

A pause overlay for the falling-block puzzle game. When the player pauses (P or Escape), three containers blur, a modal panel appears with "RESUME" and "TITLE SCREEN" options, and keyboard + touch navigation controls the selection. Resume restores blur-free gameplay. Title Screen resets to the intro screen (ticket #2) or reloads the page.

---

## Critical Constraints

1. **The engine (`src/engine/`) is not modified.** No new `GameAction` values, no new `GameState` fields. The engine already has a correct `'paused'` phase — this change only adds the visual and navigation layer.

2. **`src/__tests__/engine/` tests are not modified.** If any engine test fails after this change, the implementation has a bug.

3. **Blur is a `RendererType.CANVAS` guard.** Use `if (app.renderer.type !== RendererType.CANVAS)` before applying `BlurFilter`, identical to the guard in `src/renderer/postProcess.ts`. On Canvas 2D, blur is silently skipped; the modal still appears.

4. **Existing filters must survive pause/resume.** `boardContainer` and `pieceContainer` already have glow/bloom filters from `attachPostProcess()`. Store the original filter arrays before appending blur, and restore them exactly on resume. See the `prePauseFilters` pattern in `design.md` section 3.

5. **`modalContainer` must be the last `addChild` on `app.stage`.** It must render above all other containers. Add it after `touchContainer`.

6. **Layer boundaries are ESLint-enforced.** `src/ui/pauseModal.ts` must not import from `renderer/`, `input/`, or `engine/gameState.js`. It may import from `pixi.js` and type-only imports from `engine/types.js` if needed.

7. **The word "Tetris" must never appear in user-facing text.** The modal shows "PAUSED", "RESUME", and "TITLE SCREEN" — none of these are issues. Do not add any text containing "Tetris".

---

## Exact Changes

### `src/ui/pauseModal.ts` — CREATE

New file. Entire implementation.

Key regions:
- Constructor: build `panelRoot`, `background`, `titleText`, `optionItems[0]`, `optionItems[1]`; wire `pointerup` listeners
- `show(selectedIndex?)`: add `panelRoot` to stage, call `setSelection`
- `hide()`: remove `panelRoot` from stage
- `setSelection(index)`: update label colors, `▶` prefix, highlight graphics
- `getSelection()`: return current index
- `resize(w, h)`: position `panelRoot` at `(w/2 - panelWidth/2, h/2 - panelHeight/2)`
- `onSelect: (index: number) => void`: public callback property, called from pointerup handlers

Full class design is in `design.md` section 4.

---

### `src/main.ts` — MODIFY

Five separate regions are modified:

**Region 1 — Imports (top of file)**
Add:
```typescript
import { BlurFilter, RendererType } from 'pixi.js'
import type { Filter } from 'pixi.js'
import { PauseModal } from './ui/pauseModal.js'
```

**Region 2 — Container setup (after existing addChild calls, ~line 57)**
Add after `app.stage.addChild(touchContainer)`:
```typescript
const modalContainer = new Container()
app.stage.addChild(modalContainer)
```
After `hud` instantiation:
```typescript
const pauseModal = new PauseModal(modalContainer)
pauseModal.onSelect = (index: number) => {
  if (index === 0) resumeFromPause()
  else navigateToTitle()
}
```

**Region 3 — handleResize() (~line 90)**
Add inside the function body:
```typescript
pauseModal.resize(window.innerWidth, window.innerHeight)
```

**Region 4 — Loop-level state (~line 113, before loop declaration)**
Add:
```typescript
let prevPhase = state.phase
let pauseSelectedIndex = 0
let removePauseKeyListener: (() => void) | null = null
let prePauseFilters: { board: Filter[] | null; piece: Filter[] | null; effects: Filter[] | null } | null = null
```

**Region 5 — game loop body (~line 119, inside `loop()`)**
After the fixed-timestep while-loop (after `accumulator -= LOGIC_TICK_MS`), before the render calls, add phase-transition detection and side effects. Full logic in `tasks.md` Task 2.5.

Also add the helper functions `applyPauseBlur()`, `removePauseBlur()`, `attachPauseKeyListener()`, `confirmPauseSelection()`, `resumeFromPause()`, and `navigateToTitle()` as inner functions inside `main()` (they close over `app`, `boardContainer`, etc.).

---

### Files that are NOT changed

| File | Reason not changed |
|---|---|
| `src/engine/types.ts` | No new GameAction values needed |
| `src/engine/gameState.ts` | Engine already handles 'paused' phase correctly |
| `src/input/keyboard.ts` | Pause key nav handled by transient listener in main.ts |
| `src/input/touch.ts` | No changes needed |
| `src/ui/hud.ts` | HUD is unmodified |
| `src/renderer/**` | No renderer changes |
| `src/__tests__/engine/**` | Engine tests must pass without modification |

---

## Task Dependency Graph

```
Task 1.1 (PauseModal class)
    │
    ├── Task 2.1 (add modalContainer)
    │       │
    │       ├── Task 2.2 (blur helpers)
    │       │       │
    │       │       └── Task 2.4 (resumeFromPause / navigateToTitle)
    │       │               │
    │       ├── Task 2.3 (pause key listener)   │
    │       │       │                           │
    │       │       └── Task 2.4 ──────────────┘
    │       │                       │
    │       └──────────────── Task 2.5 (game loop wiring)
    │                               │
    │                         Task 3.2 (verify engine tests)
    │
    └── Task 3.1 (PauseModal unit tests — can run in parallel with 2.x)
```

Tasks 2.2 and 2.3 can be implemented in parallel; both feed into Task 2.4.
Task 3.1 can begin as soon as Task 1.1 is complete — it is independent of the `main.ts` tasks.

---

## Risk Assessment

### Risk 1 — Filter type casting (MEDIUM)

PixiJS v8 has changed the `Filter` type compared to v7. `container.filters` is typed as `Filter[] | null` but the glow/bloom filters from `@pixi/filter-glow` and `@pixi/filter-bloom` require `as unknown as Filter` casts (already done in `postProcess.ts`). The blur capture-and-restore code must use `as Filter[]` casts in the same pattern to avoid TypeScript errors. Look at how `postProcess.ts` handles this and mirror the pattern exactly.

**Mitigation:** Follow the cast pattern in `src/renderer/postProcess.ts`. Do not introduce a stricter type assertion that would fail at compile time.

### Risk 2 — Double-cleanup on P/Escape resume (MEDIUM)

When the user presses P/Escape while the modal is visible, the engine toggles `'paused'` → `'playing'` directly. The `justResumed` detection in the game loop will fire. If `resumeFromPause()` has already cleaned up (e.g., because the user clicked RESUME and the engine also toggled), the cleanup must not run twice.

**Mitigation:** Use `if (removePauseKeyListener !== null)` as the guard in the `justResumed` branch. `resumeFromPause()` sets `removePauseKeyListener = null` before the next loop iteration.

### Risk 3 — BlurFilter on Canvas 2D (LOW)

If the `RendererType.CANVAS` guard is omitted, `new BlurFilter()` may throw or silently fail on Canvas 2D, breaking the pause flow entirely.

**Mitigation:** The guard is explicitly modeled in Task 2.2 and mirrors the existing guard in `postProcess.ts`. Review `postProcess.ts` lines 32–34 as the reference.

### Risk 4 — navigateToTitle() on pre-ticket-#2 builds (LOW)

If ticket #2 has not been applied, `createGameState().phase === 'intro'` will be false, and `window.location.reload()` will be called. This is intentional fallback behavior, but the developer must confirm this works correctly during manual testing.

**Mitigation:** Explicitly test both paths: one with ticket #2 applied and one without (or just verify that `window.location.reload()` is reachable in the else branch via code review).

### Risk 5 — modalContainer not topmost after future changes (LOW)

If a future change adds another container to `app.stage` after `touchContainer` but before `modalContainer`, the modal would render behind it. 

**Mitigation:** Document the ordering requirement in a comment in `main.ts`:
```typescript
app.stage.addChild(modalContainer)  // MUST be last — always renders above all game content
```

### Risk 6 — PauseModal pointer events intercepted during gameplay (LOW)

If `panelRoot` is not removed (only made invisible) when the modal hides, its invisible hit area would still intercept pointer events during gameplay.

**Mitigation:** `hide()` calls `modalContainer.removeChild(panelRoot)` — the panel is fully detached from the scene graph. This is enforced in Task 1.1's acceptance criteria.

---

## Key File References

| File | Purpose for this change |
|---|---|
| `src/renderer/postProcess.ts` | Reference for RendererType.CANVAS guard pattern and filter cast pattern |
| `src/ui/hud.ts` | Reference for HUD constructor pattern (`new HUD(container)`) that `PauseModal` mirrors |
| `src/engine/gameState.ts` lines 164–169 | Shows how engine handles 'paused' phase (only Pause action toggles it) |
| `src/main.ts` lines 50–65 | Container setup region where `modalContainer` is added |
| `src/main.ts` lines 90–105 | `handleResize()` where `pauseModal.resize()` is called |
| `src/main.ts` lines 119–163 | Game loop where phase-transition detection is inserted |
