# Proposal: Film Noir Visual Makeover for Splash/Intro Screen

## Status
Proposed

## Ticket
#40

## Problem Statement

The current intro/menu screen (`src/ui/splashScreen.ts` and `src/ui/mainMenu.ts`) uses a generic monospace font, a bright white title with a glow filter, and a pulsing blue-tinted subtitle on a near-black flat background. The aesthetic reads as "developer placeholder" rather than a deliberate visual style. There is no atmosphere, no motion texture, and no tonal contrast to distinguish the splash from the in-game board view. Returning players encounter the same flat screen on every session.

## Proposed Solution

Restyle the intro screen with a **film noir** visual language: near-black background, centered spotlight vignette over the title, animated film-grain overlay using PixiJS `NoiseFilter` with a per-frame seed increment, a falling dust/rain particle layer (fewer than 80 sprites, pooled), a typewriter-then-blink "press to start" prompt, and at most two desaturated cold accent colors throughout the UI. Typography uses a condensed serif or bold slab-serif via CSS/PixiJS `TextStyle` (web font if available, `Georgia, serif` as the fallback).

Post-processing bloom/glow on the splash is disabled or reduced to preserve noir darkness. A hard cut transitions to gameplay on Start (an iris-wipe is a stretch goal after the baseline is shipped).

Only `src/ui/splashScreen.ts`, `src/ui/mainMenu.ts`, `src/renderer/postProcess.ts` (wiring change in `main.ts`), and the web-font loading path in `index.html` are touched. Engine, board, HUD, piece colors, audio, and mobile layout are untouched.

## Acceptance Criteria

1. Intro background is `#0a0a0a` or darker (visually pitch-black at typical gamma).
2. A radial spotlight vignette is visible — bright center fading to full black at edges — centered on the title text.
3. Animated film-grain covers the entire splash container at all times; grain appears to "change" every frame (NoiseFilter seed increments on each tick).
4. Falling dust/rain effect uses fewer than 80 pooled sprites; no heap allocation per frame after initial pool construction.
5. Typography uses a condensed or slab serif for the title (with `Georgia, serif` fallback); the "press to start" prompt renders as a typewriter reveal followed by a cursor blink.
6. No more than two hue values are used as accent colors across all splash UI elements (both must be desaturated and cold — blues, silvers, greys).
7. Post-processing bloom/glow filter on `boardContainer` and `pieceContainer` is suspended while the game is in `'intro'` phase and restored on transition to `'playing'`.
8. Transition from intro to gameplay is a clean hard cut (no partial-frame artifact visible). An iris-wipe is optional and out of scope for this change.
9. All existing tests (`npm test`) continue to pass without modification.
10. ESLint import-boundary rules pass: `src/ui/` continues to not import from `src/engine/` (except `engine/types.ts` and `engine/scenarios.ts` which are already permitted).
11. Mobile layout is not regressed: splash is centered and readable at 320 px width.
12. Gameplay visuals (board, HUD, piece colors, effects), audio, and mechanics are completely unchanged.

## Non-Goals

- Restyling the pause modal, game-over overlay, or HUD.
- Iris-wipe or any animated scene transition (a hard cut is sufficient).
- Changing piece colors, board palette, or any gameplay renderer.
- Audio changes of any kind.
- Any new engine state or `GameAction` values.
- Dark/light theme toggle.
- Modifying touch control layout or breakpoint logic.

## Technical Considerations

- **Layer**: changes are confined to `src/ui/` and the wiring in `src/main.ts`. The film-grain overlay and dust particles are pure PixiJS objects constructed and animated inside `splashScreen.ts` — no cross-layer imports are introduced.
- **`NoiseFilter`**: bundled with PixiJS v8 (`pixi.js` package) as `NoiseFilter`. No new npm package required. Seed is incremented each tick to produce visible per-frame variation.
- **Spotlight vignette**: implemented as a `Graphics` radial-gradient fill (PixiJS `fillGradient`) or as a `Sprite` with a programmatically-drawn radial alpha texture. Both are confined to `src/ui/splashScreen.ts`.
- **Dust particles**: a pre-allocated pool of `Sprite`/`Graphics` nodes; positions reset to the top when they fall off-screen. Count is capped at 79 by a constant `DUST_PARTICLE_COUNT = 60`.
- **Typewriter prompt**: a ticker callback writes the subtitle one character at a time, then toggles a cursor character on/off after the string is fully revealed.
- **Post-process suspension**: `main.ts` currently calls `attachPostProcess(boardContainer, pieceContainer, app)` once at startup and never removes the filters. This must change so that filters are not applied while in `'intro'` phase. The least-invasive approach is to call `attachPostProcess` on the `intro → playing` edge-detection in the existing transition block. During `'intro'`, `boardContainer.filters` and `pieceContainer.filters` remain `null`.
- **Web font**: loaded via a `<link rel="preload">` in `index.html`. Only one web font is introduced (title). The subtitle and buttons continue to use the system-serif fallback unless the web font covers all weights needed. Font load failure must degrade gracefully.
- **Test surface**: `mainMenu.test.ts` relies on button-count and ticker assertions. The NoiseFilter and ticker mock must be extended slightly, but the structural shape of `MainMenu` does not change — no test assertions need to be rewritten.
