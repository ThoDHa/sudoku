import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Solver Service Unit Tests
 *
 * Tests the solver-service module which coordinates between WASM,
 * Web Workers, and pure TypeScript solvers for sudoku operations.
 */

// Mock dependencies before importing the module under test
vi.mock('./wasm', () => ({
  loadWasm: vi.fn().mockResolvedValue(undefined),
  isWasmReady: vi.fn().mockReturnValue(false),
  getWasmApi: vi.fn().mockReturnValue(null),
  unloadWasm: vi.fn(),
}))

vi.mock('./worker-client', () => ({
  initializeWorker: vi.fn().mockResolvedValue(undefined),
  terminateWorker: vi.fn(),
  isWorkerSupported: vi.fn().mockReturnValue(true),
  isWorkerReady: vi.fn().mockReturnValue(false),
  findNextMove: vi.fn(),
  solveAll: vi.fn(),
}))

vi.mock('./puzzles-data', () => ({
  getPuzzleForSeed: vi.fn(),
}))

vi.mock('./dp-solver', () => ({
  validatePuzzle: vi.fn(),
  validateBoard: vi.fn(),
}))

vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  enableDebug: vi.fn(),
  disableDebug: vi.fn(),
}))

describe('solver-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateBoard()', () => {
    it('should delegate to dp-solver validateBoard', async () => {
      const mockResult = { valid: true }
      const { validateBoard: dpValidateBoard } = await import('./dp-solver')
      vi.mocked(dpValidateBoard).mockReturnValue(mockResult)

      const { validateBoard } = await import('./solver-service')
      const board = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      const solution = [1, 2, 3, 4, 5, 6, 7, 8, 9]

      const result = validateBoard(board, solution)

      expect(dpValidateBoard).toHaveBeenCalledWith(board, solution)
      expect(result).toEqual(mockResult)
    })

    it('should return invalid result with incorrect cells', async () => {
      const mockResult = {
        valid: false,
        reason: 'incorrect',
        message: 'Some cells are incorrect',
        incorrectCells: [0, 4, 8],
      }
      const { validateBoard: dpValidateBoard } = await import('./dp-solver')
      vi.mocked(dpValidateBoard).mockReturnValue(mockResult)

      const { validateBoard } = await import('./solver-service')
      const board = [9, 2, 3, 4, 9, 6, 7, 8, 9]
      const solution = [1, 2, 3, 4, 5, 6, 7, 8, 1]

      const result = validateBoard(board, solution)

      expect(result.valid).toBe(false)
      expect(result.incorrectCells).toEqual([0, 4, 8])
    })
  })

  describe('validateCustomPuzzle()', () => {
    it('should return valid result for unique solvable puzzle', async () => {
      const mockSolution = Array(81).fill(0).map((_, i) => (i % 9) + 1)
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: true,
        solution: mockSolution,
      })

      const { validateCustomPuzzle } = await import('./solver-service')
      const givens = Array(81).fill(0)
      givens[0] = 1
      givens[10] = 2

      const result = await validateCustomPuzzle(givens, 'device-123')

      expect(validatePuzzle).toHaveBeenCalledWith(givens)
      expect(result.valid).toBe(true)
      expect(result.unique).toBe(true)
      expect(result.puzzle_id).toMatch(/^custom-/)
      expect(result.solution).toEqual(mockSolution)
    })

    it('should return invalid for unsolvable puzzle', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: false,
        reason: 'unsolvable',
      })

      const { validateCustomPuzzle } = await import('./solver-service')
      const givens = Array(81).fill(0)
      // Invalid: two 1s in the same row
      givens[0] = 1
      givens[1] = 1

      const result = await validateCustomPuzzle(givens, 'device-123')

      expect(result.valid).toBe(false)
      expect(result.reason).toBe('unsolvable')
      expect(result.puzzle_id).toBeUndefined()
    })

    it('should return non-unique for puzzle with multiple solutions', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: false,
        reason: 'multiple_solutions',
      })

      const { validateCustomPuzzle } = await import('./solver-service')
      const givens = Array(81).fill(0)

      const result = await validateCustomPuzzle(givens, 'device-123')

      expect(result.valid).toBe(true)
      expect(result.unique).toBe(false)
      expect(result.reason).toBe('multiple_solutions')
      expect(result.puzzle_id).toBeUndefined()
    })

    it('should handle edge case with empty givens', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: false,
        reason: 'multiple_solutions',
      })

      const { validateCustomPuzzle } = await import('./solver-service')
      const emptyGivens = Array(81).fill(0)

      const result = await validateCustomPuzzle(emptyGivens, 'device-123')

      expect(result.valid).toBe(true)
      expect(result.unique).toBe(false)
    })
  })

  describe('getPuzzle()', () => {
    it('should return puzzle for valid seed and difficulty', async () => {
      const mockPuzzle = {
        givens: Array(81).fill(0),
        solution: Array(81).fill(1),
        puzzleIndex: 42,
      }
      const { getPuzzleForSeed } = await import('./puzzles-data')
      vi.mocked(getPuzzleForSeed).mockReturnValue(mockPuzzle)

      const { getPuzzle } = await import('./solver-service')
      const result = getPuzzle('test-seed', 'medium')

      expect(getPuzzleForSeed).toHaveBeenCalledWith('test-seed', 'medium')
      expect(result.puzzle_id).toBe('static-42')
      expect(result.seed).toBe('test-seed')
      expect(result.difficulty).toBe('medium')
      expect(result.givens).toEqual(mockPuzzle.givens)
      expect(result.solution).toEqual(mockPuzzle.solution)
      expect(result.puzzle_index).toBe(42)
    })

    it('should throw error for invalid seed', async () => {
      const { getPuzzleForSeed } = await import('./puzzles-data')
      vi.mocked(getPuzzleForSeed).mockReturnValue(null)

      const { getPuzzle } = await import('./solver-service')

      expect(() => getPuzzle('invalid-seed', 'easy')).toThrow(
        'Failed to load puzzle for seed "invalid-seed" with difficulty "easy"'
      )
    })

    it('should handle different difficulty levels', async () => {
      const mockPuzzle = {
        givens: Array(81).fill(0),
        solution: Array(81).fill(1),
        puzzleIndex: 100,
      }
      const { getPuzzleForSeed } = await import('./puzzles-data')
      vi.mocked(getPuzzleForSeed).mockReturnValue(mockPuzzle)

      const { getPuzzle } = await import('./solver-service')

      const difficulties = ['easy', 'medium', 'hard', 'expert']
      for (const difficulty of difficulties) {
        const result = getPuzzle('seed', difficulty)
        expect(result.difficulty).toBe(difficulty)
      }
    })
  })

  describe('getDailySeed()', () => {
    it('should return correctly formatted date and seed', async () => {
      const mockDate = new Date('2024-12-25T10:30:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      const { getDailySeed } = await import('./solver-service')
      const result = getDailySeed()

      expect(result.date_utc).toBe('2024-12-25')
      expect(result.seed).toBe('daily-2024-12-25')

      vi.useRealTimers()
    })

    it('should pad single-digit months and days', async () => {
      const mockDate = new Date('2024-01-05T10:30:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      const { getDailySeed } = await import('./solver-service')
      const result = getDailySeed()

      expect(result.date_utc).toBe('2024-01-05')
      expect(result.seed).toBe('daily-2024-01-05')

      vi.useRealTimers()
    })

    it('should use UTC time regardless of local timezone', async () => {
      // Test near midnight boundary - 11:59 PM on Dec 24 in UTC+5 is still Dec 24 UTC
      const mockDate = new Date('2024-12-24T23:59:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      const { getDailySeed } = await import('./solver-service')
      const result = getDailySeed()

      expect(result.date_utc).toBe('2024-12-24')

      vi.useRealTimers()
    })

    it('should handle year boundaries', async () => {
      const mockDate = new Date('2025-01-01T00:00:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      const { getDailySeed } = await import('./solver-service')
      const result = getDailySeed()

      expect(result.date_utc).toBe('2025-01-01')
      expect(result.seed).toBe('daily-2025-01-01')

      vi.useRealTimers()
    })
  })

  describe('setWorkerMode() / isUsingWorkerMode()', () => {
    it('should default to using worker mode when supported', async () => {
      const { isWorkerSupported } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(true)

      vi.resetModules()
      const { isUsingWorkerMode } = await import('./solver-service')

      expect(isUsingWorkerMode()).toBe(true)
    })

    it('should return false when workers are not supported', async () => {
      const { isWorkerSupported } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(false)

      vi.resetModules()
      const { isUsingWorkerMode } = await import('./solver-service')

      expect(isUsingWorkerMode()).toBe(false)
    })

    it('should allow disabling worker mode', async () => {
      const { isWorkerSupported } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(true)

      vi.resetModules()
      const { setWorkerMode, isUsingWorkerMode } = await import('./solver-service')

      expect(isUsingWorkerMode()).toBe(true)

      setWorkerMode(false)
      expect(isUsingWorkerMode()).toBe(false)

      setWorkerMode(true)
      expect(isUsingWorkerMode()).toBe(true)
    })
  })

  describe('initializeSolver()', () => {
    it('should initialize worker when worker mode is enabled and supported', async () => {
      const { isWorkerSupported, initializeWorker } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(initializeWorker).mockResolvedValue(undefined)

      vi.resetModules()
      const { initializeSolver, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      await initializeSolver()

      expect(initializeWorker).toHaveBeenCalled()
    })

    it('should fall back to main thread WASM when worker initialization fails', async () => {
      const { isWorkerSupported, initializeWorker } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(initializeWorker).mockRejectedValue(new Error('Worker failed'))
      vi.mocked(loadWasm).mockResolvedValue(undefined)
      vi.mocked(getWasmApi).mockReturnValue({
        solveAll: vi.fn(),
        findNextMove: vi.fn(),
      } as never)

      vi.resetModules()
      const { initializeSolver, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      // Should not throw, should fall back gracefully
      await expect(initializeSolver()).resolves.toBeUndefined()
      expect(loadWasm).toHaveBeenCalled()
    })

    it('should use main thread WASM when worker mode is disabled', async () => {
      const { isWorkerSupported, initializeWorker } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(loadWasm).mockResolvedValue(undefined)
      vi.mocked(getWasmApi).mockReturnValue({
        solveAll: vi.fn(),
        findNextMove: vi.fn(),
      } as never)

      vi.resetModules()
      const { initializeSolver, setWorkerMode } = await import('./solver-service')
      setWorkerMode(false)

      await initializeSolver()

      expect(initializeWorker).not.toHaveBeenCalled()
      expect(loadWasm).toHaveBeenCalled()
    })
  })

  describe('cleanupSolver()', () => {
    it('should terminate worker when worker is ready', async () => {
      const { isWorkerReady, terminateWorker } = await import('./worker-client')
      const { unloadWasm } = await import('./wasm')

      vi.mocked(isWorkerReady).mockReturnValue(true)

      vi.resetModules()
      const { cleanupSolver } = await import('./solver-service')

      cleanupSolver()

      expect(terminateWorker).toHaveBeenCalled()
      expect(unloadWasm).toHaveBeenCalled()
    })

    it('should not throw when worker is not ready', async () => {
      const { isWorkerReady, terminateWorker } = await import('./worker-client')
      const { unloadWasm } = await import('./wasm')

      vi.mocked(isWorkerReady).mockReturnValue(false)

      vi.resetModules()
      const { cleanupSolver } = await import('./solver-service')

      expect(() => cleanupSolver()).not.toThrow()
      expect(terminateWorker).not.toHaveBeenCalled()
      expect(unloadWasm).toHaveBeenCalled()
    })

    it('should handle errors during cleanup gracefully', async () => {
      const { isWorkerReady, terminateWorker } = await import('./worker-client')
      const { unloadWasm } = await import('./wasm')

      vi.mocked(isWorkerReady).mockReturnValue(true)
      vi.mocked(terminateWorker).mockImplementation(() => {
        throw new Error('Terminate failed')
      })

      vi.resetModules()
      const { cleanupSolver } = await import('./solver-service')

      // Should not throw, should handle error gracefully
      expect(() => cleanupSolver()).not.toThrow()
    })

    it('should be safe to call multiple times', async () => {
      const { isWorkerReady, terminateWorker } = await import('./worker-client')
      const { unloadWasm } = await import('./wasm')

      vi.mocked(isWorkerReady).mockReturnValue(false)

      vi.resetModules()
      const { cleanupSolver } = await import('./solver-service')

      cleanupSolver()
      cleanupSolver()
      cleanupSolver()

      expect(unloadWasm).toHaveBeenCalledTimes(3)
    })
  })

  describe('solveAll()', () => {
    const mockBoard = Array(81).fill(0)
    const mockCandidates = Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const mockGivens = Array(81).fill(0)

    it('should use worker when worker mode is enabled', async () => {
      const { isWorkerSupported, solveAll: workerSolveAll } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerSolveAll).mockResolvedValue({
        moves: [],
        solved: true,
        finalBoard: mockBoard,
      })

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await solveAll(mockBoard, mockCandidates, mockGivens)

      expect(workerSolveAll).toHaveBeenCalledWith(mockBoard, mockCandidates, mockGivens)
      expect(result.solved).toBe(true)
    })

    it('should fall back to main thread when worker fails', async () => {
      const { isWorkerSupported, solveAll: workerSolveAll } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      const mockApi = {
        solveAll: vi.fn().mockReturnValue({
          moves: [],
          solved: true,
          finalBoard: mockBoard,
        }),
        findNextMove: vi.fn(),
      }

      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerSolveAll).mockRejectedValue(new Error('Worker failed'))
      vi.mocked(loadWasm).mockResolvedValue(undefined)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await solveAll(mockBoard, mockCandidates, mockGivens)

      expect(result.solved).toBe(true)
      expect(mockApi.solveAll).toHaveBeenCalled()
    })
  })

  describe('findNextMove()', () => {
    const mockBoard = Array(81).fill(0)
    const mockCandidates = Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const mockGivens = Array(81).fill(0)

    it('should use worker when worker mode is enabled', async () => {
      const { isWorkerSupported, findNextMove: workerFindNextMove } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerFindNextMove).mockResolvedValue({
        move: null,
        board: mockBoard,
        candidates: mockCandidates,
        solved: false,
      })

      vi.resetModules()
      const { findNextMove, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await findNextMove(mockBoard, mockCandidates, mockGivens)

      expect(workerFindNextMove).toHaveBeenCalledWith(mockBoard, mockCandidates, mockGivens)
      expect(result.move).toBeNull()
    })

    it('should fall back to main thread when worker fails', async () => {
      const { isWorkerSupported, findNextMove: workerFindNextMove } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      const mockApi = {
        solveAll: vi.fn(),
        findNextMove: vi.fn().mockReturnValue({
          move: null,
          board: { cells: mockBoard, candidates: mockCandidates },
          solved: false,
        }),
      }

      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerFindNextMove).mockRejectedValue(new Error('Worker failed'))
      vi.mocked(loadWasm).mockResolvedValue(undefined)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { findNextMove, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await findNextMove(mockBoard, mockCandidates, mockGivens)

      expect(result.move).toBeNull()
      expect(mockApi.findNextMove).toHaveBeenCalled()
    })

    it('should use main thread directly when worker mode is disabled', async () => {
      const { isWorkerSupported, findNextMove: workerFindNextMove } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      const mockApi = {
        solveAll: vi.fn(),
        findNextMove: vi.fn().mockReturnValue({
          move: { technique: 'NakedSingle', digit: 5 },
          board: { cells: mockBoard, candidates: mockCandidates },
          solved: false,
        }),
      }

      vi.mocked(isWorkerSupported).mockReturnValue(false)
      vi.mocked(loadWasm).mockResolvedValue(undefined)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { findNextMove, setWorkerMode } = await import('./solver-service')
      setWorkerMode(false)

      const result = await findNextMove(mockBoard, mockCandidates, mockGivens)

      expect(workerFindNextMove).not.toHaveBeenCalled()
      expect(mockApi.findNextMove).toHaveBeenCalled()
      expect(result.move).toBeTruthy()
    })
  })

  describe('default export', () => {
    it('should export all main functions', async () => {
      const solverService = await import('./solver-service')

      expect(solverService.default).toBeDefined()
      expect(solverService.default.solveAll).toBeDefined()
      expect(solverService.default.findNextMove).toBeDefined()
      expect(solverService.default.validateBoard).toBeDefined()
      expect(solverService.default.validateCustomPuzzle).toBeDefined()
      expect(solverService.default.getPuzzle).toBeDefined()
    })
  })
})
