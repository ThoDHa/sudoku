// Mock logger before importing modules that use it
vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
  enableDebug: vi.fn(),
  disableDebug: vi.fn(),
}))

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getAutoSaveEnabled,
  setAutoSaveEnabled,
  getInProgressGames,
  getMostRecentGame,
  getMostRecentGameForMode,
  hasInProgressGame,
  clearInProgressGame,
  clearOtherGamesForMode,
  type SavedGameInfo,
} from './gameSettings'
import { STORAGE_KEYS } from './constants'
import { logger } from './logger'

// Helper to create a valid game state
function createGameState(options: {
  savedAt: number
  difficulty?: string
  elapsedMs?: number
  filledCells?: number
}) {
  const { savedAt, difficulty = 'medium', elapsedMs = 0, filledCells = 40 } = options
  // Create a board with the specified number of filled cells
  const board = new Array(81).fill(0)
  for (let i = 0; i < filledCells; i++) {
    board[i] = (i % 9) + 1
  }
  return {
    board,
    difficulty,
    savedAt,
    elapsedMs,
  }
}

// Mock localStorage with key iteration support
const createLocalStorageMock = () => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length
    },
    // Helper for tests to directly manipulate store
    _getStore: () => store,
    _setStore: (newStore: Record<string, string>) => {
      store = newStore
    },
  }
}

let localStorageMock: ReturnType<typeof createLocalStorageMock>
let loggerWarnSpy: ReturnType<typeof vi.spyOn>

describe('gameSettings', () => {
  beforeEach(() => {
    localStorageMock = createLocalStorageMock()
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
    })
    // Mock logger.warn to avoid noise in tests and to verify error handling
    loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // getAutoSaveEnabled
  // ===========================================================================
  describe('getAutoSaveEnabled', () => {
    it('should return true by default when no value stored', () => {
      expect(getAutoSaveEnabled()).toBe(true)
    })

    it('should return true when stored as true', () => {
      localStorageMock.setItem('sudoku_autosave_enabled', 'true')
      expect(getAutoSaveEnabled()).toBe(true)
    })

    it('should return false when stored as false', () => {
      localStorageMock.setItem('sudoku_autosave_enabled', 'false')
      expect(getAutoSaveEnabled()).toBe(false)
    })

    it('should return true on JSON parse error', () => {
      localStorageMock.setItem('sudoku_autosave_enabled', 'invalid json')
      expect(getAutoSaveEnabled()).toBe(true)
    })

    it('should return true when localStorage throws', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage access denied')
      })
      expect(getAutoSaveEnabled()).toBe(true)
    })
  })

  // ===========================================================================
  // setAutoSaveEnabled
  // ===========================================================================
  describe('setAutoSaveEnabled', () => {
    it('should store true value', () => {
      setAutoSaveEnabled(true)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'sudoku_autosave_enabled',
        'true'
      )
    })

    it('should store false value', () => {
      setAutoSaveEnabled(false)
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'sudoku_autosave_enabled',
        'false'
      )
    })

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      // Should not throw
      expect(() => setAutoSaveEnabled(true)).not.toThrow()
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Failed to save auto-save preference:',
        expect.any(Error)
      )
    })
  })

  // ===========================================================================
  // getInProgressGames
  // ===========================================================================
  describe('getInProgressGames', () => {
    const prefix = STORAGE_KEYS.GAME_STATE_PREFIX

    it('should return empty array when no games stored', () => {
      expect(getInProgressGames()).toEqual([])
    })

    it('should find games with correct prefix', () => {
      const gameState = createGameState({ savedAt: 1000, filledCells: 45 })
      localStorageMock._setStore({
        [`${prefix}test-seed-123`]: JSON.stringify(gameState),
      })

      const games = getInProgressGames()
      expect(games).toHaveLength(1)
      expect(games[0].seed).toBe('test-seed-123')
      expect(games[0].difficulty).toBe('medium')
      expect(games[0].savedAt).toBe(1000)
      expect(games[0].elapsedMs).toBe(0)
      // 45/81 = 55.56%, rounds to 56%
      expect(games[0].progress).toBe(56)
    })

    it('should ignore items without correct prefix', () => {
      const gameState = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        'other_key': JSON.stringify(gameState),
        'sudoku_preferences': '{}',
        [`${prefix}valid-game`]: JSON.stringify(gameState),
      })

      const games = getInProgressGames()
      expect(games).toHaveLength(1)
      expect(games[0].seed).toBe('valid-game')
    })

    it('should sort games by savedAt descending (most recent first)', () => {
      const oldGame = createGameState({ savedAt: 1000 })
      const midGame = createGameState({ savedAt: 2000 })
      const newGame = createGameState({ savedAt: 3000 })

      localStorageMock._setStore({
        [`${prefix}old-game`]: JSON.stringify(oldGame),
        [`${prefix}new-game`]: JSON.stringify(newGame),
        [`${prefix}mid-game`]: JSON.stringify(midGame),
      })

      const games = getInProgressGames()
      expect(games).toHaveLength(3)
      expect(games[0].seed).toBe('new-game')
      expect(games[1].seed).toBe('mid-game')
      expect(games[2].seed).toBe('old-game')
    })

    it('should skip entries with invalid JSON', () => {
      const validGame = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        [`${prefix}valid-game`]: JSON.stringify(validGame),
        [`${prefix}invalid-game`]: 'not valid json {{{',
      })

      const games = getInProgressGames()
      expect(games).toHaveLength(1)
      expect(games[0].seed).toBe('valid-game')
    })

    it('should skip entries without 81-cell board', () => {
      const validGame = createGameState({ savedAt: 1000 })
      const invalidGame = { board: [1, 2, 3], savedAt: 2000 }

      localStorageMock._setStore({
        [`${prefix}valid-game`]: JSON.stringify(validGame),
        [`${prefix}short-board`]: JSON.stringify(invalidGame),
      })

      const games = getInProgressGames()
      expect(games).toHaveLength(1)
      expect(games[0].seed).toBe('valid-game')
    })

    it('should skip entries without savedAt', () => {
      const validGame = createGameState({ savedAt: 1000 })
      const noSavedAt = { board: new Array(81).fill(0) }

      localStorageMock._setStore({
        [`${prefix}valid-game`]: JSON.stringify(validGame),
        [`${prefix}no-timestamp`]: JSON.stringify(noSavedAt),
      })

      const games = getInProgressGames()
      expect(games).toHaveLength(1)
      expect(games[0].seed).toBe('valid-game')
    })

    it('should handle missing difficulty gracefully', () => {
      const gameWithoutDifficulty = {
        board: new Array(81).fill(0),
        savedAt: 1000,
      }
      localStorageMock._setStore({
        [`${prefix}no-diff`]: JSON.stringify(gameWithoutDifficulty),
      })

      const games = getInProgressGames()
      expect(games).toHaveLength(1)
      expect(games[0].difficulty).toBe('unknown')
    })

    it('should handle missing elapsedMs gracefully', () => {
      const gameWithoutElapsed = {
        board: new Array(81).fill(0),
        savedAt: 1000,
        difficulty: 'hard',
      }
      localStorageMock._setStore({
        [`${prefix}no-elapsed`]: JSON.stringify(gameWithoutElapsed),
      })

      const games = getInProgressGames()
      expect(games).toHaveLength(1)
      expect(games[0].elapsedMs).toBe(0)
    })

    it('should calculate progress correctly', () => {
      // 0 filled = 0%
      const emptyGame = createGameState({ savedAt: 1000, filledCells: 0 })
      // 81 filled = 100%
      const fullGame = createGameState({ savedAt: 2000, filledCells: 81 })
      // 27 filled = 33%
      const partialGame = createGameState({ savedAt: 3000, filledCells: 27 })

      localStorageMock._setStore({
        [`${prefix}empty`]: JSON.stringify(emptyGame),
        [`${prefix}full`]: JSON.stringify(fullGame),
        [`${prefix}partial`]: JSON.stringify(partialGame),
      })

      const games = getInProgressGames()
      const empty = games.find((g) => g.seed === 'empty')
      const full = games.find((g) => g.seed === 'full')
      const partial = games.find((g) => g.seed === 'partial')

      expect(empty?.progress).toBe(0)
      expect(full?.progress).toBe(100)
      expect(partial?.progress).toBe(33)
    })

    it('should handle localStorage iteration errors', () => {
      // Make length throw
      Object.defineProperty(localStorageMock, 'length', {
        get: () => {
          throw new Error('Access denied')
        },
      })

      const games = getInProgressGames()
      expect(games).toEqual([])
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Failed to scan for in-progress games:',
        expect.any(Error)
      )
    })

    it('should handle null key from localStorage.key()', () => {
      // Set up store but make key() return null for one index
      const gameState = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        [`${prefix}game1`]: JSON.stringify(gameState),
      })
      
      // Override key to return null for index 0
      localStorageMock.key.mockImplementation((index: number) => {
        if (index === 0) return null
        return null
      })
      
      // Mock length to return 1
      Object.defineProperty(localStorageMock, 'length', {
        value: 1,
        writable: true,
      })

      const games = getInProgressGames()
      expect(games).toEqual([])
    })
  })

  // ===========================================================================
  // getMostRecentGame
  // ===========================================================================
  describe('getMostRecentGame', () => {
    const prefix = STORAGE_KEYS.GAME_STATE_PREFIX

    it('should return null when no games exist', () => {
      expect(getMostRecentGame()).toBeNull()
    })

    it('should return the most recent game', () => {
      const oldGame = createGameState({ savedAt: 1000 })
      const newGame = createGameState({ savedAt: 3000 })

      localStorageMock._setStore({
        [`${prefix}old-game`]: JSON.stringify(oldGame),
        [`${prefix}new-game`]: JSON.stringify(newGame),
      })

      const result = getMostRecentGame()
      expect(result).not.toBeNull()
      expect(result?.seed).toBe('new-game')
      expect(result?.savedAt).toBe(3000)
    })
  })

  // ===========================================================================
  // getMostRecentGameForMode
  // ===========================================================================
  describe('getMostRecentGameForMode', () => {
    const prefix = STORAGE_KEYS.GAME_STATE_PREFIX

    it('should return null when no games exist for daily mode', () => {
      const practiceGame = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        [`${prefix}practice-123`]: JSON.stringify(practiceGame),
      })

      expect(getMostRecentGameForMode('daily')).toBeNull()
    })

    it('should return null when no games exist for practice mode', () => {
      const dailyGame = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        [`${prefix}daily-2024-01-15`]: JSON.stringify(dailyGame),
      })

      expect(getMostRecentGameForMode('practice')).toBeNull()
    })

    it('should return daily games for daily mode', () => {
      const dailyGame = createGameState({ savedAt: 2000 })
      const practiceGame = createGameState({ savedAt: 3000 })

      localStorageMock._setStore({
        [`${prefix}daily-2024-01-15`]: JSON.stringify(dailyGame),
        [`${prefix}P1234567890`]: JSON.stringify(practiceGame),
      })

      const result = getMostRecentGameForMode('daily')
      expect(result).not.toBeNull()
      expect(result?.seed).toBe('daily-2024-01-15')
    })

    it('should return practice games for practice mode', () => {
      const dailyGame = createGameState({ savedAt: 3000 })
      const practiceGame = createGameState({ savedAt: 2000 })

      localStorageMock._setStore({
        [`${prefix}daily-2024-01-15`]: JSON.stringify(dailyGame),
        [`${prefix}P1234567890`]: JSON.stringify(practiceGame),
      })

      const result = getMostRecentGameForMode('practice')
      expect(result).not.toBeNull()
      expect(result?.seed).toBe('P1234567890')
    })

    it('should return most recent daily game when multiple exist', () => {
      const oldDaily = createGameState({ savedAt: 1000 })
      const newDaily = createGameState({ savedAt: 3000 })

      localStorageMock._setStore({
        [`${prefix}daily-2024-01-14`]: JSON.stringify(oldDaily),
        [`${prefix}daily-2024-01-15`]: JSON.stringify(newDaily),
      })

      const result = getMostRecentGameForMode('daily')
      expect(result?.seed).toBe('daily-2024-01-15')
      expect(result?.savedAt).toBe(3000)
    })

    it('should return most recent practice game when multiple exist', () => {
      const oldPractice = createGameState({ savedAt: 1000 })
      const newPractice = createGameState({ savedAt: 3000 })

      localStorageMock._setStore({
        [`${prefix}P111`]: JSON.stringify(oldPractice),
        [`${prefix}P222`]: JSON.stringify(newPractice),
      })

      const result = getMostRecentGameForMode('practice')
      expect(result?.seed).toBe('P222')
      expect(result?.savedAt).toBe(3000)
    })

    it('should handle game mode correctly', () => {
      // 'game' is an alias for practice mode (non-daily)
      const practiceGame = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        [`${prefix}P123`]: JSON.stringify(practiceGame),
      })

      const result = getMostRecentGameForMode('game')
      expect(result).not.toBeNull()
      expect(result?.seed).toBe('P123')
    })
  })

  // ===========================================================================
  // hasInProgressGame
  // ===========================================================================
  describe('hasInProgressGame', () => {
    const prefix = STORAGE_KEYS.GAME_STATE_PREFIX

    it('should return false when no games exist', () => {
      expect(hasInProgressGame()).toBe(false)
    })

    it('should return true when games exist', () => {
      const game = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        [`${prefix}some-game`]: JSON.stringify(game),
      })

      expect(hasInProgressGame()).toBe(true)
    })
  })

  // ===========================================================================
  // clearInProgressGame
  // ===========================================================================
  describe('clearInProgressGame', () => {
    const prefix = STORAGE_KEYS.GAME_STATE_PREFIX

    it('should remove the correct game from localStorage', () => {
      const game = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        [`${prefix}game-to-clear`]: JSON.stringify(game),
      })

      clearInProgressGame('game-to-clear')

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        `${prefix}game-to-clear`
      )
    })

    it('should not throw when game does not exist', () => {
      expect(() => clearInProgressGame('nonexistent')).not.toThrow()
    })

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      expect(() => clearInProgressGame('some-game')).not.toThrow()
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Failed to clear in-progress game:',
        expect.any(Error)
      )
    })
  })

  // ===========================================================================
  // clearOtherGamesForMode
  // ===========================================================================
  describe('clearOtherGamesForMode', () => {
    const prefix = STORAGE_KEYS.GAME_STATE_PREFIX

    it('should clear other daily games when saving a daily game', () => {
      const currentDaily = createGameState({ savedAt: 3000 })
      const otherDaily = createGameState({ savedAt: 2000 })
      const practiceGame = createGameState({ savedAt: 1000 })

      localStorageMock._setStore({
        [`${prefix}daily-2024-01-15`]: JSON.stringify(currentDaily),
        [`${prefix}daily-2024-01-14`]: JSON.stringify(otherDaily),
        [`${prefix}P123`]: JSON.stringify(practiceGame),
      })

      clearOtherGamesForMode('daily-2024-01-15')

      // Should have removed the other daily but not the practice game
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        `${prefix}daily-2024-01-14`
      )
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(
        `${prefix}daily-2024-01-15`
      )
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(
        `${prefix}P123`
      )
    })

    it('should clear other practice games when saving a practice game', () => {
      const currentPractice = createGameState({ savedAt: 3000 })
      const otherPractice = createGameState({ savedAt: 2000 })
      const dailyGame = createGameState({ savedAt: 1000 })

      localStorageMock._setStore({
        [`${prefix}P456`]: JSON.stringify(currentPractice),
        [`${prefix}P123`]: JSON.stringify(otherPractice),
        [`${prefix}daily-2024-01-15`]: JSON.stringify(dailyGame),
      })

      clearOtherGamesForMode('P456')

      // Should have removed the other practice but not the daily game
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(`${prefix}P123`)
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(
        `${prefix}P456`
      )
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(
        `${prefix}daily-2024-01-15`
      )
    })

    it('should not clear anything when no other games exist in mode', () => {
      const currentGame = createGameState({ savedAt: 1000 })
      localStorageMock._setStore({
        [`${prefix}P123`]: JSON.stringify(currentGame),
      })

      clearOtherGamesForMode('P123')

      expect(localStorageMock.removeItem).not.toHaveBeenCalled()
    })

    it('should not clear games from other mode', () => {
      const practiceGame = createGameState({ savedAt: 2000 })
      const dailyGame = createGameState({ savedAt: 1000 })

      localStorageMock._setStore({
        [`${prefix}P123`]: JSON.stringify(practiceGame),
        [`${prefix}daily-2024-01-15`]: JSON.stringify(dailyGame),
      })

      // Saving a practice game should not touch daily games
      clearOtherGamesForMode('P123')
      expect(localStorageMock.removeItem).not.toHaveBeenCalled()

      // Reset mock and set up for daily test
      localStorageMock.removeItem.mockClear()
      
      // Saving a daily game should not touch practice games
      clearOtherGamesForMode('daily-2024-01-15')
      expect(localStorageMock.removeItem).not.toHaveBeenCalled()
    })

    it('should clear multiple other games in same mode', () => {
      const game1 = createGameState({ savedAt: 1000 })
      const game2 = createGameState({ savedAt: 2000 })
      const game3 = createGameState({ savedAt: 3000 })

      localStorageMock._setStore({
        [`${prefix}P111`]: JSON.stringify(game1),
        [`${prefix}P222`]: JSON.stringify(game2),
        [`${prefix}P333`]: JSON.stringify(game3),
      })

      clearOtherGamesForMode('P333')

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(`${prefix}P111`)
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(`${prefix}P222`)
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith(
        `${prefix}P333`
      )
      expect(localStorageMock.removeItem).toHaveBeenCalledTimes(2)
    })
  })
})
