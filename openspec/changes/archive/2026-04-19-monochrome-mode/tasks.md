# Tasks: monochrome-mode

## Task 1: [core] Export `GameMode` type from `src/engine/types.ts` ✅ DONE

**Files:**
- Modify: `/Users/javi/repos/tetris/src/engine/types.ts`

**Steps:**

Add the following export after the `GameEventType` definition (before the `GameEvent` interface):

```typescript
/** Rendering mode selected by the player at the main menu. */
export type GameMode = 'classic' | 'monochrome'
```

No other changes in this file.

**Acceptance check:**
- `npm run build` passes — TypeScript resolves the new export.
- `npm run lint` passes.
- All other layers can `import type { GameMode } from '../engine/types.js'` without circular imports (types.ts has no imports itself — this is safe by construction).

---

## Task 2: [core] Add `gameMode` field to `GameState` and extend `createGameState()` ✅ DONE

**Files:**
- Modify: `/Users/javi/repos/tetris/src/engine/gameState.ts`

**Steps:**

1. Add import for the new type at the top of the imports block:
   ```typescript
   import type { PieceType, Rotation, GameEvent, GameMode } from './types.js'
   ```
   (The existing import line is `import type { PieceType, Rotation, GameEvent } from './types.js'` — extend it.)

2. Add `gameMode` field to the `GameState` interface after `chainTimer`:
   ```typescript
   /** Rendering mode selected at game start. 'classic' renders Guideline colors; 'monochrome' renders grayscale. */
   gameMode: GameMode
   ```

3. Extend `createGameState()` to accept an optional mode parameter:
   ```typescript
   export function createGameState(mode: GameMode = 'classic'): GameState {
   ```

4. Add `gameMode: mode` to the returned state object literal inside `createGameState()`. Place it as the last field, after `chainTimer: 0`:
   ```typescript
   gameMode: mode,
   ```

5. No changes to `updateGameState()`. The existing spread pattern (`{ ...state, ... }`) in all return paths automatically preserves the new `gameMode` field.

**Acceptance check:**
- `npm test` passes — all existing engine tests continue to work because `createGameState()` defaults to `'classic'` and tests use spread from `createGameState()` output, never constructing `GameState` literals from scratch.
- `createGameState()` returns `state.gameMode === 'classic'`.
- `createGameState('monochrome')` returns `state.gameMode === 'monochrome'`.
- After calling `updateGameState(state, actions, dt)` multiple times, `result.state.gameMode` equals the value set at creation.

---

## Task 3: [core] Add `gameMode` tests to `gameState.test.ts` ✅ DONE

**Files:**
- Modify: `/Users/javi/repos/tetris/src/__tests__/engine/gameState.test.ts`

**Steps:**

Add a new `describe` block at the end of the file (after the existing `describe` blocks):

```typescript
describe('createGameState — gameMode field', () => {
  it('defaults to "classic" when no argument is passed', () => {
    const state = createGameState()
    expect(state.gameMode).toBe('classic')
  })

  it('stores "monochrome" when passed as argument', () => {
    const state = createGameState('monochrome')
    expect(state.gameMode).toBe('monochrome')
  })

  it('preserves gameMode through updateGameState ticks', () => {
    const s = createGameState('monochrome')
    const { state: playing } = updateGameState(s, [GameAction.Start], 0)
    const { state: after } = updateGameState(playing, [], 16)
    expect(after.gameMode).toBe('monochrome')
  })

  it('preserves gameMode through pause/resume cycle', () => {
    let s = createGameState('monochrome')
    const { state: playing } = updateGameState(s, [GameAction.Start], 0)
    const { state: paused } = updateGameState(playing, [GameAction.Pause], 16)
    const { state: resumed } = updateGameState(paused, [GameAction.Pause], 16)
    expect(resumed.gameMode).toBe('monochrome')
  })
})
```

**Acceptance check:**
- `npx vitest run src/__tests__/engine/gameState.test.ts` passes with all 4 new tests green.

---

## Task 4: [renderer] Add monochrome color resolution to `boardRenderer.ts` ✅ DONE

**Files:**
- Modify: `/Users/javi/repos/tetris/src/renderer/boardRenderer.ts`

**Steps:**

1. Add import for `GameMode` at the top of the imports block, alongside the existing engine import:
   ```typescript
   import type { GameMode } from '../engine/types.js'
   ```

2. Add three monochrome constants after the `CELL_COLORS` export declaration and before `EMPTY_CELL_COLOR`:
   ```typescript
   /** Locked-cell color in monochrome mode. */
   const MONO_LOCKED_COLOR = 0x888888
   ```

3. Add a private helper function before the `BoardRenderer` class definition:
   ```typescript
   /**
    * Resolve the fill color for a locked board cell.
    * In monochrome mode all color indices map to MONO_LOCKED_COLOR.
    */
   function resolveCellColor(colorIndex: number, gameMode: GameMode): number {
     if (gameMode === 'monochrome') return MONO_LOCKED_COLOR
     return CELL_COLORS[colorIndex] ?? 0xffffff
   }
   ```

4. In the `update()` method, find the existing color resolution line inside the cell draw loop:
   ```typescript
   const color = CELL_COLORS[value] ?? 0xffffff
   ```
   Replace it with:
   ```typescript
   const color = resolveCellColor(value, state.gameMode)
   ```

5. Do NOT modify `updateChargedOverlays()` — the charged-cell overlay always uses `0xffffff` regardless of game mode. This is correct behavior per the spec.

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- In Classic mode: locked cells render using their Guideline piece colors (unchanged).
- In Monochrome mode: all locked cells render as `0x888888` regardless of piece type.
- Chain Blast charged-cell overlays remain `0xffffff` pulsing white in both modes.

---

## Task 5: [renderer] Add monochrome color resolution to `pieceRenderer.ts` ✅ DONE

**Files:**
- Modify: `/Users/javi/repos/tetris/src/renderer/pieceRenderer.ts`

**Steps:**

1. Add import for `GameMode` at the top of the imports block:
   ```typescript
   import type { GameMode } from '../engine/types.js'
   ```

2. Add two monochrome constants after the `GHOST_ALPHA` constant:
   ```typescript
   /** Active piece color in monochrome mode. */
   const MONO_ACTIVE_COLOR = 0xeeeeee
   /** Ghost piece color in monochrome mode. */
   const MONO_GHOST_COLOR = 0x555555
   ```

3. Add two private helper functions before the `PieceRenderer` class definition:
   ```typescript
   /**
    * Resolve the active piece fill color.
    * In monochrome mode all piece types render as MONO_ACTIVE_COLOR.
    */
   function resolveActiveColor(colorIndex: number, gameMode: GameMode): number {
     if (gameMode === 'monochrome') return MONO_ACTIVE_COLOR
     return CELL_COLORS[colorIndex] ?? 0xffffff
   }

   /**
    * Resolve the ghost piece fill color.
    * In monochrome mode the ghost uses MONO_GHOST_COLOR (distinct from active).
    * In classic mode the ghost inherits the active piece color.
    */
   function resolveGhostColor(gameMode: GameMode, classicColor: number): number {
     return gameMode === 'monochrome' ? MONO_GHOST_COLOR : classicColor
   }
   ```

4. In the `update()` method, find the existing color resolution block:
   ```typescript
   const colorIndex = PIECE_COLORS[piece.type]
   const color = CELL_COLORS[colorIndex] ?? 0xffffff
   ```
   Replace it with:
   ```typescript
   const colorIndex = PIECE_COLORS[piece.type]
   const color = resolveActiveColor(colorIndex, state.gameMode)
   const ghostColor = resolveGhostColor(state.gameMode, color)
   ```

5. In the ghost draw loop (the `for (let i = 0; i < 4; i++)` block that draws ghost cells), find the fill call:
   ```typescript
   g.fill({ color, alpha: 1 })
   ```
   Replace it with:
   ```typescript
   g.fill({ color: ghostColor, alpha: 1 })
   ```
   The `g.alpha = GHOST_ALPHA` is set in the constructor on the ghost `Graphics` objects — it applies in both modes and does not change.

6. The active piece draw loop (`pieceCells`) already uses `color` — it now receives the monochrome value when appropriate. No changes needed there.

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- In Classic mode: active pieces render in their Guideline colors; ghost renders in matching piece color at 0.3 alpha (unchanged).
- In Monochrome mode:
  - Active piece renders as `0xeeeeee`.
  - Ghost piece renders as `0x555555` at alpha `0.3`.
  - Ghost is visually distinct from both active (`0xeeeeee`) and locked (`0x888888`).

---

## Task 6: [ui] Add MONOCHROME button and `flushMode()` to `MainMenu` ✅ DONE

**Files:**
- Modify: `/Users/javi/repos/tetris/src/ui/mainMenu.ts`

**Steps:**

1. Add import for `GameMode` at the top of the imports block:
   ```typescript
   import type { GameMode } from '../engine/types.js'
   ```

2. Add a private field for the monochrome button and the mode buffer to the class:
   ```typescript
   private monochromeButton: Container
   private menuModeBuffer: GameMode[] = []
   ```

3. In the `constructor`, after the PLAY button setup and before the EXIT button setup, build the MONOCHROME button. Follow the exact same pattern as PLAY and EXIT:
   ```typescript
   // Monochrome button — pushes Start + records 'monochrome' mode
   this.monochromeButton = this.buildButton('MONOCHROME')
   this.monochromeButton.on('pointerup', () => {
     this.menuActionBuffer.push(GameAction.Start)
     this.menuModeBuffer.push('monochrome')
   })
   this.container.addChild(this.monochromeButton)
   ```

   Note: The PLAY button does NOT push to `menuModeBuffer` — Classic is the default.

4. Add the `flushMode()` public method after `flushActions()`:
   ```typescript
   /**
    * Drain and return the queued game mode selection, or null if none is pending.
    * Returns null when the player clicked PLAY (Classic is the default).
    * Returns 'monochrome' when the player clicked MONOCHROME.
    */
   flushMode(): GameMode | null {
     const mode = this.menuModeBuffer.shift()
     return mode ?? null
   }
   ```

5. In the `resize()` method, update button positions. Currently:
   - `playButton`: `height * 0.56`
   - `exitButton`: `height * 0.56 + 70`
   - `fallbackText`: `height * 0.56 + 150`

   After this change:
   - `playButton`: `height * 0.56`
   - `monochromeButton`: `height * 0.56 + 70`
   - `exitButton`: `height * 0.56 + 140`
   - `fallbackText`: `height * 0.56 + 220`

   Find and update the two `resizeButton` calls and the `fallbackText` Y position:
   ```typescript
   resizeButton(this.playButton, width / 2, height * 0.56)
   resizeButton(this.monochromeButton, width / 2, height * 0.56 + 70)
   resizeButton(this.exitButton, width / 2, height * 0.56 + 140)

   this.fallbackText.x = width / 2
   this.fallbackText.y = height * 0.56 + 220
   ```

6. The `destroy()` method uses `this.container.destroy({ children: true })` which recursively destroys all children. Since `monochromeButton` is a child of `this.container`, it is destroyed automatically. No additional teardown needed.

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- The main menu renders with three interactive buttons: PLAY, MONOCHROME, EXIT.
- Clicking PLAY: `flushActions()` returns `[GameAction.Start]`, `flushMode()` returns `null`.
- Clicking MONOCHROME: `flushActions()` returns `[GameAction.Start]`, `flushMode()` returns `'monochrome'`.
- After flush, both buffers are empty.

---

## Task 7: [ui] Update `mainMenu.test.ts` for the new MONOCHROME button and `flushMode()` ✅ DONE

**Files:**
- Modify: `/Users/javi/repos/tetris/src/__tests__/ui/mainMenu.test.ts`

**Steps:**

Read the existing test file to understand the mock structure and existing test patterns before editing. The `vi.mock('pixi.js', ...)` factory at the top is the reference for how `MockContainer`, `MockGraphics`, and `MockText` are wired.

1. Add tests in a new `describe` block for the MONOCHROME button:

```typescript
describe('MONOCHROME button', () => {
  it('renders a third button labeled MONOCHROME', () => {
    // The container should have 4 direct children: titleText, playButton,
    // monochromeButton, exitButton, and fallbackText = 5 total at the
    // top level. Verify the container has enough children.
    // Alternatively, count interactive children:
    const interactiveChildren = menu.container.children.filter(
      (c: MockContainer) => c.eventMode === 'static'
    )
    expect(interactiveChildren.length).toBe(3) // play, monochrome, exit
  })

  it('flushMode() returns null before any interaction', () => {
    expect(menu.flushMode()).toBeNull()
  })

  it('clicking MONOCHROME enqueues GameAction.Start in flushActions()', () => {
    // Find the monochrome button and emit pointerup
    const monoBtn = getButtonByLabel(menu, 'MONOCHROME')
    monoBtn.emit('pointerup')
    expect(menu.flushActions()).toContain(GameAction.Start)
  })

  it('clicking MONOCHROME enqueues "monochrome" in flushMode()', () => {
    const monoBtn = getButtonByLabel(menu, 'MONOCHROME')
    monoBtn.emit('pointerup')
    expect(menu.flushMode()).toBe('monochrome')
  })

  it('clicking PLAY leaves flushMode() returning null', () => {
    const playBtn = getButtonByLabel(menu, 'PLAY')
    playBtn.emit('pointerup')
    expect(menu.flushMode()).toBeNull()
  })

  it('flushMode() returns null after draining', () => {
    const monoBtn = getButtonByLabel(menu, 'MONOCHROME')
    monoBtn.emit('pointerup')
    menu.flushMode() // drain
    expect(menu.flushMode()).toBeNull()
  })
})
```

Note: You will need to check whether a `getButtonByLabel` helper already exists in the test file. If not, add a local helper:

```typescript
function getButtonByLabel(menu: MainMenu, label: string): MockContainer {
  // Interactive buttons are MockContainers with eventMode === 'static'
  // and a MockText child whose text matches the label.
  const interactive = menu.container.children.filter(
    (c: MockContainer) => c.eventMode === 'static'
  )
  for (const btn of interactive) {
    const textChild = btn.children.find(
      (c: MockContainer) => (c as MockText).text === label
    )
    if (textChild) return btn
  }
  throw new Error(`Button with label "${label}" not found`)
}
```

(The exact mock type access pattern depends on the existing mock implementation — adapt as needed to match how the existing `mainMenu.test.ts` accesses button children and emits events.)

**Acceptance check:**
- `npx vitest run src/__tests__/ui/mainMenu.test.ts` passes with all new tests green.
- Existing tests in the file remain green.

---

## Task 8: [main] Wire mode selection into the game loop in `main.ts` ✅ DONE

**Files:**
- Modify: `/Users/javi/repos/tetris/src/main.ts`

**Steps:**

1. Add import for `GameMode` type at the top of the engine imports section:
   ```typescript
   import type { GameMode } from './engine/types.js'
   ```

2. Add a loop-level variable for the pending mode after the existing loop-level variables (near `let prevPhase = state.phase`):
   ```typescript
   /** Mode selected from the main menu; applied to createGameState() when the Start action arrives. */
   let pendingMode: GameMode = 'classic'
   ```

3. In the fixed-timestep loop, inside `while (accumulator >= LOGIC_TICK_MS)`, add mode capture immediately after the action collection block (after `const bufferedActions = [...]`):
   ```typescript
   // Capture mode selection from main menu (null if player clicked PLAY or no click yet)
   const selectedMode = mainMenu?.flushMode() ?? null
   if (selectedMode !== null) {
     pendingMode = selectedMode
   }
   ```

4. Still inside the loop, after mode capture but before `updateGameState()`, add the mode-aware state reinitialization:
   ```typescript
   // If a Start action arrived while in intro, reinitialize state with the chosen mode
   // so that state.gameMode is set before the engine transitions intro → playing.
   if (state.phase === 'intro' && bufferedActions.includes(GameAction.Start)) {
     state = createGameState(pendingMode)
     pendingMode = 'classic' // reset for next game (mode is not persisted)
   }
   ```

5. No changes needed to `navigateToTitle()` — it already calls `createGameState()` with no argument (defaults to `'classic'`). Add a comment to make this explicit:
   ```typescript
   // createGameState() defaults to 'classic'; mode choice is not persisted across sessions.
   state = createGameState()
   ```

6. No changes needed to `restartGame()` — same reasoning as above.

**Acceptance check:**
- `npm run build` passes.
- `npm run lint` passes.
- Starting a game via PLAY results in `state.gameMode === 'classic'`.
- Starting a game via MONOCHROME results in `state.gameMode === 'monochrome'`.
- Completing a game in Monochrome and navigating to title resets to Classic.
- Restarting via pause menu resets to Classic.

---

## Task 9: [core] Final verification — full test suite, build, and lint ✅ DONE

**Files:**
- No file changes — verification pass only.

**Steps:**

Run each command in order and confirm all pass:

```bash
npm run lint
npm run build
npm test
```

If coverage is checked:
```bash
npm run test:coverage
```

The coverage threshold is 80% branch coverage for `src/engine/**`. The `gameMode` field is a passive string — its presence does not reduce coverage as long as the new `gameState.test.ts` tests (Task 3) exercise both `'classic'` and `'monochrome'` paths through `createGameState()`.

**Acceptance check:**
- `npm run lint` exits 0 (no ESLint errors in `src/`).
- `npm run build` exits 0 (TypeScript compiles cleanly; Vite bundle succeeds).
- `npm test` exits 0 (all test suites pass, including the 4 new engine tests and the new mainMenu tests).
- No regressions in Chain Blast, scoring, gravity, rotation, or pause behavior.
