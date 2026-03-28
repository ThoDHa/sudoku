import type { Move } from './useSudokuGame'

export interface MoveResult {
  board: number[]
  candidates: (number[] | null)[]
  move: Move & { userEntryCount?: number }
}

export interface StateSnapshot {
  board: number[]
  candidates: number[][]
  move: Move | null
}

export type PlayNextMove = () => Promise<void>

export interface MoveHandlerContext {
  autoSolveRef: { current: boolean }
  pausedRef: { current: boolean }
  movesQueueRef: { current: MoveResult[] }
  allMovesRef: { current: MoveResult[] }
  stateHistoryRef: { current: StateSnapshot[] }
  currentIndexRef: { current: number }
  setCurrentIndex: (index: number) => void
  scheduleNextMove: (callback: () => void, delay: number) => void
  stopAutoSolve: () => void
  stepDelayRef: { current: number }
  applyMove: (board: number[], candidates: Set<number>[], move: Move, index: number) => void
  getCandidates: () => Set<number>[]
  onError?: (message: string) => void
  onUnpinpointableError?: (message: string, userEntryCount: number) => void
  onStatus?: (message: string) => void
  onErrorFixed?: (message: string, resumeCallback: () => void) => void
  initialCandidates: Set<number>[]
  skipSpecialMoves: boolean
}

export function handleMoveResult(
  moveResult: MoveResult,
  newIndex: number,
  context: MoveHandlerContext,
  playNextMove: PlayNextMove
): boolean {
  const {
    autoSolveRef,
    movesQueueRef,
    stateHistoryRef,
    scheduleNextMove,
    stopAutoSolve,
    stepDelayRef,
    applyMove,
    getCandidates,
    onError,
    onUnpinpointableError,
    onStatus,
    onErrorFixed,
    initialCandidates,
    skipSpecialMoves,
  } = context

  const action = moveResult.move.action
  const hasMoreMoves = () => movesQueueRef.current.length > 0 && autoSolveRef.current

  function continueOrStop() {
    if (hasMoreMoves()) {
      scheduleNextMove(playNextMove, stepDelayRef.current)
    } else {
      stopAutoSolve()
    }
  }

  function applyRegularMove(candidatesFallback: Set<number>[]) {
    const newCandidates = moveResult.candidates
      ? moveResult.candidates.map(c => new Set<number>(c || []))
      : candidatesFallback

    applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)

    stateHistoryRef.current.push({
      board: [...moveResult.board],
      candidates: moveResult.candidates
        ? moveResult.candidates.map(arr => arr ? [...arr] : [])
        : candidatesFallback.map(s => Array.from(s)),
      move: moveResult.move,
    })

    continueOrStop()
  }

  const specialActions = ['contradiction', 'error', 'diagnostic', 'unpinpointable-error', 'stalled']

  if (skipSpecialMoves && specialActions.includes(action)) {
    continueOrStop()
    return true
  }

  switch (action) {
    case 'contradiction':
      if (hasMoreMoves()) {
        scheduleNextMove(playNextMove, stepDelayRef.current)
      } else {
        onError?.('Puzzle has a contradiction that could not be resolved.')
        stopAutoSolve()
      }
      return true

    case 'error': {
      const userEntryCount = moveResult.move.userEntryCount || 0
      onUnpinpointableError?.(
        moveResult.move.explanation || 'Too many incorrect entries to fix automatically.',
        userEntryCount
      )
      stopAutoSolve()
      return true
    }

    case 'diagnostic':
      onStatus?.(moveResult.move.explanation || 'Taking another look...')
      continueOrStop()
      return true

    case 'unpinpointable-error':
    case 'stalled': {
      const userEntryCount = moveResult.move.userEntryCount || 0
      onUnpinpointableError?.(
        moveResult.move.explanation || `Couldn't pinpoint the error. Check your ${userEntryCount} entries.`,
        userEntryCount
      )
      stopAutoSolve()
      return true
    }

    case 'clear-candidates': {
      const newCandidates = moveResult.candidates
        ? moveResult.candidates.map(c => new Set<number>(c || []))
        : initialCandidates.map(() => new Set<number>())

      applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)

      stateHistoryRef.current.push({
        board: [...moveResult.board],
        candidates: moveResult.candidates
          ? moveResult.candidates.map(arr => arr ? [...arr] : [])
          : [],
        move: moveResult.move,
      })

      continueOrStop()
      return true
    }

    case 'fix-error': {
      const newCandidates = moveResult.candidates
        ? moveResult.candidates.map(c => new Set<number>(c || []))
        : getCandidates()

      applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)

      stateHistoryRef.current.push({
        board: [...moveResult.board],
        candidates: moveResult.candidates
          ? moveResult.candidates.map(arr => arr ? [...arr] : [])
          : getCandidates().map(s => Array.from(s)),
        move: moveResult.move,
      })

      if (onErrorFixed) {
        onErrorFixed(
          moveResult.move.explanation || 'Found and fixed an error in your entries.',
          () => {
            if (hasMoreMoves()) {
              playNextMove()
            } else {
              stopAutoSolve()
            }
          }
        )
      } else {
        continueOrStop()
      }
      return true
    }

    default:
      applyRegularMove(initialCandidates)
      return true
  }
}

export function createPlayNextMove(
  context: MoveHandlerContext
): PlayNextMove {
  const {
    autoSolveRef,
    pausedRef,
    movesQueueRef,
    allMovesRef,
    currentIndexRef,
    setCurrentIndex,
    stopAutoSolve,
  } = context

  const playNextMove: PlayNextMove = async () => {
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

    handleMoveResult(moveResult, newIndex, context, playNextMove)
  }

  return playNextMove
}

export function candidatesToSets(candidates: (number[] | null)[]): Set<number>[] {
  return candidates.map(c => new Set<number>(c || []))
}

export function candidatesToArrays(candidates: Set<number>[]): number[][] {
  return candidates.map(s => Array.from(s))
}
