import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { resolveCompletionAction } from '../lib/completionGate'
import { isValidSolution } from '../lib/validationUtils'
import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import Board from '../components/Board'
import Controls from '../components/Controls'
import History from '../components/History'
import ResultModal from '../components/ResultModal'
import TechniqueModal from '../components/TechniqueModal'
import TechniquesListModal from '../components/TechniquesListModal'
import GameHeader from '../components/GameHeader'
import GameModals from '../components/GameModals'
import GameOverlays from '../components/GameOverlays'
import AboutModal, { useAboutModal } from '../components/AboutModal'
import DailyPromptModal from '../components/DailyPromptModal'
import { PauseOverlayTimer } from '../components/TimerDisplay'
import { type Difficulty } from '../lib/hooks'
import { useTheme } from '../lib/ThemeContext'
import { useGameContext } from '../lib/GameContext'
import { TimerProvider, useTimerControl } from '../lib/TimerContext'
import { useSudokuGame } from '../hooks/useSudokuGame'
import { useAutoSolve } from '../hooks/useAutoSolve'
import { useGameInput } from '../hooks/useGameInput'
import { useAutoSolveAdapters } from '../hooks/useAutoSolveAdapters'
import { useGameActions } from '../hooks/useGameActions'
import { useGamePersistence } from '../hooks/useGamePersistence'
import { usePuzzleLoader } from '../hooks/usePuzzleLoader'
import { useShareConflict } from '../hooks/useShareConflict'
import { useGameKeyboardShortcuts } from '../hooks/useGameKeyboardShortcuts'
import { useDeselectOnOutsideClick } from '../hooks/useDeselectOnOutsideClick'
import { useInProgressGameCheck } from '../hooks/useInProgressGameCheck'
import { useShareActions } from '../hooks/useShareActions'
import { useHints } from '../hooks/useHints'
import { useGameModals } from '../hooks/useGameModals'
import { useBackgroundManagerContext } from '../lib/BackgroundManagerContext'
import { useHighlightState } from '../hooks/useHighlightState'
import type { MoveHighlight } from '../hooks/useHighlightState'
import { useVisibilityAwareTimeout } from '../hooks/useVisibilityAwareTimeout'
import { useToastClearTimer } from '../hooks/useToastClearTimer'
import { useFrozenWhenHidden } from '../hooks/useFrozenWhenHidden'
import { logger } from '../lib/logger'
import { EXTENDED_PAUSE_DELAY, STORAGE_KEYS } from '../lib/constants'
import {
  getAutoSolveSpeed,
  type AutoSolveSpeed,
  AUTO_SOLVE_SPEEDS,
  getHideTimer,
  setHideTimer,
} from '../lib/preferences'

import { cleanupSolver, getDailySeed } from '../lib/solver-service'

import { setShowDailyReminder } from '../lib/preferences'
import { arraysToCandidates, candidatesToArrays } from '../lib/candidatesUtils'
import { restoreHintCounters } from '../lib/savedGameState'
import { resolvePuzzleSetup } from '../lib/puzzleSetup'

/**
 * Inner component that contains all game logic.
 * Must be wrapped by TimerProvider (see Game component below).
 */
function GameContent() {
  const { seed, encoded } = useParams<{ seed?: string; encoded?: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const difficultyParam = searchParams.get('d')
  // Shared progress on a portable seed link: `s` carries the player's board+notes,
  // `t` the elapsed time. Overlaid onto the seed-resolved givens (see loadPuzzle).
  const sharedStateParam = searchParams.get('s')
  const sharedTimeParam = searchParams.get('t')

  const {
    effectiveSeed,
    isEncodedCustom,
    needsDifficultyChoice,
    alreadyCompletedToday,
    completedDailyScore,
  } = resolvePuzzleSetup({ seed, encoded, pathname: location.pathname, difficultyParam })

  // Check if difficulty was provided in URL - if not, we need to show chooser

  // Track if onboarding is complete (as state so it updates when onboarding is dismissed)
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE) !== null,
  )

  // State for difficulty chooser modal
  // Only show immediately if onboarding is already complete; otherwise wait for onboarding to finish
  const [showDifficultyChooser, setShowDifficultyChooser] = useState(
    needsDifficultyChoice && !alreadyCompletedToday && onboardingComplete,
  )
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(
    difficultyParam as Difficulty | null,
  )

  // The effective difficulty - either from URL, user selection, or default
  const difficulty = (
    isEncodedCustom
      ? 'custom'
      : selectedDifficulty ||
        difficultyParam ||
        (effectiveSeed?.startsWith('custom-') ? 'custom' : 'medium')
  ) as Difficulty

  const {
    mode,
    modePreference,
    setMode,
    setModePreference,
    colorTheme,
    setColorTheme,
    fontSize,
    setFontSize,
  } = useTheme()
  const { setGameState } = useGameContext()
  const {
    showOnboarding,
    closeOnboarding: baseCloseOnboarding,
    openAbout,
    showAbout,
    isOnboarding,
  } = useAboutModal()

  // Wrap closeOnboarding to mark onboarding complete and show difficulty chooser (if needed)
  const closeAboutModal = () => {
    baseCloseOnboarding()
    setOnboardingComplete(true)
    if (isOnboarding && needsDifficultyChoice && !alreadyCompletedToday) {
      setShowDifficultyChooser(true)
    }
  }

  const [incorrectCells, setIncorrectCells] = useState<number[]>([])

  // UI state (not game logic)
  // Highlight state is now managed by useHighlightState hook (see CUSTOM HOOKS section)
  const [eraseMode, setEraseMode] = useState(false)
  const [notesMode, setNotesMode] = useState(false)
  const [showResultModal, setShowResultModal] = useState(alreadyCompletedToday) // Show result if already completed today
  const {
    historyOpen,
    techniqueModal,
    techniquesListOpen,
    solveConfirmOpen,
    showClearConfirm,
    showSolutionConfirm,
    unpinpointableErrorInfo,
    isAnyModalOpen,
    setHistoryOpen,
    setTechniqueModal,
    setTechniquesListOpen,
    setSolveConfirmOpen,
    setShowClearConfirm,
    setShowSolutionConfirm,
    setUnpinpointableErrorInfo,
  } = useGameModals()
  const [menuOpen, setMenuOpen] = useState(false)
  const [showDailyPrompt, setShowDailyPrompt] = useState(false)
  const [debugInfoCopied, setDebugInfoCopied] = useState(false)
  const [autoFillUsed, setAutoFillUsed] = useState(false)
  const [autoSolveUsed, setAutoSolveUsed] = useState(false)
  const autoSolveUsedRef = useRef(false) // Ref for immediate access in callbacks
  const [autoSolveStepsUsed, setAutoSolveStepsUsed] = useState(0)
  const [autoSolveErrorsFixed, setAutoSolveErrorsFixed] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [techniqueHintsUsed, setTechniqueHintsUsed] = useState(0)
  const [validationMessage, setValidationMessage] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
    action?: { label: string; onClick: () => void }
  } | null>(null)
  const [autoSolveSpeedState, setAutoSolveSpeedState] =
    useState<AutoSolveSpeed>(getAutoSolveSpeed())
  const [hideTimerState, setHideTimerState] = useState(getHideTimer())

  // Track whether we've restored saved state (to prevent overwriting on initial load)
  const hasRestoredSavedState = useRef(false)
  // Track whether we loaded from a shared URL (to prevent resetGame from wiping shared state)
  const loadedFromSharedUrl = useRef(false)

  // Refs for click-outside detection (deselect cell when clicking outside game interface)
  const boardContainerRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const gameInterfaceRef = useRef<HTMLDivElement>(null) // Entire page container (too wide)

  // ============================================================
  // REFS FOR STABLE CALLBACKS (Performance Optimization)
  // ============================================================
  // These refs allow callbacks to access current state without being recreated
  // when that state changes, which prevents unnecessary re-renders of memoized children.
  const selectedCellRef = useRef<number | null>(null)
  const selectedCellsRef = useRef<Set<number>>(new Set())
  const notesModeRef = useRef(false)
  const eraseModeRef = useRef(false)
  const highlightedDigitRef = useRef<number | null>(null)

  // Refs for hook return values that change frequently
  // These allow callbacks to access current values without dependency array changes
  const autoSolveRef = useRef<ReturnType<typeof useAutoSolve> | null>(null)
  const gameRef = useRef<ReturnType<typeof useSudokuGame> | null>(null)

  // Refs for values needed by stable callbacks passed to hooks
  // These break the circular dependency: handleSubmit needs game, but game.onComplete needs handleSubmit
  const initialBoardRef = useRef<number[]>([])
  const timerControlRef = useRef<typeof timerControl | null>(null)
  const handleSubmitRef = useRef<(() => void) | null>(null)

  // ============================================================
  // SYNC REFS WITH STATE (for stable callbacks)
  // ============================================================
  // CUSTOM HOOKS
  // ============================================================

  // Background manager for coordinating all background operations
  const backgroundManager = useBackgroundManagerContext()

  // Frozen state hook - skips expensive operations when app is hidden
  const { isCurrentlyFrozen, shouldSkipStateUpdate } = useFrozenWhenHidden()

  // Visibility-aware timeout for background-sensitive delays that should pause
  // while the tab is hidden (auto-resume after an error-fix, the debug-copied toast).
  const { setTimeout: visibilityAwareTimeout } = useVisibilityAwareTimeout()

  // A plain (non-visibility-aware) timeout: fires after its delay even if the tab
  // was hidden mid-countdown. The visibility-aware timer cancels on hide and never
  // re-arms, which left toasts stuck (SHARE-2 #1), so toast-clearing uses this.
  const plainToastTimeout = useCallback((cb: () => void, delay: number): (() => void) => {
    const id = window.setTimeout(cb, delay)
    return () => {
      window.clearTimeout(id)
    }
  }, [])

  // Single replaceable toast-clear timer over the shared validationMessage. Every
  // clear (validation, info, and share) goes through this one instance, so
  // scheduling a newer toast cancels the prior pending clearer and a stale timer
  // can never wipe a live toast.
  const scheduleToastClear = useToastClearTimer(plainToastTimeout)

  // Centralized highlight state management with atomic updates
  const {
    selectedCell,
    selectedCells,
    highlightedDigit,
    currentHighlight,
    selectedMoveIndex,
    selectCell,
    deselectCell,
    setDigitHighlight,
    clearDigitHighlight,
    toggleDigitHighlight,
    setMoveHighlight,
    clearMoveHighlight,
    clearAllAndDeselect,
    clearAfterUserCandidateOp,
    clearAfterDigitPlacement,
    clearAfterErase,
    clearAfterDigitToggle,
    clickGivenCell,
    selectMultipleCells,
  } = useHighlightState()

  // ============================================================
  // SYNC REFS WITH STATE (for stable callbacks)
  // ============================================================
  // These effects keep refs in sync with state, allowing callbacks to read
  // current values without having those values in their dependency arrays.
  useEffect(() => {
    selectedCellRef.current = selectedCell
  }, [selectedCell])
  useEffect(() => {
    selectedCellsRef.current = selectedCells
  }, [selectedCells])
  useEffect(() => {
    notesModeRef.current = notesMode
  }, [notesMode])
  useEffect(() => {
    eraseModeRef.current = eraseMode
  }, [eraseMode])
  useEffect(() => {
    highlightedDigitRef.current = highlightedDigit
  }, [highlightedDigit])

  // Deselect the active cell when the user clicks/taps genuine empty space
  // outside the board, controls, and any overlay. See useDeselectOnOutsideClick.
  useDeselectOnOutsideClick({
    selectedCellRef,
    selectedCellsRef,
    deselectCell,
    clearMoveHighlight,
    setEraseMode,
  })

  // Extended background pause - completely suspend operations after 30 seconds hidden
  const [isExtendedPaused, setIsExtendedPaused] = useState(false)

  // Throttle validation messages when hidden to reduce re-renders
  const throttledSetValidationMessage = useCallback(
    (message: { type: 'success' | 'error'; message: string } | null) => {
      if (shouldSkipStateUpdate() && message?.type === 'success') {
        // Skip non-critical success messages when hidden to reduce battery usage
        return
      }
      setValidationMessage(message)
    },
    [shouldSkipStateUpdate],
  )

  // Timer control hook - gets controls without subscribing to elapsedMs updates
  // The actual timer is created by TimerProvider wrapping this component
  const timerControl = useTimerControl()

  // Keep timerControl ref updated for stable callbacks
  timerControlRef.current = timerControl

  // restoreOrPromptSharedState is defined later (it needs loadSavedGameState from
  // the persistence hook below), but usePuzzleLoader must run before useSudokuGame
  // so initialBoard is available. Bridge the ordering with a stable ref wrapper so
  // the loader always invokes the latest version when its fetch effect fires.
  const restoreOrPromptSharedStateRef = useRef<
    (board: number[], candidates: number[][] | null, seed: string) => void
  >(() => {})
  const invokeRestoreOrPromptSharedState = useCallback(
    (board: number[], candidates: number[][] | null, seed: string) => {
      restoreOrPromptSharedStateRef.current(board, candidates, seed)
    },
    [],
  )

  const { loading, error, puzzle, initialBoard, solution, encodedPuzzle } = usePuzzleLoader({
    effectiveSeed,
    isEncodedCustom,
    encoded,
    difficulty,
    sharedStateParam,
    alreadyCompletedToday,
    showDifficultyChooser,
    showOnboarding,
    onboardingComplete,
    backgroundManager,
    hasRestoredSavedState,
    loadedFromSharedUrl,
    restoreOrPromptSharedState: invokeRestoreOrPromptSharedState,
    setIncorrectCells,
    setShowDailyPrompt,
    timerControl,
  })

  useEffect(() => {
    initialBoardRef.current = initialBoard
  }, [initialBoard])

  // ============================================================
  // STABLE CALLBACKS FOR HOOKS (Performance Optimization)
  // ============================================================
  // These callbacks use refs to access current values, so they don't need
  // to be recreated when those values change. This prevents the hooks'
  // internal useMemo from recalculating on every render.

  // Stable onComplete callback for useSudokuGame
  // Uses refs to break circular dependency: handleSubmit needs game, but onComplete is passed to game.
  // handleGameComplete stays in Game (not in useAutoSolveAdapters) because it
  // reads timerControlRef + handleSubmitRef, the circular-dep breaker between
  // useSudokuGame's onComplete and handleSubmit itself.
  const handleGameComplete = useCallback(() => {
    timerControlRef.current?.pauseTimer()
    handleSubmitRef.current?.()
  }, [])

  // Adapter callbacks for useAutoSolve live in useAutoSolveAdapters. The hook
  // takes the gameRef / initialBoardRef refs, the highlight-state callbacks,
  // the validation-message setter, and the toast helpers as inputs and
  // returns the eleven stable callbacks (getBoard, getCandidates, getGivens,
  // handleApplyMove, handleApplyState, handleIsComplete, handleAutoSolveError,
  // handleUnpinpointableError, handleAutoSolveStatus, handleErrorFixed,
  // handleStepNavigate) the auto-solve hook consumes.
  const {
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
  } = useAutoSolveAdapters({
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
  })

  // Game state hook - only initialize after we have the initial board
  const game = useSudokuGame({
    initialBoard: initialBoard.length === 81 ? initialBoard : Array<number>(81).fill(0),
  })

  const { clearSavedGameState, loadSavedGameState, restoredAsCompleteRef } = useGamePersistence({
    puzzle,
    game,
    timerControl,
    backgroundManager,
    autoFillUsed,
    hintsUsed,
    techniqueHintsUsed,
    hasRestoredSavedState,
  })

  // Handle game completion when board is full and valid
  useEffect(() => {
    const action = resolveCompletionAction({
      isComplete: game.isComplete,
      restoredAsComplete: restoredAsCompleteRef.current,
    })
    if (action === 'none') {
      restoredAsCompleteRef.current = false
      return
    }
    if (action === 'show-only') {
      timerControlRef.current?.pauseTimer()
      setShowResultModal(true)
      return
    }
    handleGameComplete()
  }, [game.isComplete, handleGameComplete, restoredAsCompleteRef])

  // Keep game ref updated for stable callbacks
  gameRef.current = game

  // Auto-solve hook - fetches all moves at once and plays them back
  const gamePaused = useMemo(
    () => timerControl.isPausedDueToVisibility || isExtendedPaused,
    [timerControl.isPausedDueToVisibility, isExtendedPaused],
  )

  const autoSolve = useAutoSolve({
    stepDelay: AUTO_SOLVE_SPEEDS[autoSolveSpeedState],
    gamePaused,
    backgroundManager,
    getBoard,
    getCandidates,
    getGivens,
    applyMove: handleApplyMove,
    applyState: handleApplyState,
    isComplete: handleIsComplete,
    onError: handleAutoSolveError,
    onUnpinpointableError: handleUnpinpointableError,
    onStatus: handleAutoSolveStatus,
    onErrorFixed: handleErrorFixed,
    onStepNavigate: handleStepNavigate,
  })

  // Keep autoSolve ref updated for stable callbacks
  autoSolveRef.current = autoSolve

  // Extended background pause logic - suspend all operations after EXTENDED_PAUSE_DELAY hidden
  useEffect(() => {
    if (!backgroundManager.isHidden) {
      // Reset extended pause when visible
      setIsExtendedPaused(false)
      return
    }

    // Set extended pause after EXTENDED_PAUSE_DELAY hidden
    const timeout = setTimeout(() => {
      setIsExtendedPaused(true)
      // Pause auto-solve if running
      if (autoSolve.isAutoSolving) {
        autoSolve.stopAutoSolve()
      }
      // Pause timer
      timerControl.pauseTimer()
    }, EXTENDED_PAUSE_DELAY)

    return () => {
      clearTimeout(timeout)
    }
  }, [backgroundManager.isHidden, autoSolve, timerControl])

  // Unload WASM immediately when page becomes hidden to save ~4MB memory
  // This is more aggressive than waiting for deep pause - any visibility change triggers unload
  useEffect(() => {
    if (backgroundManager.isHidden || backgroundManager.isInDeepPause) {
      cleanupSolver()
    }
  }, [backgroundManager.isHidden, backgroundManager.isInDeepPause])

  // WASM is loaded on-demand when hints/solve are requested (see solver-service.ts getApi())
  // No need to eagerly preload - the solver functions handle initialization automatically

  // Close solve confirmation modal when solving finishes
  useEffect(() => {
    if (solveConfirmOpen && !autoSolve.isFetching && autoSolve.isAutoSolving) {
      // Solution has been fetched, auto-solve is now playing back - close modal
      setSolveConfirmOpen(false)
    }
  }, [solveConfirmOpen, autoSolve.isFetching, autoSolve.isAutoSolving, setSolveConfirmOpen])

  // Check for an existing in-progress game (different seed) and surface the
  // resume-vs-new confirmation. Self-contained in useInProgressGameCheck.
  const {
    showInProgressConfirm,
    existingInProgressGame,
    onResumeExistingGame: handleResumeExistingGame,
    onStartNewGame: handleStartNewGame,
  } = useInProgressGameCheck({
    seed,
    encoded,
    sharedStateParam,
    navigate: (path: string) => void navigate(path),
  })

  const {
    showShareConflict,
    shareHasCurrentGame,
    finalizeSharedUrlLoad,
    handleResumeOwnGame,
    handleStartFromShared,
    restoreOrPromptSharedState,
  } = useShareConflict({
    game,
    timerControl,
    restoredAsCompleteRef,
    hasRestoredSavedState,
    loadedFromSharedUrl,
    alreadyCompletedToday,
    showDifficultyChooser,
    sharedTimeParam,
    encoded,
    loadSavedGameState,
    navigate: (path: string) => void navigate(path),
  })

  // Handlers for daily prompt modal
  const handleGoToDaily = useCallback(() => {
    setShowDailyPrompt(false)
    const { seed } = getDailySeed()
    // Navigate without difficulty to show the difficulty chooser
    void navigate(`/${seed}`)
  }, [navigate])

  const handleContinuePractice = useCallback(() => {
    setShowDailyPrompt(false)
  }, [])

  const handleDontShowDailyPromptAgain = useCallback(() => {
    setShowDailyReminder(false)
  }, [])

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  // Publish the latest restoreOrPromptSharedState (from useShareConflict) to the
  // ref usePuzzleLoader holds, so its fetch effect (which runs before the share
  // hook) always invokes the current version.
  restoreOrPromptSharedStateRef.current = restoreOrPromptSharedState

  // ============================================================
  // GAME ACTIONS (using hooks)
  // ============================================================

  // All user-triggered actions (clear / restart / auto-fill / check-notes /
  // validate / submit / solve / check-and-fix / copy-debug-info /
  // feature-request) live in useGameActions. The hook borrows the setters and
  // refs Game owns and returns the eleven handlers wired into the GameHeader,
  // GameModals, and keyboard-shortcut bindings. handleSubmit is exposed so
  // Game can store it in handleSubmitRef.current for useSudokuGame's
  // onComplete chain.
  const {
    handleClearAll,
    handleRestart,
    autoFillNotes,
    handleCheckNotes,
    handleValidate,
    handleSubmit,
    handleSolve,
    handleCheckAndFix,
    handleCopyDebugInfo,
    handleFeatureRequest,
  } = useGameActions({
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
  })

  // Next-move hint resolution and the two hint-button handlers live in
  // useHints; resetHintTracking is returned so the input handlers below can
  // invalidate the cache after any user action that changes the board.
  const { handleNext, handleTechniqueHint, resetHintTracking, hintLoading, techniqueHintLoading } =
    useHints({
      game,
      gameRef,
      initialBoard,
      clearAllAndDeselect,
      setMoveHighlight,
      clearMoveHighlight,
      scheduleToastClear,
      setValidationMessage,
      setHintsUsed,
      setTechniqueHintsUsed,
      setUnpinpointableErrorInfo,
      setShowSolutionConfirm,
      setTechniqueModal,
    })

  // All cell-click, digit-entry, keyboard-cell-change, drag, mode-toggle,
  // undo, and redo handlers live in useGameInput. The hook takes the mirror
  // refs and the stable highlight-state callbacks as inputs and returns the
  // stable handlers Cell/Board/Controls memoization depends on. Behavior is
  // identical to the inline implementation that lived here previously; the
  // hook preserves every deps array exactly.
  const {
    handleCellClick,
    handleCellChange,
    handleDigitInput,
    handleCellSelectMultiple,
    handleDragEnd,
    handleNotesToggle,
    handleEraseMode,
    handleUndo,
    handleRedo,
  } = useGameInput({
    selectedCellRef,
    selectedCellsRef,
    notesModeRef,
    eraseModeRef,
    highlightedDigitRef,
    gameRef,
    autoSolveRef,
    selectCell,
    deselectCell,
    clearAllAndDeselect,
    clickGivenCell,
    selectMultipleCells,
    toggleDigitHighlight,
    clearAfterUserCandidateOp,
    clearAfterDigitPlacement,
    clearAfterErase,
    clearAfterDigitToggle,
    clearDigitHighlight,
    clearMoveHighlight,
    setNotesMode,
    setEraseMode,
    setAutoSolveStepsUsed,
    setAutoSolveErrorsFixed,
    resetHintTracking,
    isExtendedPaused,
    setIsExtendedPaused,
  })

  // Keep handleSubmit ref updated so onComplete can call it. handleSubmit is
  // returned by useGameActions above; the ref is the circular-dep breaker
  // between useSudokuGame's onComplete and handleSubmit itself.
  handleSubmitRef.current = () => void handleSubmit()

  // Share-link actions live in useShareActions; only the two public handlers
  // are consumed by the GameHeader share buttons.
  const { onSharePuzzle: handleSharePuzzle, onShareState: handleShareState } = useShareActions({
    isEncodedCustom,
    seed: puzzle?.seed,
    difficulty,
    givens: initialBoard,
    board: game.board,
    candidates: candidatesToArrays(game.candidates),
    elapsedMs: timerControl.getElapsedMs(),
    scheduleToastClear,
    setValidationMessage,
  })

  // ============================================================
  // EFFECTS
  // ============================================================

  // Global keyboard shortcuts
  useGameKeyboardShortcuts({
    handleUndo,
    handleRedo,
    handleNext: () => void handleNext(),
    handleValidate,
    clearAllAndDeselect,
    setNotesMode,
    isModalOpen: showResultModal || isAnyModalOpen || showShareConflict || menuOpen,
  })

  // Sync game state to global context for header
  useEffect(() => {
    if (!loading && puzzle) {
      setGameState({
        isPlaying: true,
        difficulty,
        elapsedMs: timerControl.getElapsedMs(), // Static snapshot, not updated every second
        historyCount: game.history.length,
        isComplete: game.isComplete,
        onHint: null,
        onHistory: () => {
          setHistoryOpen(true)
        },
        onAutoFillNotes: autoFillNotes,
      })
    }
    return () => {
      setGameState(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback; we only want a static snapshot at mount
  }, [
    loading,
    puzzle,
    difficulty,
    game.history.length,
    game.isComplete,
    autoFillNotes,
    setGameState,
  ])

  // Clear highlights and toast when auto-solve stops so History shows the summary, not last move
  useEffect(() => {
    if (!autoSolve.isAutoSolving) {
      clearDigitHighlight()
      clearMoveHighlight()
      setValidationMessage(null) // Clear any persisting autosolve toast
    }
  }, [autoSolve.isAutoSolving, clearDigitHighlight, clearMoveHighlight])

  // Track auto-solve steps and errors fixed when auto-solve stops
  useEffect(() => {
    if (!autoSolve.isAutoSolving && autoSolve.lastCompletedSteps > 0) {
      setAutoSolveStepsUsed(autoSolve.lastCompletedSteps)
      // Count fix-error and fix-conflict moves in history (errors fixed during autosolve)
      const errorsFixed = game.history.filter(
        (move) => move.action === 'fix-error' || move.action === 'fix-conflict',
      ).length
      setAutoSolveErrorsFixed(errorsFixed)
    }
  }, [autoSolve.isAutoSolving, autoSolve.lastCompletedSteps, game.history])

  // Reset restoration flags when puzzle seed changes
  // This ensures clean state for new games when switching difficulties/modes
  useEffect(() => {
    if (puzzle?.seed) {
      hasRestoredSavedState.current = false
      // Do NOT reset loadedFromSharedUrl here. loadPuzzle owns it per load (false
      // by default, true only when it applies shared state). Resetting it here
      // raced ahead of the restore effect below and wiped the shared board back
      // to bare givens on a share-link open (SHARE-2).
      logger.debug('[RESTORATION FLAG RESET] Seed changed to:', puzzle.seed, 'Flag reset to false')
    }
  }, [puzzle?.seed])

  // Reset game state when initialBoard changes (new puzzle loaded) and restore saved state if available
  useEffect(() => {
    if (initialBoard.length === 81 && puzzle) {
      // Set restoration flag early so useSudokuGame doesn't overwrite restored state
      hasRestoredSavedState.current = true

      // Skip if we already loaded from a shared URL (state is already restored).
      // Finalizing here also consumes the share params; safe because
      // hasRestoredSavedState is now set, so the re-triggered loadPuzzle early-returns.
      if (loadedFromSharedUrl.current) {
        finalizeSharedUrlLoad()
        return
      }

      // Check for saved state for this puzzle
      const savedState = loadSavedGameState(puzzle.seed)

      if (savedState) {
        // Restore saved state
        const restoredCandidates = arraysToCandidates(savedState.candidates)
        restoredAsCompleteRef.current = isValidSolution(savedState.board)
        game.restoreState(savedState.board, restoredCandidates, savedState.history)
        timerControl.setElapsedMs(savedState.elapsedMs)
        // Start timer (resume from saved time) - only if puzzle is playable
        if (!alreadyCompletedToday && !showDifficultyChooser) {
          timerControl.startTimer()
        }
        setAutoFillUsed(savedState.autoFillUsed)
        const restoredHints = restoreHintCounters(savedState)
        setHintsUsed(restoredHints.hintsUsed)
        setTechniqueHintsUsed(restoredHints.techniqueHintsUsed)
      } else {
        // No saved state - initialize board from givens
        game.setBoardState(initialBoard, new Uint16Array(81))
        // Start timer for new game - only if puzzle is playable
        if (!alreadyCompletedToday && !showDifficultyChooser) {
          timerControl.startTimer()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- game.restoreState, resetAllGameState, and timerControl.setElapsedMs are stable callbacks. We intentionally only trigger this when initialBoard or puzzle changes to prevent re-initialization loops.
  }, [initialBoard, puzzle, loadSavedGameState])

  // Handle BFCache restore (back button navigation)
  // When page is restored from BFCache, React hooks don't re-run, so we need to
  // manually reload state from localStorage to get the latest saved state
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && puzzle) {
        logger.debug('[BFCACHE] Page restored from BFCache, reloading state from localStorage')
        const savedState = loadSavedGameState(puzzle.seed)
        if (savedState) {
          const restoredCandidates = arraysToCandidates(savedState.candidates)
          restoredAsCompleteRef.current = isValidSolution(savedState.board)
          game.restoreState(savedState.board, restoredCandidates, savedState.history)
          timerControl.setElapsedMs(savedState.elapsedMs)
          setAutoFillUsed(savedState.autoFillUsed)
          const restoredHints = restoreHintCounters(savedState)
          setHintsUsed(restoredHints.hintsUsed)
          setTechniqueHintsUsed(restoredHints.techniqueHintsUsed)
        }
      }
    }

    window.addEventListener('pageshow', handlePageShow)
    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [puzzle, loadSavedGameState, game, timerControl, restoredAsCompleteRef])

  // NOTE: We do NOT auto-clear saved games on completion anymore!
  // - Daily games: Keep saved state until next day (cleared by date change logic)
  // - Practice games: Keep saved state until user starts a new practice game
  // This allows users to return to completed games and see their final state

  // Pause timer when game is complete
  useEffect(() => {
    if (game.isComplete) {
      timerControl.pauseTimer()
    }
  }, [game.isComplete, timerControl])

  // ============================================================
  // RENDER
  // ============================================================

  // When app is hidden/frozen, render a minimal component to prevent battery drain
  // This avoids React reconciliation on the complex component tree
  if (isCurrentlyFrozen && !loading && !error) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        {/* Minimal frozen state - no animations, no complex components */}
        <div className="text-foreground-muted text-sm">Paused</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-board-border-light border-t-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background">
        <p className="text-error-text">{error}</p>
      </div>
    )
  }

  return (
    <div
      ref={gameInterfaceRef}
      className="flex h-full flex-col overflow-hidden bg-background text-foreground"
    >
      {/* Game Header */}
      <GameHeader
        difficulty={difficulty}
        seed={seed}
        hideTimer={hideTimerState}
        isComplete={game.isComplete}
        historyCount={game.history.length}
        hasUnsavedProgress={game.history.length > 0 && !game.isComplete}
        isAutoSolving={autoSolve.isAutoSolving}
        isFetchingSolution={autoSolve.isFetching}
        isPaused={autoSolve.isPaused}
        autoSolveSpeed={autoSolveSpeedState}
        onTogglePause={autoSolve.togglePause}
        onStopAutoSolve={autoSolve.stopAutoSolve}
        onSetAutoSolveSpeed={setAutoSolveSpeedState}
        onTechniqueHint={() => void handleTechniqueHint()}
        techniqueHintDisabled={false}
        techniqueHintLoading={techniqueHintLoading}
        onHint={() => void handleNext()}
        hintLoading={hintLoading}
        hintDisabled={false}
        onHistoryOpen={() => {
          setHistoryOpen(true)
        }}
        onShowResult={() => {
          setShowResultModal(true)
        }}
        onSharePuzzle={() => void handleSharePuzzle()}
        onShareState={() => void handleShareState()}
        onAutoFillNotes={autoFillNotes}
        onCheckNotes={handleCheckNotes}
        onClearNotes={() => {
          game.clearCandidates()
          clearMoveHighlight()
        }}
        onValidate={handleValidate}
        onSolve={() => {
          setSolveConfirmOpen(true)
        }}
        onClearAll={() => {
          setShowClearConfirm(true)
        }}
        onTechniquesList={() => {
          setTechniquesListOpen(true)
        }}
        onAbout={openAbout}
        onCopyDebugInfo={() => void handleCopyDebugInfo()}
        onFeatureRequest={handleFeatureRequest}
        debugInfoCopied={debugInfoCopied}
        mode={mode}
        modePreference={modePreference}
        colorTheme={colorTheme}
        fontSize={fontSize}
        hideTimerState={hideTimerState}
        onSetModePreference={setModePreference}
        onSetMode={setMode}
        onSetColorTheme={setColorTheme}
        onSetFontSize={setFontSize}
        onToggleHideTimer={() => {
          const newValue = !hideTimerState
          setHideTimerState(newValue)
          setHideTimer(newValue)
        }}
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
      />

      {/* Validation message toast */}
      {validationMessage && (
        <div
          className={`validation-message fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 ${
            validationMessage.type === 'success'
              ? 'bg-accent text-btn-active-text'
              : validationMessage.type === 'info'
                ? 'bg-accent text-btn-active-text'
                : 'bg-error-text text-white'
          }`}
        >
          <span>{validationMessage.message}</span>
          {validationMessage.action && (
            <button
              onClick={() => {
                validationMessage.action?.onClick()
                setValidationMessage(null)
              }}
              className="underline font-medium hover:opacity-80 transition-opacity"
            >
              {validationMessage.action.label}
            </button>
          )}
        </div>
      )}

      <div className="game-background game-area flex-1" data-testid="game-background">
        {/* Game container - sizes based on available height and width */}
        {/* Deselection now handled by global document listener for consistency */}
        <div ref={boardRef} className="game-container flex flex-col items-center">
          {/* Board container with pause overlay */}
          <div ref={boardContainerRef} className="relative aspect-square w-full">
            <Board
              board={game.board}
              initialBoard={initialBoard}
              candidates={game.candidates}
              candidatesVersion={game.candidatesVersion}
              selectedCell={selectedCell}
              selectedCells={selectedCells}
              highlightedDigit={highlightedDigit}
              highlight={currentHighlight}
              onCellClick={handleCellClick}
              onCellChange={handleCellChange}
              onCellSelectMultiple={handleCellSelectMultiple}
              onDragEnd={handleDragEnd}
              incorrectCells={incorrectCells}
              className={timerControl.isPausedDueToVisibility && !game.isComplete ? 'blur-md' : ''}
            />

            {/* Pause overlay - minimal overlay when board is blurred.
                Button element so the click-to-resume is keyboard-accessible
                (Enter/Space activates it); the content is non-interactive. */}
            {timerControl.isPausedDueToVisibility && !game.isComplete && (
              <button
                type="button"
                aria-label="Resume game"
                className="absolute inset-0 flex flex-col items-center justify-center rounded-xl z-20 cursor-pointer"
                onClick={() => {
                  // Clicking the overlay brings focus back, which auto-resumes the timer
                  window.focus()
                }}
              >
                <div className="bg-background/80 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-lg border border-border-light">
                  <div className="flex flex-col items-center text-center">
                    <div className="text-4xl mb-3">
                      <svg
                        className="w-12 h-12 text-accent"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Game Paused</h3>
                    <p className="text-sm text-foreground-muted mb-3">Click anywhere to continue</p>
                    <PauseOverlayTimer />
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Controls - same width as board, scales with container */}
          <div className="w-full flex-shrink-0">
            <Controls
              notesMode={notesMode}
              onNotesToggle={handleNotesToggle}
              onDigit={handleDigitInput}
              onEraseMode={handleEraseMode}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={
                autoSolve.isAutoSolving ? autoSolve.isPaused && autoSolve.canStepBack : game.canUndo
              }
              canRedo={
                autoSolve.isAutoSolving
                  ? autoSolve.isPaused && autoSolve.canStepForward
                  : game.canRedo
              }
              eraseMode={eraseMode}
              digitCounts={game.digitCounts}
              highlightedDigit={highlightedDigit}
              isComplete={game.isComplete}
              isSolving={autoSolve.isAutoSolving}
            />
          </div>
        </div>
      </div>

      <History
        moves={game.history}
        isOpen={historyOpen}
        onClose={() => {
          setHistoryOpen(false)
        }}
        onMoveClick={(move, index) => {
          const moveHighlight: MoveHighlight = move
          if (!moveHighlight.highlights || moveHighlight.highlights.primary.length === 0) {
            const eliminations = moveHighlight.eliminations?.map((e) => ({
              row: e.row,
              col: e.col,
            }))
            moveHighlight.highlights = {
              primary: moveHighlight.targets,
              ...(eliminations !== undefined ? { secondary: eliminations } : {}),
            }
          }
          setMoveHighlight(moveHighlight, index)
        }}
        onTechniqueClick={(technique) => {
          setTechniqueModal(technique)
        }}
        selectedMoveIndex={selectedMoveIndex}
        autoSolveStepsUsed={autoSolveStepsUsed}
        autoSolveErrorsFixed={autoSolveErrorsFixed}
        isComplete={game.isComplete}
        autoFillUsed={autoFillUsed}
      />

      <ResultModal
        isOpen={showResultModal}
        onClose={() => {
          setShowResultModal(false)
        }}
        seed={completedDailyScore?.seed || puzzle?.seed || ''}
        difficulty={(completedDailyScore?.difficulty as Difficulty) || difficulty}
        timeMs={completedDailyScore?.timeMs || timerControl.getElapsedMs()}
        hintsUsed={completedDailyScore?.hintsUsed || hintsUsed}
        techniqueHintsUsed={completedDailyScore?.techniqueHintsUsed || techniqueHintsUsed}
        autoFillUsed={completedDailyScore?.autoFillUsed || autoFillUsed}
        autoSolveUsed={completedDailyScore?.autoSolveUsed || autoSolveUsed}
        encodedPuzzle={completedDailyScore?.encodedPuzzle || encodedPuzzle}
      />

      <TechniqueModal
        isOpen={techniqueModal !== null}
        onClose={() => {
          setTechniqueModal(null)
          clearMoveHighlight()
        }}
        technique={techniqueModal}
      />

      <TechniquesListModal
        isOpen={techniquesListOpen}
        onClose={() => {
          setTechniquesListOpen(false)
        }}
      />

      {/* Confirmation Dialogs */}
      <GameModals
        solveConfirmOpen={solveConfirmOpen}
        setSolveConfirmOpen={setSolveConfirmOpen}
        onSolve={() => void handleSolve()}
        isSolving={autoSolve.isFetching}
        showClearConfirm={showClearConfirm}
        setShowClearConfirm={setShowClearConfirm}
        isComplete={game.isComplete}
        onRestart={handleRestart}
        onClearAll={handleClearAll}
        showSolutionConfirm={showSolutionConfirm}
        setShowSolutionConfirm={setShowSolutionConfirm}
        unpinpointableErrorMessage={unpinpointableErrorInfo?.message || null}
        onCheckAndFix={() => void handleCheckAndFix()}
      />

      {/* Onboarding Modal - shown for first-time users */}
      <AboutModal isOpen={showAbout} onClose={closeAboutModal} isOnboarding={isOnboarding} />

      {/* Daily Prompt Modal - encourages users to try daily puzzle when playing practice mode */}
      <DailyPromptModal
        open={showDailyPrompt}
        onGoToDaily={handleGoToDaily}
        onContinuePractice={handleContinuePractice}
        onDontShowAgain={handleDontShowDailyPromptAgain}
      />

      <GameOverlays
        showInProgressConfirm={showInProgressConfirm}
        existingInProgressGame={existingInProgressGame}
        onStartNewGame={handleStartNewGame}
        onResumeExistingGame={handleResumeExistingGame}
        showShareConflict={showShareConflict}
        shareHasCurrentGame={shareHasCurrentGame}
        onResumeOwnGame={handleResumeOwnGame}
        onStartFromShared={handleStartFromShared}
        showDifficultyChooser={showDifficultyChooser}
        seed={seed || ''}
        onSelectDifficulty={setSelectedDifficulty}
        onCloseDifficultyChooser={() => {
          setShowDifficultyChooser(false)
        }}
        pathname={location.pathname}
      />
    </div>
  )
}

/**
 * Main Game component - wraps GameContent with TimerProvider.
 *
 * This separation is required because:
 * 1. GameContent uses useTimerControl() which requires TimerProvider as an ancestor
 * 2. TimerProvider creates the actual timer instance and splits it into two contexts
 * 3. Only TimerDisplay subscribes to the rapidly-updating display context
 * 4. Game/GameContent subscribe only to the stable control context (no re-renders on tick)
 */
export default function Game() {
  const { seed } = useParams()
  return (
    <TimerProvider pauseOnHidden={true}>
      <GameContent key={seed} />
    </TimerProvider>
  )
}
