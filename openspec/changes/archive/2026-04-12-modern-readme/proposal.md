# Proposal: Add Modern Open-Source README with Badges, Demo, and Contributing Guide

**Change name:** modern-readme
**Ticket:** #5 — Add Modern Open-Source README with Badges, Demo, and Contributing Guide
**Estimated complexity:** Trivial (one focused session, ~30–60 minutes)
**Date:** 2026-04-12

---

## Summary

The repository has no `README.md`. Any developer who clones the repo or lands on its GitHub page encounters a blank slate — no description, no setup instructions, no indication of what technology is in use, and no signal of quality. This makes the project essentially invisible and uninviting to contributors or evaluators.

This change adds a single `README.md` at the repo root that gives the project a professional, welcoming face. The document communicates what the game is (a falling-block puzzle game built with PixiJS v8 and TypeScript), how to run it locally (five copy-paste commands), what it contains (SRS engine, visual effects, touch support), how the source is organized, and how to contribute.

## Problem

No `README.md` exists at the repo root. GitHub shows an empty "Add a README" prompt, and any developer who clones the project must read source code to understand what it is, how to build it, or what conventions to follow.

## Proposed Solution

Create `README.md` at the repo root. The document is structured for GitHub's markdown renderer and follows open-source documentation best practices:

- A centered header block (`<div align="center">`) with the project name, a one-line tagline, a screenshot placeholder, and a badge row.
- Static shields.io badges for license, TypeScript, PixiJS, and Vite — no CI integration required.
- A Tech Stack section naming the four core libraries (PixiJS v8, Vite 5, TypeScript 5, Vitest).
- A Getting Started section with five fenced commands (clone, install, dev, test, build).
- A Features section with at least six bullets covering the key differentiators.
- A Project Structure tree reflecting the actual `src/` layout (engine/, renderer/, input/, ui/).
- A Contributing section with PR etiquette.
- A License section (MIT).

## Scope

### In scope

- `README.md` — new file at repo root
- `docs/assets/` — directory created with a `screenshot.png` placeholder (empty PNG or a `.gitkeep` with a note)

### Out of scope

- Creating an actual game screenshot or animated GIF (placeholder text is acceptable)
- Adding a CI workflow (GitHub Actions) — badges can be static
- Adding a `CONTRIBUTING.md` or `CODE_OF_CONDUCT.md` separate file
- Creating a `LICENSE` file (noted as a dependency; a placeholder line in the README acknowledges MIT)

## Non-goals

This change does not add a CI pipeline, a changelog, or any source code changes. All content is documentation only.

## Acceptance Criteria

1. `README.md` exists at the repo root and renders correctly on GitHub.
2. The header includes the project name, a one-liner tagline, and a visual element.
3. A badge row is present with at minimum: license, TypeScript, and PixiJS badges.
4. Getting Started section has five copy-paste commands in a fenced code block.
5. Features section lists at least 6 bullets covering: SRS rotation, 7 tetrominoes, level progression, touch controls, WebGL rendering, and visual effects.
6. Project Structure section includes a directory tree of `src/`.
7. Contributing section is present with issue and PR instructions.
8. License section states MIT.
9. The word "Tetris" does not appear anywhere in `README.md`.
10. The README renders without warnings in a standard Markdown linter.
