# Context Bundle: Add Modern Open-Source README with Badges, Demo, and Contributing Guide

**Change name:** modern-readme
**Date:** 2026-04-12
**For:** Developer agent — consume this before beginning implementation.

---

## What to Build

Create `README.md` at the repo root and `docs/assets/.gitkeep` to establish the screenshot directory. This is a pure documentation change — no source code, configuration, or test files are modified.

The README must immediately communicate what the project is, how to run it, and how to contribute. It targets a developer who lands on the GitHub repository page cold.

---

## Critical Constraints

1. **Never write "Tetris" anywhere in `README.md`.** The genre is "falling-block puzzle game." The pieces are "tetrominoes." This is a hard legal requirement. After writing, run `grep -i tetris README.md` — it must return no matches.

2. **Version numbers must match `package.json` exactly.** The badge text and tech stack table must reflect the actual declared versions: PixiJS v8, Vite 5, TypeScript 5, Vitest 1.

3. **The Project Structure tree must match the actual `src/` layout.** The verified tree is provided below in the "Exact Directory Tree" section. Do not add or remove entries.

4. **No raw HTML outside `<div align="center">`.** The centered header block uses one HTML wrapper. All other content is standard Markdown.

5. **The file must end with a single trailing newline.**

6. **The `docs/assets/` directory must exist in git** (via `.gitkeep`) before or in the same commit as `README.md`.

---

## Exact Directory Tree (verified 2026-04-12)

Run `find src -type f | sort` to confirm. As of this writing, the output is:

```
src/__tests__/engine/board.test.ts
src/__tests__/engine/gameState.test.ts
src/__tests__/engine/gravity.test.ts
src/__tests__/engine/lineClear.test.ts
src/__tests__/engine/pieces.test.ts
src/__tests__/engine/rotation.test.ts
src/__tests__/input/keyboard.test.ts
src/__tests__/ui/pauseModal.test.ts
src/engine/board.ts
src/engine/gameState.ts
src/engine/gravity.ts
src/engine/lineClear.ts
src/engine/pieces.ts
src/engine/rotation.ts
src/engine/types.ts
src/input/keyboard.ts
src/input/touch.ts
src/main.ts
src/renderer/app.ts
src/renderer/boardRenderer.ts
src/renderer/effects.ts
src/renderer/pieceRenderer.ts
src/renderer/postProcess.ts
src/ui/hud.ts
src/ui/pauseModal.ts
src/ui/splashScreen.ts
```

The Project Structure section of the README omits `__tests__/` (implementation detail) and shows only the four main layers plus `main.ts`.

The tree to write in the README:

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

---

## Exact package.json (verified 2026-04-12)

Relevant fields for version accuracy:

```json
{
  "name": "falling-block-puzzle",
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "pixi.js": "^8.0.0",
    "@pixi/filter-bloom": "^5.0.0",
    "@pixi/filter-glow": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

## Exact Changes

### `docs/assets/.gitkeep` (new file, empty)

Create an empty file at this path. This is Git's convention for tracking an empty directory. No content required.

---

### `README.md` (new file, repo root)

Write the file in this exact section order. Line lengths in prose must be ≤ 100 characters. Use two spaces for markdown indentation where needed. Fenced code blocks must use explicit language identifiers.

---

**Block 1: Centered header block**

```markdown
<div align="center">

# Falling Block Puzzle

> A fast, WebGL-powered falling-block puzzle game built with PixiJS v8 and TypeScript.

![screenshot](docs/assets/screenshot.png)

<!-- Replace docs/assets/screenshot.png with an actual game screenshot or animated GIF. -->

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PixiJS](https://img.shields.io/badge/PixiJS-v8-e91e63)](https://pixijs.com/)
[![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)](https://vitejs.dev/)

</div>
```

The blank lines inside the `<div>` are required. GitHub's renderer needs blank lines between HTML block elements and Markdown content.

---

**Block 2: Overview paragraph**

Write 2–3 sentences. Requirements:
- Must describe it as a "falling-block puzzle game"
- Must mention PixiJS v8 and TypeScript
- Must mention it runs in the browser
- Must NOT use "Tetris"

Example (the developer may rephrase):
> Falling Block Puzzle is a browser-based falling-block puzzle game built with PixiJS v8 for hardware-accelerated WebGL rendering
> and TypeScript for type-safe game logic. It implements the Super Rotation System (SRS), level progression, DAS/ARR keyboard
> input, and post-processing visual effects — all running at 60 Hz in a fixed-timestep game loop.

---

**Block 3: Tech Stack table**

```markdown
## Tech Stack

| Technology | Version | Role |
|---|---|---|
| [PixiJS](https://pixijs.com/) | v8 | WebGL 2D rendering engine |
| [Vite](https://vitejs.dev/) | 5 | Dev server and bundler |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type-safe game logic |
| [Vitest](https://vitest.dev/) | 1 | Unit testing framework |
```

---

**Block 4: Getting Started**

```markdown
## Getting Started

### Prerequisites

- Node.js 18 or later
- npm (bundled with Node.js)

### Installation

```bash
git clone https://github.com/<your-org>/falling-block-puzzle.git
cd falling-block-puzzle
npm install
npm run dev
```

`npm run dev` starts the Vite development server at `http://localhost:5173`.

### Testing

```bash
npm run test
```

Run `npm run test:coverage` to generate a coverage report in `coverage/`.

### Production Build

```bash
npm run build
```

Output is written to `dist/`.
```

Note for the developer: the triple-backtick fence inside this context bundle's own markdown fencing is shown with backtick pairs for illustration. Write the actual README with standard triple-backtick fences.

---

**Block 5: Features**

```markdown
## Features

- **Super Rotation System (SRS)** — full wall-kick tables for all 7 tetrominoes
- **All 7 standard tetrominoes** — I, O, T, S, Z, J, L pieces with correct spawn orientations
- **Level progression** — gravity accelerates as lines are cleared, increasing difficulty
- **Touch controls** — virtual on-screen buttons for mobile and tablet play
- **WebGL rendering** — hardware-accelerated graphics powered by PixiJS v8
- **Visual effects** — glow and bloom post-processing filters on pieces and the board
- **DAS/ARR keyboard input** — precise hold-to-repeat timing (133 ms DAS, 50 ms ARR) for competitive play
- **Animated splash screen** — polished entry experience on first load
- **Pause overlay** — blurred background with keyboard-navigable menu
```

---

**Block 6: Project Structure**

````markdown
## Project Structure

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
````

The `engine/` layer is strictly isolated: it has no imports from `renderer/`, `input/`, or `ui/`. This is enforced by ESLint.

---

**Block 7: Contributing**

```markdown
## Contributing

Contributions are welcome! Here is how to get involved.

### Reporting Issues

Open a [GitHub Issue](../../issues) and include:
- Steps to reproduce the problem
- Expected vs. actual behavior
- Your browser and operating system

### Submitting Pull Requests

1. Fork the repository and create a feature branch from `main`.
2. Make your changes with descriptive commit messages
   (follow [Conventional Commits](https://www.conventionalcommits.org/) style).
3. Ensure `npm run test` and `npm run build` both pass locally.
4. Open a pull request against `main` with a clear description of what and why.

**Architectural note:** The `engine/` layer has zero imports from `renderer/`, `input/`, or `ui/`.
This boundary is enforced by ESLint (`no-restricted-imports`). Please do not introduce cross-layer
imports in that direction.
```

---

**Block 8: License**

```markdown
## License

Distributed under the [MIT License](LICENSE). See `LICENSE` for details.
```

---

## Task Dependencies

```
Task 1.1 (docs/assets/.gitkeep) ──→ Task 1.2 (README.md)
```

Both tasks are simple enough to complete in a single commit.

---

## Risk Assessment

### Risk 1: "Tetris" appears in the README
**Likelihood:** Low (easy to avoid intentionally)
**Impact:** Trademark exposure; content violation
**Mitigation:** After writing, run `grep -i tetris README.md`. Must return no output.

### Risk 2: Version numbers drift from `package.json`
**Likelihood:** Low
**Impact:** Inaccurate documentation that misleads contributors
**Mitigation:** Cross-reference `package.json` during authoring. The exact versions are provided in this bundle.

### Risk 3: Project Structure tree becomes stale after future source changes
**Likelihood:** Medium (new files will be added to `src/` over time)
**Impact:** Misleading documentation
**Mitigation:** This is an acceptable risk for a static README. The tree is accurate as of 2026-04-12. Future changes to `src/` should update the README as part of their scope.

### Risk 4: Broken image on GitHub due to missing `docs/assets/screenshot.png`
**Likelihood:** High (the file does not exist yet)
**Impact:** A broken image icon appears instead of a screenshot on GitHub
**Mitigation:** The `<img>` tag has meaningful alt text ("screenshot"). GitHub renders alt text when an image is missing. The HTML comment in the README instructs contributors on how to replace the placeholder. This is acceptable for a first-pass README — a real screenshot can be added in a follow-up.

### Risk 5: `LICENSE` file does not exist
**Likelihood:** High (confirmed: no `LICENSE` file in the repo)
**Impact:** The "MIT License" link in the License section will be a 404 on GitHub
**Mitigation:** The license line should still reference `LICENSE` — this makes the intent clear and the link will resolve once the file is added. Adding `LICENSE` is a dependency of this change but is out of scope. The developer should note this as a follow-up action in the PR description.

---

## Verification Checklist

Before committing, verify all of the following:

- [ ] `grep -i tetris README.md` returns no matches
- [ ] `grep -c 'img.shields.io' README.md` returns `4` (four badges)
- [ ] The project structure tree matches `find src -type f | sort` (excluding `__tests__/`)
- [ ] All four fenced code blocks use `bash` or `text` language identifiers
- [ ] `docs/assets/.gitkeep` exists and is tracked by git
- [ ] `README.md` is at the repo root (not inside a subdirectory)
- [ ] File ends with exactly one trailing newline (`xxd README.md | tail -1` ends in `0a`)
