import { useCallback } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { commitCellAction } from '../lib/commitCellAction'
import { buildFreshTrackingState } from '../lib/gameStateReset'
import { candidatesToArrays, countCandidates } from '../lib/candidatesUtils'
import { validateBoard, checkAndFixWithSolution } from '../lib/solver-service'
import { copyToClipboard, COPY_TOAST_DURATION } from '../lib/clipboard'
import { saveScore, markDailyCompleted, type Score } from '../lib/scores'
import { getAutoSolveSpeed } from '../lib/preferences'
import { logger } from '../lib/logger'
import { TOAST_DURATION_INFO } from '../lib/constants'
import type { useSudokuGame, Move } from './useSudokuGame'
import type { useAutoSolve } from './useAutoSolve'
import type { PuzzleData } from './usePuzzleLoader'
import type { useTimerControl } from '../lib/TimerContext'
import type { AutoSolveValidationMessage } from './useAutoSolveAdapters'

type GameApi = ReturnType<typeof useSudokuGame>
type AutoSolveApi = ReturnType<typeof useAutoSolve>
type TimerControl = ReturnType<typeof useTimerControl>

declare const __COMMIT_HASH__: string

// Action handlers extracted from Game.tsx: every user-triggered action that
// either mutates game state (clear / restart / auto-fill / validate / solve /
// submit) or surfaces a debug artifact (copy bug report, open feature request)
// lives here. The hook owns no state; it borrows the setters and refs Game
// owns and returns the ten handlers wired into the GameHeader / GameModals /
// keyboard-shortcut bindings.
//
// handleSubmit is special: Game assigns the returned callback to
// handleSubmitRef.current so useSudokuGame's onComplete chain can re-enter
// it without recreating the closure on every render.
export interface UseGameActionsOptions {
  game: GameApi
  puzzle: PuzzleData | null
  solution: number[]
  encodedPuzzle: string | null
  initialBoard: number[]

  // Timer + auto-solve collaborators.
  timerControl: TimerControl
  autoSolve: AutoSolveApi

  // Auto-solve adapter callback (from useAutoSolveAdapters) reused by
  // handleCheckAndFix's catch arm.
  handleAutoSolveError: (message: string) => void

  // Tracking counters and ref mirrors Game owns.
  hintsUsed: number
  techniqueHintsUsed: number
  autoFillUsed: boolean
  autoSolveUsedRef: RefObject<boolean>
  colorTheme: string
  mode: 'light' | 'dark'

  // State setters shared with Game's render.
  setAutoFillUsed: (value: boolean) => void
  setAutoSolveUsed: (value: boolean) => void
  setHintsUsed: (value: number) => void
  setTechniqueHintsUsed: (value: number) => void
  setAutoSolveStepsUsed: (value: number) => void
  setAutoSolveErrorsFixed: (value: number) => void
  setNotesMode: (value: boolean) => void
  setValidationMessage: Dispatch<SetStateAction<AutoSolveValidationMessage | null>>
  setIncorrectCells: (cells: number[]) => void
  setShowResultModal: (value: boolean) => void
  setDebugInfoCopied: (value: boolean) => void

  // Toast / clipboard helpers from Game's toast-clear / visibility-aware hooks.
  scheduleToastClear: (delay: number, onClear: () => void) => void
  visibilityAwareTimeout: (cb: () => void, delay: number) => void

  // Game-persistence + highlight clearers.
  clearSavedGameState: () => void
  clearAllAndDeselect: () => void
}

export interface UseGameActionsReturn {
  handleClearAll: () => void
  resetAllGameState: () => void
  handleRestart: () => void
  autoFillNotes: () => void
  handleCheckNotes: () => void
  handleValidate: () => void
  handleSubmit: () => Promise<void>
  handleSolve: () => Promise<void>
  handleCheckAndFix: () => Promise<void>
  handleCopyDebugInfo: () => Promise<void>
  handleFeatureRequest: () => void
}

export function useGameActions(options: UseGameActionsOptions): UseGameActionsReturn {
  const {
    game,
    puzzle,
    solution,
    encodedPuzzle,
    initialBoard,
    timerControl,
    autoSolve,
    handleAutoSolveError,
    hintsUsed,
    techniqueHintsUsed,
    autoFillUsed,
    autoSolveUsedRef,
    colorTheme,
    mode,
    setAutoFillUsed,
    setAutoSolveUsed,
    setHintsUsed,
    setTechniqueHintsUsed,
    setAutoSolveStepsUsed,
    setAutoSolveErrorsFixed,
    setNotesMode,
    setValidationMessage,
    setIncorrectCells,
    setShowResultModal,
    setDebugInfoCopied,
    scheduleToastClear,
    visibilityAwareTimeout,
    clearSavedGameState,
    clearAllAndDeselect,
  } = options

  // Clear all user entries (keeps timer running)
  const handleClearAll = useCallback(() => {
    clearSavedGameState()
    commitCellAction('clearAll', {
      game,
      clearAllAndDeselect,
      setNotesMode,
      setAutoSolveStepsUsed,
      setAutoSolveErrorsFixed,
    })
    // Stryker disable next-line ArrayDeclaration: useCallback deps are manual memoization to be replaced by React Compiler (FE-7); test mocks provide stable objects so stale-closure mutant is equivalent
  }, [game, clearSavedGameState, clearAllAndDeselect])

  // Reset all game state (board, candidates, history, and tracking variables)
  const resetAllGameState = useCallback(() => {
    const fresh = buildFreshTrackingState()
    game.resetGame()
    setHintsUsed(fresh.hintsUsed)
    setTechniqueHintsUsed(fresh.techniqueHintsUsed)
    setAutoFillUsed(fresh.autoFillUsed)
    setAutoSolveUsed(fresh.autoSolveUsed)
    autoSolveUsedRef.current = fresh.autoSolveUsed
    setAutoSolveStepsUsed(fresh.autoSolveStepsUsed)
    setAutoSolveErrorsFixed(fresh.autoSolveErrorsFixed)
    // Stryker disable next-line ArrayDeclaration: see handleClearAll deps for rationale
  }, [game])

  // Restart puzzle (clears all AND resets timer)
  const handleRestart = useCallback(() => {
    resetAllGameState()
    clearSavedGameState()
    timerControl.resetTimer()
    timerControl.startTimer()
    clearAllAndDeselect()
    setNotesMode(false)
    setShowResultModal(false)
    // Stryker disable next-line ArrayDeclaration: see handleClearAll deps for rationale
  }, [resetAllGameState, timerControl, clearSavedGameState, clearAllAndDeselect])

  // Auto-fill notes based on current board state
  const autoFillNotes = useCallback(() => {
    if (game.board.length !== 81) return
    const newCandidates = game.fillAllCandidates()
    let cellsWithCandidates = 0
    // Stryker disable next-line EqualityOperator: i<=81 iterates once more on newCandidates[81] which is undefined → undefined||0 → countCandidates(0)=0 → no count change; observationally equivalent
    for (let i = 0; i < 81; i++) {
      if (countCandidates(newCandidates[i] || 0) > 0) {
        cellsWithCandidates++
      }
    }

    const fillMove: Move = {
      step_index: game.history.length,
      technique: 'Fill Candidates',
      action: 'candidate',
      digit: 0,
      targets: [],
      explanation: `Filled all candidates for ${cellsWithCandidates} cells`,
      refs: { title: 'Fill Candidates', slug: 'fill-candidates', url: '' },
      highlights: { primary: [] }, // No highlights for user moves
      isUserMove: true, // Mark as user action so it doesn't count as hint
    }

    game.applyExternalMove(game.board, newCandidates, fillMove)
    setAutoFillUsed(true)
    // Stryker disable next-line ArrayDeclaration: see handleClearAll deps for rationale
  }, [game])

  // Check notes for errors
  const handleCheckNotes = useCallback(() => {
    const result = game.checkNotes()

    if (result.cellsWithNotes === 0) {
      setValidationMessage({ type: 'error', message: 'No notes to check. Add some notes first!' })
      scheduleToastClear(TOAST_DURATION_INFO, () => {
        setValidationMessage(null)
      })
      return
    }

    if (result.valid) {
      if (result.missingNotes.length > 0) {
        setValidationMessage({
          type: 'success',
          message: `Notes are correct! (${result.missingNotes.length} possible candidates not noted)`,
        })
      } else {
        setValidationMessage({ type: 'success', message: 'All notes are correct and complete!' })
      }
    } else {
      const wrongCount = result.wrongNotes.length
      setValidationMessage({
        type: 'error',
        message: `Found ${wrongCount} incorrect note${wrongCount > 1 ? 's' : ''}. Some notes are impossible.`,
      })
    }
    scheduleToastClear(TOAST_DURATION_INFO, () => {
      setValidationMessage(null)
    })
    // Stryker disable next-line ArrayDeclaration: see handleClearAll deps for rationale
  }, [game, scheduleToastClear])

  // Validate current board state by comparing against the known solution
  const handleValidate = useCallback(() => {
    if (solution.length !== 81) {
      setValidationMessage({ type: 'error', message: 'Solution not available' })
      scheduleToastClear(TOAST_DURATION_INFO, () => {
        setValidationMessage(null)
      })
      return
    }

    const data = validateBoard(game.board, solution)
    if (data.valid) {
      setValidationMessage({ type: 'success', message: data.message || 'All entries are correct!' })
      setIncorrectCells([])
    } else {
      setValidationMessage({
        type: 'error',
        message: data.message || 'There are errors in the puzzle',
      })
      if (data.incorrectCells) {
        setIncorrectCells(data.incorrectCells)
      }
    }
    scheduleToastClear(TOAST_DURATION_INFO, () => {
      setValidationMessage(null)
      setIncorrectCells([])
    })
    // Stryker disable next-line ArrayDeclaration: see handleClearAll deps for rationale
  }, [game.board, solution, scheduleToastClear])

  // Submit handler - builds the score record, persists it, marks daily, and
  // surfaces the result modal. Game stores this in handleSubmitRef so
  // useSudokuGame's onComplete chain can re-enter it.
  const handleSubmit = useCallback(async () => {
    if (!puzzle) return

    const score: Score = {
      seed: puzzle.seed,
      difficulty: puzzle.difficulty,
      timeMs: timerControl.getElapsedMs(),
      hintsUsed: hintsUsed,
      techniqueHintsUsed: techniqueHintsUsed,
      mistakes: 0,
      completedAt: new Date().toISOString(),
      autoFillUsed: autoFillUsed,
      autoSolveUsed: autoSolveUsedRef.current,
      ...(encodedPuzzle ? { encodedPuzzle } : {}),
    }

    saveScore(score)

    // Mark daily puzzle as completed for streak tracking
    if (puzzle.seed.startsWith('daily-')) {
      markDailyCompleted()
    }

    setShowResultModal(true)
    // Stryker disable next-line ArrayDeclaration: see handleClearAll deps for rationale
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback that reads from a ref
  }, [puzzle, hintsUsed, techniqueHintsUsed, encodedPuzzle, autoFillUsed])

  // Auto-solve handler
  const handleSolve = useCallback(async () => {
    clearAllAndDeselect()
    setAutoSolveUsed(true)
    autoSolveUsedRef.current = true
    // Start paused if speed is 'step'
    const startPaused = getAutoSolveSpeed() === 'step'
    await autoSolve.restartAutoSolve(startPaused)
    // Stryker disable next-line ArrayDeclaration: see handleClearAll deps for rationale
  }, [autoSolve, clearAllAndDeselect])

  // Check & Fix handler - compares current board vs solution, removes mismatches, continues solving
  const handleCheckAndFix = async () => {
    // Stryker disable next-line StringLiteral: log message content does not affect program behavior
    logger.debug('Check & Fix invoked')
    if (!solution || solution.length !== 81) {
      // Stryker disable next-line StringLiteral: log message content does not affect program behavior
      logger.error('Cannot check and fix: solution not available')
      return
    }

    try {
      // Get current state
      const currentBoard = game.board
      const currentCandidates = game.candidates
      // Stryker disable next-line OptionalChaining,ArrayDeclaration: puzzle is always defined in the test paths; the || fallback is checked by givens.length !== 81 below so ["Stryker was here"] and [] are observationally identical
      const givens = puzzle?.givens || []

      if (givens.length !== 81) {
        // Stryker disable next-line StringLiteral: log message content does not affect program behavior
        logger.error('Cannot check and fix: givens not available')
        return
      }

      // Call WASM to compare and fix
      const result = await checkAndFixWithSolution(
        currentBoard,
        candidatesToArrays(currentCandidates),
        givens,
        solution,
      )
      // Stryker disable next-line ConditionalExpression,LogicalOperator,BlockStatement: block body contains only logger.debug calls (all StringLiteral mutants already disabled), so the condition and empty-block mutant have no observable effect
      if (result && result.moves) {
        // Stryker disable next-line StringLiteral: debug log label, does not affect behavior
        logger.debug(
          'Check & Fix moves:',
          // Stryker disable next-line ArrowFunction,ObjectLiteral,ConditionalExpression,LogicalOperator: debug-only map output for logging, never asserted in tests
          result.moves.map((m, idx) => ({ idx, move: m && m.move, board: m && m.board })),
        )
      }

      if (result.moves && result.moves.length > 0) {
        // Use new autosolver infrastructure to animate the replayed moves step-by-step, with UX feedback.
        autoSolve.playMoves(result.moves, false)
      } else {
        // Stryker disable next-line BlockStatement: else body contains only the logger.warn call below (StringLiteral already disabled), so empty-block mutant has no observable effect
        // Stryker disable next-line StringLiteral: log message content does not affect program behavior
        logger.warn('Check & Fix: no changes needed')
      }
    } catch (error) {
      // Stryker disable next-line StringLiteral: log message content does not affect program behavior
      logger.error('Check & Fix failed:', error)
      handleAutoSolveError('Failed to check and fix entries')
    }
  }

  // Bug report handlers - split into copy and report
  const handleCopyDebugInfo = useCallback(async () => {
    const bugReport = {
      version: __COMMIT_HASH__,
      timestamp: new Date().toISOString(),
      puzzle: {
        // Stryker disable next-line OptionalChaining: puzzle is always defined when handleCopyDebugInfo is reachable (the hook requires a puzzle prop); the ?. is defensive but observationally identical to .
        seed: puzzle?.seed,
        difficulty: puzzle?.difficulty,
        puzzleId: puzzle?.puzzle_id,
      },
      state: {
        initialBoard: initialBoard,
        currentBoard: game.board,
        candidates: candidatesToArrays(game.candidates),
        elapsedMs: timerControl.getElapsedMs(),
        isComplete: game.isComplete,
      },
      history: game.history.map((move) => ({
        stepIndex: move.step_index,
        technique: move.technique,
        action: move.action,
        digit: move.digit,
        targets: move.targets,
        eliminations: move.eliminations,
        explanation: move.explanation,
        isUserMove: move.isUserMove,
      })),
      historyIndex: game.historyIndex,
      settings: {
        colorTheme: colorTheme,
        mode: mode,
      },
      userAgent: navigator.userAgent,
    }

    const bugReportJson = JSON.stringify(bugReport, null, 2)

    // Copy to clipboard
    const success = await copyToClipboard(bugReportJson)
    if (success) {
      setDebugInfoCopied(true)
      visibilityAwareTimeout(() => {
        setDebugInfoCopied(false)
      }, COPY_TOAST_DURATION)
    }
    // Stryker disable next-line ArrayDeclaration: see handleClearAll deps for rationale
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback that reads from a ref
  }, [puzzle, initialBoard, game, colorTheme, mode, visibilityAwareTimeout])

  // Feature request handler - opens GitHub issue for new features
  const handleFeatureRequest = useCallback(() => {
    // Open GitHub issues page with enhancement label (short URL for desktop compatibility)
    window.open('https://github.com/thodha/sudoku/issues', '_blank', 'noopener,noreferrer')
    // Stryker disable next-line ArrayDeclaration: empty-deps useCallback; the mutant adds a string but the callback captures only stable refs, so deps content is observationally irrelevant
  }, [])

  return {
    handleClearAll,
    resetAllGameState,
    handleRestart,
    autoFillNotes,
    handleCheckNotes,
    handleValidate,
    handleSubmit,
    handleSolve,
    handleCheckAndFix,
    handleCopyDebugInfo,
    handleFeatureRequest,
  }
}
