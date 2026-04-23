# Context Bundle: film-noir-splash

**Change name:** film-noir-splash
**Ticket:** #40
**Date:** 2026-04-23

---

## 1. Feature Overview

Restyle the intro/main-menu screen into a **film noir** aesthetic: pitch-black
background, spotlight vignette over the title, animated film-grain overlay
(`NoiseFilter` with per-frame seed), falling dust/rain particles (60 pooled
`Graphics` sprites), condensed serif typography (Playfair Display / Georgia
fallback), and a typewriter-then-blink "press to start" prompt. Post-processing
bloom/glow is suspended during `'intro'` phase and applied only on the first
`intro → playing` transition.

Gameplay visuals, audio, mechanics, engine state, and mobile layout are
completely untouched.

---

## 2. Architecture

### Four-layer design (unchanged)

```
input -> main.ts -> engine -> renderer
                           -> ui
```

### Key architectural finding

`src/ui/splashScreen.ts` exists but is NOT wired from `main.ts`. The intro
screen is served entirely by `src/ui/mainMenu.ts` (instantiated at line 164
of `main.ts`). All noir effects are therefore implemented inside `MainMenu`,
not in `SplashScreen`. `SplashScreen` remains an orphan.

### Files modified

| File | Layer | Change summary |
|---|---|---|
| `index.html` | `[asset]` | Add Playfair Display web-font preload + stylesheet |
| `src/ui/mainMenu.ts` | `[ui]` | Add background/vignette/grain/dust visual stack; restyle typography; add typewriter prompt; update color palette |
| `src/main.ts` | `[main]` | Remove startup `attachPostProcess` call; re-add it on `intro → playing` edge |
| `src/__tests__/ui/mainMenu.test.ts` | `[test]` | Add `NoiseFilter` mock; add noir smoke-test suite |

### Files explicitly not touched

`src/ui/splashScreen.ts`, `src/renderer/postProcess.ts` (no code change),
`src/engine/**`, `src/input/**`, `src/renderer/boardRenderer.ts`,
`src/renderer/pieceRenderer.ts`, `src/renderer/effects.ts`.

---

## 3. Container stacking order (inside `MainMenu.container`)

After this change, `MainMenu`'s internal container holds these children in order:

```
container
  backgroundRect     (Graphics, full-screen black fill)
  vignetteGfx        (Graphics, dark ring / oval cutout)
  grainSprite        (Graphics, transparent + NoiseFilter)
  dustContainer      (Container, 60 DustParticle Graphics children)
  titleText          (Text, Playfair Display 72px warm-silver)
  [4x scenarioButtons] (Container x4)
  playButton         (Container, MARATHON)
  monochromeButton   (Container, MONOCHROME)
  sprintButton       (Container, SPRINT)
  exitButton         (Container, EXIT)
  fallbackText       (Text)
  promptText         (Text, typewriter/blink prompt)
```

The global stage stacking order in `main.ts` is unchanged:
```
app.stage
  boardContainer
  pieceContainer
  effectsContainer
  uiContainer (HUD)
  touchContainer
  mainMenuContainer  <- MainMenu lives here
  modalContainer
```

---

## 4. Post-processing timeline change

| Before this change | After this change |
|---|---|
| `attachPostProcess(board, piece, app)` called once at app startup (line 77) | Call deleted from startup |
| Bloom/glow active during `'intro'` phase | Bloom/glow absent during `'intro'` phase |
| — | `attachPostProcess` called once on `intro → playing` edge |
| Bloom/glow active during `'playing'`, `'paused'`, `'gameover'` | Same — unchanged |

`attachPostProcess` is still called exactly once per session (first game start).
Restart (`restartGame()`) does not re-apply filters because `boardContainer`
already has them from the first start.

---

## 5. Accent color palette

| Constant | Value | Role |
|---|---|---|
| `COLOR_BG` | `0x000000` | Background fill |
| `COLOR_TITLE` | `0xd8d0c0` | Warm silver — title |
| `COLOR_PROMPT` | `0x8899aa` | Cold blue-grey — prompt + selected scenario stroke |
| `COLOR_BUTTON_BG` | `0x0a0a0a` | Near-black button background |
| `COLOR_BUTTON_TEXT` | `0xffffff` | White button label |
| `COLOR_SCENARIO_SELECTED_STROKE` | `0x8899aa` | Same as `COLOR_PROMPT` |
| `COLOR_SCENARIO_IDLE_STROKE` | `0x2a2a2a` | Near-invisible dark border |

Two hue values (warm neutral + cold blue). Satisfies AC #6.

---

## 6. Exact code regions

### 6.1 `index.html`

**Region:** inside `<head>`, before `</head>`.

**Add:**
```html
<link rel="preload" as="font" type="font/woff2"
      href="https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQZNLo_U2r.woff2"
      crossorigin="anonymous">
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap">
```

---

### 6.2 `src/ui/mainMenu.ts`

**Region 1:** Top-of-file constant block.

Replace all `const COLOR_*` and `const FONT_FAMILY` lines with the expanded noir
palette (see §5 above) plus `GRAIN_STRENGTH = 0.18`, `DUST_PARTICLE_COUNT = 60`,
`TYPEWRITER_TICKS = 3`, `BLINK_TICKS = 30`.

**Region 2:** Import line.

Add `NoiseFilter` to the named PixiJS import:
```typescript
import { Container, Graphics, NoiseFilter, Text, TextStyle } from 'pixi.js'
```

**Region 3:** Private fields block.

Add:
```typescript
private backgroundRect: Graphics
private vignetteGfx: Graphics
private grainSprite: Graphics
private dustContainer: Container
private dustParticles: DustParticle[] = []
private _width = 800
private _height = 600
private promptText: Text
private _promptRevealed = 0
private _promptBlink = false
private _promptTickAcc = 0
private readonly PROMPT_FULL = 'press enter or tap to start'
```

**Region 4:** Constructor — prepend visual layers before title.

Background rect, vignette gfx, grain sprite (with `NoiseFilter` in `try/catch`),
dust container + pool of 60 particles.

**Region 5:** Constructor — remove `GlowFilter` from title. Update `titleStyle`
to Playfair Display 72px warm-silver with `dropShadow`. Add `promptText` node
after fallbackText.

**Region 6:** `onTick` — replace sine-alpha with grain-seed increment + dust
particle positions + typewriter/blink logic. Remove `_elapsed` usage.

**Region 7:** `resize()` — prepend: store `_width`/`_height`; redraw backgroundRect,
vignetteGfx, grainSprite; position `promptText` below EXIT button.

**Region 8:** `destroy()` — prepend: `this.dustParticles.length = 0`.

---

### 6.3 `src/main.ts`

**Region 1:** Startup block (around line 77).

**Remove:**
```typescript
attachPostProcess(boardContainer, pieceContainer, app)
```

**Region 2:** `intro → playing` edge-detection block (around line 420).

**Add as last line inside the block:**
```typescript
attachPostProcess(boardContainer, pieceContainer, app)
```

---

### 6.4 `src/__tests__/ui/mainMenu.test.ts`

**Region 1:** `vi.mock('pixi.js', ...)` return object.

**Add:** `NoiseFilter: class MockNoiseFilter { constructor() {} }`.

**Region 2:** New `describe('MainMenu — noir visual nodes', ...)` suite.

Three new test cases: child-count lower bound, tick callback does not throw,
resize does not throw at various viewports.

---

## 7. Constraints and invariants

- `DUST_PARTICLE_COUNT = 60` — hard cap below 80 (AC #4).
- `NoiseFilter` instantiation is always inside `try/catch` — Canvas 2D renderer
  must not crash (AC #9 via test continuity).
- `MainMenu` public API surface (`flushActions`, `flushMode`, `flushScenario`,
  `resize`, `destroy`, `showExitFallback`, `onExit`, `onSprintStart`) is
  completely unchanged — no call site updates anywhere.
- `attachPostProcess` is called exactly once per session (idempotent: re-calling
  it would add duplicate filters, which is why it must not fire on restart).
- Engine (`src/engine/**`) has zero changes. No `GameAction`, `GameState`, or
  `GameEvent` modifications.
- ESLint import boundaries: no new cross-layer imports. `NoiseFilter` is from
  `pixi.js` (already an allowed import in `src/ui/`).

---

## 8. Risks

- **`NoiseFilter` not exported by this PixiJS v8 build:** mitigated by `try/catch`
  degradation (grain absent, rest of noir stack intact).
- **Vignette implementation:** `FillGradient` API availability varies by PixiJS
  v8 minor version. The fallback (overlapping fills with zero-alpha ellipse)
  produces a visually acceptable result on all backends.
- **`mainMenu.test.ts` button-count assertion (`toBe(8)`):** new visual nodes
  have default `eventMode = 'none'` so `collectInteractives()` does not count
  them. If any node accidentally gets `eventMode = 'static'`, the count assertion
  will fail with a clear diagnostic.
- **`attachPostProcess` idempotency on restart:** restart calls
  `createGameState` + `updateGameState([Start])` without re-entering `'intro'`.
  The `phaseBeforeUpdate === 'intro'` guard is therefore never true during
  restart, so `attachPostProcess` is not called twice. Confirmed by tracing
  `restartGame()` in `main.ts` lines 307–324.
