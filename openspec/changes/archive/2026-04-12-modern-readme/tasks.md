# Tasks: Add Modern Open-Source README with Badges, Demo, and Contributing Guide

**Change name:** modern-readme
**Date:** 2026-04-12

Tasks are ordered by dependency. This change is entirely documentation — no source code or configuration files are modified.

---

## Group 1: Documentation

### Task 1.1 — Create `docs/assets/` placeholder directory
**Layer:** `[docs]`

**Description:**
Create the `docs/assets/` directory with a `.gitkeep` file so that the path referenced in the README (`docs/assets/screenshot.png`) resolves to a real directory in the repository. This prevents the broken-image icon from appearing when a contributor clones the repo but has not yet added a screenshot.

Add a brief comment inside `.gitkeep` (or alongside it as `.gitkeep` is empty by convention — use a `README` stub inside the directory instead) is optional. The directory must exist before the `README.md` references it.

**Files:**
- Create: `docs/assets/.gitkeep`

**Acceptance criteria:**
- `docs/assets/` exists as a tracked directory in git.
- `docs/assets/screenshot.png` does not need to exist yet — the `<img>` tag in the README degrades gracefully to alt text on GitHub.

---

### Task 1.2 — Write `README.md`
**Layer:** `[docs]`

**Description:**
Create `README.md` at the repository root following the structure defined in `design.md` exactly. This is the primary deliverable of the change.

The document must be written in the following order, with no sections omitted:

**Block 1 — Header** (inside `<div align="center">`)
```
# Falling Block Puzzle

> A fast, WebGL-powered falling-block puzzle game built with PixiJS v8 and TypeScript.

![screenshot](docs/assets/screenshot.png)

<!-- Replace screenshot.png with an actual game screenshot or animated GIF. -->

[four shields.io badge links — see design §3.3 for exact URLs]
```

Exact badge URLs to use:
- `https://img.shields.io/badge/License-MIT-yellow.svg` — linked to `LICENSE`
- `https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white` — linked to `https://www.typescriptlang.org/`
- `https://img.shields.io/badge/PixiJS-v8-e91e63` — linked to `https://pixijs.com/`
- `https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white` — linked to `https://vitejs.dev/`

**Block 2 — Overview** (after the `</div>`)

A short paragraph (2–3 sentences) explaining what the game is and what technology powers it. Do not use the word "Tetris". Use "falling-block puzzle game" for the genre.

**Block 3 — Tech Stack** (H2)

Markdown table with four rows matching `package.json` versions exactly:
- PixiJS: v8 (from `"pixi.js": "^8.0.0"`)
- Vite: 5 (from `"vite": "^5.0.0"`)
- TypeScript: 5 (from `"typescript": "^5.0.0"`)
- Vitest: 1 (from `"vitest": "^1.0.0"`)

**Block 4 — Getting Started** (H2)

H3 "Prerequisites" — Node.js 18+ and npm (no specific patch version).

H3 "Installation" — a single fenced bash block:
```bash
git clone https://github.com/<your-org>/falling-block-puzzle.git
cd falling-block-puzzle
npm install
npm run dev
```
Add an inline note that `npm run dev` starts the Vite dev server at `http://localhost:5173`.

H3 "Testing" — a single fenced bash block:
```bash
npm run test
```
Optional: mention `npm run test:coverage` for coverage reporting.

H3 "Production Build" — a single fenced bash block:
```bash
npm run build
```

**Block 5 — Features** (H2)

Unordered list with these nine bullets (exact wording is the developer's discretion; the concepts listed here are required):
1. Super Rotation System (SRS) with wall-kick tables
2. All 7 standard tetrominoes (I, O, T, S, Z, J, L)
3. Level progression — gravity accelerates as lines are cleared
4. Touch controls — virtual on-screen buttons for mobile play
5. WebGL rendering powered by PixiJS v8
6. Glow and bloom visual effects via post-processing filters
7. DAS/ARR keyboard input — precise hold-to-repeat timing for competitive play
8. Animated splash screen on load
9. Pause overlay with blurred background and keyboard navigation

**Block 6 — Project Structure** (H2)

A fenced `text` block containing this exact tree (the tree must match the actual `src/` directory):

```text
src/
├── engine/          # Pure game logic — board, gravity, SRS rotation, line-clear
│   ├── board.ts
│   ├── gameState.ts
│   ├── gravity.ts
│   ├── lineClear.ts
│   ├── pieces.ts
│   ├── rotation.ts
│   └── types.ts
├── renderer/        # PixiJS rendering — board, pieces, effects, post-processing
│   ├── app.ts
│   ├── boardRenderer.ts
│   ├── effects.ts
│   ├── pieceRenderer.ts
│   └── postProcess.ts
├── input/           # Keyboard (DAS/ARR) and touch input handlers
│   ├── keyboard.ts
│   └── touch.ts
├── ui/              # HUD, splash screen, pause modal
│   ├── hud.ts
│   ├── pauseModal.ts
│   └── splashScreen.ts
└── main.ts          # Entry point — game loop and input wiring
```

**Block 7 — Contributing** (H2)

Opening sentence inviting contributions.

H3 "Reporting Issues":
- Open a GitHub Issue
- Include steps to reproduce, expected vs. actual behavior, and your browser and OS

H3 "Submitting Pull Requests":
1. Fork the repository and create a feature branch from `main`.
2. Make your changes with descriptive commits (conventional commits style preferred).
3. Ensure `npm run test` and `npm run build` pass locally.
4. Open a PR against `main` with a clear description of what and why.

One paragraph noting the architectural constraint: the `engine/` layer has no imports from `renderer/`, `input/`, or `ui/` — this is enforced by ESLint. Contributors should not introduce cross-layer imports in that direction.

**Block 8 — License** (H2)

```markdown
Distributed under the [MIT License](LICENSE). See `LICENSE` for details.
```

**Files:**
- Create: `README.md`

**Acceptance criteria:**
- `README.md` exists at the repo root.
- `grep -i tetris README.md` returns no matches.
- All four badges render (links are well-formed shields.io URLs).
- All five npm/git commands appear in fenced bash blocks.
- The feature list has nine bullets.
- The Project Structure tree is verbatim-accurate against the actual `src/` directory layout.
- The Contributing section has both "Reporting Issues" and "Submitting Pull Requests" subsections.
- No raw HTML appears outside the `<div align="center">` wrapper.
- File ends with a single trailing newline.

---

## Task Ordering Summary

```
1.1 (docs/assets/.gitkeep) ──→ 1.2 (README.md)
```

Task 1.1 must be complete before 1.2 is committed, because the README references `docs/assets/screenshot.png`. In practice both can be committed in the same commit.
