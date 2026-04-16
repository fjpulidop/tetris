# Tasks: Juicy Visual Effects Suite

Tasks are ordered by dependency. Each group can be worked within in order; later groups
depend on earlier ones completing.

---

## Group A — Foundational enrichment (main.ts changes that unlock renderer work)

### Task A1: Enrich piece-lock event with isHardDrop flag [main]

Add `isHardDrop: boolean` to the piece-lock event payload enrichment in `main.ts`. The
current enrichment only adds `{ piece: stateBeforeTick.activePiece }`. Extend it so that
locks caused by a hard drop in the same tick are flagged.

**Files:**
- Modify: `src/main.ts`

**What to change:**
In the `result.events.length > 0` block, update the `enrichedEvents` map so that
`'piece-lock'` events receive:
```typescript
{ piece: stateBeforeTick.activePiece, isHardDrop: allActions.includes(GameAction.HardDrop) }
```

**Acceptance criteria:**
- A `'piece-lock'` event fired in the same tick as `GameAction.HardDrop` carries
  `isHardDrop: true` in its payload.
- A `'piece-lock'` from gravity lock carries `isHardDrop: false`.
- No other behavior changes.

**Dependencies:** None.

---

### Task A2: Add combo tracking and enrich line-clear events [main]

Track consecutive-clear streaks in `main.ts` and inject `combo: number` into
`'line-clear'` event payloads before they reach `EffectsRenderer`.

**Files:**
- Modify: `src/main.ts`

**What to change:**
1. Add two variables outside the loop:
   ```typescript
   let consecutiveClearCount = 0
   let lastClearTick = -1
   let tickCounter = 0
   ```
2. At the top of the `while (accumulator >= LOGIC_TICK_MS)` block, increment `tickCounter`.
3. After calling `updateGameState()`, inspect `result.events`:
   - If any event has type `'line-clear'`: increment `consecutiveClearCount`,
     set `lastClearTick = tickCounter`.
   - If any event has type `'piece-lock'` and NO event has type `'line-clear'`:
     reset `consecutiveClearCount = 0`.
4. In the `enrichedEvents` map, extend `'line-clear'` events with `{ combo: consecutiveClearCount }`:
   ```typescript
   e.type === 'line-clear'
     ? { ...e, payload: { ...(e.payload as object), combo: consecutiveClearCount } }
     : e
   ```
   (Apply after the existing `'piece-lock'` enrichment, or combine into one map call.)

**Acceptance criteria:**
- First line-clear on a fresh game: `combo === 1`.
- Second consecutive tick with a line-clear: `combo === 2`.
- After a piece locks without clearing: `combo` resets to 0 on the next clear.
- The `combo` field is present on all `'line-clear'` payloads reaching `EffectsRenderer`.

**Dependencies:** None (can run in parallel with A1).

---

### Task A3: Add elapsed-time tracking for ghost pulse [main]

Accumulate total render-frame elapsed time and pass it to `pieceRenderer.update()`.

**Files:**
- Modify: `src/main.ts`

**What to change:**
1. Add `let totalElapsedMs = 0` outside the loop.
2. Inside `loop()`, after computing `delta`, add `totalElapsedMs += delta`.
3. Change the `pieceRenderer.update(renderState)` call to
   `pieceRenderer.update(renderState, totalElapsedMs / 1000)`.

**Acceptance criteria:**
- `pieceRenderer.update` receives a monotonically increasing `elapsedSec` value.
- Value resets to 0 only on page reload, not on game restart (cosmetic — no gameplay impact).

**Dependencies:** None (can run in parallel with A1 and A2).

---

## Group B — Screen shake infrastructure

### Task B1: Implement ShakeEffect class [renderer]

Create `ShakeEffect` in a new file `src/renderer/shakeEffect.ts`. This class is
instantiated by `main.ts`, receives `app.stage`, and applies a damped sinusoidal
translation.

**Files:**
- Create: `src/renderer/shakeEffect.ts`

**What to implement:**

```typescript
export class ShakeEffect {
  private stage: Container
  private intensity = 0
  private elapsed = 0
  private duration = 0

  constructor(stage: Container) { this.stage = stage }

  triggerShake(intensity: number, durationMs = 250): void {
    // Only upgrade if new shake is stronger
    if (intensity > this.intensity || this.elapsed >= this.duration) {
      this.intensity = intensity
      this.duration = durationMs
      this.elapsed = 0
    }
  }

  reset(): void {
    this.intensity = 0
    this.elapsed = this.duration   // force expired
    this.stage.x = 0
    this.stage.y = 0
  }

  tick(dtMs: number): void {
    if (this.elapsed >= this.duration) {
      this.stage.x = 0
      this.stage.y = 0
      return
    }
    this.elapsed += dtMs
    const t = this.elapsed / 1000  // seconds
    const decay = Math.exp(-20 * t)
    const offset = this.intensity * Math.sin(40 * t) * decay
    this.stage.x = offset
    this.stage.y = offset * 0.4   // less vertical shake than horizontal
  }
}
```

**Acceptance criteria:**
- `triggerShake(6)` causes visible stage translation for ~250ms then returns to 0.
- `reset()` immediately zeroes `stage.x` and `stage.y`.
- A second `triggerShake()` call with higher intensity overrides a weaker active shake.
- A second call with lower intensity is ignored if the current shake is still active.

**Dependencies:** None.

---

### Task B2: Wire ShakeEffect into main.ts [main]

Instantiate `ShakeEffect` in `main.ts` and call `triggerShake()` on the appropriate
events.

**Files:**
- Modify: `src/main.ts`

**What to change:**
1. Import `ShakeEffect` from `./renderer/shakeEffect.js`.
2. After creating `app`, instantiate: `const shakeEffect = new ShakeEffect(app.stage)`.
3. In the event-forwarding block, after `effectsRenderer.onEvents(enrichedEvents)`, add:
   ```typescript
   for (const ev of enrichedEvents) {
     if (ev.type === 'piece-lock') {
       const p = ev.payload as { isHardDrop?: boolean }
       if (p.isHardDrop) shakeEffect.triggerShake(6, 250)
     }
     if (ev.type === 'line-clear') {
       const p = ev.payload as { count?: number }
       if ((p.count ?? 0) >= 4) shakeEffect.triggerShake(10, 300)
     }
   }
   ```
4. In the `loop()` render section, add `shakeEffect.tick(delta)` alongside
   `postProcessController.tick(delta)`.
5. In `justPaused` handler, add `shakeEffect.reset()`.

**Acceptance criteria:**
- Hard drop produces a visible screen shake of ~6px intensity lasting ~250ms.
- Tetris (4-line) upgrades the shake to ~10px lasting ~300ms.
- Gravity locks do not shake the screen.
- Pausing resets the shake immediately.

**Dependencies:** A1, B1.

---

## Group C — Row sweep flash

### Task C1: Upgrade triggerFlash() to animated sweep in EffectsRenderer [renderer]

Replace the instant full-width flash with a left-to-right wipe animation.

**Files:**
- Modify: `src/renderer/effects.ts`

**What to change:**

1. Extend the `FlashEffect` interface:
   ```typescript
   interface FlashEffect {
     graphics: Graphics
     life: number
     totalLife: number      // added
     sweepPhaseMs: number   // added — duration of the wipe phase
   }
   ```

2. Update `triggerFlash(row)`:
   - Set `totalLife = FLASH_DURATION_MS` (unchanged 200ms total).
   - Set `sweepPhaseMs = 80` (wipe completes in 80ms).
   - On creation, draw the `Graphics` at full height but `width = 0`. The `tick()` loop
     will expand the width during the sweep phase.
   - Push `{ graphics: g, life: FLASH_DURATION_MS, totalLife: FLASH_DURATION_MS, sweepPhaseMs: 80 }`.

3. Update the flash update section of `tick()`:
   ```typescript
   const age = flash.totalLife - flash.life
   if (age < flash.sweepPhaseMs) {
     // Sweep phase: expand width
     const progress = age / flash.sweepPhaseMs
     const maxWidth = BOARD_COLS * this.cellSize
     g.clear()
     g.rect(0, y, maxWidth * progress, this.cellSize)
     g.fill({ color: 0xffffff, alpha: 1 })
   } else {
     // Fade phase: full width, decreasing alpha
     g.alpha = Math.max(0, flash.life / (flash.totalLife - flash.sweepPhaseMs))
   }
   ```
   Note: `y` must be stored on the `FlashEffect` for the sweep redraw. Add a `row: number`
   field to the interface.

**Acceptance criteria:**
- A `'line-clear'` event causes a white wipe that sweeps left-to-right across the cleared
  row over ~80ms, then fades out over the remaining ~120ms.
- Multi-row clears produce one sweep per row (staggered start is acceptable but not required).
- Single-line clears (count === 1) still trigger the sweep flash — this is not gated on count.

**Dependencies:** None (can start independently).

---

## Group D — Combo ripple

### Task D1: Implement ComboRippleEffect inside effects.ts [renderer]

Add two pre-allocated ring `Graphics` objects to `EffectsRenderer` and trigger them on
combo line clears.

**Files:**
- Modify: `src/renderer/effects.ts`

**What to add:**

1. Add constants:
   ```typescript
   const RIPPLE_DURATION_MS = 400
   const RIPPLE_MAX_RADIUS = 160  // px; roughly half the board diagonal at default cell size
   ```

2. Add a `RippleState` interface:
   ```typescript
   interface RippleState {
     graphics: Graphics
     life: number
     maxLife: number
     cx: number
     cy: number
     color: number
     peakAlpha: number
   }
   ```

3. In the constructor, pre-allocate two `Graphics` (`ripple0`, `ripple1`) and add them to
   `boardContainer`. Store as `private ripples: RippleState[]` (initially `life = 0`).

4. Add `triggerComboRipple(combo: number): void`:
   - Board center in board-space: `cx = (BOARD_COLS / 2) * cellSize`, `cy = (BOARD_ROWS / 2) * cellSize`.
   - Color from piece palette: `CELL_COLORS[(combo % 7) + 1] ?? 0xffffff`.
   - Peak alpha: `Math.min(0.9, 0.4 + combo * 0.1)`.
   - Assign to the first ripple with `life = 0` (inactive), or the older ripple if both are active.
   - For combo >= 3: schedule a second ripple 80ms later via a `setTimeout` — or, simpler,
     start both ripples simultaneously with the second one starting at `life = RIPPLE_DURATION_MS - 80`
     (i.e., already 80ms "ahead" so it appears 80ms after the first ring visually).

5. In `tick()`, for each ripple where `life > 0`:
   ```typescript
   const t = 1 - (ripple.life / ripple.maxLife)  // 0→1 over lifetime
   const radius = RIPPLE_MAX_RADIUS * t
   const alpha = ripple.peakAlpha * (1 - t)
   g.clear()
   g.setStrokeStyle({ width: 2, color: ripple.color, alpha })
   g.circle(ripple.cx, ripple.cy, radius)
   g.stroke()
   ripple.life -= dtMs
   if (ripple.life <= 0) g.clear()
   ```

6. Call `triggerComboRipple()` from `onEvents()` when `event.type === 'line-clear'` and
   `(payload.combo ?? 1) >= 2`.

**Acceptance criteria:**
- Two consecutive line-clear ticks (combo = 2): one ring expands from board center and fades.
- Combo = 3: two rings, second appearing slightly after the first.
- Combo rings use the piece guideline colors cycling by `combo % 7`.
- No ripple fires for the first line clear (combo = 1).
- Rings do not persist past 400ms.

**Dependencies:** A2.

---

## Group E — Tetris rainbow flash

### Task E1: Add rainbow hue cycling to tetrisFlashOverlay [renderer]

Upgrade `triggerTetrisFlash()` to attach a `ColorMatrixFilter` and cycle its hue each
frame during the flash duration.

**Files:**
- Modify: `src/renderer/effects.ts`

**What to change:**

1. Add import: `import { ColorMatrixFilter } from 'pixi.js'`

2. Add field: `private tetrisHueFilter: ColorMatrixFilter | null = null`

3. In `triggerTetrisFlash()`, after drawing the overlay:
   ```typescript
   if (this.tetrisHueFilter === null) {
     this.tetrisHueFilter = new ColorMatrixFilter()
   }
   this.tetrisHueFilter.hue(0, false)  // reset to 0
   this.tetrisFlashOverlay.filters = [this.tetrisHueFilter]
   ```

4. In `tick()`, in the Tetris flash update block, add hue rotation:
   ```typescript
   this.tetrisHueFilter.hue((90 * this.tetrisFlashLife / TETRIS_FLASH_DURATION_MS) % 360, false)
   ```
   When `tetrisFlashLife` hits 0, remove the filter: `this.tetrisFlashOverlay.filters = []`.

**Note on PixiJS 8**: `ColorMatrixFilter` is imported from `'pixi.js'` directly in v8.
The `.hue(degrees, multiply)` method signature is unchanged from v7. Verify the import
works at build time; if `ColorMatrixFilter` is not re-exported from `'pixi.js'`, import
from `'@pixi/filter-color-matrix'` instead (already indirectly available via PixiJS v8).

**Acceptance criteria:**
- A 4-line clear produces a white flash whose tint visibly shifts through hues during the
  300ms duration.
- Sub-tetris clears (1–3 lines) are not rainbow — they keep the existing white flash behavior.
- After the flash expires, no filter remains on `tetrisFlashOverlay`.

**Dependencies:** None.

---

## Group F — Level-up chromatic aberration

### Task F1: Add chroma overlay Graphics and triggerChromaFlash() [renderer]

Pre-allocate two additional colored overlay Graphics in `EffectsRenderer` for the red
and blue shifted copies, and wire them into `triggerLevelUp()`.

**Files:**
- Modify: `src/renderer/effects.ts`

**What to add:**

1. Add constants:
   ```typescript
   const CHROMA_FLASH_DURATION_MS = 300
   const CHROMA_SHIFT_PX = 3
   const CHROMA_PEAK_ALPHA = 0.35
   ```

2. Add fields:
   ```typescript
   private chromaRedOverlay: Graphics
   private chromaBlueOverlay: Graphics
   private chromaFlashLife = 0
   ```

3. In the constructor, after creating `levelUpOverlay`, allocate:
   ```typescript
   this.chromaRedOverlay = new Graphics()
   this.chromaRedOverlay.visible = false
   this.screenContainer.addChild(this.chromaRedOverlay)

   this.chromaBlueOverlay = new Graphics()
   this.chromaBlueOverlay.visible = false
   this.screenContainer.addChild(this.chromaBlueOverlay)
   ```

4. Add `private triggerChromaFlash(): void`:
   ```typescript
   private triggerChromaFlash(): void {
     const w = this.screenW
     const h = this.screenH

     this.chromaRedOverlay.clear()
     this.chromaRedOverlay.rect(-CHROMA_SHIFT_PX, 0, w, h)
     this.chromaRedOverlay.fill({ color: 0xff0000, alpha: 1 })
     this.chromaRedOverlay.visible = true
     this.chromaRedOverlay.alpha = CHROMA_PEAK_ALPHA

     this.chromaBlueOverlay.clear()
     this.chromaBlueOverlay.rect(CHROMA_SHIFT_PX, 0, w, h)
     this.chromaBlueOverlay.fill({ color: 0x0000ff, alpha: 1 })
     this.chromaBlueOverlay.visible = true
     this.chromaBlueOverlay.alpha = CHROMA_PEAK_ALPHA

     this.chromaFlashLife = CHROMA_FLASH_DURATION_MS
   }
   ```

5. Call `this.triggerChromaFlash()` at the end of `triggerLevelUp()`.

6. In `tick()`, add chroma fade:
   ```typescript
   if (this.chromaFlashLife > 0) {
     this.chromaFlashLife -= dtMs
     if (this.chromaFlashLife <= 0) {
       this.chromaRedOverlay.visible = false
       this.chromaBlueOverlay.visible = false
       this.chromaFlashLife = 0
     } else {
       const t = this.chromaFlashLife / CHROMA_FLASH_DURATION_MS
       this.chromaRedOverlay.alpha = CHROMA_PEAK_ALPHA * t
       this.chromaBlueOverlay.alpha = CHROMA_PEAK_ALPHA * t
     }
   }
   ```

7. Also update `resizeScreen()` to not redraw the chroma overlays (they are redrawn on
   next `triggerChromaFlash()` call, which is acceptable since level-up is a triggered
   one-off event).

**Acceptance criteria:**
- `'level-up'` event produces a 300ms RGB-split visual where the red and blue channels
  appear offset by ±3px horizontally.
- The effect fades linearly.
- After 300ms the chroma overlays are invisible.
- The existing gold edge pulse and background tint fire as before.

**Dependencies:** None.

---

## Group G — Ghost piece pulse

### Task G1: Accept elapsedSec in PieceRenderer.update() and animate ghost alpha [renderer]

**Files:**
- Modify: `src/renderer/pieceRenderer.ts`

**What to change:**

1. Change the method signature:
   ```typescript
   update(state: GameState, elapsedSec = 0): void
   ```

2. Replace the static `g.alpha = GHOST_ALPHA` assignment. Currently ghost cells have
   `alpha` set once in the constructor. Change the ghost draw loop to set alpha per frame:
   ```typescript
   const ghostAlpha = 0.22 + 0.10 * Math.sin(elapsedSec * Math.PI * 2)
   // (range: 0.12 – 0.32, period: 1 second)
   for (let i = 0; i < 4; i++) {
     const g = this.ghostCells[i]!
     g.alpha = ghostAlpha   // set per frame, not once
     // ... rest of ghost draw logic unchanged
   }
   ```

3. Remove the `g.alpha = GHOST_ALPHA` line from the constructor (it will be set each frame).

4. Keep `GHOST_ALPHA = 0.3` constant as a fallback reference (or remove it if unused).

**Acceptance criteria:**
- The ghost piece alpha oscillates smoothly between ~0.12 and ~0.32 at a ~1Hz rate.
- When `elapsedSec = 0` (e.g., test call), `ghostAlpha = 0.22` (sin(0) = 0, no pulse).
- The ghost piece remains visually readable as a drop preview throughout the full cycle.
- Existing tests that call `pieceRenderer.update(state)` (without second arg) still compile
  and run without changes, receiving `elapsedSec = 0`.

**Dependencies:** A3.

---

## Group H — Verification and cleanup

### Task H1: Run full test suite and lint [renderer] [engine] [main]

Verify zero regressions across engine and renderer tests.

**Files:**
- Read-only verification.

**Commands:**
```bash
npm run lint
npm test
npm run build
```

**Acceptance criteria:**
- `npm run lint` exits 0.
- `npm test` exits 0 with all existing tests passing.
- `npm run build` succeeds (TypeScript type-check passes).
- No new ESLint boundary violations (renderer does not import from input/ or ui/).

**Dependencies:** All previous tasks.

---

### Task H2: Manual visual verification checklist [renderer]

Open the game in a browser with `npm run dev` and verify each effect:

1. Hard drop — screen shakes for ~250ms.
2. Gravity lock — no screen shake.
3. 4-line clear (tetris) — screen shakes ~300ms at higher intensity AND rainbow hue
   flash appears on the full-screen white overlay.
4. Any line clear — sweep wipe visible from left to right across each cleared row.
5. Two consecutive line-clear turns — a ring expands from board center on the second.
6. Three+ consecutive clears — two rings visible.
7. Level up — RGB split visible for ~300ms before gold tint.
8. Ghost piece — alpha visibly oscillates at roughly 1Hz while piece is dropping.
9. All existing effects still work: particle burst on lock, edge pulse on 2/3/4 line
   clears, tetris full-screen flash, gold level-up tint.
10. No visible frame drops or stutter during any effect sequence.

**Dependencies:** All previous tasks.
