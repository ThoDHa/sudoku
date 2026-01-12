import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { PLAY_DELAY } from '../lib/constants'
import { solveAll } from '../lib/solver-service'
import { useBackgroundManager } from './useBackgroundManager'
import type { Move } from './useSudokuGame'

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

interface MoveResult {
  board: number[]
  candidates: (number[] | null)[]
  move: Move & { userEntryCount?: number }
}

// State snapshot for rewind functionality
interface StateSnapshot {
  board: number[]
  candidates: number[][] // Serialized for storage
  move: Move | null // The move that was applied to reach this state (null for initial)
}

/**
 * Hook to manage auto-solve functionality.
 * Fetches all moves in one request via /api/solve/all, then plays them back with animation.
 * Pauses when tab is hidden and resumes when visible again.
 * Supports rewind/fast-forward with stepBack/stepForward.
 */
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
  }, [gamePaused, manualPaused, backgroundManager.shouldPauseOperations, getBoard, stopAutoSolve])

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

      const playNextMove = async () => {
        if (!autoSolveRef.current) {
          stopAutoSolve()
          return
        }

        if (pausedRef.current) {
          return
        }

        if (movesQueueRef.current.length === 0) {
          stopAutoSolve()
          return
        }

        const moveResult = movesQueueRef.current.shift()
        if (!moveResult) return
        const newIndex = allMovesRef.current.length - movesQueueRef.current.length
        currentIndexRef.current = newIndex
        setCurrentIndex(newIndex)

        if (moveResult.move.action === 'contradiction') {
          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            scheduleNextMove(playNextMove, stepDelayRef.current)
          } else {
            onError?.('Puzzle has a contradiction that could not be resolved.')
            stopAutoSolve()
          }
          return
        }

        if (moveResult.move.action === 'error') {
          const userEntryCount = moveResult.move.userEntryCount || 0
          onUnpinpointableError?.(
            moveResult.move.explanation || 'Too many incorrect entries to fix automatically.',
            userEntryCount
          )
          stopAutoSolve()
          return
        }

        if (moveResult.move.action === 'diagnostic') {
          onStatus?.(moveResult.move.explanation || 'Taking another look...')
          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            scheduleNextMove(playNextMove, stepDelayRef.current)
          } else {
            stopAutoSolve()
          }
          return
        }

        if (moveResult.move.action === 'unpinpointable-error' || moveResult.move.action === 'stalled') {
          const userEntryCount = moveResult.move.userEntryCount || 0
          onUnpinpointableError?.(
            moveResult.move.explanation || `Couldn't pinpoint the error. Check your ${userEntryCount} entries.`,
            userEntryCount
          )
          stopAutoSolve()
          return
        }

        if (moveResult.move.action === 'clear-candidates') {
          const newCandidates = moveResult.candidates
            ? moveResult.candidates.map((cellCands: number[] | null) =>
                new Set<number>(cellCands || [])
              )
            : currentCandidates.map(() => new Set<number>())

          applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)

          stateHistoryRef.current.push({
            board: [...moveResult.board],
            candidates: moveResult.candidates
              ? moveResult.candidates.map(arr => arr ? [...arr] : [])
              : [],
            move: moveResult.move,
          })

          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            scheduleNextMove(playNextMove, stepDelayRef.current)
          } else {
            stopAutoSolve()
          }
          return
        }

        if (moveResult.move.action === 'fix-error') {
          const newCandidates = moveResult.candidates
            ? moveResult.candidates.map((cellCands: number[] | null) =>
                new Set<number>(cellCands || [])
              )
            : getCandidates()

          applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)

          stateHistoryRef.current.push({
            board: [...moveResult.board],
            candidates: moveResult.candidates
              ? moveResult.candidates.map(arr => arr ? [...arr] : [])
              : getCandidates().map(set => Array.from(set)),
            move: moveResult.move,
          })

          if (onErrorFixed) {
            onErrorFixed(
              moveResult.move.explanation || 'Found and fixed an error in your entries.',
              () => {
                if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
                  playNextMove()
                } else {
                  stopAutoSolve()
                }
              }
            )
          } else {
            if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
              scheduleNextMove(playNextMove, stepDelayRef.current)
            } else {
              stopAutoSolve()
            }
          }
          return
        }

        const newCandidates = moveResult.candidates
          ? moveResult.candidates.map((cellCands: number[] | null) =>
              new Set<number>(cellCands || [])
            )
          : currentCandidates

        applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)

        stateHistoryRef.current.push({
          board: [...moveResult.board],
          candidates: moveResult.candidates
            ? moveResult.candidates.map(arr => arr ? [...arr] : [])
            : currentCandidates.map(set => Array.from(set)),
          move: moveResult.move,
        })

        if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
          scheduleNextMove(playNextMove, stepDelayRef.current)
        } else {
          stopAutoSolve()
        }
      }

      playNextMoveRef.current = playNextMove

      if (!startPaused) {
        playNextMove()
      }

    } catch (err) {
      setIsFetching(false)
      console.error('Auto-solve error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [getBoard, getCandidates, getGivens, applyMove, onError, onUnpinpointableError, onStatus, onErrorFixed, stopAutoSolve, scheduleNextMove])

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
    
    // Store initial state
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

      // Store all moves for rewind functionality
      allMovesRef.current = data.moves
      movesQueueRef.current = [...data.moves]
      setTotalMoves(data.moves.length)

      // Play back moves with animation
      const playNextMove = async () => {
        // Don't proceed if stopped or paused
        if (!autoSolveRef.current) {
          stopAutoSolve()
          return
        }
        
        // If paused, don't proceed - we'll be called again when resumed
        if (pausedRef.current) {
          return
        }

        if (movesQueueRef.current.length === 0) {
          stopAutoSolve()
          return
        }

        const moveResult = movesQueueRef.current.shift()
        if (!moveResult) return
        const newIndex = allMovesRef.current.length - movesQueueRef.current.length
        currentIndexRef.current = newIndex
        setCurrentIndex(newIndex)
        
        // Handle special moves from backend
        if (moveResult.move.action === 'contradiction') {
          // Backend detected a contradiction but continued - just skip this move in playback
          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            scheduleNextMove(playNextMove, stepDelayRef.current)
          } else {
            onError?.('Puzzle has a contradiction that could not be resolved.')
            stopAutoSolve()
          }
          return
        }
        
        if (moveResult.move.action === 'error') {
          // Backend gave up - too many errors - offer user a choice
          const userEntryCount = moveResult.move.userEntryCount || 0
          onUnpinpointableError?.(
            moveResult.move.explanation || 'Too many incorrect entries to fix automatically.',
            userEntryCount
          )
          stopAutoSolve()
          return
        }

        if (moveResult.move.action === 'diagnostic') {
          // Backend is trying candidate refill diagnostic - show status message
          onStatus?.(moveResult.move.explanation || 'Taking another look...')
          // Continue with next moves
          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            scheduleNextMove(playNextMove, stepDelayRef.current)
          } else {
            stopAutoSolve()
          }
          return
        }

        if (moveResult.move.action === 'unpinpointable-error' || moveResult.move.action === 'stalled') {
          // Backend couldn't find the error or is stuck - offer user a choice
          const userEntryCount = moveResult.move.userEntryCount || 0
          onUnpinpointableError?.(
            moveResult.move.explanation || `Couldn't pinpoint the error. Check your ${userEntryCount} entries.`,
            userEntryCount
          )
          stopAutoSolve()
          return
        }
        
        if (moveResult.move.action === 'clear-candidates') {
          // Backend cleared candidates - apply the clean state
          const newCandidates = moveResult.candidates
            ? moveResult.candidates.map((cellCands: number[] | null) => 
                new Set<number>(cellCands || [])
              )
            : currentCandidates.map(() => new Set<number>())
          
          applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
          
          // Store state for rewind
          stateHistoryRef.current.push({
            board: [...moveResult.board],
            candidates: moveResult.candidates 
              ? moveResult.candidates.map(arr => arr ? [...arr] : [])
              : [],
            move: moveResult.move,
          })
          
          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            scheduleNextMove(playNextMove, stepDelayRef.current)
          } else {
            stopAutoSolve()
          }
          return
        }

        if (moveResult.move.action === 'fix-error') {
          // Backend found and fixed a user error - apply the fix
          // Backend now sends correct candidates (with ClearCell preserving solver progress)
          const newCandidates = moveResult.candidates
            ? moveResult.candidates.map((cellCands: number[] | null) => 
                new Set<number>(cellCands || [])
              )
            : getCandidates()
          
          applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
          
          // Store state for rewind
          stateHistoryRef.current.push({
            board: [...moveResult.board],
            candidates: moveResult.candidates 
              ? moveResult.candidates.map(arr => arr ? [...arr] : [])
              : getCandidates().map(set => Array.from(set)),
            move: moveResult.move,
          })
          
          // If callback provided, pause and let user acknowledge before continuing
          if (onErrorFixed) {
            onErrorFixed(
              moveResult.move.explanation || 'Found and fixed an error in your entries.',
              () => {
                // Resume callback - continue solving
                if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
                  playNextMove()
                } else {
                  stopAutoSolve()
                }
              }
            )
          } else {
            // No callback - just continue after delay
            if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
              scheduleNextMove(playNextMove, stepDelayRef.current)
            } else {
              stopAutoSolve()
            }
          }
          return
        }
        
        // Handle regular moves - apply the new board state
        const newCandidates = moveResult.candidates
          ? moveResult.candidates.map((cellCands: number[] | null) => 
              new Set<number>(cellCands || [])
            )
          : currentCandidates

        applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
        
        // Store state for rewind
        stateHistoryRef.current.push({
          board: [...moveResult.board],
          candidates: moveResult.candidates 
            ? moveResult.candidates.map(arr => arr ? [...arr] : [])
            : currentCandidates.map(set => Array.from(set)),
          move: moveResult.move,
        })

        // Wait then play next
        if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
          scheduleNextMove(playNextMove, stepDelayRef.current)
        } else {
          stopAutoSolve()
        }
      }

      // Store reference for resume functionality
      playNextMoveRef.current = playNextMove

      // Start playback
      playNextMove()

    } catch (err) {
      setIsFetching(false)
      console.error('Auto-solve error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [isAutoSolving, getBoard, getCandidates, getGivens, applyMove, isComplete, onError, onUnpinpointableError, onStatus, onErrorFixed, stopAutoSolve, scheduleNextMove])

    // Play a custom move sequence (for Check & Fix, etc)
  const playMoves = useCallback((moves: MoveResult[], startPaused = false) => {
    let steps = 0; // Added: debug safeguard
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
      board: moves[0]?.board || getBoard(),
      candidates: moves[0]?.candidates?.map(arr => arr ? [...arr] : []) || getCandidates().map(set => Array.from(set)),
      move: null,
    }]
    allMovesRef.current = moves
    movesQueueRef.current = [...moves]
    setTotalMoves(moves.length)
    setCurrentIndex(0)
    currentIndexRef.current = 0

    const playNextMove = async () => {
      if (!autoSolveRef.current) {
        stopAutoSolve()
        return
      }
      if (pausedRef.current) {
        return
      }
      if (movesQueueRef.current.length === 0) {
        stopAutoSolve()
        return
      }
      const moveResult = movesQueueRef.current.shift()
      if (!moveResult) return
      const newIndex = allMovesRef.current.length - movesQueueRef.current.length
      currentIndexRef.current = newIndex
      setCurrentIndex(newIndex)
      // Generalized move application code below (mimics normal autosolver replay)
      const newCandidates = moveResult.candidates
        ? moveResult.candidates.map((cellCands: number[] | null) => new Set<number>(cellCands || []))
        : getCandidates()
      // ADDED DEBUG LOGGING FOR EACH MOVE APPLIED
      console.log(`[AutoSolve:playMoves] Step ${steps}/${moves.length} Action: ${moveResult.move && moveResult.move.action} | Index: ${newIndex}`)
      applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
      stateHistoryRef.current.push({
        board: [...moveResult.board],
        candidates: moveResult.candidates
          ? moveResult.candidates.map(arr => arr ? [...arr] : [])
          : getCandidates().map(set => Array.from(set)),
        move: moveResult.move,
      })
      if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
        scheduleNextMove(playNextMove, stepDelayRef.current)
      } else {
        stopAutoSolve()
      }
    }
    playNextMoveRef.current = playNextMove
    if (!startPaused) {
      playNextMove()
    }
  }, [getBoard, getCandidates, applyMove, stopAutoSolve, scheduleNextMove])

  // Solve from givens only - used when user clicks "Show Solution"
  const solveFromGivens = useCallback(async () => {
    if (isAutoSolving) return

    const givens = getGivens()

    setIsAutoSolving(true)
    autoSolveRef.current = true
    
    // Store initial state (the givens)
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

      // Store all moves for rewind
      allMovesRef.current = data.moves
      movesQueueRef.current = [...data.moves]
      setTotalMoves(data.moves.length)
      
      const currentCandidates = getCandidates()

      const playNextMove = async () => {
        if (!autoSolveRef.current || pausedRef.current) {
          if (!autoSolveRef.current) stopAutoSolve()
          return
        }

        if (movesQueueRef.current.length === 0) {
          stopAutoSolve()
          return
        }

        const moveResult = movesQueueRef.current.shift()
        if (!moveResult) return
        const newIndex = allMovesRef.current.length - movesQueueRef.current.length
        currentIndexRef.current = newIndex
        setCurrentIndex(newIndex)
        
        // Skip diagnostic/error moves when solving from givens
        if (['contradiction', 'error', 'diagnostic', 'unpinpointable-error', 'stalled'].includes(moveResult.move.action)) {
          if (movesQueueRef.current.length > 0) {
            scheduleNextMove(playNextMove, stepDelayRef.current)
          } else {
            stopAutoSolve()
          }
          return
        }

        const newCandidates = moveResult.candidates
          ? moveResult.candidates.map((cellCands: number[] | null) => 
              new Set<number>(cellCands || [])
            )
          : currentCandidates

        applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
        
        // Store state for rewind
        stateHistoryRef.current.push({
          board: [...moveResult.board],
          candidates: moveResult.candidates 
            ? moveResult.candidates.map(arr => arr ? [...arr] : [])
            : currentCandidates.map(set => Array.from(set)),
          move: moveResult.move,
        })

        if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
          scheduleNextMove(playNextMove, stepDelayRef.current)
        } else {
          stopAutoSolve()
        }
      }

      playNextMoveRef.current = playNextMove
      playNextMove()

    } catch (err) {
      setIsFetching(false)
      console.error('Solve from givens error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [isAutoSolving, getGivens, getCandidates, applyMove, onError, stopAutoSolve, scheduleNextMove])

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
    stepBack,
    stepForward,
    canStepBack: isAutoSolving && currentIndex > 0,
    canStepForward: isAutoSolving && currentIndex < totalMoves,
    currentIndex,
    totalMoves,
    lastCompletedSteps,
  }), [
    isAutoSolving, isPaused, isFetching, startAutoSolve, stopAutoSolve,
    togglePause, restartAutoSolve, solveFromGivens, playMoves, stepBack, stepForward,
    currentIndex, totalMoves, lastCompletedSteps
  ])
}
