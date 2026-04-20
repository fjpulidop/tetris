/**
 * Sprint mode persistence helpers.
 *
 * This file has zero imports — it uses only the `localStorage` global.
 * It may be imported from engine/, ui/, and main.ts.
 */

const SPRINT_PB_KEY = 'tetris_sprint_pb'

/**
 * Load the Sprint personal-best time in milliseconds.
 * Returns null if no PB is stored or the stored value is not a valid integer.
 */
export function loadSprintPB(): number | null {
  try {
    const raw = localStorage.getItem(SPRINT_PB_KEY)
    if (raw === null) return null
    const n = parseInt(raw, 10)
    return isNaN(n) ? null : n
  } catch {
    return null
  }
}

/**
 * Persist a new Sprint personal-best time in milliseconds.
 * Silently no-ops if localStorage is unavailable (private browsing, quota).
 */
export function saveSprintPB(ms: number): void {
  try {
    localStorage.setItem(SPRINT_PB_KEY, String(ms))
  } catch {
    // quota or private-browsing — silently ignore
  }
}

/**
 * Format a millisecond count as 'MM:SS.mmm'.
 * Pure function — no side effects.
 *
 * @example
 * formatSprintTime(0)      // '00:00.000'
 * formatSprintTime(61234)  // '01:01.234'
 */
export function formatSprintTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const millis = ms % 1000
  return (
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + '.' +
    String(millis).padStart(3, '0')
  )
}
