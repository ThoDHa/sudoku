// User preferences stored in localStorage

import {
  STORAGE_SCHEMA_VERSION,
  migrateVersionedEnvelope,
  wrapVersionedEnvelope,
  type MigrationMap,
} from './storageMigration'

const PREFERENCES_KEY = 'sudoku_preferences'
const HOMEPAGE_MODE_CHANGE_EVENT = 'homepageModeChange'

export type HomepageMode = 'daily' | 'game'
export type AutoSolveSpeed = 'step' | 'slow' | 'normal' | 'fast' | 'instant'

// Auto-solve speed delays in milliseconds
// 'step' uses slow speed but starts paused
export const AUTO_SOLVE_SPEEDS: Record<AutoSolveSpeed, number> = {
  step: 500, // Same as slow, but starts paused
  slow: 500,
  normal: 150,
  fast: 25,
  instant: 0,
}

export const AUTO_SOLVE_SPEED_LABELS: Record<AutoSolveSpeed, string> = {
  step: 'Step',
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
  // Whether to show daily puzzle reminder when playing practice mode
  showDailyReminder: boolean
}

const DEFAULT_PREFERENCES: UserPreferences = {
  homepageMode: 'daily',
  autoSolveSpeed: 'fast',
  hideTimer: false,
  showDailyReminder: true,
}

const PREFERENCES_MIGRATIONS: MigrationMap<UserPreferences> = {}

export function getPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed: unknown = JSON.parse(raw)
    const migrated = migrateVersionedEnvelope<UserPreferences>(
      parsed,
      PREFERENCES_MIGRATIONS,
      STORAGE_SCHEMA_VERSION,
    )
    return migrated ? { ...DEFAULT_PREFERENCES, ...migrated } : DEFAULT_PREFERENCES
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PREFERENCES
}

export function setPreferences(prefs: Partial<UserPreferences>): void {
  const current = getPreferences()
  const updated = { ...current, ...prefs }
  localStorage.setItem(
    PREFERENCES_KEY,
    JSON.stringify(wrapVersionedEnvelope(updated, STORAGE_SCHEMA_VERSION)),
  )
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

export function getShowDailyReminder(): boolean {
  return getPreferences().showDailyReminder
}

export function setShowDailyReminder(show: boolean): void {
  setPreferences({ showDailyReminder: show })
}
