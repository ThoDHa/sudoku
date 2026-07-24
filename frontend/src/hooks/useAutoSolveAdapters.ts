import { useCallback } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { candidatesToArrays, arraysToCandidates } from '../lib/candidatesUtils'
import {
  TOAST_DURATION_ERROR,
  TOAST_DURATION_FIX_ERROR,
  ERROR_FIX_RESUME_DELAY,
} from '../lib/constants'
import type { UseSudokuGameReturn, Move } from './useSudokuGame'
import type { MoveHighlight } from './useHighlightState'
import type { UnpinpointableErrorInfo } from './useGameModals'

// The shape of the toast/validation message Game owns. Co-located here so the
// adapter signatures can name it without reaching into Game.tsx.
export interface AutoSolveValidationMessage {
  type: 'success' | 'error' | 'info'
  message: string
  action?: { label: string; onClick: () => void }
}

export interface UseAutoSolveAdaptersOptions {
  gameRef: RefObject<UseSudokuGameReturn | null>
  initialBoardRef: RefObject<number[]>

  // Highlight-state callbacks.
  setMoveHighlight: (move: MoveHighlight, index: number) => void
  setDigitHighlight: (digit: number) => void
  clearDigitHighlight: () => void

  // Game state setters.
  setNotesMode: Dispatch<SetStateAction<boolean>>
  setValidationMessage: Dispatch<SetStateAction<AutoSolveValidationMessage | null>>

  // Toast helpers from Game's toast-clear / visibility-aware-timeout hooks.
  // throttledSetValidationMessage skips non-critical success messages while
  // the tab is hidden; scheduleToastClear replaces any pending clearer.
  throttledSetValidationMessage: (message: { type: 'success' | 'error'; message: string }) => void
  scheduleToastClear: (delay: number, onClear: () => void) => void
  visibilityAwareTimeout: (cb: () => void, delay: number) => void

  // Modal state setters (from useGameModals).
  setUnpinpointableErrorInfo: (info: UnpinpointableErrorInfo) => void
  setShowSolutionConfirm: (value: boolean) => void
}

export interface UseAutoSolveAdaptersReturn {
  getBoard: () => number[]
  getCandidates: () => Set<number>[]
  getGivens: () => number[]
  handleApplyMove: (
    newBoard: number[],
    newCandidates: Set<number>[],
    move: Move,
    index: number,
  ) => void
  handleApplyState: (
    board: number[],
    candidates: Set<number>[],
    move: Move | null,
    index: number,
  ) => void
  handleIsComplete: () => boolean
  handleAutoSolveError: (message: string) => void
  handleUnpinpointableError: (message: string, count: number) => void
  handleAutoSolveStatus: (message: string) => void
  handleErrorFixed: (message: string, resumeCallback: () => void) => void
  handleStepNavigate: (move: Move | null) => void
}

// Stable adapter callbacks for useAutoSolve, extracted from Game.tsx. Every
// callback here is wrapped in useCallback with the original deps array; this
// is the second slice of the CODE-6 braid after useGameInput. Behavior is
// identical to the inline implementation that lived in Game.tsx previously.
//
// handleGameComplete (which reads timerControlRef + handleSubmitRef, the
// circular-dep breaker between useSudokuGame's onComplete and handleSubmit)
// stays in Game.tsx because it depends on the same handleSubmit closure it
// re-triggers, so co-locating it here would require passing the refs through
// and gain nothing.
export function useAutoSolveAdapters(
  options: UseAutoSolveAdaptersOptions,
): UseAutoSolveAdaptersReturn {
  const {
    gameRef,
    initialBoardRef,
    setMoveHighlight,
    setDigitHighlight,
    clearDigitHighlight,
    setNotesMode,
    setValidationMessage,
    throttledSetValidationMessage,
    scheduleToastClear,
    visibilityAwareTimeout,
    setUnpinpointableErrorInfo,
    setShowSolutionConfirm,
  } = options

  const getBoard = useCallback(() => gameRef.current?.board ?? [], [gameRef])

  const getCandidates = useCallback(() => {
    const game = gameRef.current
    if (!game) return []
    // Convert Uint16Array to Set<number>[] for legacy API compatibility
    const arrays = candidatesToArrays(game.candidates)
    return arrays.map((arr) => new Set(arr))
  }, [gameRef])

  const getGivens = useCallback(() => initialBoardRef.current, [initialBoardRef])

  const handleApplyMove = useCallback(
    (newBoard: number[], newCandidates: Set<number>[], move: Move, index: number) => {
      const game = gameRef.current
      if (!game) return
      // Convert Set<number>[] back to Uint16Array
      const candidatesArray = newCandidates.map((set) => Array.from(set))
      const uint16Candidates = arraysToCandidates(candidatesArray)
      game.applyExternalMove(newBoard, uint16Candidates, move)
      setMoveHighlight(move, index)

      // Highlight the digit being placed/modified
      if (move.digit && move.digit > 0) {
        setDigitHighlight(move.digit)
      }

      // Show notes mode if it's a candidate operation
      if (move.action === 'eliminate' || move.action === 'candidate') {
        setNotesMode(true)
      } else if (move.action === 'assign' || move.action === 'place') {
        setNotesMode(false)
      }
    },
    [setMoveHighlight, setDigitHighlight, setNotesMode, gameRef],
  )

  const handleApplyState = useCallback(
    (board: number[], candidates: Set<number>[], move: Move | null, index: number) => {
      const game = gameRef.current
      if (!game) return
      // Convert Set<number>[] back to Uint16Array
      const candidatesArray = candidates.map((set) => Array.from(set))
      const uint16Candidates = arraysToCandidates(candidatesArray)
      game.setBoardState(board, uint16Candidates)
      setMoveHighlight(move as MoveHighlight, index)

      // Update digit highlight based on move
      if (move && move.digit && move.digit > 0) {
        setDigitHighlight(move.digit)
      } else {
        clearDigitHighlight()
      }

      // Update notes mode based on move action
      if (move) {
        if (move.action === 'eliminate' || move.action === 'candidate') {
          setNotesMode(true)
        } else if (move.action === 'assign' || move.action === 'place') {
          setNotesMode(false)
        }
      }
    },
    [setMoveHighlight, setDigitHighlight, clearDigitHighlight, setNotesMode, gameRef],
  )

  const handleIsComplete = useCallback(() => gameRef.current?.isComplete ?? false, [gameRef])

  const handleAutoSolveError = useCallback(
    (message: string) => {
      setValidationMessage({ type: 'error', message })
      scheduleToastClear(TOAST_DURATION_ERROR, () => {
        setValidationMessage(null)
      })
    },
    [scheduleToastClear, setValidationMessage],
  )

  const handleUnpinpointableError = useCallback(
    (message: string, count: number) => {
      setUnpinpointableErrorInfo({ message, count })
      setShowSolutionConfirm(true)
    },
    [setUnpinpointableErrorInfo, setShowSolutionConfirm],
  )

  const handleAutoSolveStatus = useCallback(
    (message: string) => {
      throttledSetValidationMessage({ type: 'success', message })
      scheduleToastClear(2000, () => {
        setValidationMessage(null)
      })
    },
    [throttledSetValidationMessage, scheduleToastClear, setValidationMessage],
  )

  const handleErrorFixed = useCallback(
    (message: string, resumeCallback: () => void) => {
      // Show toast for fix-error (longer duration than normal hints)
      setValidationMessage({ type: 'error', message: `Fixed: ${message}` })
      // Clear toast after full duration
      scheduleToastClear(TOAST_DURATION_FIX_ERROR, () => {
        setValidationMessage(null)
      })
      // But resume solving sooner for better UX
      visibilityAwareTimeout(resumeCallback, ERROR_FIX_RESUME_DELAY)
    },
    [visibilityAwareTimeout, scheduleToastClear, setValidationMessage],
  )

  const handleStepNavigate = useCallback(
    (move: Move | null) => {
      // Show toast with move explanation when stepping through autosolve.
      // Toast persists until next step or autosolve stops (no timeout).
      if (move) {
        setValidationMessage({ type: 'success', message: move.explanation })
      } else {
        // Stepped back to initial state
        setValidationMessage({ type: 'success', message: 'Initial state' })
      }
    },
    [setValidationMessage],
  )

  return {
    getBoard,
    getCandidates,
    getGivens,
    handleApplyMove,
    handleApplyState,
    handleIsComplete,
    handleAutoSolveError,
    handleUnpinpointableError,
    handleAutoSolveStatus,
    handleErrorFixed,
    handleStepNavigate,
  }
}
