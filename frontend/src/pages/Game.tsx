import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import Board from '../components/Board'
import Controls from '../components/Controls'
import History from '../components/History'
import ResultModal from '../components/ResultModal'
import TechniqueModal from '../components/TechniqueModal'
import TechniquesListModal from '../components/TechniquesListModal'
import GameHeader from '../components/GameHeader'
import GameModals from '../components/GameModals'
import AboutModal, { useAboutModal } from '../components/AboutModal'
import DailyPromptModal from '../components/DailyPromptModal'
import DifficultyGrid from '../components/DifficultyGrid'
import { PauseOverlayTimer } from '../components/TimerDisplay'
import { Difficulty } from '../lib/hooks'
import { useTheme } from '../lib/ThemeContext'
import { useGameContext } from '../lib/GameContext'
import { TimerProvider, useTimerControl } from '../lib/TimerContext'
import { useSudokuGame } from '../hooks/useSudokuGame'
import { useAutoSolve } from '../hooks/useAutoSolve'
import { useBackgroundManagerContext } from '../lib/BackgroundManagerContext'
import { useHighlightState } from '../hooks/useHighlightState'
import type { MoveHighlight } from '../hooks/useHighlightState'
import { useVisibilityAwareTimeout } from '../hooks/useVisibilityAwareTimeout'
import { useFrozenWhenHidden } from '../hooks/useFrozenWhenHidden'
import type { Move } from '../hooks/useSudokuGame'
import {
  TOAST_DURATION_INFO,
  TOAST_DURATION_ERROR,
  TOAST_DURATION_FIX_ERROR,
  ERROR_FIX_RESUME_DELAY,
  EXTENDED_PAUSE_DELAY,
  STORAGE_KEYS,
} from '../lib/constants'
import { getAutoSolveSpeed, AutoSolveSpeed, AUTO_SOLVE_SPEEDS, getHideTimer, setHideTimer } from '../lib/preferences'
import { getAutoSaveEnabled, getMostRecentGame, clearInProgressGame, clearOtherGamesForMode, type SavedGameInfo } from '../lib/gameSettings'
import { validateBoard, validateCustomPuzzle, findNextMove, getPuzzle, cleanupSolver, checkAndFixWithSolution } from '../lib/solver-service'
import { copyToClipboard, COPY_TOAST_DURATION } from '../lib/clipboard'

import { saveScore, markDailyCompleted, isTodayCompleted, getTodayUTC, getScores, type Score } from '../lib/scores'
import { shouldShowDailyPrompt, markDailyPromptShown } from '../lib/dailyPrompt'
import { getGameMode } from '../lib/gameSettings'
import { setShowDailyReminder } from '../lib/preferences'
import { decodePuzzle, encodePuzzle, decodePuzzleWithState, encodePuzzleWithState } from '../lib/puzzleEncoding'
import { candidatesToArrays, arraysToCandidates, countCandidates } from '../lib/candidatesUtils'

// Type for saved game state in localStorage
interface SavedGameState {
  board: number[]
  candidates: number[][] // Serialized from Set<number>[]
  elapsedMs: number
  history: Move[]
  autoFillUsed: boolean
  savedAt: number // timestamp
  difficulty: string // difficulty level for resume display
  isComplete?: boolean // Whether the game was completed
}

interface PuzzleData {
  puzzle_id: string
  seed: string
  difficulty: string
  givens: number[]
  solution: number[]
}

/**
 * Generate a unique signature for a hint move to detect duplicates.
 * Used to avoid counting the same hint multiple times.
 */
function getHintSignature(move: { technique: string; action: string; digit: number; targets: { row: number; col: number }[] }): string {
  return `${move.technique}-${move.action}-${move.digit}-${JSON.stringify(move.targets)}`
}

/**
 * Format technique name for display (convert slug to title case)
 */
function formatTechniqueName(technique: string): string {
  return technique
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Inner component that contains all game logic.
 * Must be wrapped by TimerProvider (see Game component below).
 */
function GameContent() {
  const { seed, encoded } = useParams<{ seed?: string; encoded?: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  
  // For E2E test routes, generate a practice seed if none provided
  const isTestRoute = ['/hints-test', '/gameplay-test', '/digit-entry-test', '/clear-test'].includes(location.pathname)
  const difficultyParam = searchParams.get('d')
  const effectiveSeed = seed || (isTestRoute && difficultyParam ? `practice-test-${difficultyParam}` : undefined)
  
  // Determine if this is an encoded custom puzzle (from /c/:encoded route)
  const isEncodedCustom = location.pathname.startsWith('/c/') && encoded
  
  // Check if difficulty was provided in URL - if not, we need to show chooser
  const needsDifficultyChoice = !difficultyParam && !isEncodedCustom && !effectiveSeed?.startsWith('custom-') && !effectiveSeed?.startsWith('practice-')
  
  // Check if this is today's daily puzzle and user already completed it
  const isTodaysDailyPuzzle = effectiveSeed === `daily-${getTodayUTC()}`
  const alreadyCompletedToday = isTodaysDailyPuzzle && isTodayCompleted()
  
  // Get the completed score for today's daily if already completed
  const completedDailyScore = alreadyCompletedToday 
    ? getScores().find(s => s.seed === effectiveSeed)
    : null
  
  // Track if onboarding is complete (as state so it updates when onboarding is dismissed)
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE) !== null
  )
  
  // State for difficulty chooser modal
  // Only show immediately if onboarding is already complete; otherwise wait for onboarding to finish
  const [showDifficultyChooser, setShowDifficultyChooser] = useState(
    needsDifficultyChoice && !alreadyCompletedToday && onboardingComplete
  )
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(
    difficultyParam as Difficulty | null
  )
  
  // The effective difficulty - either from URL, user selection, or default
  const difficulty = (
    isEncodedCustom ? 'custom' :
    selectedDifficulty || difficultyParam || (effectiveSeed?.startsWith('custom-') ? 'custom' : 'medium')
  ) as Difficulty
  
  
  const { mode, modePreference, setMode, setModePreference, colorTheme, setColorTheme, fontSize, setFontSize } = useTheme()
  const { setGameState } = useGameContext()
  const { showOnboarding, closeOnboarding: baseCloseOnboarding, openAbout, showAbout, isOnboarding } = useAboutModal()
  
  // Wrap closeOnboarding to mark onboarding complete and show difficulty chooser (if needed)
  const closeAboutModal = () => {
    baseCloseOnboarding()
    setOnboardingComplete(true)
    if (isOnboarding && needsDifficultyChoice && !alreadyCompletedToday) {
      setShowDifficultyChooser(true)
    }
  }
  
  // Store the encoded string for sharing custom puzzles
  const [encodedPuzzle, setEncodedPuzzle] = useState<string | null>(encoded || null)

  // Puzzle loading state
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null)
  const [initialBoard, setInitialBoard] = useState<number[]>([])
  const [solution, setSolution] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [incorrectCells, setIncorrectCells] = useState<number[]>([])

  // UI state (not game logic)
  // Highlight state is now managed by useHighlightState hook (see CUSTOM HOOKS section)
  const [eraseMode, setEraseMode] = useState(false)
  const [notesMode, setNotesMode] = useState(false)
  const [showResultModal, setShowResultModal] = useState(alreadyCompletedToday) // Show result if already completed today
  const [historyOpen, setHistoryOpen] = useState(false)
  const [techniqueModal, setTechniqueModal] = useState<{ title: string; slug: string } | null>(null)
  const [techniquesListOpen, setTechniquesListOpen] = useState(false)
  const [solveConfirmOpen, setSolveConfirmOpen] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showSolutionConfirm, setShowSolutionConfirm] = useState(false)
  const [showInProgressConfirm, setShowInProgressConfirm] = useState(false)
  const [existingInProgressGame, setExistingInProgressGame] = useState<SavedGameInfo | null>(null)
  const [showDailyPrompt, setShowDailyPrompt] = useState(false)
  const [unpinpointableErrorInfo, setUnpinpointableErrorInfo] = useState<{ message: string; count: number } | null>(null)
  const [bugReportCopied, setBugReportCopied] = useState(false)
  const [autoFillUsed, setAutoFillUsed] = useState(false)
  const [autoSolveUsed, setAutoSolveUsed] = useState(false)
  const autoSolveUsedRef = useRef(false)  // Ref for immediate access in callbacks
  const [autoSolveStepsUsed, setAutoSolveStepsUsed] = useState(0)
  const [autoSolveErrorsFixed, setAutoSolveErrorsFixed] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [techniqueHintsUsed, setTechniqueHintsUsed] = useState(0)
  const [hintLoading, setHintLoading] = useState(false) // Loading spinner for hint button
  const [techniqueHintLoading, setTechniqueHintLoading] = useState(false) // Loading spinner for technique hint button
  const [validationMessage, setValidationMessage] = useState<{ 
    type: 'success' | 'error' | 'info'
    message: string
    action?: { label: string; onClick: () => void }
  } | null>(null)
  const [autoSolveSpeedState, setAutoSolveSpeedState] = useState<AutoSolveSpeed>(getAutoSolveSpeed())
  const [hideTimerState, setHideTimerState] = useState(getHideTimer())

  // Track whether we've restored saved state (to prevent overwriting on initial load)
  const hasRestoredSavedState = useRef(false)
  // Track whether we loaded from a shared URL (to prevent resetGame from wiping shared state)
  const loadedFromSharedUrl = useRef(false)
  // Track isComplete at execution time (to prevent race condition with debounced saves)
  const isCompleteRef = useRef(false)
  // Guard to prevent concurrent hint requests (ref is more reliable than state for this)
  const hintInProgress = useRef(false)
  // Track last hint shown to avoid counting duplicate hints
  const lastTechniqueHintRef = useRef<string | null>(null)
  const lastRegularHintRef = useRef<string | null>(null)
  // Track if there are unsaved changes when backgrounded
  const hasUnsavedChanges = useRef(false)
  // Track the last time we were hidden
  const wasHiddenRef = useRef(false)
  
  // Refs for click-outside detection (deselect cell when clicking outside game interface)
  const boardContainerRef = useRef<HTMLDivElement>(null)
  const controlsContainerRef = useRef<HTMLDivElement>(null)
  const gameInterfaceRef = useRef<HTMLDivElement>(null) // Entire page container (too wide)
  const gameContentRef = useRef<HTMLDivElement>(null) // Just the actual game content (board + controls)
  
  // ============================================================
  // REFS FOR STABLE CALLBACKS (Performance Optimization)
  // ============================================================
  // These refs allow callbacks to access current state without being recreated
  // when that state changes, which prevents unnecessary re-renders of memoized children.
  const selectedCellRef = useRef<number | null>(null)
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
  // CUSTOM HOOKS
  // ============================================================

  // Background manager for coordinating all background operations
  const backgroundManager = useBackgroundManagerContext()

  // Frozen state hook - skips expensive operations when app is hidden
  const { isCurrentlyFrozen, shouldSkipStateUpdate } = useFrozenWhenHidden()

  // Visibility-aware timeouts for toast messages - cancelled on background
  const { setTimeout: visibilityAwareTimeout } = useVisibilityAwareTimeout()

  // Centralized highlight state management with atomic updates
  // This replaces the old separate useState calls and useHighlightManager
  // All state updates are now atomic, preventing race conditions on mobile
  const {
    selectedCell,
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
    clearOnModeChange,
    clearAfterDigitToggle,
    clickGivenCell,
  } = useHighlightState()

  // ============================================================
  // SYNC REFS WITH STATE (for stable callbacks)
  // ============================================================
  // These effects keep refs in sync with state, allowing callbacks to read
  // current values without having those values in their dependency arrays.
  useEffect(() => { selectedCellRef.current = selectedCell }, [selectedCell])
  useEffect(() => { notesModeRef.current = notesMode }, [notesMode])
  useEffect(() => { eraseModeRef.current = eraseMode }, [eraseMode])
  useEffect(() => { highlightedDigitRef.current = highlightedDigit }, [highlightedDigit])
  useEffect(() => { initialBoardRef.current = initialBoard }, [initialBoard])

  // ============================================================
  // CLICK OUTSIDE TO DESELECT (UX Enhancement)
  // ============================================================
  // When user clicks/taps outside the game interface, deselect the current cell
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      // Only process if a cell is selected
      if (selectedCellRef.current === null) return
      
      const target = event.target as Element
      
      // Instead of checking if outside gameContent, check if inside specific interactive elements
      const clickedInsideBoard = boardContainerRef.current?.contains(target)
      const clickedInsideControls = controlsContainerRef.current?.contains(target)
      const clickedInsideHeader = target.closest('header, .game-header, [data-game-header]')
      const clickedInsideModal = target.closest('[role="dialog"], .modal, [data-modal], .fixed')
      
      // Check if clicking on actual interactive elements (not just whitespace)
      const clickedOnButton = target.closest('button')
      const clickedOnInput = target.closest('input, select, textarea')
      const clickedOnInteractive = target.closest('[role="button"], [tabindex], a[href]')
      
      const isInteractiveClick = clickedOnButton || clickedOnInput || clickedOnInteractive
      
      // DEBUG: Log click detection info
      console.log('Click Debug:', {
        target: target.tagName + (target.className ? '.' + target.className.split(' ').join('.') : ''),
        clickedInsideBoard: !!clickedInsideBoard,
        clickedInsideControls: !!clickedInsideControls, 
        clickedInsideHeader: !!clickedInsideHeader,
        clickedInsideModal: !!clickedInsideModal,
        isInteractiveClick,
        selectedCell: selectedCellRef.current
      })
      
      // Deselect if clicking outside interactive areas
      const shouldDeselect = !clickedInsideBoard && 
                            !clickedInsideModal && 
                            !clickedInsideHeader &&
                            (!clickedInsideControls || !isInteractiveClick)
      
      if (shouldDeselect) {
        deselectCell()
        setEraseMode(false)
        clearMoveHighlight()
      }
    }
    
    // Listen to both mouse and touch events for cross-device support
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [deselectCell])

    // Extended background pause - completely suspend operations after 30 seconds hidden
    const [isExtendedPaused, setIsExtendedPaused] = useState(false)

   // Throttle validation messages when hidden to reduce re-renders
   const throttledSetValidationMessage = useCallback((message: { type: 'success' | 'error'; message: string } | null) => {
     if (shouldSkipStateUpdate() && message?.type === 'success') {
       // Skip non-critical success messages when hidden to reduce battery usage
       return
     }
     setValidationMessage(message)
   }, [shouldSkipStateUpdate])

   // Timer control hook - gets controls without subscribing to elapsedMs updates
   // The actual timer is created by TimerProvider wrapping this component
   const timerControl = useTimerControl()
   
   // Keep timerControl ref updated for stable callbacks
   timerControlRef.current = timerControl

   // ============================================================
   // STABLE CALLBACKS FOR HOOKS (Performance Optimization)
   // ============================================================
   // These callbacks use refs to access current values, so they don't need
   // to be recreated when those values change. This prevents the hooks'
   // internal useMemo from recalculating on every render.

   // Stable onComplete callback for useSudokuGame
   // Uses refs to break circular dependency: handleSubmit needs game, but onComplete is passed to game
   const handleGameComplete = useCallback(() => {
     timerControlRef.current?.pauseTimer()
     handleSubmitRef.current?.()
   }, [])

   // Stable callbacks for useAutoSolve
   const getBoard = useCallback(() => gameRef.current?.board ?? [], [])
   
   const getCandidates = useCallback(() => {
     const game = gameRef.current
     if (!game) return []
     // Convert Uint16Array to Set<number>[] for legacy API compatibility
     const arrays = candidatesToArrays(game.candidates)
     return arrays.map(arr => new Set(arr))
   }, [])
   
   const getGivens = useCallback(() => initialBoardRef.current, [])
   
   const handleApplyMove = useCallback((newBoard: number[], newCandidates: Set<number>[], move: Move, index: number) => {
     const game = gameRef.current
     if (!game) return
     // Convert Set<number>[] back to Uint16Array
     const candidatesArray = newCandidates.map(set => Array.from(set))
     const uint16Candidates = arraysToCandidates(candidatesArray)
     game.applyExternalMove(newBoard, uint16Candidates, move)
     setMoveHighlight(move as MoveHighlight, index)
     
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
   }, [setMoveHighlight, setDigitHighlight])
   
   const handleApplyState = useCallback((board: number[], candidates: Set<number>[], move: Move | null, index: number) => {
     const game = gameRef.current
     if (!game) return
     // Convert Set<number>[] back to Uint16Array
     const candidatesArray = candidates.map(set => Array.from(set))
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
   }, [setMoveHighlight, setDigitHighlight, clearDigitHighlight])
   
   const handleIsComplete = useCallback(() => gameRef.current?.isComplete ?? false, [])
   
   const handleAutoSolveError = useCallback((message: string) => {
     setValidationMessage({ type: 'error', message })
     visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
   }, [visibilityAwareTimeout])
   
   const handleUnpinpointableError = useCallback((message: string, count: number) => {
     setUnpinpointableErrorInfo({ message, count })
     setShowSolutionConfirm(true)
   }, [])
   
   const handleAutoSolveStatus = useCallback((message: string) => {
     throttledSetValidationMessage({ type: 'success', message })
     visibilityAwareTimeout(() => setValidationMessage(null), 2000)
   }, [throttledSetValidationMessage, visibilityAwareTimeout])
   
   const handleErrorFixed = useCallback((message: string, resumeCallback: () => void) => {
     // Show toast for fix-error (longer duration than normal hints)
     setValidationMessage({ type: 'error', message: `Fixed: ${message}` })
     // Clear toast after full duration
     visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_FIX_ERROR)
     // But resume solving sooner for better UX
     visibilityAwareTimeout(resumeCallback, ERROR_FIX_RESUME_DELAY)
   }, [visibilityAwareTimeout])
   
   const handleStepNavigate = useCallback((move: Move | null) => {
     // Show toast with move explanation when stepping through autosolve
     // Toast persists until next step or autosolve stops (no timeout)
     if (move) {
       setValidationMessage({ type: 'success', message: move.explanation })
     } else {
       // Stepped back to initial state
       setValidationMessage({ type: 'success', message: 'Initial state' })
     }
   }, [])

   // Game state hook - only initialize after we have the initial board
   const game = useSudokuGame({
     initialBoard: initialBoard.length === 81 ? initialBoard : Array(81).fill(0),
     onComplete: handleGameComplete,
    })
   
   // Keep game ref updated for stable callbacks
   gameRef.current = game

   // Auto-solve hook - fetches all moves at once and plays them back
  const autoSolve = useAutoSolve({
    stepDelay: AUTO_SOLVE_SPEEDS[autoSolveSpeedState],
    gamePaused: timerControl.isPausedDueToVisibility || isExtendedPaused,
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

    return () => clearTimeout(timeout)
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
  }, [solveConfirmOpen, autoSolve.isFetching, autoSolve.isAutoSolving])

  // Keep isCompleteRef in sync with game.isComplete for use in debounced callbacks
  useEffect(() => {
    isCompleteRef.current = game.isComplete
  }, [game.isComplete])

  // Check for existing in-progress game when navigating to a different puzzle
  useEffect(() => {
    // Skip if user already confirmed navigation (from Homepage or Menu)
    // Both Homepage and Menu handle their own in-progress confirmations
    if (sessionStorage.getItem('skip_in_progress_check')) {
      sessionStorage.removeItem('skip_in_progress_check')
      return
    }
    
    const savedGame = getMostRecentGame()
    // Show prompt if:
    // - There's a saved game
    // - It's for a DIFFERENT seed than what we're trying to load
    // - It's not complete (progress < 100%)
    if (savedGame && 
        savedGame.seed !== seed && 
        savedGame.seed !== encoded &&
        savedGame.progress < 100) {
      setExistingInProgressGame(savedGame)
      setShowInProgressConfirm(true)
    }
  }, [seed, encoded])

  // Handlers for in-progress game confirmation modal
  const handleResumeExistingGame = useCallback(() => {
    if (existingInProgressGame) {
      // Set flag so we don't show the modal again when navigating to the resumed game
      sessionStorage.setItem('skip_in_progress_check', 'true')
      navigate(`/${existingInProgressGame.seed}?d=${existingInProgressGame.difficulty}`)
    }
    setShowInProgressConfirm(false)
  }, [existingInProgressGame, navigate])

  const handleStartNewGame = useCallback(() => {
    if (existingInProgressGame) {
      clearInProgressGame(existingInProgressGame.seed)
    }
    // Set flag so we don't check for in-progress games again after user explicitly chose "Start New"
    sessionStorage.setItem('skip_in_progress_check', 'true')
    setShowInProgressConfirm(false)
    setExistingInProgressGame(null)
  }, [existingInProgressGame])

  // Handlers for daily prompt modal
  const handleGoToDaily = useCallback(() => {
    setShowDailyPrompt(false)
    navigate(`/daily-${getTodayUTC()}?d=medium`)
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

  const getStorageKey = useCallback((puzzleSeed: string) => {
    return `${STORAGE_KEYS.GAME_STATE_PREFIX}${puzzleSeed}`
  }, [])

  // Save game state to localStorage
  const saveGameState = useCallback(() => {
    // Use ref to check isComplete at execution time (not closure time)
    // Skip if puzzle not loaded yet or we haven't restored saved state yet
    if (!puzzle || !hasRestoredSavedState.current) return
    
    // Clear other games in the same mode (daily or practice) to ensure only ONE save per mode
    clearOtherGamesForMode(puzzle.seed)
    
    const storageKey = getStorageKey(puzzle.seed)
    const savedState: SavedGameState = {
      board: game.board,
      candidates: candidatesToArrays(game.candidates),
      elapsedMs: timerControl.getElapsedMs(),
      history: game.history,
      autoFillUsed,
      savedAt: Date.now(),
      difficulty: puzzle.difficulty,
      isComplete: isCompleteRef.current,
    }
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedState))
    } catch (e) {
      console.warn('Failed to save game state:', e)
    }
  // Note: We use isCompleteRef instead of game.isComplete to avoid stale closure issues
  // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback that reads from a ref
  }, [puzzle, game.board, game.candidates, game.history, autoFillUsed, getStorageKey])

  // Clear saved game state from localStorage
  const clearSavedGameState = useCallback(() => {
    if (!puzzle) return
    const storageKey = getStorageKey(puzzle.seed)
    try {
      localStorage.removeItem(storageKey)
    } catch (e) {
      console.warn('Failed to clear saved game state:', e)
    }
  }, [puzzle, getStorageKey])

  // Load saved game state from localStorage
  const loadSavedGameState = useCallback((puzzleSeed: string): SavedGameState | null => {
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
      console.warn('Failed to load saved game state:', e)
    }
    return null
  }, [getStorageKey])

  // ============================================================
  // GAME ACTIONS (using hooks)
  // ============================================================

  // Clear all user entries (keeps timer running)
  const handleClearAll = useCallback(() => {
    game.clearAll()
    clearSavedGameState()
    clearAllAndDeselect()
    setNotesMode(false)
    setAutoSolveStepsUsed(0)
    setAutoSolveErrorsFixed(0)
  }, [game, clearSavedGameState, clearAllAndDeselect])

  // Reset all game state (board, candidates, history, and tracking variables)
  const resetAllGameState = useCallback(() => {
    game.resetGame()
    setHintsUsed(0)
    setTechniqueHintsUsed(0)
    setAutoFillUsed(false)
    setAutoSolveUsed(false)
    autoSolveUsedRef.current = false
    setAutoSolveStepsUsed(0)
    setAutoSolveErrorsFixed(0)
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
  }, [resetAllGameState, timerControl, clearSavedGameState, clearAllAndDeselect])

  // Auto-fill notes based on current board state
  const autoFillNotes = useCallback(() => {
    if (game.board.length !== 81) return
    const newCandidates = game.fillAllCandidates()
    let cellsWithCandidates = 0
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
  }, [game])

  // Check notes for errors
  const handleCheckNotes = useCallback(() => {
    const result = game.checkNotes()
    
    if (result.cellsWithNotes === 0) {
      setValidationMessage({ type: 'error', message: 'No notes to check. Add some notes first!' })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
      return
    }
    
    if (result.valid) {
      if (result.missingNotes.length > 0) {
        setValidationMessage({ 
          type: 'success', 
          message: `Notes are correct! (${result.missingNotes.length} possible candidates not noted)` 
        })
      } else {
        setValidationMessage({ type: 'success', message: 'All notes are correct and complete!' })
      }
    } else {
      const wrongCount = result.wrongNotes.length
      setValidationMessage({ 
        type: 'error', 
        message: `Found ${wrongCount} incorrect note${wrongCount > 1 ? 's' : ''}. Some notes are impossible.`
      })
    }
    visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
  }, [game, visibilityAwareTimeout])

  // Validate current board state by comparing against the known solution
  const handleValidate = useCallback(() => {
    if (solution.length !== 81) {
      setValidationMessage({ type: 'error', message: 'Solution not available' })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
      return
    }

    const data = validateBoard(game.board, solution)
    if (data.valid) {
      setValidationMessage({ type: 'success', message: data.message || 'All entries are correct!' })
      setIncorrectCells([])
    } else {
      setValidationMessage({ type: 'error', message: data.message || 'There are errors in the puzzle' })
      if (data.incorrectCells) {
        setIncorrectCells(data.incorrectCells)
      }
    }
    visibilityAwareTimeout(() => {
      setValidationMessage(null)
      setIncorrectCells([])
    }, TOAST_DURATION_INFO)
  }, [game.board, solution, visibilityAwareTimeout])

  // Handle hint button - shows the next move with full answer (eliminations + additions visible)
  const handleNext = useCallback(async () => {
    // Prevent concurrent hint requests (spam protection)
    if (hintInProgress.current) return
    hintInProgress.current = true
    setHintLoading(true)

    try {
      // Deselect any highlighted digit when using hint
      clearAllAndDeselect()

      // Get the next move from current state
      const boardSnapshot = [...game.board]
      const candidatesArray = candidatesToArrays(game.candidates)

      const data = await findNextMove(boardSnapshot, candidatesArray, initialBoard)
      
      if (!data.move) {
        setValidationMessage({ 
          type: 'error', 
          message: data.solved 
            ? 'Puzzle is already complete!' 
            : 'This puzzle requires advanced techniques beyond our hint system.' 
        })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        return
      }

      const move = data.move

      // Handle special moves
      if (move.action === 'unpinpointable-error') {
        setUnpinpointableErrorInfo({ 
          message: move.explanation || `Couldn't pinpoint the error.`, 
          count: (move as unknown as { userEntryCount?: number }).userEntryCount || 0 
        })
        setShowSolutionConfirm(true)
        return
      }

      if (move.action === 'contradiction' || move.action === 'error') {
        const currentGame = gameRef.current
        if (currentGame?.canUndo) {
          currentGame.undo()
          clearMoveHighlight()
          setValidationMessage({ 
            type: 'error', 
            message: move.explanation || 'Contradiction found - undoing last move'
          })
          visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
          return
        } else {
          setValidationMessage({ 
            type: 'error', 
            message: 'The puzzle cannot be solved - initial state has errors.'
          })
          visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
          return
        }
      }

      // Show the hint highlight WITH the answer (showAnswer defaults to true)
      // User sees red eliminations and green additions
      setMoveHighlight(move as MoveHighlight, game.history.length)

      // Show toast with technique explanation
      setValidationMessage({ 
        type: 'success', 
        message: move.explanation || move.technique || 'Hint'
      })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)

      // Only increment counter if this is a NEW hint (different from last shown)
      const signature = getHintSignature(move)
      if (signature !== lastRegularHintRef.current) {
        setHintsUsed(prev => prev + 1)
        lastRegularHintRef.current = signature
      }
      // Note: Button stays enabled - no setHintPending(true)
    } catch (err) {
      console.error('Hint error:', err)
      setValidationMessage({ type: 'error', message: err instanceof Error ? err.message : 'Failed to get hint' })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
    } finally {
      hintInProgress.current = false
      setHintLoading(false)
    }
  }, [game.board, game.candidates, game.history.length, initialBoard, clearAllAndDeselect, visibilityAwareTimeout, setMoveHighlight, clearMoveHighlight])

  // Handle technique hint button - shows technique name and highlights cells without revealing the answer
  const handleTechniqueHint = useCallback(async () => {
    // Prevent concurrent requests
    if (hintInProgress.current) return
    hintInProgress.current = true
    setTechniqueHintLoading(true)

    try {
      // Deselect any highlighted digit when using technique hint
      clearAllAndDeselect()

      // Get the next move from current state (efficient single-move call)
      const boardSnapshot = [...game.board]
      const candidatesArray = candidatesToArrays(game.candidates)

      const data = await findNextMove(boardSnapshot, candidatesArray, initialBoard)
      
      if (!data.move) {
        setValidationMessage({ 
          type: 'error', 
          message: data.solved 
            ? 'Puzzle is already complete!' 
            : 'This puzzle requires advanced techniques beyond our hint system.' 
        })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        return
      }

      const move = data.move

      // If the next move is just filling candidates, show a helpful message
      if (move.technique === 'fill-candidate') {
        setValidationMessage({ 
          type: 'info', 
          message: 'Fill in some candidates first, or use 💡 Hint to get started'
        })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        return
      }

      // Handle unpinpointable errors separately - no highlighting to show
      if (move.action === 'unpinpointable-error') {
        setValidationMessage({ 
          type: 'error', 
          message: 'There seems to be an error in the puzzle. Try using 💡 Hint to fix it.'
        })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        return
      }

      // Handle constraint violations and errors - show WITH highlighting
      if (move.action === 'contradiction' || move.action === 'error') {
        // Show the constraint violation highlights (shows which cells conflict)
        setMoveHighlight({ ...move, showAnswer: false } as MoveHighlight, game.history.length)
        
        // Show the error message
        setValidationMessage({ 
          type: 'error', 
          message: move.explanation || 'Constraint violation detected'
        })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        return
      }

      // Get the technique info
      const techniqueName = formatTechniqueName(move.technique || 'Unknown Technique')
      const techniqueSlug = move.technique?.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-') || 'unknown'

      // Show highlight WITHOUT the answer (showAnswer: false)
      // This shows primary/secondary cell highlighting but hides eliminations and target additions
      setMoveHighlight({ ...move, showAnswer: false } as MoveHighlight, game.history.length)

      // Show toast with technique name and "Learn more" action
      setValidationMessage({ 
        type: 'info', 
        message: `Try: ${techniqueName}`,
        action: {
          label: 'Learn more',
          onClick: () => setTechniqueModal({ title: techniqueName, slug: techniqueSlug })
        }
      })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)

      // Only increment counter if this is a NEW hint (different from last shown)
      const signature = getHintSignature(move)
      if (signature !== lastTechniqueHintRef.current) {
        setTechniqueHintsUsed(prev => prev + 1)
        lastTechniqueHintRef.current = signature
      }
      // Note: Button stays enabled - no setTechniqueHintPending(true)
    } catch (err) {
      console.error('Technique hint error:', err)
      setValidationMessage({ type: 'error', message: err instanceof Error ? err.message : 'Failed to get technique' })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
    } finally {
      hintInProgress.current = false
      setTechniqueHintLoading(false)
    }
  }, [game.board, game.candidates, game.history.length, initialBoard, clearAllAndDeselect, visibilityAwareTimeout, setMoveHighlight])

    // Resume from extended pause on user interaction
    const resumeFromExtendedPause = useCallback(() => {
      if (isExtendedPaused) {
        setIsExtendedPaused(false)
      }
    }, [isExtendedPaused])

    // Cell click handler - STABLE: reads from refs to avoid recreating on state changes
    // This is critical because Cell memo doesn't compare callback props for performance
    const handleCellClick = useCallback((idx: number) => {
      resumeFromExtendedPause()
      
      // Read current state from refs for stable callback
      const currentHighlightedDigit = highlightedDigitRef.current
      const currentSelectedCell = selectedCellRef.current
      const currentNotesMode = notesModeRef.current
      const currentEraseMode = eraseModeRef.current
      const currentGame = gameRef.current
      
      if (!currentGame) return

     // If a digit is already highlighted and we're clicking a given cell,
     // only block if we're NOT coming from another given cell (allow given-to-given navigation)
     if (currentHighlightedDigit !== null && currentGame.isGivenCell(idx)) {
       if (currentSelectedCell === null || !currentGame.isGivenCell(currentSelectedCell)) {
         return
       }
       // Fall through to handle given cell click normally (switch between given cells)
     }
     
     // Given cells: highlight the digit AND select the cell for peer highlighting
     if (currentGame.isGivenCell(idx)) {
       const cellDigit = currentGame.board[idx]
       if (cellDigit && cellDigit > 0) {
         // Toggle: if same given cell is clicked again, deselect
         if (currentSelectedCell === idx) {
           clearAllAndDeselect()
         } else {
           clickGivenCell(cellDigit, idx)
         }
       }
       setEraseMode(false)
       return
     }

     // Toggle selection: clicking the same cell again deselects it (highest priority for user-fillable cells)
     // EXCEPT: In notes mode with a digit highlighted, clicking the same cell should toggle the candidate
     if (currentSelectedCell === idx) {
       if (currentNotesMode && currentHighlightedDigit !== null && currentGame.board[idx] === 0) {
         // Toggle the candidate on this cell
         currentGame.setCell(idx, currentHighlightedDigit, currentNotesMode)
         clearAfterUserCandidateOp()
         lastTechniqueHintRef.current = null
         lastRegularHintRef.current = null
         return
       }
       clearAllAndDeselect()
       return
     }

       if (currentEraseMode && currentGame.board[idx] !== 0) {
        currentGame.eraseCell(idx)
        clearAfterErase()
        // Reset last hint tracking so next hint counts as new
        lastTechniqueHintRef.current = null
        lastRegularHintRef.current = null
        // Keep erase mode active so user can erase multiple cells
        return
      }

        if (currentHighlightedDigit !== null) {
         if (currentNotesMode) {
           currentGame.setCell(idx, currentHighlightedDigit, currentNotesMode)
           // Clear all move-related highlights (cell backgrounds) but preserve digit highlight for multi-fill
            clearAfterUserCandidateOp()
            // Reset last hint tracking so next hint counts as new
            lastTechniqueHintRef.current = null
            lastRegularHintRef.current = null
          } else {
            // For digit placement, clear move highlights but preserve digit highlight for multi-fill
            currentGame.setCell(idx, currentHighlightedDigit, currentNotesMode)
            clearAfterDigitPlacement()
            // Reset last hint tracking so next hint counts as new
            lastTechniqueHintRef.current = null
            lastRegularHintRef.current = null
          }
         return
       }

     // Select the cell (works for both empty and user-filled cells)
     // selectCell atomically selects and clears highlights
     selectCell(idx)
     setEraseMode(false)
   // All deps are now stable callbacks - state accessed via refs
   }, [selectCell, clearAllAndDeselect, clearAfterErase, clearAfterUserCandidateOp, clearAfterDigitPlacement, clickGivenCell, resumeFromExtendedPause])

    // Digit input handler - STABLE: reads from refs to avoid recreating on state changes
    const handleDigitInput = useCallback((digit: number) => {
      resumeFromExtendedPause()
      // Clear erase mode when selecting a digit
      setEraseMode(false)

      const currentSelectedCell = selectedCellRef.current
      const currentNotesMode = notesModeRef.current
      const currentGame = gameRef.current
      
      if (!currentGame) return

      if (currentSelectedCell === null) {
        toggleDigitHighlight(digit)
        return
      }

      // If a given cell is selected, deselect it and toggle digit highlight for multi-fill mode
      if (currentGame.isGivenCell(currentSelectedCell)) {
        deselectCell()
        toggleDigitHighlight(digit)
        return
      }

      // If cell already has this digit, erase it
      if (currentGame.board[currentSelectedCell] === digit) {
        currentGame.eraseCell(currentSelectedCell)
        clearAfterDigitToggle()
        // Reset last hint tracking so next hint counts as new
        lastTechniqueHintRef.current = null
        lastRegularHintRef.current = null
        return
      }

      currentGame.setCell(currentSelectedCell, digit, currentNotesMode)

      if (currentNotesMode) {
        // Clear all move-related highlights (cell backgrounds) but preserve digit highlight for multi-fill
        clearAfterUserCandidateOp()
      } else {
        // For digit placement, clear move highlights but preserve digit highlight for multi-fill
        clearAfterDigitPlacement()
        deselectCell()
      }
      // Reset last hint tracking so next hint counts as new
      lastTechniqueHintRef.current = null
      lastRegularHintRef.current = null

      // Cell deselects after digit entry (per requirements)
      // Keep digit highlighted for adding candidates (multi-fill)
    // All deps are now stable callbacks - game accessed via ref
    }, [toggleDigitHighlight, clearAfterDigitToggle, clearAfterUserCandidateOp, clearAfterDigitPlacement, deselectCell, resumeFromExtendedPause])

    // Keyboard cell change handler (from Board component)
    const handleCellChange = useCallback((idx: number, value: number) => {
      resumeFromExtendedPause()
      if (game.isGivenCell(idx)) return
if (value === 0) {
        game.eraseCell(idx)
        clearAfterErase()
        // Reset last hint tracking so next hint counts as new
        lastTechniqueHintRef.current = null
        lastRegularHintRef.current = null
        } else {
          if (notesMode) {
            game.setCell(idx, value, notesMode)
            
            // Clear all move-related highlights (cell backgrounds) but preserve digit highlight for multi-fill
            clearAfterUserCandidateOp()
          } else {
            game.setCell(idx, value, notesMode)
            clearAfterDigitPlacement()
            deselectCell()
          }
          // Reset last hint tracking so next hint counts as new
          lastTechniqueHintRef.current = null
          lastRegularHintRef.current = null
        }
     // eslint-disable-next-line react-hooks/exhaustive-deps -- resumeFromExtendedPause depends on isExtendedPaused; adding it would recreate this callback on every pause state change, causing unnecessary re-renders of Board (which receives this as a prop)
     }, [game, notesMode, clearAfterErase, clearAfterUserCandidateOp, clearAfterDigitPlacement])

  // Toggle notes mode handler
  const handleNotesToggle = useCallback(() => {
    setNotesMode(prev => !prev)
  }, [])

  // Toggle erase mode handler
  const handleEraseMode = useCallback(() => {
    setEraseMode(prev => !prev)
    clearOnModeChange()
  }, [clearOnModeChange])

  // Undo handler - STABLE: reads from refs to avoid recreation on state changes
  const handleUndo = useCallback(() => {
    const currentAutoSolve = autoSolveRef.current
    const currentGame = gameRef.current
    if (currentAutoSolve?.isAutoSolving) {
      currentAutoSolve.stepBack()
    } else if (currentGame) {
      currentGame.undo()
      // Clear selection and move highlights, but preserve highlightedDigit for multi-fill mode
      deselectCell()
      clearMoveHighlight()
    }
  }, [deselectCell, clearMoveHighlight])

  // Redo handler - STABLE: reads from refs to avoid recreation on state changes
  const handleRedo = useCallback(() => {
    const currentAutoSolve = autoSolveRef.current
    const currentGame = gameRef.current
    if (currentAutoSolve?.isAutoSolving) {
      currentAutoSolve.stepForward()
    } else if (currentGame) {
      currentGame.redo()
      // Clear selection and highlights after redo
      clearAllAndDeselect()
    }
  }, [clearAllAndDeselect])

  // Submit handler
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback that reads from a ref
  }, [puzzle, hintsUsed, techniqueHintsUsed, encodedPuzzle, autoFillUsed])
  
  // Keep handleSubmit ref updated so onComplete can call it
  handleSubmitRef.current = handleSubmit

  // Auto-solve handler
  const handleSolve = useCallback(async () => {
    clearAllAndDeselect()
    setAutoSolveUsed(true)
    autoSolveUsedRef.current = true
    // Start paused if speed is 'step'
    const startPaused = getAutoSolveSpeed() === 'step'
    await autoSolve.restartAutoSolve(startPaused)
  }, [autoSolve, clearAllAndDeselect])

  // Check & Fix handler - compares current board vs solution, removes mismatches, continues solving
  const handleCheckAndFix = useCallback(async () => {
    if (!solution || solution.length !== 81) {
      console.error('Cannot check and fix: solution not available')
      return
    }

    try {
      // Get current state
      const currentBoard = game.board
      const currentCandidates = candidatesToArrays(game.candidates)
      const givens = puzzle?.givens || []

      if (givens.length !== 81) {
        console.error('Cannot check and fix: givens not available')
        return
      }

      // Call WASM to compare and fix
      const result = await checkAndFixWithSolution(currentBoard, currentCandidates, givens, solution)
      
      if (result.moves && result.moves.length > 0) {
        // Apply only fix-error moves for Check & Fix; ignore solver moves
        let applied = 0
        let ignored = 0
        for (let i = 0; i < result.moves.length; i++) {
          const moveData = result.moves[i]
          if (!moveData) continue
          const isFix = moveData.move?.action === 'fix-error'
          if (!isFix) { ignored++; continue }
          
          // Convert candidates: WASM returns number[][], need Set<number>[] for handleApplyMove
          const candidateArrays = moveData.candidates || []
          const newCandidates = candidateArrays.map(arr => new Set(arr || []))
          
          // Apply only the fix move
          handleApplyMove(moveData.board, newCandidates, moveData.move, applied + 1)
          applied++
          
          // Brief pause so the user can see removals
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        try { console.warn(`[Check & Fix] Applied fix moves: ${applied}, ignored non-fix moves: ${ignored}`) } catch {}
        if (ignored > 0) {
          try { console.debug('[Check & Fix] Ignored non-fix moves to prevent unintended auto-solve') } catch {}
        }
        if (applied > 0) {
          const startPaused = getAutoSolveSpeed() === 'step'
          try { console.debug('[Check & Fix] Restarting solver after fixes', { startPaused }) } catch {}
          await autoSolve.restartAutoSolve(startPaused)
        }
      } else {
        console.warn('Check & Fix: no changes needed')
      }
    } catch (error) {
      console.error('Check & Fix failed:', error)
      handleAutoSolveError('Failed to check and fix entries')
    }
  }, [solution, game.board, game.candidates, puzzle?.givens, handleApplyMove, handleAutoSolveError])

  // Bug report handler - opens GitHub issue with state
  const handleReportBug = useCallback(async () => {
    const bugReport = {
      version: __COMMIT_HASH__,
      timestamp: new Date().toISOString(),
      puzzle: {
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
      history: game.history.map(move => ({
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
    
    // Create a compact board representation for the issue body
    const boardString = game.board.map((v, i) => 
      (i > 0 && i % 9 === 0 ? '\n' : '') + (v === 0 ? '.' : v)
    ).join('')
    
    const issueBody = `## Bug Description
<!-- Please describe the bug you encountered -->

## Steps to Reproduce (optional)
<!-- The debug state below includes move history, but feel free to describe steps here -->
1. 
2. 
3. 

## Expected Behavior
<!-- What did you expect to happen? -->

## Actual Behavior
<!-- What actually happened? -->

---

## Puzzle State (auto-filled)
- **Version:** ${__COMMIT_HASH__}
- **Seed:** ${puzzle?.seed || 'Unknown'}
- **Difficulty:** ${puzzle?.difficulty || 'Unknown'}
- **Time:** ${Math.floor(timerControl.getElapsedMs() / 1000)}s

### Current Board
\`\`\`
${boardString}
\`\`\`

<details>
<summary>Full Debug State (click to expand)</summary>

\`\`\`json
${bugReportJson}
\`\`\`

</details>
`

    // Also copy to clipboard as backup
    const success = await copyToClipboard(bugReportJson)
    if (success) {
      setBugReportCopied(true)
      visibilityAwareTimeout(() => setBugReportCopied(false), COPY_TOAST_DURATION)
    }
    
    // Open GitHub issue with pre-filled content
    const issueUrl = new URL('https://github.com/ThoDHa/sudoku/issues/new')
    issueUrl.searchParams.set('title', `Bug: [Please describe briefly]`)
    issueUrl.searchParams.set('body', issueBody)
    issueUrl.searchParams.set('labels', 'bug')
    
    window.open(issueUrl.toString(), '_blank')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback that reads from a ref
  }, [puzzle, initialBoard, game, colorTheme, mode, visibilityAwareTimeout])

  // Feature request handler - opens GitHub issue for new features
  const handleFeatureRequest = useCallback(() => {
    const issueBody = `## Feature Description
 <!-- Please describe the feature you'd like to see -->

## Use Case
 <!-- Why would this feature be useful? -->

## Possible Implementation (optional)
 <!-- Any ideas on how this could work? -->
`

    const issueUrl = new URL('https://github.com/ThoDHa/sudoku/issues/new')
    issueUrl.searchParams.set('title', `Feature: [Please describe briefly]`)
    issueUrl.searchParams.set('body', issueBody)
    issueUrl.searchParams.set('labels', 'enhancement')
    
    window.open(issueUrl.toString(), '_blank')
  }, [])

  // Share puzzle handler - copies URL with current progress to clipboard
  const handleShare = useCallback(async () => {
    try {
      // Convert candidates from Uint16Array to number[][] for encoding
      const candidatesArray = candidatesToArrays(game.candidates)
      // Encode full board state with givens marker and candidates
      const encoded = encodePuzzleWithState(game.board, initialBoard, candidatesArray)
      const url = `${window.location.origin}/c/${encoded}`

      // Copy to clipboard
      const success = await copyToClipboard(url)
      if (success) {
        setValidationMessage({ type: 'success', message: 'Puzzle link copied to clipboard!' })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
      } else {
        setValidationMessage({ type: 'error', message: 'Failed to copy link' })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
      }
    } catch (err) {
      console.error('Share error:', err)
      setValidationMessage({ type: 'error', message: 'Failed to create share link' })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
    }
  }, [game.board, game.candidates, initialBoard, visibilityAwareTimeout])

  // ============================================================
  // EFFECTS
  // ============================================================

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Don't trigger shortcuts when modals are open
      if (showResultModal || historyOpen || techniqueModal || techniquesListOpen || 
          solveConfirmOpen || showClearConfirm) {
        return
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd + Z = Undo
      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleUndo()
        return
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if ((ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z') || 
          (ctrlOrCmd && e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        handleRedo()
        return
      }

      // H = Hint
      if (e.key.toLowerCase() === 'h' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handleNext()
        return
      }

      // N = Toggle Notes mode
      if (e.key.toLowerCase() === 'n' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        setNotesMode(prev => !prev)
        return
      }

      // V = Validate
      if (e.key.toLowerCase() === 'v' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handleValidate()
        return
      }

      // Escape = Deselect cell and clear highlights
      if (e.key === 'Escape') {
        e.preventDefault()
        clearAllAndDeselect()
        return
      }

      // Space = Toggle notes mode (alternative)
      if (e.key === ' ' && !ctrlOrCmd) {
        // Only if not on a focusable element that uses space
        const activeTag = document.activeElement?.tagName
        if (activeTag !== 'BUTTON' && activeTag !== 'A') {
          e.preventDefault()
          setNotesMode(prev => !prev)
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    handleUndo, handleRedo, handleNext, handleValidate, clearAllAndDeselect,
    showResultModal, historyOpen, techniqueModal, techniquesListOpen,
    solveConfirmOpen, showClearConfirm
  ])

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
        onHistory: () => setHistoryOpen(true),
        onAutoFillNotes: autoFillNotes,
      })
    }
    return () => setGameState(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback; we only want a static snapshot at mount
  }, [loading, puzzle, difficulty, game.history.length, game.isComplete, autoFillNotes, setGameState])

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
      const errorsFixed = game.history.filter(move => 
        move.action === 'fix-error' || move.action === 'fix-conflict'
      ).length
      setAutoSolveErrorsFixed(errorsFixed)
    }
  }, [autoSolve.isAutoSolving, autoSolve.lastCompletedSteps, game.history])

  // Fetch puzzle
  useEffect(() => {
    // Don't load puzzle while onboarding is showing
    if (showOnboarding) {
      setLoading(false) // Show empty board behind modal, not loading spinner
      return
    }
    // Don't load puzzle until difficulty is chosen (for shared links without ?d= param)
    if (showDifficultyChooser) {
      setLoading(false)
      return
    }
    // For new users, wait for onboarding to appear first (500ms delay in useOnboarding)
    // This prevents the puzzle from loading before onboarding shows
    if (!onboardingComplete) {
      setLoading(false)
      return
    }
    if (!effectiveSeed && !isEncodedCustom) return

    const loadPuzzle = async () => {
      try {
        setLoading(true)
        setError(null)
        clearAllAndDeselect()
        // Don't hide result modal if revisiting a completed daily
        if (!alreadyCompletedToday) {
          setShowResultModal(false)
        }
        setIncorrectCells([])

        let givens: number[]
        let puzzleSolution: number[]
        let puzzleData: PuzzleData
        let initialState: number[] | null = null
        let initialCandidates: number[][] | null = null

        if (isEncodedCustom && encoded) {
          // Check if this is a full-state sharing link (starts with 'e' or 'c')
          if (encoded.startsWith('e') || encoded.startsWith('c')) {
            const decoded = decodePuzzleWithState(encoded)
            if (!decoded) {
              throw new Error('Invalid puzzle link. The puzzle could not be decoded.')
            }
            
            // decoded.board is the full state (including user entries)
            // decoded.givens are the original givens (editable cells will have 0)
            // decoded.candidates (optional) are the notes/candidates
            givens = decoded.givens
            initialState = decoded.board
            if (decoded.candidates) {
              initialCandidates = decoded.candidates
            }
            
            // Validate the puzzle
            const validation = await validateCustomPuzzle(givens, '')
            if (!validation.valid) {
              throw new Error(`Invalid puzzle: ${validation.reason || 'unknown error'}`)
            }
            if (!validation.unique) {
              throw new Error('Invalid puzzle: has multiple solutions')
            }
            if (!validation.solution) {
              throw new Error('Invalid puzzle: could not compute solution')
            }
            puzzleSolution = validation.solution
            
            setEncodedPuzzle(encoded)
            
            puzzleData = {
              puzzle_id: `encoded-${encoded.substring(0, 8)}`,
              seed: `encoded-${encoded.substring(0, 8)}`,
              difficulty: 'custom',
              givens: givens,
              solution: puzzleSolution,
            }
          } else {
            // Legacy encoding - just givens
            try {
              givens = decodePuzzle(encoded)
              if (givens.length !== 81) {
                throw new Error('Invalid puzzle encoding')
              }
            } catch {
              throw new Error('Invalid puzzle link. The puzzle could not be decoded.')
            }
            
            // Validate the encoded puzzle before playing
            const validation = await validateCustomPuzzle(givens, '')
            if (!validation.valid) {
              throw new Error(`Invalid puzzle: ${validation.reason || 'unknown error'}`)
            }
            if (!validation.unique) {
              throw new Error('Invalid puzzle: has multiple solutions')
            }
            if (!validation.solution) {
              throw new Error('Invalid puzzle: could not compute solution')
            }
            puzzleSolution = validation.solution
            
            setEncodedPuzzle(encoded)
            
            puzzleData = {
              puzzle_id: `encoded-${encoded.substring(0, 8)}`,
              seed: `encoded-${encoded.substring(0, 8)}`,
              difficulty: 'custom',
              givens: givens,
              solution: puzzleSolution,
            }
          }
        } else if (difficulty === 'custom' && effectiveSeed?.startsWith('custom-')) {
          const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${effectiveSeed}`)
          if (!storedGivens) {
            throw new Error('Custom puzzle not found. Please re-enter the puzzle.')
          }
          givens = JSON.parse(storedGivens)
          
          // Validate to get solution
          const validation = await validateCustomPuzzle(givens, '')
          if (!validation.valid || !validation.unique || !validation.solution) {
            throw new Error('Stored puzzle is invalid')
          }
          puzzleSolution = validation.solution
          
          setEncodedPuzzle(encodePuzzle(givens))
          
          puzzleData = {
            puzzle_id: effectiveSeed,
            seed: effectiveSeed,
            difficulty: 'custom',
            givens: givens,
            solution: puzzleSolution,
          }
        } else if (effectiveSeed?.startsWith('practice-') && !isTestRoute) {
          // Practice puzzles are stored in localStorage by TechniqueDetailView
          // Skip this branch for test routes (which use practice-test-* seeds)
          const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${effectiveSeed}`)
          if (!storedGivens) {
            throw new Error('Practice puzzle not found. Please try again from the technique page.')
          }
          givens = JSON.parse(storedGivens)
          
          // Validate to get solution
          const validation = await validateCustomPuzzle(givens, '')
          if (!validation.valid || !validation.unique || !validation.solution) {
            throw new Error('Practice puzzle is invalid')
          }
          puzzleSolution = validation.solution
          
          setEncodedPuzzle(null)
          
          puzzleData = {
            puzzle_id: effectiveSeed,
            seed: effectiveSeed,
            difficulty: difficulty,
            givens: givens,
            solution: puzzleSolution,
          }
        } else {
          // Fetch puzzle from static pool (synchronous, no WASM needed)
          const fetchedPuzzle = getPuzzle(effectiveSeed ?? '', difficulty)
          puzzleData = {
            puzzle_id: fetchedPuzzle.puzzle_id,
            seed: fetchedPuzzle.seed,
            difficulty: fetchedPuzzle.difficulty,
            givens: fetchedPuzzle.givens,
            solution: fetchedPuzzle.solution,
          }
          givens = puzzleData.givens
          puzzleSolution = puzzleData.solution
          setEncodedPuzzle(null)
        }

        setPuzzle(puzzleData)
        // For shared state, use the provided full board
        // For completed daily puzzles, show solved board (solution)
        // Otherwise show initial givens
        if (initialState) {
          setInitialBoard([...givens]) // Givens for marking non-editable cells
        } else if (alreadyCompletedToday) {
          setInitialBoard([...puzzleData.solution])
        } else {
          setInitialBoard([...givens])
        }
        setSolution([...puzzleData.solution])

        // Reset timer for non-completed puzzles (timer will be started later by initialBoard effect)
        if (!alreadyCompletedToday && !showDifficultyChooser) {
          timerControl.resetTimer()
        }
        setLoading(false)

        // Check if we should show daily prompt (for practice games only)
        if (getGameMode(puzzleData.seed) === 'practice' && shouldShowDailyPrompt()) {
          setShowDailyPrompt(true)
          markDailyPromptShown()
        }

        // Restore shared state if available
        if (initialState) {
          loadedFromSharedUrl.current = true
          const candidatesArray = initialCandidates || Array(81).fill(null).map(() => [])
          const uint16Candidates = arraysToCandidates(candidatesArray)
          game.restoreState(initialState, uint16Candidates, [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    loadPuzzle()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl excluded: adding it would re-fetch puzzle when timer running/paused state changes. We only want to fetch when the actual puzzle params change.
  }, [effectiveSeed, encoded, isEncodedCustom, difficulty, alreadyCompletedToday, showDifficultyChooser, showOnboarding, clearAllAndDeselect, isTestRoute])

  // Reset game state when initialBoard changes (new puzzle loaded) and restore saved state if available
  useEffect(() => {
    if (initialBoard.length === 81 && puzzle) {
      // Skip if we already loaded from a shared URL (state is already restored)
      if (loadedFromSharedUrl.current) {
        loadedFromSharedUrl.current = false
        hasRestoredSavedState.current = true
        return
      }
      
      // Check for saved state for this puzzle
      const savedState = loadSavedGameState(puzzle.seed)
      
      if (savedState) {
        // Restore saved state
        const restoredCandidates = arraysToCandidates(savedState.candidates)
        game.restoreState(savedState.board, restoredCandidates, savedState.history)
        timerControl.setElapsedMs(savedState.elapsedMs)
        // Start timer (resume from saved time) - only if puzzle is playable
        if (!alreadyCompletedToday && !showDifficultyChooser) {
          timerControl.startTimer()
        }
        setAutoFillUsed(savedState.autoFillUsed)
      } else {
        // Start fresh - reset game and all tracking state
        resetAllGameState()
        // Start timer for new game - only if puzzle is playable
        if (!alreadyCompletedToday && !showDifficultyChooser) {
          timerControl.startTimer()
        }
      }
      
      hasRestoredSavedState.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- game.restoreState, resetAllGameState, and timerControl.setElapsedMs are stable callbacks. We intentionally only trigger this when initialBoard or puzzle changes to prevent re-initialization loops.
  }, [initialBoard, puzzle, loadSavedGameState])

  // Auto-save game state when board or candidates change (but not when hidden)
  // Enhanced with requestIdleCallback for better battery performance
  useEffect(() => {
    if (!puzzle || !hasRestoredSavedState.current || game.isComplete || !getAutoSaveEnabled()) return

    // Don't save when app is hidden to reduce battery usage
    if (backgroundManager.shouldPauseOperations) {
      hasUnsavedChanges.current = true
      return
    }

    // Use requestIdleCallback when available for better battery performance
    const scheduleAutoSave = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          if (!backgroundManager.shouldPauseOperations) {
            saveGameState()
            hasUnsavedChanges.current = false
          }
        }, { timeout: 1000 })
      } else {
        // Fallback to setTimeout for older browsers
        setTimeout(() => {
          if (!backgroundManager.shouldPauseOperations) {
            saveGameState()
            hasUnsavedChanges.current = false
          }
        }, 500)
      }
    }

    // Debounce saves to avoid excessive localStorage writes
    const timeoutId = setTimeout(scheduleAutoSave, 500)
    return () => clearTimeout(timeoutId)
  }, [game.board, game.candidates, game.history, puzzle, game.isComplete, saveGameState, backgroundManager.shouldPauseOperations])

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
      if (puzzle && !game.isComplete && hasRestoredSavedState.current && getAutoSaveEnabled()) {
        // Synchronous save - must complete before page unloads
        const storageKey = `${STORAGE_KEYS.GAME_STATE_PREFIX}${puzzle.seed}`
        const savedState: SavedGameState = {
          board: game.board,
          candidates: candidatesToArrays(game.candidates),
          elapsedMs: timerControl.getElapsedMs(),
          history: game.history,
          autoFillUsed,
          savedAt: Date.now(),
          difficulty: puzzle.difficulty,
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify(savedState))
        } catch {
          // Can't do much here - page is closing
        }
      }
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [puzzle, game.isComplete, game.board, game.candidates, game.history, autoFillUsed, timerControl])

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

  // Immediate save when puzzle is completed (vanquish delay demon!)
  // Saves game result instantly for correct tracking of completions
  const hasSavedOnCompleteRef = useRef(false)
  useEffect(() => {
    if (game.isComplete && hasRestoredSavedState.current && !hasSavedOnCompleteRef.current) {
      saveGameState()
      hasSavedOnCompleteRef.current = true
    }
    // Reset if a new game starts
    if (!game.isComplete) {
      hasSavedOnCompleteRef.current = false
    }
  }, [game.isComplete, saveGameState, hasRestoredSavedState.current])


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
    <div ref={gameInterfaceRef} className="flex h-full flex-col overflow-hidden bg-background text-foreground">
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
        onTechniqueHint={handleTechniqueHint}
        techniqueHintDisabled={false}
        techniqueHintLoading={techniqueHintLoading}
        onHint={handleNext}
        hintLoading={hintLoading}
        hintDisabled={false}
        onHistoryOpen={() => setHistoryOpen(true)}
        onShowResult={() => setShowResultModal(true)}
        onShare={handleShare}
        onAutoFillNotes={autoFillNotes}
        onCheckNotes={handleCheckNotes}
        onClearNotes={() => {
          game.clearCandidates()
          clearMoveHighlight()
        }}
        onValidate={handleValidate}
        onSolve={() => setSolveConfirmOpen(true)}
        onClearAll={() => setShowClearConfirm(true)}
        onTechniquesList={() => setTechniquesListOpen(true)}
        onAbout={openAbout}
        onReportBug={handleReportBug}
        onFeatureRequest={handleFeatureRequest}
        bugReportCopied={bugReportCopied}
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
      />

      {/* Validation message toast */}
      {validationMessage && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 ${
          validationMessage.type === 'success' 
            ? 'bg-accent text-btn-active-text' 
            : validationMessage.type === 'info'
              ? 'bg-accent text-btn-active-text'
              : 'bg-error-text text-white'
        }`}>
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

      <div 
        className="game-background game-area flex-1"
        onClick={(e) => {
          // Deselect cell when clicking on game-area background (outside game-container)
          // The event target will be the game-area div itself when clicking the outer edges
          if (e.target === e.currentTarget) {
            deselectCell()
            setEraseMode(false)
            clearMoveHighlight()
          }
        }}
      >

        {/* Game container - sizes based on available height and width */}
        {/* Deselection now handled by global document listener for consistency */}
        <div ref={gameContentRef} className="game-container flex flex-col items-center">
          {/* Board container with pause overlay */}
          <div ref={boardContainerRef} className="relative aspect-square w-full">
          <Board
            board={game.board}
            initialBoard={initialBoard}
            candidates={game.candidates}
            candidatesVersion={game.candidatesVersion}
            selectedCell={selectedCell}
            highlightedDigit={highlightedDigit}
            highlight={currentHighlight}
            onCellClick={handleCellClick}
            onCellChange={handleCellChange}
            incorrectCells={incorrectCells}
            className={timerControl.isPausedDueToVisibility && !game.isComplete ? 'blur-md' : ''}
          />
          
          {/* Pause overlay - minimal overlay when board is blurred */}
          {timerControl.isPausedDueToVisibility && !game.isComplete && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center rounded-xl z-20"
              onClick={() => {
                // Clicking the overlay brings focus back, which auto-resumes the timer
                window.focus()
              }}
            >
              <div className="bg-background/80 backdrop-blur-sm rounded-2xl px-8 py-6 shadow-lg border border-border-light">
                <div className="flex flex-col items-center text-center">
                  <div className="text-4xl mb-3">
                    <svg className="w-12 h-12 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">Game Paused</h3>
                  <p className="text-sm text-foreground-muted mb-3">
                    Click anywhere to continue
                  </p>
                  <PauseOverlayTimer />
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Controls - same width as board, scales with container */}
          <div ref={controlsContainerRef} className="w-full flex-shrink-0">
            <Controls
              notesMode={notesMode}
              onNotesToggle={handleNotesToggle}
              onDigit={handleDigitInput}
              onEraseMode={handleEraseMode}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={autoSolve.isAutoSolving ? (autoSolve.isPaused && autoSolve.canStepBack) : game.canUndo}
              canRedo={autoSolve.isAutoSolving ? (autoSolve.isPaused && autoSolve.canStepForward) : game.canRedo}
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
        onClose={() => setHistoryOpen(false)}
        onMoveClick={(move, index) => {
          setMoveHighlight(move as MoveHighlight, index)
        }}
        onTechniqueClick={(technique) => setTechniqueModal(technique)}
        selectedMoveIndex={selectedMoveIndex}
        autoSolveStepsUsed={autoSolveStepsUsed}
        autoSolveErrorsFixed={autoSolveErrorsFixed}
        isComplete={game.isComplete}
        autoFillUsed={autoFillUsed}
      />

      <ResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        seed={completedDailyScore?.seed || puzzle?.seed || ''}
        difficulty={completedDailyScore?.difficulty as Difficulty || difficulty}
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
        onClose={() => setTechniquesListOpen(false)}
      />

      {/* Confirmation Dialogs */}
      <GameModals
        solveConfirmOpen={solveConfirmOpen}
        setSolveConfirmOpen={setSolveConfirmOpen}
        onSolve={handleSolve}
        isSolving={autoSolve.isFetching}
        showClearConfirm={showClearConfirm}
        setShowClearConfirm={setShowClearConfirm}
        isComplete={game.isComplete}
        onRestart={handleRestart}
        onClearAll={handleClearAll}
        showSolutionConfirm={showSolutionConfirm}
        setShowSolutionConfirm={setShowSolutionConfirm}
        unpinpointableErrorMessage={unpinpointableErrorInfo?.message || null}
        onCheckAndFix={handleCheckAndFix}
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

      {/* In-Progress Game Confirmation Modal */}
      {showInProgressConfirm && existingInProgressGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-background-secondary p-6 shadow-theme">
            <h2 className="mb-2 text-lg font-semibold text-foreground">Game In Progress</h2>
            <p className="mb-6 text-sm text-foreground-muted">
              You have a <span className="capitalize font-medium">{existingInProgressGame.difficulty}</span> game 
              in progress ({existingInProgressGame.progress}% complete). 
              Do you want to continue that game or start a new one?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleStartNewGame}
                className="flex-1 rounded-lg border border-board-border-light px-4 py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
              >
                Start New
              </button>
              <button
                onClick={handleResumeExistingGame}
                className="flex-1 rounded-lg bg-accent px-4 py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Difficulty Chooser Modal - shown when opening shared link without difficulty */}
      {showDifficultyChooser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-theme">
            <h2 className="text-xl font-semibold text-foreground text-center mb-2">
              Choose Difficulty
            </h2>
            <p className="text-sm text-foreground-muted text-center mb-6">
              Select a difficulty level to start the puzzle
            </p>
            <div className="flex justify-center">
              <DifficultyGrid
                seed={seed || ''}
                lastSelected={null}
                onSelect={() => {}}
                onBeforeNavigate={(path) => {
                  // Extract difficulty from path (e.g., "/?d=medium" -> "medium")
                  const match = path.match(/d=(\w+)/)
                  if (match && match[1]) {
                    const diff = match[1] as Difficulty
                    setSelectedDifficulty(diff)
                    setShowDifficultyChooser(false)
                    // Update URL without triggering navigation/re-render
                    window.history.replaceState(null, '', `${location.pathname}?d=${diff}`)
                  }
                  return false // Prevent grid's own navigation
                }}
              />
            </div>
          </div>
        </div>
      )}
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
  return (
    <TimerProvider pauseOnHidden={true}>
      <GameContent />
    </TimerProvider>
  )
}
