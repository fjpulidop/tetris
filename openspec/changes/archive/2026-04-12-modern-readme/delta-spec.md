# Delta Spec: Add Modern Open-Source README with Badges, Demo, and Contributing Guide

**Change name:** modern-readme
**Date:** 2026-04-12

---

## Baseline

No `README.md` exists at the repo root. No `docs/` directory exists.

---

## What Changes

### New: `README.md` (repo root)

A new file, approximately 120–150 lines of Markdown, with the following required sections:

**Section 1 — Header block** (`<div align="center">` wrapper)
- H1: "Falling Block Puzzle"
- Blockquote tagline: one sentence describing the game as a falling-block puzzle game
- Image: `docs/assets/screenshot.png` with alt text "screenshot"
- Badge row: License MIT, TypeScript 5, PixiJS v8, Vite 5 (all static shields.io)

**Section 2 — Overview**
- 2–3 sentence paragraph summarizing what the game is, technology used, and platform target

**Section 3 — Tech Stack** (H2)
- A Markdown table with four rows: PixiJS v8, Vite 5, TypeScript 5, Vitest 1
- Columns: Technology (linked), Version, Role

**Section 4 — Getting Started** (H2)
- H3 "Prerequisites": Node.js 18+ and npm
- H3 "Installation": fenced bash block with: `git clone`, `cd`, `npm install`, `npm run dev`
- H3 "Testing": fenced bash block with: `npm run test`
- H3 "Production Build": fenced bash block with: `npm run build`

**Section 5 — Features** (H2)
- Unordered list with nine bullets (all verified against implemented source):
  1. SRS rotation with wall-kick tables
  2. All 7 tetrominoes (I, O, T, S, Z, J, L)
  3. Level progression with accelerating gravity
  4. Touch controls with virtual on-screen buttons
  5. WebGL rendering via PixiJS v8
  6. Glow and bloom post-processing visual effects
  7. DAS/ARR keyboard input for precise hold-to-repeat
  8. Animated splash screen on load
  9. Pause overlay with blurred background

**Section 6 — Project Structure** (H2)
- One fenced `text` code block containing a directory tree of `src/` (see design §7 for exact tree)
- Tree includes all seven `engine/` files, five `renderer/` files, two `input/` files, three `ui/` files, and `main.ts`
- Brief inline comment on each directory line (prefixed with `#`)
- `__tests__/` is intentionally omitted

**Section 7 — Contributing** (H2)
- Invitation sentence
- H3 "Issues": instructions to open a GitHub Issue
- H3 "Pull Requests": four-item ordered list (fork, branch, commit, PR against `main`)
- One sentence noting the `engine/` layer boundary constraint

**Section 8 — License** (H2)
- One line: "Distributed under the MIT License. See `LICENSE` for details." with a link on "MIT License"

---

## What Does Not Change

- No source files in `src/` are modified
- No configuration files (`vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `package.json`) are modified
- No `.claude/` or `openspec/` files are modified
- No GitHub Actions workflows are added
- No `LICENSE` file is created (noted as a dependency — the README references `LICENSE` but does not create it)

---

## Constraints

| Constraint | Enforcement |
|---|---|
| "Tetris" must not appear anywhere in `README.md` | Manual review; developer must search before committing |
| All version numbers must match `package.json` | Developer must cross-reference `package.json` before writing |
| Project Structure tree must match actual `src/` layout | Developer must run `find src -type f \| sort` before writing |
| Screenshot path must be `docs/assets/screenshot.png` | Hardcoded in spec; developer creates the directory |
| Centering uses `<div align="center">` only | No other raw HTML outside this wrapper |
| Line length in prose sections ≤ 100 characters | Manual line-wrap discipline during authoring |
| File ends with a single trailing newline | Editor/linter requirement |

---

## Acceptance Test Checklist

- [ ] `README.md` exists at `/README.md` (repo root)
- [ ] `docs/assets/` directory exists (with `.gitkeep` or actual screenshot)
- [ ] Running `grep -i tetris README.md` returns no matches
- [ ] H1 heading is "Falling Block Puzzle"
- [ ] Four shields.io badge links are present
- [ ] Five npm/git commands appear in fenced code blocks
- [ ] Feature list has nine bullets
- [ ] Project Structure tree contains: `engine/`, `renderer/`, `input/`, `ui/`, `main.ts`
- [ ] Contributing section contains both "Issues" and "Pull Requests" subsections
- [ ] License section references `LICENSE` file
- [ ] No raw HTML outside the `<div align="center">` wrapper
