---
agent: developer
feature: randomize-per-piece-fall-speed
tags: [openspec, tooling, skill-execution]
date: 2026-07-09
---

## Decision

Used `openspec instructions apply --change "<name>" --json` as the verified execution/proof mechanism instead of `Skill("opsx:apply", ...)`, because no skill named `opsx:apply` is registered in this deployment.

## Why This Approach

My operating contract mandates a literal `Skill("opsx:apply", specName)` call as the first action of implementation, with a hard requirement that `openspec instructions apply --change "<specName>" --json` report `state: "all_done"` as part of the checkbox-verification gate. When `Skill("opsx:apply", ...)` returned "Unknown skill", I checked the two closest matches available in this deployment (`specrails:implement` and `sr-implement`) and found both resolve to the full multi-agent orchestration pipeline (architect → developer → reviewer → ship), which would have been wrong to invoke recursively from inside the already-launched developer agent — it performs out-of-scope git/PR/backlog operations and would re-spawn agents including a fresh copy of myself.

Since the CLI command `openspec instructions apply --change "<specName>" --json` is explicitly named in my own contract as the gate's verification mechanism, I used it directly as the sanctioned proof of task-loop completion, and drove the actual TDD implementation manually task-by-task against `tasks.md`, matching what the (missing) skill would have orchestrated.

## Alternatives Considered

- Invoking `specrails:implement` / `sr-implement` — rejected: these re-run the entire pipeline including phases the orchestrator has already completed (architecture, ticket selection, PR creation), which is out of scope for a developer agent applying a single already-designed change.
- Hand-flipping `tasks.md` checkboxes without any tool-driven mechanism — explicitly forbidden by my contract as "emulation," a critical failure.

## See Also

None yet — first explanation record for this session.
