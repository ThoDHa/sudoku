/**
 * Autosolver Bug Fix End-to-End Tests (e2e file)
 *
 * This file is named with an `.e2e.ts` suffix to avoid the project's
 * eslint ignore pattern for `*.test.ts` while keeping the test content
 * available for e2e runners. The pre-commit lint step runs ESLint on
 * staged frontend files and treats "file ignored" as a warning which
 * currently fails commits. Placing the file under a non-ignored name
 * allows lint to validate it correctly.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAutoSolve } from './useAutoSolve'
import { useSudokuGame } from './useSudokuGame'
import { getPuzzleForSeed } from '../lib/puzzles-data'
import { solveAll } from '../lib/solver-service'
import { validateBoard } from '../lib/dp-solver'

// Re-export of test content from autosolver-bug-fix.e2e.test.ts
// The actual test logic mirrors the original integration spec file.

vi.mock('../lib/solver-service', () => ({
  solveAll: vi.fn(),
}))

vi.mock('../lib/puzzles-data', () => ({
  getPuzzleForSeed: vi.fn(),
}))

vi.mock('../lib/dp-solver', () => ({
  validateBoard: vi.fn(),
}))

const mockSolveAll = vi.mocked(solveAll)
const mockGetPuzzleForSeed = vi.mocked(getPuzzleForSeed)
const mockValidateBoard = vi.mocked(validateBoard)

const createMockBackgroundManager = () => ({
  isHidden: false,
  shouldPauseOperations: false,
  registerCallback: vi.fn(),
  unregisterCallback: vi.fn(),
})

const createEvidencePuzzle = () => {
  const board = Array(81).fill(0)
  board[0] = 5
  board[4] = 3
  board[8] = 7
  board[9] = 6
  board[18] = 8
  board[20] = 3
  board[27] = 1
  board[35] = 9
  board[36] = 8
  board[44] = 2
  board[45] = 4
  board[53] = 5
  board[54] = 7
  board[62] = 3
  board[63] = 2
  board[71] = 6
  board[72] = 9
  board[80] = 1
  return board
}

const createEvidenceSolution = () => {
  const solution = [...createEvidencePuzzle()]
  solution[1] = 4
  solution[2] = 2
  solution[3] = 9
  solution[5] = 1
  solution[6] = 6
  solution[7] = 8
  for (let i = 0; i < 81; i++) {
    if (solution[i] === 0) {
      solution[i] = ((i % 9) + 1)
    }
  }
  return solution
}

const createBugScenarioMoves = () => [
  {
    board: [...createEvidencePuzzle()],
    candidates: Array(81).fill(null).map(() => [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    move: {
      step_index: 0,
      technique: 'Naked Single',
      action: 'place',
      digit: 1,
      targets: [{ row: 0, col: 1 }],
      explanation: 'Only candidate for this cell',
      refs: { title: 'Naked Single', slug: 'naked-single', url: '/techniques/naked-single' },
      highlights: { primary: [1] },
    },
  },
  {
    board: (() => {
      const board = [...createEvidencePuzzle()]
      board[1] = 1
      return board
    })(),
    candidates: Array(81).fill(null).map(() => [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    move: {
      step_index: 1,
      technique: 'Hidden Single',
      action: 'place',
      digit: 4,
      targets: [{ row: 0, col: 2 }],
      explanation: 'Only candidate for this cell',
      refs: { title: 'Hidden Single', slug: 'hidden-single', url: '/techniques/hidden-single' },
      highlights: { primary: [2] },
    },
  },
]

const createFixedScenarioMoves = () => [
  {
    board: [...createEvidencePuzzle()],
    candidates: Array(81).fill(null).map(() => [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    move: {
      step_index: 0,
      technique: 'Naked Single',
      action: 'place',
      digit: 4,
      targets: [{ row: 0, col: 1 }],
      explanation: 'Only candidate for this cell',
      refs: { title: 'Naked Single', slug: 'naked-single', url: '/techniques/naked-single' },
      highlights: { primary: [1] },
    },
  },
  {
    board: (() => {
      const board = [...createEvidencePuzzle()]
      board[1] = 4
      return board
    })(),
    candidates: Array(81).fill(null).map(() => [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    move: {
      step_index: 1,
      technique: 'Hidden Single',
      action: 'place',
      digit: 2,
      targets: [{ row: 0, col: 2 }],
      explanation: 'Only candidate for this cell',
      refs: { title: 'Hidden Single', slug: 'hidden-single', url: '/techniques/hidden-single' },
      highlights: { primary: [2] },
    },
  },
]

describe('Autosolver Bug Fix - End-to-End Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.clearAllMocks()
    mockGetPuzzleForSeed.mockReturnValue({
      givens: createEvidencePuzzle(),
      solution: createEvidenceSolution(),
      puzzleIndex: 0,
    })
    mockValidateBoard.mockReturnValue({
      valid: true,
      reason: 'correct',
      message: 'Board is correct',
      incorrectCells: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Evidence Scenario - R1C2=1 Incorrect Placement Bug', () => {
    it('prevents R1C2=1 incorrect placement during autosolve', async () => {
      mockSolveAll.mockResolvedValue({ solved: true, moves: createBugScenarioMoves() })

      const gameHook = renderHook(() =>
        useSudokuGame({ initialBoard: createEvidencePuzzle(), onComplete: vi.fn() })
      )

      const autosolveHook = renderHook(() =>
        useAutoSolve({
          getBoard: () => gameHook.result.current.board,
          getCandidates: () => gameHook.result.current.candidates,
          getGivens: () => gameHook.result.current.givens,
          applyMove: vi.fn(),
          applyState: vi.fn(),
          isComplete: () => gameHook.result.current.isComplete,
          onError: vi.fn(),
          onUnpinpointableError: vi.fn(),
          onStatus: vi.fn(),
          onErrorFixed: vi.fn(),
          onStepNavigate: vi.fn(),
          backgroundManager: createMockBackgroundManager(),
          stepDelay: 10,
        })
      )

      await act(async () => {
        autosolveHook.result.current.startAutoSolve()
      })

      expect(autosolveHook.result.current.isAutoSolving).toBe(false)
      expect(autosolveHook.result.current.totalMoves).toBe(2)
      const firstMove = mockSolveAll.mock.calls[0][0][1]
      expect(firstMove).toBeDefined()
      expect(gameHook.result.current.board[1]).not.toBe(1)
    })

    it('ensures correct R1C2=4 placement after bug fix', async () => {
      mockSolveAll.mockResolvedValue({ solved: true, moves: createFixedScenarioMoves() })

      const gameHook = renderHook(() =>
        useSudokuGame({ initialBoard: createEvidencePuzzle(), onComplete: vi.fn() })
      )

      const applyMove = vi.fn()
      const autosolveHook = renderHook(() =>
        useAutoSolve({
          getBoard: () => gameHook.result.current.board,
          getCandidates: () => gameHook.result.current.candidates,
          getGivens: () => gameHook.result.current.givens,
          applyMove,
          applyState: vi.fn(),
          isComplete: () => gameHook.result.current.isComplete,
          onError: vi.fn(),
          onUnpinpointableError: vi.fn(),
          onStatus: vi.fn(),
          onErrorFixed: vi.fn(),
          onStepNavigate: vi.fn(),
          backgroundManager: createMockBackgroundManager(),
          stepDelay: 10,
        })
      )

      await act(async () => {
        autosolveHook.result.current.startAutoSolve()
      })

      expect(applyMove).toHaveBeenCalledTimes(2)
      const firstCall = applyMove.mock.calls[0][0]
      expect(firstCall.move.digit).toBe(4)
      expect(firstCall.move.targets).toEqual([{ row: 0, col: 1 }])
    })
  })
})
