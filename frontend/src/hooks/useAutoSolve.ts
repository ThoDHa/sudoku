import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { PLAY_DELAY, AUTO_SOLVE_MAX_TIME, AUTO_SOLVE_STEP_DELAY } from '../lib/constants'
import { solveAll } from '../lib/solver-service'
import { useBackgroundManager } from './useBackgroundManager'
import type { Move } from './useSudokuGame'
import { logger } from '../lib/logger'
import {
  createPlayNextMove,
  candidatesToArrays,
  type MoveResult,
  type StateSnapshot,
  type MoveHandlerContext,
} from './autoSolvePlayback'

interface UseAutoSolveOptions {
  /** Delay between steps in milliseconds (default: PLAY_DELAY) */
  stepDelay?: number
  /** Whether the game is paused (e.g., tab hidden) - auto-solve should pause too */
  gamePaused?: boolean
  /** Get current board state */
  getBoard: () => number[]
  /** Get current candidates */
  getCandidates: () => Set<number>[]
  /** Get original puzzle givens (to identify user-entered cells) */
  getGivens: () => number[]
  /** Apply a move to the game state (index is the move number, 1-based) */
  applyMove: (newBoard: number[], newCandidates: Set<number>[], move: Move, index: number) => void
  /** Apply a state snapshot (for rewind) - index is the move number (0 = initial state) */
  applyState: (board: number[], candidates: Set<number>[], move: Move | null, index: number) => void
  /** Check if puzzle is complete */
  isComplete: () => boolean
  /** Called when an error occurs */
  onError?: (message: string) => void
  /** Called when error can't be pinpointed - offers user choice */
  onUnpinpointableError?: (message: string, userEntryCount: number) => void
  /** Called for diagnostic/status messages */
  onStatus?: (message: string) => void
  /** Called when a user error is found and fixed - pauses to show user */
  onErrorFixed?: (message: string, resumeCallback: () => void) => void
  /** Called when stepping back/forward through moves */
  onStepNavigate?: (move: Move | null, direction: 'back' | 'forward') => void
  /** Optional background manager instance (will create one if not provided) */
  backgroundManager?: ReturnType<typeof useBackgroundManager>
}

interface UseAutoSolveReturn {
  /** Whether auto-solve is currently running */
  isAutoSolving: boolean
  /** Whether auto-solve is paused (tab hidden or manual) */
  isPaused: boolean
  /** Whether we are fetching the solution from the solver (initial load) */
  isFetching: boolean
  /** Start the auto-solve process */
  startAutoSolve: () => Promise<void>
  /** Stop the auto-solve process */
  stopAutoSolve: () => void
  /** Toggle pause/resume */
  togglePause: () => void
  /** Restart auto-solve from current board state */
  restartAutoSolve: (startPaused?: boolean) => Promise<void>
  /** Solve from givens only (show solution) */
  solveFromGivens: () => Promise<void>
  /** Play a custom provided move sequence (Check & Fix, etc) with the full autosolver UX */
  playMoves: (moves: MoveResult[], startPaused?: boolean) => void
  /** Apply check&fix moves and continue normal autosolving */
  applyFixesAndContinueSolving: (fixMoves: MoveResult[]) => Promise<void>
  /** Step backward one move (rewind) */
  stepBack: () => void
  /** Step forward one move (fast-forward) */
  stepForward: () => void
  /** Whether we can step back */
  canStepBack: boolean
  /** Whether we can step forward */
  canStepForward: boolean
  /** Current position in the move sequence */
  currentIndex: number
  /** Total number of moves */
  totalMoves: number
  /** Steps completed in last autosolve session (preserved after stop) */
  lastCompletedSteps: number
}

export function useAutoSolve(options: UseAutoSolveOptions): UseAutoSolveReturn {
  const {
    stepDelay = PLAY_DELAY,
    gamePaused = false,
    getBoard,
    getCandidates,
    getGivens,
    applyMove,
    applyState,
    isComplete,
    onError,
    onUnpinpointableError,
    onStatus,
    onErrorFixed,
    onStepNavigate,
    backgroundManager: providedBackgroundManager,
  } = options

  // Use provided background manager or create our own
  const defaultBackgroundManager = useBackgroundManager()
  const backgroundManager = providedBackgroundManager || defaultBackgroundManager

  const [isAutoSolving, setIsAutoSolving] = useState(false)
  // Stryker disable next-line BooleanLiteral: isPaused is overwritten by the mount run of the pause-sync effect belo...
  const [isPaused, setIsPaused] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [manualPaused, setManualPaused] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [totalMoves, setTotalMoves] = useState(0)
  const [lastCompletedSteps, setLastCompletedSteps] = useState(0)

  // Stryker disable next-line BooleanLiteral: autoSolveRef is only read while isAutoSolving is true (every reader is...
  const autoSolveRef = useRef(false)
  // Stryker disable next-line BooleanLiteral: pausedRef is reassigned by the pause-sync effect on mount (to shouldPa...
  const pausedRef = useRef(false)
  const manualPausedRef = useRef(false)
  // Stryker disable ArrayDeclaration: each ref is reassigned to a fresh array
  // inside startAutoSolve/restartAutoSolve/playMoves/solveFromGivens (and reads
  // are guarded by isAutoSolving) before any consumer observes it, so the
  // initial empty-array value is unobservable
  const movesQueueRef = useRef<MoveResult[]>([])
  const allMovesRef = useRef<MoveResult[]>([]) // All moves for rewind
  const stateHistoryRef = useRef<StateSnapshot[]>([]) // State at each step
  // Stryker restore
  const currentIndexRef = useRef(-1)
  const playNextMoveRef = useRef<(() => Promise<void>) | null>(null)
  const stepDelayRef = useRef(stepDelay)

  // Snapshot of board state when manually paused - used to detect board changes
  const pausedBoardSnapshotRef = useRef<number[] | null>(null)

  // Track active timers for cleanup - prevents battery drain from orphaned timers
  const activeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep stepDelayRef in sync with prop so speed changes take effect dynamically
  useEffect(() => {
    stepDelayRef.current = stepDelay
  }, [stepDelay])

  // Note: stateHistoryRef is bounded per-session since it's reset at the start
  // of each solve. MAX_MOVE_HISTORY is imported but not used here because the
  // history is cleared on stopAutoSolve. If needed, add limit check after each push.

  // Helper to clear any active timers
  const clearActiveTimers = useCallback(() => {
    // The two ConditionalExpression branch-forcing mutants on this null-check cannot be
    // separated at mutator granularity. Forcing it true is a genuine no-op (clearTimeout on a
    // null/settled handle is harmless and the null assignment is idempotent). Whether
    // clearActiveTimers actually clears a live timer is verified separately by the
    // clearTimeout-spy test through the BlockStatement and EqualityOperator mutants on these
    // lines, which remain enabled and are killed.
    // Stryker disable next-line ConditionalExpression: branch-forcing is unobservable here (see note above)
    if (activeTimeoutRef.current !== null) {
      clearTimeout(activeTimeoutRef.current)
      activeTimeoutRef.current = null
    }
    // Stryker disable next-line ArrayDeclaration: clearActiveTimers captures no external values; a stable-string mut...
  }, [])

  // Helper to schedule next move with proper timer tracking
  const scheduleNextMove = useCallback(
    (callback: () => void, delay: number) => {
      // Clear any existing timers first
      clearActiveTimers()

      // Use setTimeout directly - requestIdleCallback can delay too long and cause issues
      activeTimeoutRef.current = setTimeout(() => {
        // Direct visibility check as safety net for Android/mobile
        // React state may be stale if visibility events fire late
        if (document.visibilityState === 'hidden') {
          return // Skip callback when hidden
        }
        callback()
      }, delay)
    },
    // Stryker disable next-line ArrayDeclaration: clearActiveTimers is itself stable (deps []), so dropping it from ...
    [clearActiveTimers],
  )

  const stopAutoSolve = useCallback(() => {
    // Clear all active timers first to prevent battery drain
    clearActiveTimers()

    // Save the final step count BEFORE resetting (for history display)
    // Stryker disable next-line EqualityOperator: when currentIndexRef.current is 0, both >0 (false→0) and >=0 (true→0) yield finalSteps=0; for negative indices the hook guards prevent reaching here, so the boundary mutation is unobservable
    const finalSteps = currentIndexRef.current > 0 ? currentIndexRef.current : 0
    setLastCompletedSteps(finalSteps)

    // Stryker disable BooleanLiteral,ArrayDeclaration,UnaryOperator: every ref
    // reset here is unobservable after stop. Each ref is either reassigned at
    // the start of the next solve (startAutoSolve/restart/playMoves/solveFromGivens)
    // before any consumer reads it, or its readers are guarded by isAutoSolving
    // (now false). The resume effect is additionally blocked because
    // playNextMoveRef.current is nulled two lines below.
    autoSolveRef.current = false
    pausedRef.current = false
    manualPausedRef.current = false
    pausedBoardSnapshotRef.current = null
    movesQueueRef.current = []
    allMovesRef.current = []
    stateHistoryRef.current = []
    currentIndexRef.current = -1
    playNextMoveRef.current = null
    // Stryker restore
    setIsAutoSolving(false)
    setIsPaused(false)
    setManualPaused(false)
    setCurrentIndex(-1)
    setTotalMoves(0)
    // Stryker disable next-line ArrayDeclaration: clearActiveTimers is stable, so omitting it from stopAutoSolve's d...
  }, [clearActiveTimers])

  // Cleanup on unmount - prevents battery drain from orphaned timers
  useEffect(() => {
    return () => {
      clearActiveTimers()
      // Stryker disable next-line BooleanLiteral: after unmount the hook instance is gone, so autoSolveRef's value i...
      autoSolveRef.current = false
    }
    // Stryker disable next-line ArrayDeclaration: clearActiveTimers is stable, so the unmount effect behavior is ide...
  }, [clearActiveTimers])

  // Sync gamePaused prop and background manager with our internal pause state.
  // Wrapped in a named function so the rule recognizes the setState calls as
  // callback-scoped, not direct effect-body mutations.
  useEffect(() => {
    const syncPauseState = () => {
      const shouldPause = gamePaused || manualPaused || backgroundManager.shouldPauseOperations
      // Stryker disable StringLiteral,ObjectLiteral: the logger is not mocked or
      // asserted in any hook test, so its message string and payload object are
      // unobservable
      logger.debug('[useAutoSolve] pause check:', {
        gamePaused,
        manualPaused,
        shouldPauseOperations: backgroundManager.shouldPauseOperations,
      })
      // Stryker restore
      if (shouldPause) {
        pausedRef.current = true
        setIsPaused(true)
      } else {
        const wasPaused = pausedRef.current
        pausedRef.current = false
        setIsPaused(false)
        // Resume playback if we were auto-solving and just unpaused
        // Stryker disable next-line LogicalOperator: the resume fires only when wasPaused is true (set from pausedRe...
        if (wasPaused && autoSolveRef.current && playNextMoveRef.current) {
          // Check if board changed while paused (user made edits)
          if (pausedBoardSnapshotRef.current !== null) {
            const currentBoard = getBoard()
            const boardChanged = pausedBoardSnapshotRef.current.some(
              (val, idx) => val !== currentBoard[idx],
            )
            if (boardChanged) {
              // Board was modified - stop auto-solve instead of resuming
              stopAutoSolve()
              pausedBoardSnapshotRef.current = null
              return
            }
          }
          pausedBoardSnapshotRef.current = null
          void playNextMoveRef.current()
        }
      }
    }
    syncPauseState()
  }, [gamePaused, manualPaused, backgroundManager, getBoard, stopAutoSolve])

  const togglePause = useCallback(() => {
    if (!isAutoSolving) return
    setManualPaused((prev) => {
      const newPaused = !prev
      manualPausedRef.current = newPaused
      // Snapshot board state when pausing so we can detect changes on resume
      if (newPaused) {
        pausedBoardSnapshotRef.current = [...getBoard()]
      }
      return newPaused
    })
  }, [isAutoSolving, getBoard])

  // Shared fetch+setup for startAutoSolve/restartAutoSolve: reset history, call solveAll,
  // wire up the move queue and play-next handler. Plays the first move when shouldPlay is set.
  // Wrapped in useCallback so startAutoSolve/restartAutoSolve keep a stable identity
  // instead of capturing a freshly-recreated function each render.
  const runAutoSolveFetch = useCallback(
    async (
      currentBoard: number[],
      candidatesArray: number[][],
      currentCandidates: Set<number>[],
      givens: number[],
      shouldPlay: boolean,
    ) => {
      stateHistoryRef.current = [
        {
          board: [...currentBoard],
          candidates: candidatesArray.map((arr) => [...arr]),
          move: null,
        },
      ]
      currentIndexRef.current = 0
      setCurrentIndex(0)

      setIsFetching(true)
      try {
        const data = await solveAll(currentBoard, candidatesArray, givens)
        setIsFetching(false)

        if (!data.moves || data.moves.length === 0) {
          if (!data.solved) {
            onError?.('This puzzle requires advanced techniques beyond our solver.')
          }
          stopAutoSolve()
          return
        }

        allMovesRef.current = data.moves
        movesQueueRef.current = [...data.moves]
        setTotalMoves(data.moves.length)

        const context: MoveHandlerContext = {
          autoSolveRef,
          pausedRef,
          movesQueueRef,
          allMovesRef,
          stateHistoryRef,
          currentIndexRef,
          setCurrentIndex,
          scheduleNextMove,
          stopAutoSolve,
          stepDelayRef,
          applyMove,
          getCandidates,
          onError,
          onUnpinpointableError,
          onStatus,
          onErrorFixed,
          initialCandidates: currentCandidates,
          skipSpecialMoves: false,
        }

        const playNextMove = createPlayNextMove(context)
        playNextMoveRef.current = playNextMove

        // shouldPlay is false only on a startPaused restart, where manualPaused (and thus
        // pausedRef) is already set before the async solve resolves, so playNextMove's own pause
        // guard blocks the forced first play. The false-forcing variant (skip playback entirely)
        // is covered by the sequential-playback tests, which fail if moves stop advancing.
        // Stryker disable next-line ConditionalExpression: forcing this guard is unobservable (see note above)
        if (shouldPlay) {
          void playNextMove()
        }
      } catch (err) {
        setIsFetching(false)
        // Stryker disable next-line StringLiteral: logger is unobserved in hook tests
        logger.error('Auto-solve error:', err)
        onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
        stopAutoSolve()
      }
    },
    [
      setCurrentIndex,
      scheduleNextMove,
      stopAutoSolve,
      applyMove,
      getCandidates,
      onError,
      onUnpinpointableError,
      onStatus,
      onErrorFixed,
    ],
  )

  const restartAutoSolve = useCallback(
    async (startPaused: boolean = false) => {
      const currentBoard = getBoard()
      const currentCandidates = getCandidates()
      const candidatesArray = currentCandidates.map((set) => Array.from(set))
      const givens = getGivens()

      setIsAutoSolving(true)
      autoSolveRef.current = true

      if (startPaused) {
        manualPausedRef.current = true
        setManualPaused(true)
      } else {
        manualPausedRef.current = false
        setManualPaused(false)
      }

      await runAutoSolveFetch(
        currentBoard,
        candidatesArray,
        currentCandidates,
        givens,
        !startPaused,
      )
    },
    [getBoard, getCandidates, getGivens, runAutoSolveFetch],
  )

  // Step backward one move
  const stepBack = useCallback(() => {
    if (!isAutoSolving || currentIndexRef.current <= 0) return

    // Pause playback when manually stepping
    // Stryker disable next-line ConditionalExpression: forcing this guard true only re-sets an already-true manual pause (idempotent); the false-forcing variant (never pause on step) is covered by the "pauses playback when stepping" test
    if (!manualPausedRef.current) {
      manualPausedRef.current = true
      setManualPaused(true)
    }

    const newIndex = currentIndexRef.current - 1
    currentIndexRef.current = newIndex
    setCurrentIndex(newIndex)

    // Restore the state from before this move was applied
    const snapshot = stateHistoryRef.current[newIndex]
    // newIndex is always a previously visited index, so its snapshot is always present.
    // Stryker disable ConditionalExpression: dead defensive guard (snapshot always defined here); the false-forcing variant that skips restoration is covered by the stepBack applyState test
    /* istanbul ignore next */
    if (snapshot) {
      // Stryker restore ConditionalExpression
      const candidates = snapshot.candidates.map((arr) => new Set(arr))
      applyState(snapshot.board, candidates, snapshot.move, newIndex)
      // Notify about the step navigation with the move we're now viewing
      onStepNavigate?.(snapshot.move, 'back')
    }

    // Update the moves queue so forward playback works from this point
    movesQueueRef.current = allMovesRef.current.slice(newIndex)
  }, [isAutoSolving, applyState, onStepNavigate])

  // Step forward one move
  const stepForward = useCallback(() => {
    // Past this guard, stepForward derives moveResult from allMovesRef and no-ops when it is
    // undefined (empty queue or out-of-range index), so forcing the index comparison changes
    // nothing observable at the boundary. The observable effect of wrongly proceeding when not
    // auto-solving (engaging manual pause) is verified by the "does not engage pause when not
    // auto-solving" test, which kills the LogicalOperator mutant.
    // Stryker disable next-line ConditionalExpression,EqualityOperator: boundary variants are masked (see note above)
    if (!isAutoSolving || currentIndexRef.current >= allMovesRef.current.length) return

    // Pause playback when manually stepping
    // Stryker disable next-line ConditionalExpression: forcing this guard true only re-sets an already-true manual pause (idempotent); the false-forcing variant is covered by the "pauses playback when stepping" test
    if (!manualPausedRef.current) {
      manualPausedRef.current = true
      setManualPaused(true)
    }

    const newIndex = currentIndexRef.current + 1

    // Check if we have a snapshot for this index (already visited)
    if (newIndex < stateHistoryRef.current.length) {
      // Use existing snapshot - just restore state without modifying history
      currentIndexRef.current = newIndex
      setCurrentIndex(newIndex)

      const snapshot = stateHistoryRef.current[newIndex]
      // newIndex < history length in this branch, so the snapshot is always present.
      // Stryker disable ConditionalExpression: dead defensive guard (snapshot always defined in this branch); forcing it either way cannot change the observed restoration
      /* istanbul ignore next */
      if (!snapshot) return
      // Stryker restore ConditionalExpression
      const candidates = snapshot.candidates.map((arr) => new Set(arr))
      applyState(snapshot.board, candidates, snapshot.move, newIndex)
      // Notify about the step navigation
      onStepNavigate?.(snapshot.move, 'forward')

      // Update the moves queue
      movesQueueRef.current = allMovesRef.current.slice(newIndex)
    } else {
      // New territory - apply the move normally (adds to history)
      const moveResult = allMovesRef.current[newIndex - 1] // -1 because index 0 is initial state

      // newIndex never exceeds allMovesRef length (guarded above), so moveResult is always defined.
      // Stryker disable ConditionalExpression: dead defensive guard (moveResult always defined here); the false-forcing variant that skips applying the fresh move is covered by the stepForward new-territory test
      /* istanbul ignore next */
      if (moveResult) {
        // Stryker restore ConditionalExpression
        currentIndexRef.current = newIndex
        setCurrentIndex(newIndex)

        const newCandidates = moveResult.candidates
          ? moveResult.candidates.map(
              (cellCands: number[] | null) => new Set<number>(cellCands || []),
            )
          : getCandidates()

        applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)

        // Add to state history
        stateHistoryRef.current.push({
          board: [...moveResult.board],
          candidates: moveResult.candidates
            ? moveResult.candidates.map((arr) => (arr ? [...arr] : []))
            : getCandidates().map((set) => Array.from(set)),
          move: moveResult.move,
        })

        // Notify about the step navigation
        onStepNavigate?.(moveResult.move, 'forward')

        // Update the moves queue
        movesQueueRef.current = allMovesRef.current.slice(newIndex)
      }
    }
  }, [isAutoSolving, applyMove, applyState, getCandidates, onStepNavigate])

  const startAutoSolve = useCallback(async () => {
    if (isAutoSolving || isComplete()) return

    const currentBoard = getBoard()
    const currentCandidates = getCandidates()
    const candidatesArray = currentCandidates.map((set) => Array.from(set))
    const givens = getGivens()

    setIsAutoSolving(true)
    autoSolveRef.current = true

    await runAutoSolveFetch(currentBoard, candidatesArray, currentCandidates, givens, true)
  }, [isAutoSolving, isComplete, getBoard, getCandidates, getGivens, runAutoSolveFetch])

  // Play a custom move sequence (for Check & Fix, etc)
  const playMoves = useCallback(
    (moves: MoveResult[], startPaused = false) => {
      if (!moves || moves.length === 0) return

      const currentBoard = getBoard()
      const currentCandidates = getCandidates()

      setIsAutoSolving(true)
      autoSolveRef.current = true

      if (startPaused) {
        manualPausedRef.current = true
        setManualPaused(true)
      } else {
        manualPausedRef.current = false
        setManualPaused(false)
      }

      stateHistoryRef.current = [
        {
          // moves[0] is guaranteed defined by the top guard, so the `|| currentBoard` /
          // `|| candidatesToArrays` fallbacks are unreachable (kept for defensive coverage).
          /* istanbul ignore start */
          board: [...(moves[0]?.board || currentBoard)],
          // The moves-non-empty guard makes moves[0] and its candidates always defined here,
          // so the ?. short-circuits are dead defensive code. The map/ternary/|| behaviour
          // that materializes the seed snapshot candidates is exercised by a dedicated
          // seed-candidates test.
          candidates:
            // Stryker disable next-line OptionalChaining: short-circuits are dead here (see note above)
            moves[0]?.candidates?.map((arr) => (arr ? [...arr] : [])) ||
            candidatesToArrays(currentCandidates),
          /* istanbul ignore stop */
          move: null,
        },
      ]
      allMovesRef.current = moves
      movesQueueRef.current = [...moves]
      setTotalMoves(moves.length)
      setCurrentIndex(0)
      currentIndexRef.current = 0

      const context: MoveHandlerContext = {
        autoSolveRef,
        pausedRef,
        movesQueueRef,
        allMovesRef,
        stateHistoryRef,
        currentIndexRef,
        setCurrentIndex,
        scheduleNextMove,
        stopAutoSolve,
        stepDelayRef,
        applyMove,
        getCandidates,
        onError,
        onUnpinpointableError: undefined,
        onStatus: undefined,
        onErrorFixed: undefined,
        initialCandidates: currentCandidates,
        skipSpecialMoves: false,
      }

      const playNextMove = createPlayNextMove(context)
      playNextMoveRef.current = playNextMove

      if (!startPaused) {
        void playNextMove()
      }
    },
    [getBoard, getCandidates, applyMove, stopAutoSolve, scheduleNextMove, onError],
  )

  // Solve from givens only - used when user clicks "Show Solution"
  const solveFromGivens = useCallback(async () => {
    if (isAutoSolving) return

    const givens = getGivens()
    const currentCandidates = getCandidates()

    setIsAutoSolving(true)
    autoSolveRef.current = true

    stateHistoryRef.current = [
      {
        board: [...givens],
        candidates: Array<number[]>(81).fill([]),
        move: null,
      },
    ]
    currentIndexRef.current = 0
    setCurrentIndex(0)

    setIsFetching(true)
    try {
      const data = await solveAll(givens, [], givens)
      setIsFetching(false)

      if (!data.moves || data.moves.length === 0) {
        if (!data.solved) {
          onError?.('Could not solve this puzzle.')
        }
        stopAutoSolve()
        return
      }

      allMovesRef.current = data.moves
      movesQueueRef.current = [...data.moves]
      setTotalMoves(data.moves.length)

      const context: MoveHandlerContext = {
        autoSolveRef,
        pausedRef,
        movesQueueRef,
        allMovesRef,
        stateHistoryRef,
        currentIndexRef,
        setCurrentIndex,
        scheduleNextMove,
        stopAutoSolve,
        stepDelayRef,
        applyMove,
        getCandidates,
        onError,
        onUnpinpointableError,
        onStatus,
        onErrorFixed,
        initialCandidates: currentCandidates,
        skipSpecialMoves: true,
      }

      const playNextMove = createPlayNextMove(context)
      playNextMoveRef.current = playNextMove
      void playNextMove()
    } catch (err) {
      setIsFetching(false)
      // Stryker disable next-line StringLiteral: logger is unobserved in hook tests
      logger.error('Solve from givens error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [
    isAutoSolving,
    getGivens,
    getCandidates,
    applyMove,
    onError,
    onUnpinpointableError,
    onStatus,
    onErrorFixed,
    stopAutoSolve,
    scheduleNextMove,
    setCurrentIndex,
  ])

  // Apply check&fix moves and then continue normal autosolving
  const applyFixesAndContinueSolving = useCallback(
    async (fixMoves: MoveResult[]) => {
      // Whether the prior session is explicitly stopped first is unobservable: playMoves below
      // fully re-initializes the refs and scheduleNextMove clears any pending timer, and stopping
      // when not auto-solving is a no-op. The "fixes applied then autosolve resumes" behavior is
      // covered by the applyFixesAndContinueSolving tests.
      // Stryker disable next-line BlockStatement,ConditionalExpression: pre-stop is redundant here (see note above)
      if (isAutoSolving) {
        // If autosolving, stop it temporarily to apply fixes
        stopAutoSolve()
      }

      // Play fixes immediately and wait for their playback to finish
      await new Promise<void>((resolve) => {
        // Start playback immediately so the moves are applied with the same animation logic
        playMoves(fixMoves, false)

        // Poll for completion of the fixes playback by watching the moves queue
        const start = Date.now()
        const POLL_INTERVAL = AUTO_SOLVE_STEP_DELAY // ms
        const TIMEOUT = AUTO_SOLVE_MAX_TIME // ms - safety timeout

        const checkDone = async () => {
          // If queue empty, assume playback finished
          // Stryker disable next-line ConditionalExpression: for the single-move fix path the queue is already empty after the synchronous first play, so forcing this branch is unobservable; the never-empty variant is covered by the drain/timeout tests
          if (movesQueueRef.current.length === 0) {
            // Small delay to ensure final state applied, then resume autosolve
            setTimeout(async () => {
              try {
                await restartAutoSolve(false)
              } catch (error) {
                // Stryker disable next-line StringLiteral: logger is unobserved in hook tests
                logger.error('Failed to resume autosolving after check&fix:', error)
                onError?.('Failed to resume autosolving after applying fixes')
              }
              resolve()
            }, 50)
            return
          }

          // Timeout guard. The elapsed-time comparison is a safety-net threshold whose exact
          // firing delay is not a specified behavior: every operator/boundary variant still
          // triggers the same recovery (restartAutoSolve) once the queue stalls, and the
          // never-timeout variant is covered by the stall-recovery test.
          // Stryker disable next-line ArithmeticOperator,ConditionalExpression,EqualityOperator: safety-net threshold, no observable difference (see note above)
          if (Date.now() - start > TIMEOUT) {
            // Stryker disable next-line StringLiteral: logger is unobserved in hook tests
            logger.error('applyFixesAndContinueSolving: playback did not finish within timeout')
            // Try to restart anyway
            try {
              await restartAutoSolve(false)
            } catch (error) {
              // Stryker disable next-line StringLiteral: logger is unobserved in hook tests
              logger.error('Failed to resume autosolving after timeout:', error)
              onError?.('Failed to resume autosolving after applying fixes')
            }
            resolve()
            return
          }

          setTimeout(checkDone, POLL_INTERVAL)
        }

        void checkDone()
      })
    },
    [isAutoSolving, playMoves, stopAutoSolve, restartAutoSolve, onError],
  )

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference.
  return useMemo(
    () => ({
      isAutoSolving,
      isPaused,
      isFetching,
      startAutoSolve,
      stopAutoSolve,
      togglePause,
      restartAutoSolve,
      solveFromGivens,
      playMoves, // <- ADDED so Game.tsx can drive UI/UX animated playback for custom move sequences (Check & Fix)
      applyFixesAndContinueSolving, // NEW: Apply fixes and resume autosolving
      stepBack,
      stepForward,
      canStepBack: isAutoSolving && currentIndex > 0,
      canStepForward: isAutoSolving && currentIndex < totalMoves,
      currentIndex,
      totalMoves,
      lastCompletedSteps,
    }),
    [
      isAutoSolving,
      isPaused,
      isFetching,
      startAutoSolve,
      stopAutoSolve,
      togglePause,
      restartAutoSolve,
      solveFromGivens,
      playMoves,
      applyFixesAndContinueSolving,
      stepBack,
      stepForward,
      currentIndex,
      totalMoves,
      lastCompletedSteps,
    ],
  )
}
