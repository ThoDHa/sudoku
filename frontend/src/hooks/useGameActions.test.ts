import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { useGameActions, type UseGameActionsOptions } from './useGameActions'
import type { UseSudokuGameReturn } from './useSudokuGame'
import { getAutoSolveSpeed } from '../lib/preferences'

vi.mock('../lib/preferences', () => ({
  getAutoSolveSpeed: vi.fn(() => 'normal'),
}))

// Minimal game mock covering every field the action handlers read. Real
// game-state behavior is exercised in useSudokuGame.test.ts and the Game page
// render-test harness; here we verify the action braid wires its inputs
// through to the right collaborators (commitCellAction, saveScore, the
// solver service, the clipboard, the timer, the auto-solve hook).
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

function makeAutoSolveMock() {
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
    restartAutoSolve: vi.fn(async () => {}),
    playMoves: vi.fn(),
  }
}

function makeTimerControlMock() {
  return {
    isRunning: false,
    isPausedDueToVisibility: false,
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    resetTimer: vi.fn(),
    setElapsedMs: vi.fn(),
    getElapsedMs: vi.fn(() => 12345),
    formatTime: vi.fn(() => '00:12'),
  }
}

function makeOptions(overrides: Partial<UseGameActionsOptions> = {}): UseGameActionsOptions {
  return {
    game: makeGameMock(),
    puzzle: {
      puzzle_id: 'p-1',
      seed: 'P-test',
      difficulty: 'easy',
      givens: Array(81).fill(0),
      solution: Array(81).fill(0),
    },
    solution: Array(81).fill(0),
    encodedPuzzle: null,
    initialBoard: Array(81).fill(0),
    timerControl: makeTimerControlMock() as unknown as UseGameActionsOptions['timerControl'],
    autoSolve: makeAutoSolveMock() as unknown as UseGameActionsOptions['autoSolve'],
    handleAutoSolveError: vi.fn(),
    hintsUsed: 0,
    techniqueHintsUsed: 0,
    autoFillUsed: false,
    autoSolveUsedRef: { current: false },
    colorTheme: 'tokyonight',
    mode: 'dark',
    setAutoFillUsed: vi.fn(),
    setAutoSolveUsed: vi.fn(),
    setHintsUsed: vi.fn(),
    setTechniqueHintsUsed: vi.fn(),
    setAutoSolveStepsUsed: vi.fn(),
    setAutoSolveErrorsFixed: vi.fn(),
    setNotesMode: vi.fn(),
    setValidationMessage: vi.fn(),
    setIncorrectCells: vi.fn(),
    setShowResultModal: vi.fn(),
    setDebugInfoCopied: vi.fn(),
    scheduleToastClear: vi.fn(),
    visibilityAwareTimeout: vi.fn(),
    clearSavedGameState: vi.fn(),
    clearAllAndDeselect: vi.fn(),
    ...overrides,
  }
}

function renderActions(options: ReturnType<typeof makeOptions>) {
  return renderHook(() => useGameActions(options))
}

describe('useGameActions - handleClearAll', () => {
  it('clears saved state and commits the clearAll action', () => {
    const options = makeOptions()
    const { result } = renderActions(options)
    act(() => {
      result.current.handleClearAll()
    })
    expect(options.clearSavedGameState).toHaveBeenCalledTimes(1)
    expect(options.game.clearAll).toHaveBeenCalledTimes(1)
    expect(options.clearAllAndDeselect).toHaveBeenCalledTimes(1)
    expect(options.setNotesMode).toHaveBeenCalledWith(false)
  })
})

describe('useGameActions - resetAllGameState + handleRestart', () => {
  it('resets the board, the tracking counters, and the autoSolveUsedRef flag', () => {
    const options = makeOptions()
    const { result } = renderActions(options)
    act(() => {
      result.current.resetAllGameState()
    })
    expect(options.game.resetGame).toHaveBeenCalledTimes(1)
    expect(options.setAutoSolveUsed).toHaveBeenCalledWith(false)
    expect(options.autoSolveUsedRef.current).toBe(false)
  })

  it('restart chain: resetAllGameState + clearSavedGameState + timer reset/start + UI cleanup', () => {
    const options = makeOptions()
    const { result } = renderActions(options)
    act(() => {
      result.current.handleRestart()
    })
    expect(options.game.resetGame).toHaveBeenCalledTimes(1)
    expect(options.clearSavedGameState).toHaveBeenCalledTimes(1)
    expect(options.timerControl.resetTimer).toHaveBeenCalledTimes(1)
    expect(options.timerControl.startTimer).toHaveBeenCalledTimes(1)
    expect(options.clearAllAndDeselect).toHaveBeenCalledTimes(1)
    expect(options.setNotesMode).toHaveBeenCalledWith(false)
    expect(options.setShowResultModal).toHaveBeenCalledWith(false)
  })
})

describe('useGameActions - autoFillNotes', () => {
  it('no-ops when the board is not 81 cells', () => {
    const game = makeGameMock({ board: [] })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.autoFillNotes()
    })
    expect(options.setAutoFillUsed).not.toHaveBeenCalled()
  })

  it('counts cells with candidates and applies the auto-fill move', () => {
    // fillAllCandidates returns a Uint16Array where cell 0 has at least one
    // candidate bit set; cellsWithCandidates++ must fire.
    const newCands = new Uint16Array(81)
    newCands[0] = 1 << 5 // digit 5 candidate
    const game = makeGameMock({ fillAllCandidates: vi.fn(() => newCands) })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.autoFillNotes()
    })
    expect(options.game.applyExternalMove).toHaveBeenCalledTimes(1)
    expect(options.setAutoFillUsed).toHaveBeenCalledWith(true)
    // Assert the Move object's content — kills StringLiteral, ObjectLiteral,
    // ArrayDeclaration, BooleanLiteral, ConditionalExpression, EqualityOperator,
    // LogicalOperator, and UpdateOperator mutants on the fillMove construction
    // and the cellsWithCandidates counting loop.
    const moveArg = (options.game.applyExternalMove as Mock).mock.calls[0]![2]
    expect(moveArg).toEqual({
      step_index: 0,
      technique: 'Fill Candidates',
      action: 'candidate',
      digit: 0,
      targets: [],
      explanation: 'Filled all candidates for 1 cells',
      refs: { title: 'Fill Candidates', slug: 'fill-candidates', url: '' },
      highlights: { primary: [] },
      isUserMove: true,
    })
  })

  it('applies the auto-fill move even when no cell has candidates', () => {
    const game = makeGameMock({ fillAllCandidates: vi.fn(() => new Uint16Array(81)) })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.autoFillNotes()
    })
    expect(options.game.applyExternalMove).toHaveBeenCalledTimes(1)
    expect(options.setAutoFillUsed).toHaveBeenCalledWith(true)
    // cellsWithCandidates = 0 when no cell has candidate bits set.
    const moveArg = (options.game.applyExternalMove as Mock).mock.calls[0]![2]
    expect(moveArg.explanation).toBe('Filled all candidates for 0 cells')
  })
})

describe('useGameActions - handleCheckNotes', () => {
  it('warns when there are no notes to check', () => {
    const game = makeGameMock({
      checkNotes: vi.fn(() => ({
        valid: true,
        wrongNotes: [],
        missingNotes: [],
        cellsWithNotes: 0,
      })),
    })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.handleCheckNotes()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'No notes to check. Add some notes first!',
    })
    // Drive the scheduled clearer to cover the trailing inline arrow.
    const clearer = (options.scheduleToastClear as unknown as Mock).mock.calls.at(
      -1,
    )![1] as () => void
    act(() => clearer())
    expect(options.setValidationMessage).toHaveBeenLastCalledWith(null)
  })

  it('reports a fully-correct board without missing notes', () => {
    const game = makeGameMock({
      checkNotes: vi.fn(() => ({
        valid: true,
        wrongNotes: [],
        missingNotes: [],
        cellsWithNotes: 5,
      })),
    })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.handleCheckNotes()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'success',
      message: 'All notes are correct and complete!',
    })
  })

  it('calls out the missing-candidate count when notes are valid but incomplete', () => {
    const game = makeGameMock({
      checkNotes: vi.fn(() => ({
        valid: true,
        wrongNotes: [],
        missingNotes: [{ idx: 1, digit: 2 }],
        cellsWithNotes: 5,
      })),
    })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.handleCheckNotes()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'success',
      message: 'Notes are correct! (1 possible candidates not noted)',
    })
  })

  it('reports wrong notes when validation fails', () => {
    const game = makeGameMock({
      checkNotes: vi.fn(() => ({
        valid: false,
        wrongNotes: [
          { idx: 1, digit: 2 },
          { idx: 2, digit: 3 },
        ],
        missingNotes: [],
        cellsWithNotes: 5,
      })),
    })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.handleCheckNotes()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'Found 2 incorrect notes. Some notes are impossible.',
    })
  })

  it('uses the singular form when exactly one wrong note is found', () => {
    const game = makeGameMock({
      checkNotes: vi.fn(() => ({
        valid: false,
        wrongNotes: [{ idx: 1, digit: 2 }],
        missingNotes: [],
        cellsWithNotes: 5,
      })),
    })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.handleCheckNotes()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'Found 1 incorrect note. Some notes are impossible.',
    })
  })

  it('drives the scheduled toast-clear callback so the inline arrow runs', () => {
    const game = makeGameMock({
      checkNotes: vi.fn(() => ({
        valid: true,
        wrongNotes: [],
        missingNotes: [],
        cellsWithNotes: 5,
      })),
    })
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    act(() => {
      result.current.handleCheckNotes()
    })
    const clearer = (options.scheduleToastClear as unknown as Mock).mock.calls.at(
      -1,
    )![1] as () => void
    act(() => clearer())
    expect(options.setValidationMessage).toHaveBeenLastCalledWith(null)
  })
})

describe('useGameActions - handleValidate', () => {
  it('refuses when the solution is unavailable', () => {
    const options = makeOptions({ solution: [] })
    const { result } = renderActions(options)
    act(() => {
      result.current.handleValidate()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'Solution not available',
    })
    // Drive the scheduled clearer to cover the inline arrow.
    const clearer = (options.scheduleToastClear as unknown as Mock).mock.calls.at(
      -1,
    )![1] as () => void
    act(() => clearer())
    expect(options.setValidationMessage).toHaveBeenLastCalledWith(null)
  })

  it('surfaces the success toast and clears incorrect cells when validateBoard returns valid', async () => {
    const solverService = await import('../lib/solver-service')
    const spy = vi
      .spyOn(solverService, 'validateBoard')
      .mockReturnValue({ valid: true, message: 'ok', incorrectCells: [] })
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleValidate()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'success',
      message: 'ok',
    })
    expect(options.setIncorrectCells).toHaveBeenCalledWith([])
    spy.mockRestore()
  })

  it('falls back to the default success message when validateBoard omits one', async () => {
    const solverService = await import('../lib/solver-service')
    const spy = vi.spyOn(solverService, 'validateBoard').mockReturnValue({
      valid: true,
      incorrectCells: [],
    })
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleValidate()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'success',
      message: 'All entries are correct!',
    })
    spy.mockRestore()
  })

  it('surfaces the error toast and records the incorrect cells on validation failure', async () => {
    const solverService = await import('../lib/solver-service')
    const spy = vi
      .spyOn(solverService, 'validateBoard')
      .mockReturnValue({ valid: false, message: 'bad', incorrectCells: [3, 4] })
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleValidate()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'bad',
    })
    expect(options.setIncorrectCells).toHaveBeenCalledWith([3, 4])
    // Drive the scheduled clearer to cover the trailing inline arrow that
    // also resets incorrectCells.
    const clearer = (options.scheduleToastClear as unknown as Mock).mock.calls.at(
      -1,
    )![1] as () => void
    act(() => clearer())
    expect(options.setIncorrectCells).toHaveBeenLastCalledWith([])
    spy.mockRestore()
  })

  it('uses the default error message and skips incorrectCells when validateBoard omits them', async () => {
    const solverService = await import('../lib/solver-service')
    // Build the result piecewise so exactOptionalPropertyTypes is satisfied:
    // drop incorrectCells entirely rather than assigning undefined.
    const result = { valid: false } as { valid: false }
    const spy = vi.spyOn(solverService, 'validateBoard').mockReturnValue(result as never)
    const options = makeOptions()
    const { result: hook } = renderActions(options)
    await act(async () => {
      await hook.current.handleValidate()
    })
    expect(options.setValidationMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'There are errors in the puzzle',
    })
    // incorrectCells was omitted from the result — setIncorrectCells must NOT
    // be called. Kills ConditionalExpression(true) mutant on the guard.
    expect(options.setIncorrectCells).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('useGameActions - handleSubmit', () => {
  it('no-ops without a puzzle', async () => {
    const options = makeOptions({ puzzle: null })
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(options.setShowResultModal).not.toHaveBeenCalled()
  })

  it('saves the score, surfaces the result modal, and bumps daily streak for daily seeds', async () => {
    const options = makeOptions({
      puzzle: {
        puzzle_id: 'p-1',
        seed: 'daily-2026-07-18',
        difficulty: 'easy',
        givens: Array(81).fill(0),
        solution: Array(81).fill(0),
      },
      hintsUsed: 2,
      techniqueHintsUsed: 1,
      autoFillUsed: true,
      encodedPuzzle: 'enc-123',
    })
    options.autoSolveUsedRef.current = true
    const { result } = renderActions(options)

    const saveScoreSpy = vi
      .spyOn(await import('../lib/scores'), 'saveScore')
      .mockImplementation(() => undefined)
    const markDailySpy = vi
      .spyOn(await import('../lib/scores'), 'markDailyCompleted')
      .mockImplementation(() => undefined)

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(saveScoreSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: 'daily-2026-07-18',
        difficulty: 'easy',
        timeMs: 12345,
        hintsUsed: 2,
        techniqueHintsUsed: 1,
        autoFillUsed: true,
        autoSolveUsed: true,
        encodedPuzzle: 'enc-123',
      }),
    )
    expect(markDailySpy).toHaveBeenCalledTimes(1)
    expect(options.setShowResultModal).toHaveBeenCalledWith(true)

    saveScoreSpy.mockRestore()
    markDailySpy.mockRestore()
  })

  it('saves a practice score without marking daily completion', async () => {
    const options = makeOptions()
    const { result } = renderActions(options)

    const saveScoreSpy = vi
      .spyOn(await import('../lib/scores'), 'saveScore')
      .mockImplementation(() => undefined)
    const markDailySpy = vi
      .spyOn(await import('../lib/scores'), 'markDailyCompleted')
      .mockImplementation(() => undefined)

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(saveScoreSpy).toHaveBeenCalledTimes(1)
    expect(markDailySpy).not.toHaveBeenCalled()

    saveScoreSpy.mockRestore()
    markDailySpy.mockRestore()
  })
})

describe('useGameActions - handleSolve', () => {
  it('marks autoSolveUsed (state + ref), clears selection, and restarts the auto-solve loop', async () => {
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleSolve()
    })
    expect(options.clearAllAndDeselect).toHaveBeenCalledTimes(1)
    expect(options.setAutoSolveUsed).toHaveBeenCalledWith(true)
    expect(options.autoSolveUsedRef.current).toBe(true)
    expect(options.autoSolve.restartAutoSolve).toHaveBeenCalledTimes(1)
    // Default speed is not 'step', so startPaused must be false.
    expect(options.autoSolve.restartAutoSolve).toHaveBeenCalledWith(false)
  })

  it('starts paused when autoSolveSpeed is step', async () => {
    vi.mocked(getAutoSolveSpeed).mockReturnValue('step')
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleSolve()
    })
    expect(options.autoSolve.restartAutoSolve).toHaveBeenCalledWith(true)
    vi.mocked(getAutoSolveSpeed).mockReturnValue('normal')
  })
})

describe('useGameActions - handleCheckAndFix', () => {
  it('returns early when the solution is missing', async () => {
    const options = makeOptions({ solution: [] })
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCheckAndFix()
    })
    expect(options.autoSolve.playMoves).not.toHaveBeenCalled()
  })

  it('returns early when givens are not available', async () => {
    const options = makeOptions({
      puzzle: {
        puzzle_id: 'p',
        seed: 'P-test',
        difficulty: 'easy',
        givens: [],
        solution: Array(81).fill(0),
      },
    })
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCheckAndFix()
    })
    expect(options.autoSolve.playMoves).not.toHaveBeenCalled()
  })

  it('replays the returned fix moves through the auto-solve infrastructure', async () => {
    const solverService = await import('../lib/solver-service')
    const fixMoves = {
      moves: [{ board: Array(81).fill(0), candidates: [], move: null }],
    }
    const spy = vi
      .spyOn(solverService, 'checkAndFixWithSolution')
      .mockResolvedValue(fixMoves as never)
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCheckAndFix()
    })
    expect(options.autoSolve.playMoves).toHaveBeenCalledWith(fixMoves.moves, false)
    spy.mockRestore()
  })

  it('logs the no-changes-needed warning when the fix call returns no moves', async () => {
    const solverService = await import('../lib/solver-service')
    const spy = vi.spyOn(solverService, 'checkAndFixWithSolution').mockResolvedValue({
      moves: [],
    } as never)
    const loggerMod = await import('../lib/logger')
    const warnSpy = vi.spyOn(loggerMod.logger, 'warn').mockImplementation(() => undefined)
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCheckAndFix()
    })
    expect(options.autoSolve.playMoves).not.toHaveBeenCalled()
    // The warning is the whole point of the else arm, so assert it fired.
    // Without this the arm's body can be emptied and every other assertion
    // here still holds.
    expect(warnSpy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
    warnSpy.mockRestore()
  })

  it('skips the moves block entirely when the solver returns a falsy result', async () => {
    const solverService = await import('../lib/solver-service')
    const spy = vi.spyOn(solverService, 'checkAndFixWithSolution').mockResolvedValue(null as never)
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCheckAndFix()
    })
    expect(options.autoSolve.playMoves).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('handles a null puzzle by falling back to empty givens and erroring out', async () => {
    const options = makeOptions({ puzzle: null })
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCheckAndFix()
    })
    expect(options.autoSolve.playMoves).not.toHaveBeenCalled()
  })

  it('routes solver failures through handleAutoSolveError', async () => {
    const solverService = await import('../lib/solver-service')
    const spy = vi
      .spyOn(solverService, 'checkAndFixWithSolution')
      .mockRejectedValue(new Error('wasm down') as never)
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCheckAndFix()
    })
    expect(options.handleAutoSolveError).toHaveBeenCalledWith('Failed to check and fix entries')
    spy.mockRestore()
  })
})

describe('useGameActions - handleCopyDebugInfo / handleFeatureRequest', () => {
  it('copies the bug report JSON and surfaces the copied toast', async () => {
    const clipboard = await import('../lib/clipboard')
    const spy = vi.spyOn(clipboard, 'copyToClipboard').mockResolvedValue(true)
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCopyDebugInfo()
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(options.setDebugInfoCopied).toHaveBeenCalledWith(true)
    expect(options.visibilityAwareTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Number),
    )
    spy.mockRestore()
  })

  it('walks the history array when building the bug report', async () => {
    // Non-empty history exercises the inline .map((move) => ...) arrow.
    const move = {
      step_index: 0,
      technique: 'place',
      action: 'place',
      digit: 5,
      targets: [],
      eliminations: [],
      explanation: 'm',
      isUserMove: true,
    }
    const game = makeGameMock({ history: [move] as never, historyIndex: 0 })
    const clipboard = await import('../lib/clipboard')
    const clipSpy = vi.spyOn(clipboard, 'copyToClipboard').mockResolvedValue(true)
    const options = makeOptions({ game })
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCopyDebugInfo()
    })
    expect(clipSpy).toHaveBeenCalledTimes(1)
    // Assert the bug report content kills ObjectLiteral/ArrowFunction
    // mutants on the report construction and history.map.
    const jsonArg = (clipSpy as Mock).mock.calls[0]![0] as string
    const report = JSON.parse(jsonArg)
    expect(report.history).toHaveLength(1)
    expect(report.history[0].technique).toBe('place')
    expect(report.history[0].digit).toBe(5)
    expect(report.state.currentBoard).toEqual(Array(81).fill(0))
    expect(report.settings).toEqual({ colorTheme: 'tokyonight', mode: 'dark' })
    // Whole-value, so emptying the puzzle sub-object cannot pass: a per-key
    // assertion would still hold for a report carrying extra keys, and an
    // ObjectLiteral mutant that empties it has to fail this outright.
    expect(report.puzzle).toEqual({
      seed: 'P-test',
      difficulty: 'easy',
      puzzleId: 'p-1',
    })
    // Drive the visibility-aware timeout callback so the inline arrow runs.
    const cb = (options.visibilityAwareTimeout as unknown as Mock).mock.calls[0]![0] as () => void
    act(() => cb())
    expect(options.setDebugInfoCopied).toHaveBeenLastCalledWith(false)
    clipSpy.mockRestore()
  })

  it('does not surface the toast when the clipboard write fails', async () => {
    const clipboard = await import('../lib/clipboard')
    const spy = vi.spyOn(clipboard, 'copyToClipboard').mockResolvedValue(false)
    const options = makeOptions()
    const { result } = renderActions(options)
    await act(async () => {
      await result.current.handleCopyDebugInfo()
    })
    expect(options.setDebugInfoCopied).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('opens the feature-request GitHub URL with noopener,noreferrer', () => {
    const options = makeOptions()
    const { result } = renderActions(options)
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    act(() => {
      result.current.handleFeatureRequest()
    })
    expect(openSpy).toHaveBeenCalledWith(
      'https://github.com/thodha/sudoku/issues',
      '_blank',
      'noopener,noreferrer',
    )
    openSpy.mockRestore()
  })
})

// RC-dependent: these reference-stability assertions hold only when the React
// Compiler is firing, which is every run except Stryker's: stryker.vitest.config.ts
// sets VITE_SKIP_RC=1 because instrumentation defeats RC memoization anyway. With
// RC off and manual memoization removed (FE-7), identities are not stable.
describe.skipIf(process.env['VITE_SKIP_RC'])('useGameActions - handler stability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the same handler identities across re-renders when inputs are stable', () => {
    const fixedOptions = makeOptions()
    const { result, rerender } = renderActions(fixedOptions)
    const first = result.current
    rerender()
    expect(result.current.handleSubmit).toBe(first.handleSubmit)
    expect(result.current.handleSolve).toBe(first.handleSolve)
    expect(result.current.handleClearAll).toBe(first.handleClearAll)
    expect(result.current.handleValidate).toBe(first.handleValidate)
    expect(result.current.handleFeatureRequest).toBe(first.handleFeatureRequest)
    void waitFor
  })
})
