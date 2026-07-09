---
name: tooling
description: OpenSpec CLI apply-verification command, missing opsx:apply skill, and node_modules state in this tetris worktree
metadata:
  type: reference
---

## `Skill("opsx:apply", ...)` does not exist in this deployment

Checked during the `randomize-per-piece-fall-speed` change (2026-07-09). This deployment has no skill literally named `opsx:apply`. The two closest candidates, `specrails:implement` and `sr-implement`, both resolve to the SAME full multi-agent pipeline skill (architect → developer → reviewer → ship, with worktrees/PR/backlog automation) — do NOT invoke either from inside an already-launched sr-developer agent; it recurses and performs out-of-scope operations.

**What to use instead for the Phase 3 checkbox-verification gate:** `openspec instructions apply --change "<specName>" --json` (openspec CLI, v1.2.0 in this repo). This is the command my own contract already names as the gate's verification source of truth. It reports `state: "all_done"` plus a `progress: { total, complete, remaining }` object and a `tasks[]` array with `done: true/false` per task — read `tasks.md` directly for the actual `- [x]` markers, use this command to double-check.

Example verified output shape:
```json
{ "progress": { "total": 4, "complete": 4, "remaining": 0 }, "state": "all_done", ... }
```

See [[explanations/2026-07-09-developer-openspec-apply-mechanism-substitution]] for full reasoning.

## `node_modules` may be absent in fresh worktrees

In the `ticket-3` worktree, `node_modules` was completely missing at the start of this session (confirmed via `ls node_modules/.bin/tsc` failing). `npm run build` failed with ~25 unrelated "cannot find module" errors before any real compile errors showed up. Fix: `npm install` (took ~310 packages, no blocking issues). **Always run `npm install` first if `npm run build`/`npm run test` throws a wall of module-not-found errors** — don't assume they're all caused by your change; separate environment noise from real compile errors by re-running after install.
