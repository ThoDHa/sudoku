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
  WorkerTerminatedError: class WorkerTerminatedError extends Error {
    constructor() {
      super('Worker terminated')
      this.name = 'WorkerTerminatedError'
    }
  },
}))

vi.mock('./puzzles-data', () => ({
  getPuzzleForSeed: vi.fn(),
  ensurePuzzleBank: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./dp-solver', () => ({
  validatePuzzle: vi.fn(),
  validateBoardAgainstSolution: vi.fn(),
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
    it('should delegate to dp-solver validateBoardAgainstSolution', async () => {
      const mockResult = { valid: true }
      const { validateBoardAgainstSolution: dpValidateBoardAgainstSolution } =
        await import('./dp-solver')
      vi.mocked(dpValidateBoardAgainstSolution).mockReturnValue(mockResult)

      const { validateBoard } = await import('./solver-service')
      const board = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      const solution = [1, 2, 3, 4, 5, 6, 7, 8, 9]

      const result = validateBoard(board, solution)

      expect(dpValidateBoardAgainstSolution).toHaveBeenCalledWith(board, solution)
      expect(result).toEqual(mockResult)
    })

    it('should return invalid result with incorrect cells', async () => {
      const mockResult = {
        valid: false,
        reason: 'incorrect',
        message: 'Some cells are incorrect',
        incorrectCells: [0, 4, 8],
      }
      const { validateBoardAgainstSolution: dpValidateBoardAgainstSolution } =
        await import('./dp-solver')
      vi.mocked(dpValidateBoardAgainstSolution).mockReturnValue(mockResult)

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
      const mockSolution = Array(81)
        .fill(0)
        .map((_, i) => (i % 9) + 1)
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
      const result = await getPuzzle('test-seed', 'medium')

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

      await expect(getPuzzle('invalid-seed', 'easy')).rejects.toThrow(
        'Failed to load puzzle for seed "invalid-seed" with difficulty "easy"',
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
        const result = await getPuzzle('seed', difficulty)
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
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
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
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
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
      const { isWorkerReady } = await import('./worker-client')
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
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
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
      const { isWorkerSupported, findNextMove: workerFindNextMove } =
        await import('./worker-client')
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
      const { isWorkerSupported, findNextMove: workerFindNextMove } =
        await import('./worker-client')
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
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { findNextMove, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await findNextMove(mockBoard, mockCandidates, mockGivens)

      expect(result.move).toBeNull()
      expect(mockApi.findNextMove).toHaveBeenCalled()
    })

    it('should use main thread directly when worker mode is disabled', async () => {
      const { isWorkerSupported, findNextMove: workerFindNextMove } =
        await import('./worker-client')
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
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
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

  describe('mutation-kill: toSolveAllResult move mapping', () => {
    it('preserves board, candidates, and move for each entry in a non-empty moves array', async () => {
      const { isWorkerSupported, solveAll: workerSolveAll } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerSolveAll).mockResolvedValue({
        moves: [
          {
            board: [1, 2, 3],
            candidates: [[4], [5], [6]],
            move: { technique: 'NakedSingle', digit: 5 } as never,
          },
        ],
        solved: true,
        finalBoard: [1, 2, 3],
      })

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await solveAll([0], [[]], [0])

      expect(result.moves).toHaveLength(1)
      expect(result.moves[0]?.board).toEqual([1, 2, 3])
      expect(result.moves[0]?.candidates).toEqual([[4], [5], [6]])
      expect(result.moves[0]?.move).toEqual(expect.objectContaining({ technique: 'NakedSingle' }))
    })
  })

  describe('mutation-kill: enableWorkerMode', () => {
    it('sets worker mode to false when workers are unsupported', async () => {
      const { isWorkerSupported } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(false)

      vi.resetModules()
      const { enableWorkerMode, isUsingWorkerMode } = await import('./solver-service')

      expect(isUsingWorkerMode()).toBe(false)
      enableWorkerMode()
      expect(isUsingWorkerMode()).toBe(false)
    })

    it('sets worker mode to true when workers are supported', async () => {
      const { isWorkerSupported } = await import('./worker-client')
      vi.mocked(isWorkerSupported).mockReturnValue(true)

      vi.resetModules()
      const { setWorkerMode, enableWorkerMode, isUsingWorkerMode } =
        await import('./solver-service')
      setWorkerMode(false)
      expect(isUsingWorkerMode()).toBe(false)

      enableWorkerMode()
      expect(isUsingWorkerMode()).toBe(true)
    })
  })

  describe('mutation-kill: getApi error path', () => {
    it('throws WASM not loaded when getWasmApi returns null after load', async () => {
      const { loadWasm, getWasmApi } = await import('./wasm')
      const { isWorkerSupported } = await import('./worker-client')

      vi.mocked(isWorkerSupported).mockReturnValue(false)
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(null)

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(false)

      await expect(solveAll([0], [[]], [0])).rejects.toThrow('WASM not loaded')
    })

    it('caches wasmApi and does not reload WASM on subsequent main-thread calls', async () => {
      const { loadWasm, getWasmApi } = await import('./wasm')
      const { isWorkerSupported } = await import('./worker-client')

      const mockApi = {
        solveAll: vi.fn().mockReturnValue({ moves: [], solved: true, finalBoard: [] }),
        findNextMove: vi.fn(),
      }
      vi.mocked(isWorkerSupported).mockReturnValue(false)
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(false)

      await solveAll([0], [[]], [0])
      await solveAll([0], [[]], [0])

      expect(loadWasm).toHaveBeenCalledTimes(1)
    })
  })

  describe('mutation-kill: initializeSolver fallback side effects', () => {
    it('sets worker mode to false and logs after falling back to main thread', async () => {
      const { isWorkerSupported, initializeWorker } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')
      const { logger } = await import('./logger')

      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(initializeWorker).mockRejectedValue(new Error('Worker failed'))
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue({
        solveAll: vi.fn(),
        findNextMove: vi.fn(),
      } as never)

      vi.resetModules()
      const mod = await import('./solver-service')
      mod.setWorkerMode(true)

      await mod.initializeSolver()

      expect(mod.isUsingWorkerMode()).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        '[SolverService] Worker initialization failed, falling back to main thread:',
        expect.any(Error),
      )
      expect(logger.debug).toHaveBeenCalledWith('[SolverService] Main thread mode initialized')
    })

    it('logs worker mode initialized on success', async () => {
      const { isWorkerSupported, initializeWorker } = await import('./worker-client')
      const { logger } = await import('./logger')

      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(initializeWorker).mockResolvedValue(undefined)

      vi.resetModules()
      const { initializeSolver, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      await initializeSolver()

      expect(logger.debug).toHaveBeenCalledWith('[SolverService] Worker mode initialized')
    })
  })

  describe('mutation-kill: cleanupSolver logging', () => {
    it('logs worker terminated and cleanup success', async () => {
      const { isWorkerReady, terminateWorker } = await import('./worker-client')
      const { logger } = await import('./logger')

      vi.mocked(isWorkerReady).mockReturnValue(true)
      vi.mocked(terminateWorker).mockReset()

      vi.resetModules()
      const { cleanupSolver } = await import('./solver-service')

      cleanupSolver()

      expect(logger.debug).toHaveBeenCalledWith('[SolverService] Worker terminated')
      expect(logger.debug).toHaveBeenCalledWith('[SolverService] Solver cleaned up successfully')
    })

    it('logs cleanup errors when terminateWorker throws', async () => {
      const { isWorkerReady, terminateWorker } = await import('./worker-client')
      const { logger } = await import('./logger')

      vi.mocked(isWorkerReady).mockReturnValue(true)
      vi.mocked(terminateWorker).mockImplementation(() => {
        throw new Error('Terminate failed')
      })

      vi.resetModules()
      const { cleanupSolver } = await import('./solver-service')

      cleanupSolver()

      expect(logger.debug).toHaveBeenCalledWith(
        '[SolverService] Error during solver cleanup:',
        expect.any(Error),
      )
    })
  })

  describe('mutation-kill: solveAll / findNextMove fallback logging', () => {
    it('logs solveAll worker fallback and uses main thread', async () => {
      const { isWorkerSupported, solveAll: workerSolveAll } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')
      const { logger } = await import('./logger')

      const mockApi = {
        solveAll: vi.fn().mockReturnValue({ moves: [], solved: true, finalBoard: [] }),
        findNextMove: vi.fn(),
      }
      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerSolveAll).mockRejectedValue(new Error('Worker failed'))
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await solveAll([0], [[]], [0])

      expect(result.solved).toBe(true)
      expect(logger.error).toHaveBeenCalledWith(
        '[SolverService] Worker solveAll failed, falling back:',
        expect.any(Error),
      )
    })

    it('logs findNextMove worker fallback and uses main thread', async () => {
      const { isWorkerSupported, findNextMove: workerFindNextMove } =
        await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')
      const { logger } = await import('./logger')

      const mockApi = {
        solveAll: vi.fn(),
        findNextMove: vi.fn().mockReturnValue({
          move: null,
          board: { cells: [0], candidates: [[]] },
          solved: false,
        }),
      }
      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerFindNextMove).mockRejectedValue(new Error('Worker failed'))
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { findNextMove, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await findNextMove([0], [[]], [0])

      expect(result.move).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        '[SolverService] Worker findNextMove failed, falling back:',
        expect.any(Error),
      )
    })

    it('uses main thread directly when worker mode is disabled for solveAll', async () => {
      const { isWorkerSupported, solveAll: workerSolveAll } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      const mockApi = {
        solveAll: vi.fn().mockReturnValue({ moves: [], solved: true, finalBoard: [] }),
        findNextMove: vi.fn(),
      }
      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(false)

      await solveAll([0], [[]], [0])

      expect(workerSolveAll).not.toHaveBeenCalled()
      expect(mockApi.solveAll).toHaveBeenCalled()
    })
  })

  describe('mutation-kill: validateCustomPuzzle branching', () => {
    it('returns puzzle_id with an 8-hex-char suffix for a valid unique puzzle', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: true,
        solution: Array(81).fill(1),
      })

      vi.resetModules()
      const { validateCustomPuzzle } = await import('./solver-service')

      const givens = Array(81).fill(0)
      givens[0] = 1
      const result = await validateCustomPuzzle(givens, 'device')

      expect(result.puzzle_id).toMatch(/^custom-[0-9a-f]{8}$/)
    })

    it('returns exact puzzle_id matching the reference hash', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: true,
        solution: Array(81).fill(1),
      })

      vi.resetModules()
      const { validateCustomPuzzle } = await import('./solver-service')

      const givens = Array(81).fill(0)
      givens[0] = 1
      givens[1] = 2
      givens[2] = 3

      // Reference implementation of hashGivens (mirrors the original algorithm)
      let hash = 0
      for (let i = 0; i < givens.length; i++) {
        hash = ((hash << 5) - hash + (givens[i] ?? 0)) | 0
      }
      const expected = 'custom-' + Math.abs(hash).toString(16).padStart(8, '0')

      const result = await validateCustomPuzzle(givens, 'device')
      expect(result.puzzle_id).toBe(expected)
    })

    it('does not mark a non-unique puzzle with solution as unique', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: false,
        solution: Array(81).fill(1),
      })

      vi.resetModules()
      const { validateCustomPuzzle } = await import('./solver-service')

      const result = await validateCustomPuzzle(Array(81).fill(0), 'device')

      expect(result.valid).toBe(true)
      expect(result.unique).toBe(false)
      expect(result.puzzle_id).toBeUndefined()
    })

    it('returns invalid without puzzle_id when dp returns invalid', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: false,
        reason: 'unsolvable',
      })

      vi.resetModules()
      const { validateCustomPuzzle } = await import('./solver-service')

      const result = await validateCustomPuzzle(Array(81).fill(0), 'device')

      expect(result.valid).toBe(false)
      expect(result.puzzle_id).toBeUndefined()
    })

    it('forwards solution in the non-unique response when dp provides one', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      const sol = Array(81).fill(5)
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: false,
        solution: sol,
      })

      vi.resetModules()
      const { validateCustomPuzzle } = await import('./solver-service')

      const result = await validateCustomPuzzle(Array(81).fill(0), 'device')

      expect(result.solution).toEqual(sol)
    })
  })

  describe('mutation-kill: hashGivens asymmetry and padding', () => {
    it('produces a puzzle_id whose hash differs under the +val vs -val accumulator (L342)', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: true,
        solution: Array(81).fill(1),
      })

      vi.resetModules()
      const { validateCustomPuzzle } = await import('./solver-service')

      // Multiple non-zero values force int32 overflow that breaks Math.abs symmetry
      // between the original (+val) and the -val mutant.
      const givens = Array(81).fill(0)
      for (let i = 0; i < 9; i++) givens[i] = i + 1

      // Reference implementation mirroring the original +val formula
      let hash = 0
      for (let i = 0; i < givens.length; i++) {
        hash = ((hash << 5) - hash + (givens[i] ?? 0)) | 0
      }
      const expected = 'custom-' + Math.abs(hash).toString(16).padStart(8, '0')

      const result = await validateCustomPuzzle(givens, 'device')

      expect(result.puzzle_id).toBe(expected)
    })

    it('left-pads short hex hashes to 8 chars with "0" (L344)', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: true,
        solution: Array(81).fill(1),
      })

      vi.resetModules()
      const { validateCustomPuzzle } = await import('./solver-service')

      // Only the final cell set: hash stays 0 through i=0..79 then becomes 1 at i=80.
      const givens = Array(81).fill(0)
      givens[80] = 1

      const result = await validateCustomPuzzle(givens, 'device')

      // padStart(8, '0') yields 8 hex chars; the empty-string mutant would yield 'custom-1'.
      expect(result.puzzle_id).toBe('custom-00000001')
      expect(result.puzzle_id).toHaveLength(8 + 'custom-'.length)
    })
  })

  describe('mutation-kill: validateCustomPuzzle solution key absence', () => {
    it('does not assign response.solution when result.solution is missing (L293)', async () => {
      const { validatePuzzle } = await import('./dp-solver')
      vi.mocked(validatePuzzle).mockReturnValue({
        valid: true,
        unique: false,
        reason: 'multiple_solutions',
      })

      vi.resetModules()
      const { validateCustomPuzzle } = await import('./solver-service')

      const result = await validateCustomPuzzle(Array(81).fill(0), 'device')

      // The mutant forces `if (true) response.solution = result.solution`, which
      // creates the key with value undefined; the original omits the key entirely.
      expect(result).not.toHaveProperty('solution')
    })
  })

  describe('mutation-kill: checkAndFixWithSolution', () => {
    it('returns the normalized result and logs the wasm outcome', async () => {
      const { loadWasm, getWasmApi } = await import('./wasm')
      const { logger } = await import('./logger')

      const mockResult = {
        moves: [{ board: [1], candidates: [[2]], move: { technique: 'NakedSingle' } }],
        solved: true,
        finalBoard: [1, 2, 3],
      }
      const mockApi = {
        solveAll: vi.fn(),
        findNextMove: vi.fn(),
        checkAndFixWithSolution: vi.fn().mockReturnValue(mockResult),
      }
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { checkAndFixWithSolution } = await import('./solver-service')

      const result = await checkAndFixWithSolution([0], [[]], [0], [1])

      expect(result.solved).toBe(true)
      expect(result.moves).toHaveLength(1)
      expect(result.moves[0]?.board).toEqual([1])
      expect(result.finalBoard).toEqual([1, 2, 3])
      expect(logger.debug).toHaveBeenCalledWith('[Check&Fix] wasm result', {
        solved: true,
        movesCount: 1,
        hasFinalBoard: true,
      })
    })

    it('survives a logging error without throwing', async () => {
      const { loadWasm, getWasmApi } = await import('./wasm')
      const { logger } = await import('./logger')

      const mockResult = {
        moves: [],
        solved: false,
        finalBoard: [],
      }
      const mockApi = {
        solveAll: vi.fn(),
        findNextMove: vi.fn(),
        checkAndFixWithSolution: vi.fn().mockReturnValue(mockResult),
      }
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)
      vi.mocked(logger.debug).mockImplementation(() => {
        throw new Error('logger exploded')
      })

      vi.resetModules()
      const { checkAndFixWithSolution } = await import('./solver-service')

      const result = await checkAndFixWithSolution([0], [[]], [0], [1])
      expect(result).toBeDefined()
      expect(result.solved).toBe(false)
    })
  })

  describe('BUG-14: tab-hide worker termination must not trigger main-thread WASM fallback', () => {
    const mockBoard = Array(81).fill(0)
    const mockCandidates = Array(81).fill([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const mockGivens = Array(81).fill(0)

    beforeEach(async () => {
      const { logger } = await import('./logger')
      vi.mocked(logger.debug).mockReset()
      vi.mocked(logger.debug).mockImplementation(() => {})
    })

    it('solveAll rethrows WorkerTerminatedError and does not load main-thread WASM', async () => {
      const {
        isWorkerSupported,
        solveAll: workerSolveAll,
        WorkerTerminatedError,
      } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerSolveAll).mockRejectedValue(new WorkerTerminatedError())
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue({ solveAll: vi.fn(), findNextMove: vi.fn() } as never)

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      await expect(solveAll(mockBoard, mockCandidates, mockGivens)).rejects.toBeInstanceOf(
        WorkerTerminatedError,
      )

      expect(loadWasm).not.toHaveBeenCalled()
      expect(getWasmApi).not.toHaveBeenCalled()
    })

    it('findNextMove rethrows WorkerTerminatedError and does not load main-thread WASM', async () => {
      const {
        isWorkerSupported,
        findNextMove: workerFindNextMove,
        WorkerTerminatedError,
      } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerFindNextMove).mockRejectedValue(new WorkerTerminatedError())
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue({ solveAll: vi.fn(), findNextMove: vi.fn() } as never)

      vi.resetModules()
      const { findNextMove, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      await expect(findNextMove(mockBoard, mockCandidates, mockGivens)).rejects.toBeInstanceOf(
        WorkerTerminatedError,
      )

      expect(loadWasm).not.toHaveBeenCalled()
      expect(getWasmApi).not.toHaveBeenCalled()
    })

    it('solveAll still falls back to main thread on a genuine worker failure', async () => {
      const { isWorkerSupported, solveAll: workerSolveAll } = await import('./worker-client')
      const { loadWasm, getWasmApi } = await import('./wasm')

      const mockApi = {
        solveAll: vi.fn().mockReturnValue({ moves: [], solved: true, finalBoard: mockBoard }),
        findNextMove: vi.fn(),
      }
      vi.mocked(isWorkerSupported).mockReturnValue(true)
      vi.mocked(workerSolveAll).mockRejectedValue(new Error('Worker crashed'))
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { solveAll, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await solveAll(mockBoard, mockCandidates, mockGivens)

      expect(result.solved).toBe(true)
      expect(mockApi.solveAll).toHaveBeenCalled()
    })

    it('findNextMove still falls back to main thread on a genuine worker failure', async () => {
      const { isWorkerSupported, findNextMove: workerFindNextMove } =
        await import('./worker-client')
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
      vi.mocked(workerFindNextMove).mockRejectedValue(new Error('Worker crashed'))
      vi.mocked(loadWasm).mockResolvedValue(undefined as never)
      vi.mocked(getWasmApi).mockReturnValue(mockApi as never)

      vi.resetModules()
      const { findNextMove, setWorkerMode } = await import('./solver-service')
      setWorkerMode(true)

      const result = await findNextMove(mockBoard, mockCandidates, mockGivens)

      expect(result.move).toBeNull()
      expect(mockApi.findNextMove).toHaveBeenCalled()
    })
  })
})
