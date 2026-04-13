/**
 * AudioManager — wraps Howler.js to provide BGM and SFX for the game.
 *
 * Wired exclusively through main.ts (the only file that crosses layer
 * boundaries). This module must not import from renderer/, input/, or ui/.
 * The only engine import allowed is engine/types.ts.
 *
 * Graceful degradation: every play() call is wrapped in try/catch.
 * Missing/empty audio files (placeholder state) trigger onloaderror
 * warnings but do not throw — the game runs silently.
 */

import { Howl, Howler } from 'howler'
import type { GameEvent, GameAction } from '../engine/types.js'
import { GameAction as GA } from '../engine/types.js'

// Internal sound identifiers — not exported (implementation detail).
// const enum values are inlined at compile time; the string literals
// below are what actually appear in the compiled output and Map keys.
const enum SoundId {
  BGM        = 'bgm',
  Move       = 'move',
  Rotate     = 'rotate',
  SoftDrop   = 'softDrop',
  HardDrop   = 'hardDrop',
  PieceLock  = 'pieceLock',
  LineClear1 = 'lineClear1',
  LineClear2 = 'lineClear2',
  LineClear3 = 'lineClear3',
  LineClear4 = 'lineClear4',
  LevelUp    = 'levelUp',
  GameOver   = 'gameOver',
}

export class AudioManager {
  private readonly sounds: Map<string, Howl> = new Map()
  private _muted = false
  /** Howler instance ID for the active BGM playback; null when BGM is stopped. */
  private bgmSoundId: number | null = null
  /**
   * Per-tick flag set when HardDrop action is processed.
   * Consumed and cleared at the start of onEvents to suppress the
   * subsequent piece-lock SFX (avoiding a double lock sound on hard-drop).
   */
  private _hardDropThisTick = false

  constructor() {
    // BGM — looping, half-volume
    this.sounds.set(SoundId.BGM, new Howl({
      src: ['/audio/bgm.ogg', '/audio/bgm.mp3'],
      loop: true,
      volume: 0.5,
      preload: true,
      onloaderror: (_id: number, err: unknown) => console.warn('AudioManager: failed to load bgm', err),
    }))

    // SFX — one-shot, full volume
    const sfxDefs: Array<[SoundId, string]> = [
      [SoundId.Move,       'move'],
      [SoundId.Rotate,     'rotate'],
      [SoundId.SoftDrop,   'soft-drop'],
      [SoundId.HardDrop,   'hard-drop'],
      [SoundId.PieceLock,  'piece-lock'],
      [SoundId.LineClear1, 'line-clear-1'],
      [SoundId.LineClear2, 'line-clear-2'],
      [SoundId.LineClear3, 'line-clear-3'],
      [SoundId.LineClear4, 'line-clear-4'],
      [SoundId.LevelUp,    'level-up'],
      [SoundId.GameOver,   'game-over'],
    ]

    for (const [soundId, fileName] of sfxDefs) {
      const name = fileName
      this.sounds.set(soundId, new Howl({
        src: [`/audio/${name}.ogg`, `/audio/${name}.mp3`],
        loop: false,
        volume: 1.0,
        preload: true,
        onloaderror: (_id: number, err: unknown) => console.warn(`AudioManager: failed to load ${name}`, err),
      }))
    }
  }

  /**
   * Called once per action in the deduplicated action list, BEFORE updateGameState.
   * Triggers SFX for player-intent actions that do not produce engine events.
   */
  onAction(action: GameAction): void {
    // Defense in depth: Howler.mute() already silences, but skipping
    // play() avoids unnecessary audio decoding work while muted.
    if (this._muted) return

    switch (action) {
      case GA.MoveLeft:
      case GA.MoveRight:
        this.playSound(SoundId.Move)
        break
      case GA.RotateCW:
      case GA.RotateCCW:
        this.playSound(SoundId.Rotate)
        break
      case GA.SoftDrop:
        this.playSound(SoundId.SoftDrop)
        break
      case GA.HardDrop:
        this._hardDropThisTick = true
        this.playSound(SoundId.HardDrop)
        break
      default:
        // Start, Pause — no SFX
        break
    }
  }

  /**
   * Called once per logic tick with events returned by updateGameState,
   * AFTER the engine tick.
   *
   * Clears _hardDropThisTick at entry to gate the piece-lock suppression
   * to exactly the tick where the hard-drop action was processed.
   */
  onEvents(events: GameEvent[]): void {
    // Consume and clear the flag atomically at the start of event processing.
    const hadHardDrop = this._hardDropThisTick
    this._hardDropThisTick = false

    for (const event of events) {
      switch (event.type) {
        case 'piece-lock':
          // Suppress lock SFX when this tick also processed a HardDrop —
          // the hard-drop sound already communicates the piece placement.
          if (!hadHardDrop) {
            this.playSound(SoundId.PieceLock)
          }
          break

        case 'line-clear': {
          const payload = event.payload as { count: number }
          const count = payload.count
          if (count === 1) {
            this.playSound(SoundId.LineClear1)
          } else if (count === 2) {
            this.playSound(SoundId.LineClear2)
          } else if (count === 3) {
            this.playSound(SoundId.LineClear3)
          } else {
            // count >= 4 (Tetris)
            this.playSound(SoundId.LineClear4)
          }
          break
        }

        case 'level-up':
          this.playSound(SoundId.LevelUp)
          break

        case 'game-over':
          this.playSound(SoundId.GameOver)
          // Stop BGM — game-over state has no meaningful resume point
          this.stopBgm()
          break

        default:
          break
      }
    }
  }

  /**
   * Called on every phase transition edge from main.ts.
   *
   * BGM lifecycle:
   * - 'playing'  → start (if bgmSoundId is null) or resume (if bgmSoundId is set)
   * - 'paused'   → pause (preserves playback position for resume)
   * - 'gameover' → stop (position reset; game-over SFX plays via onEvents)
   * - 'intro'    → stop (player navigated to title; start fresh next time)
   */
  onPhaseChange(phase: string): void {
    const bgm = this.sounds.get(SoundId.BGM)
    if (!bgm) return

    switch (phase) {
      case 'playing':
        if (this.bgmSoundId === null) {
          // Fresh start — play returns a new instance ID
          try {
            this.bgmSoundId = bgm.play() as number
          } catch (err) {
            console.warn('AudioManager: BGM play() failed', err)
          }
        } else {
          // Resume paused instance — must pass the existing ID so Howler
          // resumes the correct playback position rather than spawning a
          // second concurrent instance.
          try {
            bgm.play(this.bgmSoundId)
          } catch (err) {
            console.warn('AudioManager: BGM resume failed', err)
          }
        }
        break

      case 'paused':
        try {
          bgm.pause(this.bgmSoundId ?? undefined)
        } catch (err) {
          console.warn('AudioManager: BGM pause() failed', err)
        }
        break

      case 'gameover':
      case 'intro':
        this.stopBgm()
        break

      default:
        break
    }
  }

  /**
   * Globally mute or unmute all audio via Howler's AudioContext gain node.
   * Silences instantly without affecting playback position.
   */
  mute(on: boolean): void {
    Howler.mute(on)
    this._muted = on
  }

  /** Returns the current mute state. */
  isMuted(): boolean {
    return this._muted
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Play a sound by its SoundId, catching any Howler errors. */
  private playSound(id: SoundId): void {
    const howl = this.sounds.get(id)
    if (!howl) return
    try {
      howl.play()
    } catch (err) {
      console.warn(`AudioManager: play() failed for ${id}`, err)
    }
  }

  /** Stop BGM and reset the instance ID tracker. */
  private stopBgm(): void {
    const bgm = this.sounds.get(SoundId.BGM)
    if (!bgm) return
    try {
      bgm.stop(this.bgmSoundId ?? undefined)
    } catch (err) {
      console.warn('AudioManager: BGM stop() failed', err)
    }
    this.bgmSoundId = null
  }
}
