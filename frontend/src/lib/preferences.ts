// User preferences stored in localStorage

const PREFERENCES_KEY = 'sudoku_preferences'

export type HomepageMode = 'daily' | 'difficulty'

export interface UserPreferences {
  // Which homepage to show: 'daily' (daily puzzle) or 'difficulty' (difficulty selector)
  homepageMode: HomepageMode
}

const DEFAULT_PREFERENCES: UserPreferences = {
  homepageMode: 'daily',
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
}
