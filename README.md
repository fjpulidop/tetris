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

A browser-based falling-block puzzle game built with PixiJS v8 and TypeScript. The game runs entirely in the browser using WebGL for smooth, hardware-accelerated rendering. All game logic is decoupled from the renderer, making it straightforward to test and extend.

## Tech Stack

| Technology | Version | Role |
|---|---|---|
| [PixiJS](https://pixijs.com/) | v8 | WebGL 2D rendering engine |
| [Vite](https://vitejs.dev/) | 5 | Dev server and bundler |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type-safe game logic |
| [Vitest](https://vitest.dev/) | 1 | Unit testing framework |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/<your-org>/falling-block-puzzle.git
cd falling-block-puzzle
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

### Testing

```bash
npm run test
```

Run with coverage reporting:

```bash
npm run test:coverage
```

### Production Build

```bash
npm run build
```

Output is written to `dist/`.

## Features

- Super Rotation System (SRS) with wall-kick tables
- All 7 standard tetrominoes (I, O, T, S, Z, J, L)
- Level progression — gravity accelerates as lines are cleared
- Touch controls — virtual on-screen buttons for mobile play
- WebGL rendering powered by PixiJS v8
- Glow and bloom visual effects via post-processing filters
- DAS/ARR keyboard input — precise hold-to-repeat timing for competitive play
- Animated splash screen on load
- Pause overlay with blurred background and keyboard navigation

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

The `engine/` layer is strictly isolated — it has no imports from `renderer/`, `input/`, or `ui/`.

## Contributing

Contributions are welcome. Whether you are fixing a bug, improving performance, or adding a new feature, please open an issue or pull request.

### Reporting Issues

Open a [GitHub Issue](../../issues) and include:

- Steps to reproduce the problem
- Expected behaviour vs. actual behaviour
- Browser and operating system

### Submitting Pull Requests

1. Fork the repository and create a branch for your change.
2. Make your changes with clear, focused commits.
3. Run `npm run test` and `npm run build` to confirm nothing is broken.
4. Open a pull request describing what you changed and why.

Note: the `engine/` layer boundary (no imports from `renderer/`, `input/`, or `ui/`) is enforced by ESLint. Pull requests that violate this boundary will fail CI.

## License

Distributed under the [MIT License](LICENSE). See `LICENSE` for details.
