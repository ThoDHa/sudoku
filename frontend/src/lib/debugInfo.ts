import { getScores, getDailyStreak, getDailyCompletions } from './scores'
import { HomepageMode } from './preferences'

export interface DebugInfo {
  timestamp: string
  page: string
  settings: {
    colorTheme: string
    mode: string
    homepageMode: HomepageMode
  }
  stats: {
    totalGamesPlayed: number
    dailyStreak: number
    longestStreak: number
    dailyCompletions: number
  }
  browser: {
    userAgent: string
    language: string
    cookiesEnabled: boolean
    onLine: boolean
    screenSize: string
    viewportSize: string
    devicePixelRatio: number
  }
  storage: {
    localStorageAvailable: boolean
  }
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  try {
    localStorage.setItem('test', 'test')
    localStorage.removeItem('test')
    return true
  } catch {
    return false
  }
}

/**
 * Build the debug info object for bug reports.
 * Collects settings, stats, browser info, and storage availability.
 */
export function buildDebugInfo(
  pathname: string,
  colorTheme: string,
  mode: string,
  homepageMode: HomepageMode,
): DebugInfo {
  const scores = getScores()
  const streak = getDailyStreak()
  const completions = getDailyCompletions()

  return {
    timestamp: new Date().toISOString(),
    page: pathname,
    settings: {
      colorTheme,
      mode,
      homepageMode,
    },
    stats: {
      totalGamesPlayed: scores.length,
      dailyStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      dailyCompletions: completions.size,
    },
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio,
    },
    storage: {
      localStorageAvailable: isLocalStorageAvailable(),
    },
  }
}

/**
 * Format debug info as indented JSON string for clipboard.
 */
export function formatDebugJson(debugInfo: DebugInfo): string {
  return JSON.stringify(debugInfo, null, 2)
}
