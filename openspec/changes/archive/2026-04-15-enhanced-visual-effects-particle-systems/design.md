# Design: Enhanced Visual Effects & Particle Systems

## 1. Overview of Changes

Three files change:

| File | Change type | Summary |
|---|---|---|
| `src/renderer/effects.ts` | Extend | New emitter methods; expanded pool; shimmer overlay |
| `src/renderer/postProcess.ts` | Extend | `PostProcessController` class wrapping the bloom filter |
| `src/main.ts` | Wire | Forward `piece-lock` / `level-up` events; pass `GameState` to effects each frame |

No other files change. The engine (`src/engine/`) is strictly read-only.

---

## 2. `src/renderer/effects.ts` — Extended EffectsRenderer

### 2.1 Particle pool expansion

The existing pool of 200 particles is sized for 4 rows × 30 particles. Adding a
piece-lock burst of ≥20 particles and potentially a simultaneous line-clear means the
pool can be fully consumed. The pool should be grown to **300 particles** to give safe
head-room. The `PARTICLE_POOL_SIZE` constant is the only change; the pool allocation
loop is unchanged.

### 2.2 Piece-lock burst (`triggerPieceLockBurst`)

**Trigger:** `onEvents()` receives a `piece-lock` event. The payload carries
`{ piece: ActivePiece }` — see §2.2a below for how this is passed.

**Visual:** ≥20 particles emitted radially from the piece centroid. Color matches the
piece's Guideline hex color (sourced from `CELL_COLORS` in `boardRenderer.ts`, which is
already importable from within `src/renderer/`). Particle size is slightly larger than
line-clear particles (6 px rather than 4 px). Velocities are uniformly distributed
around 360° with randomized speed 2–6. Gravity constant 0.15. Lifetime 500 ms. Alpha
fades linearly to 0.

**Piece centroid calculation:** The lock event payload includes the locked `ActivePiece`.
Its centroid in board-space is the average of its 4 cell centers:
```
centroidCol = piece.col + (bboxWidth  / 2)
centroidRow = piece.row + (bboxHeight / 2)
```
In screen space: `x = centroidCol × cellSize`, `y = centroidRow × cellSize`.
(The `effectsContainer` is offset by `offsetX/offsetY` via `resize()`, so these are
already relative coordinates — identical to the line-clear particle convention.)

**Piece color mapping:** Import `CELL_COLORS` from `./boardRenderer.js` and
`PIECE_COLORS` from `../engine/pieces.js`. Both are already imported indirectly by
`pieceRenderer.ts` and are safe renderer-layer imports.
```typescript
const colorIndex = PIECE_COLORS[piece.type]   // 1–7
const color = CELL_COLORS[colorIndex] ?? 0xffffff
```

**Payload threading:** The engine already emits `{ type: 'piece-lock' }` with no
payload. To avoid touching the engine, `main.ts` must enrich the event before
forwarding it to `effectsRenderer.onEvents()`. See §5 for the `main.ts` wiring detail.
The `EffectsRenderer.onEvents()` signature does not change — it still accepts
`GameEvent[]`. The payload is typed as `unknown` in `types.ts`, so reading
`(event.payload as { piece: ActivePiece } | undefined)` in `effects.ts` is safe.

**Implementation note on 2.2a — payload enrichment:** In `main.ts`, after
`updateGameState()` returns `result`, iterate `result.events` and, for each event with
`type === 'piece-lock'`, replace it with
`{ type: 'piece-lock', payload: { piece: stateBeforeUpdate.activePiece } }`.
`stateBeforeUpdate.activePiece` is the piece that just locked (the engine has already
spawned a new one in `result.state`). This is a pure data augmentation in `main.ts` and
requires zero engine changes.

### 2.3 Scaled line-clear effects (`triggerLineClearEffects` — extended)

The existing method fires the same flash + 30 particles per row regardless of count.
It is refactored to route through a count-aware dispatcher:

```
count == 1  →  existing flash + particles (unchanged)
count == 2  →  existing flash + particles + triggerEdgePulse(medium)
count == 3  →  existing flash + particles + triggerEdgePulse(strong)
count == 4  →  existing flash + particles + triggerTetrisFlash() + triggerEdgePulse(max) + callback to postProcessController
```

The `payload.count` field is already present on every `line-clear` event (emitted by
`updateGameState` as `{ count: clearedCount, rows: fullRows }`), so no data changes are
needed.

### 2.4 Tetris full-screen flash overlay (`triggerTetrisFlash`)

**Visual:** A full-viewport white `Graphics` rectangle (spanning `window.innerWidth ×
window.innerHeight`, positioned relative to `app.stage` rather than the board
container) that fades from alpha 0.8 to 0 over 300 ms.

**Implementation:** The overlay `Graphics` is pre-allocated at construction time (not
dynamically created) and kept invisible. On trigger it is moved to the top of
`app.stage` (or a dedicated overlay container passed into the constructor), its alpha
reset to 0.8, and a `tetrisFlashLife` counter is set to 300 ms. The `tick()` method
drains it. A dedicated `Graphics tetrisFlashOverlay` field is sufficient; it does not
need to live in the particle pool.

**Container scoping:** The board-relative `effectsContainer` is wrong for a full-screen
flash because it is offset by `offsetX/offsetY`. `EffectsRenderer` needs a second
container reference for screen-space overlays. The constructor signature changes to:
```typescript
constructor(boardContainer: Container, screenContainer: Container)
```
`boardContainer` hosts particles and row flashes (existing behavior).
`screenContainer` hosts the Tetris flash and level-up edge pulse (new, full-screen).
In `main.ts`, `screenContainer` is the `effectsContainer` itself (which currently sits
at `(0, 0)` on `app.stage` — it has no offset), so no new container is needed in
`main.ts`. The `resize()` call only positions the internal board-relative sub-container,
not the screen-space one. This is the cleanest separation achievable without restructuring
`main.ts`.

Wait — reading `main.ts` again: `effectsContainer` is added to `app.stage` and then
`EffectsRenderer` creates its own internal `container` inside the given `stage`
parameter, then sets `this.container.x = offsetX` in `resize()`. So `effectsContainer`
itself has no offset and can serve as the `screenContainer`. We therefore keep the
constructor signature as-is (`constructor(stage: Container)`) and track both:
- `this.boardContainer` (the internal offset sub-container, currently called `this.container`)
- `this.screenContainer` = `stage` (the outer, passed-in container — no offset)

Rename `this.container` → `this.boardContainer` internally for clarity, and add
`this.screenContainer = stage`. The public `resize()` and `tick()` remain the same
signature.

### 2.5 Screen-edge pulse (`triggerEdgePulse`)

**Visual:** A rectangular `Graphics` frame (stroke only, no fill) drawn around the
entire viewport edge. Color and thickness vary by intensity level. Fades out over
~400 ms (medium) or ~600 ms (strong/max).

**Implementation:** Pre-allocate a single `Graphics edgePulseOverlay` in
`this.screenContainer`. On trigger: clear and redraw as a stroke-only rect
`(0, 0, screenW, screenH)`, set alpha, set `edgePulseLife` and `edgePulseDuration`.
Tick drains it. Intensity levels map to:
- medium: stroke width 6, color `0x00f0f0` (cyan), alpha 0.7, duration 400 ms
- strong: stroke width 10, color `0xa000f0` (purple), alpha 0.85, duration 500 ms
- max (Tetris): stroke width 14, color `0xffffff`, alpha 1.0, duration 600 ms

Screen dimensions for the pulse are updated in `resize()`. The `EffectsRenderer` must
store `screenW` and `screenH` and update them in `resize()`. Since `resize()` currently
receives `(cellSize, offsetX, offsetY)`, we add a parallel `resizeScreen(w, h)` method
called from `handleResize()` in `main.ts`.

### 2.6 Level-up pulse (`onEvents` — `level-up` branch)

**Trigger:** `onEvents()` receives a `level-up` event.

**Visual:** Screen-edge pulse (gold tint, medium-strong intensity) + a brief translucent
full-viewport color overlay (dark gold, alpha 0.15) that fades over 800 ms. The color
overlay uses the pre-allocated `tetrisFlashOverlay` `Graphics` object — reused with a
different color (0xf0a000) and lower starting alpha (0.15). The two triggers (Tetris
flash at alpha 0.8 and level-up flash at alpha 0.15) cannot fire simultaneously in
normal gameplay (a Tetris clear triggers a level-up in the same tick, so level-up fires
alongside Tetris line-clear, not standalone). The Tetris code path takes priority:
`triggerTetrisFlash()` sets the overlay for 300 ms; the level-up code path checks
whether the Tetris flash is currently active and skips the background overlay if so,
only adding the edge pulse.

The level-up edge pulse color: stroke width 10, color `0xf0a000` (orange-gold),
alpha 0.9, duration 800 ms.

### 2.7 Active-piece idle shimmer (`updateShimmer`)

**Visual:** A translucent, softly pulsing alpha overlay drawn on top of the active
piece cells. The overlay cycles between alpha 0.06 and 0.18 at ~1.5 Hz using a sine
wave. The shimmer color is white (0xffffff) so it works against all piece colors.

**Implementation:** Add a private `shimmerGraphics: Graphics` field in
`this.boardContainer` (board-relative). On each `tick(dtMs)` call, if `state.phase ===
'playing'` and `state.activePiece !== null`, redraw `shimmerGraphics` as 4 rounded
rectangles (one per cell) filled white at the current oscillating alpha. The redraw
uses `getCells(piece)` and the stored `cellSize`.

To feed `GameState` into `tick()`, the signature changes to:
```typescript
tick(dtMs: number, state: GameState): void
```
`GameState` is importable from `../engine/gameState.js` inside `src/renderer/` — this
is an engine-to-renderer import, which is permitted by the architecture (the arrow goes
`renderer → engine`).

**Shimmer phase accumulator:** A private `shimmerPhase = 0` (radians) incremented each
tick: `this.shimmerPhase += (2 * Math.PI * 1.5) * (dtMs / 1000)`. Alpha:
`0.12 + 0.06 * Math.sin(this.shimmerPhase)` (range 0.06–0.18). When
`state.activePiece === null` or phase is not `'playing'`, the `shimmerGraphics` is
cleared and hidden.

The shimmer purposely does not use the particle pool — it is a single `Graphics` redrawn
each frame (not an animation with a lifetime). This is cheaper than 4 pooled sprites
since `Graphics.clear()` + `Graphics.roundRect()` × 4 per frame is negligible.

---

## 3. `src/renderer/postProcess.ts` — PostProcessController

### 3.1 Motivation

Currently `attachPostProcess()` is a fire-and-forget function that attaches static
filters. There is no way to programmatically adjust bloom intensity after attachment.
A transient bloom spike (for the Tetris clear) requires the ability to temporarily
raise and then restore the `BloomFilter` strength.

### 3.2 Design

Rename nothing externally — `attachPostProcess()` keeps its name and signature. It
returns a new `PostProcessController` instance (currently returns `void`; this is a
non-breaking additive change since callers ignore the return value today).

```typescript
export interface PostProcessController {
  /** Spike bloom to `strength` and linearly decay back to baseline over `durationMs`. */
  setBloomSpike(strength: number, durationMs: number): void
  /** Must be called every render frame with elapsed ms. */
  tick(dtMs: number): void
}
```

Internally `attachPostProcess()` keeps a reference to the `BloomFilter` instance that
was applied to `pieceContainer`. `PostProcessController.setBloomSpike()` sets:
```
spikeStrength    = strength
spikeDurationMs  = durationMs
spikeRemainingMs = durationMs
baselineStrength = <the original BloomFilter strength, 1.2>
```
`tick()` linearly interpolates `BloomFilter.blur` (PixiJS v8's `BloomFilter`
constructor accepts a scalar `strength`; the resulting filter has a `blur` property)
from `spikeStrength` back toward `baselineStrength` as `spikeRemainingMs` drains.

On Canvas renderer (where `attachPostProcess()` returns early) the returned controller
is a no-op stub (`setBloomSpike: () => {}`, `tick: () => {}`).

### 3.3 Tetris bloom spike parameters

The Tetris line-clear triggers `postProcessController.setBloomSpike(4.0, 500)` — bloom
climbs from 1.2 to 4.0, then decays linearly back to 1.2 over 500 ms. The spike is
requested from `EffectsRenderer` by accepting the controller as a constructor argument
or via a setter. The setter approach is cleaner for incremental addition:

```typescript
setPostProcessController(controller: PostProcessController): void
```

Called once from `main.ts` after both objects are constructed.

---

## 4. Particle Pool & Performance Strategy

### 4.1 Pool sizing rationale

Worst-case simultaneous demand:
- Tetris flash: 0 pool particles (uses `Graphics`)
- Line-clear particles: 4 rows × 30 = 120 pool particles
- Piece-lock burst: 25 pool particles
- **Total worst case: 145 pool particles**

The revised pool of **300** provides >2× head-room. Pool expansion is compile-time
(constant change); no dynamic allocation occurs at runtime.

### 4.2 Particle size differentiation

| Emitter | Size | Color | Lifetime |
|---|---|---|---|
| Line-clear (existing) | 4 px | White | 400 ms |
| Piece-lock burst | 6 px | Piece color | 500 ms |

The `Particle` interface gains an optional `color` field. Before activation, the
sprite's `tint` is set to the requested color (PixiJS `Sprite.tint`). On deactivation,
tint is reset to `0xffffff` (neutral). `Texture.WHITE` stays as the sprite texture.

---

## 5. `src/main.ts` — Wiring

### 5.1 New imports

```typescript
import type { PostProcessController } from './renderer/postProcess.js'
```

No new layer imports — all new things are in `src/renderer/`.

### 5.2 PostProcessController wiring

```typescript
const postProcessController = attachPostProcess(boardContainer, pieceContainer, app)
effectsRenderer.setPostProcessController(postProcessController)
```

`attachPostProcess()` return type changes from `void` to `PostProcessController`.

### 5.3 Piece-lock payload enrichment

In the tick loop, after `updateGameState()`, before `effectsRenderer.onEvents()`:

```typescript
// Enrich piece-lock events with the just-locked piece (now in stateBeforeUpdate)
const enrichedEvents = result.events.map(e =>
  e.type === 'piece-lock'
    ? { ...e, payload: { piece: stateBeforeTick.activePiece } }
    : e
)
if (enrichedEvents.length > 0) {
  effectsRenderer.onEvents(enrichedEvents)
  audioManager.onEvents(result.events)  // audio gets original, unenriched events
}
```

`stateBeforeTick` is the `state` value captured before calling `updateGameState()`.

### 5.4 Level-up event forwarding

`onEvents()` already routes all events; `level-up` events will be picked up
automatically once the `level-up` branch is added to `onEvents()` in `effects.ts`.
No additional `main.ts` wiring is needed for level-up.

### 5.5 `effectsRenderer.tick()` signature change

The call in the render loop changes from:
```typescript
effectsRenderer.tick(delta)
```
to:
```typescript
effectsRenderer.tick(delta, renderState)
```

`renderState` is already declared in `main.ts` as the last committed `GameState`
snapshot — it is identical to `state` at render time.

### 5.6 `effectsRenderer.resizeScreen()` call

In `handleResize()`, after `effectsRenderer.resize(...)`:
```typescript
effectsRenderer.resizeScreen(window.innerWidth, window.innerHeight)
```

### 5.7 `postProcessController.tick()` call

In the render-phase section of the loop (after `effectsRenderer.tick()`):
```typescript
postProcessController.tick(delta)
```

---

## 6. Compatibility Impact

### Contract surface changes

`attachPostProcess()` return type changes from `void` to `PostProcessController`. The
current caller (`main.ts`) ignores the return value, so this is source-compatible — it
compiles without changes to the call site. The function signature (parameters) is
unchanged.

`EffectsRenderer.tick()` gains a mandatory second parameter `state: GameState`. The
current call site in `main.ts` must be updated (see §5.5). No external tests call
`tick()` directly on the renderer; the test file for effects (if any) will need
updating.

`EffectsRenderer` constructor is unchanged.

**Compatibility: No public API contract surface changes detected.** Both modifications
are internal renderer-layer changes visible only inside `main.ts`, which is the sole
consumer. No CLI flags, command names, agent names, placeholders, or config keys are
affected.

---

## 7. Risks & Considerations

### 7.1 Frame rate under heavy effects

A Tetris clear fires: full-screen flash Graphics, edge pulse Graphics, ≥120 pool
particle sprites, bloom spike, and 4 shimmer roundRects. On low-end mobile with the
Canvas renderer (no WebGL), the `BloomFilter` and `GlowFilter` are already skipped by
`postProcess.ts`. The screen-space Graphics overlays are a small number of draw calls.
The 120 particle sprites are `Sprite` objects which PixiJS batches efficiently. The
60fps target should be maintainable on mid-range hardware; this should be verified by
manual profiling in the browser dev tools after implementation.

### 7.2 Particle pool starvation

If a player triggers multiple rapid line-clears with overlapping lifetimes (possible at
high levels with gravity-accelerated piece locking), pool demand could reach 145
particles. The 300-particle pool prevents starvation. If the pool is exhausted, the
existing code simply skips additional activations — no crash, just visual degradation.
This is acceptable.

### 7.3 Shimmer on ghost piece

The idle shimmer is drawn in board-relative coordinates using the active piece's cell
positions. The ghost piece is rendered by `PieceRenderer` in its own container.
The shimmer overlay should NOT draw on ghost cells — use `getCells(piece)` not ghost
cells. The shimmer container sits above the board but below `effectsContainer` in the
draw order; it is owned by `EffectsRenderer.boardContainer` which is already above
`pieceContainer` in `main.ts`'s stage hierarchy. This means shimmer will overdraw the
active piece cells, which is intentional (it is a glow-on-top effect). If the ordering
is visually wrong, the `shimmerGraphics` can be moved to `pieceContainer` instead, but
that would require `PieceRenderer` to expose a reference or `main.ts` to pass a
container into `EffectsRenderer` — avoid this; keep shimmer in `EffectsRenderer`.

### 7.4 Tetris + level-up event ordering

The engine always emits `line-clear` before `level-up` in the same tick (see
`updateGameState` source). When processing `onEvents`, handle `line-clear` first, then
`level-up`. The level-up handler checks for active Tetris flash before deciding whether
to add the background overlay (see §2.6), so ordering matters and must be preserved.
Process events in the array order in which they arrive — do not sort or reorder.

### 7.5 `getCells` import in `effects.ts`

The shimmer needs `getCells` from `src/engine/rotation.js`. This is a renderer →
engine import, which is permitted. `pieceRenderer.ts` already imports `getCells` from
the same path. There is no boundary violation.
