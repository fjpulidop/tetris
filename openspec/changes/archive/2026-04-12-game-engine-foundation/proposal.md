# Proposal: Game Engine Foundation

**Change name:** game-engine-foundation
**Ticket:** #1 — Establish Cross-Platform 2D Block-Falling Game Engine Foundation
**Estimated complexity:** High (3–7 days)
**Date:** 2026-04-12

---

## Summary

The project currently has only infrastructure scaffolding (`.eslintrc.cjs`, `.gitignore`, `openspec/config.yaml`). There is no source code, no build configuration, and no game logic. This change establishes the complete technical foundation of the falling-block puzzle game — from `package.json` through a fully playable first build.

The foundation is built around three technology choices that are fixed for the project:

- **Vite 5** as the build tool and dev server. Near-zero configuration, native ESM output, and fast HMR make it the natural fit for a TypeScript browser game.
- **PixiJS v8** as the 2D renderer. WebGL2/WebGPU primary path with automatic Canvas 2D fallback ensures broad device compatibility while delivering the GPU-accelerated visuals required by the "top 2D" aesthetic goal.
- **Vitest** for unit testing. It runs natively in the Vite pipeline, requires no separate config, and supports TypeScript without extra transforms.

## Motivation

Without a foundation, no development can proceed. The goal is to deliver the smallest complete vertical slice that satisfies all acceptance criteria in Ticket #1: a playable browser game with correct piece mechanics, responsive layout, keyboard and touch controls, visual effects, and a unit-tested engine layer — all from a single `npm run dev` command.

## Scope

### In scope

- `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`
- `src/engine/` — board model, tetromino piece set, SRS wall-kick tables, gravity, lock-delay, line-clear logic
- `src/renderer/` — PixiJS application setup, board and piece rendering, particle/flash line-clear effects, glow/bloom post-processing
- `src/input/` — keyboard bindings (arrow keys, Z/X/Space), virtual touch controls via Pointer Events API
- `src/ui/` — minimal HUD: score, level, next-piece preview
- `src/main.ts` — fixed-timestep game loop wiring all layers together
- Unit tests for `engine/` targeting ≥ 80% branch coverage

### Out of scope

- Multiplayer or networked play
- Sound and music
- Leaderboards or score persistence
- User accounts or authentication
- Mobile app wrapping (browser-only)
- Advanced UI screens (splash, settings, game-over screen with animations)
- Monetization
- CI/CD pipeline

## Non-goals

This change does not define the final visual style, scoring formula, or HUD layout. All of those can be iterated on top of the foundation this change establishes.

## Success criteria (abbreviated)

1. `npm run dev` serves the game at 60 fps on Chrome, Firefox, and Safari (desktop and mobile viewport).
2. All 7 tetrominoes spawn, rotate (SRS wall kicks), and lock correctly.
3. Gravity increases per level; completed lines are cleared.
4. Virtual touch controls functional on 375 px viewport; keyboard controls functional on desktop.
5. Line-clear events trigger a visible particle/flash effect.
6. WebGL on capable devices; Canvas 2D fallback otherwise.
7. `npm run build` exits clean (zero TS errors, zero lint errors).
8. `engine/` unit tests pass with ≥ 80% branch coverage.
9. `engine/` has zero imports from `renderer/`, `input/`, or `ui/` — enforced by ESLint.
