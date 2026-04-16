# Context Bundle: Juicy Visual Effects Suite

This document collects the key patterns, conventions, and facts a developer needs to
implement this change without needing to read the entire codebase.

---

## Layer Boundaries (enforced by ESLint)

```
input → main.ts → engine → renderer
                         → ui
```

- `src/renderer/` must NOT import from `src/input/` or `src/ui/`.
- `src/engine/` must NOT import from any other layer.
- `src/engine/types.ts` is zero-dependency; all layers may import it.
- `src/main.ts` is the ONLY file allowed to import across layers.

This ticket touches `src/renderer/effects.ts`, `src/renderer/pieceRenderer.ts`, and
`src/main.ts`. All changes are legal under these rules. A new file
`src/renderer/shakeEffect.ts` is a renderer-layer file — it may import from `pixi.js`
but not from `src/input/` or `src/ui/`.

---

## Key Files

| File | Role |
|------|------|
| `src/renderer/effects.ts` | `EffectsRenderer` class: particles, flashes, shimmer, level-up. Main target. |
| `src/renderer/postProcess.ts` | `attachPostProcess()` + `PostProcessController`. Bloom spike already wired. |
| `src/renderer/pieceRenderer.ts` | Draws active piece + ghost. Ghost alpha is static. |
| `src/renderer/boardRenderer.ts` | Draws locked board cells. Not modified by this ticket. |
| `src/engine/types.ts` | `GameAction`, `GameEvent`, `GameEventType`. Read-only. |
| `src/engine/gameState.ts` | `GameState` interface, `updateGameState()`. Read-only. |
| `src/main.ts` | Game loop, event forwarding, phase transitions. Wires all layers. |

---

## Existing GameEvent Types (from `src/engine/types.ts`)

```typescript
export type GameEventType = 'line-clear' | 'piece-lock' | 'level-up' | 'game-over'
```

No new `GameEventType` values are added by this ticket.

### Existing payloads (as emitted by engine):

- `'piece-lock'`: `payload` is undefined (engine emits no payload).
  `main.ts` enriches it to `{ piece: ActivePiece }` before forwarding to `EffectsRenderer`.
  This ticket extends the enrichment to `{ piece: ActivePiece, isHardDrop: boolean }`.

- `'line-clear'`: `payload` is `{ count: number, rows: number[] }` from the engine.
  This ticket extends it with `combo: number` via `main.ts` enrichment.

- `'level-up'`: `payload` is `{ level: number }`. Unchanged.

- `'game-over'`: Not handled by `EffectsRenderer`. Unchanged.

---

## Event Enrichment Pattern (existing, in `src/main.ts`)

```typescript
// Current enrichment (lines 420-426 in main.ts)
if (result.events.length > 0) {
  const enrichedEvents = result.events.map(e =>
    e.type === 'piece-lock'
      ? { ...e, payload: { piece: stateBeforeTick.activePiece } }
      : e
  )
  effectsRenderer.onEvents(enrichedEvents)
  audioManager.onEvents(result.events)
}
```

The enrichment produces a **new array** of events for the renderer. `audioManager` still
receives the **original** `result.events`. Follow this same pattern — do not alter what
`audioManager` receives.

---

## EffectsRenderer Render Architecture

`EffectsRenderer` is constructed with a `Container` (the `effectsContainer` from `main.ts`).
It internally creates:

- `boardContainer: Container` — board-relative child container. Holds particles, flash
  Graphics, shimmer. Positioned at `(offsetX, offsetY)` via `resize()`.
- `screenContainer: Container` — assigned to the passed-in `stage` (not a new container).
  Holds full-viewport overlays: `edgePulseOverlay`, `tetrisFlashOverlay`, `levelUpOverlay`.

When adding new full-screen overlays (chroma overlays), append them to `screenContainer`.
When adding board-relative effects (combo ripple rings), append them to `boardContainer`.

The `resize(cellSize, offsetX, offsetY)` method updates `boardContainer.x/y`. Full-screen
overlays in `screenContainer` always start at `(0, 0)` and cover the full screen.

---

## Particle Pool Pattern

The 300-particle pool lives in `this.particlePool: Particle[]`. All `Sprite` objects are
pre-allocated and their `visible` flag controls active/inactive state. There is no dynamic
allocation after construction. When activating a particle:

1. Find a particle where `particle.sprite.visible === false`.
2. Set position, velocity, `life`, `maxLife`, color, and flip `visible = true`.
3. `tick()` decrements `life` each frame and sets `visible = false` when `life <= 0`.

The existing `triggerParticles(row, color?, count?, size?)` is a generic helper that
follows this pattern. Do not add another pool — the existing 300-particle pool is
sufficient for existing effects plus the additions in this ticket.

---

## PostProcessController API

```typescript
export interface PostProcessController {
  setBloomSpike(strength: number, durationMs: number): void
  tick(dtMs: number): void
}
```

`EffectsRenderer.setPostProcessController(controller)` receives a reference that is
already wired in `main.ts`. `triggerTetrisFlash()` already calls
`this.postProcessController?.setBloomSpike(4.0, 500)`. No changes needed to this interface.

---

## PixiJS 8 API Notes

### ColorMatrixFilter

Available directly from `'pixi.js'` in v8:
```typescript
import { ColorMatrixFilter } from 'pixi.js'
const f = new ColorMatrixFilter()
f.hue(90, false)   // rotate hue by 90 degrees, no multiply
container.filters = [f]
```
If the named export is not found at build time (PixiJS v8 sometimes restructures exports),
fall back to: `import { ColorMatrixFilter } from '@pixi/filter-color-matrix'`.

### Graphics API (PixiJS v8 style)

All Graphics calls in this codebase use the PixiJS v8 fluent pattern:
```typescript
g.clear()
g.rect(x, y, w, h)
g.fill({ color: 0xffffff, alpha: 1 })
```
For stroke:
```typescript
g.setStrokeStyle({ width: 2, color: 0x00f0f0, alpha: 0.8 })
g.circle(cx, cy, radius)
g.stroke()
```
The old PixiJS v7 `beginFill()` / `endFill()` / `lineStyle()` API is NOT used here.

### Texture.WHITE

The particle pool uses `Texture.WHITE` — a built-in PixiJS v8 1×1 white texture.
Tinting is done via `sprite.tint = color`. No texture atlas is used.

### Filter casting

`@pixi/filter-glow` and `@pixi/filter-bloom` require `as unknown as Filter` casts because
their TypeScript types reference `@pixi/core` (v7) rather than `pixi.js` (v8). This is
already established practice in `postProcess.ts`. Use the same cast pattern if needed for
`ColorMatrixFilter` — though that one is native v8 and likely does not need casting.

---

## Game Loop Structure (relevant excerpt from `main.ts`)

```
loop(now):
  delta = min(now - lastTime, 200ms)
  accumulator += delta

  while accumulator >= LOGIC_TICK_MS:  // 60Hz fixed step
    collect actions (keyboard, touch, mainMenu)
    updateGameState(state, actions, LOGIC_TICK_MS) → { state, events }
    detect phase transitions (intro→playing, etc.)
    enrich + forward events to effectsRenderer and audioManager
    accumulator -= LOGIC_TICK_MS

  edge-detect phase changes (justPaused, justResumed, justGameOver)
  render all layers
  effectsRenderer.tick(delta, renderState)
  postProcessController.tick(delta)
  requestAnimationFrame(loop)
```

`delta` here is the **render frame delta** (native display rate), not the fixed logic
step. `effectsRenderer.tick(dtMs, state)` and `shakeEffect.tick(dtMs)` receive `delta`,
so effects advance at render rate (~16.67ms per frame at 60fps, up to 200ms if capped).

---

## GameState: What Does and Does Not Exist

```typescript
export interface GameState {
  board: Board           // Uint8Array, flat row-major 10×20
  activePiece: ActivePiece | null
  nextPiece: PieceType
  score: number
  level: number
  lines: number
  phase: 'intro' | 'playing' | 'paused' | 'gameover'
  gravityState: GravityState
  pieceBag: PieceType[]
}
```

**Does NOT exist**: `combo`, `hardDropThisTick`, or any renderer-specific state. These
must be tracked outside the engine.

---

## PieceRenderer: Ghost Drawing (current)

```typescript
// In constructor:
const g = new Graphics()
g.alpha = GHOST_ALPHA   // 0.3, set once
this.container.addChild(g)
this.ghostCells.push(g)

// In update():
// Ghost alpha is NOT reset per frame — it stays at the constructor value
for (let i = 0; i < 4; i++) {
  const g = this.ghostCells[i]!
  g.clear()
  if (ghostDiffers) {
    // ... draw cell at ghost position
  }
}
```

To animate alpha: remove the constructor's `g.alpha = GHOST_ALPHA` and set
`g.alpha = ghostAlpha` inside the per-frame draw loop. This is the only change to
`PieceRenderer`.

---

## Conventions

- All imports use `.js` extensions (ESM): `import { Foo } from './foo.js'`
- No default exports: all exports are named.
- TypeScript strict mode: `!` non-null assertions are used for array accesses with known
  bounds (e.g., `this.ghostCells[i]!`). Follow the same pattern.
- Avoid `any`. Use `unknown` for event payloads and cast with `as { field: Type }`.
- Pre-allocate expensive objects in constructors; avoid new allocations in `tick()`.
