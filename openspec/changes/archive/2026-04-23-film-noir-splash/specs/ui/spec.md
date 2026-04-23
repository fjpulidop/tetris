# Spec: `ui` Capability

> **Status:** Skeleton — created for the `film-noir-splash` change (#40).
> This spec documents the `src/ui/` layer's public surface as it exists
> and as it is extended by the noir makeover.

---

## 1. Layer Contract

`src/ui/` modules render overlays on top of the PixiJS stage. They:
- Import from `pixi.js`, `@pixi/filter-*`, and `../engine/types.js` /
  `../engine/scenarios.js` (read-only config; no PixiJS in those engine files).
- MUST NOT import from `../renderer/`, `../input/`, or any other `../engine/` file.
- Receive a `Container` (stage or sub-container) and a PixiJS `Application`
  reference in their constructors.
- Follow a consistent three-method lifecycle: `constructor`, `resize(w, h)`,
  `destroy()`.

---

## 2. `MainMenu` (primary intro screen)

**File:** `src/ui/mainMenu.ts`

### 2.1 Constructor

```typescript
constructor(stage: Container, app: Application)
```

Adds a `Container` to `stage`. Registers a ticker callback. Calls `resize()` once
at the end of construction.

After the `film-noir-splash` change, the constructor also:
- Creates a full-screen background `Graphics` rectangle (`COLOR_BG = 0x000000`).
- Creates a radial-gradient vignette `Graphics` object.
- Creates a noise/grain `Graphics` object with `NoiseFilter` applied (WebGL only;
  fails silently on Canvas 2D).
- Creates a `dustContainer` holding `DUST_PARTICLE_COUNT = 60` pre-allocated
  `Graphics` dust particles.
- Creates a hint prompt `Text` node with typewriter/blink animation state.

### 2.2 Destructor

```typescript
destroy(): void
```

Removes the ticker callback, cancels any pending timers, and calls
`this.container.destroy({ children: true })`.

### 2.3 Resize

```typescript
resize(width: number, height: number): void
```

Repositions and redraws all child elements. Redraws the background rectangle and
vignette to the new `(width, height)` bounds.

### 2.4 Action Drain API (unchanged)

```typescript
flushActions(): GameAction[]
flushMode(): GameMode | null
flushScenario(): string | null
```

Called by `main.ts` each logic tick. Returns buffered values and empties the
buffers. No behavior change from this feature.

### 2.5 Exit / Sprint Callbacks (unchanged)

```typescript
onExit: () => void
onSprintStart: () => void
showExitFallback(): void
```

### 2.6 Visual Constants (post film-noir-splash)

| Constant | Value | Role |
|---|---|---|
| `COLOR_BG` | `0x000000` | Full-black background |
| `COLOR_TITLE` | `0xd8d0c0` | Warm silver — title text |
| `COLOR_PROMPT` | `0x8899aa` | Cold blue-grey — prompt / accent |
| `COLOR_BUTTON_BG` | `0x0a0a0a` | Near-black button fill |
| `COLOR_BUTTON_TEXT` | `0xffffff` | White button label |
| `COLOR_SCENARIO_SELECTED_STROKE` | `0x8899aa` | Cold blue-grey (matches `COLOR_PROMPT`) |
| `COLOR_SCENARIO_IDLE_STROKE` | `0x2a2a2a` | Very dark, near-invisible |
| `GRAIN_STRENGTH` | `0.18` | NoiseFilter noise amount |
| `DUST_PARTICLE_COUNT` | `60` | Dust sprite pool size (< 80) |
| `TYPEWRITER_TICKS` | `3` | Frames per character reveal |
| `BLINK_TICKS` | `30` | Frames per cursor blink toggle |
| `FONT_FAMILY` | `'"Playfair Display", Georgia, serif'` | Typography stack |

---

## 3. `SplashScreen` (orphan — not wired from `main.ts`)

**File:** `src/ui/splashScreen.ts`

A standalone animated splash class. It was implemented during the
`animated-splash-screen` change but is not currently instantiated from `main.ts`
(which uses `MainMenu` instead). This class is not touched by `film-noir-splash`.

Public API (for reference):
```typescript
constructor(stage: Container, app: Application)
resize(width: number, height: number): void
destroy(): void
```

---

## 4. `HUD`

**File:** `src/ui/hud.ts`

Not touched by `film-noir-splash`. Documents for spec completeness:
```typescript
setVisible(visible: boolean): void
setOnMuteToggle(cb: (muted: boolean) => void): void
setMuted(muted: boolean): void
update(state: GameState): void
resize(cellSize: number, offsetX: number): void
```

---

## 5. `PauseModal`

**File:** `src/ui/pauseModal.ts`

Not touched by `film-noir-splash`.
```typescript
show(selectedIndex: number): void
hide(): void
setSelection(index: number): void
resize(width: number, height: number): void
onSelect: (index: number) => void
```

---

## 6. `GameOverOverlay`

**File:** `src/ui/gameOverOverlay.ts`

Not touched by `film-noir-splash`.
```typescript
show(score: number, lines: number): void
hide(): void
resize(width: number, height: number): void
onReturnToMenu: () => void
```
