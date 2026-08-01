import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { findNextMove } from '../lib/solver-service'
import { createHintRequestGate, type HintRequestGate } from '../lib/hintRequestGate'
import { shouldIncrementHintCounter } from '../lib/hintLifecycle'
import { getHintSignature, getBoardSignature, formatTechniqueName } from '../lib/hintSignatures'
import { commitCellAction } from '../lib/commitCellAction'
import { candidatesToArrays } from '../lib/candidatesUtils'
import { logger } from '../lib/logger'
import { TOAST_DURATION_INFO, TOAST_DURATION_ERROR } from '../lib/constants'
import type { Move, UseSudokuGameReturn } from './useSudokuGame'
import type { MoveHighlight } from './useHighlightState'
import type { UnpinpointableErrorInfo } from './useGameModals'

export interface HintValidationMessage {
  type: 'success' | 'error' | 'info'
  message: string
  action?: { label: string; onClick: () => void }
}

export interface UseHintsOptions {
  game: UseSudokuGameReturn
  gameRef: RefObject<UseSudokuGameReturn | null>
  initialBoard: number[]
  clearAllAndDeselect: () => void
  setMoveHighlight: (move: MoveHighlight, index: number) => void
  clearMoveHighlight: () => void
  scheduleToastClear: (delay: number, onClear: () => void) => void
  setValidationMessage: (message: HintValidationMessage | null) => void
  setHintsUsed: (updater: (prev: number) => number) => void
  setTechniqueHintsUsed: (updater: (prev: number) => number) => void
  setUnpinpointableErrorInfo: (info: UnpinpointableErrorInfo) => void
  setShowSolutionConfirm: (value: boolean) => void
  setTechniqueModal: (technique: { title: string; slug: string } | null) => void
}

export interface UseHintsReturn {
  handleNext: () => Promise<void>
  handleTechniqueHint: () => Promise<void>
  resetHintTracking: () => void
  hintLoading: boolean
  techniqueHintLoading: boolean
}

// Next-move hint resolution + the two hint-button handlers, plus the loading
// spinners and the cached/dedup tracking the handlers share. resetHintTracking
// is returned so the Game.tsx input handlers can invalidate the cache after any
// user action that changes the board.
export function useHints(options: UseHintsOptions): UseHintsReturn {
  const {
    game,
    gameRef,
    initialBoard,
    clearAllAndDeselect,
    setMoveHighlight,
    clearMoveHighlight,
    scheduleToastClear,
    setValidationMessage,
    setHintsUsed,
    setTechniqueHintsUsed,
    setUnpinpointableErrorInfo,
    setShowSolutionConfirm,
    setTechniqueModal,
  } = options

  const [hintLoading, setHintLoading] = useState(false)
  const [techniqueHintLoading, setTechniqueHintLoading] = useState(false)

  // Guard to prevent concurrent hint requests. createHintRequestGate is a pure
  // factory (a single boolean closure), so evaluating it each render is cheap
  // and side-effect-free; useRef keeps the first instance stable across renders.
  const hintGateRef = useRef<HintRequestGate>(createHintRequestGate())
  // Track last hint shown to avoid counting duplicate hints
  const lastTechniqueHintRef = useRef<string | null>(null)
  const lastRegularHintRef = useRef<string | null>(null)
  // Cache hint result to ensure Technique Hint and Regular Hint show same move
  // Invalidated when board state changes
  const cachedHintRef = useRef<{
    boardSignature: string
    data: Awaited<ReturnType<typeof findNextMove>>
  } | null>(null)

  // Resolve the next hint move, using the cached hint when the board signature is unchanged.
  // Returns null (after surfacing an error toast) when there is no next move.
  const fetchCachedHint = async (): Promise<Move | null> => {
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
      scheduleToastClear(TOAST_DURATION_ERROR, () => {
        setValidationMessage(null)
      })
      return null
    }

    return data.move
  }

  // Handle hint button - shows the next move with full answer (eliminations + additions visible)
  const handleNext = async () => {
    // Prevent concurrent hint requests (spam protection)
    const gate = hintGateRef.current
    if (!gate.canStart()) {
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
          count: move.userEntryCount ?? 0,
        })
        setShowSolutionConfirm(true)
        return
      }

      if (move.action === 'contradiction' || move.action === 'error') {
        const currentGame = gameRef.current
        // Stryker disable next-line OptionalChaining: defensive guard; gameRef.current is always populated by the host component, and the contract does not exercise a null ref
        if (currentGame?.canUndo) {
          commitCellAction('undo', { game: currentGame, clearMoveHighlight })
          setValidationMessage({
            type: 'error',
            message: move.explanation || 'Contradiction found - undoing last move',
          })
          scheduleToastClear(TOAST_DURATION_ERROR, () => {
            setValidationMessage(null)
          })
          return
        } else {
          setValidationMessage({
            type: 'error',
            message: 'The puzzle cannot be solved - initial state has errors.',
          })
          scheduleToastClear(TOAST_DURATION_ERROR, () => {
            setValidationMessage(null)
          })
          return
        }
      }

      // Show the hint highlight WITH the answer (showAnswer defaults to true)
      // User sees red eliminations and green additions
      setMoveHighlight(move, game.history.length)

      // Show toast with technique explanation
      setValidationMessage({
        type: 'success',
        message: move.explanation || move.technique || 'Hint',
      })
      scheduleToastClear(TOAST_DURATION_INFO, () => {
        setValidationMessage(null)
      })

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
      scheduleToastClear(TOAST_DURATION_ERROR, () => {
        setValidationMessage(null)
      })
    } finally {
      gate.end()
      setHintLoading(false)
    }
  }

  // Handle technique hint button - shows technique name and highlights cells without revealing the answer
  const handleTechniqueHint = async () => {
    // Prevent concurrent requests
    const gate = hintGateRef.current
    if (!gate.canStart()) return
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
        scheduleToastClear(TOAST_DURATION_ERROR, () => {
          setValidationMessage(null)
        })
        return
      }

      // Handle unpinpointable errors separately - no highlighting to show
      if (move.action === 'unpinpointable-error') {
        setValidationMessage({
          type: 'error',
          message: 'There seems to be an error in the puzzle. Try using 💡 Hint to fix it.',
        })
        scheduleToastClear(TOAST_DURATION_ERROR, () => {
          setValidationMessage(null)
        })
        return
      }

      // Handle constraint violations and errors - show WITH highlighting
      if (move.action === 'contradiction' || move.action === 'error') {
        // Show the constraint violation highlights (shows which cells conflict)
        setMoveHighlight({ ...move, showAnswer: false }, game.history.length)

        // Show the error message
        setValidationMessage({
          type: 'error',
          message: move.explanation || 'Constraint violation detected',
        })
        scheduleToastClear(TOAST_DURATION_ERROR, () => {
          setValidationMessage(null)
        })
        return
      }

      // Get the technique info
      const techniqueName = formatTechniqueName(move.technique || 'Unknown Technique')
      const techniqueSlug =
        move.technique?.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-') || 'unknown'

      // Show highlight WITHOUT the answer (showAnswer: false)
      // This shows primary/secondary cell highlighting but hides eliminations and target additions
      setMoveHighlight({ ...move, showAnswer: false }, game.history.length)

      // Show toast with technique name and "Learn more" action
      setValidationMessage({
        type: 'info',
        message: `Try: ${techniqueName}`,
        action: {
          label: 'Learn more',
          onClick: () => {
            setTechniqueModal({ title: techniqueName, slug: techniqueSlug })
          },
        },
      })
      scheduleToastClear(TOAST_DURATION_INFO, () => {
        setValidationMessage(null)
      })

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
      scheduleToastClear(TOAST_DURATION_ERROR, () => {
        setValidationMessage(null)
      })
    } finally {
      gate.end()
      setTechniqueHintLoading(false)
    }
  }

  // Shared reset for hint tracking caches, invoked after any user action that
  // changes the board and therefore invalidates the cached next hint.
  const resetHintTracking = () => {
    lastTechniqueHintRef.current = null
    lastRegularHintRef.current = null
    cachedHintRef.current = null
  }

  return {
    handleNext,
    handleTechniqueHint,
    resetHintTracking,
    hintLoading,
    techniqueHintLoading,
  }
}
