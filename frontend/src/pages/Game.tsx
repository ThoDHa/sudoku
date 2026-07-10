import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { commitCellAction } from '../lib/commitCellAction'
import { isDigitComplete } from '../lib/digitCompletion'
import { buildFreshTrackingState } from '../lib/gameStateReset'
import { shouldIncrementHintCounter } from '../lib/hintLifecycle'
import { shouldSuppressAutoSave } from '../lib/autoSaveGuard'
import { createHintRequestGate, type HintRequestGate } from '../lib/hintRequestGate'
import { useParams, useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import Board from '../components/Board'
import Controls from '../components/Controls'
import History from '../components/History'
import { CloseIcon } from '../components/ui'
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
import { useToastClearTimer } from '../hooks/useToastClearTimer'
import { useFrozenWhenHidden } from '../hooks/useFrozenWhenHidden'
import type { Move } from '../hooks/useSudokuGame'
import { logger } from '../lib/logger'
import {
  TOAST_DURATION_INFO,
  TOAST_DURATION_ERROR,
  TOAST_DURATION_FIX_ERROR,
  ERROR_FIX_RESUME_DELAY,
  EXTENDED_PAUSE_DELAY,
  STORAGE_KEYS,
} from '../lib/constants'
import {
  getAutoSolveSpeed,
  AutoSolveSpeed,
  AUTO_SOLVE_SPEEDS,
  getHideTimer,
  setHideTimer,
} from '../lib/preferences'
import {
  getAutoSaveEnabled,
  getMostRecentGame,
  clearInProgressGame,
  clearOtherGamesForMode,
  type SavedGameInfo,
} from '../lib/gameSettings'
import {
  validateBoard,
  validateCustomPuzzle,
  findNextMove,
  getPuzzle,
  cleanupSolver,
  checkAndFixWithSolution,
  getDailySeed,
} from '../lib/solver-service'
import { copyToClipboard, COPY_TOAST_DURATION } from '../lib/clipboard'

import {
  saveScore,
  markDailyCompleted,
  isTodayCompleted,
  getTodayUTC,
  getScores,
  type Score,
} from '../lib/scores'
import { shouldShowDailyPrompt, markDailyPromptShown } from '../lib/dailyPrompt'
import { getGameMode } from '../lib/gameSettings'
import { setShowDailyReminder } from '../lib/preferences'
import { decodePuzzle, encodePuzzle, decodePuzzleWithState } from '../lib/puzzleEncoding'
import { buildPuzzleShareUrl, buildStateShareUrl } from '../lib/shareLinks'
import { candidatesToArrays, arraysToCandidates, countCandidates } from '../lib/candidatesUtils'
import { validateSeed, extractSeedFromStorageKey } from '../lib/seedValidation'
import {
  buildSavedState,
  restoreHintCounters,
  type SavedGameState,
} from '../lib/savedGameState'

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
function getHintSignature(move: {
  technique: string
  action: string
  digit: number
  targets: { row: number; col: number }[]
}): string {
  return `${move.technique}-${move.action}-${move.digit}-${JSON.stringify(move.targets)}`
}

/**
 * Generate a signature for the current board state (cells + candidates).
 * Used to invalidate hint cache when board changes.
 * Candidates are stored as Uint16Array where each element is a bitmask.
 */
function getBoardSignature(board: number[], candidates: Uint16Array): string {
  const candidatesStr = Array.from(candidates).join(',')
  return `${board.join(',')}-${candidatesStr}`
}

/**
 * Format technique name for display (convert slug to title case)
 */
function formatTechniqueName(technique: string): string {
  return technique.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface PuzzleSetup {
  effectiveSeed: string | undefined
  isEncodedCustom: boolean
  needsDifficultyChoice: boolean
  alreadyCompletedToday: boolean
  completedDailyScore: Score | undefined
}

function resolvePuzzleSetup(params: {
  seed: string | undefined
  encoded: string | undefined
  pathname: string
  difficultyParam: string | null
}): PuzzleSetup {
  const { seed, encoded, pathname, difficultyParam } = params
  const effectiveSeed = seed || undefined
  const isEncodedCustom = pathname.startsWith('/c/') && !!encoded
  const needsDifficultyChoice =
    !difficultyParam &&
    !isEncodedCustom &&
    !effectiveSeed?.startsWith('custom-') &&
    !effectiveSeed?.startsWith('practice-')
  const isTodaysDailyPuzzle = effectiveSeed === `daily-${getTodayUTC()}`
  const alreadyCompletedToday = isTodaysDailyPuzzle && isTodayCompleted()
  const completedDailyScore = alreadyCompletedToday
    ? getScores().find((s) => s.seed === effectiveSeed)
    : undefined
  return { effectiveSeed, isEncodedCustom, needsDifficultyChoice, alreadyCompletedToday, completedDailyScore }
}

// Result of resolving where the puzzle comes from for the current route.
interface ResolvedPuzzle {
  givens: number[]
  solution: number[]
  puzzleData: PuzzleData
  initialState: number[] | null
  initialCandidates: number[][] | null
}

// Validate custom givens and build the puzzleData payload shared by the
// full-state and legacy custom-puzzle link branches.
async function validateAndBuildCustom(
  customGivens: number[],
  encoded: string,
  setEncodedPuzzle: (value: string) => void,
): Promise<{ solution: number[]; puzzleData: PuzzleData }> {
  const validation = await validateCustomPuzzle(customGivens, '')
  if (!validation.valid) {
    throw new Error(`Invalid puzzle: ${validation.reason || 'unknown error'}`)
  }
  if (!validation.unique) {
    throw new Error('Invalid puzzle: has multiple solutions')
  }
  if (!validation.solution) {
    throw new Error('Invalid puzzle: could not compute solution')
  }
  setEncodedPuzzle(encoded)
  return {
    solution: validation.solution,
    puzzleData: {
      puzzle_id: `custom-${encoded.substring(0, 8)}`,
      seed: `custom-${encoded.substring(0, 8)}`,
      difficulty: 'custom',
      givens: customGivens,
      solution: validation.solution,
    },
  }
}

// Resolve an encoded custom-puzzle link (full-state or legacy givens-only).
async function resolveEncodedCustom(
  encoded: string,
  setEncodedPuzzle: (value: string) => void,
): Promise<ResolvedPuzzle> {
  let givens: number[]
  let initialState: number[] | null = null
  let initialCandidates: number[][] | null = null

  if (encoded.startsWith('e') || encoded.startsWith('c')) {
    const decoded = decodePuzzleWithState(encoded)
    if (!decoded) {
      throw new Error('Invalid puzzle link. The puzzle could not be decoded.')
    }
    givens = decoded.givens
    initialState = decoded.board
    if (decoded.candidates) {
      initialCandidates = decoded.candidates
    }
  } else {
    try {
      givens = decodePuzzle(encoded)
      if (givens.length !== 81) {
        throw new Error('Invalid puzzle encoding')
      }
    } catch {
      throw new Error('Invalid puzzle link. The puzzle could not be decoded.')
    }
  }

  const { solution, puzzleData } = await validateAndBuildCustom(givens, encoded, setEncodedPuzzle)
  return { givens, solution, puzzleData, initialState, initialCandidates }
}

// Resolve a custom puzzle previously saved to localStorage by its seed.
async function resolveStoredCustom(
  effectiveSeed: string,
  setEncodedPuzzle: (value: string | null) => void,
): Promise<ResolvedPuzzle> {
  const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${effectiveSeed}`)
  if (!storedGivens) {
    throw new Error('Custom puzzle not found. Please re-enter the puzzle.')
  }
  const givens: number[] = JSON.parse(storedGivens)
  const validation = await validateCustomPuzzle(givens, '')
  if (!validation.valid || !validation.unique || !validation.solution) {
    throw new Error('Stored puzzle is invalid')
  }
  setEncodedPuzzle(encodePuzzle(givens))
  return {
    givens,
    solution: validation.solution,
    puzzleData: {
      puzzle_id: effectiveSeed,
      seed: effectiveSeed,
      difficulty: 'custom',
      givens,
      solution: validation.solution,
    },
    initialState: null,
    initialCandidates: null,
  }
}

// Resolve a practice puzzle saved to localStorage by TechniqueDetailView.
async function resolvePractice(
  effectiveSeed: string,
  difficulty: Difficulty,
  setEncodedPuzzle: (value: string | null) => void,
): Promise<ResolvedPuzzle> {
  const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${effectiveSeed}`)
  if (!storedGivens) {
    throw new Error('Practice puzzle not found. Please try again from the technique page.')
  }
  const givens: number[] = JSON.parse(storedGivens)
  const validation = await validateCustomPuzzle(givens, '')
  if (!validation.valid || !validation.unique || !validation.solution) {
    throw new Error('Practice puzzle is invalid')
  }
  setEncodedPuzzle(null)
  return {
    givens,
    solution: validation.solution,
    puzzleData: {
      puzzle_id: effectiveSeed,
      seed: effectiveSeed,
      difficulty,
      givens,
      solution: validation.solution,
    },
    initialState: null,
    initialCandidates: null,
  }
}

// Resolve a puzzle fetched from the static pool.
function resolveFetched(
  effectiveSeed: string | undefined,
  difficulty: Difficulty,
  setEncodedPuzzle: (value: string | null) => void,
): ResolvedPuzzle {
  const fetchedPuzzle = getPuzzle(effectiveSeed ?? '', difficulty)
  setEncodedPuzzle(null)
  return {
    givens: fetchedPuzzle.givens,
    solution: fetchedPuzzle.solution,
    puzzleData: {
      puzzle_id: fetchedPuzzle.puzzle_id,
      seed: fetchedPuzzle.seed,
      difficulty: fetchedPuzzle.difficulty,
      givens: fetchedPuzzle.givens,
      solution: fetchedPuzzle.solution,
    },
    initialState: null,
    initialCandidates: null,
  }
}

// Dispatch to the correct puzzle source for the current route: encoded custom
// link, stored custom/practice puzzle, or a fetched puzzle from the static pool.
async function fetchPuzzleSource(params: {
  isEncodedCustom: boolean
  encoded: string | undefined
  difficulty: Difficulty
  effectiveSeed: string | undefined
  setEncodedPuzzle: (value: string | null) => void
}): Promise<ResolvedPuzzle> {
  const { isEncodedCustom, encoded, difficulty, effectiveSeed, setEncodedPuzzle } = params
  if (isEncodedCustom && encoded) {
    return resolveEncodedCustom(encoded, setEncodedPuzzle)
  }
  if (difficulty === 'custom' && effectiveSeed?.startsWith('custom-')) {
    return resolveStoredCustom(effectiveSeed, setEncodedPuzzle)
  }
  if (effectiveSeed?.startsWith('practice-')) {
    return resolvePractice(effectiveSeed, difficulty, setEncodedPuzzle)
  }
  return resolveFetched(effectiveSeed, difficulty, setEncodedPuzzle)
}

// Overlay a portable-link `s` state param onto a resolved puzzle. The seed already
// produced the givens; the param supplies the sharer's board and pencil notes.
function applySharedStateParam(
  resolved: ResolvedPuzzle,
  sharedStateParam: string | null,
): { initialState: number[] | null; initialCandidates: number[][] | null } {
  let { initialState, initialCandidates } = resolved
  if (!initialState && sharedStateParam) {
    const decodedShared = decodePuzzleWithState(sharedStateParam)
    if (decodedShared) {
      initialState = decodedShared.board
      initialCandidates = decodedShared.candidates ?? null
    }
  }
  return { initialState, initialCandidates }
}

// Parse a shared `t` elapsed-time param into positive milliseconds, or null.
function parseSharedElapsedMs(sharedTimeParam: string | null): number | null {
  if (!sharedTimeParam) {
    return null
  }
  const ms = parseInt(sharedTimeParam, 10)
  return Number.isFinite(ms) && ms > 0 ? ms : null
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

  const difficultyParam = searchParams.get('d')
  // Shared progress on a portable seed link: `s` carries the player's board+notes,
  // `t` the elapsed time. Overlaid onto the seed-resolved givens (see loadPuzzle).
  const sharedStateParam = searchParams.get('s')
  const sharedTimeParam = searchParams.get('t')

  const { effectiveSeed, isEncodedCustom, needsDifficultyChoice, alreadyCompletedToday, completedDailyScore } =
    resolvePuzzleSetup({ seed, encoded, pathname: location.pathname, difficultyParam })

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
  const [menuOpen, setMenuOpen] = useState(false)
  const [showInProgressConfirm, setShowInProgressConfirm] = useState(false)
  const [existingInProgressGame, setExistingInProgressGame] = useState<SavedGameInfo | null>(null)
  // Shared state-link vs the recipient's own saved progress for the same puzzle:
  // when both exist, the recipient chooses (resume mine / open shared) instead of
  // one silently winning. Pending holds the shared board until they decide.
  const [showShareConflict, setShowShareConflict] = useState(false)
  const [pendingSharedState, setPendingSharedState] = useState<{
    board: number[]
    candidates: number[][] | null
    elapsedMs: number | null
  } | null>(null)
  // When the shared-game modal is up and the game in progress is a DIFFERENT puzzle
  // than the shared one, this holds where dismissing the modal navigates back to.
  // Null means the in-progress game is this same puzzle (dismiss = keep the board).
  const [resumeTarget, setResumeTarget] = useState<{ seed: string; difficulty: string } | null>(
    null,
  )
  // Whether a game is in progress when the shared-game modal is shown. Drives the
  // "Resume current game" button (shown only then) and the dismiss behavior:
  // with a game, dismiss keeps it; without one, dismiss goes to the homepage.
  const [shareHasCurrentGame, setShareHasCurrentGame] = useState(false)
  const shareResolvedRef = useRef(false)
  const [showDailyPrompt, setShowDailyPrompt] = useState(false)
  const [unpinpointableErrorInfo, setUnpinpointableErrorInfo] = useState<{
    message: string
    count: number
  } | null>(null)
  const [debugInfoCopied, setDebugInfoCopied] = useState(false)
  const [autoFillUsed, setAutoFillUsed] = useState(false)
  const [autoSolveUsed, setAutoSolveUsed] = useState(false)
  const autoSolveUsedRef = useRef(false) // Ref for immediate access in callbacks
  const [autoSolveStepsUsed, setAutoSolveStepsUsed] = useState(0)
  const [autoSolveErrorsFixed, setAutoSolveErrorsFixed] = useState(0)
  // Track if we've handled initial navigation (to prevent in-progress check after seed changes)
  const handledInitialNavigationRef = useRef(false)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [techniqueHintsUsed, setTechniqueHintsUsed] = useState(0)
  const [hintLoading, setHintLoading] = useState(false) // Loading spinner for hint button
  const [techniqueHintLoading, setTechniqueHintLoading] = useState(false) // Loading spinner for technique hint button
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
  // Track isComplete at execution time (to prevent race condition with debounced saves)
  const isCompleteRef = useRef(false)
  // Guard to prevent concurrent hint requests. Held in a ref so the
  // in-progress flag persists across renders (lazily initialized once).
  const hintGateRef = useRef<HintRequestGate | null>(null)
  if (hintGateRef.current === null) {
    hintGateRef.current = createHintRequestGate()
  }
  // Track last hint shown to avoid counting duplicate hints
  const lastTechniqueHintRef = useRef<string | null>(null)
  const lastRegularHintRef = useRef<string | null>(null)
  // Cache hint result to ensure Technique Hint and Regular Hint show same move
  // Invalidated when board state changes
  const cachedHintRef = useRef<{
    boardSignature: string
    data: Awaited<ReturnType<typeof findNextMove>>
  } | null>(null)
  // Track if there are unsaved changes when backgrounded
  const hasUnsavedChanges = useRef(false)
  // Track the last time we were hidden
  const wasHiddenRef = useRef(false)

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
    return () => window.clearTimeout(id)
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
  useEffect(() => {
    initialBoardRef.current = initialBoard
  }, [initialBoard])

  // ============================================================
  // CLICK OUTSIDE TO DESELECT (UX Enhancement)
  // ============================================================
  // When user clicks/taps outside of game interface, deselects the current cell
  useEffect(() => {
    const handleInteraction = (event: Event) => {
      // Only process if a cell or multi-select is active
      if (selectedCellRef.current === null && selectedCellsRef.current.size === 0) return

      const target = event.target as Element | null
      if (!target) return

      // Check for actual modals AND overlay backdrops (not toasts/notifications).
      // [data-overlay-backdrop] covers all three backdrop structural patterns; [data-modal]
      // revives the panel-interior guard (panel wrappers carry the attribute).
      const clickedInsideModal = target.closest(
        '[role="dialog"], .modal, [data-modal], [data-overlay-backdrop]',
      )

      // Check if click is on interactive game elements that should NOT trigger deselection
      const clickedOnCell = target.closest('.sudoku-cell') !== null
      const clickedOnBoard = target.closest('.sudoku-board') !== null
      const clickedOnDigitButton = target.closest('.control-digit-btn') !== null
      const clickedOnActionButton = target.closest('.control-action-btn-compact') !== null
      // Opening an overlay should not wipe the board selection. Each overlay opener button
      // carries a data-*-button attribute; they are grouped here as one concept.
      const clickedOnOverlayOpener =
        target.closest('[data-menu-button], [data-history-button], [data-share-button]') !== null

      // Deselect if click is NOT on a cell/board, NOT on digit/action buttons, NOT on an
      // overlay opener, and NOT inside an overlay (panel or backdrop). This leaves only
      // genuine empty-space clicks triggering deselection.
      // The board check prevents deselection from synthetic clicks after multi-select drags.
      if (
        !clickedOnCell &&
        !clickedOnBoard &&
        !clickedOnDigitButton &&
        !clickedOnActionButton &&
        !clickedOnOverlayOpener &&
        !clickedInsideModal
      ) {
        deselectCell()
        setEraseMode(false)
        clearMoveHighlight()
      }
    }

    // Listen to both click and touchstart for mobile compatibility
    // Use capture phase to ensure we get the event before other handlers
    document.addEventListener('click', handleInteraction, { capture: true })
    document.addEventListener('touchstart', handleInteraction, { capture: true })
    return () => {
      document.removeEventListener('click', handleInteraction, true)
      document.removeEventListener('touchstart', handleInteraction, true)
    }
  }, [deselectCell, clearMoveHighlight, setEraseMode])

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
    return arrays.map((arr) => new Set(arr))
  }, [])

  const getGivens = useCallback(() => initialBoardRef.current, [])

  const handleApplyMove = useCallback(
    (newBoard: number[], newCandidates: Set<number>[], move: Move, index: number) => {
      const game = gameRef.current
      if (!game) return
      // Convert Set<number>[] back to Uint16Array
      const candidatesArray = newCandidates.map((set) => Array.from(set))
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
    [setMoveHighlight, setDigitHighlight],
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
    [setMoveHighlight, setDigitHighlight, clearDigitHighlight],
  )

  const handleIsComplete = useCallback(() => gameRef.current?.isComplete ?? false, [])

  const handleAutoSolveError = useCallback(
    (message: string) => {
      setValidationMessage({ type: 'error', message })
      scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
    },
    [scheduleToastClear],
  )

  const handleUnpinpointableError = useCallback((message: string, count: number) => {
    setUnpinpointableErrorInfo({ message, count })
    setShowSolutionConfirm(true)
  }, [])

  const handleAutoSolveStatus = useCallback(
    (message: string) => {
      throttledSetValidationMessage({ type: 'success', message })
      scheduleToastClear(2000, () => setValidationMessage(null))
    },
    [throttledSetValidationMessage, scheduleToastClear],
  )

  const handleErrorFixed = useCallback(
    (message: string, resumeCallback: () => void) => {
      // Show toast for fix-error (longer duration than normal hints)
      setValidationMessage({ type: 'error', message: `Fixed: ${message}` })
      // Clear toast after full duration
      scheduleToastClear(TOAST_DURATION_FIX_ERROR, () => setValidationMessage(null))
      // But resume solving sooner for better UX
      visibilityAwareTimeout(resumeCallback, ERROR_FIX_RESUME_DELAY)
    },
    [visibilityAwareTimeout, scheduleToastClear],
  )

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
  })

  // Handle game completion when board is full and valid
  useEffect(() => {
    if (game.isComplete) {
      handleGameComplete()
    }
  }, [game.isComplete, handleGameComplete])

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
    // Also skip if we've already handled initial navigation (to prevent check after seed changes)
    if (sessionStorage.getItem('skip_in_progress_check') || handledInitialNavigationRef.current) {
      return
    }

    // A shared-state link (?s=…) carries the sharer's position, and
    // restoreOrPromptSharedState owns the resume-vs-open-shared choice. The generic
    // "resume your other game" prompt must not race it (loadPuzzle is async, so this
    // effect would otherwise fire first and its Resume would navigate away to an
    // unrelated saved game). Mark navigation handled so it stays skipped after
    // consumeShareParams strips the s param and this effect re-runs. See SHARE-2.
    if (sharedStateParam) {
      handledInitialNavigationRef.current = true
      return
    }

    const savedGame = getMostRecentGame()
    // Mark that we've handled initial navigation for this component mount
    handledInitialNavigationRef.current = true
    logger.debug(
      '[IN-PROGRESS CHECK] Current URL seed:',
      seed,
      'Saved game found:',
      savedGame ? savedGame.seed : 'none',
    )
    // Show prompt if:
    // - There's a saved game
    // - It's for a DIFFERENT seed than what we're trying to load
    // - It's not complete (progress < 100%)
    if (
      savedGame &&
      savedGame.seed !== seed &&
      savedGame.seed !== encoded &&
      savedGame.progress < 100
    ) {
      logger.debug(
        '[IN-PROGRESS CHECK] Showing modal: Existing game found',
        savedGame.seed,
        'vs current:',
        seed,
      )
      setExistingInProgressGame(savedGame)
      setShowInProgressConfirm(true)
    } else {
      logger.debug('[IN-PROGRESS CHECK] No modal needed (no existing game or same seed)')
    }
  }, [seed, encoded, sharedStateParam])

  // Handlers for in-progress game confirmation modal
  const handleResumeExistingGame = useCallback(() => {
    if (existingInProgressGame) {
      // Set flag so we don't show modal again when navigating to resumed game
      sessionStorage.setItem('skip_in_progress_check', 'true')
      const targetUrl = `/${existingInProgressGame.seed}?d=${existingInProgressGame.difficulty}`
      navigate(targetUrl)
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

  // Overlay a shared board (from a state-link's `s`/`t`) onto the current game.
  const applySharedBoard = useCallback(
    (shared: { board: number[]; candidates: number[][] | null; elapsedMs: number | null }) => {
      const candidatesArray = shared.candidates ?? Array.from({ length: 81 }, () => [] as number[])
      game.restoreState(shared.board, arraysToCandidates(candidatesArray), [])
      if (shared.elapsedMs !== null) {
        timerControl.setElapsedMs(shared.elapsedMs)
      }
    },
    [game, timerControl],
  )

  // Drop the one-time `s`/`t` share params from the URL so a later reload takes
  // the normal saved-state path instead of re-applying the sharer's snapshot.
  // Uses history.replaceState rather than the router's setSearchParams, which did
  // not persist when called from the initial-load effect; this cleans the address
  // bar reliably without re-navigating (the shared state is already applied).
  const consumeShareParams = useCallback(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('s') && !url.searchParams.has('t')) {
      return
    }
    url.searchParams.delete('s')
    url.searchParams.delete('t')
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])

  // Finalize a shared-URL load: mark restored, start the clock, and consume the
  // one-time share params so a later reload takes the normal saved-state path.
  const finalizeSharedUrlLoad = useCallback(() => {
    loadedFromSharedUrl.current = false
    hasRestoredSavedState.current = true
    if (!alreadyCompletedToday && !showDifficultyChooser) {
      timerControl.startTimer()
    }
    // consumeShareParams self-guards on the actual URL, so call it unconditionally
    // (a stale sharedStateParam closure was suppressing the strip).
    consumeShareParams()
  }, [alreadyCompletedToday, showDifficultyChooser, timerControl, consumeShareParams])

  // Shared-game modal dismissed (Resume current game, the X, or the backdrop):
  // keep what the recipient was doing instead of loading the shared game.
  const handleResumeOwnGame = useCallback(() => {
    shareResolvedRef.current = true
    setShowShareConflict(false)
    setPendingSharedState(null)
    consumeShareParams()
    if (resumeTarget) {
      // Current game is a different puzzle: navigate back to it. The flag stops the
      // in-progress check from re-prompting on arrival.
      sessionStorage.setItem('skip_in_progress_check', 'true')
      navigate(`/${resumeTarget.seed}?d=${resumeTarget.difficulty}`)
      setResumeTarget(null)
    } else if (!shareHasCurrentGame) {
      // No game to keep: back out of the shared link to the homepage.
      navigate('/')
    }
    // Otherwise the current game is this same puzzle: its saved board is already
    // restored, so closing the modal keeps it.
  }, [consumeShareParams, resumeTarget, shareHasCurrentGame, navigate])

  // Share-conflict modal: recipient discards their progress for the shared position.
  const handleStartFromShared = useCallback(() => {
    if (pendingSharedState) {
      applySharedBoard(pendingSharedState)
      if (!alreadyCompletedToday && !showDifficultyChooser) {
        timerControl.startTimer()
      }
    }
    shareResolvedRef.current = true
    setShowShareConflict(false)
    setPendingSharedState(null)
    setResumeTarget(null)
    setShareHasCurrentGame(false)
    consumeShareParams()
  }, [
    pendingSharedState,
    applySharedBoard,
    alreadyCompletedToday,
    showDifficultyChooser,
    timerControl,
    consumeShareParams,
  ])

  // Handlers for daily prompt modal
  const handleGoToDaily = useCallback(() => {
    setShowDailyPrompt(false)
    const { seed } = getDailySeed()
    // Navigate without difficulty to show the difficulty chooser
    navigate(`/${seed}`)
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
    const validation = validateSeed(puzzleSeed)
    if (!validation.valid) {
      logger.error(`[SEED VALIDATION] Invalid seed: ${puzzleSeed}`, validation.error)
      throw new Error(`Cannot create storage key for invalid seed: ${validation.error}`)
    }
    return `${STORAGE_KEYS.GAME_STATE_PREFIX}${validation.seed}`
  }, [])

  // Save game state to localStorage
  const saveGameState = useCallback(() => {
    // Use ref to check isComplete at execution time (not closure time)
    // Skip if puzzle not loaded yet or we haven't restored saved state yet
    if (!puzzle || !hasRestoredSavedState.current) return

    // Clear other games in the same mode (daily or practice) to ensure only ONE save per mode
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
    // Note: We use isCompleteRef instead of game.isComplete to avoid stale closure issues
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback that reads from a ref
  }, [puzzle, game.board, game.candidates, game.history, autoFillUsed, hintsUsed, techniqueHintsUsed, getStorageKey])

  // Clear saved game state from localStorage
  const clearSavedGameState = useCallback(() => {
    if (!puzzle) return
    const storageKey = getStorageKey(puzzle.seed)
    try {
      localStorage.removeItem(storageKey)
    } catch (e) {
      logger.warn('Failed to clear saved game state:', e)
    }
  }, [puzzle, getStorageKey])

  // Load saved game state from localStorage
  const loadSavedGameState = useCallback(
    (puzzleSeed: string): SavedGameState | null => {
      const storageKey = getStorageKey(puzzleSeed)
      try {
        const saved = localStorage.getItem(storageKey)
        if (!saved) return null

        const parsed = JSON.parse(saved) as SavedGameState
        const extractedSeed = extractSeedFromStorageKey(storageKey)

        if (!extractedSeed.valid) {
          logger.error(
            `[STORAGE ERROR] Cannot load game with invalid seed: ${puzzleSeed} (stored seed: ${extractedSeed.seed}, error: ${extractedSeed.error})`,
          )
          return null
        }

        if (parsed.board?.length === 81 && parsed.candidates?.length === 81) {
          return parsed
        } else {
          logger.warn(
            `[STORAGE ERROR] Corrupted saved state for seed: ${extractedSeed.seed} - board: ${parsed.board?.length}, candidates: ${parsed.candidates?.length}`,
          )
          return null
        }
      } catch (e) {
        logger.error(`[STORAGE ERROR] Failed to load saved game for seed: ${puzzleSeed}`, e)
        return null
      }
    },
    [getStorageKey],
  )

  // On a shared state-link, always prompt before loading the shared game (the
  // recipient chooses "Load shared game", or dismisses to keep what they were
  // doing / return home). Kept out of loadPuzzle for clarity.
  const restoreOrPromptSharedState = useCallback(
    (board: number[], candidates: number[][] | null, seed: string) => {
      if (shareResolvedRef.current) {
        return
      }
      const shared = { board, candidates, elapsedMs: parseSharedElapsedMs(sharedTimeParam) }
      // Classify the recipient's current game: their own save for THIS puzzle, a
      // game on a DIFFERENT puzzle, or none. It decides the modal's buttons and
      // what dismissing does.
      const saved = loadSavedGameState(seed)
      const hasThisPuzzleProgress = !!(saved && saved.history.length > 0)
      const otherGame = getMostRecentGame()
      const otherInProgress =
        !!otherGame && otherGame.seed !== seed && otherGame.seed !== encoded && otherGame.progress < 100
      setPendingSharedState(shared)
      // Different-puzzle game: dismiss = go back to it. Same-puzzle or none: no target.
      setResumeTarget(
        !hasThisPuzzleProgress && otherInProgress && otherGame
          ? { seed: otherGame.seed, difficulty: otherGame.difficulty }
          : null,
      )
      setShareHasCurrentGame(hasThisPuzzleProgress || otherInProgress)
      setShowShareConflict(true)
    },
    [sharedTimeParam, loadSavedGameState, encoded],
  )

  // ============================================================
  // GAME ACTIONS (using hooks)
  // ============================================================

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
      scheduleToastClear(TOAST_DURATION_INFO, () => setValidationMessage(null))
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
    scheduleToastClear(TOAST_DURATION_INFO, () => setValidationMessage(null))
  }, [game, scheduleToastClear])

  // Validate current board state by comparing against the known solution
  const handleValidate = useCallback(() => {
    if (solution.length !== 81) {
      setValidationMessage({ type: 'error', message: 'Solution not available' })
      scheduleToastClear(TOAST_DURATION_INFO, () => setValidationMessage(null))
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
  }, [game.board, solution, scheduleToastClear])

  // Resolve the next hint move, using the cached hint when the board signature is unchanged.
  // Returns null (after surfacing an error toast) when there is no next move.
  const fetchCachedHint = useCallback(async (): Promise<Move | null> => {
    const boardSnapshot = [...game.board]
    const currentSignature = getBoardSignature(game.board, game.candidates)

    let data: Awaited<ReturnType<typeof findNextMove>>

    if (cachedHintRef.current && cachedHintRef.current.boardSignature === currentSignature) {
      data = cachedHintRef.current.data
    } else {
      const candidatesArray = candidatesToArrays(game.candidates)
      data = await findNextMove(boardSnapshot, candidatesArray, initialBoard)
      cachedHintRef.current = { boardSignature: currentSignature, data }
    }

    if (!data.move) {
      setValidationMessage({
        type: 'error',
        message: data.solved
          ? 'Puzzle is already complete!'
          : 'This puzzle requires advanced techniques beyond our hint system.',
      })
      scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
      return null
    }

    return data.move
  }, [game.board, game.candidates, initialBoard, scheduleToastClear])

  // Handle hint button - shows the next move with full answer (eliminations + additions visible)
  const handleNext = useCallback(async () => {
    // Prevent concurrent hint requests (spam protection)
    const gate = hintGateRef.current
    if (!gate || !gate.canStart()) {
      return
    }
    gate.begin()
    setHintLoading(true)

    try {
      // Deselect any highlighted digit when using hint
      clearAllAndDeselect()

      const move = await fetchCachedHint()
      if (!move) return

      // Handle special moves
      if (move.action === 'unpinpointable-error') {
        setUnpinpointableErrorInfo({
          message: move.explanation || `Couldn't pinpoint the error.`,
          count: (move as unknown as { userEntryCount?: number }).userEntryCount || 0,
        })
        setShowSolutionConfirm(true)
        return
      }

      if (move.action === 'contradiction' || move.action === 'error') {
        const currentGame = gameRef.current
        if (currentGame?.canUndo) {
          commitCellAction('undo', { game: currentGame, clearMoveHighlight })
          setValidationMessage({
            type: 'error',
            message: move.explanation || 'Contradiction found - undoing last move',
          })
          scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
          return
        } else {
          setValidationMessage({
            type: 'error',
            message: 'The puzzle cannot be solved - initial state has errors.',
          })
          scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
          return
        }
      }

      // Show the hint highlight WITH the answer (showAnswer defaults to true)
      // User sees red eliminations and green additions
      setMoveHighlight(move as MoveHighlight, game.history.length)

      // Show toast with technique explanation
      setValidationMessage({
        type: 'success',
        message: move.explanation || move.technique || 'Hint',
      })
      scheduleToastClear(TOAST_DURATION_INFO, () => setValidationMessage(null))

      // Only increment counter if this is a NEW hint (different from last shown)
      const signature = getHintSignature(move)
      if (shouldIncrementHintCounter(signature, lastRegularHintRef.current)) {
        setHintsUsed((prev) => prev + 1)
        lastRegularHintRef.current = signature
      }
      // Note: Button stays enabled - no setHintPending(true)
    } catch (err) {
      logger.error('Hint error:', err)
      setValidationMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to get hint',
      })
      scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
    } finally {
      gate.end()
      setHintLoading(false)
    }
  }, [
    game.history.length,
    clearAllAndDeselect,
    fetchCachedHint,
    scheduleToastClear,
    setMoveHighlight,
    clearMoveHighlight,
  ])

  // Handle technique hint button - shows technique name and highlights cells without revealing the answer
  const handleTechniqueHint = useCallback(async () => {
    // Prevent concurrent requests
    const gate = hintGateRef.current
    if (!gate || !gate.canStart()) return
    gate.begin()
    setTechniqueHintLoading(true)

    try {
      // Deselect any highlighted digit when using technique hint
      clearAllAndDeselect()

      const move = await fetchCachedHint()
      if (!move) return

      // If the next move is just filling candidates, show a helpful message
      if (move.technique === 'fill-candidate') {
        setValidationMessage({
          type: 'info',
          message: 'Fill in some candidates first, or use 💡 Hint to get started',
        })
        scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
        return
      }

      // Handle unpinpointable errors separately - no highlighting to show
      if (move.action === 'unpinpointable-error') {
        setValidationMessage({
          type: 'error',
          message: 'There seems to be an error in the puzzle. Try using 💡 Hint to fix it.',
        })
        scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
        return
      }

      // Handle constraint violations and errors - show WITH highlighting
      if (move.action === 'contradiction' || move.action === 'error') {
        // Show the constraint violation highlights (shows which cells conflict)
        setMoveHighlight({ ...move, showAnswer: false } as MoveHighlight, game.history.length)

        // Show the error message
        setValidationMessage({
          type: 'error',
          message: move.explanation || 'Constraint violation detected',
        })
        scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
        return
      }

      // Get the technique info
      const techniqueName = formatTechniqueName(move.technique || 'Unknown Technique')
      const techniqueSlug =
        move.technique?.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-') || 'unknown'

      // Show highlight WITHOUT the answer (showAnswer: false)
      // This shows primary/secondary cell highlighting but hides eliminations and target additions
      setMoveHighlight({ ...move, showAnswer: false } as MoveHighlight, game.history.length)

      // Show toast with technique name and "Learn more" action
      setValidationMessage({
        type: 'info',
        message: `Try: ${techniqueName}`,
        action: {
          label: 'Learn more',
          onClick: () => setTechniqueModal({ title: techniqueName, slug: techniqueSlug }),
        },
      })
      scheduleToastClear(TOAST_DURATION_INFO, () => setValidationMessage(null))

      // Only increment counter if this is a NEW hint (different from last shown)
      const signature = getHintSignature(move)
      if (shouldIncrementHintCounter(signature, lastTechniqueHintRef.current)) {
        setTechniqueHintsUsed((prev) => prev + 1)
        lastTechniqueHintRef.current = signature
      }
      // Note: Button stays enabled - no setTechniqueHintPending(true)
    } catch (err) {
      logger.error('Technique hint error:', err)
      setValidationMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to get technique',
      })
      scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
    } finally {
      gate.end()
      setTechniqueHintLoading(false)
    }
  }, [
    game.history.length,
    clearAllAndDeselect,
    fetchCachedHint,
    scheduleToastClear,
    setMoveHighlight,
  ])

  // Resume from extended pause on user interaction
  const resumeFromExtendedPause = useCallback(() => {
    if (isExtendedPaused) {
      setIsExtendedPaused(false)
    }
  }, [isExtendedPaused])

  // Shared digit placement logic - unifies mobile and desktop behavior
  const placeDigitAndClear = useCallback(
    (cellIndex: number, digit: number, notesMode: boolean) => {
      if (!gameRef.current) return

      // Use setCellMultiple when multiple cells selected AND in notes mode
      const currentSelectedCells = selectedCellsRef.current
      const isMultiSelect = notesMode && currentSelectedCells.size > 1

      if (isMultiSelect) {
        // Convert Set to array for setCellMultiple
        const selectedCellsArray = Array.from(currentSelectedCells)
        gameRef.current.setCellMultiple(selectedCellsArray, digit, notesMode)
      } else {
        // Single cell: use original setCell logic
        gameRef.current.setCell(cellIndex, digit, notesMode)
      }

      if (notesMode) {
        clearAfterUserCandidateOp()
      } else {
        clearAfterDigitPlacement()
        deselectCell()
      }

      // Fix 1: Clear highlight when digit becomes complete
      // Check if the digit we just placed is now complete (all 9 instances on board)
      if (!notesMode) {
        const digitCounts = gameRef.current.digitCounts
        if (isDigitComplete(digit, digitCounts)) {
          clearDigitHighlight()
        }
      }

      lastTechniqueHintRef.current = null
      lastRegularHintRef.current = null
      cachedHintRef.current = null
    },
    [clearAfterUserCandidateOp, clearAfterDigitPlacement, deselectCell, clearDigitHighlight],
  )

  // Multi-select callback for drag selection on Board
  const handleCellSelectMultiple = useCallback(
    (cells: number[]) => {
      selectMultipleCells(cells)
    },
    [selectMultipleCells],
  )

  // Drag end callback: when a multi-cell drag completes and a digit is highlighted
  // in notes mode, auto-insert/toggle that candidate on all selected cells.
  const handleDragEnd = useCallback((cells: number[]) => {
    const currentHighlightedDigit = highlightedDigitRef.current
    const currentNotesMode = notesModeRef.current
    const currentGame = gameRef.current

    if (!currentGame || !currentNotesMode || currentHighlightedDigit === null) return
    if (cells.length === 0) return

    currentGame.setCellMultiple(cells, currentHighlightedDigit, true)
  }, [])

  // Shared reset for hint tracking caches, invoked after any user action that
  // changes the board and therefore invalidates the cached next hint.
  const resetHintTracking = useCallback(() => {
    lastTechniqueHintRef.current = null
    lastRegularHintRef.current = null
    cachedHintRef.current = null
  }, [])

  type GameApi = NonNullable<ReturnType<typeof useSudokuGame>>

  // Erase-mode click: if active and the cell is erasable, erase it (keeping
  // erase mode on); otherwise just select the cell and exit erase mode.
  const handleEraseClick = useCallback(
    (idx: number, game: GameApi): boolean => {
      if (!eraseModeRef.current) return false
      if (game.board[idx] !== 0 && !game.isGivenCell(idx)) {
        commitCellAction('erase', {
          idx,
          game,
          clearAfterErase,
          deselectCell,
          setEraseMode,
          setAutoSolveStepsUsed,
          setAutoSolveErrorsFixed,
        })
        resetHintTracking()
        return true
      }
      selectCell(idx)
      setEraseMode(false)
      return true
    },
    [clearAfterErase, deselectCell, selectCell, resetHintTracking],
  )

  // Place (or toggle) the highlighted digit on a cell. In notes mode toggles
  // the candidate; otherwise places the digit, or erases if the cell already
  // holds that digit.
  const handleHighlightedPlacement = useCallback(
    (idx: number, game: GameApi, highlightedDigit: number, notesMode: boolean): void => {
      if (isDigitComplete(highlightedDigit, game.digitCounts)) {
        clearDigitHighlight()
        return
      }
      if (notesMode) {
        if (game.board[idx] === 0) {
          placeDigitAndClear(idx, highlightedDigit, notesMode)
        }
        return
      }
      if (game.board[idx] === highlightedDigit) {
        commitCellAction('erase', {
          idx,
          game,
          clearAfterErase,
          deselectCell,
          setEraseMode,
          setAutoSolveStepsUsed,
          setAutoSolveErrorsFixed,
        })
        resetHintTracking()
      } else {
        placeDigitAndClear(idx, highlightedDigit, notesMode)
      }
    },
    [clearDigitHighlight, placeDigitAndClear, clearAfterErase, deselectCell, resetHintTracking],
  )

  // Cell click handler - STABLE: reads from refs to avoid recreating on state changes
  // This is critical because Cell memo doesn't compare callback props for performance
  const handleCellClick = useCallback(
    (idx: number) => {
      resumeFromExtendedPause()

      // Read current state from refs for stable callback
      const currentHighlightedDigit = highlightedDigitRef.current
      const currentSelectedCell = selectedCellRef.current
      const currentNotesMode = notesModeRef.current
      const currentGame = gameRef.current

      if (!currentGame) return

      if (handleEraseClick(idx, currentGame)) return

      // If a digit is already highlighted and we're clicking a given cell,
      // only block if we're NOT coming from another given cell (allow given-to-given navigation)
      if (currentHighlightedDigit !== null && currentGame.isGivenCell(idx)) {
        if (currentSelectedCell === null || !currentGame.isGivenCell(currentSelectedCell)) {
          return
        }
      }

      // Given cells: highlight the digit AND select the cell for peer highlighting
      if (currentGame.isGivenCell(idx)) {
        const cellDigit = currentGame.board[idx]
        if (cellDigit && cellDigit > 0) {
          if (currentSelectedCell === idx) {
            clearAllAndDeselect()
          } else {
            clickGivenCell(cellDigit, idx)
          }
        }
        setEraseMode(false)
        return
      }

      // Toggle selection: clicking the same cell again deselects it.
      // In notes mode with a highlighted digit, instead toggle that candidate.
      if (currentSelectedCell === idx) {
        if (currentNotesMode && currentHighlightedDigit !== null && currentGame.board[idx] === 0) {
          currentGame.setCell(idx, currentHighlightedDigit, currentNotesMode)
          clearAfterUserCandidateOp()
          resetHintTracking()
          return
        }
        clearAllAndDeselect()
        return
      }

      if (currentHighlightedDigit !== null) {
        handleHighlightedPlacement(idx, currentGame, currentHighlightedDigit, currentNotesMode)
        return
      }

      // Select the cell (works for both empty and user-filled cells)
      // selectCell atomically selects and clears highlights
      selectCell(idx)
      setEraseMode(false)
      // All deps are now stable callbacks - state accessed via refs
    },
    [
      selectCell,
      clearAllAndDeselect,
      clickGivenCell,
      resumeFromExtendedPause,
      clearAfterUserCandidateOp,
      resetHintTracking,
      handleEraseClick,
      handleHighlightedPlacement,
    ],
  )

  // Digit input handler - STABLE: reads from refs to avoid recreating on state changes
  const handleDigitInput = useCallback(
    (digit: number) => {
      resumeFromExtendedPause()
      // Clear erase mode when selecting a digit
      setEraseMode(false)

      const currentSelectedCell = selectedCellRef.current
      const currentNotesMode = notesModeRef.current
      const currentGame = gameRef.current

      if (!currentGame) return

      // Fix 2: Block selection of complete digits
      // Don't allow selecting/placing digits that have all 9 instances on the board
      if (isDigitComplete(digit, currentGame.digitCounts)) {
        return
      }

      // Multi-select in notes mode: route to bulk note entry
      // selectedCell is null during multi-select (by design), so check selectedCells directly
      const currentSelectedCells = selectedCellsRef.current
      if (currentNotesMode && currentSelectedCells.size > 1) {
        placeDigitAndClear(0, digit, currentNotesMode)
        return
      }

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
        commitCellAction('erase', {
          idx: currentSelectedCell,
          game: currentGame,
          clearAfterErase: clearAfterDigitToggle,
          deselectCell,
          setEraseMode,
          setAutoSolveStepsUsed,
          setAutoSolveErrorsFixed,
        })
        lastTechniqueHintRef.current = null
        lastRegularHintRef.current = null
        cachedHintRef.current = null
        return
      }

      placeDigitAndClear(currentSelectedCell, digit, currentNotesMode)

      // Cell deselects after digit entry (per requirements)
      // Keep digit highlighted for adding candidates (multi-fill)
      // All deps are now stable callbacks - game accessed via ref
    },
    [
      toggleDigitHighlight,
      clearAfterDigitToggle,
      placeDigitAndClear,
      deselectCell,
      resumeFromExtendedPause,
    ],
  )

  // Keyboard cell change handler (from Board component)
  // STABLE: reads from refs to avoid recreation on state changes (like handleCellClick)
  const handleCellChange = useCallback(
    (idx: number, value: number) => {
      resumeFromExtendedPause()

      const currentGame = gameRef.current
      const currentNotesMode = notesModeRef.current

      if (!currentGame) return
      if (currentGame.isGivenCell(idx)) return

      if (value === 0) {
        commitCellAction('erase', {
          idx,
          game: currentGame,
          clearAfterErase,
          deselectCell,
          setEraseMode,
          setAutoSolveStepsUsed,
          setAutoSolveErrorsFixed,
        })
        lastTechniqueHintRef.current = null
        lastRegularHintRef.current = null
        cachedHintRef.current = null
      } else {
        if (currentNotesMode) {
          currentGame.setCell(idx, value, currentNotesMode)

          // Clear all move-related highlights (cell backgrounds) but preserve digit highlight for multi-fill
          clearAfterUserCandidateOp()
        } else {
          currentGame.setCell(idx, value, currentNotesMode)
          clearAfterDigitPlacement()
          deselectCell()
        }
        // Reset last hint tracking so next hint counts as new
        lastTechniqueHintRef.current = null
        lastRegularHintRef.current = null
        cachedHintRef.current = null
      }
      // All deps are now stable callbacks - state accessed via refs
    },
    [
      clearAfterDigitPlacement,
      deselectCell,
      clearAfterErase,
      clearAfterUserCandidateOp,
      resumeFromExtendedPause,
    ],
  )

  // Toggle notes mode handler
  const handleNotesToggle = useCallback(() => {
    setNotesMode((prev) => !prev)
  }, [])

  // Toggle erase mode handler
  const handleEraseMode = useCallback(() => {
    setEraseMode((prev) => !prev)
    // DO NOT call clearOnModeChange - preserve selection during mode toggle
  }, [])

  // Undo handler - STABLE: reads from refs to avoid recreation on state changes
  const handleUndo = useCallback(() => {
    const currentAutoSolve = autoSolveRef.current
    const currentGame = gameRef.current
    if (currentAutoSolve?.isAutoSolving) {
      currentAutoSolve.stepBack()
    } else if (currentGame) {
      commitCellAction('undo', {
        game: currentGame,
        deselectCell,
        clearMoveHighlight,
      })
    }
  }, [deselectCell, clearMoveHighlight])

  // Redo handler - STABLE: reads from refs to avoid recreation on state changes
  const handleRedo = useCallback(() => {
    const currentAutoSolve = autoSolveRef.current
    const currentGame = gameRef.current
    if (currentAutoSolve?.isAutoSolving) {
      currentAutoSolve.stepForward()
    } else if (currentGame) {
      commitCellAction('redo', {
        game: currentGame,
        clearAllAndDeselect,
      })
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
    logger.debug('Check & Fix invoked')
    if (!solution || solution.length !== 81) {
      logger.error('Cannot check and fix: solution not available')
      return
    }

    try {
      // Get current state
      const currentBoard = game.board
      const currentCandidates = candidatesToArrays(game.candidates)
      const givens = puzzle?.givens || []

      if (givens.length !== 81) {
        logger.error('Cannot check and fix: givens not available')
        return
      }

      // Call WASM to compare and fix
      const result = await checkAndFixWithSolution(
        currentBoard,
        currentCandidates,
        givens,
        solution,
      )
      if (result && result.moves) {
        logger.debug(
          'Check & Fix moves:',
          result.moves.map((m, idx) => ({ idx, move: m && m.move, board: m && m.board })),
        )
      }

      if (result.moves && result.moves.length > 0) {
        // Use new autosolver infrastructure to animate the replayed moves step-by-step, with UX feedback.
        autoSolve.playMoves(result.moves, false)
      } else {
        logger.warn('Check & Fix: no changes needed')
      }
    } catch (error) {
      logger.error('Check & Fix failed:', error)
      handleAutoSolveError('Failed to check and fix entries')
    }
  }, [solution, game.board, game.candidates, puzzle?.givens, handleAutoSolveError, autoSolve])

  // Bug report handlers - split into copy and report
  const handleCopyDebugInfo = useCallback(async () => {
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
      visibilityAwareTimeout(() => setDebugInfoCopied(false), COPY_TOAST_DURATION)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl.getElapsedMs is a stable callback that reads from a ref
  }, [puzzle, initialBoard, game, colorTheme, mode, visibilityAwareTimeout])

  // Feature request handler - opens GitHub issue for new features
  const handleFeatureRequest = useCallback(() => {
    // Open GitHub issues page with enhancement label (short URL for desktop compatibility)
    window.open('https://github.com/thodha/sudoku/issues', '_blank')
  }, [])

  // Copy a share URL to the clipboard and surface the outcome as a toast.
  const copyShareUrl = useCallback(
    async (url: string, label: string) => {
      const success = await copyToClipboard(url)
      if (success) {
        setValidationMessage({ type: 'success', message: `${label} link copied to clipboard!` })
        scheduleToastClear(TOAST_DURATION_INFO, () => setValidationMessage(null))
      } else {
        setValidationMessage({ type: 'error', message: 'Failed to copy link' })
        scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
      }
    },
    [scheduleToastClear],
  )

  const handleShareError = useCallback(
    (err: unknown) => {
      logger.error('Share error:', err)
      setValidationMessage({ type: 'error', message: 'Failed to create share link' })
      scheduleToastClear(TOAST_DURATION_ERROR, () => setValidationMessage(null))
    },
    [scheduleToastClear],
  )

  // Share the bare puzzle (givens only): a short seed link for portable puzzles,
  // an encoded /c/ link for localStorage-backed ones.
  const handleSharePuzzle = useCallback(async () => {
    try {
      const url = buildPuzzleShareUrl({
        isEncodedCustom,
        seed: puzzle?.seed,
        difficulty,
        givens: initialBoard,
      })
      await copyShareUrl(url, 'Puzzle')
    } catch (err) {
      handleShareError(err)
    }
  }, [isEncodedCustom, puzzle?.seed, difficulty, initialBoard, copyShareUrl, handleShareError])

  // Share the exact current position: givens plus the player's entries, notes,
  // and elapsed time.
  const handleShareState = useCallback(async () => {
    try {
      const url = buildStateShareUrl({
        isEncodedCustom,
        seed: puzzle?.seed,
        difficulty,
        givens: initialBoard,
        board: game.board,
        candidates: candidatesToArrays(game.candidates),
        elapsedMs: timerControl.getElapsedMs(),
      })
      await copyShareUrl(url, 'Game')
    } catch (err) {
      handleShareError(err)
    }
  }, [
    isEncodedCustom,
    puzzle?.seed,
    difficulty,
    initialBoard,
    game.board,
    game.candidates,
    timerControl,
    copyShareUrl,
    handleShareError,
  ])

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
      if (
        showResultModal ||
        historyOpen ||
        techniqueModal ||
        techniquesListOpen ||
        solveConfirmOpen ||
        showClearConfirm ||
        showShareConflict ||
        menuOpen
      ) {
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
      if (
        (ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (ctrlOrCmd && e.key.toLowerCase() === 'y')
      ) {
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
        setNotesMode((prev) => !prev)
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
          setNotesMode((prev) => !prev)
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    handleUndo,
    handleRedo,
    handleNext,
    handleValidate,
    clearAllAndDeselect,
    showResultModal,
    historyOpen,
    techniqueModal,
    techniquesListOpen,
    solveConfirmOpen,
    showClearConfirm,
    showShareConflict,
    menuOpen,
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

  // Fetch puzzle
  useEffect(() => {
    // Check if we should show the daily prompt (for practice games only) - INDEPENDENT of onboarding!
    // Suppress it when opening a shared current-state link (SHARE-2 #4): the
    // recipient came to view a specific shared board, not to be nudged to the daily.
    if (getGameMode(effectiveSeed || '') === 'practice' && !sharedStateParam) {
      if (shouldShowDailyPrompt()) {
        setShowDailyPrompt(true)
        markDailyPromptShown()
      }
    }

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

    if (!effectiveSeed && !isEncodedCustom) {
      return
    }

    // DEFINE loadPuzzle function BEFORE calling it
    const loadPuzzle = async () => {
      try {
        setLoading(true)
        setError(null)

        if (showDifficultyChooser || showOnboarding) {
          setLoading(false)
          return
        }

        // Early return if puzzle already loaded and state restored
        if (puzzle && hasRestoredSavedState.current) {
          setLoading(false)
          return
        }

        if (backgroundManager.shouldPauseOperations) {
          setLoading(false)
          return
        }

        // Note: WASM is NOT loaded here. It loads on-demand when user requests hints/solve.
        // Puzzles come from static pool (getPuzzle) or are validated with pure TypeScript (validateCustomPuzzle).

        setIncorrectCells([])

        const resolved = await fetchPuzzleSource({
          isEncodedCustom,
          encoded,
          difficulty,
          effectiveSeed,
          setEncodedPuzzle,
        })
        const { givens, puzzleData } = resolved
        // Portable seed links carry the sharer's progress in the `s` param; overlay
        // it so the shared-state path below (game.restoreState) applies board+notes.
        const { initialState, initialCandidates } = applySharedStateParam(
          resolved,
          sharedStateParam,
        )

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

        // This load owns loadedFromSharedUrl: default false, set true only when
        // shared state is actually applied (restoreOrPromptSharedState). The
        // seed-reset effect must not touch it (see SHARE-2).
        loadedFromSharedUrl.current = false
        // Apply the shared board, or prompt when the recipient has their own progress.
        if (initialState) {
          restoreOrPromptSharedState(initialState, initialCandidates, puzzleData.seed)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    loadPuzzle()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timerControl excluded: adding it would re-fetch puzzle when timer running/paused state changes. We only want to fetch when the actual puzzle params change.
  }, [
    effectiveSeed,
    encoded,
    isEncodedCustom,
    difficulty,
    sharedStateParam,
    sharedTimeParam,
    alreadyCompletedToday,
    showDifficultyChooser,
    showOnboarding,
    clearAllAndDeselect,
  ])

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
    const scheduleAutoSave = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(
          () => {
            if (!backgroundManager.shouldPauseOperations) {
              saveGameState()
              hasUnsavedChanges.current = false
            }
          },
          { timeout: 1000 },
        )
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
  }, [
    game.board,
    game.candidates,
    game.history,
    puzzle,
    game.isComplete,
    saveGameState,
    backgroundManager.shouldPauseOperations,
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
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [puzzle, loadSavedGameState, game, timerControl])

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
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
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
  ])

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
  }, [game.isComplete, saveGameState])

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
        onTechniqueHint={handleTechniqueHint}
        techniqueHintDisabled={false}
        techniqueHintLoading={techniqueHintLoading}
        onHint={handleNext}
        hintLoading={hintLoading}
        hintDisabled={false}
        onHistoryOpen={() => setHistoryOpen(true)}
        onShowResult={() => setShowResultModal(true)}
        onSharePuzzle={handleSharePuzzle}
        onShareState={handleShareState}
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
        onCopyDebugInfo={handleCopyDebugInfo}
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
              </div>
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
        onClose={() => setHistoryOpen(false)}
        onMoveClick={(move, index) => {
          const moveHighlight: MoveHighlight = move as MoveHighlight
          if (!moveHighlight.highlights || moveHighlight.highlights.primary.length === 0) {
            moveHighlight.highlights = {
              primary: moveHighlight.targets,
              secondary: moveHighlight.eliminations?.map((e) => ({ row: e.row, col: e.col })),
            }
          }
          setMoveHighlight(moveHighlight, index)
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-overlay-backdrop>
          <div className="w-full max-w-sm rounded-xl bg-background-secondary p-6 shadow-theme" data-modal>
            <h2 className="mb-2 text-lg font-semibold text-foreground">Game In Progress</h2>
            <p className="mb-6 text-sm text-foreground-muted">
              You have a{' '}
              <span className="capitalize font-medium">{existingInProgressGame.difficulty}</span>{' '}
              game in progress ({existingInProgressGame.progress}% complete). Do you want to
              continue that game or start a new one?
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

      {/* Shared-link modal: offer to load the shared game. When a game is in
          progress, a "Resume current game" button (and the X/backdrop) keeps it,
          navigating back when the shared link is for a different puzzle. With no
          game in progress, the X/backdrop backs out to the homepage. */}
      {showShareConflict && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-overlay-backdrop
          onClick={handleResumeOwnGame}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-background-secondary p-6 shadow-theme"
            data-modal
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleResumeOwnGame}
              className="absolute right-3 top-3 rounded p-1 text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
              aria-label="Close"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
            <h2 className="mb-6 pr-8 text-lg font-semibold text-foreground">Load shared game?</h2>
            <div className="flex gap-3">
              {shareHasCurrentGame && (
                <button
                  onClick={handleResumeOwnGame}
                  className="flex-1 rounded-lg border border-board-border-light px-4 py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
                >
                  Resume current game
                </button>
              )}
              <button
                onClick={handleStartFromShared}
                className="flex-1 rounded-lg bg-accent px-4 py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
              >
                Load shared game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Difficulty Chooser Modal - shown when opening shared link without difficulty */}
      {showDifficultyChooser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-overlay-backdrop>
          <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-theme" data-modal>
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
  const { seed } = useParams()
  return (
    <TimerProvider pauseOnHidden={true}>
      <GameContent key={seed} />
    </TimerProvider>
  )
}
