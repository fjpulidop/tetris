# Proposal: Enhanced Visual Effects & Particle Systems

## What We're Building

A richer, multi-tier particle and flash effect system layered on top of the existing
`EffectsRenderer` class. Every significant gameplay moment — piece lock, line clear,
Tetris (4-line clear), and level-up — gets a distinct, visually proportionate
response. The active piece also receives a continuous, low-intensity idle shimmer so
players always have a visual anchor on the falling piece. All new effects route
through the existing `GameEvent` dispatch path in `main.ts` and stay entirely inside
the `src/renderer/` layer.

## Why

The current particle system fires only on `line-clear`, and the flash/particle pair it
produces is identical regardless of whether the player cleared one row or all four.
Players who land a Tetris or trigger a level-up receive no extra visual reward
proportionate to their skill. This creates a flat emotional curve during play: every
moment looks the same. Differentiated, escalating visual feedback closes the reward
loop, re-inforces good play, and raises the perceived production quality of the game
without touching any mechanics.

## Scope

**In scope:**
- `src/renderer/effects.ts` — extend `EffectsRenderer` with piece-lock burst emitter,
  scaled line-clear spark sweep, Tetris full-screen flash overlay, level-up screen-edge
  pulse, and active-piece idle shimmer.
- `src/renderer/postProcess.ts` — add `setBloomIntensity(strength: number, durationMs: number)`
  to support transient bloom spikes driven by gameplay events.
- `src/main.ts` — forward two new event types (`piece-lock`, `level-up`) and pass
  `GameState` to `EffectsRenderer` each tick for idle shimmer.

**Out of scope:**
- New `GameEvent` types or `GameState` fields — engine is untouched.
- Audio cues, haptics, or new settings UI.
- New npm packages; PixiJS built-ins and the already-installed `@pixi/filter-glow` /
  `@pixi/filter-bloom` are sufficient.
- Per-effect settings/toggles visible to the player in this iteration.

## High-Level Visual Inventory

| Trigger | Effect |
|---|---|
| `piece-lock` | Radial burst: ≥20 particles in piece color from lock position, ~500ms lifetime |
| `line-clear` × 1 | Horizontal spark sweep across cleared row(s), white/neutral |
| `line-clear` × 2–3 | Spark sweep + screen-edge color pulse (medium intensity) |
| `line-clear` × 4 (Tetris) | Full-screen flash overlay + heavy burst + bloom spike ~500ms |
| `level-up` | Screen-edge pulse (gold tint) + brief background color shift ~800ms |
| Active piece (idle) | Subtle per-cell glow shimmer cycling alpha, low opacity |

## Key Constraints

- All new PixiJS objects are renderer-owned; no DOM manipulation.
- Import boundaries are unchanged: `src/renderer/` must not import from `src/input/` or
  `src/ui/`. `src/engine/` is not touched.
- Existing `onEvents()` behavior for `line-clear` is preserved; new code is additive.
- All animations are time-based (driven by `tick(dtMs)`) — they degrade gracefully if
  the frame rate drops; no effect blocks the render loop.
- The particle pool is expanded but pre-allocated at construction time, not dynamically
  grown, to avoid mid-game GC pressure.
- The idle shimmer is a lightweight alpha pulse on a single `Graphics` overlay per
  active-piece cell; it does not interfere with the existing `PieceRenderer` cell
  graphics.
- `postProcess.ts` currently has no exported class. The bloom-intensity feature is
  introduced as a thin stateful wrapper (`PostProcessController`) returned by
  `attachPostProcess()`.
