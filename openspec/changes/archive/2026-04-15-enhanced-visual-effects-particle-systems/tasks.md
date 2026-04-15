# Tasks: enhanced-visual-effects-particle-systems

All tasks are in the `[renderer]` layer unless marked `[main]`. Tasks must be executed
in order; each has a compile-check gate before the next begins.

---

## T1: [renderer] Extend particle pool and add piece-lock burst to `EffectsRenderer`

**Files:**
- Modify: `src/renderer/effects.ts`

**Steps:**

### T1a — Expand imports
Add to the existing import block:
```typescript
import { getCells } from '../engine/rotation.js'
import type { ActivePiece } from '../engine/rotation.js'
import { PIECE_COLORS } from '../engine/pieces.js'
import { CELL_COLORS } from './boardRenderer.js'
```

### T1b — Expand pool and constants
Replace:
```typescript
const PARTICLE_POOL_SIZE = 200
```
With:
```typescript
const PARTICLE_POOL_SIZE = 300
```

Add new constants after `PARTICLE_POOL_SIZE`:
```typescript
/** Particles emitted per piece lock. */
const LOCK_BURST_COUNT = 25

/** Lifetime for piece-lock burst particles in ms. */
const LOCK_BURST_DURATION_MS = 500

/** Size of lock-burst particles in px. */
const LOCK_BURST_PARTICLE_SIZE = 6
```

### T1c — Add `color` field to `Particle` interface
Replace the `Particle` interface:
```typescript
interface Particle {
  sprite: Sprite
  vx: number
  vy: number
  life: number
  maxLife: number
  color: number  // tint color for this particle
}
```

### T1d — Initialize `color` in pool construction
In the pool construction loop, change the push call:
```typescript
this.particlePool.push({
  sprite,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: PARTICLE_DURATION_MS,
  color: 0xffffff,
})
```

### T1e — Update `triggerParticles()` to accept an optional color and size
Replace the existing `triggerParticles(row: number)` method signature and
implementation:
```typescript
private triggerParticles(row: number, color = 0xffffff, count = PARTICLES_PER_ROW, size = 4): void {
  const rowY = (row + 0.5) * this.cellSize
  const rowWidth = BOARD_COLS * this.cellSize

  let activated = 0
  for (const particle of this.particlePool) {
    if (activated >= count) break
    if (particle.sprite.visible) continue

    particle.sprite.visible = true
    particle.sprite.alpha = 1
    particle.sprite.width = size
    particle.sprite.height = size
    particle.sprite.tint = color
    particle.sprite.x = Math.random() * rowWidth
    particle.sprite.y = rowY
    particle.sprite.scale.set(Math.random() * 0.5 + 0.5)

    particle.vx = (Math.random() - 0.5) * 4
    particle.vy = -(Math.random() * 3 + 1)
    particle.life = PARTICLE_DURATION_MS
    particle.maxLife = PARTICLE_DURATION_MS
    particle.color = color

    activated++
  }
}
```

### T1f — Add `triggerPieceLockBurst()` method
Add after `triggerParticles()`:
```typescript
/**
 * Emit a radial burst of ≥20 particles from the centroid of the locked piece.
 * Particle color matches the piece type's Guideline color.
 */
private triggerPieceLockBurst(piece: ActivePiece): void {
  const colorIndex = PIECE_COLORS[piece.type]
  const color = CELL_COLORS[colorIndex] ?? 0xffffff

  const cells = getCells(piece)
  // Compute piece centroid in board-space pixel coordinates
  let sumCol = 0
  let sumRow = 0
  for (const [r, c] of cells) {
    sumRow += r
    sumCol += c
  }
  const cx = (sumCol / 4 + 0.5) * this.cellSize
  const cy = (sumRow / 4 + 0.5) * this.cellSize

  let activated = 0
  for (const particle of this.particlePool) {
    if (activated >= LOCK_BURST_COUNT) break
    if (particle.sprite.visible) continue

    // Uniformly distribute angles around 360°
    const angle = (activated / LOCK_BURST_COUNT) * Math.PI * 2 + Math.random() * 0.4
    const speed = 2 + Math.random() * 4

    particle.sprite.visible = true
    particle.sprite.alpha = 1
    particle.sprite.width = LOCK_BURST_PARTICLE_SIZE
    particle.sprite.height = LOCK_BURST_PARTICLE_SIZE
    particle.sprite.tint = color
    particle.sprite.x = cx
    particle.sprite.y = cy
    particle.sprite.scale.set(Math.random() * 0.5 + 0.5)

    particle.vx = Math.cos(angle) * speed
    particle.vy = Math.sin(angle) * speed
    particle.life = LOCK_BURST_DURATION_MS
    particle.maxLife = LOCK_BURST_DURATION_MS
    particle.color = color

    activated++
  }
}
```

### T1g — Wire `piece-lock` in `onEvents()`
In the `onEvents()` method, add a branch after the `line-clear` branch:
```typescript
if (event.type === 'piece-lock') {
  const payload = event.payload as { piece: ActivePiece } | undefined
  if (payload?.piece) {
    this.triggerPieceLockBurst(payload.piece)
  }
}
```

### T1h — Reset tint on particle deactivation
In `tick()`, in the particle update loop, inside the `particle.life <= 0` block:
```typescript
if (particle.life <= 0) {
  particle.sprite.visible = false
  particle.sprite.tint = 0xffffff  // reset tint for pool reuse
  continue
}
```

**Acceptance check:**
- `npm run build` passes (TypeScript, no errors).
- `npm run lint` passes.
- Firing a `piece-lock` event with a mock `ActivePiece` payload calls no engine
  functions (no imports from input/ or ui/).
- Pool size is 300 (verify constant).
- `npm test` — all existing tests pass unchanged.

---

## T2: [renderer] Scale line-clear effects to line count (single / double / triple / Tetris)

**Files:**
- Modify: `src/renderer/effects.ts`

**Steps:**

### T2a — Add screen-space fields and constants

Add constants after the existing effect constants:
```typescript
/** Edge pulse intensity levels. */
const EDGE_PULSE_CONFIGS = {
  medium: { strokeWidth: 6,  color: 0x00f0f0, alpha: 0.7,  durationMs: 400 },
  strong: { strokeWidth: 10, color: 0xa000f0, alpha: 0.85, durationMs: 500 },
  max:    { strokeWidth: 14, color: 0xffffff, alpha: 1.0,  durationMs: 600 },
} as const
```

### T2b — Add screen-space container and overlay fields

In the class field declarations, add after `private offsetY = 0`:
```typescript
/** Screen-space container (no board offset). Hosts full-viewport overlays. */
private screenContainer: Container
/** Screen width/height for full-viewport effects. Updated by resizeScreen(). */
private screenW = 800
private screenH = 600
/** Pre-allocated edge pulse overlay (screen-space, stroke rect). */
private edgePulseOverlay: Graphics
private edgePulseLife = 0
private edgePulseDuration = 0
/** Pre-allocated Tetris flash overlay (screen-space, filled rect). */
private tetrisFlashOverlay: Graphics
private tetrisFlashLife = 0
```

### T2c — Initialize screen-space fields in constructor

In the constructor body, after `stage.addChild(this.container)`:
```typescript
// Screen-space container (passed-in stage has no offset — use it directly)
this.screenContainer = stage

// Pre-allocate full-viewport overlays (not yet visible)
this.edgePulseOverlay = new Graphics()
this.edgePulseOverlay.visible = false
this.screenContainer.addChild(this.edgePulseOverlay)

this.tetrisFlashOverlay = new Graphics()
this.tetrisFlashOverlay.visible = false
this.screenContainer.addChild(this.tetrisFlashOverlay)
```

### T2d — Add `resizeScreen()` method
Add after `resize()`:
```typescript
resizeScreen(w: number, h: number): void {
  this.screenW = w
  this.screenH = h
}
```

### T2e — Update `triggerLineClearEffects()` to be count-aware

Replace the existing `triggerLineClearEffects(rows: number[])` method:
```typescript
private triggerLineClearEffects(rows: number[], count: number): void {
  // Flash and particles per row (unchanged behavior)
  for (const row of rows) {
    this.triggerFlash(row)
    this.triggerParticles(row)
  }

  // Scaled extras based on count
  if (count === 2) {
    this.triggerEdgePulse('medium')
  } else if (count === 3) {
    this.triggerEdgePulse('strong')
  } else if (count >= 4) {
    this.triggerTetrisFlash()
    this.triggerEdgePulse('max')
  }
}
```

### T2f — Update `onEvents()` to pass count into `triggerLineClearEffects()`

Change the `line-clear` branch in `onEvents()`:
```typescript
if (event.type === 'line-clear') {
  const payload = event.payload as { rows: number[]; count: number } | undefined
  if (payload && Array.isArray(payload.rows)) {
    this.triggerLineClearEffects(payload.rows, payload.count ?? 1)
  }
}
```

### T2g — Add `triggerEdgePulse()` method

Add after `triggerPieceLockBurst()`:
```typescript
private triggerEdgePulse(intensity: 'medium' | 'strong' | 'max'): void {
  const cfg = EDGE_PULSE_CONFIGS[intensity]
  const g = this.edgePulseOverlay
  g.clear()
  g.setStrokeStyle({ width: cfg.strokeWidth, color: cfg.color, alpha: cfg.alpha })
  g.rect(0, 0, this.screenW, this.screenH)
  g.stroke()
  g.visible = true
  g.alpha = cfg.alpha
  this.edgePulseLife = cfg.durationMs
  this.edgePulseDuration = cfg.durationMs
}
```

### T2h — Animate edge pulse in `tick()`

In `tick()`, after the particle update loop, add:
```typescript
// Update edge pulse
if (this.edgePulseLife > 0) {
  this.edgePulseLife -= dtMs
  if (this.edgePulseLife <= 0) {
    this.edgePulseOverlay.visible = false
    this.edgePulseLife = 0
  } else {
    this.edgePulseOverlay.alpha = Math.max(0, this.edgePulseLife / this.edgePulseDuration)
  }
}
```

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- Single line-clear emits no edge pulse (existing behavior preserved).
- Double/triple clear shows edge pulse Graphics (manually verifiable in browser).
- `npm test` — all existing tests pass.

---

## T3: [renderer] Add Tetris full-screen flash overlay

**Files:**
- Modify: `src/renderer/effects.ts`

**Steps:**

### T3a — Add Tetris flash constants

Add constants:
```typescript
/** Duration of the Tetris full-screen flash in ms. */
const TETRIS_FLASH_DURATION_MS = 300

/** Starting alpha for the Tetris flash overlay. */
const TETRIS_FLASH_ALPHA = 0.8
```

### T3b — Add `triggerTetrisFlash()` method

Add after `triggerEdgePulse()`:
```typescript
/**
 * Full-viewport white flash for Tetris (4-line) clears.
 * Fades from TETRIS_FLASH_ALPHA to 0 over TETRIS_FLASH_DURATION_MS.
 */
private triggerTetrisFlash(): void {
  const g = this.tetrisFlashOverlay
  g.clear()
  g.rect(0, 0, this.screenW, this.screenH)
  g.fill({ color: 0xffffff, alpha: 1 })
  g.visible = true
  g.alpha = TETRIS_FLASH_ALPHA
  this.tetrisFlashLife = TETRIS_FLASH_DURATION_MS
}
```

### T3c — Animate Tetris flash in `tick()`

After the edge pulse block added in T2h:
```typescript
// Update Tetris flash overlay
if (this.tetrisFlashLife > 0) {
  this.tetrisFlashLife -= dtMs
  if (this.tetrisFlashLife <= 0) {
    this.tetrisFlashOverlay.visible = false
    this.tetrisFlashLife = 0
  } else {
    this.tetrisFlashOverlay.alpha = Math.max(
      0,
      (this.tetrisFlashLife / TETRIS_FLASH_DURATION_MS) * TETRIS_FLASH_ALPHA
    )
  }
}
```

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- A 4-line clear in the browser shows a white screen flash that fades out.
- `npm test` passes.

---

## T4: [renderer] Add level-up screen-edge pulse and background tint

**Files:**
- Modify: `src/renderer/effects.ts`

**Steps:**

### T4a — Add level-up overlay field and constant

Add to the class field declarations:
```typescript
/** Pre-allocated level-up tint overlay (screen-space, filled rect). */
private levelUpOverlay: Graphics
private levelUpLife = 0
```

Add constant:
```typescript
/** Level-up tint overlay duration in ms. */
const LEVEL_UP_TINT_DURATION_MS = 800
```

### T4b — Initialize level-up overlay in constructor

After the `tetrisFlashOverlay` initialization in the constructor (from T2c):
```typescript
this.levelUpOverlay = new Graphics()
this.levelUpOverlay.visible = false
this.screenContainer.addChild(this.levelUpOverlay)
```

### T4c — Add `triggerLevelUp()` method

Add after `triggerTetrisFlash()`:
```typescript
/**
 * Level-up visual: gold screen-edge pulse + translucent gold background tint.
 * If a Tetris flash is currently active, skip the background tint (Tetris takes
 * visual priority); only add the edge pulse.
 */
private triggerLevelUp(): void {
  // Gold edge pulse
  const g = this.edgePulseOverlay
  g.clear()
  g.setStrokeStyle({ width: 10, color: 0xf0a000, alpha: 0.9 })
  g.rect(0, 0, this.screenW, this.screenH)
  g.stroke()
  g.visible = true
  g.alpha = 0.9
  this.edgePulseLife = LEVEL_UP_TINT_DURATION_MS
  this.edgePulseDuration = LEVEL_UP_TINT_DURATION_MS

  // Background tint only if Tetris flash is not already active
  if (this.tetrisFlashLife <= 0) {
    const overlay = this.levelUpOverlay
    overlay.clear()
    overlay.rect(0, 0, this.screenW, this.screenH)
    overlay.fill({ color: 0xf0a000, alpha: 1 })
    overlay.visible = true
    overlay.alpha = 0.15
    this.levelUpLife = LEVEL_UP_TINT_DURATION_MS
  }
}
```

### T4d — Wire `level-up` in `onEvents()`

In `onEvents()`, add after the `piece-lock` branch:
```typescript
if (event.type === 'level-up') {
  this.triggerLevelUp()
}
```

### T4e — Animate level-up tint in `tick()`

After the Tetris flash block in `tick()`:
```typescript
// Update level-up tint overlay
if (this.levelUpLife > 0) {
  this.levelUpLife -= dtMs
  if (this.levelUpLife <= 0) {
    this.levelUpOverlay.visible = false
    this.levelUpLife = 0
  } else {
    this.levelUpOverlay.alpha = Math.max(
      0,
      (this.levelUpLife / LEVEL_UP_TINT_DURATION_MS) * 0.15
    )
  }
}
```

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- Level-up shows gold edge pulse visible in browser.
- When level-up coincides with a Tetris clear, only one background overlay is active.
- `npm test` passes.

---

## T5: [renderer] Add active-piece idle shimmer/glow

**Files:**
- Modify: `src/renderer/effects.ts`

**Steps:**

### T5a — Add shimmer imports

Add to the import block (after existing imports from T1a or alongside them):
```typescript
import type { GameState } from '../engine/gameState.js'
```

### T5b — Add shimmer fields

In the class field declarations, add:
```typescript
/** Oscillating shimmer overlay on the active piece cells. */
private shimmerGraphics: Graphics
/** Phase accumulator for shimmer sine wave (radians). */
private shimmerPhase = 0
```

### T5c — Initialize shimmer in constructor

After the particle pool allocation loop, before the closing brace:
```typescript
// Shimmer overlay lives in the board-relative container
this.shimmerGraphics = new Graphics()
this.boardContainer.addChild(this.shimmerGraphics)
```

Note: Rename the internal `this.container` field to `this.boardContainer` throughout
the class at this step to match the new nomenclature introduced in the design. The field
was called `this.container` in the original code; rename all 6 references inside
`effects.ts` only (the constructor, `resize()`, flash trigger, particle init loop, and
`tick()` flash cleanup).

### T5d — Update `tick()` signature to accept `GameState`

Change the method signature:
```typescript
tick(dtMs: number, state: GameState): void {
```

### T5e — Add shimmer update logic at the top of `tick()`

At the very beginning of `tick()`, before the flash update loop:
```typescript
// --- Shimmer update ---
this.shimmerPhase += (2 * Math.PI * 1.5) * (dtMs / 1000)

if (state.phase === 'playing' && state.activePiece !== null) {
  const piece = state.activePiece
  const cells = getCells(piece)
  const alpha = 0.12 + 0.06 * Math.sin(this.shimmerPhase)
  const size = this.cellSize - 2

  this.shimmerGraphics.clear()
  for (const [row, col] of cells) {
    if (row < 0 || col < 0) continue
    const x = col * this.cellSize + 1
    const y = row * this.cellSize + 1
    this.shimmerGraphics.roundRect(x, y, size, size, 2)
  }
  this.shimmerGraphics.fill({ color: 0xffffff, alpha })
  this.shimmerGraphics.visible = true
} else {
  this.shimmerGraphics.clear()
  this.shimmerGraphics.visible = false
}
```

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- Active piece shows a subtle pulsing glow overlay in the browser (low alpha, white).
- Shimmer disappears when game is paused or in gameover phase.
- Shimmer does not appear on ghost piece cells (it uses `getCells(piece)` not ghost).
- `npm test` passes (tests that call `tick()` must be updated to pass a `GameState`
  argument — see T7).

---

## T6: [renderer] Extend `postProcess.ts` with transient bloom intensity controller

**Files:**
- Modify: `src/renderer/postProcess.ts`

**Steps:**

### T6a — Add `PostProcessController` interface and export

Above the `attachPostProcess` function, add:
```typescript
/** Controller returned by attachPostProcess() for dynamic post-process adjustments. */
export interface PostProcessController {
  /**
   * Spike the bloom blur strength to `strength` and linearly decay back to
   * `baselineStrength` over `durationMs` milliseconds.
   */
  setBloomSpike(strength: number, durationMs: number): void
  /**
   * Advance the bloom decay animation. Call every render frame with elapsed ms.
   */
  tick(dtMs: number): void
}
```

### T6b — Add no-op stub factory

After the interface, add:
```typescript
function noOpController(): PostProcessController {
  return {
    setBloomSpike: () => undefined,
    tick: () => undefined,
  }
}
```

### T6c — Update `attachPostProcess()` return type

Change the function signature:
```typescript
export function attachPostProcess(
  boardContainer: Container,
  pieceContainer: Container,
  app: Application
): PostProcessController {
```

### T6d — Return no-op on Canvas renderer

Replace the early return in the Canvas guard:
```typescript
if (app.renderer.type === RendererType.CANVAS) {
  return noOpController()
}
```

### T6e — Implement the live controller inside the try block

After the existing filter attachment code (inside the `try` block), before the closing
brace:
```typescript
const BASELINE_BLOOM = 1.2
const bloomFilter = new BloomFilter(BASELINE_BLOOM) as unknown as BloomFilterType
pieceContainer.filters = [
  new GlowFilter({ distance: 12, outerStrength: 2, color: 0xffffff }) as unknown as Filter,
  bloomFilter,
]

let spikeStrength = BASELINE_BLOOM
let spikeRemainingMs = 0
let spikeDurationMs = 1

const controller: PostProcessController = {
  setBloomSpike(strength: number, durationMs: number): void {
    spikeStrength = strength
    spikeRemainingMs = durationMs
    spikeDurationMs = durationMs
    ;(bloomFilter as unknown as { blur: number }).blur = strength
  },
  tick(dtMs: number): void {
    if (spikeRemainingMs <= 0) return
    spikeRemainingMs -= dtMs
    if (spikeRemainingMs <= 0) {
      spikeRemainingMs = 0
      ;(bloomFilter as unknown as { blur: number }).blur = BASELINE_BLOOM
    } else {
      const t = spikeRemainingMs / spikeDurationMs  // 1.0 → 0.0
      const current = BASELINE_BLOOM + (spikeStrength - BASELINE_BLOOM) * t
      ;(bloomFilter as unknown as { blur: number }).blur = current
    }
  },
}

return controller
```

Note: The existing `new BloomFilter(1.2)` line is replaced above by a named variable
`bloomFilter`. Remove the old anonymous inline `new BloomFilter(1.2)` from
`pieceContainer.filters` and substitute `bloomFilter`.

Add a local type alias to avoid repeating the cast:
```typescript
type BloomFilterType = { blur: number } & Filter
```
Place this alias at the top of the file (after imports).

### T6f — Add catch-clause fallback return

In the catch block, change the existing empty handler to also return a no-op:
```typescript
} catch (e) {
  console.warn('Post-processing filters could not be attached:', e)
  return noOpController()
}
```

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- `attachPostProcess()` return value is typed `PostProcessController`.
- Calling `setBloomSpike(4.0, 500)` then `tick(250)` results in `bloom.blur ≈ 2.6`
  (midpoint between 4.0 and 1.2). (This can be verified with a focused unit test or
  manual inspection.)
- `npm test` passes.

---

## T7: [main] Wire all new effects into the game loop

**Files:**
- Modify: `src/main.ts`

**Steps:**

### T7a — Import `PostProcessController` type

Add to the renderer import block (after `import { attachPostProcess }`):
```typescript
import type { PostProcessController } from './renderer/postProcess.js'
```

### T7b — Capture `PostProcessController` from `attachPostProcess()`

Replace:
```typescript
attachPostProcess(boardContainer, pieceContainer, app)
```
With:
```typescript
const postProcessController: PostProcessController = attachPostProcess(boardContainer, pieceContainer, app)
```

### T7c — Pass controller to `EffectsRenderer`

After instantiating `effectsRenderer`:
```typescript
effectsRenderer.setPostProcessController(postProcessController)
```

This requires adding the `setPostProcessController()` method to `EffectsRenderer`
(add it in `src/renderer/effects.ts` as part of this task):

```typescript
/** Receives the PostProcessController so EffectsRenderer can trigger bloom spikes. */
setPostProcessController(controller: import('./postProcess.js').PostProcessController): void {
  this.postProcessController = controller
}
```

Add the field to `EffectsRenderer`:
```typescript
private postProcessController: import('./postProcess.js').PostProcessController | null = null
```

In `triggerTetrisFlash()`, add at the end:
```typescript
this.postProcessController?.setBloomSpike(4.0, 500)
```

### T7d — Enrich `piece-lock` events with the locked piece

In the tick loop, capture the state before `updateGameState()`:
```typescript
const stateBeforeTick = state  // capture for piece-lock payload enrichment
const result = updateGameState(state, allActions, LOGIC_TICK_MS)
state = result.state
renderState = state
```

Replace the existing event-dispatch block:
```typescript
if (result.events.length > 0) {
  effectsRenderer.onEvents(result.events)
  audioManager.onEvents(result.events)
}
```
With:
```typescript
if (result.events.length > 0) {
  // Enrich piece-lock events with the just-locked piece (now gone from new state)
  const enrichedEvents = result.events.map(e =>
    e.type === 'piece-lock'
      ? { ...e, payload: { piece: stateBeforeTick.activePiece } }
      : e
  )
  effectsRenderer.onEvents(enrichedEvents)
  audioManager.onEvents(result.events)  // audio receives original unenriched events
}
```

### T7e — Update `effectsRenderer.tick()` call to pass `renderState`

Replace:
```typescript
effectsRenderer.tick(delta)
```
With:
```typescript
effectsRenderer.tick(delta, renderState)
```

### T7f — Call `effectsRenderer.resizeScreen()` in `handleResize()`

After `effectsRenderer.resize(cellSize, offsetX, offsetY)`:
```typescript
effectsRenderer.resizeScreen(window.innerWidth, window.innerHeight)
```

### T7g — Call `postProcessController.tick()` in the render loop

After `effectsRenderer.tick(delta, renderState)`:
```typescript
postProcessController.tick(delta)
```

**Acceptance check:**
- `npm run build` passes with zero TypeScript errors.
- `npm run lint` passes.
- `npm test` — all existing tests pass (any test that called `effectsRenderer.tick()`
  directly is updated to supply a dummy `GameState` with `phase: 'gameover'` or similar
  to suppress shimmer rendering, as described in T7h below if needed).

### T7h — Fix any test breakage from `tick()` signature change

If any test file calls `effectsRenderer.tick(dtMs)`, update those calls to
`effectsRenderer.tick(dtMs, { phase: 'gameover', activePiece: null } as GameState)`.
Check `src/__tests__/` for references:
```
src/__tests__/renderer/effects.test.ts  (if it exists)
```
If the test file does not exist, no action is needed.

---

## T8: [renderer] Write / update unit tests for `effects.ts`

**Files:**
- Create or modify: `src/__tests__/renderer/effects.test.ts`

**Steps:**

Use the same `vi.mock('pixi.js', ...)` factory pattern from other renderer tests
(mock `Container`, `Graphics`, `Sprite`, `Texture`). Since `getCells` and `PIECE_COLORS`
are real engine functions with no PixiJS dependency, import them directly without
mocking.

Write or add the following test cases:

1. **Pool size is 300:** After constructing `new EffectsRenderer(mockStage)`, verify
   that 300 sprite objects were added to the internal board container (by inspecting
   `mockStage.children` depth or counting Graphics/Sprite mocks).

2. **Piece-lock burst activates ≥20 particles:**
   ```typescript
   const mockPiece: ActivePiece = { type: 'I', rotation: 0, row: 5, col: 3 }
   effectsRenderer.onEvents([{ type: 'piece-lock', payload: { piece: mockPiece } }])
   // Count visible sprites (tint set, visible = true)
   ```

3. **Line-clear count=1: no edge pulse emitted:**
   Call `onEvents([{ type: 'line-clear', payload: { rows: [5], count: 1 } }])`.
   Verify edge pulse `Graphics.visible === false`.

4. **Line-clear count=2: edge pulse is shown:**
   Call with `count: 2`. Verify `edgePulseOverlay.visible === true`.

5. **Line-clear count=4: Tetris flash is shown:**
   Call with `count: 4`. Verify `tetrisFlashOverlay.visible === true`.

6. **Level-up event triggers edge pulse:**
   Call `onEvents([{ type: 'level-up' }])`. Verify `edgePulseOverlay.visible === true`.

7. **Tick drains flash/pulse life:**
   Trigger edge pulse, then call `tick(600, mockGameOverState)`. Verify
   `edgePulseOverlay.visible === false`.

8. **Shimmer is visible during playing phase:**
   ```typescript
   const playingState = { phase: 'playing', activePiece: { type: 'T', rotation: 0, row: 5, col: 3 } } as GameState
   effectsRenderer.resize(30, 0, 0)
   effectsRenderer.tick(16, playingState)
   // shimmerGraphics should have been drawn (clear() called then roundRect × 4)
   ```

9. **Shimmer is cleared during gameover phase:**
   Call `tick(16, { phase: 'gameover', activePiece: null } as GameState)`.
   Verify `shimmerGraphics.visible === false`.

**Acceptance check:**
- `npx vitest run src/__tests__/renderer/effects.test.ts` — all tests pass.
- `npm test` (full suite) passes.
- `npm run test:coverage` — engine coverage threshold maintained.

---

## T9: [main] Final integration verification

**Files:**
- No new files.

**Steps:**
1. `npm run build` — must pass with zero errors.
2. `npm run lint` — must pass with zero warnings on `src/`.
3. `npm test` — full test suite passes.
4. `npm run test:coverage` — engine branch coverage remains ≥ 80%.
5. Manual browser verification:
   - Piece lock: burst of ~25 colored particles emanates from the locked piece.
   - Single clear: row flash + upward white particles (unchanged behavior).
   - Double clear: above + cyan edge pulse fades out.
   - Triple clear: above + purple edge pulse.
   - Tetris (4-line): white screen flash + white edge pulse + particles + bloom spike (~0.5s).
   - Level-up: gold edge pulse + brief warm background tint.
   - Active piece: subtle white shimmer pulses at ~1.5 Hz; stops when paused.
   - Pause/resume: shimmer stops on pause, resumes on unpause.
   - Resize: all overlays fit new viewport dimensions.
   - 60fps maintained (verify with browser dev tools frame rate display).

**Acceptance check:**
- All `npm run` checks pass.
- All manual items confirmed.
