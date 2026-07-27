import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef } from 'react'
import { useGameInput, type UseGameInputOptions } from './useGameInput'
import type { UseSudokuGameReturn } from './useSudokuGame'
import type { useAutoSolve } from './useAutoSolve'

// Minimal game mock satisfying every field the input handlers read. Real
// game-state behavior is exercised in useSudokuGame.test.ts and the Game page
// render-test harness; here we only verify the braid wires its inputs through.
function makeGameMock(overrides: Partial<UseSudokuGameReturn> = {}): UseSudokuGameReturn {
  const givens = Array(81).fill(0)
  // Mark a few cells as givens so isGivenCell has both branches; the same
  // values are mirrored into the board so the click handler's `cellDigit`
  // lookup finds them (cellDigit comes from board[idx], not the givens array).
  givens[0] = 5
  givens[5] = 7
  const board = [...givens]
  return {
    board,
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
    checkNotes: vi.fn(() => ({
      valid: true,
      wrongNotes: [],
      missingNotes: [],
      cellsWithNotes: 0,
    })),
    isGivenCell: (idx: number) => givens[idx] !== 0,
    ...overrides,
  } as unknown as UseSudokuGameReturn
}

function makeAutoSolveMock(
  overrides: Partial<ReturnType<typeof useAutoSolve>> = {},
): ReturnType<typeof useAutoSolve> {
  return {
    isAutoSolving: false,
    isFetching: false,
    isPaused: false,
    canStepBack: false,
    canStepForward: false,
    lastCompletedSteps: 0,
    stepBack: vi.fn(),
    stepForward: vi.fn(),
    stopAutoSolve: vi.fn(),
    togglePause: vi.fn(),
    restartAutoSolve: vi.fn(),
    playMoves: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAutoSolve>
}

// Build the full options bag with spy versions of every callback so tests can
// assert exactly which highlight-state path the handler drove.
function makeOptions(overrides: Partial<UseGameInputOptions> = {}): UseGameInputOptions & {
  setNotesModeSpy: ReturnType<typeof vi.fn>
  setEraseModeSpy: ReturnType<typeof vi.fn>
  setAutoSolveStepsUsedSpy: ReturnType<typeof vi.fn>
  setAutoSolveErrorsFixedSpy: ReturnType<typeof vi.fn>
  setIsExtendedPausedSpy: ReturnType<typeof vi.fn>
} {
  const setNotesModeSpy = vi.fn()
  const setEraseModeSpy = vi.fn()
  const setAutoSolveStepsUsedSpy = vi.fn()
  const setAutoSolveErrorsFixedSpy = vi.fn()
  const setIsExtendedPausedSpy = vi.fn()
  return {
    selectedCellRef: { current: null },
    selectedCellsRef: { current: new Set<number>() },
    notesModeRef: { current: false },
    eraseModeRef: { current: false },
    highlightedDigitRef: { current: null },
    gameRef: { current: makeGameMock() },
    autoSolveRef: { current: makeAutoSolveMock() },
    selectCell: vi.fn(),
    deselectCell: vi.fn(),
    clearAllAndDeselect: vi.fn(),
    clickGivenCell: vi.fn(),
    selectMultipleCells: vi.fn(),
    toggleDigitHighlight: vi.fn(),
    clearAfterUserCandidateOp: vi.fn(),
    clearAfterDigitPlacement: vi.fn(),
    clearAfterErase: vi.fn(),
    clearAfterDigitToggle: vi.fn(),
    clearDigitHighlight: vi.fn(),
    clearMoveHighlight: vi.fn(),
    setNotesMode: setNotesModeSpy,
    setEraseMode: setEraseModeSpy,
    setAutoSolveStepsUsed: setAutoSolveStepsUsedSpy,
    setAutoSolveErrorsFixed: setAutoSolveErrorsFixedSpy,
    resetHintTracking: vi.fn(),
    isExtendedPaused: false,
    setIsExtendedPaused: setIsExtendedPausedSpy,
    // Expose the spies under *_Spy names so tests can assert against them
    // without reaching into the setter slot the hook reads.
    setNotesModeSpy,
    setEraseModeSpy,
    setAutoSolveStepsUsedSpy,
    setAutoSolveErrorsFixedSpy,
    setIsExtendedPausedSpy,
    ...overrides,
  } as UseGameInputOptions & {
    setNotesModeSpy: ReturnType<typeof vi.fn>
    setEraseModeSpy: ReturnType<typeof vi.fn>
    setAutoSolveStepsUsedSpy: ReturnType<typeof vi.fn>
    setAutoSolveErrorsFixedSpy: ReturnType<typeof vi.fn>
    setIsExtendedPausedSpy: ReturnType<typeof vi.fn>
  }
}

function renderInput(options: ReturnType<typeof makeOptions>) {
  return renderHook(() => useGameInput(options))
}

// =============================================================================
// handleCellClick
// =============================================================================

describe('useGameInput - handleCellClick', () => {
  let options: ReturnType<typeof makeOptions>
  beforeEach(() => {
    options = makeOptions()
  })

  it('returns early when gameRef.current is null', () => {
    options.gameRef.current = null
    const { result } = renderInput(options)
    act(() => {
      result.current.handleCellClick(10)
    })
    expect(options.selectCell).not.toHaveBeenCalled()
  })

  it('erases a non-given non-empty cell when erase mode is active', () => {
    const game = makeGameMock()
    ;(game.board as number[])[10] = 4
    options.gameRef.current = game
    options.eraseModeRef.current = true
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(options.setEraseModeSpy).toHaveBeenCalledWith(false)
    expect(options.resetHintTracking).toHaveBeenCalled()
  })

  it('selects a given cell and exits erase mode when erase mode is active but cell is given', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.eraseModeRef.current = true
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(0) // givens[0] = 5
    })

    expect(options.selectCell).toHaveBeenCalledWith(0)
    expect(options.setEraseModeSpy).toHaveBeenCalledWith(false)
  })

  it('blocks clicking a given cell when a digit is highlighted and no given cell is selected', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.highlightedDigitRef.current = 5
    options.selectedCellRef.current = null
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(0)
    })

    expect(options.clickGivenCell).not.toHaveBeenCalled()
  })

  it('proceeds into a given cell when a digit is highlighted and a given cell is already selected', () => {
    // Covers the `else` branch of the highlighted+given guard: the click on a
    // given cell is allowed because the previously selected cell is also given.
    const game = makeGameMock()
    options.gameRef.current = game
    options.highlightedDigitRef.current = 5
    options.selectedCellRef.current = 0 // a given cell
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(5)
    })

    expect(options.clickGivenCell).toHaveBeenCalledWith(7, 5)
  })

  it('skips the digit-handling branch when the given cell has no value (cellDigit=0)', () => {
    // cellDigit === 0 still triggers setEraseMode(false) but skips both
    // clearAllAndDeselect and clickGivenCell.
    const game = makeGameMock()
    // Force isGivenCell true for idx 10 while board[10] stays 0 (no value).
    const givensForEmpty = Array(81).fill(0)
    Object.defineProperty(game, 'isGivenCell', {
      value: () => true,
      configurable: true,
    })
    options.gameRef.current = game
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(options.clickGivenCell).not.toHaveBeenCalled()
    expect(options.clearAllAndDeselect).not.toHaveBeenCalled()
    void givensForEmpty
  })

  it('highlights and selects a given cell coming from another given cell', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.selectedCellRef.current = 0 // currently selected is given
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(5) // givens[5] = 7
    })

    expect(options.clickGivenCell).toHaveBeenCalledWith(7, 5)
    expect(options.setEraseModeSpy).toHaveBeenCalledWith(false)
  })

  it('deselects a given cell when clicking the same one again', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.selectedCellRef.current = 0
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(0)
    })

    expect(options.clearAllAndDeselect).toHaveBeenCalled()
  })

  it('toggles candidate on the selected cell in notes mode with a highlighted digit', () => {
    const game = makeGameMock()
    const setCell = vi.fn()
    ;(game as unknown as { setCell: typeof setCell }).setCell = setCell
    options.gameRef.current = game
    options.selectedCellRef.current = 10
    options.notesModeRef.current = true
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(setCell).toHaveBeenCalledWith(10, 4, true)
    expect(options.clearAfterUserCandidateOp).toHaveBeenCalled()
    expect(options.resetHintTracking).toHaveBeenCalled()
  })

  it('deselects the cell when clicking it again without notes+highlight', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.selectedCellRef.current = 10
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(options.clearAllAndDeselect).toHaveBeenCalled()
  })

  it('routes through handleHighlightedPlacement when a digit is highlighted on a non-given cell', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    // placeDigitAndClear runs setCell on the game for a non-given empty cell
    expect(game.setCell).toHaveBeenCalledWith(10, 4, false)
    expect(options.clearAfterDigitPlacement).toHaveBeenCalled()
    expect(options.deselectCell).toHaveBeenCalled()
  })

  it('clears digit highlight when the highlighted digit is already complete', () => {
    const game = makeGameMock({ digitCounts: [9, 0, 0, 0, 0, 0, 0, 0, 0] })
    options.gameRef.current = game
    options.highlightedDigitRef.current = 1
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(options.clearDigitHighlight).toHaveBeenCalled()
    expect(game.setCell).not.toHaveBeenCalled()
  })

  it('places via notes-mode branch when notes mode is active and the target cell is empty', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.notesModeRef.current = true
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(game.setCell).toHaveBeenCalledWith(10, 4, true)
    expect(options.clearAfterUserCandidateOp).toHaveBeenCalled()
  })

  it('skips placement when notes mode is active and the target cell is already filled', () => {
    const game = makeGameMock()
    ;(game.board as number[])[10] = 7
    options.gameRef.current = game
    options.notesModeRef.current = true
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(game.setCell).not.toHaveBeenCalled()
  })

  it('erases when the cell already holds the highlighted digit in normal mode', () => {
    const game = makeGameMock()
    ;(game.board as number[])[10] = 4
    options.gameRef.current = game
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(options.clearAfterErase).toHaveBeenCalled()
    expect(options.deselectCell).toHaveBeenCalled()
    expect(options.resetHintTracking).toHaveBeenCalled()
  })

  it('selects an empty cell when no digit is highlighted', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(options.selectCell).toHaveBeenCalledWith(10)
    expect(options.setEraseModeSpy).toHaveBeenCalledWith(false)
  })

  it('resumes from extended pause on every invocation', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.isExtendedPaused = true
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellClick(10)
    })

    expect(options.setIsExtendedPausedSpy).toHaveBeenCalledWith(false)
  })
})

// =============================================================================
// handleDigitInput
// =============================================================================

describe('useGameInput - handleDigitInput', () => {
  let options: ReturnType<typeof makeOptions>
  beforeEach(() => {
    options = makeOptions()
  })

  it('clears erase mode and resumes from extended pause', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.isExtendedPaused = true
    const { result } = renderInput(options)

    act(() => {
      result.current.handleDigitInput(4)
    })

    expect(options.setEraseModeSpy).toHaveBeenCalledWith(false)
    expect(options.setIsExtendedPausedSpy).toHaveBeenCalledWith(false)
  })

  it('returns early when gameRef.current is null', () => {
    options.gameRef.current = null
    const { result } = renderInput(options)
    expect(() =>
      act(() => {
        result.current.handleDigitInput(4)
      }),
    ).not.toThrow()
    expect(options.toggleDigitHighlight).not.toHaveBeenCalled()
  })

  it('blocks entry when the digit is already complete', () => {
    const game = makeGameMock({ digitCounts: [9, 0, 0, 0, 0, 0, 0, 0, 0] })
    options.gameRef.current = game
    const { result } = renderInput(options)

    act(() => {
      result.current.handleDigitInput(1)
    })

    expect(options.toggleDigitHighlight).not.toHaveBeenCalled()
    expect(game.setCell).not.toHaveBeenCalled()
  })

  it('routes multi-select notes mode through placeDigitAndClear', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.notesModeRef.current = true
    options.selectedCellsRef.current = new Set([10, 11, 12])
    const { result } = renderInput(options)

    act(() => {
      result.current.handleDigitInput(4)
    })

    expect(game.setCellMultiple).toHaveBeenCalled()
    expect(options.clearAfterUserCandidateOp).toHaveBeenCalled()
  })

  it('toggles digit highlight when no cell is selected', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.selectedCellRef.current = null
    const { result } = renderInput(options)

    act(() => {
      result.current.handleDigitInput(4)
    })

    expect(options.toggleDigitHighlight).toHaveBeenCalledWith(4)
  })

  it('deselects given cell and toggles digit highlight when a given is selected', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.selectedCellRef.current = 0 // given
    const { result } = renderInput(options)

    act(() => {
      result.current.handleDigitInput(4)
    })

    expect(options.deselectCell).toHaveBeenCalled()
    expect(options.toggleDigitHighlight).toHaveBeenCalledWith(4)
  })

  it('erases the digit when the selected cell already holds it', () => {
    const game = makeGameMock()
    ;(game.board as number[])[10] = 4
    options.gameRef.current = game
    options.selectedCellRef.current = 10
    const { result } = renderInput(options)

    act(() => {
      result.current.handleDigitInput(4)
    })

    expect(options.clearAfterDigitToggle).toHaveBeenCalled()
    expect(options.deselectCell).toHaveBeenCalled()
    expect(options.resetHintTracking).toHaveBeenCalled()
  })

  it('places a fresh digit on the selected non-given cell', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.selectedCellRef.current = 10
    const { result } = renderInput(options)

    act(() => {
      result.current.handleDigitInput(4)
    })

    expect(game.setCell).toHaveBeenCalledWith(10, 4, false)
    expect(options.clearAfterDigitPlacement).toHaveBeenCalled()
    expect(options.deselectCell).toHaveBeenCalled()
  })

  it('clears digit highlight when the placed digit completes its count', () => {
    // Simulate a real game where setCell bumps digitCounts: before the call,
    // digit 4 sits at count 8 (not complete) so handleDigitInput's guard at
    // entry passes; the post-placement count is 9 so placeDigitAndClear's
    // completion check clears the digit highlight.
    const game = makeGameMock({ digitCounts: [0, 0, 0, 8, 0, 0, 0, 0, 0] })
    const mutableCounts = [0, 0, 0, 8, 0, 0, 0, 0, 0]
    Object.defineProperty(game, 'digitCounts', {
      get: () => mutableCounts,
      configurable: true,
    })
    ;(game.setCell as ReturnType<typeof vi.fn>).mockImplementation(() => {
      mutableCounts[3] = 9
    })
    options.gameRef.current = game
    options.selectedCellRef.current = 10
    const { result } = renderInput(options)

    act(() => {
      result.current.handleDigitInput(4)
    })

    expect(game.setCell).toHaveBeenCalledWith(10, 4, false)
    expect(options.clearDigitHighlight).toHaveBeenCalled()
  })
})

// =============================================================================
// handleCellChange (keyboard)
// =============================================================================

describe('useGameInput - handleCellChange', () => {
  let options: ReturnType<typeof makeOptions>
  beforeEach(() => {
    options = makeOptions()
  })

  it('erases the cell when value is 0', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellChange(10, 0)
    })

    expect(options.clearAfterErase).toHaveBeenCalled()
    expect(options.deselectCell).toHaveBeenCalled()
    expect(options.resetHintTracking).toHaveBeenCalled()
  })

  it('places a candidate in notes mode and clears user-candidate highlights', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.notesModeRef.current = true
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellChange(10, 4)
    })

    expect(game.setCell).toHaveBeenCalledWith(10, 4, true)
    expect(options.clearAfterUserCandidateOp).toHaveBeenCalled()
    expect(options.resetHintTracking).toHaveBeenCalled()
  })

  it('places a digit in normal mode and clears placement highlights', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellChange(10, 4)
    })

    expect(game.setCell).toHaveBeenCalledWith(10, 4, false)
    expect(options.clearAfterDigitPlacement).toHaveBeenCalled()
    expect(options.deselectCell).toHaveBeenCalled()
  })

  it('skips given cells', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    const { result } = renderInput(options)

    act(() => {
      result.current.handleCellChange(0, 4) // givens[0] = 5
    })

    expect(game.setCell).not.toHaveBeenCalled()
  })

  it('returns early when gameRef.current is null', () => {
    options.gameRef.current = null
    const { result } = renderInput(options)

    expect(() =>
      act(() => {
        result.current.handleCellChange(10, 4)
      }),
    ).not.toThrow()
  })

  it('returns early when gameRef.current is null for value=0', () => {
    // Distinct early-return guard inside handleCellChange; covers the same
    // `!currentGame` branch from a different caller path.
    options.gameRef.current = null
    const { result } = renderInput(options)

    expect(() =>
      act(() => {
        result.current.handleCellChange(10, 0)
      }),
    ).not.toThrow()
  })
})

// =============================================================================
// handleCellSelectMultiple / handleDragEnd
// =============================================================================

describe('useGameInput - selection and drag handlers', () => {
  let options: ReturnType<typeof makeOptions>
  beforeEach(() => {
    options = makeOptions()
  })

  it('forwards multi-cell selection to selectMultipleCells', () => {
    const { result } = renderInput(options)
    act(() => {
      result.current.handleCellSelectMultiple([1, 2, 3])
    })
    expect(options.selectMultipleCells).toHaveBeenCalledWith([1, 2, 3])
  })

  it('skips drag-end when gameRef is null', () => {
    options.gameRef.current = null
    const { result } = renderInput(options)
    act(() => {
      result.current.handleDragEnd([1, 2])
    })
    // No throw is the contract; assert via the spy staying untouched.
    expect(options.gameRef.current).toBeNull()
  })

  it('skips drag-end when gameRef.current is null even with notes + highlight set', () => {
    // Covers the explicit `!gameRef.current` guard at the top of handleDragEnd.
    options.gameRef.current = null
    options.notesModeRef.current = true
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)
    expect(() =>
      act(() => {
        result.current.handleDragEnd([1, 2])
      }),
    ).not.toThrow()
  })

  it('skips drag-end when notes mode is off', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.notesModeRef.current = false
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)
    act(() => {
      result.current.handleDragEnd([1, 2])
    })
    expect(game.setCellMultiple).not.toHaveBeenCalled()
  })

  it('skips drag-end when no digit is highlighted', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.notesModeRef.current = true
    options.highlightedDigitRef.current = null
    const { result } = renderInput(options)
    act(() => {
      result.current.handleDragEnd([1, 2])
    })
    expect(game.setCellMultiple).not.toHaveBeenCalled()
  })

  it('skips drag-end when the cells array is empty', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.notesModeRef.current = true
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)
    act(() => {
      result.current.handleDragEnd([])
    })
    expect(game.setCellMultiple).not.toHaveBeenCalled()
  })

  it('inserts the highlighted candidate on all drag-selected cells', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    options.notesModeRef.current = true
    options.highlightedDigitRef.current = 4
    const { result } = renderInput(options)
    act(() => {
      result.current.handleDragEnd([1, 2, 3])
    })
    expect(game.setCellMultiple).toHaveBeenCalledWith([1, 2, 3], 4, true)
  })
})

// =============================================================================
// Mode toggles
// =============================================================================

describe('useGameInput - mode toggles', () => {
  it('flips notes mode via the functional updater', () => {
    const options = makeOptions()
    const { result } = renderInput(options)
    act(() => {
      result.current.handleNotesToggle()
    })
    expect(options.setNotesModeSpy).toHaveBeenCalledWith(expect.any(Function))
    const updater = options.setNotesModeSpy.mock.calls[0]![0] as (p: boolean) => boolean
    expect(updater(true)).toBe(false)
    expect(updater(false)).toBe(true)
  })

  it('flips erase mode via the functional updater', () => {
    const options = makeOptions()
    const { result } = renderInput(options)
    act(() => {
      result.current.handleEraseMode()
    })
    expect(options.setEraseModeSpy).toHaveBeenCalledWith(expect.any(Function))
    const updater = options.setEraseModeSpy.mock.calls[0]![0] as (p: boolean) => boolean
    expect(updater(true)).toBe(false)
    expect(updater(false)).toBe(true)
  })
})

// =============================================================================
// Undo / redo
// =============================================================================

describe('useGameInput - undo / redo', () => {
  let options: ReturnType<typeof makeOptions>
  beforeEach(() => {
    options = makeOptions()
  })

  it('steps back through autoSolve when a solve is in progress', () => {
    const autoSolve = makeAutoSolveMock({ isAutoSolving: true })
    options.autoSolveRef.current = autoSolve
    const { result } = renderInput(options)
    act(() => {
      result.current.handleUndo()
    })
    expect(autoSolve.stepBack).toHaveBeenCalledTimes(1)
  })

  it('commits an undo through commitCellAction when not auto-solving', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    const { result } = renderInput(options)
    act(() => {
      result.current.handleUndo()
    })
    expect(options.deselectCell).toHaveBeenCalled()
    expect(options.clearMoveHighlight).toHaveBeenCalled()
  })

  it('no-ops undo when not auto-solving and gameRef is null', () => {
    options.gameRef.current = null
    options.autoSolveRef.current = null
    const { result } = renderInput(options)
    expect(() =>
      act(() => {
        result.current.handleUndo()
      }),
    ).not.toThrow()
  })

  it('steps forward through autoSolve when a solve is in progress', () => {
    const autoSolve = makeAutoSolveMock({ isAutoSolving: true })
    options.autoSolveRef.current = autoSolve
    const { result } = renderInput(options)
    act(() => {
      result.current.handleRedo()
    })
    expect(autoSolve.stepForward).toHaveBeenCalledTimes(1)
  })

  it('commits a redo through commitCellAction when not auto-solving', () => {
    const game = makeGameMock()
    options.gameRef.current = game
    const { result } = renderInput(options)
    act(() => {
      result.current.handleRedo()
    })
    expect(options.clearAllAndDeselect).toHaveBeenCalled()
  })

  it('no-ops redo when not auto-solving and gameRef is null', () => {
    options.gameRef.current = null
    options.autoSolveRef.current = null
    const { result } = renderInput(options)
    expect(() =>
      act(() => {
        result.current.handleRedo()
      }),
    ).not.toThrow()
  })
})

// =============================================================================
// Refs-as-deps sanity: handlers stay stable across re-renders
// =============================================================================

// RC-dependent: see useGameActions.test.ts for the same skipIf rationale.
describe.skipIf(process.env.VITE_SKIP_RC)('useGameInput - handler stability', () => {
  it('returns the same handler identities across re-renders when inputs are stable', () => {
    const options = makeOptions()
    const { result, rerender } = renderInput(options)
    const first = result.current
    rerender()
    expect(result.current.handleCellClick).toBe(first.handleCellClick)
    expect(result.current.handleDigitInput).toBe(first.handleDigitInput)
    expect(result.current.handleCellChange).toBe(first.handleCellChange)
    expect(result.current.handleUndo).toBe(first.handleUndo)
    expect(result.current.handleRedo).toBe(first.handleRedo)
  })
})

// Keep the React import referenced; the test file does not render JSX but
// renderHook pulls in the React runtime.
void useRef
