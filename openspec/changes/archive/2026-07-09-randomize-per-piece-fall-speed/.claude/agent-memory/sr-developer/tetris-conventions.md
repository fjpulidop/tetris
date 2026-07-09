---
name: tetris-conventions
description: Project-specific conventions in the tetris repo (falling-block-puzzle) - no literal "Tetris" word, layered ESLint import restrictions, non-null assertion style
metadata:
  type: project
---

## Never use the literal word "Tetris"

Project-wide convention (source, tests, comments, user-facing strings). Package name is `falling-block-puzzle`. One pre-existing exception slipped through in `src/__tests__/engine/gameState.test.ts` line ~624 (`'four line clear (Tetris) at level 2 scores 1600'`) — this predates my `randomize-per-piece-fall-speed` change and I left it untouched (out of scope to fix incidentally). Flag it if asked to do a cleanup pass, otherwise don't touch.

## Layered architecture ESLint import restrictions

Enforced via `no-restricted-imports` overrides in `.eslintrc.cjs`:
- `engine/` must not import `renderer/`, `input/`, or `ui/`
- `renderer/` must not import `input/` or `ui/`
- `input/` must not import `renderer/` or `ui/`
- `audio/` must not import `renderer/`, `input/`, or `ui/` — may only import `engine/types.ts` from `engine/` (not other engine files)

## Style: no `void x` for intentionally-unused function params

`no-unused-vars` default config is `args: "after-used"` — an unused parameter is NOT flagged as long as a later parameter in the same signature is used. E.g. `applyGravity(gravityState, board, piece, dtMs, level, softDrop)` — `level` is unused internally but `softDrop` (after it) is used, so no ESLint warning and no `void level` statement needed. Grepped the codebase for `void ` unused-param patterns before adding one — found none, so removed it to match convention.

## Non-null assertions (`!`) are an accepted, if warned, pattern

`@typescript-eslint/no-non-null-assertion` fires as a WARNING (not error) project-wide — dozens of pre-existing warnings across `rotation.ts`, `pieceRenderer.ts`, `pauseModal.ts`, test files, etc. `npm run lint` exits 0 with warnings present. Using `!` where a lookup is guaranteed non-null by prior logic (e.g. `GRAVITY_TABLE[GRAVITY_TABLE.length - 1]!` as a fallback after `??`) is consistent with existing style — don't over-engineer around it with extra guards.

## Engine layer is pure / no module-level mutable state

`src/engine/*.ts` functions take full state as arguments and return new state — `GravityState`, `GameState`, etc. `Math.random()` calls are deliberately placed at well-defined non-determinism points only (7-bag shuffle in `gameState.ts`, per-piece gravity randomization in `gravity.ts`'s `initialGravityState()`) — never inside per-tick hot paths like `applyGravity()`.
