/**
 * Unit tests for src/engine/persistence.ts
 *
 * Tests formatSprintTime, loadSprintPB, and saveSprintPB.
 * We use vi.stubGlobal to provide a controlled localStorage implementation
 * since jsdom's built-in may not support all operations in all environments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatSprintTime, loadSprintPB, saveSprintPB } from '../../engine/persistence.js'

// ---------------------------------------------------------------------------
// Minimal in-memory localStorage stub
// ---------------------------------------------------------------------------

function makeLocalStorageStub() {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => { store[key] = value },
    removeItem: (key: string): void => { delete store[key] },
    clear: (): void => { Object.keys(store).forEach(k => delete store[k]) },
    get length() { return Object.keys(store).length },
    key: (index: number): string | null => Object.keys(store)[index] ?? null,
  }
}

let localStorageStub: ReturnType<typeof makeLocalStorageStub>

beforeEach(() => {
  localStorageStub = makeLocalStorageStub()
  vi.stubGlobal('localStorage', localStorageStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('formatSprintTime', () => {
  it('formats 0 as "00:00.000"', () => {
    expect(formatSprintTime(0)).toBe('00:00.000')
  })

  it('formats 1000 as "00:01.000"', () => {
    expect(formatSprintTime(1000)).toBe('00:01.000')
  })

  it('formats 61234 as "01:01.234"', () => {
    expect(formatSprintTime(61234)).toBe('01:01.234')
  })

  it('formats 3600000 as "60:00.000" (no hours wrap)', () => {
    expect(formatSprintTime(3600000)).toBe('60:00.000')
  })
})

describe('loadSprintPB', () => {
  it('returns null when key is absent', () => {
    expect(loadSprintPB()).toBeNull()
  })

  it('returns the stored value after saveSprintPB', () => {
    saveSprintPB(5000)
    expect(loadSprintPB()).toBe(5000)
  })

  it('returns the latest value after overwrite', () => {
    saveSprintPB(5000)
    saveSprintPB(3000)
    expect(loadSprintPB()).toBe(3000)
  })

  it('returns null when key is set to a non-numeric string', () => {
    localStorageStub.setItem('tetris_sprint_pb', 'not-a-number')
    expect(loadSprintPB()).toBeNull()
  })

  it('does not throw when localStorage.getItem throws', () => {
    vi.spyOn(localStorageStub, 'getItem').mockImplementation(() => {
      throw new Error('storage error')
    })
    expect(() => loadSprintPB()).not.toThrow()
    expect(loadSprintPB()).toBeNull()
  })
})

describe('saveSprintPB', () => {
  it('does not throw when localStorage.setItem throws', () => {
    vi.spyOn(localStorageStub, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveSprintPB(5000)).not.toThrow()
  })
})
