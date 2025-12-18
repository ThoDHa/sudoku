import { useState, useCallback, useRef } from 'react'
import { PLAY_DELAY } from '../lib/constants'
import type { Move } from './useSudokuGame'

interface UseAutoSolveOptions {
  /** API token for backend calls */
  token: string | null
  /** Delay between steps in milliseconds (default: PLAY_DELAY) */
  stepDelay?: number
  /** Get current board state */
  getBoard: () => number[]
  /** Get current candidates */
  getCandidates: () => Set<number>[]
  /** Apply a move to the game state */
  applyMove: (newBoard: number[], newCandidates: Set<number>[], move: Move) => void
  /** Check if puzzle is complete */
  isComplete: () => boolean
  /** Called when an error occurs */
  onError?: (message: string) => void
}

interface UseAutoSolveReturn {
  /** Whether auto-solve is currently running */
  isAutoSolving: boolean
  /** Start the auto-solve process */
  startAutoSolve: () => Promise<void>
  /** Stop the auto-solve process */
  stopAutoSolve: () => void
}

interface MoveResult {
  board: number[]
  candidates: (number[] | null)[]
  move: Move
}

/**
 * Hook to manage auto-solve functionality.
 * Fetches all moves in one request via /api/solve/all, then plays them back with animation.
 */
export function useAutoSolve(options: UseAutoSolveOptions): UseAutoSolveReturn {
  const { token, stepDelay = PLAY_DELAY, getBoard, getCandidates, applyMove, isComplete, onError } = options

  const [isAutoSolving, setIsAutoSolving] = useState(false)
  const autoSolveRef = useRef(false)
  const movesQueueRef = useRef<MoveResult[]>([])

  const stopAutoSolve = useCallback(() => {
    autoSolveRef.current = false
    movesQueueRef.current = []
    setIsAutoSolving(false)
  }, [])

  const startAutoSolve = useCallback(async () => {
    if (!token || isAutoSolving || isComplete()) return

    const currentBoard = getBoard()
    const currentCandidates = getCandidates()
    const candidatesArray = currentCandidates.map(set => Array.from(set))

    setIsAutoSolving(true)
    autoSolveRef.current = true

    try {
      const res = await fetch('/api/solve/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, board: currentBoard, candidates: candidatesArray }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        onError?.(errorData.error || 'Failed to get solution')
        stopAutoSolve()
        return
      }

      const data = await res.json()
      
      if (!data.moves || data.moves.length === 0) {
        if (!data.solved) {
          onError?.('This puzzle requires advanced techniques beyond our solver.')
        }
        stopAutoSolve()
        return
      }

      // Store moves in queue and play them back
      movesQueueRef.current = data.moves

      // Play back moves with animation
      const playNextMove = async () => {
        if (!autoSolveRef.current || movesQueueRef.current.length === 0) {
          stopAutoSolve()
          return
        }

        const moveResult = movesQueueRef.current.shift()!
        
        // Handle special moves from backend
        if (moveResult.move.action === 'contradiction') {
          // Backend detected a contradiction but continued - just skip this move in playback
          // The next moves should resolve it
          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            await new Promise(resolve => setTimeout(resolve, stepDelay))
            playNextMove()
          } else {
            // No more moves after contradiction - this is a real problem
            onError?.('Puzzle has a contradiction that could not be resolved.')
            stopAutoSolve()
          }
          return
        }
        
        if (moveResult.move.action === 'restart') {
          // Backend cleared everything and started fresh - apply the clean state
          const newCandidates = moveResult.candidates
            ? moveResult.candidates.map((cellCands: number[] | null) => 
                new Set<number>(cellCands || [])
              )
            : currentCandidates.map(() => new Set<number>())
          
          applyMove(moveResult.board, newCandidates, moveResult.move)
          
          // Continue with next moves
          if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
            await new Promise(resolve => setTimeout(resolve, stepDelay))
            playNextMove()
          } else {
            stopAutoSolve()
          }
          return
        }
        
        // Convert candidates from arrays to Sets
        const newCandidates = moveResult.candidates
          ? moveResult.candidates.map((cellCands: number[] | null) => 
              new Set<number>(cellCands || [])
            )
          : currentCandidates

        applyMove(moveResult.board, newCandidates, moveResult.move)

        // Wait then play next
        if (movesQueueRef.current.length > 0 && autoSolveRef.current) {
          await new Promise(resolve => setTimeout(resolve, stepDelay))
          playNextMove()
        } else {
          stopAutoSolve()
        }
      }

      // Start playback
      playNextMove()

    } catch (err) {
      console.error('Auto-solve error:', err)
      onError?.('Failed to get solution from server.')
      stopAutoSolve()
    }
  }, [token, isAutoSolving, stepDelay, getBoard, getCandidates, applyMove, isComplete, onError, stopAutoSolve])

  return {
    isAutoSolving,
    startAutoSolve,
    stopAutoSolve,
  }
}
