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
  const [isPaused, setIsPaused] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [manualPaused, setManualPaused] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [totalMoves, setTotalMoves] = useState(0)
  const [lastCompletedSteps, setLastCompletedSteps] = useState(0)

  const autoSolveRef = useRef(false)
  const pausedRef = useRef(false)
  const manualPausedRef = useRef(false)
  const movesQueueRef = useRef<MoveResult[]>([])
  const allMovesRef = useRef<MoveResult[]>([]) // All moves for rewind
  const stateHistoryRef = useRef<StateSnapshot[]>([]) // State at each step
  const currentIndexRef = useRef(-1)
  const playNextMoveRef = useRef<(() => Promise<void>) | null>(null)
  const stepDelayRef = useRef(stepDelay)
  
  // Snapshot of board state when manually paused - used to detect board changes
  const pausedBoardSnapshotRef = useRef<number[] | null>(null)
  
  // Track active timers for cleanup - prevents battery drain from orphaned timers
  const activeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdleCallbackRef = useRef<number | null>(null)

  // Keep stepDelayRef in sync with prop so speed changes take effect dynamically
  useEffect(() => {
    stepDelayRef.current = stepDelay
  }, [stepDelay])

  // Note: stateHistoryRef is bounded per-session since it's reset at the start
  // of each solve. MAX_MOVE_HISTORY is imported but not used here because the
  // history is cleared on stopAutoSolve. If needed, add limit check after each push.

  // Helper to clear any active timers
  const clearActiveTimers = useCallback(() => {
    if (activeTimeoutRef.current !== null) {
      clearTimeout(activeTimeoutRef.current)
      activeTimeoutRef.current = null
    }
    if (activeIdleCallbackRef.current !== null) {
      if ('cancelIdleCallback' in window) {
        cancelIdleCallback(activeIdleCallbackRef.current)
      }
      activeIdleCallbackRef.current = null
    }
  }, [])

  // Helper to schedule next move with proper timer tracking
  const scheduleNextMove = useCallback((callback: () => void, delay: number) => {
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
  }, [clearActiveTimers])

  const stopAutoSolve = useCallback(() => {
    // Clear all active timers first to prevent battery drain
    clearActiveTimers()
    
    // Save the final step count BEFORE resetting (for history display)
    const finalSteps = currentIndexRef.current > 0 ? currentIndexRef.current : 0
    setLastCompletedSteps(finalSteps)
    
    autoSolveRef.current = false
    pausedRef.current = false
    manualPausedRef.current = false
    pausedBoardSnapshotRef.current = null
    movesQueueRef.current = []
    allMovesRef.current = []
    stateHistoryRef.current = []
    currentIndexRef.current = -1
    playNextMoveRef.current = null
    setIsAutoSolving(false)
    setIsPaused(false)
    setManualPaused(false)
    setCurrentIndex(-1)
    setTotalMoves(0)
  }, [clearActiveTimers])

  // Cleanup on unmount - prevents battery drain from orphaned timers
  useEffect(() => {
    return () => {
      clearActiveTimers()
      autoSolveRef.current = false
    }
  }, [clearActiveTimers])

  // Sync gamePaused prop and background manager with our internal pause state
  useEffect(() => {
    const shouldPause = gamePaused || manualPaused || backgroundManager.shouldPauseOperations
    // Debug: log pause sources during tests when needed
    // Always log pause-check details using our logger. Logger implementations can
    // decide whether to emit output based on environment, so we don't need to
    // guard with process.env here and avoid relying on Node typings in the bundle.
    logger.debug('[useAutoSolve] pause check:', { gamePaused, manualPaused, shouldPauseOperations: backgroundManager.shouldPauseOperations })
    if (shouldPause) {
      pausedRef.current = true
      setIsPaused(true)
    } else {
      const wasPaused = pausedRef.current
      pausedRef.current = false
      setIsPaused(false)
      // Resume playback if we were auto-solving and just unpaused
      if (wasPaused && autoSolveRef.current && playNextMoveRef.current) {
        // Check if board changed while paused (user made edits)
        if (pausedBoardSnapshotRef.current !== null) {
          const currentBoard = getBoard()
          const boardChanged = pausedBoardSnapshotRef.current.some(
            (val, idx) => val !== currentBoard[idx]
          )
          if (boardChanged) {
            // Board was modified - stop auto-solve instead of resuming
            stopAutoSolve()
            pausedBoardSnapshotRef.current = null
            return
          }
        }
        pausedBoardSnapshotRef.current = null
        playNextMoveRef.current()
      }
    }
  }, [gamePaused, manualPaused, backgroundManager, getBoard, stopAutoSolve])

  const togglePause = useCallback(() => {
    if (!isAutoSolving) return
    setManualPaused(prev => {
      const newPaused = !prev
      manualPausedRef.current = newPaused
      // Snapshot board state when pausing so we can detect changes on resume
      if (newPaused) {
        pausedBoardSnapshotRef.current = [...getBoard()]
      }
      return newPaused
    })
  }, [isAutoSolving, getBoard])

  const restartAutoSolve = useCallback(async (startPaused: boolean = false) => {
    const currentBoard = getBoard()
    const currentCandidates = getCandidates()
    const candidatesArray = currentCandidates.map(set => Array.from(set))
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

    stateHistoryRef.current = [{
      board: [...currentBoard],
      candidates: candidatesArray.map(arr => [...arr]),
      move: null,
    }]
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

      if (!startPaused) {
        playNextMove()
      }

    } catch (err) {
      setIsFetching(false)
      logger.error('Auto-solve error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [getBoard, getCandidates, getGivens, applyMove, onError, onUnpinpointableError, onStatus, onErrorFixed, stopAutoSolve, scheduleNextMove, setCurrentIndex])

  // Step backward one move
  const stepBack = useCallback(() => {
    if (!isAutoSolving || currentIndexRef.current <= 0) return
    
    // Pause playback when manually stepping
    if (!manualPausedRef.current) {
      manualPausedRef.current = true
      setManualPaused(true)
    }
    
    const newIndex = currentIndexRef.current - 1
    currentIndexRef.current = newIndex
    setCurrentIndex(newIndex)
    
    // Restore the state from before this move was applied
    const snapshot = stateHistoryRef.current[newIndex]
    if (snapshot) {
      const candidates = snapshot.candidates.map(arr => new Set(arr))
      applyState(snapshot.board, candidates, snapshot.move, newIndex)
      // Notify about the step navigation with the move we're now viewing
      onStepNavigate?.(snapshot.move, 'back')
    }
    
    // Update the moves queue so forward playback works from this point
    movesQueueRef.current = allMovesRef.current.slice(newIndex)
  }, [isAutoSolving, applyState, onStepNavigate])

  // Step forward one move
  const stepForward = useCallback(() => {
    if (!isAutoSolving || currentIndexRef.current >= allMovesRef.current.length) return
    
    // Pause playback when manually stepping
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
      if (!snapshot) return
      const candidates = snapshot.candidates.map(arr => new Set(arr))
      applyState(snapshot.board, candidates, snapshot.move, newIndex)
      // Notify about the step navigation
      onStepNavigate?.(snapshot.move, 'forward')
      
      // Update the moves queue
      movesQueueRef.current = allMovesRef.current.slice(newIndex)
    } else {
      // New territory - apply the move normally (adds to history)
      const moveResult = allMovesRef.current[newIndex - 1] // -1 because index 0 is initial state
      
      if (moveResult) {
        currentIndexRef.current = newIndex
        setCurrentIndex(newIndex)
        
        const newCandidates = moveResult.candidates
          ? moveResult.candidates.map((cellCands: number[] | null) => 
              new Set<number>(cellCands || [])
            )
          : getCandidates()
        
        applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
        
        // Add to state history
        stateHistoryRef.current.push({
          board: [...moveResult.board],
          candidates: moveResult.candidates 
            ? moveResult.candidates.map(arr => arr ? [...arr] : [])
            : getCandidates().map(set => Array.from(set)),
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
    const candidatesArray = currentCandidates.map(set => Array.from(set))
    const givens = getGivens()

    setIsAutoSolving(true)
    autoSolveRef.current = true
    
    stateHistoryRef.current = [{
      board: [...currentBoard],
      candidates: candidatesArray.map(arr => [...arr]),
      move: null,
    }]
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
      playNextMove()

    } catch (err) {
      setIsFetching(false)
      logger.error('Auto-solve error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [isAutoSolving, getBoard, getCandidates, getGivens, applyMove, isComplete, onError, onUnpinpointableError, onStatus, onErrorFixed, stopAutoSolve, scheduleNextMove, setCurrentIndex])

    // Play a custom move sequence (for Check & Fix, etc)
  const playMoves = useCallback((moves: MoveResult[], startPaused = false) => {
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

    stateHistoryRef.current = [{
      board: [...(moves[0]?.board || currentBoard)],
      candidates: moves[0]?.candidates?.map(arr => arr ? [...arr] : []) || candidatesToArrays(currentCandidates),
      move: null,
    }]
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
      playNextMove()
    }
  }, [getBoard, getCandidates, applyMove, stopAutoSolve, scheduleNextMove, onError, onUnpinpointableError])

  // Solve from givens only - used when user clicks "Show Solution"
  const solveFromGivens = useCallback(async () => {
    if (isAutoSolving) return

    const givens = getGivens()
    const currentCandidates = getCandidates()

    setIsAutoSolving(true)
    autoSolveRef.current = true
    
    stateHistoryRef.current = [{
      board: [...givens],
      candidates: Array(81).fill([]),
      move: null,
    }]
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
      playNextMove()

    } catch (err) {
      setIsFetching(false)
      logger.error('Solve from givens error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [isAutoSolving, getGivens, getCandidates, applyMove, onError, onUnpinpointableError, onStatus, onErrorFixed, stopAutoSolve, scheduleNextMove, setCurrentIndex])

  // Apply check&fix moves and then continue normal autosolving
  const applyFixesAndContinueSolving = useCallback(async (fixMoves: MoveResult[]) => {
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
        if (movesQueueRef.current.length === 0) {
          // Small delay to ensure final state applied, then resume autosolve
          setTimeout(async () => {
            try {
              await restartAutoSolve(false)
            } catch (error) {
              logger.error('Failed to resume autosolving after check&fix:', error)
              onError?.('Failed to resume autosolving after applying fixes')
            }
            resolve()
          }, 50)
          return
        }

        // Timeout guard
        if (Date.now() - start > TIMEOUT) {
          logger.error('applyFixesAndContinueSolving: playback did not finish within timeout')
          // Try to restart anyway
          try {
            await restartAutoSolve(false)
          } catch (error) {
            logger.error('Failed to resume autosolving after timeout:', error)
            onError?.('Failed to resume autosolving after applying fixes')
          }
          resolve()
          return
        }

        setTimeout(checkDone, POLL_INTERVAL)
      }

      checkDone()
    })
  }, [isAutoSolving, playMoves, stopAutoSolve, restartAutoSolve, onError])

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference.
  return useMemo(() => ({
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
    }), [
    isAutoSolving, isPaused, isFetching, startAutoSolve, stopAutoSolve,
    togglePause, restartAutoSolve, solveFromGivens, playMoves, applyFixesAndContinueSolving, stepBack, stepForward,
    currentIndex, totalMoves, lastCompletedSteps
  ])
}
