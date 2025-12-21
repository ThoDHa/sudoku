// User preferences stored in localStorage

const PREFERENCES_KEY = 'sudoku_preferences'
const HOMEPAGE_MODE_CHANGE_EVENT = 'homepageModeChange'

export type HomepageMode = 'daily' | 'game'
export type AutoSolveSpeed = 'slow' | 'normal' | 'fast' | 'instant'

// Auto-solve speed delays in milliseconds
export const AUTO_SOLVE_SPEEDS: Record<AutoSolveSpeed, number> = {
  slow: 500,
  normal: 150,
  fast: 25,
  instant: 0,
}

export const AUTO_SOLVE_SPEED_LABELS: Record<AutoSolveSpeed, string> = {
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
  instant: 'Instant',
}

export interface UserPreferences {
  // Which homepage to show: 'daily' or 'game'
  homepageMode: HomepageMode
  // Auto-solve playback speed
  autoSolveSpeed: AutoSolveSpeed
  // Whether to hide the timer during gameplay
  hideTimer: boolean
}

const DEFAULT_PREFERENCES: UserPreferences = {
  homepageMode: 'daily',
  autoSolveSpeed: 'fast',
  hideTimer: false,
}

export function getPreferences(): UserPreferences {
  try {
    const data = localStorage.getItem(PREFERENCES_KEY)
    if (data) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) }
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PREFERENCES
}

export function setPreferences(prefs: Partial<UserPreferences>): void {
  const current = getPreferences()
  const updated = { ...current, ...prefs }
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated))
}

export function getHomepageMode(): HomepageMode {
  return getPreferences().homepageMode
}

export function setHomepageMode(mode: HomepageMode): void {
  setPreferences({ homepageMode: mode })
  // Dispatch custom event so components can react to the change
  window.dispatchEvent(new CustomEvent(HOMEPAGE_MODE_CHANGE_EVENT, { detail: mode }))
}

// Subscribe to homepage mode changes
export function onHomepageModeChange(callback: (mode: HomepageMode) => void): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<HomepageMode>).detail)
  window.addEventListener(HOMEPAGE_MODE_CHANGE_EVENT, handler)
  return () => window.removeEventListener(HOMEPAGE_MODE_CHANGE_EVENT, handler)
}

export function getAutoSolveSpeed(): AutoSolveSpeed {
  return getPreferences().autoSolveSpeed
}

export function setAutoSolveSpeed(speed: AutoSolveSpeed): void {
  setPreferences({ autoSolveSpeed: speed })
}

export function getAutoSolveDelay(): number {
  return AUTO_SOLVE_SPEEDS[getAutoSolveSpeed()]
}

export function getHideTimer(): boolean {
  return getPreferences().hideTimer
}

export function setHideTimer(hide: boolean): void {
  setPreferences({ hideTimer: hide })
}
