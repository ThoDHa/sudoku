import { useEffect, useRef, useCallback } from 'react'
import { STORAGE_KEYS } from '../lib/constants'
import { getAutoSaveEnabled } from '../lib/gameSettings'
import { candidatesToArrays } from '../lib/candidatesUtils'
import type { Move } from './useSudokuGame'
import { logger } from '../lib/logger'

/**
 * Saved game state structure for localStorage
 */
export interface SavedGameState {
  board: number[]
  candidates: number[][] // Serialized from Uint16Array
  elapsedMs: number
  history: Move[]
  autoFillUsed: boolean
  savedAt: number // timestamp
  difficulty: string // difficulty level for resume display
}

/**
 * Game state required for auto-save
 */
export interface AutoSaveGameState {
  board: number[]
  candidates: Uint16Array
  history: Move[]
  isComplete: boolean
}

/**
 * Options for useAutoSave hook
 */
export interface UseAutoSaveOptions {
  /** The current puzzle data */
  puzzle: { seed: string; difficulty: string } | null
  /** Current game state */
  game: AutoSaveGameState
  /** Current elapsed time in ms */
  elapsedMs: number
  /** Whether auto-fill was used */
  autoFillUsed: boolean
  /** Whether the background manager says we should pause operations */
  shouldPauseOperations: boolean
  /** Whether the app is hidden */
  isHidden: boolean
}

/**
 * Get storage key for a puzzle seed
 */
export function getStorageKey(puzzleSeed: string): string {
  return `${STORAGE_KEYS.GAME_STATE_PREFIX}${puzzleSeed}`
}

/**
 * Load saved game state from localStorage
 */
export function loadSavedGameState(puzzleSeed: string): SavedGameState | null {
  const storageKey = getStorageKey(puzzleSeed)
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return null
    
    const parsed = JSON.parse(saved) as SavedGameState
    // Validate the saved state
    if (parsed.board?.length === 81 && parsed.candidates?.length === 81) {
      return parsed
    }
  } catch (e) {
    logger.warn('Failed to load saved game state:', e)
  }
  return null
}

/**
 * Clear saved game state from localStorage
 */
export function clearSavedGameState(puzzleSeed: string): void {
  const storageKey = getStorageKey(puzzleSeed)
  try {
    localStorage.removeItem(storageKey)
  } catch (e) {
    logger.warn('Failed to clear saved game state:', e)
  }
}

/**
 * Hook for managing auto-save of game state to localStorage
 * 
 * Features:
 * - Debounced saves to avoid excessive writes
 * - Uses requestIdleCallback for better battery performance
 * - Pauses saving when app is hidden
 * - Saves immediately when returning from hidden state if there are unsaved changes
 */
export function useAutoSave(options: UseAutoSaveOptions) {
  const {
    puzzle,
    game,
    elapsedMs,
    autoFillUsed,
    shouldPauseOperations,
    isHidden,
  } = options

  // Track whether we've restored saved state (to prevent overwriting on initial load)
  const hasRestoredSavedState = useRef(false)
  // Track if there are unsaved changes when backgrounded
  const hasUnsavedChanges = useRef(false)
  // Track the last time we were hidden
  const wasHiddenRef = useRef(false)

  // Mark as restored (call this after restoring state in the parent component)
  const markRestored = useCallback(() => {
    hasRestoredSavedState.current = true
  }, [])

  // Check if state has been restored
  const isRestored = useCallback(() => hasRestoredSavedState.current, [])

  // Save game state to localStorage
  const saveGameState = useCallback(() => {
    if (!puzzle || game.isComplete || !hasRestoredSavedState.current) return
    
    const storageKey = getStorageKey(puzzle.seed)
    const savedState: SavedGameState = {
      board: game.board,
      candidates: candidatesToArrays(game.candidates),
      elapsedMs,
      history: game.history,
      autoFillUsed,
      savedAt: Date.now(),
      difficulty: puzzle.difficulty,
    }
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedState))
    } catch (e) {
      logger.warn('Failed to save game state:', e)
    }
  }, [puzzle, game.board, game.candidates, game.history, game.isComplete, elapsedMs, autoFillUsed])

  // Clear saved state for current puzzle
  const clearCurrentSavedState = useCallback(() => {
    if (!puzzle) return
    clearSavedGameState(puzzle.seed)
  }, [puzzle])

  // Auto-save when board or candidates change (but not when hidden)
  // Enhanced with requestIdleCallback for better battery performance
  useEffect(() => {
    if (!puzzle || !hasRestoredSavedState.current || game.isComplete || !getAutoSaveEnabled()) return

    // Don't save when app is hidden to reduce battery usage
    if (shouldPauseOperations) {
      hasUnsavedChanges.current = true
      return
    }

    // Use requestIdleCallback when available for better battery performance
    const scheduleAutoSave = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          if (!shouldPauseOperations) {
            saveGameState()
            hasUnsavedChanges.current = false
          }
        }, { timeout: 1000 })
      } else {
        // Fallback to setTimeout for older browsers
        setTimeout(() => {
          if (!shouldPauseOperations) {
            saveGameState()
            hasUnsavedChanges.current = false
          }
        }, 500)
      }
    }

    // Debounce saves to avoid excessive localStorage writes
    const timeoutId = setTimeout(scheduleAutoSave, 500)
    return () => clearTimeout(timeoutId)
  }, [game.board, game.candidates, game.history, puzzle, game.isComplete, saveGameState, shouldPauseOperations])

  // Save when returning from background if there are unsaved changes
  useEffect(() => {
    const wasHidden = wasHiddenRef.current
    const isNowVisible = !isHidden

    wasHiddenRef.current = isHidden

    // If we just became visible and had unsaved changes, save immediately
    if (wasHidden && isNowVisible && hasUnsavedChanges.current && getAutoSaveEnabled()) {
      saveGameState()
      hasUnsavedChanges.current = false
    }
  }, [isHidden, saveGameState])

  // Clear saved state when puzzle is completed
  useEffect(() => {
    if (game.isComplete && puzzle) {
      clearCurrentSavedState()
    }
  }, [game.isComplete, puzzle, clearCurrentSavedState])

  return {
    saveGameState,
    clearSavedState: clearCurrentSavedState,
    markRestored,
    isRestored,
  }
}

// Re-export utilities for loading saved state
export { arraysToCandidates } from '../lib/candidatesUtils'
