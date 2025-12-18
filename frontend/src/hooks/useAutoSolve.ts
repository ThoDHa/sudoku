import { useState, useCallback, useRef, useEffect } from 'react'
import { PLAY_DELAY } from '../lib/constants'
import { solveAll } from '../lib/solver-service'
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
}

interface UseAutoSolveReturn {
  /** Whether auto-solve is currently running */
  isAutoSolving: boolean
  /** Whether auto-solve is paused (tab hidden or manual) */
  isPaused: boolean
  /** Start the auto-solve process */
  startAutoSolve: () => Promise<void>
  /** Stop the auto-solve process */
  stopAutoSolve: () => void
  /** Toggle pause/resume */
  togglePause: () => void
  /** Solve from givens only (show solution) */
  solveFromGivens: () => Promise<void>
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
  } = options

  const [isAutoSolving, setIsAutoSolving] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [manualPaused, setManualPaused] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [totalMoves, setTotalMoves] = useState(0)
  
  const autoSolveRef = useRef(false)
  const pausedRef = useRef(false)
  const manualPausedRef = useRef(false)
  const movesQueueRef = useRef<MoveResult[]>([])
  const allMovesRef = useRef<MoveResult[]>([]) // All moves for rewind
  const stateHistoryRef = useRef<StateSnapshot[]>([]) // State at each step
  const currentIndexRef = useRef(-1)
  const playNextMoveRef = useRef<(() => Promise<void>) | null>(null)
  const stepDelayRef = useRef(stepDelay)

  // Keep stepDelayRef in sync with prop so speed changes take effect dynamically
  useEffect(() => {
    stepDelayRef.current = stepDelay
  }, [stepDelay])

  // Sync gamePaused prop with our internal pause state
  useEffect(() => {
    const shouldPause = gamePaused || manualPaused
    if (shouldPause) {
      pausedRef.current = true
      setIsPaused(true)
    } else {
      const wasPaused = pausedRef.current
      pausedRef.current = false
      setIsPaused(false)
      // Resume playback if we were auto-solving and just unpaused
      if (wasPaused && autoSolveRef.current && playNextMoveRef.current) {
        playNextMoveRef.current()
      }
    }
  }, [gamePaused, manualPaused])

  const stopAutoSolve = useCallback(() => {
    autoSolveRef.current = false
    pausedRef.current = false
    manualPausedRef.current = false
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
  }, [])

  const togglePause = useCallback(() => {
    if (!isAutoSolving) return
    setManualPaused(prev => {
      manualPausedRef.current = !prev
      return !prev
    })
  }, [isAutoSolving])

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
    }
    
    // Update the moves queue so forward playback works from this point
    movesQueueRef.current = allMovesRef.current.slice(newIndex)
  }, [isAutoSolving, applyState])

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
        
        // Update the moves queue
        movesQueueRef.current = allMovesRef.current.slice(newIndex)
      }
    }
  }, [isAutoSolving, applyMove, applyState, getCandidates])

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

    try {
      const data = await solveAll(currentBoard, candidatesArray, givens)
      
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

        const moveResult = movesQueueRef.current.shift()!
        const newIndex = allMovesRef.current.length - movesQueueRef.current.length
        currentIndexRef.current = newIndex
        setCurrentIndex(newIndex)
        
        // Handle special moves from backend
        if (moveResult.move.action === 'contradiction') {
          // Backend detected a contradiction but continued - just skip this move in playback
          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            await new Promise(resolve => setTimeout(resolve, stepDelayRef.current))
            playNextMove()
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
            await new Promise(resolve => setTimeout(resolve, stepDelayRef.current))
            playNextMove()
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
            await new Promise(resolve => setTimeout(resolve, stepDelayRef.current))
            playNextMove()
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
              await new Promise(resolve => setTimeout(resolve, stepDelayRef.current))
              playNextMove()
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
          await new Promise(resolve => setTimeout(resolve, stepDelayRef.current))
          playNextMove()
        } else {
          stopAutoSolve()
        }
      }

      // Store reference for resume functionality
      playNextMoveRef.current = playNextMove

      // Start playback
      playNextMove()

    } catch (err) {
      console.error('Auto-solve error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [isAutoSolving, getBoard, getCandidates, getGivens, applyMove, isComplete, onError, onUnpinpointableError, onStatus, onErrorFixed, stopAutoSolve])

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

    try {
      const data = await solveAll(givens, [], givens)
      
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

        const moveResult = movesQueueRef.current.shift()!
        const newIndex = allMovesRef.current.length - movesQueueRef.current.length
        currentIndexRef.current = newIndex
        setCurrentIndex(newIndex)
        
        // Skip diagnostic/error moves when solving from givens
        if (['contradiction', 'error', 'diagnostic', 'unpinpointable-error', 'stalled'].includes(moveResult.move.action)) {
          if (movesQueueRef.current.length > 0) {
            await new Promise(resolve => setTimeout(resolve, stepDelayRef.current))
            playNextMove()
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
          await new Promise(resolve => setTimeout(resolve, stepDelayRef.current))
          playNextMove()
        } else {
          stopAutoSolve()
        }
      }

      playNextMoveRef.current = playNextMove
      playNextMove()

    } catch (err) {
      console.error('Solve from givens error:', err)
      onError?.(err instanceof Error ? err.message : 'Failed to get solution.')
      stopAutoSolve()
    }
  }, [isAutoSolving, getGivens, getCandidates, applyMove, onError, stopAutoSolve])

  return {
    isAutoSolving,
    isPaused,
    startAutoSolve,
    stopAutoSolve,
    togglePause,
    solveFromGivens,
    stepBack,
    stepForward,
    canStepBack: isAutoSolving && currentIndex > 0,
    canStepForward: isAutoSolving && currentIndex < totalMoves,
    currentIndex,
    totalMoves,
  }
}
