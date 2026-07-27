import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { useAutoSolveAdapters, type UseAutoSolveAdaptersOptions } from './useAutoSolveAdapters'
import type { UseSudokuGameReturn, Move } from './useSudokuGame'

function makeGameMock(overrides: Partial<UseSudokuGameReturn> = {}): UseSudokuGameReturn {
  return {
    board: Array(81).fill(0),
    candidates: new Uint16Array(81),
    candidatesVersion: 0,
    history: [],
    historyIndex: -1,
    canUndo: false,
    canRedo: false,
    isComplete: false,
    digitCounts: Array(9).fill(0),
    setCell: vi.fn(),
    setCellMultiple: vi.fn(),
    eraseCell: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    resetGame: vi.fn(),
    clearAll: vi.fn(),
    clearCandidates: vi.fn(),
    toggleCandidate: vi.fn(),
    applyExternalMove: vi.fn(),
    setIsComplete: vi.fn(),
    restoreState: vi.fn(),
    setBoardState: vi.fn(),
    calculateCandidatesForCell: vi.fn(),
    fillAllCandidates: vi.fn(() => new Uint16Array(81)),
    areCandidatesFilled: vi.fn(() => false),
    checkNotes: vi.fn(() => ({ valid: true, wrongNotes: [], missingNotes: [], cellsWithNotes: 0 })),
    isGivenCell: vi.fn(() => false),
    ...overrides,
  } as unknown as UseSudokuGameReturn
}

function makeOptions(
  overrides: Partial<UseAutoSolveAdaptersOptions> = {},
): UseAutoSolveAdaptersOptions {
  return {
    gameRef: { current: makeGameMock() },
    initialBoardRef: { current: Array(81).fill(0) },
    setMoveHighlight: vi.fn(),
    setDigitHighlight: vi.fn(),
    clearDigitHighlight: vi.fn(),
    setNotesMode: vi.fn(),
    setValidationMessage: vi.fn(),
    throttledSetValidationMessage: vi.fn(),
    scheduleToastClear: vi.fn(),
    visibilityAwareTimeout: vi.fn(),
    setUnpinpointableErrorInfo: vi.fn(),
    setShowSolutionConfirm: vi.fn(),
    ...overrides,
  }
}

function makeMove(overrides: Partial<Move> = {}): Move {
  return {
    step_index: 0,
    technique: 'Naked Single',
    action: 'place',
    digit: 5,
    targets: [{ row: 0, col: 0 }],
    explanation: 'Only candidate',
    refs: { title: 'Naked Single', slug: 'naked-single', url: '' },
    highlights: { primary: [] },
    ...overrides,
  } as unknown as Move
}

function renderAdapters(options: ReturnType<typeof makeOptions>) {
  return renderHook(() => useAutoSolveAdapters(options))
}

describe('useAutoSolveAdapters - board readers', () => {
  it('returns the live board from gameRef', () => {
    const board = Array(81).fill(0)
    board[0] = 5
    const options = makeOptions({ gameRef: { current: makeGameMock({ board }) } })
    const { result } = renderAdapters(options)
    expect(result.current.getBoard()).toBe(board)
  })

  it('returns an empty board when gameRef is null', () => {
    const options = makeOptions({ gameRef: { current: null } })
    const { result } = renderAdapters(options)
    expect(result.current.getBoard()).toEqual([])
  })

  it('converts the Uint16Array candidates into Set<number>[]', () => {
    const candidates = new Uint16Array(81)
    // cell 0: candidates 1 and 3 (bit d for digit d, per getCandidatesArray)
    candidates[0] = (1 << 1) | (1 << 3)
    const options = makeOptions({
      gameRef: { current: makeGameMock({ candidates }) },
    })
    const { result } = renderAdapters(options)
    const sets = result.current.getCandidates()
    expect(sets[0]).toEqual(new Set([1, 3]))
  })

  it('returns an empty array when gameRef is null', () => {
    const options = makeOptions({ gameRef: { current: null } })
    const { result } = renderAdapters(options)
    expect(result.current.getCandidates()).toEqual([])
  })

  it('returns the live givens from initialBoardRef', () => {
    const givens = Array(81).fill(0)
    givens[5] = 7
    const options = makeOptions({ initialBoardRef: { current: givens } })
    const { result } = renderAdapters(options)
    expect(result.current.getGivens()).toBe(givens)
  })
})

describe('useAutoSolveAdapters - handleApplyMove', () => {
  it('applies an external move and highlights the digit + sets notes mode for placements', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const board = Array(81).fill(0)
    // Pass at least one non-empty candidate Set so the inner map runs.
    const candidatesSets = Array.from({ length: 81 }, () => new Set<number>())
    candidatesSets[0] = new Set([1, 2])
    const move = makeMove({ action: 'place', digit: 5 })

    act(() => {
      result.current.handleApplyMove(board, candidatesSets, move, 3)
    })

    expect(game.applyExternalMove).toHaveBeenCalledTimes(1)
    expect(options.setMoveHighlight).toHaveBeenCalledWith(move, 3)
    expect(options.setDigitHighlight).toHaveBeenCalledWith(5)
    expect(options.setNotesMode).toHaveBeenCalledWith(false)
  })

  it('flips notes mode on for candidate actions', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const move = makeMove({ action: 'candidate', digit: 4 })

    act(() => {
      result.current.handleApplyMove(Array(81).fill(0), [], move, 0)
    })

    expect(options.setNotesMode).toHaveBeenCalledWith(true)
    expect(options.setDigitHighlight).toHaveBeenCalledWith(4)
  })

  it('flips notes mode on for eliminate actions', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const move = makeMove({ action: 'eliminate', digit: 4 })

    act(() => {
      result.current.handleApplyMove(Array(81).fill(0), [], move, 0)
    })

    expect(options.setNotesMode).toHaveBeenCalledWith(true)
  })

  it('flips notes mode off for assign actions', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const move = makeMove({ action: 'assign', digit: 6 })

    act(() => {
      result.current.handleApplyMove(Array(81).fill(0), [], move, 0)
    })

    expect(options.setNotesMode).toHaveBeenCalledWith(false)
  })

  it('leaves notes mode untouched for non-placement / non-candidate actions', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const move = makeMove({ action: 'fix-error', digit: 0 })

    act(() => {
      result.current.handleApplyMove(Array(81).fill(0), [], move, 0)
    })

    expect(options.setNotesMode).not.toHaveBeenCalled()
  })

  it('skips digit highlight when the move has no digit', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const move = makeMove({ action: 'place', digit: 0 })

    act(() => {
      result.current.handleApplyMove(Array(81).fill(0), [], move, 0)
    })

    expect(options.setDigitHighlight).not.toHaveBeenCalled()
  })

  it('no-ops when gameRef.current is null', () => {
    const options = makeOptions({ gameRef: { current: null } })
    const { result } = renderAdapters(options)
    expect(() =>
      act(() => {
        result.current.handleApplyMove(Array(81).fill(0), [], makeMove(), 0)
      }),
    ).not.toThrow()
    expect(options.setMoveHighlight).not.toHaveBeenCalled()
  })
})

describe('useAutoSolveAdapters - handleApplyState', () => {
  it('applies the full board state, highlights the digit, and sets notes mode for candidate moves', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const move = makeMove({ action: 'candidate', digit: 3 })
    // Pass a non-empty candidate Set so handleApplyState's inner map runs.
    const candidateSets = Array.from({ length: 81 }, () => new Set<number>())
    candidateSets[0] = new Set([3, 5])

    act(() => {
      result.current.handleApplyState(Array(81).fill(0), candidateSets, move, 1)
    })

    expect(game.setBoardState).toHaveBeenCalledTimes(1)
    expect(options.setMoveHighlight).toHaveBeenCalledWith(move, 1)
    expect(options.setDigitHighlight).toHaveBeenCalledWith(3)
    expect(options.setNotesMode).toHaveBeenCalledWith(true)
  })

  it('clears the digit highlight when the move carries no digit', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const move = makeMove({ digit: 0 })

    act(() => {
      result.current.handleApplyState(Array(81).fill(0), [], move, 0)
    })

    expect(options.clearDigitHighlight).toHaveBeenCalled()
  })

  it('clears the digit highlight when the move is null', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)

    act(() => {
      result.current.handleApplyState(Array(81).fill(0), [], null, 0)
    })

    expect(options.clearDigitHighlight).toHaveBeenCalled()
    expect(options.setNotesMode).not.toHaveBeenCalled()
  })

  it('handles eliminate, assign, candidate, and place actions through handleApplyState', () => {
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)

    for (const action of ['eliminate', 'candidate', 'assign', 'place'] as const) {
      const move = makeMove({ action, digit: action === 'eliminate' ? 0 : 4 })
      act(() => {
        result.current.handleApplyState(Array(81).fill(0), [], move, 0)
      })
    }

    // candidate / eliminate -> notes on (twice), assign / place -> notes off (twice)
    expect(options.setNotesMode).toHaveBeenNthCalledWith(1, true)
    expect(options.setNotesMode).toHaveBeenNthCalledWith(2, true)
    expect(options.setNotesMode).toHaveBeenNthCalledWith(3, false)
    expect(options.setNotesMode).toHaveBeenNthCalledWith(4, false)
  })

  it('leaves notes mode untouched through handleApplyState for uncategorized actions', () => {
    // Covers the implicit else of the action-classification chain (action is
    // neither eliminate/candidate nor assign/place).
    const game = makeGameMock()
    const options = makeOptions({ gameRef: { current: game } })
    const { result } = renderAdapters(options)
    const move = makeMove({ action: 'fix-error', digit: 4 })

    act(() => {
      result.current.handleApplyState(Array(81).fill(0), [], move, 0)
    })

    expect(options.setNotesMode).not.toHaveBeenCalled()
  })

  it('no-ops when gameRef.current is null', () => {
    const options = makeOptions({ gameRef: { current: null } })
    const { result } = renderAdapters(options)
    expect(() =>
      act(() => {
        result.current.handleApplyState(Array(81).fill(0), [], makeMove(), 0)
      }),
    ).not.toThrow()
    expect(options.setMoveHighlight).not.toHaveBeenCalled()
  })
})

describe('useAutoSolveAdapters - completion + error paths', () => {
  it('reads the live isComplete flag', () => {
    const options = makeOptions({ gameRef: { current: makeGameMock({ isComplete: true }) } })
    const { result } = renderAdapters(options)
    expect(result.current.handleIsComplete()).toBe(true)
  })

  it('defaults to false when gameRef is null', () => {
    const options = makeOptions({ gameRef: { current: null } })
    const { result } = renderAdapters(options)
    expect(result.current.handleIsComplete()).toBe(false)
  })

  it('surfaces an auto-solve error toast and schedules its clear', () => {
    const options = makeOptions()
    const { result } = renderAdapters(options)
    act(() => {
      result.current.handleAutoSolveError('boom')
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({ type: 'error', message: 'boom' })
    expect(options.scheduleToastClear).toHaveBeenCalled()
    // Invoke the scheduled clearer so the inline arrow runs.
    const clearer = (options.scheduleToastClear as unknown as Mock).mock.calls[0]![1] as () => void
    act(() => clearer())
    expect(options.setValidationMessage).toHaveBeenLastCalledWith(null)
  })

  it('opens the unpinpointable-error modal with the count', () => {
    const options = makeOptions()
    const { result } = renderAdapters(options)
    act(() => {
      result.current.handleUnpinpointableError('stuck', 3)
    })
    expect(options.setUnpinpointableErrorInfo).toHaveBeenCalledWith({ message: 'stuck', count: 3 })
    expect(options.setShowSolutionConfirm).toHaveBeenCalledWith(true)
  })

  it('throttles the auto-solve status toast', () => {
    const options = makeOptions()
    const { result } = renderAdapters(options)
    act(() => {
      result.current.handleAutoSolveStatus('moving')
    })
    expect(options.throttledSetValidationMessage).toHaveBeenCalledWith({
      type: 'success',
      message: 'moving',
    })
    expect(options.scheduleToastClear).toHaveBeenCalled()
    // Drive the scheduled clearer so the inline arrow runs.
    const clearer = (options.scheduleToastClear as unknown as Mock).mock.calls[0]![1] as () => void
    act(() => clearer())
    expect(options.setValidationMessage).toHaveBeenLastCalledWith(null)
  })

  it('shows the fixed-error toast and resumes via the visibility-aware timeout', () => {
    const options = makeOptions()
    const { result } = renderAdapters(options)
    const resume = vi.fn()
    act(() => {
      result.current.handleErrorFixed('cell 4', resume)
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'Fixed: cell 4',
    })
    expect(options.scheduleToastClear).toHaveBeenCalled()
    expect(options.visibilityAwareTimeout).toHaveBeenCalledWith(resume, expect.any(Number))
    // Drive the scheduled clearer so the inline arrow runs.
    const clearer = (options.scheduleToastClear as unknown as Mock).mock.calls[0]![1] as () => void
    act(() => clearer())
    expect(options.setValidationMessage).toHaveBeenLastCalledWith(null)
  })
})

describe('useAutoSolveAdapters - handleStepNavigate', () => {
  it('shows the move explanation when stepping forward to a real move', () => {
    const options = makeOptions()
    const { result } = renderAdapters(options)
    const move = makeMove({ explanation: 'Naked single in r1c1' })
    act(() => {
      result.current.handleStepNavigate(move)
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'success',
      message: 'Naked single in r1c1',
    })
  })

  it('shows the initial-state toast when stepping back past the first move', () => {
    const options = makeOptions()
    const { result } = renderAdapters(options)
    act(() => {
      result.current.handleStepNavigate(null)
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'success',
      message: 'Initial state',
    })
  })
})

// RC-dependent: see useGameActions.test.ts for the same skipIf rationale.
describe.skipIf(process.env.VITE_SKIP_RC)('useAutoSolveAdapters - handler stability', () => {
  // Shared options object: handler identities must stay stable across re-renders
  // when the inputs do not change, because useAutoSolve memoizes on them.
  let options: ReturnType<typeof makeOptions>
  beforeEach(() => {
    options = makeOptions()
  })

  it('returns the same handler identities across re-renders', () => {
    void options
    const fixedOptions = makeOptions()
    const { result, rerender } = renderAdapters(fixedOptions)
    const first = result.current
    rerender()
    expect(result.current.getBoard).toBe(first.getBoard)
    expect(result.current.getCandidates).toBe(first.getCandidates)
    expect(result.current.handleApplyMove).toBe(first.handleApplyMove)
    expect(result.current.handleApplyState).toBe(first.handleApplyState)
    expect(result.current.handleStepNavigate).toBe(first.handleStepNavigate)
  })
})
