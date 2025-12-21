/**
 * Utility functions for useAutoSolve hook
 * Extracted to reduce duplication and improve testability
 */

import type { Move } from './useSudokuGame'

// ============================================================
// Types
// ============================================================

export interface MoveResult {
  board: number[]
  candidates: (number[] | null)[]
  move: Move & { userEntryCount?: number }
}

export interface StateSnapshot {
  board: number[]
  candidates: number[][] // Serialized for storage
  move: Move | null // The move that was applied to reach this state (null for initial)
}

export type ActionResult =
  | { type: 'continue' }
  | { type: 'stop'; error?: string }
  | { type: 'pause'; resumeCallback: () => void }
  | { type: 'skip' } // Skip this move, continue with next

export interface ActionContext {
  moveResult: MoveResult
  newIndex: number
  getCandidates: () => Set<number>[]
  applyMove: (board: number[], candidates: Set<number>[], move: Move, index: number) => void
  addToHistory: (snapshot: StateSnapshot) => void
  hasMoreMoves: () => boolean
  isActive: () => boolean
  onError: ((message: string) => void) | undefined
  onUnpinpointableError: ((message: string, userEntryCount: number) => void) | undefined
  onStatus: ((message: string) => void) | undefined
  onErrorFixed: ((message: string, resumeCallback: () => void) => void) | undefined
  playNextMove: () => void
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Convert backend candidates array to Set<number>[]
 */
export function convertCandidates(
  candidates: (number[] | null)[] | undefined,
  fallback: Set<number>[]
): Set<number>[] {
  if (!candidates) return fallback
  return candidates.map((cellCands: number[] | null) => 
    new Set<number>(cellCands || [])
  )
}

/**
 * Serialize candidates to number[][] for storage
 */
export function serializeCandidates(
  candidates: (number[] | null)[] | undefined,
  fallback: Set<number>[]
): number[][] {
  if (!candidates) {
    return fallback.map(set => Array.from(set))
  }
  return candidates.map(arr => arr ? [...arr] : [])
}

/**
 * Create a state snapshot for history
 */
export function createStateSnapshot(
  board: number[],
  candidates: (number[] | null)[] | undefined,
  move: Move | null,
  fallbackCandidates: Set<number>[]
): StateSnapshot {
  return {
    board: [...board],
    candidates: serializeCandidates(candidates, fallbackCandidates),
    move,
  }
}

// ============================================================
// Action Handlers
// ============================================================

/**
 * Handle 'contradiction' action - backend detected but continued
 */
export function handleContradiction(ctx: ActionContext): ActionResult {
  if (ctx.hasMoreMoves() && ctx.isActive()) {
    return { type: 'skip' }
  }
  return { type: 'stop', error: 'Puzzle has a contradiction that could not be resolved.' }
}

/**
 * Handle 'error' action - backend gave up, too many errors
 */
export function handleError(ctx: ActionContext): ActionResult {
  const userEntryCount = ctx.moveResult.move.userEntryCount || 0
  ctx.onUnpinpointableError?.(
    ctx.moveResult.move.explanation || 'Too many incorrect entries to fix automatically.',
    userEntryCount
  )
  return { type: 'stop' }
}

/**
 * Handle 'diagnostic' action - status message
 */
export function handleDiagnostic(ctx: ActionContext): ActionResult {
  ctx.onStatus?.(ctx.moveResult.move.explanation || 'Taking another look...')
  if (ctx.hasMoreMoves() && ctx.isActive()) {
    return { type: 'skip' }
  }
  return { type: 'stop' }
}

/**
 * Handle 'unpinpointable-error' and 'stalled' actions
 */
export function handleUnpinpointableError(ctx: ActionContext): ActionResult {
  const userEntryCount = ctx.moveResult.move.userEntryCount || 0
  ctx.onUnpinpointableError?.(
    ctx.moveResult.move.explanation || `Couldn't pinpoint the error. Check your ${userEntryCount} entries.`,
    userEntryCount
  )
  return { type: 'stop' }
}

/**
 * Handle 'clear-candidates' action - apply clean state
 */
export function handleClearCandidates(ctx: ActionContext): ActionResult {
  const { moveResult, newIndex, applyMove, addToHistory, getCandidates } = ctx
  
  const newCandidates = convertCandidates(
    moveResult.candidates,
    getCandidates().map(() => new Set<number>())
  )
  
  applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
  addToHistory(createStateSnapshot(
    moveResult.board,
    moveResult.candidates,
    moveResult.move,
    []
  ))
  
  if (ctx.hasMoreMoves() && ctx.isActive()) {
    return { type: 'continue' }
  }
  return { type: 'stop' }
}

/**
 * Handle 'fix-error' action - found and fixed user error
 */
export function handleFixError(ctx: ActionContext): ActionResult {
  const { moveResult, newIndex, applyMove, addToHistory, getCandidates } = ctx
  
  const newCandidates = convertCandidates(moveResult.candidates, getCandidates())
  
  applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
  addToHistory(createStateSnapshot(
    moveResult.board,
    moveResult.candidates,
    moveResult.move,
    getCandidates()
  ))
  
  // If callback provided, pause and let user acknowledge
  if (ctx.onErrorFixed) {
    return {
      type: 'pause',
      resumeCallback: () => {
        if (ctx.hasMoreMoves() && ctx.isActive()) {
          ctx.playNextMove()
        }
      }
    }
  }
  
  if (ctx.hasMoreMoves() && ctx.isActive()) {
    return { type: 'continue' }
  }
  return { type: 'stop' }
}

/**
 * Handle regular solving moves
 */
export function handleRegularMove(
  ctx: ActionContext,
  fallbackCandidates: Set<number>[]
): ActionResult {
  const { moveResult, newIndex, applyMove, addToHistory } = ctx
  
  const newCandidates = convertCandidates(moveResult.candidates, fallbackCandidates)
  
  applyMove(moveResult.board, newCandidates, moveResult.move, newIndex)
  addToHistory(createStateSnapshot(
    moveResult.board,
    moveResult.candidates,
    moveResult.move,
    fallbackCandidates
  ))
  
  if (ctx.hasMoreMoves() && ctx.isActive()) {
    return { type: 'continue' }
  }
  return { type: 'stop' }
}

// ============================================================
// Action Dispatcher
// ============================================================

/**
 * Dispatch move action to appropriate handler
 */
export function dispatchMoveAction(
  ctx: ActionContext,
  fallbackCandidates: Set<number>[]
): ActionResult {
  const action = ctx.moveResult.move.action
  
  switch (action) {
    case 'contradiction':
      return handleContradiction(ctx)
    
    case 'error':
      return handleError(ctx)
    
    case 'diagnostic':
      return handleDiagnostic(ctx)
    
    case 'unpinpointable-error':
    case 'stalled':
      return handleUnpinpointableError(ctx)
    
    case 'clear-candidates':
      return handleClearCandidates(ctx)
    
    case 'fix-error':
      return handleFixError(ctx)
    
    default:
      return handleRegularMove(ctx, fallbackCandidates)
  }
}
