# Design: Film Noir Visual Makeover for Splash/Intro Screen

## Overview

This change reshapes the intro screen into a film noir aesthetic without touching
the engine, gameplay renderer, audio, or mobile layout. The work is concentrated
in three files:

- **`src/ui/splashScreen.ts`** — rebuilt from scratch with the noir visual stack.
- **`src/renderer/postProcess.ts`** — `attachPostProcess` gains a deferred-attach path.
- **`src/main.ts`** — suspends bloom/glow during `'intro'`; calls `attachPostProcess`
  on the `intro → playing` transition edge instead of at startup.
- **`index.html`** — `<link rel="preload">` for the web font (additive only).

`src/ui/mainMenu.ts` is unchanged in behavior; its mock in `mainMenu.test.ts`
needs one small extension for `NoiseFilter`.

---

## 1. `src/ui/splashScreen.ts` — Full Replacement

The current `SplashScreen` holds a title `Text`, a subtitle `Text`, a `GlowFilter`,
and a single ticker callback. The replacement keeps the same public API
(`constructor(stage, app)`, `resize(width, height)`, `destroy()`) so `main.ts`
wiring does not change.

### 1.1 Background and Vignette

**Background rectangle:**
A full-screen `Graphics` object filled with `0x000000` at `alpha = 1` is added
first to `container` so it sits behind every other element. On `resize()`, it
is redrawn to `(0, 0, width, height)`.

**Spotlight vignette:**
PixiJS v8 exposes `Graphics.fillGradient()` (FillGradient API). A radial gradient
centered on the title position is drawn over the background:
- Center color: `0x000000` at alpha `0` (transparent — lets the title show through).
- Edge color: `0x000000` at alpha `1` (full black vignette).

This is a single `Graphics` draw call with `blendMode = MULTIPLY` applied. On
Canvas 2D renderer, `MULTIPLY` blend mode falls back to normal compositing — the
vignette still appears as a darkening ring but without true multiply. This is
acceptable.

If `FillGradient` is not available in the installed PixiJS v8 build, the fallback
is a `Sprite` built from `RenderTexture` with a hand-drawn radial mask. The
constructor detects capability by checking `typeof FillGradient !== 'undefined'`
and uses the sprite path otherwise.

**Decision:** radial gradient via `Graphics.fillGradient()` rather than a pre-baked
PNG asset. No new bundled assets are needed; the gradient is programmatic and
responsive to resize.

### 1.2 Film-Grain Overlay (NoiseFilter)

A full-screen transparent `Graphics` rect (same dimensions as background) receives
a `NoiseFilter` from PixiJS v8:

```typescript
import { NoiseFilter } from 'pixi.js'
// ...
this.grainSprite.filters = [new NoiseFilter({ noise: 0.18, seed: Math.random() })]
```

The ticker callback increments the seed each frame:
```typescript
private onTick = (ticker: Ticker) => {
  // Grain animation
  ;(this.grainSprite.filters![0] as NoiseFilter).seed = Math.random()
  // ... other animations
}
```

`noise: 0.18` is tuned to be visible without obscuring the title. The value is
a named constant `GRAIN_STRENGTH = 0.18` at the top of the file.

On Canvas 2D renderer, `NoiseFilter` requires WebGL so is wrapped in a `try/catch`
exactly as the existing `GlowFilter` usage elsewhere:
```typescript
try {
  this.grainSprite.filters = [new NoiseFilter({ noise: GRAIN_STRENGTH, seed: Math.random() })]
} catch (e) {
  console.warn('SplashScreen: NoiseFilter unavailable:', e)
}
```

### 1.3 Dust/Rain Particles

A pre-allocated pool of exactly `DUST_PARTICLE_COUNT = 60` particles. Each
particle is a `Graphics` object (a small circle, radius 1–2 px) held in a
`Container`. No per-frame allocation occurs after construction.

**Particle state** (plain object array):
```typescript
interface DustParticle {
  gfx: Graphics
  x: number
  y: number
  vy: number       // pixels per ms — between 30 and 80
  alpha: number    // 0.1 to 0.4 (noise, varies per particle)
}
```

**Tick logic** (called from the existing `onTick`):
```typescript
for (const p of this.dustParticles) {
  p.y += p.vy * ticker.deltaTime / 60   // convert frames to ~ms at 60fps
  if (p.y > this.height + 4) {
    p.y = -4
    p.x = Math.random() * this.width
  }
  p.gfx.x = p.x
  p.gfx.y = p.y
}
```

Particles are contained in a `dustContainer: Container` added to `container` above
the vignette layer but below the title text. They are not affected by the vignette
blend mode because they are separate objects in the display list.

**Decision:** `Graphics` objects rather than a `Sprite`/`Texture` atlas. At 60
particles the fill-rate cost is negligible. Using the same `Graphics` idiom avoids
introducing an asset pipeline for a single particle type.

### 1.4 Title Typography

```typescript
const titleStyle = new TextStyle({
  fontSize: 72,
  fontWeight: '700',
  fontFamily: '"Playfair Display", Georgia, serif',
  fill: 0xd8d0c0,          // warm-silver: the primary accent
  letterSpacing: 4,
})
```

The font family string references the web font by name. If the web font has not
loaded (FOUT/FOIT), the browser falls back to Georgia immediately — no
invisible-text flash because `fill` is a hex color, not transparent.

The existing `GlowFilter` on the title is replaced with **no filter** (glow is
the anti-pattern for noir). Instead, the title receives a drop-shadow style:
```typescript
dropShadow: {
  alpha: 0.5,
  blur: 0,
  color: 0x000000,
  distance: 3,
  angle: Math.PI / 4,
}
```

This is a `TextStyle` `dropShadow` property (supported in PixiJS v8) — no external
filter package required.

### 1.5 Typewriter + Blink Prompt

```typescript
private readonly PROMPT_FULL = 'press enter to start'
private promptRevealed = 0      // characters revealed so far
private promptBlink = false     // cursor shown/hidden
private promptTickAcc = 0       // accumulated ticks for timing
```

Tick logic:
1. While `promptRevealed < PROMPT_FULL.length`, increment `promptTickAcc`. Every
   `TYPEWRITER_TICKS = 3` ticks, reveal one more character. Update `subtitleText.text`
   to the revealed substring.
2. Once fully revealed, every `BLINK_TICKS = 30` ticks, toggle `promptBlink` and
   set `subtitleText.text` to `PROMPT_FULL + (promptBlink ? '_' : ' ')`.

```typescript
const subtitleStyle = new TextStyle({
  fontSize: 18,
  fontFamily: '"Playfair Display", Georgia, serif',
  fill: 0x8899aa,    // cold blue-grey: the secondary accent
  letterSpacing: 8,
})
```

No `alpha` oscillation (the old sine-pulse behavior). The blink replaces it.

### 1.6 Accent Color Palette

| Constant | Value | Role |
|---|---|---|
| `COLOR_TITLE` | `0xd8d0c0` | Warm silver — title text |
| `COLOR_PROMPT` | `0x8899aa` | Cold blue-grey — prompt text |
| `COLOR_BG` | `0x000000` | Pure black — background fill |

Two hue values total (warm neutral + cold blue). Satisfies AC #6.

### 1.7 Public API (unchanged)

```typescript
export class SplashScreen {
  constructor(stage: Container, app: Application)
  resize(width: number, height: number): void
  destroy(): void
}
```

`destroy()` removes the ticker callback and calls `this.container.destroy({ children: true })`.
The `dustParticles` array is cleared (`this.dustParticles.length = 0`) to release
`Graphics` references before the container hierarchy destructor runs, although the
`{ children: true }` destroy already handles the PixiJS side.

---

## 2. `src/renderer/postProcess.ts` — Deferred Attach Pattern

Currently `attachPostProcess(boardContainer, pieceContainer, app)` applies filters
immediately and unconditionally (except for Canvas 2D renderer check). With this
change, the call site moves from startup to the `intro → playing` transition.

`postProcess.ts` itself is unchanged. The behavioral change is entirely in how
`main.ts` calls it.

**Why not add a phase-check inside `attachPostProcess`?** `postProcess.ts` is in
the renderer layer and must not import from engine. Knowing the phase requires
reading `GameState`, which would add a dependency on engine types. Keeping the
change in `main.ts` respects the layer boundary and is the simpler edit.

---

## 3. `src/main.ts` — Wiring Changes

### 3.1 Remove `attachPostProcess` from startup

**Before:**
```typescript
// Attach post-processing (glow/bloom) to board and piece containers
attachPostProcess(boardContainer, pieceContainer, app)
```

**After:** this line is deleted from the startup block.

### 3.2 Call `attachPostProcess` on `intro → playing` edge

Inside the existing edge-detection block:
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
  // NEW: apply post-processing now that gameplay has started
  attachPostProcess(boardContainer, pieceContainer, app)
}
```

Post-processing is applied exactly once per session (on the first Start). Restart
(`restartGame()`) does not re-apply it because `boardContainer` and `pieceContainer`
already have their filters. This is correct behavior — the board containers are
not recreated on restart.

### 3.3 Import `SplashScreen` (already exists in current `main.ts`?)

The current `main.ts` does NOT import `SplashScreen` — it imports `MainMenu`
and uses that as the intro UI. `SplashScreen` exists as a separate class that is
not currently instantiated from `main.ts`. The intro phase is served entirely by
`MainMenu`.

**Architectural finding:** `src/ui/splashScreen.ts` is a standalone class that
was present from the animated-splash-screen feature but appears to have been
superseded by `MainMenu`. Looking at `main.ts` lines 164–167, the intro screen is
`new MainMenu(mainMenuContainer, app)`. `SplashScreen` is an orphan module.

**Decision:** this change does NOT add a `SplashScreen` layer beneath `MainMenu`.
Instead, all noir visual effects are built into `MainMenu` itself. This is
consistent with how the game currently works and avoids a parallel UI hierarchy.
`src/ui/splashScreen.ts` remains an orphan (it can be cleaned up in a separate
change) — we do not touch it.

The noir redesign therefore affects:
1. `src/ui/mainMenu.ts` — the actual intro screen.
2. `src/renderer/postProcess.ts` — no code change; wiring change in `main.ts`.
3. `src/main.ts` — post-process deferred to `intro → playing` edge.
4. `index.html` — web font preload.

---

## 4. `src/ui/mainMenu.ts` — Noir Visual Changes

The `MainMenu` class keeps all its existing game-mode/scenario/action machinery
unchanged. Only the visual presentation layer changes.

### 4.1 Background, vignette, grain

Same as the `SplashScreen` design in §1.1–1.3, applied to `MainMenu`'s own
`container`. A `backgroundRect` Graphics object is added first. A `vignetteGfx`
radial-gradient object is added second. A `grainSprite` (transparent Graphics +
NoiseFilter) is added third. These three layers sit below the title and buttons.

A `dustContainer` with the particle pool is added between the grain layer and the
title.

### 4.2 Title typography

Replace the current `fontFamily: 'monospace'` with:
```
fontFamily: '"Playfair Display", Georgia, serif'
fontWeight: '700'
fill: 0xd8d0c0
letterSpacing: 4
```

Remove the `GlowFilter`. Add `dropShadow` via `TextStyle`. Increase font size to
`72` (was `64`) for cinematic weight.

### 4.3 Buttons

Button backgrounds shift from `COLOR_BUTTON_BG = 0x1a1a3a` to `0x0a0a0a` (near-
black). Button text remains `0xffffff` (no change). Stroke colors for the action
buttons are removed — buttons become minimal: black background, white text, no
border. The MARATHON/MONOCHROME/SPRINT/EXIT distinction uses no accent color.

Scenario picker button selected-stroke remains `COLOR_SCENARIO_SELECTED_STROKE =
0x8899aa` (repurposed as the cold-blue secondary accent). Idle stroke becomes
`0x2a2a2a` (almost-invisible, very dark grey).

### 4.4 Prompt text

The `subtitleText` equivalent in `MainMenu` does not exist as a separate element.
The MARATHON/etc buttons are the CTA. A new line of "press enter or tap" prompt
text is added to the container, below the EXIT button, in the same typewriter-then-
blink style as designed for `SplashScreen`. This is an additive text node —
no existing layout is displaced.

**Prompt text style:**
```typescript
fontSize: 14, fontFamily: '"Playfair Display", Georgia, serif',
fill: 0x8899aa, letterSpacing: 6
```

### 4.5 Ticker updates

The existing `onTick` animates `titleText.alpha` with a sine. This is replaced
with:
1. NoiseFilter seed increment on `grainSprite`.
2. Dust particle position updates.
3. Typewriter/blink logic for the prompt text.
4. Title text alpha: steady at `1.0` (no pulse). Noir titles don't breathe.

---

## 5. `index.html` — Web Font Preload

Add inside `<head>`:
```html
<link rel="preload" as="font" type="font/woff2"
      href="https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQZNLo_U2r.woff2"
      crossorigin="anonymous">
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap">
```

The `display=swap` strategy prevents invisible text during font load. Georgia
renders immediately as fallback and is replaced by Playfair Display once loaded.

This is the only change to `index.html`.

---

## 6. Compatibility Impact

No `GameAction` enum values, `GameState` fields, `createGameState`/`updateGameState`
signatures, PixiJS container stacking order, or any public API surface changes.

### Advisory changes

- **Post-processing timing shift.** `boardContainer` and `pieceContainer` filters
  are now `null` during `'intro'` phase rather than active from app startup. This
  affects no code path beyond the splash screen itself. Any code that inspects
  `boardContainer.filters` before the first Start will see `null` (it was already
  `null` before `attachPostProcess` was called — the startup-time call was the
  only setter, and we are simply moving it).
- **`MainMenu` visual layer count increases.** The container now has 3 additional
  children (backgroundRect, vignetteGfx, grainSprite) before the title. Code
  that indexes `container.children[0]` directly will see `backgroundRect` instead
  of `titleText`. No existing code does this; `mainMenu.test.ts` finds buttons
  by `eventMode === 'static'` via `collectInteractives()` — this is unaffected.
- **One additional `Graphics` object is added per `MainMenu` constructor call.**
  This is construction cost only; no per-frame allocation beyond the existing
  ticker callback pattern.

### No contract surface changes to

- `GameAction`, `GameEventType`, `GameState`, engine function signatures.
- `MainMenu.flushActions()`, `flushMode()`, `flushScenario()`, `resize()`,
  `destroy()`, `showExitFallback()`, `onExit`, `onSprintStart` — all unchanged.
- ESLint import rules: no new cross-layer imports introduced.

---

## 7. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| `NoiseFilter` not exported by this PixiJS v8 build | Low | Wrap in `try/catch`; degrade gracefully (grain absent) |
| `FillGradient` API not available | Medium | Check at runtime; fall back to `RenderTexture` radial mask |
| Playfair Display not loaded before first frame | Certain (FOUT) | `display=swap` + Georgia fallback; visually acceptable |
| NoiseFilter GPU cost on mobile | Low | Single filter on a transparent quad; cost is negligible vs. board rendering |
| Dust particles drop FPS on low-end mobile | Low | Capped at 60; each is a 2px circle; far cheaper than the board grid |
| `mainMenu.test.ts` breaks on new `pixi.js` mock needs | Low | `NoiseFilter` is only instantiated inside a `try/catch`; mock can throw and code path degrades gracefully |
| `attachPostProcess` called twice on restart | None | Restart does not re-enter `intro` phase — the edge fires once per session |

---

## 8. Design Decisions Record

Three decisions worth an explanation record:

1. **Noir effects in `MainMenu`, not a new wrapper class.** The intro screen IS the
   main menu — a separate splash class would duplicate the wiring. `SplashScreen` is
   already an unused orphan; adding another parallel class compounds the confusion.
   All noir visuals are self-contained within `MainMenu`'s display list.

2. **Post-process deferred to `intro → playing` edge, not removed.** Gameplay must
   retain its existing glow/bloom character. The simplest correct approach is to
   not call `attachPostProcess` until gameplay actually starts. The alternative —
   calling it at startup and removing filters on `'intro'` — requires tracking the
   filter references and re-applying them. Deferral is strictly simpler.

3. **No iris-wipe transition.** PixiJS v8 does not have a built-in transition
   system. An iris-wipe requires a custom mask animation spanning at least one full
   `requestAnimationFrame` cycle — approximately 16 ms of transition code for a
   cosmetic effect. The proposal marks it as an optional stretch goal. A hard cut
   is instant, correct, and produces zero new code paths to test.
