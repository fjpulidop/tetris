# Proposal: Chain Blast — Cascading Line-Clear Explosions

Ticket: #25

## What We're Building

A cascading chain mechanic that rewards spatial planning beyond the immediate line clear. When a row is cleared, each cell in the row has a 20% chance of charging the corresponding cell on the row directly above. Charged cells glow visually for 1.5 seconds. If a subsequent line clear touches any charged cell, those cells explode — destroying a 3×3 area on the board and scoring the event as a bonus partial clear. Explosions themselves may generate more charged cells, enabling chains. A depth-based multiplier (1× → 1.5× → 2× → 3× cap) amplifies scoring for each chain link, and visual intensity (bloom, screen shake, color temperature) escalates to match.

## Why

Line clears in their current form are isolated events — one action, one reward, no memory. Players who set up multi-line combinations get the same feedback as accidental single clears. The particle and post-processing systems introduced in earlier features are underutilized after the initial clear animation resolves. Chain Blast gives the effects system a meaningful story to tell, rewards expert play with compounding score, and adds the kind of emergent "holy moment" that makes puzzle games memorable.

## Scope

**In scope:**

- `src/engine/types.ts` — Add `GameEventType` variants: `'cell-charged'`, `'chain-explosion'`, `'chain-reset'`.
- `src/engine/gameState.ts` — Add `chargedCells`, `chainDepth`, `chainTimer` to `GameState`; wire chain logic into `updateGameState()`.
- `src/engine/chainBlast.ts` — New pure module: charge generation, explosion algorithm, decay tick, multiplier calculation.
- `src/renderer/boardRenderer.ts` — Charged-cell visual pass (pulsing glow overlay) before normal cell render.
- `src/renderer/effects.ts` — Handle `cell-charged`, `chain-explosion`, `chain-reset` events; scale bloom/shake/color with chain depth.
- `src/renderer/postProcess.ts` — Expose `setBloomIntensity(depth: number)` method; `attachPostProcess` returns a controller object.
- `src/main.ts` — Wire `PostProcessController` returned from `attachPostProcess`; forward chain depth from events to effects and post-process.
- `src/ui/hud.ts` — Display active chain multiplier when depth ≥ 2.
- `src/__tests__/engine/chainBlast.test.ts` — Unit tests for all new engine-layer pure functions.
- `src/__tests__/engine/gameState.test.ts` — Extended tests covering charge decay, explosion trigger, multiplier cap, and chain reset.

**Out of scope:**

- Per-cell physics simulation or free-fall after explosion (board collapses using existing `clearRows` gravity model only).
- Networked or server-side score verification.
- Audio cues for chain events (separate audio ticket).
- Touch-specific chain UI (follows existing mobile-first pattern passively).
- Charged-cell persistence across game restarts (state resets on `createGameState()`).

## Acceptance Criteria

1. Line clear produces charged cells on the row above with 20% probability per cleared cell; charged cells are visually distinct from normal locked cells.
2. A charged cell expires after 1.5 s if not triggered; the board state (`chargedCells`) reflects expiry, and the glow disappears from `boardRenderer`.
3. When a subsequent line clear touches (includes the column of) a charged cell, the charged cell explodes — destroying a valid 3×3 area on the board, with area clipped to board bounds. Any full rows formed by the explosion are scored as a standard line clear.
4. Chain multiplier increments correctly: 1× (no chain), 1.5× (depth 1), 2× (depth 2), 3× (depth 3+, capped). Multiplier resets 2 s after the last chain link.
5. Score displayed in the HUD reflects the multiplied value. Existing engine tests (`npm test`) remain green.
6. Bloom intensity, screen shake magnitude, and color temperature in effects shift with chain depth — no escalation at depth 0; maximum at depth 3+.
7. Engine layer remains pure: `chargedCells`, `chainDepth`, and `chainTimer` live in `GameState`; no DOM or PixiJS imports enter `src/engine/`.
8. `npm test` is green; `npm run lint` is clean; `npm run build` produces no TypeScript errors.
