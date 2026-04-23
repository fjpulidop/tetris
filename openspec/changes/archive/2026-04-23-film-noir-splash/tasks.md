# Tasks: film-noir-splash

Ordered task breakdown for implementing ticket #40. Each task is atomic,
references every file it touches, and provides a concrete acceptance check.

Layer tags: `[ui]`, `[renderer]`, `[main]`, `[asset]`, `[test]`.

---

## Task 1: [asset] Add Playfair Display web font to `index.html`

**Files:**
- Modify: `index.html`

**Steps:**

1. Inside `<head>`, before the closing `</head>` tag, add:
   ```html
   <!-- Film noir typography: Playfair Display 700 -->
   <link rel="preload" as="font" type="font/woff2"
         href="https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQZNLo_U2r.woff2"
         crossorigin="anonymous">
   <link rel="stylesheet"
         href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap">
   ```
2. No other changes to `index.html`.

**Acceptance check:**
- `npm run build` passes (HTML is copied verbatim; no TypeScript involved).
- Opening `npm run dev` in a browser and checking the Network panel shows the
  font stylesheet and woff2 file loaded with status 200.
- Title text in the main menu renders in Playfair Display in a Chromium browser.
  In a browser with no internet access it falls back to Georgia — this is expected
  and acceptable.

---

## Task 2: [ui] Add visual constants and update `FONT_FAMILY` in `mainMenu.ts`

**Files:**
- Modify: `src/ui/mainMenu.ts`

**Steps:**

1. Replace the top-of-file color constants block:
   ```typescript
   // BEFORE
   const COLOR_TITLE = 0xffffff
   const COLOR_BUTTON_BG = 0x1a1a3a
   const COLOR_BUTTON_TEXT = 0xffffff
   const COLOR_FALLBACK = 0x888888
   const COLOR_SCENARIO_SELECTED_STROKE = 0x00f0f0
   const COLOR_SCENARIO_IDLE_STROKE = 0x444466
   const FONT_FAMILY = 'monospace'
   ```
   With:
   ```typescript
   // Film noir palette — two accent hues: warm silver + cold blue-grey
   const COLOR_BG = 0x000000
   const COLOR_TITLE = 0xd8d0c0              // warm silver
   const COLOR_PROMPT = 0x8899aa             // cold blue-grey
   const COLOR_BUTTON_BG = 0x0a0a0a          // near-black
   const COLOR_BUTTON_TEXT = 0xffffff
   const COLOR_FALLBACK = 0x555566
   const COLOR_SCENARIO_SELECTED_STROKE = 0x8899aa   // matches COLOR_PROMPT
   const COLOR_SCENARIO_IDLE_STROKE = 0x2a2a2a
   const FONT_FAMILY = '"Playfair Display", Georgia, serif'
   const GRAIN_STRENGTH = 0.18
   const DUST_PARTICLE_COUNT = 60
   const TYPEWRITER_TICKS = 3   // frames per character
   const BLINK_TICKS = 30       // frames per cursor blink toggle
   ```

2. No logic changes in this task — constants only. Compile must pass; visual
   differences will appear in subsequent tasks when these constants are referenced.

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- `npm test` passes (no behavior changed — constant values not yet used by
  changed render logic; old constants are now being replaced in-place).

---

## Task 3: [ui] Add background, vignette, and grain layers to `MainMenu`

**Files:**
- Modify: `src/ui/mainMenu.ts`

**Steps:**

1. Add `NoiseFilter` to the PixiJS import line:
   ```typescript
   import { Container, Graphics, NoiseFilter, Text, TextStyle } from 'pixi.js'
   ```

2. Add three new private fields after `private ticker: Ticker`:
   ```typescript
   private backgroundRect: Graphics
   private vignetteGfx: Graphics
   private grainSprite: Graphics
   ```

3. In the constructor, BEFORE the title text creation, add:
   ```typescript
   // --- Noir background ---
   this.backgroundRect = new Graphics()
   this.container.addChild(this.backgroundRect)

   // --- Spotlight vignette (radial dark ring over centre) ---
   this.vignetteGfx = new Graphics()
   this.container.addChild(this.vignetteGfx)

   // --- Film-grain overlay ---
   this.grainSprite = new Graphics()
   try {
     this.grainSprite.filters = [
       new NoiseFilter({ noise: GRAIN_STRENGTH, seed: Math.random() }) as unknown as Filter,
     ]
   } catch (e) {
     console.warn('MainMenu: NoiseFilter unavailable (Canvas renderer):', e)
   }
   this.container.addChild(this.grainSprite)
   ```

4. In `resize(width, height)`, at the START of the method body, add:
   ```typescript
   // Full-screen background
   this.backgroundRect.clear()
   this.backgroundRect.rect(0, 0, width, height)
   this.backgroundRect.fill({ color: COLOR_BG, alpha: 1 })

   // Vignette: dark ellipse fading from transparent centre to full-black edge
   // Drawn as a gradient fill from the title y-position outward.
   const cx = width / 2
   const cy = height * 0.28   // title vertical position
   const rx = width * 0.55
   const ry = height * 0.5
   this.vignetteGfx.clear()
   // Outer black ring
   this.vignetteGfx.rect(0, 0, width, height)
   this.vignetteGfx.fill({ color: 0x000000, alpha: 0.7 })
   // Cut-out highlight around title — draw an ellipse in ERASE mode
   this.vignetteGfx.ellipse(cx, cy, rx, ry)
   this.vignetteGfx.fill({ color: 0x000000, alpha: 0 })

   // Grain sprite covers full screen
   this.grainSprite.clear()
   this.grainSprite.rect(0, 0, width, height)
   this.grainSprite.fill({ color: 0xffffff, alpha: 0.04 })
   ```

   Note: PixiJS v8 `Graphics` does not natively support radial gradients on all
   backends. The vignette here is approximated with two overlaid draws: a near-
   opaque black rectangle with a zero-alpha ellipse punched out. The result is a
   dark ring with a lighter oval window over the title — visually equivalent to
   a simple vignette at the fidelity level appropriate for this project.
   A `FillGradient`-based implementation may be substituted if the PixiJS build
   supports it; the fallback above must remain as the Canvas-2D-compatible path.

5. In the `onTick` callback, replace the existing sine-based `titleText.alpha`
   update with grain seed animation:
   ```typescript
   // Animate film grain
   if (this.grainSprite.filters && this.grainSprite.filters.length > 0) {
     (this.grainSprite.filters[0] as NoiseFilter).seed = Math.random()
   }
   // Title: static alpha (no pulse in noir)
   this.titleText.alpha = 1
   ```
   (The `_elapsed` accumulator field can remain — it is used by the prompt
   typewriter logic added in Task 5.)

**Acceptance check:**
- `npm run dev` shows a near-black background on the main menu with a faintly
  lighter oval centered on the title, and visible film grain that changes
  each frame.
- `npm run build` passes.
- `npm test` passes — `mainMenu.test.ts` finds buttons by `collectInteractives()`
  (eventMode check), not by child index, so the additional background children
  do not affect button lookups.

---

## Task 4: [ui] Add dust particle pool to `MainMenu`

**Files:**
- Modify: `src/ui/mainMenu.ts`

**Steps:**

1. Add a new private interface above the class (or as a local-scope type alias):
   ```typescript
   interface DustParticle {
     gfx: Graphics
     x: number
     y: number
     vy: number    // pixels per frame at 60fps
     alpha: number
   }
   ```

2. Add a private field:
   ```typescript
   private dustParticles: DustParticle[] = []
   private dustContainer: Container
   ```

3. In the constructor, AFTER the grain sprite and BEFORE the title, add:
   ```typescript
   // --- Dust / rain particle pool ---
   this.dustContainer = new Container()
   this.container.addChild(this.dustContainer)

   for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
     const gfx = new Graphics()
     gfx.circle(0, 0, 1 + Math.random())
     gfx.fill({ color: 0xaabbcc, alpha: 1 })
     const particle: DustParticle = {
       gfx,
       x: Math.random() * (app.screen.width),
       y: Math.random() * (app.screen.height),
       vy: 0.3 + Math.random() * 0.7,   // frames per pixel
       alpha: 0.08 + Math.random() * 0.22,
     }
     gfx.alpha = particle.alpha
     gfx.x = particle.x
     gfx.y = particle.y
     this.dustContainer.addChild(gfx)
     this.dustParticles.push(particle)
   }
   ```

4. In `onTick`, after the grain seed update, add:
   ```typescript
   // Advance dust particles
   for (const p of this.dustParticles) {
     p.y += p.vy * ticker.deltaTime
     if (p.y > this._height + 4) {
       p.y = -4
       p.x = Math.random() * this._width
     }
     p.gfx.x = p.x
     p.gfx.y = p.y
   }
   ```
   Where `this._width` and `this._height` are new private fields updated in
   `resize()` (see Step 5).

5. In `resize(width, height)`, add at the top:
   ```typescript
   this._width = width
   this._height = height
   ```
   And add the corresponding private field declarations:
   ```typescript
   private _width = 800
   private _height = 600
   ```

6. In `destroy()`, before `this.container.destroy({ children: true })`, add:
   ```typescript
   this.dustParticles.length = 0
   ```

**Acceptance check:**
- `npm run dev` shows 60 small falling dust specks on the main menu.
- Specks re-enter from the top when they reach the bottom.
- Resizing the window repositions particles within new bounds.
- `npm test` passes (particle pool is private; no test assertions inspect it).
- `DUST_PARTICLE_COUNT` is verified to be 60 (less than 80 as required).

---

## Task 5: [ui] Restyle title typography and add typewriter prompt in `MainMenu`

**Files:**
- Modify: `src/ui/mainMenu.ts`

**Steps:**

1. In the constructor, change the `titleStyle` block:
   ```typescript
   const titleStyle = new TextStyle({
     fontSize: 72,
     fontWeight: '700',
     fontFamily: FONT_FAMILY,
     fill: COLOR_TITLE,
     letterSpacing: 4,
     dropShadow: {
       alpha: 0.5,
       blur: 0,
       color: 0x000000,
       distance: 3,
       angle: Math.PI / 4,
     },
   })
   ```

2. Remove the `GlowFilter` application block entirely (lines 86–92 in the
   current file). Replace with a comment:
   ```typescript
   // No glow filter — noir aesthetic relies on shadow, not bloom.
   ```

3. Add a new `promptText` field and construct it after `subtitleText` (there is
   no existing subtitleText in `MainMenu` — add this after the fallbackText node):
   ```typescript
   private promptText: Text
   private _promptRevealed = 0
   private _promptBlink = false
   private _promptTickAcc = 0
   private readonly PROMPT_FULL = 'press enter or tap to start'
   ```
   In the constructor:
   ```typescript
   const promptStyle = new TextStyle({
     fontSize: 14,
     fontFamily: FONT_FAMILY,
     fill: COLOR_PROMPT,
     letterSpacing: 6,
   })
   this.promptText = new Text({ text: '', style: promptStyle })
   this.promptText.anchor.set(0.5)
   this.container.addChild(this.promptText)
   ```

4. In `onTick`, add after the dust particle update:
   ```typescript
   // Typewriter reveal then cursor blink
   this._promptTickAcc++
   if (this._promptRevealed < this.PROMPT_FULL.length) {
     if (this._promptTickAcc >= TYPEWRITER_TICKS) {
       this._promptTickAcc = 0
       this._promptRevealed++
       this.promptText.text = this.PROMPT_FULL.slice(0, this._promptRevealed)
     }
   } else {
     if (this._promptTickAcc >= BLINK_TICKS) {
       this._promptTickAcc = 0
       this._promptBlink = !this._promptBlink
       this.promptText.text = this.PROMPT_FULL + (this._promptBlink ? '_' : ' ')
     }
   }
   ```

5. In `resize(width, height)`, position the prompt text below the EXIT button.
   The EXIT button is at `actionStartY + 180`. Add:
   ```typescript
   this.promptText.x = width / 2
   this.promptText.y = actionStartY + 240
   ```

**Acceptance check:**
- `npm run dev`: title renders in Playfair Display (or Georgia fallback) with
  warm-silver color and no glow ring. A typewriter-style reveal of the prompt
  text plays on load; after the full text appears, a cursor `_` blinks.
- `npm run build` passes.
- `npm test` passes — `mainMenu.test.ts` does not assert on `titleText.filters`,
  so removing the GlowFilter does not break any test. The new `promptText` node
  has `eventMode` default (`'none'`), so `collectInteractives()` does not count
  it, and the existing button-count assertion (`toBe(8)`) still holds.

---

## Task 6: [ui] Update button styling for noir aesthetic in `MainMenu`

**Files:**
- Modify: `src/ui/mainMenu.ts`

**Steps:**

This task changes button background color and removes border stroke from the
action buttons (MARATHON/MONOCHROME/SPRINT/EXIT). Scenario picker strokes are
updated to use the new color constants.

1. In `buildButton()`, the `bg.fill` call uses `COLOR_BUTTON_BG`. No code change
   needed here because `COLOR_BUTTON_BG` was redefined to `0x0a0a0a` in Task 2.
   Verify the constant is already referenced.

2. In `buildButton()`, note that there is currently no stroke on action buttons
   (they use only `fill`). Confirm no stroke code exists; if it does, remove it.

3. In `updateScenarioButtonHighlights()`, the stroke colors already reference
   `COLOR_SCENARIO_SELECTED_STROKE` and `COLOR_SCENARIO_IDLE_STROKE` which were
   updated in Task 2. No code change needed — verify references are correct.

4. In `resize()`, the `resizeButton()` helper uses `COLOR_BUTTON_BG` for the fill.
   Confirm no hard-coded color literals remain in `resizeButton()`.

**Acceptance check:**
- `npm run dev`: action buttons are near-black with white text. No colored borders
  on MARATHON/MONOCHROME/SPRINT/EXIT. The selected scenario button shows a cold-
  blue-grey border; unselected scenario buttons have a barely-visible dark border.
- `npm test` passes — button label strings are unchanged; `getButtonByLabel()` in
  the test still finds buttons correctly.

---

## Task 7: [main] Defer `attachPostProcess` to `intro → playing` transition

**Files:**
- Modify: `src/main.ts`

**Steps:**

1. Locate the startup call to `attachPostProcess` (line 77 in the current file):
   ```typescript
   // Attach post-processing (glow/bloom) to board and piece containers
   attachPostProcess(boardContainer, pieceContainer, app)
   ```
   Delete this line.

2. Locate the `intro → playing` edge-detection block (around line 420):
   ```typescript
   if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
     audioManager.onPhaseChange('playing')
     mainMenu?.destroy()
     mainMenu = null
     if (removeIntroKeyListener !== null) {
       removeIntroKeyListener()
       removeIntroKeyListener = null
     }
     hud.setVisible(true)
   }
   ```
   Add `attachPostProcess` as the last line inside this block:
   ```typescript
   if (phaseBeforeUpdate === 'intro' && state.phase === 'playing') {
     audioManager.onPhaseChange('playing')
     mainMenu?.destroy()
     mainMenu = null
     if (removeIntroKeyListener !== null) {
       removeIntroKeyListener()
       removeIntroKeyListener = null
     }
     hud.setVisible(true)
     // Apply bloom/glow now that gameplay is starting — keeps splash noir-dark
     attachPostProcess(boardContainer, pieceContainer, app)
   }
   ```

3. No other changes to `main.ts`.

**Acceptance check:**
- `npm run dev`: on the intro/menu screen, the board area behind the menu has no
  glow or bloom (it appears dark and unfiltered). After pressing MARATHON/MONOCHROME
  /SPRINT, the board renders with the existing glow/bloom filters active.
- `npm run build` passes.
- `npm test` passes (no tests exercise `main.ts` directly).
- Restart from pause menu preserves bloom (restart does not re-enter `'intro'`
  so `attachPostProcess` is not called again; `boardContainer.filters` already
  set from the first Start — this is the correct idempotent behavior).

---

## Task 8: [test] Extend `mainMenu.test.ts` mock for `NoiseFilter`

**Files:**
- Modify: `src/__tests__/ui/mainMenu.test.ts`

**Steps:**

1. In the `vi.mock('pixi.js', () => { ... })` factory, add a `MockNoiseFilter`
   class alongside `MockContainer`:
   ```typescript
   class MockNoiseFilter {
     noise: number
     seed: number
     constructor(opts: { noise?: number; seed?: number } = {}) {
       this.noise = opts.noise ?? 0.5
       this.seed = opts.seed ?? 0
     }
   }
   ```

2. Add `NoiseFilter: MockNoiseFilter` to the mock return object:
   ```typescript
   return {
     Container: MockContainer,
     Graphics: MockGraphics,
     Text: MockText,
     TextStyle: MockTextStyle,
     NoiseFilter: MockNoiseFilter,   // ADD THIS
   }
   ```

3. No test assertions need to change — the `NoiseFilter` is only instantiated
   in a `try/catch` block and the mock will not throw.

4. Verify the existing button-count test still asserts `toBe(8)`:
   ```typescript
   expect(interactiveChildren.length).toBe(8)
   ```
   The new `promptText`, `backgroundRect`, `vignetteGfx`, `grainSprite`, and
   `dustContainer` children all have `eventMode = 'none'` (default) so they
   are not counted by `collectInteractives()`. If this assertion fails, inspect
   which new node has `eventMode = 'static'` by accident and fix it.

**Acceptance check:**
- `npm test` passes with zero failures.
- No TypeScript errors (`npm run build` passes).
- Specifically: `npx vitest run src/__tests__/ui/mainMenu.test.ts` shows all
  suites green.

---

## Task 9: [test] Add smoke test for `MainMenu` noir visual nodes

**Files:**
- Modify: `src/__tests__/ui/mainMenu.test.ts`

**Steps:**

Add a new `describe` block after the existing `'MainMenu — destroy'` suite:

```typescript
describe('MainMenu — noir visual nodes', () => {
  it('constructor adds backgroundRect, vignetteGfx, grainSprite, and dustContainer below title', () => {
    const stage = makeStage()
    const app = makeApp()
    new MainMenu(stage as never, app as never)
    const menuContainer = stage.children[0]!
    // Container children: backgroundRect, vignetteGfx, grainSprite, dustContainer,
    //   titleText, scenarioPicker buttons (4), playButton, monochromeButton,
    //   sprintButton, exitButton, fallbackText, promptText = at least 12 children
    expect(menuContainer.children.length).toBeGreaterThanOrEqual(12)
  })

  it('ticker callback increments _elapsed or animates without throwing', () => {
    const stage = makeStage()
    const app = makeApp()
    new MainMenu(stage as never, app as never)
    // Simulate a tick — the callback registered with app.ticker.add should not throw
    const tickerCb = app.ticker.add.mock.calls[0]?.[0] as ((t: { deltaTime: number }) => void) | undefined
    expect(() => tickerCb?.({ deltaTime: 1 })).not.toThrow()
  })

  it('resize does not throw with noir layers present', () => {
    const stage = makeStage()
    const app = makeApp()
    const menu = new MainMenu(stage as never, app as never)
    expect(() => menu.resize(1920, 1080)).not.toThrow()
    expect(() => menu.resize(320, 568)).not.toThrow()
  })
})
```

**Acceptance check:**
- `npx vitest run src/__tests__/ui/mainMenu.test.ts` shows all suites green including
  the new `'MainMenu — noir visual nodes'` suite.
- `npm test` passes (all other test files unaffected).

---

## Summary of file surface

| File | Layer | Status |
|---|---|---|
| `index.html` | `[asset]` | Modify — add Playfair Display font preload and stylesheet link |
| `src/ui/mainMenu.ts` | `[ui]` | Modify — noir visual stack: background, vignette, grain, dust, typography, prompt |
| `src/main.ts` | `[main]` | Modify — defer `attachPostProcess` to `intro → playing` edge |
| `src/__tests__/ui/mainMenu.test.ts` | `[test]` | Modify — add `NoiseFilter` mock; add noir smoke tests |

**Files explicitly not touched:**
- `src/ui/splashScreen.ts` — orphan; left as-is.
- `src/ui/hud.ts`, `src/ui/pauseModal.ts`, `src/ui/gameOverOverlay.ts` — untouched.
- `src/renderer/postProcess.ts` — no code change; call-site moves to `main.ts`.
- `src/engine/**` — no changes of any kind.
- `src/input/**` — no changes of any kind.
- `src/renderer/boardRenderer.ts`, `pieceRenderer.ts`, `effects.ts` — untouched.
