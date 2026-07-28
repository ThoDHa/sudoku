import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRef } from 'react'
import { useHints } from './useHints'
import type { Move, UseSudokuGameReturn } from './useSudokuGame'
import type { MoveHighlight } from './useHighlightState'

vi.mock('../lib/solver-service', () => ({
  findNextMove: vi.fn(),
}))

vi.mock('../lib/commitCellAction', () => ({
  commitCellAction: vi.fn(),
}))

vi.mock('../lib/candidatesUtils', () => ({
  candidatesToArrays: vi.fn(() => [[], []]),
}))

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { findNextMove } from '../lib/solver-service'
import { commitCellAction } from '../lib/commitCellAction'
import { candidatesToArrays } from '../lib/candidatesUtils'
import { logger } from '../lib/logger'

const mockedFindNextMove = vi.mocked(findNextMove)
const mockedCommitCellAction = vi.mocked(commitCellAction)
const mockedCandidatesToArrays = vi.mocked(candidatesToArrays)
const mockedLoggerError = vi.mocked(logger.error)

interface MutableGame {
  board: number[]
  candidates: Uint16Array
  history: Move[]
  canUndo: boolean
}

function makeMove(overrides: Partial<Move> = {}): Move {
  return {
    step_index: 0,
    technique: 'naked-single',
    action: 'assign',
    digit: 5,
    targets: [{ row: 0, col: 1 }],
    explanation: 'Place 5 in r1c2',
    refs: { title: 'Naked Single', slug: 'naked-single', url: '' },
    highlights: { primary: [{ row: 0, col: 1 }] },
    ...overrides,
  }
}

interface FindResult {
  move: Move | null
  solved: boolean
  board: number[]
  candidates: number[][]
}

function makeFindResult(move: Move | null, solved = false): FindResult {
  return { move, solved, board: [1, 2, 3], candidates: [[], []] }
}

function makeGame(overrides: Partial<MutableGame> = {}): MutableGame {
  return {
    board: [1, 2, 3],
    candidates: new Uint16Array([0, 1, 2]),
    history: [],
    canUndo: false,
    ...overrides,
  }
}

function createHintsCallbacks() {
  return {
    clearAllAndDeselect: vi.fn(),
    setMoveHighlight: vi.fn(),
    clearMoveHighlight: vi.fn(),
    // Invoke the clearer so the null-arrow functions are exercised for coverage.
    scheduleToastClear: vi.fn((_delay: number, cb: () => void) => cb()),
    setValidationMessage: vi.fn(),
    setHintsUsed: vi.fn(),
    setTechniqueHintsUsed: vi.fn(),
    setUnpinpointableErrorInfo: vi.fn(),
    setShowSolutionConfirm: vi.fn(),
    setTechniqueModal: vi.fn(),
  }
}

type HintsCallbacks = ReturnType<typeof createHintsCallbacks>

function renderHintsHook(game: MutableGame, callbacks: HintsCallbacks) {
  // The hook reads the live game both directly (board/candidates/history) and
  // through gameRef (the contradiction branch's canUndo check), so rerenders
  // pass the mutated game straight through.
  const result = renderHook(
    (props: { game: MutableGame; callbacks: HintsCallbacks }) => {
      const gameRef = useRef<UseSudokuGameReturn | null>(
        props.game as unknown as UseSudokuGameReturn,
      )
      gameRef.current = props.game as unknown as UseSudokuGameReturn
      return useHints({
        game: props.game as unknown as UseSudokuGameReturn,
        gameRef,
        initialBoard: [1, 2, 3],
        clearAllAndDeselect: props.callbacks.clearAllAndDeselect,
        setMoveHighlight: props.callbacks.setMoveHighlight,
        clearMoveHighlight: props.callbacks.clearMoveHighlight,
        scheduleToastClear: props.callbacks.scheduleToastClear,
        setValidationMessage: props.callbacks.setValidationMessage,
        setHintsUsed: props.callbacks.setHintsUsed,
        setTechniqueHintsUsed: props.callbacks.setTechniqueHintsUsed,
        setUnpinpointableErrorInfo: props.callbacks.setUnpinpointableErrorInfo,
        setShowSolutionConfirm: props.callbacks.setShowSolutionConfirm,
        setTechniqueModal: props.callbacks.setTechniqueModal,
      })
    },
    {
      initialProps: { game, callbacks },
    },
  )
  return result
}

describe('useHints', () => {
  beforeEach(() => {
    mockedFindNextMove.mockReset()
    mockedCommitCellAction.mockReset()
    mockedCandidatesToArrays.mockReset()
    mockedCandidatesToArrays.mockReturnValue([[], []])
    mockedLoggerError.mockReset()
  })

  describe('fetchCachedHint caching', () => {
    it('initializes hintLoading and techniqueHintLoading as false before any action', () => {
      const { result } = renderHintsHook(makeGame(), createHintsCallbacks())
      expect(result.current.hintLoading).toBe(false)
      expect(result.current.techniqueHintLoading).toBe(false)
    })

    it('reuses the cached hint when the board signature is unchanged (single solver call)', async () => {
      const move = makeMove()
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const game = makeGame()
      const { result } = renderHintsHook(game, createHintsCallbacks())

      await act(async () => {
        await result.current.handleNext()
      })
      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      // Same board+candidates → findNextMove fetched exactly once.
      expect(mockedFindNextMove).toHaveBeenCalledTimes(1)
      // The cached branch must actually populate data; if it no-ops, the second handler
      // throws and logger.error fires.
      expect(mockedLoggerError).not.toHaveBeenCalled()
    })

    it('passes the live board snapshot (not an empty array) to findNextMove', async () => {
      const move = makeMove()
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const game = makeGame({ board: [1, 2, 3] })
      const { result } = renderHintsHook(game, createHintsCallbacks())

      await act(async () => {
        await result.current.handleNext()
      })

      expect(mockedFindNextMove).toHaveBeenCalledWith([1, 2, 3], expect.anything(), [1, 2, 3])
    })

    it('refetches when the board changes between hint requests', async () => {
      const move = makeMove()
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const game = makeGame({ board: [1, 2, 3] })
      const { result, rerender } = renderHintsHook(game, createHintsCallbacks())

      await act(async () => {
        await result.current.handleNext()
      })
      expect(mockedFindNextMove).toHaveBeenCalledTimes(1)

      // Mutate the board and rerender so fetchCachedHint sees a new signature.
      game.board = [9, 9, 9]
      rerender({ game, callbacks: createHintsCallbacks() })

      await act(async () => {
        await result.current.handleNext()
      })
      expect(mockedFindNextMove).toHaveBeenCalledTimes(2)
    })

    it('refetches when candidates change even if the board stays the same', async () => {
      const move = makeMove()
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const game = makeGame()
      const { result, rerender } = renderHintsHook(game, createHintsCallbacks())

      await act(async () => {
        await result.current.handleNext()
      })
      game.candidates = new Uint16Array([7, 7, 7])
      rerender({ game, callbacks: createHintsCallbacks() })
      await act(async () => {
        await result.current.handleNext()
      })
      expect(mockedFindNextMove).toHaveBeenCalledTimes(2)
    })
  })

  describe('handleNext branches', () => {
    it('highlights the move, shows a success toast, and increments the counter for a new hint', async () => {
      const move = makeMove({ explanation: 'Naked single here' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame({ history: [{ ...move }] }), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(callbacks.clearAllAndDeselect).toHaveBeenCalled()
      expect(callbacks.setMoveHighlight).toHaveBeenCalledWith(move as unknown as MoveHighlight, 1)
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'success',
        message: 'Naked single here',
      })
      expect(callbacks.setHintsUsed).toHaveBeenCalledWith(expect.any(Function))
      // The updater increments.
      const hintCall = callbacks.setHintsUsed.mock.calls[0]
      if (!hintCall) throw new Error('expected hint counter increment')
      const updater = hintCall[0] as (n: number) => number
      expect(updater(3)).toBe(4)
      // Success-path clearer must null the validation message (scheduleToastClear mock invokes cb synchronously).
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
      expect(result.current.hintLoading).toBe(false)
    })

    it('does not increment the counter when the same hint signature is shown again', async () => {
      const move = makeMove()
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })
      await act(async () => {
        await result.current.handleNext()
      })
      // Dedup: the counter increment fires only once for an identical signature.
      expect(callbacks.setHintsUsed).toHaveBeenCalledTimes(1)
    })

    it('opens the solution-confirm modal for an unpinpointable-error move', async () => {
      const move = makeMove({
        action: 'unpinpointable-error',
        explanation: 'cannot pinpoint',
      })
      ;(move as unknown as { userEntryCount: number }).userEntryCount = 4
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(callbacks.setUnpinpointableErrorInfo).toHaveBeenCalledWith({
        message: 'cannot pinpoint',
        count: 4,
      })
      expect(callbacks.setShowSolutionConfirm).toHaveBeenCalledWith(true)
      expect(callbacks.setMoveHighlight).not.toHaveBeenCalled()
    })

    it('undoes and toasts when a contradiction move is returned and the game can undo', async () => {
      const move = makeMove({ action: 'contradiction', explanation: 'bad cell' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const game = makeGame({ canUndo: true })
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(game, callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(mockedCommitCellAction).toHaveBeenCalledWith('undo', {
        game: game as unknown as UseSudokuGameReturn,
        clearMoveHighlight: callbacks.clearMoveHighlight,
      })
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'bad cell',
      })
      // The canUndo clearer must null the validation message (scheduleToastClear mock invokes cb synchronously).
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
    })

    it('toasts a cannot-solve message when a contradiction is returned but the game cannot undo', async () => {
      const move = makeMove({ action: 'contradiction' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame({ canUndo: false }), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(mockedCommitCellAction).not.toHaveBeenCalled()
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'The puzzle cannot be solved - initial state has errors.',
      })
      // The cannot-undo clearer must null the validation message.
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
    })

    it('surfaces the already-complete toast when the solver reports solved with no move', async () => {
      mockedFindNextMove.mockResolvedValue(makeFindResult(null, true))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Puzzle is already complete!',
      })
      expect(callbacks.setMoveHighlight).not.toHaveBeenCalled()
      // Exactly two calls: the fetchCachedHint toast, then the synchronous clearer nulling it.
      // L106 mutant (clearer body emptied) → 1 call; L130 mutant (return guard removed, throws downstream) → 4 calls.
      expect(callbacks.setValidationMessage).toHaveBeenCalledTimes(2)
      expect(mockedLoggerError).not.toHaveBeenCalled()
    })

    it('surfaces the advanced-techniques toast when there is no move and the puzzle is not solved', async () => {
      mockedFindNextMove.mockResolvedValue(makeFindResult(null, false))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'This puzzle requires advanced techniques beyond our hint system.',
      })
      // The no-move return guard must hold: exactly two calls (toast + clearer), no throw, no error logged.
      expect(callbacks.setValidationMessage).toHaveBeenCalledTimes(2)
      expect(mockedLoggerError).not.toHaveBeenCalled()
    })

    it('logs and toasts when findNextMove rejects', async () => {
      mockedFindNextMove.mockRejectedValue(new Error('solver down'))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(mockedLoggerError).toHaveBeenCalledWith('Hint error:', expect.any(Error))
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'solver down',
      })
      // The catch-path clearer must null the validation message.
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
      expect(result.current.hintLoading).toBe(false)
    })
  })

  describe('handleTechniqueHint branches', () => {
    it('shows the fill-candidate info message and no highlight', async () => {
      const move = makeMove({ technique: 'fill-candidate' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'info',
        message: 'Fill in some candidates first, or use 💡 Hint to get started',
      })
      expect(callbacks.setMoveHighlight).not.toHaveBeenCalled()
      // The fill-candidate clearer must null the validation message.
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
    })

    it('shows an error toast (no highlight) for an unpinpointable-error move', async () => {
      const move = makeMove({ action: 'unpinpointable-error' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'There seems to be an error in the puzzle. Try using 💡 Hint to fix it.',
      })
      expect(callbacks.setMoveHighlight).not.toHaveBeenCalled()
      // The unpinpointable clearer must null the validation message.
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
    })

    it('highlights a contradiction WITHOUT the answer and toasts the violation', async () => {
      const move = makeMove({ action: 'contradiction', explanation: 'row clash' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      expect(callbacks.setMoveHighlight).toHaveBeenCalledWith(
        expect.objectContaining({ showAnswer: false }),
        expect.any(Number),
      )
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'row clash',
      })
      // The contradiction clearer must null the validation message.
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
    })

    it('highlights without the answer and offers a Learn-more action for a normal technique', async () => {
      const move = makeMove({ technique: 'naked-single', explanation: 'only candidate' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      expect(callbacks.setMoveHighlight).toHaveBeenCalledWith(
        expect.objectContaining({ showAnswer: false }),
        expect.any(Number),
      )
      const msgCall = callbacks.setValidationMessage.mock.calls.find(
        (c) => (c[0] as { type: string }).type === 'info',
      )
      expect(msgCall).toBeDefined()
      const msg = msgCall![0] as {
        message: string
        action?: { label: string; onClick: () => void }
      }
      expect(msg.message).toBe('Try: Naked Single')
      expect(msg.action?.label).toBe('Learn more')
      msg.action!.onClick()
      expect(callbacks.setTechniqueModal).toHaveBeenCalledWith({
        title: 'Naked Single',
        slug: 'naked-single',
      })
      expect(callbacks.setTechniqueHintsUsed).toHaveBeenCalledWith(expect.any(Function))
      const techniqueCall = callbacks.setTechniqueHintsUsed.mock.calls[0]
      if (!techniqueCall) throw new Error('expected technique counter increment')
      const updater = techniqueCall[0] as (n: number) => number
      expect(updater(2)).toBe(3)
      // The technique success clearer must null the validation message.
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
    })

    it('derives the slug by collapsing repeated whitespace to single dashes and underscores to dashes', async () => {
      // technique 'a  b_c' (two spaces + underscore): correct slug is 'a-b-c'.
      // - /\s+/g -> /\s/g mutant would yield 'a--b-c'
      // - first '-' replacement emptied would yield 'ab-c'
      // - second '-' replacement emptied would yield 'a-bc'
      const move = makeMove({ technique: 'a  b_c' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      const infoCall = callbacks.setValidationMessage.mock.calls.find(
        (c) => (c[0] as { type: string }).type === 'info',
      )
      expect(infoCall).toBeDefined()
      const msg = infoCall![0] as { action?: { onClick: () => void } }
      msg.action!.onClick()
      expect(callbacks.setTechniqueModal).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'a-b-c' }),
      )
    })

    it('does not double-count an identical technique hint signature', async () => {
      const move = makeMove({ technique: 'hidden-single' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })
      await act(async () => {
        await result.current.handleTechniqueHint()
      })
      expect(callbacks.setTechniqueHintsUsed).toHaveBeenCalledTimes(1)
    })

    it('logs and toasts when findNextMove rejects', async () => {
      mockedFindNextMove.mockRejectedValue(new Error('boom'))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      expect(mockedLoggerError).toHaveBeenCalledWith('Technique hint error:', expect.any(Error))
      expect(result.current.techniqueHintLoading).toBe(false)
      // The technique catch clearer must null the validation message.
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith(null)
    })

    it('sets techniqueHintLoading true while a technique hint request is in flight', async () => {
      let resolveSolver: (value: FindResult) => void = () => {}
      mockedFindNextMove.mockImplementation(
        () =>
          new Promise<FindResult>((resolve) => {
            resolveSolver = resolve
          }),
      )
      const move = makeMove()
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      let pending: Promise<void> | undefined
      act(() => {
        pending = result.current.handleTechniqueHint()
      })

      // While the solver is pending, the loading flag must be true (setTechniqueHintLoading(true)).
      expect(result.current.techniqueHintLoading).toBe(true)

      await act(async () => {
        resolveSolver(makeFindResult(move))
        await pending
      })
      await waitFor(() => {
        expect(result.current.techniqueHintLoading).toBe(false)
      })
    })
  })

  describe('resetHintTracking', () => {
    it('clears the cache so the next hint refetches', async () => {
      const move = makeMove()
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })
      expect(mockedFindNextMove).toHaveBeenCalledTimes(1)

      act(() => {
        result.current.resetHintTracking()
      })

      await act(async () => {
        await result.current.handleNext()
      })
      expect(mockedFindNextMove).toHaveBeenCalledTimes(2)
    })
  })

  describe('concurrency gate', () => {
    it('rejects a second concurrent hint while the first is in flight', async () => {
      let resolveSolver: (value: FindResult) => void = () => {}
      mockedFindNextMove.mockImplementation(
        () =>
          new Promise<FindResult>((resolve) => {
            resolveSolver = resolve
          }),
      )
      const move = makeMove()
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      let first: Promise<void> | undefined
      let second: Promise<void> | undefined
      act(() => {
        first = result.current.handleNext()
        // Fire the second request while the first is still awaiting the solver.
        second = result.current.handleNext()
      })

      // Exactly one solver call is in flight; the gate swallowed the second.
      expect(mockedFindNextMove).toHaveBeenCalledTimes(1)
      expect(result.current.hintLoading).toBe(true)

      await act(async () => {
        resolveSolver(makeFindResult(move))
        await first
        await second
      })

      // Still only one fetch after both settle.
      expect(mockedFindNextMove).toHaveBeenCalledTimes(1)
      await waitFor(() => {
        expect(result.current.hintLoading).toBe(false)
      })
    })
  })

  describe('handleNext fallback messages', () => {
    it('uses the fallbacks when an unpinpointable-error move lacks explanation and userEntryCount', async () => {
      const move = makeMove({ action: 'unpinpointable-error' })
      delete (move as { explanation?: string }).explanation
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(callbacks.setUnpinpointableErrorInfo).toHaveBeenCalledWith({
        message: `Couldn't pinpoint the error.`,
        count: 0,
      })
    })

    it('uses the "Contradiction found" fallback when a contradiction move lacks explanation', async () => {
      const move = makeMove({ action: 'contradiction' })
      delete (move as { explanation?: string }).explanation
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const game = makeGame({ canUndo: true })
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(game, callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(mockedCommitCellAction).toHaveBeenCalledWith('undo', expect.anything())
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Contradiction found - undoing last move',
      })
    })

    it('falls back to the technique name when explanation is absent', async () => {
      const move = makeMove({ technique: 'hidden-single' })
      delete (move as { explanation?: string }).explanation
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'success',
        message: 'hidden-single',
      })
    })

    it('falls back to the literal "Hint" when neither explanation nor technique is present', async () => {
      const move = makeMove()
      delete (move as { explanation?: string }).explanation
      delete (move as { technique?: string }).technique
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'success',
        message: 'Hint',
      })
    })

    it('treats an action of "error" the same as "contradiction"', async () => {
      const move = makeMove({ action: 'error', explanation: 'bad cell' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const game = makeGame({ canUndo: true })
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(game, callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(mockedCommitCellAction).toHaveBeenCalledWith('undo', expect.anything())
    })

    it('toasts "Failed to get hint" when the solver rejects a non-Error value', async () => {
      mockedFindNextMove.mockRejectedValue('network down')
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleNext()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to get hint',
      })
      expect(result.current.hintLoading).toBe(false)
    })
  })

  describe('handleTechniqueHint fallback messages and concurrency', () => {
    it('uses the "Constraint violation detected" fallback when a contradiction lacks explanation', async () => {
      const move = makeMove({ action: 'contradiction' })
      delete (move as { explanation?: string }).explanation
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Constraint violation detected',
      })
    })

    it('formats "Unknown Technique" and the "unknown" slug when the move lacks technique', async () => {
      const move = makeMove()
      delete (move as { technique?: string }).technique
      delete (move as { explanation?: string }).explanation
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      const infoCall = callbacks.setValidationMessage.mock.calls.find(
        (c) => (c[0] as { type: string }).type === 'info',
      )
      expect(infoCall).toBeDefined()
      const msg = infoCall![0] as {
        message: string
        action?: { label: string; onClick: () => void }
      }
      expect(msg.message).toBe('Try: Unknown Technique')
      expect(msg.action?.label).toBe('Learn more')
      msg.action!.onClick()
      expect(callbacks.setTechniqueModal).toHaveBeenCalledWith({
        title: 'Unknown Technique',
        slug: 'unknown',
      })
    })

    it('treats an action of "error" the same as "contradiction" in the technique handler', async () => {
      const move = makeMove({ action: 'error', explanation: 'row clash' })
      mockedFindNextMove.mockResolvedValue(makeFindResult(move))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      expect(callbacks.setMoveHighlight).toHaveBeenCalledWith(
        expect.objectContaining({ showAnswer: false }),
        expect.any(Number),
      )
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'row clash',
      })
    })

    it('returns early when the solver reports no next move', async () => {
      mockedFindNextMove.mockResolvedValue(makeFindResult(null, true))
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      // fetchCachedHint surfaces the "already complete" toast and returns null,
      // so handleTechniqueHint returns before highlighting anything.
      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Puzzle is already complete!',
      })
      expect(callbacks.setMoveHighlight).not.toHaveBeenCalled()
      // Exactly two calls: the fetchCachedHint toast, then the synchronous clearer nulling it.
      // L106 mutant (clearer body emptied) → 1 call; L225 mutant (return guard removed) → 4 calls.
      expect(callbacks.setValidationMessage).toHaveBeenCalledTimes(2)
      expect(mockedLoggerError).not.toHaveBeenCalled()
    })

    it('toasts "Failed to get technique" when the solver rejects a non-Error value', async () => {
      mockedFindNextMove.mockRejectedValue({ failure: true })
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      await act(async () => {
        await result.current.handleTechniqueHint()
      })

      expect(callbacks.setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to get technique',
      })
      expect(result.current.techniqueHintLoading).toBe(false)
    })

    it('rejects a concurrent technique hint while another hint request is in flight', async () => {
      let resolveSolver: (value: FindResult) => void = () => {}
      mockedFindNextMove.mockImplementation(
        () =>
          new Promise<FindResult>((resolve) => {
            resolveSolver = resolve
          }),
      )
      const move = makeMove()
      const callbacks = createHintsCallbacks()
      const { result } = renderHintsHook(makeGame(), callbacks)

      let first: Promise<void> | undefined
      let second: Promise<void> | undefined
      act(() => {
        first = result.current.handleNext()
        // Technique hint fired while the regular hint still awaits the solver.
        second = result.current.handleTechniqueHint()
      })

      // Only the first request reached the solver; the gate swallowed the second.
      expect(mockedFindNextMove).toHaveBeenCalledTimes(1)

      await act(async () => {
        resolveSolver(makeFindResult(move))
        await first
        await second
      })

      expect(mockedFindNextMove).toHaveBeenCalledTimes(1)
      await waitFor(() => {
        expect(result.current.techniqueHintLoading).toBe(false)
      })
    })
  })
})
