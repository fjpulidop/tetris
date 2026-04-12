# Design: Add Modern Open-Source README with Badges, Demo, and Contributing Guide

**Change name:** modern-readme
**Date:** 2026-04-12

---

## 1. Scope of Change

This change is entirely in the documentation layer. No source files in `src/`, no configuration files, and no package manifests are modified. The only new files are:

| File | Change type | Summary |
|---|---|---|
| `README.md` | Create | Primary deliverable — full project readme at repo root |
| `docs/assets/.gitkeep` | Create | Establishes the `docs/assets/` directory for the screenshot placeholder |

---

## 2. Document Architecture

The README is structured in reading order, top to bottom, matching the mental model of a developer who arrives from GitHub cold:

```
1. Header block (centered)
   └── Project name (h1)
   └── One-line tagline
   └── Screenshot placeholder
   └── Badge row

2. Overview paragraph (2–3 sentences)

3. Tech Stack

4. Getting Started
   └── Prerequisites
   └── Five copy-paste commands

5. Features (6+ bullets)

6. Project Structure (directory tree)

7. Contributing

8. License
```

This order is deliberate. The header communicates identity immediately. Getting Started comes before Features because developers want to run the game before reading a bullet list. Project Structure follows naturally after running, for developers who want to understand the codebase.

---

## 3. Header Block Design

### 3.1 Centering approach

GitHub's markdown renderer does not support CSS. The only reliable centering mechanism is an HTML `<div align="center">` wrapper. This is well-established practice in open-source READMEs (used by PixiJS, Vite, and Vitest themselves).

```html
<div align="center">

# Falling Block Puzzle

> A fast, WebGL-powered falling-block puzzle game built with PixiJS v8 and TypeScript.

![screenshot](docs/assets/screenshot.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PixiJS](https://img.shields.io/badge/PixiJS-v8-red)](https://pixijs.com/)
[![Vite](https://img.shields.io/badge/Vite-5-purple?logo=vite)](https://vitejs.dev/)

</div>
```

The blank lines inside the `<div>` are required — GitHub's markdown parser requires blank lines between HTML blocks and markdown elements.

### 3.2 Screenshot placeholder

The path `docs/assets/screenshot.png` is used in the `<img>` tag. This directory is created with a `.gitkeep`. The alt text `screenshot` degrades gracefully to the alt text string on GitHub if the file is absent. A comment in the README instructs contributors on how to replace the placeholder.

### 3.3 Badges

All badges are static shields.io URLs. No CI integration is required. The badge selection covers:

| Badge | shields.io URL fragment | Rationale |
|---|---|---|
| License: MIT | `badge/License-MIT-yellow.svg` | Communicates open-source friendliness immediately |
| TypeScript 5 | `badge/TypeScript-5-blue?logo=typescript` | Primary language; the logo is recognizable |
| PixiJS v8 | `badge/PixiJS-v8-red` | Core rendering dependency; unusual enough to signal |
| Vite 5 | `badge/Vite-5-purple?logo=vite` | Build tooling; fast iteration story |

**Not included:** A "build passing" dynamic badge would require GitHub Actions CI. Since no CI workflow exists in this repo, a dynamic badge would either be broken or require a CI change outside this scope. Static badges are correct here.

---

## 4. Tech Stack Section

A simple two-column table is the most scannable format:

```markdown
| Technology | Version | Role |
|---|---|---|
| [PixiJS](https://pixijs.com/) | v8 | WebGL 2D rendering engine |
| [Vite](https://vitejs.dev/) | 5 | Dev server and bundler |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type-safe game logic |
| [Vitest](https://vitest.dev/) | 1 | Unit testing framework |
```

The versions are taken directly from `package.json` (pixi.js: ^8.0.0, vite: ^5.0.0, typescript: ^5.0.0, vitest: ^1.0.0).

---

## 5. Getting Started Section

### 5.1 Prerequisites

One line: Node.js 18+ and npm. No version pinning beyond major version.

### 5.2 Commands

The five commands the ticket specifies, each in its own fenced block group:

```bash
git clone https://github.com/<your-org>/falling-block-puzzle.git
cd falling-block-puzzle
npm install
npm run dev
```

```bash
npm run test
```

```bash
npm run build
```

**Design note:** Splitting into three blocks (setup/dev, test, build) groups related commands logically. A single block with all five commands is also valid, but grouping helps scanability and copy-paste accuracy.

The `npm run dev` script launches Vite on localhost:5173 (Vite's default). This should be noted inline.

---

## 6. Features Section

The features section must list at minimum six items covering the acceptance criteria. The actual implemented features (from reading the codebase) are:

1. **SRS rotation system** — Super Rotation System with wall-kick tables (verified in `src/engine/rotation.ts`)
2. **All 7 tetrominoes** — I, O, T, S, Z, J, L (verified in `src/engine/pieces.ts`, `engine/types.ts`)
3. **Level progression** — gravity accelerates as lines clear (verified in `src/engine/gravity.ts`)
4. **Touch controls** — virtual on-screen buttons for mobile play (verified in `src/input/touch.ts`, `src/ui/hud.ts`)
5. **WebGL rendering via PixiJS v8** — hardware-accelerated graphics (verified in `src/renderer/app.ts`)
6. **Visual effects** — glow and bloom post-processing filters (verified in `src/renderer/effects.ts`, `postProcess.ts`)
7. **DAS/ARR keyboard input** — precise hold-to-repeat timing for competitive play (verified in `src/input/keyboard.ts`)
8. **Animated splash screen** — polished entry experience (verified in `src/ui/splashScreen.ts`)
9. **Pause with blurred overlay** — pause modal with blurred background (verified in `src/ui/pauseModal.ts`)

This gives nine verified bullets, all exceeding the six-item minimum. All nine should be included — each is a genuine differentiator.

---

## 7. Project Structure Section

The section uses a fenced code block with a directory tree. The tree must match the actual `src/` layout exactly (confirmed by directory listing):

```
src/
├── engine/          # Pure game logic — board, gravity, rotation, line-clear, SRS
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
├── input/           # Keyboard and touch input with DAS/ARR
│   ├── keyboard.ts
│   └── touch.ts
├── ui/              # HUD, splash screen, pause modal
│   ├── hud.ts
│   ├── pauseModal.ts
│   └── splashScreen.ts
└── main.ts          # Entry point — game loop, input wiring
```

The brief comment after each directory name is intentional: GitHub renders these in the code block verbatim and they provide just enough orientation without becoming prose.

**Not included in the tree:** `src/__tests__/` — test files are implementation details, not part of the public-facing project structure description.

---

## 8. Contributing Section

The contributing section is concise. It should answer two questions for a first-time contributor: "How do I report a bug?" and "How do I submit a patch?"

Structure:
1. One sentence inviting contributions.
2. **Issues** — one sentence: use GitHub Issues; include steps to reproduce and browser/OS.
3. **Pull Requests** — four bullets: fork → branch → commit (conventional commits) → PR against `main`.
4. One sentence noting that the `engine/` layer has zero external imports by design (ESLint-enforced) — so contributors should not add imports there.

The note about the architectural constraint is specifically valuable here because it's a non-obvious rule that a contributor would violate if they didn't know it. This is the right place to surface it.

---

## 9. License Section

A single line:

```markdown
Distributed under the [MIT License](LICENSE). See `LICENSE` for details.
```

**Note:** No `LICENSE` file exists in the repo. The README references it at `LICENSE`. This is acceptable — the README can reference a file that the developer adds later (or in a parallel task). The reference should not be omitted. The design notes this dependency explicitly in Risks.

---

## 10. Trademark Compliance

The word "Tetris" must not appear anywhere in `README.md`. All references use:

- "falling-block puzzle game" — for the genre/game description
- "tetrominoes" — for the pieces (safe; predates the trademark)
- "SRS" or "Super Rotation System" — for the rotation algorithm

Review every occurrence of "Tetris" during implementation. The README linter does not catch trademark issues — this is a manual review requirement.

---

## 11. Markdown Quality

- No raw HTML outside the intentional `<div align="center">` wrapper.
- All links use reference-style or inline URLs — no bare URLs.
- Fenced code blocks use explicit language identifiers (`bash`, `text`).
- Line length in prose paragraphs is kept under 100 characters for GitHub's rendered width.
- No trailing whitespace (causes diff noise and can trigger linters).
- A single blank line between all sections (not two).
- The file ends with a single trailing newline.

---

## 12. Architectural Decisions

### Decision 1: Static badges over dynamic CI badges

Dynamic "build passing" badges require a CI workflow. Adding CI is outside this change's scope. A broken dynamic badge is worse than no badge. Static shields.io badges are the correct choice here — they communicate the tech stack clearly without requiring CI infrastructure.

### Decision 2: Screenshot placeholder path is `docs/assets/screenshot.png`

An alternative is `assets/screenshot.png` at the root, but `docs/assets/` is more conventional for projects that may accumulate additional documentation assets (architecture diagrams, GIFs, etc.). The path is also clearly communicative to a first contributor about where to put the actual screenshot.

### Decision 3: Contributing section inline rather than `CONTRIBUTING.md`

For a small project, a separate `CONTRIBUTING.md` adds navigation friction. The inline Contributing section covers the two things a contributor needs. If the project grows, it can be extracted later. The inline form is simpler and sufficient.

### Decision 4: Nine feature bullets instead of exactly six

The ticket requires at least six. Nine verified, implemented features exist in the codebase. Omitting implemented features to hit a minimum would be misleading. All nine are included.
