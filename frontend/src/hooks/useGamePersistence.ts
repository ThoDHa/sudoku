import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { logger } from '../lib/logger'
import { STORAGE_KEYS, TOTAL_CELLS } from '../lib/constants'
import { shouldSuppressAutoSave } from '../lib/autoSaveGuard'
import { shouldAllowStaleSave } from '../lib/autoSaveSeedGuard'
import { getAutoSaveEnabled, clearOtherGamesForMode } from '../lib/gameSettings'
import { validateSeed, extractSeedFromStorageKey } from '../lib/seedValidation'
import { buildSavedState, type SavedGameState } from '../lib/savedGameState'
import { candidatesToArrays } from '../lib/candidatesUtils'
import type { UseSudokuGameReturn } from './useSudokuGame'
import type { useBackgroundManager } from './useBackgroundManager'
import type { useTimerControl } from '../lib/TimerContext'
import type { PuzzleData } from './usePuzzleLoader'

type TimerControl = ReturnType<typeof useTimerControl>
type BackgroundManager = ReturnType<typeof useBackgroundManager>

export interface UseGamePersistenceOptions {
  /** The currently loaded puzzle, or null before the first puzzle resolves. */
  puzzle: PuzzleData | null
  /** Core game state hook (board, candidates, history, isComplete). */
  game: UseSudokuGameReturn
  /** Timer control surface for reading/writing elapsed time on save and restore. */
  timerControl: TimerControl
  /** Background/visibility manager driving the "don't save while hidden" guard. */
  backgroundManager: BackgroundManager
  /** Tracking flags serialized into each save. */
  autoFillUsed: boolean
  hintsUsed: number
  techniqueHintsUsed: number
  /**
   * Set to true once the initial-state restore effect has applied saved state for
   * the current puzzle. Auto-save is suppressed until this flips true, so the
   * first restore cannot be clobbered by a debounced write over partial state.
   */
  hasRestoredSavedState: RefObject<boolean>
}

export interface UseGamePersistenceReturn {
  /** Build a save snapshot and write it to localStorage immediately. */
  saveGameState: () => void
  /** Remove the saved state for the current puzzle's seed. */
  clearSavedGameState: () => void
  /** Read and validate the saved state for a seed, or null if absent/corrupt. */
  loadSavedGameState: (puzzleSeed: string) => SavedGameState | null
  /**
   * True when the most recently restored save held a solved board. Consumed by
   * the completion handler to detect a "completed then reopened" scenario. The
   * restore orchestration in Game.tsx writes this; the hook owns the storage.
   */
  restoredAsCompleteRef: RefObject<boolean>
}

// Length of value when it is an array, otherwise undefined. Lets the corruption
// log report observed lengths without casting the unknown parsed payload.
function arrayLengthOf(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined
}

// Narrow an unknown JSON.parse result into a SavedGameState whose board is a
// length-81 number[] and candidates a length-81 array, so a malformed
// localStorage entry fails here and falls through to the corruption log rather
// than being trusted as typed data downstream.
function isValidSavedGameState(value: unknown): value is SavedGameState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { board?: unknown; candidates?: unknown }
  return (
    Array.isArray(v.board) &&
    v.board.length === TOTAL_CELLS &&
    v.board.every((n) => typeof n === 'number') &&
    Array.isArray(v.candidates) &&
    v.candidates.length === TOTAL_CELLS
  )
}

/**
 * Owns localStorage persistence for an in-progress game: the storage primitives
 * (save / clear / load), the seed-guarded debounced auto-save, the beforeunload
 * flush, the save-on-complete, and the visibility-aware catch-up save. The two
 * refs that other modules need to read or write (`restoredAsCompleteRef` here,
 * `hasRestoredSavedState` as input) cross the boundary explicitly so the hook
 * never hides state that the restore orchestration depends on.
 */
export function useGamePersistence({
  puzzle,
  game,
  timerControl,
  backgroundManager,
  autoFillUsed,
  hintsUsed,
  techniqueHintsUsed,
  hasRestoredSavedState,
}: UseGamePersistenceOptions): UseGamePersistenceReturn {
  // isComplete at execution time, not closure time. The debounced save reads
  // this so a save that fires after completion records the completion flag even
  // if the React state update has not propagated into the effect closure.
  const isCompleteRef = useRef(false)
  // Active puzzle seed at execution time. Lets a stale debounced save detect
  // that the user has moved on to another puzzle and reject the write.
  const currentSeedRef = useRef<string | null>(null)
  // Tracks whether the latest change was skipped because the app was hidden, so
  // the visibility-flip effect can flush exactly once.
  const hasUnsavedChanges = useRef(false)
  // One-render-behind mirror of backgroundManager.isHidden for the catch-up.
  const wasHiddenRef = useRef(false)
  // Ensures the save-on-complete effect fires exactly once per completion.
  const hasSavedOnCompleteRef = useRef(false)
  // Set by the restore orchestration when a restored save is already solved.
  const restoredAsCompleteRef = useRef(false)

  const getStorageKey = useCallback((puzzleSeed: string) => {
    const validation = validateSeed(puzzleSeed)
    if (!validation.valid) {
      throw new Error(`Cannot create storage key for invalid seed: ${validation.error}`)
    }
    return `${STORAGE_KEYS.GAME_STATE_PREFIX}${validation.seed}`
  }, [])

  const saveGameState = useCallback(() => {
    if (!puzzle || !hasRestoredSavedState.current) return

    clearOtherGamesForMode(puzzle.seed)

    const storageKey = getStorageKey(puzzle.seed)
    const savedState: SavedGameState = buildSavedState({
      board: game.board,
      candidates: candidatesToArrays(game.candidates),
      elapsedMs: timerControl.getElapsedMs(),
      history: game.history,
      autoFillUsed,
      difficulty: puzzle.difficulty,
      isComplete: isCompleteRef.current,
      hintsUsed,
      techniqueHintsUsed,
    })

    try {
      localStorage.setItem(storageKey, JSON.stringify(savedState))
    } catch (e) {
      logger.warn('Failed to save game state:', e)
    }
  }, [
    puzzle,
    game.board,
    game.candidates,
    game.history,
    autoFillUsed,
    hintsUsed,
    techniqueHintsUsed,
    getStorageKey,
  ])

  const clearSavedGameState = useCallback(() => {
    if (!puzzle) return
    const storageKey = getStorageKey(puzzle.seed)
    try {
      localStorage.removeItem(storageKey)
    } catch (e) {
      logger.warn('Failed to clear saved game state:', e)
    }
  }, [puzzle, getStorageKey])

  const loadSavedGameState = useCallback(
    (puzzleSeed: string): SavedGameState | null => {
      try {
        // Resolve the storage key inside the try so an invalid seed honors the
        // declared SavedGameState | null contract (returns null + logs) rather
        // than throwing out of loadSavedGameState.
        const storageKey = getStorageKey(puzzleSeed)
        const saved = localStorage.getItem(storageKey)
        if (!saved) return null

        const parsed: unknown = JSON.parse(saved)
        const extractedSeed = extractSeedFromStorageKey(storageKey)

        if (!extractedSeed.valid) {
          logger.error(
            `[STORAGE ERROR] Cannot load game with invalid seed: ${puzzleSeed} (stored seed: ${extractedSeed.seed}, error: ${extractedSeed.error})`,
          )
          return null
        }

        if (isValidSavedGameState(parsed)) {
          return parsed
        }

        const partial = parsed as { board?: unknown; candidates?: unknown } | null
        logger.warn(
          `[STORAGE ERROR] Corrupted saved state for seed: ${extractedSeed.seed} - board: ${arrayLengthOf(partial?.board)}, candidates: ${arrayLengthOf(partial?.candidates)}`,
        )
        return null
      } catch (e) {
        logger.error(`[STORAGE ERROR] Failed to load saved game for seed: ${puzzleSeed}`, e)
        return null
      }
    },
    [getStorageKey],
  )

  // Keep isCompleteRef in sync with game.isComplete for use in debounced callbacks
  useEffect(() => {
    isCompleteRef.current = game.isComplete
  }, [game.isComplete])

  // Keep currentSeedRef in sync with the active puzzle seed so a fire-time
  // guard inside the debounced auto-save can reject stale writes.
  useEffect(() => {
    currentSeedRef.current = puzzle ? puzzle.seed : null
  }, [puzzle])

  // Auto-save game state when board or candidates change (but not when hidden)
  // Enhanced with requestIdleCallback for better battery performance
  useEffect(() => {
    if (
      shouldSuppressAutoSave({
        hasPuzzle: !!puzzle,
        hasRestoredSavedState: hasRestoredSavedState.current,
        isComplete: game.isComplete,
        autoSaveEnabled: getAutoSaveEnabled(),
      })
    )
      return

    // Don't save when app is hidden to reduce battery usage
    if (backgroundManager.shouldPauseOperations) {
      hasUnsavedChanges.current = true
      return
    }

    // Use requestIdleCallback when available for better battery performance
    const scheduledSeed = puzzle ? puzzle.seed : null
    let idleHandle: number | null = null
    let innerTimeoutId: ReturnType<typeof setTimeout> | null = null

    const scheduleAutoSave = () => {
      if ('requestIdleCallback' in window) {
        idleHandle = requestIdleCallback(
          () => {
            idleHandle = null
            if (
              !backgroundManager.shouldPauseOperations &&
              shouldAllowStaleSave({
                scheduledSeed,
                currentSeed: currentSeedRef.current,
              })
            ) {
              saveGameState()
              hasUnsavedChanges.current = false
            }
          },
          { timeout: 1000 },
        )
      } else {
        // Fallback to setTimeout for older browsers
        innerTimeoutId = setTimeout(() => {
          innerTimeoutId = null
          if (
            !backgroundManager.shouldPauseOperations &&
            shouldAllowStaleSave({
              scheduledSeed,
              currentSeed: currentSeedRef.current,
            })
          ) {
            saveGameState()
            hasUnsavedChanges.current = false
          }
        }, 500)
      }
    }

    // Debounce saves to avoid excessive localStorage writes
    const timeoutId = setTimeout(scheduleAutoSave, 500)
    return () => {
      clearTimeout(timeoutId)
      if (idleHandle !== null) {
        cancelIdleCallback(idleHandle)
        idleHandle = null
      }
      if (innerTimeoutId !== null) {
        clearTimeout(innerTimeoutId)
        innerTimeoutId = null
      }
    }
  }, [
    game.board,
    game.candidates,
    game.history,
    puzzle,
    game.isComplete,
    saveGameState,
    backgroundManager.shouldPauseOperations,
    hasRestoredSavedState,
  ])

  // Save when returning from background if there are unsaved changes
  useEffect(() => {
    const wasHidden = wasHiddenRef.current
    const isNowVisible = !backgroundManager.isHidden

    wasHiddenRef.current = backgroundManager.isHidden

    // If we just became visible and had unsaved changes, save immediately
    if (wasHidden && isNowVisible && hasUnsavedChanges.current && getAutoSaveEnabled()) {
      saveGameState()
      hasUnsavedChanges.current = false
    }
  }, [backgroundManager.isHidden, saveGameState])

  // Save game state before page unloads (browser close, refresh, navigate away)
  // This ensures timer accuracy even if the user closes the browser suddenly
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (
        puzzle &&
        !shouldSuppressAutoSave({
          hasPuzzle: true,
          hasRestoredSavedState: hasRestoredSavedState.current,
          isComplete: game.isComplete,
          autoSaveEnabled: getAutoSaveEnabled(),
        })
      ) {
        // Synchronous save - must complete before page unloads
        const storageKey = `${STORAGE_KEYS.GAME_STATE_PREFIX}${puzzle.seed}`
        // Pass isComplete from the ref (not game.isComplete) so this save site
        // matches saveGameState: a beforeunload save that drops the completion
        // flag would overwrite a completion-marked autosave on close/refresh,
        // and the resumed game would incorrectly show as in-progress.
        const savedState: SavedGameState = buildSavedState({
          board: game.board,
          candidates: candidatesToArrays(game.candidates),
          elapsedMs: timerControl.getElapsedMs(),
          history: game.history,
          autoFillUsed,
          difficulty: puzzle.difficulty,
          isComplete: isCompleteRef.current,
          hintsUsed,
          techniqueHintsUsed,
        })
        try {
          localStorage.setItem(storageKey, JSON.stringify(savedState))
        } catch {
          // Can't do much here - page is closing
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [
    puzzle,
    game.isComplete,
    game.board,
    game.candidates,
    game.history,
    autoFillUsed,
    hintsUsed,
    techniqueHintsUsed,
    timerControl,
    hasRestoredSavedState,
  ])

  // Immediate save when puzzle is completed (vanquish delay demon!)
  // Saves game result instantly for correct tracking of completions
  useEffect(() => {
    if (game.isComplete && hasRestoredSavedState.current && !hasSavedOnCompleteRef.current) {
      saveGameState()
      hasSavedOnCompleteRef.current = true
    }
    // Reset if a new game starts
    if (!game.isComplete) {
      hasSavedOnCompleteRef.current = false
    }
  }, [game.isComplete, saveGameState, hasRestoredSavedState])

  return { saveGameState, clearSavedGameState, loadSavedGameState, restoredAsCompleteRef }
}
