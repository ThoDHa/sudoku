// Game-specific settings (separate from theme preferences)

import { STORAGE_KEYS } from './constants'
import { HomepageMode } from './preferences'

const AUTO_SAVE_KEY = 'sudoku_autosave_enabled'

export function getAutoSaveEnabled(): boolean {
  try {
    const value = localStorage.getItem(AUTO_SAVE_KEY)
    return value !== null ? JSON.parse(value) : true // Default: enabled
  } catch {
    return true
  }
}

export function setAutoSaveEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(enabled))
  } catch (e) {
    console.warn('Failed to save auto-save preference:', e)
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
 * Find all in-progress games stored in localStorage
 */
export function getInProgressGames(): SavedGameInfo[] {
  const games: SavedGameInfo[] = []
  const prefix = STORAGE_KEYS.GAME_STATE_PREFIX
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const seed = key.slice(prefix.length)
        const data = localStorage.getItem(key)
        if (data) {
          try {
            const parsed = JSON.parse(data)
            // Validate it's a game state
            if (parsed.board?.length === 81 && parsed.savedAt) {
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
    console.warn('Failed to scan for in-progress games:', e)
  }
  
  // Sort by most recently saved
  return games.sort((a, b) => b.savedAt - a.savedAt)
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
  const filteredGames = games.filter(game => {
    if (mode === 'daily') {
      return game.seed.startsWith('daily-')
    } else {
      return !game.seed.startsWith('daily-')
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
    console.warn('Failed to clear in-progress game:', e)
  }
}

/**
 * Clear all in-progress games for a specific mode, except the one being saved
 * This ensures only ONE game per mode is saved at a time
 * @param currentSeed The seed of the game currently being saved (will not be cleared)
 */
export function clearOtherGamesForMode(currentSeed: string): void {
  const isDaily = currentSeed.startsWith('daily-')
  const games = getInProgressGames()
  
  for (const game of games) {
    // Skip the current game being saved
    if (game.seed === currentSeed) continue
    
    // Check if this game is in the same mode
    const gameIsDaily = game.seed.startsWith('daily-')
    if (isDaily === gameIsDaily) {
      // Same mode, different seed — clear it
      clearInProgressGame(game.seed)
    }
  }
}