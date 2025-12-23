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
import DifficultyGrid from '../components/DifficultyGrid'
import { Difficulty } from '../lib/hooks'
import { useTheme } from '../lib/ThemeContext'
import { useGameContext } from '../lib/GameContext'
import { useGameTimer } from '../hooks/useGameTimer'
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
import { getAutoSolveSpeed, AutoSolveSpeed, AUTO_SOLVE_SPEEDS, getHideTimer, setHideTimer, getStepByStepMode } from '../lib/preferences'
import { getAutoSaveEnabled, getMostRecentGame, clearInProgressGame, type SavedGameInfo } from '../lib/gameSettings'
import { validateBoard, validateCustomPuzzle, solveAll, getPuzzle, cleanupSolver } from '../lib/solver-service'
import { copyToClipboard, COPY_TOAST_DURATION } from '../lib/clipboard'

import { saveScore, markDailyCompleted, isTodayCompleted, getTodayUTC, getScores, type Score } from '../lib/scores'
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
}

interface PuzzleData {
  puzzle_id: string
  seed: string
  difficulty: string
  givens: number[]
  solution: number[]
}

export default function Game() {
  const { seed, encoded } = useParams<{ seed?: string; encoded?: string }>()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  
  // Determine if this is an encoded custom puzzle (from /c/:encoded route)
  const isEncodedCustom = location.pathname.startsWith('/c/') && encoded
  
  // Check if difficulty was provided in URL - if not, we need to show chooser
  const difficultyParam = searchParams.get('d')
  const needsDifficultyChoice = !difficultyParam && !isEncodedCustom && !seed?.startsWith('custom-') && !seed?.startsWith('practice-')
  
  // Check if this is today's daily puzzle and user already completed it
  const isTodaysDailyPuzzle = seed === `daily-${getTodayUTC()}`
  const alreadyCompletedToday = isTodaysDailyPuzzle && isTodayCompleted()
  
  // Get the completed score for today's daily if already completed
  const completedDailyScore = alreadyCompletedToday 
    ? getScores().find(s => s.seed === seed)
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
    selectedDifficulty || difficultyParam || (seed?.startsWith('custom-') ? 'custom' : 'medium')
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
  const [unpinpointableErrorInfo, setUnpinpointableErrorInfo] = useState<{ message: string; count: number } | null>(null)
  const [bugReportCopied, setBugReportCopied] = useState(false)
  const [autoFillUsed, setAutoFillUsed] = useState(false)
  const [autoSolveUsed, setAutoSolveUsed] = useState(false)
  const autoSolveUsedRef = useRef(false)  // Ref for immediate access in callbacks
  const [autoSolveStepsUsed, setAutoSolveStepsUsed] = useState(0)
  const [autoSolveErrorsFixed, setAutoSolveErrorsFixed] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [techniqueHintsUsed, setTechniqueHintsUsed] = useState(0)
  const [techniqueHintPending, setTechniqueHintPending] = useState(false) // Disables technique hint button until user makes a move
  const [hintLoading, setHintLoading] = useState(false) // Loading spinner for hint button
  const [techniqueHintLoading, setTechniqueHintLoading] = useState(false) // Loading spinner for technique hint button
  const [validationMessage, setValidationMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [autoSolveSpeedState, setAutoSolveSpeedState] = useState<AutoSolveSpeed>(getAutoSolveSpeed())
  const [hideTimerState, setHideTimerState] = useState(getHideTimer())

  // Track whether we've restored saved state (to prevent overwriting on initial load)
  const hasRestoredSavedState = useRef(false)
  // Track isComplete at execution time (to prevent race condition with debounced saves)
  const isCompleteRef = useRef(false)
  // Guard to prevent concurrent hint requests (ref is more reliable than state for this)
  const hintInProgress = useRef(false)
  // Cached solution moves - invalidated when user makes manual changes
  const cachedSolutionMoves = useRef<Array<{
    board: number[]
    candidates: (number[] | null)[]
    move: Move
  }>>([])
  // Track the history length when solution was cached, to detect user changes
  const cachedAtHistoryLength = useRef<number>(-1)
  // Track if there are unsaved changes when backgrounded
  const hasUnsavedChanges = useRef(false)
  // Track the last time we were hidden
  const wasHiddenRef = useRef(false)

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

   // Timer hook
   const timer = useGameTimer({ pauseOnHidden: true, backgroundManager })

   // Game state hook - only initialize after we have the initial board
   const game = useSudokuGame({
     initialBoard: initialBoard.length === 81 ? initialBoard : Array(81).fill(0),
     onComplete: () => {
       timer.pauseTimer()
       handleSubmit()
     },
    })

   // Auto-solve hook - fetches all moves at once and plays them back
  const autoSolve = useAutoSolve({
    stepDelay: AUTO_SOLVE_SPEEDS[autoSolveSpeedState],
    gamePaused: timer.isPausedDueToVisibility || isExtendedPaused,
    backgroundManager,
    getBoard: () => game.board,
    getCandidates: () => {
      // Convert Uint16Array to Set<number>[] for legacy API compatibility
      const arrays = candidatesToArrays(game.candidates)
      return arrays.map(arr => new Set(arr))
    },
    getGivens: () => initialBoard,
    applyMove: (newBoard, newCandidates, move, index) => {
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
    },
    applyState: (board, candidates, move, index) => {
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
    },
    isComplete: () => game.isComplete,
    onError: (message) => {
      setValidationMessage({ type: 'error', message })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
    },
    onUnpinpointableError: (message, count) => {
      setUnpinpointableErrorInfo({ message, count })
      setShowSolutionConfirm(true)
    },
    onStatus: (message) => {
      throttledSetValidationMessage({ type: 'success', message })
      visibilityAwareTimeout(() => setValidationMessage(null), 2000)
    },
    onErrorFixed: (message, resumeCallback) => {
      // Show toast for fix-error (longer duration than normal hints)
      setValidationMessage({ type: 'error', message: `Fixed: ${message}` })
      // Clear toast after full duration
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_FIX_ERROR)
      // But resume solving sooner for better UX
      visibilityAwareTimeout(resumeCallback, ERROR_FIX_RESUME_DELAY)
    },
    onStepNavigate: (move) => {
      // Show toast with move explanation when stepping through autosolve
      // Toast persists until next step or autosolve stops (no timeout)
      if (move) {
        setValidationMessage({ type: 'success', message: move.explanation })
      } else {
        // Stepped back to initial state
        setValidationMessage({ type: 'success', message: 'Initial state' })
      }
    },
  })

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
      timer.pauseTimer()
    }, EXTENDED_PAUSE_DELAY)

    return () => clearTimeout(timeout)
  }, [backgroundManager.isHidden, autoSolve, timer])

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
    // Skip if navigating from Homepage (it handles this already)
    if (sessionStorage.getItem('from_homepage')) {
      sessionStorage.removeItem('from_homepage')
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
      navigate(`/${existingInProgressGame.seed}?d=${existingInProgressGame.difficulty}`)
    }
    setShowInProgressConfirm(false)
  }, [existingInProgressGame, navigate])

  const handleStartNewGame = useCallback(() => {
    if (existingInProgressGame) {
      clearInProgressGame(existingInProgressGame.seed)
    }
    setShowInProgressConfirm(false)
    setExistingInProgressGame(null)
  }, [existingInProgressGame])

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  // Get storage key for the current puzzle
  const getStorageKey = useCallback((puzzleSeed: string) => {
    return `${STORAGE_KEYS.GAME_STATE_PREFIX}${puzzleSeed}`
  }, [])

  // Save game state to localStorage
  const saveGameState = useCallback(() => {
    // Use ref to check isComplete at execution time (not closure time)
    // This prevents race condition where debounced save fires after completion
    if (!puzzle || isCompleteRef.current || !hasRestoredSavedState.current) return
    
    const storageKey = getStorageKey(puzzle.seed)
    const savedState: SavedGameState = {
      board: game.board,
      candidates: candidatesToArrays(game.candidates),
      elapsedMs: timer.elapsedMs,
      history: game.history,
      autoFillUsed,
      savedAt: Date.now(),
      difficulty: puzzle.difficulty,
    }
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedState))
    } catch (e) {
      console.warn('Failed to save game state:', e)
    }
  // Note: We use isCompleteRef instead of game.isComplete to avoid stale closure issues
  }, [puzzle, game.board, game.candidates, game.history, timer.elapsedMs, autoFillUsed, getStorageKey])

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

  // Invalidate cached solution when user makes manual changes
  const invalidateCachedSolution = useCallback(() => {
    cachedSolutionMoves.current = []
    cachedAtHistoryLength.current = -1
  }, [])

  // Clear all user entries (keeps timer running)
  const handleClearAll = useCallback(() => {
    game.clearAll()
    clearSavedGameState()
    invalidateCachedSolution()
    clearAllAndDeselect()
    setNotesMode(false)
    setAutoSolveStepsUsed(0)
    setAutoSolveErrorsFixed(0)
  }, [game, clearSavedGameState, invalidateCachedSolution, clearAllAndDeselect])

  // Restart puzzle (clears all AND resets timer)
  const handleRestart = useCallback(() => {
    game.resetGame()
    clearSavedGameState()
    invalidateCachedSolution()
    timer.resetTimer()
    timer.startTimer()
    clearAllAndDeselect()
    setNotesMode(false)
    setHintsUsed(0)
    setAutoFillUsed(false)
    setAutoSolveUsed(false)
    autoSolveUsedRef.current = false
    setAutoSolveStepsUsed(0)
    setAutoSolveErrorsFixed(0)
    setShowResultModal(false)
  }, [game, timer, clearSavedGameState, invalidateCachedSolution, clearAllAndDeselect])

  // Auto-fill notes based on current board state
  const autoFillNotes = useCallback(() => {
    if (game.board.length !== 81) return
    const newCandidates = game.fillAllCandidates(game.board)
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
    invalidateCachedSolution()
    setAutoFillUsed(true)
  }, [game, invalidateCachedSolution])

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

  // Core hint step logic - uses cached solution or fetches new one
  // Returns true if more steps available, false otherwise
  const executeHintStep = useCallback(async (showNotification: boolean = true): Promise<boolean> => {
    // Deselect any highlighted digit when using hint
    clearAllAndDeselect()

    // Check if we need to fetch a new solution
    // Invalidate cache if user made changes (history length changed unexpectedly)
    const userMadeChanges = cachedAtHistoryLength.current >= 0 && 
                            game.history.length !== cachedAtHistoryLength.current

    if (userMadeChanges || cachedSolutionMoves.current.length === 0) {
      // Fetch fresh solution from current state
      const boardSnapshot = [...game.board]
      const candidatesArray = candidatesToArrays(game.candidates)

      try {
        const data = await solveAll(boardSnapshot, candidatesArray, initialBoard)
        
        if (!data.moves || data.moves.length === 0) {
          if (showNotification) {
            setValidationMessage({ 
              type: 'error', 
              message: data.solved 
                ? 'Puzzle is already complete!' 
                : 'This puzzle requires advanced techniques beyond our hint system.' 
            })
            visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
          }
          return false
        }

        // Cache the solution
        cachedSolutionMoves.current = [...data.moves]
        cachedAtHistoryLength.current = game.history.length
      } catch (err) {
        console.error('Hint error:', err)
        if (showNotification) {
          setValidationMessage({ type: 'error', message: err instanceof Error ? err.message : 'Failed to get hint' })
          visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return false
      }
    }

    // Get the next move from cache
    const nextMoveResult = cachedSolutionMoves.current.shift()
    if (!nextMoveResult) {
      if (showNotification) {
        setValidationMessage({ type: 'success', message: 'Puzzle complete!' })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
      }
      return false
    }

    const move = nextMoveResult.move

    // Handle special moves
    if (move.action === 'unpinpointable-error') {
      invalidateCachedSolution()
      setUnpinpointableErrorInfo({ 
        message: move.explanation || `Couldn't pinpoint the error.`, 
        count: (move as unknown as { userEntryCount?: number }).userEntryCount || 0 
      })
      setShowSolutionConfirm(true)
      return false
    }

    if (move.action === 'contradiction' || move.action === 'error') {
      invalidateCachedSolution()
      if (game.canUndo) {
        game.undo()
        clearMoveHighlight()
        if (showNotification) {
          setValidationMessage({ 
            type: 'error', 
            message: move.explanation || 'Contradiction found - undoing last move'
          })
          visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return true // More steps available after backtrack
      } else {
        if (showNotification) {
          setValidationMessage({ 
            type: 'error', 
            message: 'The puzzle cannot be solved - initial state has errors.'
          })
          visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        }
        return false
      }
    }

    // Apply the move
    const newBoard = nextMoveResult.board
    const newCandidates = nextMoveResult.candidates
      ? arraysToCandidates(nextMoveResult.candidates.map(cellCands => cellCands || []))
      : new Uint16Array(81)

    game.applyExternalMove(newBoard, newCandidates, move)
    // Update the cached history length to account for this hint
    cachedAtHistoryLength.current = game.history.length + 1
    
    setMoveHighlight(move as MoveHighlight, game.history.length)

    if (showNotification) {
      const firstTarget = move.targets?.[0]
      const techniqueName = move.technique === 'fill-candidate' && firstTarget
        ? `Added ${move.digit} to R${firstTarget.row + 1}C${firstTarget.col + 1}`
        : (move.technique || 'Hint')
      setValidationMessage({ 
        type: 'success', 
        message: techniqueName
      })
      visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
    }

    // Check if more moves available
    return cachedSolutionMoves.current.length > 0 || newBoard.some(v => v === 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- clearAllAndDeselect and setMoveHighlight are stable callbacks
  }, [game, initialBoard, invalidateCachedSolution, visibilityAwareTimeout])

  // Handle hint button - calls executeHintStep with notifications and increments counter
  const handleNext = useCallback(async () => {
    // Prevent concurrent hint requests (spam protection)
    if (hintInProgress.current) return
    hintInProgress.current = true
    setHintLoading(true)
    try {
      const result = await executeHintStep(true)
      if (result !== false) {
        // Only count as hint if it was successful (not an error)
        setHintsUsed(prev => prev + 1)
        // Also re-enable technique hint button since we applied a move
        setTechniqueHintPending(false)
      }
    } finally {
      hintInProgress.current = false
      setHintLoading(false)
    }
  }, [executeHintStep])

  // Handle technique hint button - shows technique modal without applying the move
  const handleTechniqueHint = useCallback(async () => {
    // If already shown a technique, wait for user to make a move
    if (techniqueHintPending) return
    // Prevent concurrent requests
    if (hintInProgress.current) return
    hintInProgress.current = true
    setTechniqueHintLoading(true)

    try {
      // Deselect any highlighted digit when using technique hint
      clearAllAndDeselect()

      // Check if we need to fetch a new solution
      const userMadeChanges = cachedAtHistoryLength.current >= 0 && 
                              game.history.length !== cachedAtHistoryLength.current

      if (userMadeChanges || cachedSolutionMoves.current.length === 0) {
        // Fetch fresh solution from current state
        const boardSnapshot = [...game.board]
        const candidatesArray = candidatesToArrays(game.candidates)

        try {
          const data = await solveAll(boardSnapshot, candidatesArray, initialBoard)
          
          if (!data.moves || data.moves.length === 0) {
            setValidationMessage({ 
              type: 'error', 
              message: data.solved 
                ? 'Puzzle is already complete!' 
                : 'This puzzle requires advanced techniques beyond our hint system.' 
            })
            visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
            return
          }

          // Cache the solution
          cachedSolutionMoves.current = [...data.moves]
          cachedAtHistoryLength.current = game.history.length
        } catch (err) {
          console.error('Technique hint error:', err)
          setValidationMessage({ type: 'error', message: err instanceof Error ? err.message : 'Failed to get technique' })
          visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
          return
        }
      }

      // Peek at the next move WITHOUT consuming it
      const nextMove = cachedSolutionMoves.current[0]
      if (!nextMove) {
        setValidationMessage({ type: 'success', message: 'Puzzle complete!' })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_INFO)
        return
      }

      const move = nextMove.move

      // If the next move is just filling candidates, show a helpful message instead of the modal
      if (move.technique === 'fill-candidate') {
        setValidationMessage({ 
          type: 'error', 
          message: 'Fill in some candidates first, or use 💡 Hint to get started'
        })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        return
      }

      // Handle special moves - for these, just show a message
      if (move.action === 'unpinpointable-error' || move.action === 'contradiction' || move.action === 'error') {
        setValidationMessage({ 
          type: 'error', 
          message: 'There seems to be an error in the puzzle. Try using the full hint to fix it.'
        })
        visibilityAwareTimeout(() => setValidationMessage(null), TOAST_DURATION_ERROR)
        return
      }

      // Get the technique info
      const techniqueName = move.technique || 'Unknown Technique'
      const techniqueSlug = move.technique?.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-') || 'unknown'

      // Open the technique modal
      setTechniqueModal({ title: techniqueName, slug: techniqueSlug })

      // Increment counter and disable button until user makes a move
      setTechniqueHintsUsed(prev => prev + 1)
      setTechniqueHintPending(true)
    } finally {
      hintInProgress.current = false
      setTechniqueHintLoading(false)
    }
  }, [techniqueHintPending, game.board, game.candidates, game.history.length, initialBoard, clearAllAndDeselect, visibilityAwareTimeout])

    // Resume from extended pause on user interaction
    const resumeFromExtendedPause = useCallback(() => {
      if (isExtendedPaused) {
        setIsExtendedPaused(false)
      }
    }, [isExtendedPaused])

    // Cell click handler
    const handleCellClick = useCallback((idx: number) => {
      resumeFromExtendedPause()
     // If a digit is already highlighted and we're clicking a given cell,
     // only block if we're NOT coming from another given cell (allow given-to-given navigation)
     if (highlightedDigit !== null && game.isGivenCell(idx)) {
       if (selectedCell === null || !game.isGivenCell(selectedCell)) {
         return
       }
       // Fall through to handle given cell click normally (switch between given cells)
     }
     
     // Given cells: highlight the digit AND select the cell for peer highlighting
     if (game.isGivenCell(idx)) {
       const cellDigit = game.board[idx]
       if (cellDigit && cellDigit > 0) {
         // Toggle: if same given cell is clicked again, deselect
         if (selectedCell === idx) {
           clearAllAndDeselect()
         } else {
           clickGivenCell(cellDigit, idx)
         }
       }
       setEraseMode(false)
       return
     }

     // Toggle selection: clicking the same cell again deselects it (highest priority for user-fillable cells)
     if (selectedCell === idx) {
       clearAllAndDeselect()
       return
     }

     // If erase mode is active and cell has a value, erase it
      if (eraseMode && game.board[idx] !== 0) {
        game.eraseCell(idx)
        clearAfterErase()
        setTechniqueHintPending(false) // Re-enable technique hint button
        // Keep erase mode active so user can erase multiple cells
        return
      }

       // If a digit is highlighted, fill the cell (overwriting any existing value)
       if (highlightedDigit !== null) {
         if (notesMode) {
           game.setCell(idx, highlightedDigit, notesMode)
           
           // Clear all move-related highlights (cell backgrounds) but preserve digit highlight for multi-fill
           clearAfterUserCandidateOp()
           setTechniqueHintPending(false) // Re-enable technique hint button
         } else {
           // For digit placement, clear move highlights but preserve digit highlight for multi-fill
           game.setCell(idx, highlightedDigit, notesMode)
           clearAfterDigitPlacement()
           setTechniqueHintPending(false) // Re-enable technique hint button
         }
         return
       }

     // Select the cell (works for both empty and user-filled cells)
     // selectCell atomically selects and clears highlights
     selectCell(idx)
     setEraseMode(false)
   }, [game, highlightedDigit, eraseMode, notesMode, selectedCell, selectCell, clearAllAndDeselect, clearAfterErase, clearAfterUserCandidateOp, clearAfterDigitPlacement, clickGivenCell, resumeFromExtendedPause])

    // Digit input handler
    const handleDigitInput = useCallback((digit: number) => {
      resumeFromExtendedPause()
      // Clear erase mode when selecting a digit
     setEraseMode(false)

     // If no cell selected, toggle digit highlight for multi-fill mode
     if (selectedCell === null) {
       toggleDigitHighlight(digit)
       return
     }

     // If a given cell is selected, deselect it and toggle digit highlight for multi-fill mode
     if (game.isGivenCell(selectedCell)) {
       deselectCell()
       toggleDigitHighlight(digit)
       return
     }

     // If cell already has this digit, erase it
      if (game.board[selectedCell] === digit) {
        game.eraseCell(selectedCell)
        clearAfterDigitToggle()
        setTechniqueHintPending(false) // Re-enable technique hint button
        return
      }

       game.setCell(selectedCell, digit, notesMode)

       if (notesMode) {
         // Clear all move-related highlights (cell backgrounds) but preserve digit highlight for multi-fill
         clearAfterUserCandidateOp()
       } else {
         // For digit placement, clear move highlights but preserve digit highlight for multi-fill
         clearAfterDigitPlacement()
       }
       setTechniqueHintPending(false) // Re-enable technique hint button

       // Keep cell selected so user can erase or change immediately
       // Keep digit highlighted for adding candidates (multi-fill)
     // eslint-disable-next-line react-hooks/exhaustive-deps -- resumeFromExtendedPause is a stable callback
     }, [game, selectedCell, notesMode, toggleDigitHighlight, clearAfterDigitToggle, clearAfterUserCandidateOp, clearAfterDigitPlacement, deselectCell])

    // Keyboard cell change handler (from Board component)
    const handleCellChange = useCallback((idx: number, value: number) => {
      resumeFromExtendedPause()
      if (game.isGivenCell(idx)) return
     if (value === 0) {
       game.eraseCell(idx)
       clearAfterErase()
       setTechniqueHintPending(false) // Re-enable technique hint button
        } else {
          if (notesMode) {
            game.setCell(idx, value, notesMode)
            
            // Clear all move-related highlights (cell backgrounds) but preserve digit highlight for multi-fill
            clearAfterUserCandidateOp()
          } else {
            game.setCell(idx, value, notesMode)
            clearAfterDigitPlacement()
          }
          setTechniqueHintPending(false) // Re-enable technique hint button
        }
     // eslint-disable-next-line react-hooks/exhaustive-deps -- resumeFromExtendedPause is a stable callback
     }, [game, notesMode, clearAfterErase, clearAfterUserCandidateOp, clearAfterDigitPlacement])

  // Toggle erase mode handler
  const handleEraseMode = useCallback(() => {
    setEraseMode(prev => !prev)
    clearOnModeChange()
  }, [clearOnModeChange])

  // Undo handler - during auto-solve, this steps backward
  const handleUndo = useCallback(() => {
    if (autoSolve.isAutoSolving) {
      autoSolve.stepBack()
    } else {
      game.undo()
      invalidateCachedSolution()
      // Clear selection and move highlights, but preserve highlightedDigit for multi-fill mode
      deselectCell()
      clearMoveHighlight()
    }
  }, [game, autoSolve, invalidateCachedSolution, deselectCell, clearMoveHighlight])

  // Redo handler - during auto-solve, this steps forward
  const handleRedo = useCallback(() => {
    if (autoSolve.isAutoSolving) {
      autoSolve.stepForward()
    } else {
      game.redo()
      invalidateCachedSolution()
      // Clear selection and highlights after redo
      clearAllAndDeselect()
    }
  }, [game, autoSolve, invalidateCachedSolution, clearAllAndDeselect])

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!puzzle) return

    const score: Score = {
      seed: puzzle.seed,
      difficulty: puzzle.difficulty,
      timeMs: timer.elapsedMs,
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
  }, [puzzle, hintsUsed, techniqueHintsUsed, timer.elapsedMs, encodedPuzzle, autoFillUsed])

  // Auto-solve handler
  const handleSolve = useCallback(async () => {
    clearAllAndDeselect()
    setAutoSolveUsed(true)
    autoSolveUsedRef.current = true
    // Use restartAutoSolve to respect step-by-step preference
    await autoSolve.restartAutoSolve(getStepByStepMode())
  }, [autoSolve, clearAllAndDeselect])

  // Auto-solve restart handler
  const handleRestartAutoSolve = useCallback(async () => {
    clearAllAndDeselect()
    await autoSolve.restartAutoSolve(getStepByStepMode())
  }, [autoSolve, clearAllAndDeselect])

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
        elapsedMs: timer.elapsedMs,
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
- **Time:** ${Math.floor(timer.elapsedMs / 1000)}s

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
  }, [puzzle, initialBoard, game, timer.elapsedMs, colorTheme, mode, visibilityAwareTimeout])

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
      // Encode full board state with givens marker
      const encoded = encodePuzzleWithState(game.board, initialBoard)
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
  }, [game.board, initialBoard, visibilityAwareTimeout])

  // ============================================================
  // EFFECTS
  // ============================================================

  // Clear selection when clicking on background (only deselect cell, keep digit highlight)
  useEffect(() => {
    const handleBackgroundClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.classList.contains('game-background')) {
        deselectCell()
        // Don't clear highlightedDigit - user may want to keep filling cells
        clearMoveHighlight()
      }
    }
    document.addEventListener('click', handleBackgroundClick)
    return () => document.removeEventListener('click', handleBackgroundClick)
  }, [deselectCell, clearMoveHighlight])

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- clearAllAndDeselect is a stable callback
  }, [
    handleUndo, handleRedo, handleNext, handleValidate,
    showResultModal, historyOpen, techniqueModal, techniquesListOpen,
    solveConfirmOpen, showClearConfirm
  ])

  // Sync game state to global context for header
  useEffect(() => {
    if (!loading && puzzle) {
      setGameState({
        isPlaying: true,
        difficulty,
        elapsedMs: timer.elapsedMs, // Static snapshot, not updated every second
        historyCount: game.history.length,
        isComplete: game.isComplete,
        onHint: null,
        onHistory: () => setHistoryOpen(true),
        onAutoFillNotes: autoFillNotes,
      })
    }
    return () => setGameState(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- timer.elapsedMs is intentionally not included to avoid constant re-renders
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
      setAutoSolveStepsUsed(prev => prev + autoSolve.lastCompletedSteps)
      // Count fix-error moves in history (these are errors that were fixed during autosolve)
      const errorsFixed = game.history.filter(move => move.action === 'fix-error').length
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
    if (!seed && !isEncodedCustom) return

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

        if (isEncodedCustom && encoded) {
          // Check if this is a full-state sharing link (starts with 'e')
          if (encoded.startsWith('e')) {
            const decoded = decodePuzzleWithState(encoded)
            if (!decoded) {
              throw new Error('Invalid puzzle link. The puzzle could not be decoded.')
            }
            
            // decoded.board is the full state (including user entries)
            // decoded.givens are the original givens (editable cells will have 0)
            givens = decoded.givens
            initialState = decoded.board
            
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
        } else if (difficulty === 'custom' && seed?.startsWith('custom-')) {
          const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${seed}`)
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
            puzzle_id: seed,
            seed: seed,
            difficulty: 'custom',
            givens: givens,
            solution: puzzleSolution,
          }
        } else if (seed?.startsWith('practice-')) {
          // Practice puzzles are stored in localStorage by TechniqueDetailView
          const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${seed}`)
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
            puzzle_id: seed,
            seed: seed,
            difficulty: difficulty,
            givens: givens,
            solution: puzzleSolution,
          }
        } else {
          // Fetch puzzle from static pool (synchronous, no WASM needed)
          const fetchedPuzzle = getPuzzle(seed ?? '', difficulty)
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

        // Don't start timer for completed daily puzzles or when choosing difficulty
        if (!alreadyCompletedToday && !showDifficultyChooser) {
          timer.resetTimer()
          timer.startTimer()
        }
        setLoading(false)

        // Restore shared state if available
        if (initialState) {
          const uint16Candidates = arraysToCandidates(Array(81).fill(null).map(() => []))
          game.restoreState(initialState, uint16Candidates, [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    loadPuzzle()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- timer and clearAllAndDeselect are stable callbacks
  }, [seed, encoded, isEncodedCustom, difficulty, alreadyCompletedToday, showDifficultyChooser, showOnboarding])

  // Reset game state when initialBoard changes (new puzzle loaded) and restore saved state if available
  useEffect(() => {
    if (initialBoard.length === 81 && puzzle) {
      // Check for saved state for this puzzle
      const savedState = loadSavedGameState(puzzle.seed)
      
      if (savedState) {
        // Restore saved state
        const restoredCandidates = arraysToCandidates(savedState.candidates)
        game.restoreState(savedState.board, restoredCandidates, savedState.history)
        timer.setElapsedMs(savedState.elapsedMs)
        setAutoFillUsed(savedState.autoFillUsed)
      } else {
        // Start fresh
        game.resetGame()
      }
      
      hasRestoredSavedState.current = true
    }
  // Note: We intentionally only trigger this when initialBoard or puzzle changes
  // game.restoreState and game.resetGame are stable callbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Clear saved state when puzzle is completed
  useEffect(() => {
    if (game.isComplete && puzzle) {
      clearSavedGameState()
    }
  }, [game.isComplete, puzzle, clearSavedGameState])

  // Pause timer when game is complete
  useEffect(() => {
    if (game.isComplete) {
      timer.pauseTimer()
    }
  }, [game.isComplete, timer])

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
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      {/* Game Header */}
      <GameHeader
        difficulty={difficulty}
        formatTime={timer.formatTime}
        isPausedDueToVisibility={timer.isPausedDueToVisibility}
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
        onRestartAutoSolve={handleRestartAutoSolve}
        onSetAutoSolveSpeed={setAutoSolveSpeedState}
        onTechniqueHint={handleTechniqueHint}
        techniqueHintDisabled={techniqueHintPending}
        techniqueHintLoading={techniqueHintLoading}
        onHint={handleNext}
        hintLoading={hintLoading}
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
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg ${
          validationMessage.type === 'success' 
            ? 'bg-accent text-btn-active-text' 
            : 'bg-error-text text-white'
        }`}>
          {validationMessage.message}
        </div>
      )}

      <div 
        className="game-background game-area flex-1"
        onClick={(e) => {
          // Deselect cell when clicking on the background (not on board or controls)
          // Keep highlightedDigit for multi-fill workflow
          if (e.target === e.currentTarget) {
            deselectCell()
            setEraseMode(false)
            clearMoveHighlight()
          }
        }}
      >

        {/* Game container - sizes based on available height and width */}
        <div className="game-container flex flex-col items-center">
          {/* Board container with pause overlay */}
          <div className="relative aspect-square w-full">
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
          />
          
          {/* Pause overlay - shown when timer is paused due to tab/window losing focus */}
          {timer.isPausedDueToVisibility && !game.isComplete && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md rounded-xl z-20"
              onClick={() => {
                // Clicking the overlay brings focus back, which auto-resumes the timer
                window.focus()
              }}
            >
              <div className="text-6xl mb-4">
                <svg className="w-16 h-16 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Game Paused</h3>
              <p className="text-sm text-foreground-muted text-center px-4">
                Click anywhere or return to this tab to continue
              </p>
              <div className="mt-4 text-2xl font-mono text-accent">
                {timer.formatTime()}
              </div>
            </div>
          )}
          </div>

          {/* Controls - same width as board, scales with container */}
          <div className="w-full flex-shrink-0">
            <Controls
              notesMode={notesMode}
              onNotesToggle={() => setNotesMode(!notesMode)}
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
        timeMs={completedDailyScore?.timeMs || timer.elapsedMs}
        hintsUsed={completedDailyScore?.hintsUsed || hintsUsed}
        techniqueHintsUsed={completedDailyScore?.techniqueHintsUsed || techniqueHintsUsed}
        autoFillUsed={completedDailyScore?.autoFillUsed || autoFillUsed}
        autoSolveUsed={completedDailyScore?.autoSolveUsed || autoSolveUsed}
        encodedPuzzle={completedDailyScore?.encodedPuzzle || encodedPuzzle}
      />

      <TechniqueModal
        isOpen={techniqueModal !== null}
        onClose={() => setTechniqueModal(null)}
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
        onShowSolution={autoSolve.solveFromGivens}
      />

      {/* Onboarding Modal - shown for first-time users */}
      <AboutModal isOpen={showAbout} onClose={closeAboutModal} isOnboarding={isOnboarding} />

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
