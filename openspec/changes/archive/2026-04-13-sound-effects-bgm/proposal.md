# Proposal: Add Sound Effects and Background Music

**Change name:** sound-effects-bgm
**Ticket:** #8 — Add Sound Effects and Background Music
**Estimated complexity:** Medium (1–2 days)
**Date:** 2026-04-13

---

## Summary

The game currently has no audio. This change introduces a dedicated `src/audio/` layer containing an `AudioManager` class that plays sound effects for every meaningful game event and loops background music during gameplay. Howler.js (MIT-licensed) is used as the Web Audio API abstraction to handle format fallback (.ogg / .mp3), autoplay policy compliance, and cross-browser inconsistencies. A mute toggle button is added to the HUD. All audio degrades gracefully when the browser blocks autoplay or when audio files are missing.

## Problem

The falling-block puzzle game is fully silent. Line clears, level-ups, piece locks, and hard drops have no audio feedback, which reduces the sense of responsiveness and game-feel. There is no background music to establish atmosphere. Players have no way to mute audio without leaving the browser tab.

## Proposed Solution

Add a new `src/audio/` layer with a single `AudioManager` class. The manager:

1. Subscribes to `GameEvent[]` objects emitted by the engine each tick (already available at `result.events` in `main.ts`).
2. Plays a distinct SFX for each recognized event: `piece-lock`, `line-clear` (variants for 1/2/3/4 lines), `level-up`, and `game-over`.
3. Plays additional SFX for player actions detected at the `main.ts` integration point: move left/right, rotate, soft drop, hard drop.
4. Starts looping background music on `intro → playing` transition, pauses it on `playing → paused`, resumes it on `paused → playing`, and stops it on `gameover`.
5. Exposes a `mute(on: boolean)` method wired to a new mute button in the HUD.

Audio context initialization is deferred until the first user gesture (the splash screen's Enter key or tap), satisfying browser autoplay policy. All audio is preloaded at construction time using Howler's sprite or standard preload API.

Audio files are `.ogg` (primary) with `.mp3` fallback, placed in `public/audio/`. Because actual audio assets cannot be downloaded as part of this design phase, placeholder empty files are created and the `context-bundle.md` documents the real asset sources.

## Scope

### In scope

- `src/audio/audioManager.ts` — new layer; `AudioManager` class
- `src/ui/hud.ts` — add mute toggle button
- `src/main.ts` — wire `audioManager.onEvents()`, `audioManager.onPhaseChange()`, `audioManager.onAction()`, and mute button callback
- `.eslintrc.cjs` — add `no-restricted-imports` rule for `audio/` layer (may not import from `engine/`, `renderer/`, `input/`)
- `public/audio/` — placeholder audio asset files
- `package.json` / `package-lock.json` — `howler` and `@types/howler` dependencies

### Out of scope

- Volume slider or per-channel volume controls (future settings screen)
- Audio visualizer or waveform display
- Mobile-specific vibration feedback
- Streaming music (all files bundled in `public/audio/`)
- User-persistent mute preference (sessionStorage / localStorage)

## Non-goals

This change does not persist mute state across sessions, provide a volume control, or modify engine logic in any way. The `GameEvent` type in `src/engine/types.ts` is not extended — all existing event types (`line-clear`, `piece-lock`, `level-up`, `game-over`) are already sufficient for the desired SFX triggers.

## Acceptance Criteria

1. Background music begins looping automatically when the game starts (intro → playing transition), respecting browser autoplay policy (audio starts after first user gesture).
2. Background music pauses when game enters 'paused' phase and resumes when it exits; music stops on 'game-over'.
3. Distinct sound effect plays for each of: piece move left/right, piece rotate, soft drop, hard drop, single/double/triple/tetris line clear, level up, and game over.
4. Mute/unmute toggle button visible in HUD; clicking silences all audio immediately without stopping playback position.
5. All audio files present in `public/audio/` and load without 404 errors.
6. No audio plays while game is in 'paused' or 'intro' phase.
7. AudioManager does NOT import from `src/engine/`, `src/renderer/`, or `src/input/` — only from `src/engine/types.ts`.
8. `npm run build` completes without errors.
9. All pre-existing unit tests pass.
10. Game runs correctly with audio disabled (browser autoplay blocked) — degrades gracefully.
