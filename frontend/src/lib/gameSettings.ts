// Game-specific settings (separate from theme preferences)

import { STORAGE_KEYS } from './constants'
import { type HomepageMode } from './preferences'
import { logger } from './logger'
import { getGameMode as getGameModeFromSeed } from './seedValidation'

// =============================================================================
// GAME MODE DETECTION
// =============================================================================

export type GameMode = 'daily' | 'practice' | null

/**
 * Detect game mode from puzzle seed
 * @param seed The puzzle seed string
 * @returns 'daily' for daily puzzles, 'practice' for practice puzzles, null for unknown
 */
export function getGameMode(seed: string): GameMode {
  const mode = getGameModeFromSeed(seed)
  // Filter out 'custom' to maintain type safety for this module
  return mode === 'custom' ? null : mode
}

/**
 * Check if a seed is a daily puzzle
 */
export function isDailyPuzzle(seed: string): boolean {
  return getGameMode(seed) === 'daily'
}

/**
 * Check if a seed is a practice puzzle
 */
export function isPracticePuzzle(seed: string): boolean {
  return getGameMode(seed) === 'practice'
}

// =============================================================================
// AUTO-SAVE SETTINGS
// =============================================================================

const AUTO_SAVE_KEY = 'sudoku_autosave_enabled'

export function getAutoSaveEnabled(): boolean {
  try {
    const value = localStorage.getItem(AUTO_SAVE_KEY)
    if (value === null) return true // Default: enabled
    const parsed: unknown = JSON.parse(value)
    return parsed === true
  } catch {
    return true
  }
}

export function setAutoSaveEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(enabled))
  } catch (e) {
    logger.warn('Failed to save auto-save preference:', e)
  }
}

// =============================================================================
// OFFLINE MODE SETTINGS
// =============================================================================
// PWA/offline caching is opt-in (default OFF). main.tsx registers the service
// worker only when this is true; toggling off unregisters the SW and wipes the
// caches (see pwaRegistration.ts). Stored separately from the versioned
// preferences envelope so a malformed value here cannot corrupt other prefs.

const OFFLINE_MODE_KEY = 'sudoku_offline_mode_enabled'

export function getOfflineModeEnabled(): boolean {
  try {
    const value = localStorage.getItem(OFFLINE_MODE_KEY)
    if (value === null) return false
    const parsed: unknown = JSON.parse(value)
    return parsed === true
  } catch {
    return false
  }
}

export function setOfflineModeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(OFFLINE_MODE_KEY, JSON.stringify(enabled))
  } catch (e) {
    logger.warn('Failed to save offline-mode preference:', e)
  }
}

// =============================================================================
// IN-PROGRESS GAME DETECTION
// =============================================================================

export interface SavedGameInfo {
  seed: string
  difficulty: string
  savedAt: number
  elapsedMs: number
  progress: number // percentage of cells filled
}

/**
 * Scan localStorage for saved game entries and build SavedGameInfo records.
 * Shared by getInProgressGames (excludes completed) and getAllSavedGames.
 */
function collectSavedGames(includeComplete: boolean, warnLabel: string): SavedGameInfo[] {
  const games: SavedGameInfo[] = []
  const prefix = STORAGE_KEYS.GAME_STATE_PREFIX

  try {
    // Stryker disable next-line EqualityOperator: at i===localStorage.length, localStorage.key returns null; the optional-chaining guard on the next line then yields undefined and the body is skipped, so the extra iteration is a no-op
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      // Stryker disable next-line OptionalChaining: for valid i in [0,length-1], localStorage.key(i) always returns a string, so `key.startsWith` and `key?.startsWith` are observationally identical here
      if (key?.startsWith(prefix)) {
        const seed = key.slice(prefix.length)
        const data = localStorage.getItem(key)
        // Stryker disable next-line ConditionalExpression: forcing `true` makes JSON.parse(null) yield null, whose `.board?.length` access then throws and is caught by the inner try/catch, producing the same skip-as-no-op behavior as the falsy path
        if (data) {
          try {
            const parsed = JSON.parse(data) as {
              board?: number[]
              savedAt?: number
              isComplete?: boolean
              difficulty?: string
              elapsedMs?: number
            }
            // Validate it's a game state; completed games are kept only when requested
            if (
              // Stryker disable next-line OptionalChaining: parsed.board is always an array for valid saved games; when it is missing, the original `?.length` returns undefined (!== 81, skip) and the mutant throws, which the surrounding try/catch swallows identically
              parsed.board?.length === 81 &&
              parsed.savedAt &&
              (includeComplete || !parsed.isComplete)
            ) {
              const filledCells = parsed.board.filter((v: number) => v !== 0).length
              games.push({
                seed,
                difficulty: parsed.difficulty || 'unknown',
                savedAt: parsed.savedAt,
                elapsedMs: parsed.elapsedMs || 0,
                progress: Math.round((filledCells / 81) * 100),
              })
            }
          } catch {
            // Skip invalid entries
          }
        }
      }
    }
  } catch (e) {
    logger.warn(warnLabel, e)
  }

  // Sort by most recently saved
  return games.sort((a, b) => b.savedAt - a.savedAt)
}

/**
 * Find all in-progress games stored in localStorage
 */
export function getInProgressGames(): SavedGameInfo[] {
  return collectSavedGames(false, 'Failed to scan for in-progress games:')
}

/**
 * Get the most recent in-progress game, if any
 */
export function getMostRecentGame(): SavedGameInfo | null {
  const games = getInProgressGames()
  return games[0] ?? null
}

/**
 * Get the most recent in-progress game for a specific mode
 * @param mode 'daily' for daily puzzles, 'game' for practice puzzles
 * @returns The most recent game matching the mode, or null if none
 */
export function getMostRecentGameForMode(mode: HomepageMode): SavedGameInfo | null {
  const games = getInProgressGames()
  const filteredGames = games.filter((game) => {
    const gameMode = getGameMode(game.seed)
    if (mode === 'daily') {
      return gameMode === 'daily'
    } else {
      return gameMode === 'practice'
    }
  })
  return filteredGames[0] ?? null
}

/**
 * Check if there's any in-progress game
 */
export function hasInProgressGame(): boolean {
  return getMostRecentGame() !== null
}

/**
 * Clear a specific in-progress game from localStorage
 */
export function clearInProgressGame(seed: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEYS.GAME_STATE_PREFIX}${seed}`)
  } catch (e) {
    logger.warn('Failed to clear in-progress game:', e)
  }
}

/**
 * Get ALL saved games (including completed ones) from localStorage
 * Used for cleanup operations that need to clear both in-progress and completed games
 */
function getAllSavedGames(): SavedGameInfo[] {
  return collectSavedGames(true, 'Failed to scan for saved games:')
}

/**
 * Clear all in-progress games for a specific mode, except the one being saved
 * This ensures only ONE game per mode is saved at a time
 * @param currentSeed The seed of the game currently being saved (will not be cleared)
 */
export function clearOtherGamesForMode(currentSeed: string): void {
  const currentMode = getGameMode(currentSeed)
  // Use getAllSavedGames to include completed games in cleanup
  const games = getAllSavedGames()

  for (const game of games) {
    // Skip the current game being saved
    if (game.seed === currentSeed) continue

    // Check if this game is in the same mode
    const gameMode = getGameMode(game.seed)
    if (currentMode === gameMode) {
      // Same mode, different seed: clear it (whether in-progress or completed)
      clearInProgressGame(game.seed)
    }
  }
}
