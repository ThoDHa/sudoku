import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getStorageKey,
  loadSavedGameState,
  clearSavedGameState,
  useAutoSave,
  type SavedGameState,
  type UseAutoSaveOptions,
} from './useAutoSave'

// =============================================================================
// MOCKS
// =============================================================================

// Mock gameSettings module
vi.mock('../lib/gameSettings', () => ({
  getAutoSaveEnabled: vi.fn(() => true),
}))

// Mock candidatesUtils module
vi.mock('../lib/candidatesUtils', () => ({
  candidatesToArrays: vi.fn((candidates: Uint16Array) => {
    // Simple mock: convert Uint16Array to number[][] where each mask becomes an array
    return Array.from(candidates).map(mask => {
      if (mask === 0) return []
      const digits: number[] = []
      for (let d = 1; d <= 9; d++) {
        if ((mask & (1 << d)) !== 0) digits.push(d)
      }
      return digits
    })
  }),
  arraysToCandidates: vi.fn((arrays: number[][]) => {
    // Simple mock: convert number[][] to Uint16Array
    const result = new Uint16Array(arrays.length)
    for (let i = 0; i < arrays.length; i++) {
      let mask = 0
      for (const d of arrays[i] ?? []) {
        mask |= (1 << d)
      }
      result[i] = mask
    }
    return result
  }),
}))

// Import the mocked functions for assertions
import { getAutoSaveEnabled } from '../lib/gameSettings'
import { candidatesToArrays } from '../lib/candidatesUtils'

const mockGetAutoSaveEnabled = vi.mocked(getAutoSaveEnabled)
const mockCandidatesToArrays = vi.mocked(candidatesToArrays)

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Mock localStorage with proper error simulation capabilities
 */
const createMockLocalStorage = () => {
  const store: Record<string, string> = {}
  let shouldThrow = false

  return {
    getItem: vi.fn((key: string) => {
      if (shouldThrow) throw new Error('localStorage access denied')
      return store[key] ?? null
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (shouldThrow) throw new Error('localStorage access denied')
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      if (shouldThrow) throw new Error('localStorage access denied')
      delete store[key]
    }),
    clear: vi.fn(() => {
      if (shouldThrow) throw new Error('localStorage access denied')
      Object.keys(store).forEach(key => delete store[key])
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length
    },
    // Test helpers
    _store: store,
    _setShouldThrow: (value: boolean) => { shouldThrow = value },
    _reset: () => {
      Object.keys(store).forEach(key => delete store[key])
      shouldThrow = false
    },
  }
}

let mockLocalStorage: ReturnType<typeof createMockLocalStorage>

/**
 * Create a valid saved game state for testing
 */
const createValidSavedState = (overrides?: Partial<SavedGameState>): SavedGameState => ({
  board: Array(81).fill(0),
  candidates: Array(81).fill([1, 2, 3]),
  elapsedMs: 12345,
  history: [],
  autoFillUsed: false,
  savedAt: Date.now(),
  difficulty: 'medium',
  ...overrides,
})

/**
 * Create default options for useAutoSave hook
 */
const createDefaultOptions = (overrides?: Partial<UseAutoSaveOptions>): UseAutoSaveOptions => ({
  puzzle: { seed: 'test-puzzle-123', difficulty: 'medium' },
  game: {
    board: Array(81).fill(0),
    candidates: new Uint16Array(81),
    history: [],
    isComplete: false,
  },
  elapsedMs: 0,
  autoFillUsed: false,
  shouldPauseOperations: false,
  isHidden: false,
  ...overrides,
})

// =============================================================================
// TEST SETUP
// =============================================================================

beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks()

  // Setup localStorage mock
  mockLocalStorage = createMockLocalStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  })

  // Setup console.warn mock to suppress expected warnings
  vi.spyOn(console, 'warn').mockImplementation(() => {})

  // Reset getAutoSaveEnabled to return true by default
  mockGetAutoSaveEnabled.mockReturnValue(true)

  // Use fake timers for debounce testing
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  mockLocalStorage._reset()
})

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe('getStorageKey', () => {
  it('returns prefixed storage key with puzzle seed', () => {
    const result = getStorageKey('puzzle-123')
    expect(result).toBe('sudoku_game_puzzle-123')
  })

  it('handles empty string seed', () => {
    const result = getStorageKey('')
    expect(result).toBe('sudoku_game_')
  })

  it('handles special characters in seed', () => {
    const result = getStorageKey('daily-2024-01-01')
    expect(result).toBe('sudoku_game_daily-2024-01-01')
  })
})

describe('loadSavedGameState', () => {
  it('returns null when no saved state exists', () => {
    const result = loadSavedGameState('nonexistent-puzzle')
    expect(result).toBeNull()
    expect(mockLocalStorage.getItem).toHaveBeenCalledWith('sudoku_game_nonexistent-puzzle')
  })

  it('returns parsed state when valid state exists', () => {
    const savedState = createValidSavedState()
    mockLocalStorage._store['sudoku_game_test-puzzle'] = JSON.stringify(savedState)

    const result = loadSavedGameState('test-puzzle')

    expect(result).not.toBeNull()
    expect(result?.board).toEqual(savedState.board)
    expect(result?.candidates).toEqual(savedState.candidates)
    expect(result?.elapsedMs).toBe(savedState.elapsedMs)
    expect(result?.difficulty).toBe('medium')
  })

  it('returns null when board.length !== 81', () => {
    const invalidState = createValidSavedState({ board: [1, 2, 3] })
    mockLocalStorage._store['sudoku_game_test-puzzle'] = JSON.stringify(invalidState)

    const result = loadSavedGameState('test-puzzle')

    expect(result).toBeNull()
  })

  it('returns null when candidates.length !== 81', () => {
    const invalidState = createValidSavedState({ candidates: [[1, 2], [3, 4]] })
    mockLocalStorage._store['sudoku_game_test-puzzle'] = JSON.stringify(invalidState)

    const result = loadSavedGameState('test-puzzle')

    expect(result).toBeNull()
  })

  it('returns null when board is missing', () => {
    const invalidState = { candidates: Array(81).fill([]), elapsedMs: 100 }
    mockLocalStorage._store['sudoku_game_test-puzzle'] = JSON.stringify(invalidState)

    const result = loadSavedGameState('test-puzzle')

    expect(result).toBeNull()
  })

  it('returns null when candidates is missing', () => {
    const invalidState = { board: Array(81).fill(0), elapsedMs: 100 }
    mockLocalStorage._store['sudoku_game_test-puzzle'] = JSON.stringify(invalidState)

    const result = loadSavedGameState('test-puzzle')

    expect(result).toBeNull()
  })

  it('returns null and logs warning when JSON parsing fails', () => {
    mockLocalStorage._store['sudoku_game_test-puzzle'] = 'invalid json {'

    const result = loadSavedGameState('test-puzzle')

    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load saved game state:',
      expect.any(Error)
    )
  })

  it('returns null and logs warning when localStorage throws', () => {
    mockLocalStorage._setShouldThrow(true)

    const result = loadSavedGameState('test-puzzle')

    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load saved game state:',
      expect.any(Error)
    )
  })
})

describe('clearSavedGameState', () => {
  it('removes saved state from localStorage', () => {
    mockLocalStorage._store['sudoku_game_test-puzzle'] = JSON.stringify(createValidSavedState())

    clearSavedGameState('test-puzzle')

    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('sudoku_game_test-puzzle')
    expect(mockLocalStorage._store['sudoku_game_test-puzzle']).toBeUndefined()
  })

  it('does not throw when key does not exist', () => {
    expect(() => clearSavedGameState('nonexistent')).not.toThrow()
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('sudoku_game_nonexistent')
  })

  it('logs warning and continues when localStorage throws', () => {
    mockLocalStorage._setShouldThrow(true)

    expect(() => clearSavedGameState('test-puzzle')).not.toThrow()
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to clear saved game state:',
      expect.any(Error)
    )
  })
})

// =============================================================================
// useAutoSave HOOK TESTS
// =============================================================================

describe('useAutoSave', () => {
  // ===========================================================================
  // Hook Initialization
  // ===========================================================================
  describe('Hook Initialization', () => {
    it('returns all expected properties', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSave(options))

      expect(result.current).toHaveProperty('saveGameState')
      expect(result.current).toHaveProperty('clearSavedState')
      expect(result.current).toHaveProperty('markRestored')
      expect(result.current).toHaveProperty('isRestored')
    })

    it('returns functions for all actions', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSave(options))

      expect(typeof result.current.saveGameState).toBe('function')
      expect(typeof result.current.clearSavedState).toBe('function')
      expect(typeof result.current.markRestored).toBe('function')
      expect(typeof result.current.isRestored).toBe('function')
    })

    it('isRestored returns false initially', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSave(options))

      expect(result.current.isRestored()).toBe(false)
    })
  })

  // ===========================================================================
  // markRestored
  // ===========================================================================
  describe('markRestored', () => {
    it('sets isRestored to true', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSave(options))

      expect(result.current.isRestored()).toBe(false)

      act(() => {
        result.current.markRestored()
      })

      expect(result.current.isRestored()).toBe(true)
    })

    it('is stable across rerenders', () => {
      const options = createDefaultOptions()
      const { result, rerender } = renderHook(() => useAutoSave(options))

      const markRestored1 = result.current.markRestored

      rerender()

      expect(result.current.markRestored).toBe(markRestored1)
    })
  })

  // ===========================================================================
  // saveGameState
  // ===========================================================================
  describe('saveGameState', () => {
    it('does not save when puzzle is null', () => {
      const options = createDefaultOptions({ puzzle: null })
      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.markRestored()
        result.current.saveGameState()
      })

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('does not save when game is complete', () => {
      const options = createDefaultOptions({
        game: {
          board: Array(81).fill(1),
          candidates: new Uint16Array(81),
          history: [],
          isComplete: true,
        },
      })
      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.markRestored()
        result.current.saveGameState()
      })

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('does not save before markRestored is called', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSave(options))

      // Do NOT call markRestored
      act(() => {
        result.current.saveGameState()
      })

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('saves game state after markRestored is called', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.markRestored()
        result.current.saveGameState()
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'sudoku_game_test-puzzle-123',
        expect.any(String)
      )
    })

    it('saves correct game state structure', () => {
      const board = Array(81).fill(0).map((_, i) => i % 10)
      const candidates = new Uint16Array(81)
      candidates[0] = 0b0000000110 // digits 1, 2

      const options = createDefaultOptions({
        puzzle: { seed: 'my-puzzle', difficulty: 'hard' },
        game: {
          board,
          candidates,
          history: [{ type: 'place', cell: 0, digit: 5, prevValue: 0 }],
          isComplete: false,
        },
        elapsedMs: 30000,
        autoFillUsed: true,
      })

      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.markRestored()
        result.current.saveGameState()
      })

      const savedJson = mockLocalStorage.setItem.mock.calls[0][1]
      const saved = JSON.parse(savedJson as string)

      expect(saved.board).toEqual(board)
      expect(saved.candidates).toBeDefined()
      expect(saved.elapsedMs).toBe(30000)
      expect(saved.history).toEqual([{ type: 'place', cell: 0, digit: 5, prevValue: 0 }])
      expect(saved.autoFillUsed).toBe(true)
      expect(saved.difficulty).toBe('hard')
      expect(saved.savedAt).toBeTypeOf('number')
    })

    it('calls candidatesToArrays with game candidates', () => {
      const candidates = new Uint16Array(81)
      candidates[0] = 0b0000001110 // digits 1, 2, 3

      const options = createDefaultOptions({
        game: {
          board: Array(81).fill(0),
          candidates,
          history: [],
          isComplete: false,
        },
      })

      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.markRestored()
        result.current.saveGameState()
      })

      expect(mockCandidatesToArrays).toHaveBeenCalledWith(candidates)
    })

    it('logs warning and continues when localStorage throws', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.markRestored()
      })

      mockLocalStorage._setShouldThrow(true)

      act(() => {
        result.current.saveGameState()
      })

      expect(console.warn).toHaveBeenCalledWith(
        'Failed to save game state:',
        expect.any(Error)
      )
    })
  })

  // ===========================================================================
  // clearSavedState
  // ===========================================================================
  describe('clearSavedState', () => {
    it('does nothing when puzzle is null', () => {
      const options = createDefaultOptions({ puzzle: null })
      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.clearSavedState()
      })

      expect(mockLocalStorage.removeItem).not.toHaveBeenCalled()
    })

    it('removes saved state for current puzzle', () => {
      const options = createDefaultOptions({
        puzzle: { seed: 'puzzle-to-clear', difficulty: 'easy' },
      })
      mockLocalStorage._store['sudoku_game_puzzle-to-clear'] = JSON.stringify(createValidSavedState())

      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.clearSavedState()
      })

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('sudoku_game_puzzle-to-clear')
    })
  })

  // ===========================================================================
  // Auto-Save Effect (board/candidates change)
  // ===========================================================================
  describe('Auto-Save Effect', () => {
    it('auto-saves when board changes', async () => {
      const options = createDefaultOptions()
      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Change board
      const newBoard = [...options.game.board]
      newBoard[0] = 5
      const newOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
      })

      rerender({ opts: newOptions })

      // Advance past debounce timer
      await act(async () => {
        vi.advanceTimersByTime(600)
      })

      // Advance past requestIdleCallback/setTimeout fallback
      await act(async () => {
        vi.advanceTimersByTime(600)
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalled()
    })

    it('does not auto-save when auto-save is disabled', async () => {
      mockGetAutoSaveEnabled.mockReturnValue(false)

      const options = createDefaultOptions()
      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Change board
      const newBoard = [...options.game.board]
      newBoard[0] = 5
      const newOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
      })

      rerender({ opts: newOptions })

      await act(async () => {
        vi.advanceTimersByTime(1200)
      })

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('does not auto-save before markRestored is called', async () => {
      const options = createDefaultOptions()
      const { rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      // Don't call markRestored

      // Change board
      const newBoard = [...options.game.board]
      newBoard[0] = 5
      const newOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
      })

      rerender({ opts: newOptions })

      await act(async () => {
        vi.advanceTimersByTime(1200)
      })

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('does not auto-save when game is complete', async () => {
      const options = createDefaultOptions({
        game: {
          board: Array(81).fill(0),
          candidates: new Uint16Array(81),
          history: [],
          isComplete: true,
        },
      })

      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Change something
      const newOptions = createDefaultOptions({
        game: { ...options.game },
        elapsedMs: 10000,
      })

      rerender({ opts: newOptions })

      await act(async () => {
        vi.advanceTimersByTime(1200)
      })

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('does not auto-save when shouldPauseOperations is true', async () => {
      const options = createDefaultOptions({ shouldPauseOperations: false })
      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Set shouldPauseOperations to true and change board
      const newBoard = [...options.game.board]
      newBoard[0] = 5
      const newOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
        shouldPauseOperations: true,
      })

      rerender({ opts: newOptions })

      await act(async () => {
        vi.advanceTimersByTime(1200)
      })

      // Should not have auto-saved while paused
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('debounces auto-save calls', async () => {
      const options = createDefaultOptions()
      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Make multiple rapid changes
      for (let i = 0; i < 5; i++) {
        const newBoard = [...options.game.board]
        newBoard[i] = i + 1
        const newOptions = createDefaultOptions({
          game: { ...options.game, board: newBoard },
        })

        rerender({ opts: newOptions })

        await act(async () => {
          vi.advanceTimersByTime(100) // Less than debounce threshold
        })
      }

      // Now wait for debounce to complete
      await act(async () => {
        vi.advanceTimersByTime(1200)
      })

      // Should only save once (the last state)
      expect(mockLocalStorage.setItem.mock.calls.length).toBeLessThanOrEqual(1)
    })
  })

  // ===========================================================================
  // Visibility Change (isHidden) Effect
  // ===========================================================================
  describe('Visibility Change Effect', () => {
    it('saves immediately when becoming visible with unsaved changes', async () => {
      const options = createDefaultOptions({
        shouldPauseOperations: true,
        isHidden: true,
      })

      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Make a change while hidden (this sets hasUnsavedChanges)
      const newBoard = [...options.game.board]
      newBoard[0] = 5
      const hiddenOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
        shouldPauseOperations: true,
        isHidden: true,
      })

      rerender({ opts: hiddenOptions })

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      // Should not have saved while hidden
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()

      // Now become visible
      const visibleOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
        shouldPauseOperations: false,
        isHidden: false,
      })

      rerender({ opts: visibleOptions })

      // The visibility effect calls saveGameState immediately (synchronously)
      // so we just need to flush any pending promises
      await act(async () => {
        // No timer needed - visibility change triggers immediate save
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalled()
    })

    it('does not save when becoming visible without unsaved changes', async () => {
      const options = createDefaultOptions({
        isHidden: true,
      })

      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Become visible without any changes having been made while hidden
      const visibleOptions = createDefaultOptions({
        isHidden: false,
      })

      rerender({ opts: visibleOptions })

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      // Should not save (no unsaved changes)
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })

    it('does not save when auto-save is disabled even with unsaved changes', async () => {
      mockGetAutoSaveEnabled.mockReturnValue(false)

      const options = createDefaultOptions({
        shouldPauseOperations: true,
        isHidden: true,
      })

      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Make change while hidden
      const newBoard = [...options.game.board]
      newBoard[0] = 5
      const hiddenOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
        shouldPauseOperations: true,
        isHidden: true,
      })

      rerender({ opts: hiddenOptions })

      // Become visible
      const visibleOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
        shouldPauseOperations: false,
        isHidden: false,
      })

      rerender({ opts: visibleOptions })

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(mockLocalStorage.setItem).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Game Completion Effect
  // ===========================================================================
  describe('Game Completion Effect', () => {
    it('clears saved state when game becomes complete', async () => {
      const options = createDefaultOptions({
        puzzle: { seed: 'completed-puzzle', difficulty: 'medium' },
        game: {
          board: Array(81).fill(1),
          candidates: new Uint16Array(81),
          history: [],
          isComplete: false,
        },
      })

      const { rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      // Complete the game
      const completedOptions = createDefaultOptions({
        puzzle: { seed: 'completed-puzzle', difficulty: 'medium' },
        game: {
          board: Array(81).fill(1),
          candidates: new Uint16Array(81),
          history: [],
          isComplete: true,
        },
      })

      rerender({ opts: completedOptions })

      // The completion effect runs synchronously on rerender
      await act(async () => {
        // Flush any pending effects
      })

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('sudoku_game_completed-puzzle')
    })

    it('does not clear state when puzzle is null', () => {
      const options = createDefaultOptions({
        puzzle: null,
        game: {
          board: Array(81).fill(1),
          candidates: new Uint16Array(81),
          history: [],
          isComplete: true,
        },
      })

      renderHook(() => useAutoSave(options))

      expect(mockLocalStorage.removeItem).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Function Stability
  // ===========================================================================
  describe('Function Stability', () => {
    it('provides stable function references across rerenders', () => {
      const options = createDefaultOptions()
      const { result, rerender } = renderHook(() => useAutoSave(options))

      const saveGameState1 = result.current.saveGameState
      const clearSavedState1 = result.current.clearSavedState
      const markRestored1 = result.current.markRestored
      const isRestored1 = result.current.isRestored

      rerender()

      // markRestored and isRestored should be stable (useCallback with empty deps)
      expect(result.current.markRestored).toBe(markRestored1)
      expect(result.current.isRestored).toBe(isRestored1)

      // Note: saveGameState and clearSavedState may change due to dependencies
      // but should still work correctly
      expect(typeof result.current.saveGameState).toBe('function')
      expect(typeof result.current.clearSavedState).toBe('function')
    })
  })

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe('Edge Cases', () => {
    it('handles puzzle seed change', async () => {
      const options = createDefaultOptions({
        puzzle: { seed: 'puzzle-1', difficulty: 'easy' },
      })

      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
        result.current.saveGameState()
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'sudoku_game_puzzle-1',
        expect.any(String)
      )

      mockLocalStorage.setItem.mockClear()

      // Change puzzle
      const newOptions = createDefaultOptions({
        puzzle: { seed: 'puzzle-2', difficulty: 'hard' },
      })

      rerender({ opts: newOptions })

      act(() => {
        result.current.saveGameState()
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'sudoku_game_puzzle-2',
        expect.any(String)
      )
    })

    it('handles multiple rapid markRestored calls', () => {
      const options = createDefaultOptions()
      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.markRestored()
        result.current.markRestored()
        result.current.markRestored()
      })

      expect(result.current.isRestored()).toBe(true)
    })

    it('handles unmount during pending save', async () => {
      const options = createDefaultOptions()
      const { result, unmount } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Trigger a pending save
      const newBoard = [...options.game.board]
      newBoard[0] = 5

      // Unmount before timers complete
      unmount()

      // Advance timers - should not throw
      await act(async () => {
        vi.advanceTimersByTime(2000)
      })

      // Test passes if no error is thrown
    })

    it('handles daily puzzle seeds correctly', () => {
      const options = createDefaultOptions({
        puzzle: { seed: 'daily-2024-01-15', difficulty: 'medium' },
      })

      const { result } = renderHook(() => useAutoSave(options))

      act(() => {
        result.current.markRestored()
        result.current.saveGameState()
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'sudoku_game_daily-2024-01-15',
        expect.any(String)
      )
    })
  })

  // ===========================================================================
  // requestIdleCallback Fallback
  // ===========================================================================
  describe('requestIdleCallback Fallback', () => {
    it('uses setTimeout fallback when requestIdleCallback is not available', async () => {
      // Remove requestIdleCallback from window
      const originalRIC = globalThis.requestIdleCallback
      // @ts-expect-error - intentionally removing for test
      delete globalThis.requestIdleCallback

      const options = createDefaultOptions()
      const { result, rerender } = renderHook(
        ({ opts }) => useAutoSave(opts),
        { initialProps: { opts: options } }
      )

      act(() => {
        result.current.markRestored()
      })

      // Trigger change
      const newBoard = [...options.game.board]
      newBoard[0] = 5
      const newOptions = createDefaultOptions({
        game: { ...options.game, board: newBoard },
      })

      rerender({ opts: newOptions })

      // Advance past debounce (500ms) + setTimeout fallback (500ms)
      await act(async () => {
        vi.advanceTimersByTime(1200)
      })

      expect(mockLocalStorage.setItem).toHaveBeenCalled()

      // Restore requestIdleCallback
      globalThis.requestIdleCallback = originalRIC
    })
  })
})
