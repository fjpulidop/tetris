# Design: Juicy Visual Effects Suite

## Architectural Invariants

All new code lives in the renderer layer or in `main.ts`'s orchestration section.
The engine (`src/engine/`) is read-only for this ticket. `src/engine/types.ts` is also
read-only: we do not add new `GameEventType` values.

The existing `GameEvent` types that are relevant:
- `'piece-lock'` — fires on every gravity lock and every hard drop; `main.ts` enriches
  the payload with `{ piece: ActivePiece }` before forwarding to `EffectsRenderer`.
- `'line-clear'` — payload `{ count: number, rows: number[] }`.
- `'level-up'` — payload `{ level: number }`.

A hard drop fires `'piece-lock'` before a `'line-clear'` in the same tick, so the screen
shake from the hard drop and the line-clear sweep flash will both trigger correctly from
the same event batch.

---

## Effect-by-Effect Design

### 1. Screen Shake — `ShakeEffect` class inside `effects.ts`

**Trigger**: `'piece-lock'` event when the causing action was `HardDrop`. Because the
engine does not distinguish hard-drop locks from gravity locks in the event payload,
`main.ts` must enrich the `'piece-lock'` payload with a boolean `{ piece, isHardDrop }`.
`main.ts` already checks `allActions` for `GameAction.HardDrop` in the same tick, so
adding `isHardDrop: allActions.includes(GameAction.HardDrop)` to the enrichment map
costs nothing. A tetris (4-line clear) additionally intensifies the shake — this is a
second `triggerShake()` call from the `'line-clear'` handler when `count >= 4`.

**Implementation**: A damped oscillation applied to `app.stage.x / app.stage.y` via
a sinusoidal offset that decays exponentially:

```
offset(t) = intensity * sin(frequency * t) * e^(-decay * t)
```

`intensity` starts at 6px for hard drop, 10px for tetris. `frequency` = 40 rad/s.
`decay` = 20 (so the shake damps to ~2% of peak in 200ms). Duration cap: 250ms.

`EffectsRenderer` cannot access `app.stage` directly because `EffectsRenderer` is given
only a `Container` (the `effectsContainer`). Screen shake must operate on the root
`app.stage` container. Therefore, `ShakeEffect` is an independent class instantiated
in `main.ts` (like `PostProcessController`) that receives `app.stage` and exposes
`triggerShake(intensity)` and `tick(dtMs)`. `main.ts` calls `shakeEffect.triggerShake()`
when the enriched piece-lock payload carries `isHardDrop: true`, or when a 4-line clear
event is received.

**Why not inside `EffectsRenderer`?** `EffectsRenderer` receives `effectsContainer`, not
`app.stage`. Translating `effectsContainer` alone creates a visual seam where board,
piece, and HUD containers move independently. The shake must move the entire visual frame,
which is `app.stage`. Since `main.ts` already owns `app` and `app.stage`, it is the
natural owner of `ShakeEffect`.

**Reset on pause**: `main.ts` must call `shakeEffect.reset()` on the `justPaused` edge
so the stage position does not freeze at a displaced offset.

---

### 2. Row Sweep Flash — enhancement to `EffectsRenderer.triggerFlash()`

The current `triggerFlash(row)` draws an instant full-alpha white rectangle that fades
over 200ms. The sweep upgrade replaces the static rect with a left-to-right animated
wipe: a `Graphics` object whose `width` grows from 0 to `BOARD_COLS * cellSize` over
the first 80ms, then fades out over the remaining 120ms.

**Implementation**: The `FlashEffect` interface gains optional `sweepProgress` and
`sweepDuration` fields. When `sweepProgress` is present, the `tick()` loop sets
`g.width` proportionally during the sweep phase before switching to alpha-fade. Only the
`triggerFlash()` path changes — no other callers are affected.

**Why not use a `Sprite` with a mask?** A `Graphics` `rect()` re-draw each frame
for just the width is simpler and PixiJS batch-draws Graphics cheaply. The flash
lifetime is 200ms max (12 frames at 60fps), so per-frame Graphics redraws are negligible.

---

### 3. Tetris Full-Board Flash — upgrade to `triggerTetrisFlash()`

The current Tetris flash is a white full-screen overlay at 0.8 alpha fading over 300ms.
The upgrade adds a rainbow color sweep: on each `tick()` frame while `tetrisFlashLife > 0`,
the overlay tint cycles through `ColorMatrixFilter` hue rotation. This creates the
"rainbow flash" characteristic of modern Tetris games.

**PixiJS 8 approach**: `ColorMatrixFilter` is built into `pixi.js` v8. We attach it to
`tetrisFlashOverlay` during `triggerTetrisFlash()` and rotate its hue 1.5° per frame
(90°/s at 60fps) in `tick()`. The filter is removed when `tetrisFlashLife` hits zero.

**Why `ColorMatrixFilter` over `DisplacementFilter`?** Hue rotation is exactly what
`ColorMatrixFilter.hue()` is designed for — one call, zero texture assets needed.
`DisplacementFilter` is for spatial distortion, not color cycling.

---

### 4. Combo Ripple — new `ComboRippleEffect` class inside `effects.ts`

**Combo tracking**: `GameState` does not track combos. The `'line-clear'` event payload
only carries `count` (lines in one clear) and `rows`. A combo is consecutive ticks where
`'line-clear'` fires. We track this in `main.ts` with two variables:
- `let consecutiveClearCount = 0` — how many consecutive ticks had at least one
  `'line-clear'` event.
- `let lastClearTick = -1` — the tick counter at which the last clear occurred.

After each tick, if `'line-clear'` fired this tick: `consecutiveClearCount++` and set
`lastClearTick = currentTick`. If `'piece-lock'` fired and `'line-clear'` did NOT fire:
`consecutiveClearCount = 0`. This combo count is passed to `EffectsRenderer.onEvents()`
via the enriched event payload on `'line-clear'`: `{ count, rows, combo }`.

**Why track in `main.ts` not `EffectsRenderer`?** `EffectsRenderer.onEvents()` receives
only the events for one tick. It cannot see the prior tick's events. `main.ts` has the
full tick loop context. This is the same pattern as the `isHardDrop` enrichment: `main.ts`
adds derived context to renderer-bound events.

**Why not add combo to `GameState`?** That would modify the engine layer and its types.
The engine intentionally knows nothing about renderer-side concepts like "visual combo
streak". The combo streak we track here is specifically for renderer escalation — it does
not need to feed back into scoring (the engine already has its own scoring logic).

**Visual design**: A `ComboRippleEffect` renders a radially expanding ring centered on
the board. Ring radius grows from 0 to `boardDiagonal / 2` over 400ms. Alpha decays as
radius grows. Color cycles through piece guideline colors scaled to `combo % 7`. For
combo >= 3, a second ring starts 80ms after the first with a complementary color.
Up to two rings are tracked simultaneously (pre-allocated).

**Implementation**: Two `Graphics` objects pre-allocated in the `boardContainer`.
`triggerComboRipple(combo, cx, cy)` sets radius to 0, sets alpha to `min(1, 0.4 + combo * 0.1)`,
and records `rippleLife`. `tick()` expands radius and fades alpha each frame.

---

### 5. Level-Up Chromatic Aberration Flash — upgrade to `triggerLevelUp()` in `effects.ts`

**Current behavior**: Gold edge pulse + gold background tint at 0.15 alpha for 800ms.

**Upgrade**: Replace (or supplement) the gold tint with a 300ms chromatic aberration
flash applied to the root stage, then transition back to the existing gold edge pulse.

**PixiJS 8 approach**: PixiJS v8 does not ship a first-party chromatic aberration filter.
Options:

1. **`DisplacementFilter` with an RGB-split trick**: Apply three separate tinted
   translucent `Sprite` copies of a white rectangle shifted ±N pixels in X. This is
   a pure-PixiJS approximation that requires no custom GLSL.

2. **Custom GLSL fragment shader via `Filter`**: Full control but requires bundling GLSL
   and using PixiJS 8's `GpuProgram` / `GlProgram` API — significant complexity.

3. **`ColorMatrixFilter` + CSS `filter: blur`**: No spatial RGB split possible.

**Decision**: Use approach 1 — three colored overlay `Graphics` objects shifted ±3px.
A red-tinted `Graphics` at `-3px X`, a blue-tinted `Graphics` at `+3px X`, and the
existing tetrisFlashOverlay (white/neutral) in the center. All three fade over 300ms.
This costs 3 Graphics draw calls and zero GLSL. The spatial RGB split is visible but
not photorealistic — appropriate for a game effect.

The two additional overlay Graphics are pre-allocated in the `EffectsRenderer` constructor
as `chromaRedOverlay` and `chromaBlueOverlay`, added to `screenContainer`. They are
triggered from `triggerLevelUp()` and ticked in `tick()`.

The existing gold tint and edge pulse remain. They run after the chroma flash fades.

---

### 6. Ghost Piece Pulse — modification to `PieceRenderer`

**Current**: Ghost cells render at static `GHOST_ALPHA = 0.3`.

**Upgrade**: Ghost alpha oscillates via `sin(elapsedTime)`:
```
ghostAlpha(t) = 0.22 + 0.10 * sin(2π * 1.0 * t)
```
Range: 0.12 – 0.32. Period: 1 second. This is subtle enough to remain readable as a
drop preview while adding life to the rendering.

**Elapsed time source**: `PieceRenderer.update()` currently receives only `GameState`.
It must also receive elapsed wall-clock time in seconds. `main.ts` accumulates
`totalElapsedMs` in the render loop (`totalElapsedMs += delta`) and passes
`totalElapsedMs / 1000` to `pieceRenderer.update(state, elapsedSec)`. This value is
purely cosmetic — it does not affect game logic.

**Implementation**: Change `update(state: GameState): void` to
`update(state: GameState, elapsedSec: number): void`. The ghost draw loop uses
`Math.sin(elapsedSec * Math.PI * 2)` to modulate alpha per-frame. The 4 ghost
`Graphics` objects have their `.alpha` set individually each frame rather than once in
the constructor.

---

## Performance Considerations

- **Screen shake**: One `app.stage.x/y` write per frame during a ~250ms window.
  Negligible cost.
- **Sweep flash**: At most 4 `Graphics.rect()` redraws per `'line-clear'` event (one per
  cleared row). Flash lifetime is 200ms (12 frames). PixiJS batches these.
- **Combo ripple**: 2 pre-allocated `Graphics` objects. `g.clear()` + `g.arc()` once per
  frame during the active ripple (400ms / 24 frames).
- **Rainbow tetris flash**: One `ColorMatrixFilter.hue()` call per frame during the
  300ms flash. `ColorMatrixFilter` is a single GPU pass.
- **Chroma overlay**: 3 pre-allocated `Graphics` objects, visible only during 300ms.
  Minimal fill cost on modern GPUs.
- **Ghost pulse**: Replace static `g.alpha = 0.3` (set once) with `g.alpha = fn(t)` (set
  per frame). 4 alpha writes per frame — effectively zero cost.
- **Particle pool**: Unchanged. The existing 300-particle pool is not modified.

No effect introduces per-frame texture uploads, new particle allocations, or recursive
container traversals. The 60fps target is preserved.

---

## Compatibility

- No `GameEventType` additions: uses existing `'piece-lock'`, `'line-clear'`, `'level-up'`.
- Engine layer: zero changes.
- Input layer: zero changes.
- `EffectsRenderer` public API: `onEvents(events)`, `tick(dtMs, state)`, `resize()`,
  `resizeScreen()`, `setPostProcessController()` — signatures unchanged.
- `PieceRenderer` public API: `update(state)` gains an optional second parameter
  `elapsedSec = 0`. Existing callers that omit it get static `GHOST_ALPHA` behavior
  (backward compatible via default argument).
- `PostProcessController` interface: unchanged.
- `main.ts` additions are purely additive: new local variables, one new enrichment field,
  one new class instantiation.
