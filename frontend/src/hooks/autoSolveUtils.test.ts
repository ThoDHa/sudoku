import { describe, it, expect, vi } from 'vitest'
import {
  convertCandidates,
  serializeCandidates,
  createStateSnapshot,
  handleContradiction,
  handleError,
  handleDiagnostic,
  handleUnpinpointableError,
  handleClearCandidates,
  handleFixError,
  handleRegularMove,
  dispatchMoveAction,
  type ActionContext,
  type MoveResult,
} from './autoSolveUtils'

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Create a mock ActionContext for testing action handlers
 */
const createMockContext = (overrides?: Partial<ActionContext>): ActionContext => ({
  moveResult: {
    board: Array(81).fill(0),
    candidates: Array(81).fill(null).map(() => [1, 2, 3]),
    move: {
      step_index: 0,
      technique: 'Test Technique',
      action: 'place',
      digit: 5,
      targets: [{ row: 0, col: 0 }],
      explanation: 'Test explanation',
      refs: { title: 'Test', slug: 'test', url: '/test' },
      highlights: { primary: [] },
    },
  },
  newIndex: 1,
  getCandidates: () => Array(81).fill(null).map(() => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])),
  applyMove: vi.fn(),
  addToHistory: vi.fn(),
  hasMoreMoves: () => true,
  isActive: () => true,
  onError: undefined,
  onUnpinpointableError: undefined,
  onStatus: undefined,
  onErrorFixed: undefined,
  playNextMove: vi.fn(),
  ...overrides,
})

/**
 * Create a mock MoveResult for testing
 */
const createMockMoveResult = (overrides?: Partial<MoveResult>): MoveResult => ({
  board: Array(81).fill(0),
  candidates: Array(81).fill(null).map(() => [1, 2, 3]),
  move: {
    step_index: 0,
    technique: 'Test Technique',
    action: 'place',
    digit: 5,
    targets: [{ row: 0, col: 0 }],
    explanation: 'Test explanation',
    refs: { title: 'Test', slug: 'test', url: '/test' },
    highlights: { primary: [] },
  },
  ...overrides,
})

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe('autoSolveUtils', () => {
  // ===========================================================================
  // convertCandidates tests
  // ===========================================================================
  describe('convertCandidates', () => {
    it('converts number[][] to Set<number>[]', () => {
      const input: (number[] | null)[] = [[1, 2, 3], [4, 5], [6, 7, 8, 9]]
      const fallback = [new Set<number>()]
      
      const result = convertCandidates(input, fallback)
      
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual(new Set([1, 2, 3]))
      expect(result[1]).toEqual(new Set([4, 5]))
      expect(result[2]).toEqual(new Set([6, 7, 8, 9]))
    })

    it('handles null entries as empty sets', () => {
      const input: (number[] | null)[] = [[1, 2], null, [3, 4]]
      const fallback = [new Set<number>()]
      
      const result = convertCandidates(input, fallback)
      
      expect(result[1]).toEqual(new Set())
    })

    it('returns fallback when candidates is undefined', () => {
      const fallback = [new Set([1, 2, 3])]
      
      const result = convertCandidates(undefined, fallback)
      
      expect(result).toBe(fallback)
    })

    it('handles empty arrays', () => {
      const input: (number[] | null)[] = [[], [], []]
      const fallback = [new Set<number>()]
      
      const result = convertCandidates(input, fallback)
      
      expect(result[0]).toEqual(new Set())
      expect(result[1]).toEqual(new Set())
      expect(result[2]).toEqual(new Set())
    })
  })

  // ===========================================================================
  // serializeCandidates tests
  // ===========================================================================
  describe('serializeCandidates', () => {
    it('serializes (number[] | null)[] to number[][]', () => {
      const input: (number[] | null)[] = [[1, 2, 3], [4, 5], [6]]
      const fallback = [new Set<number>()]
      
      const result = serializeCandidates(input, fallback)
      
      expect(result).toEqual([[1, 2, 3], [4, 5], [6]])
    })

    it('handles null entries as empty arrays', () => {
      const input: (number[] | null)[] = [[1, 2], null, [3]]
      const fallback = [new Set<number>()]
      
      const result = serializeCandidates(input, fallback)
      
      expect(result[1]).toEqual([])
    })

    it('uses fallback when candidates is undefined', () => {
      const fallback = [new Set([1, 2, 3]), new Set([4, 5])]
      
      const result = serializeCandidates(undefined, fallback)
      
      expect(result).toEqual([[1, 2, 3], [4, 5]])
    })

    it('creates independent copy of arrays', () => {
      const original = [1, 2, 3]
      const input: (number[] | null)[] = [original]
      const fallback = [new Set<number>()]
      
      const result = serializeCandidates(input, fallback)
      
      // Modify original
      original.push(4)
      
      // Result should not be affected
      expect(result[0]).toEqual([1, 2, 3])
    })
  })

  // ===========================================================================
  // createStateSnapshot tests
  // ===========================================================================
  describe('createStateSnapshot', () => {
    it('creates a snapshot with all required fields', () => {
      const board = [1, 2, 3, 0, 0, 0, 0, 0, 0]
      const candidates: (number[] | null)[] = [[4, 5], [6, 7], null]
      const move = {
        step_index: 0,
        technique: 'Test',
        action: 'place' as const,
        digit: 5,
        targets: [{ row: 0, col: 0 }],
        explanation: 'Test',
        refs: { title: '', slug: '', url: '' },
        highlights: { primary: [] },
      }
      const fallback = [new Set<number>()]
      
      const result = createStateSnapshot(board, candidates, move, fallback)
      
      expect(result.board).toEqual([1, 2, 3, 0, 0, 0, 0, 0, 0])
      expect(result.candidates).toEqual([[4, 5], [6, 7], []])
      expect(result.move).toBe(move)
    })

    it('creates independent copy of board', () => {
      const board = [1, 2, 3]
      const candidates: (number[] | null)[] = []
      const fallback = [new Set<number>()]
      
      const result = createStateSnapshot(board, candidates, null, fallback)
      
      // Modify original
      board[0] = 9
      
      // Result should not be affected
      expect(result.board[0]).toBe(1)
    })

    it('handles null move', () => {
      const board = [0, 0, 0]
      const candidates: (number[] | null)[] = [[1, 2, 3]]
      const fallback = [new Set<number>()]
      
      const result = createStateSnapshot(board, candidates, null, fallback)
      
      expect(result.move).toBeNull()
    })

    it('uses fallback when candidates is undefined', () => {
      const board = [0, 0, 0]
      const fallback = [new Set([1, 2]), new Set([3, 4])]
      
      const result = createStateSnapshot(board, undefined, null, fallback)
      
      expect(result.candidates).toEqual([[1, 2], [3, 4]])
    })
  })

  // ===========================================================================
  // handleContradiction tests
  // ===========================================================================
  describe('handleContradiction', () => {
    it('returns skip when more moves are available and is active', () => {
      const ctx = createMockContext({
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      
      const result = handleContradiction(ctx)
      
      expect(result).toEqual({ type: 'skip' })
    })

    it('returns stop with error when no more moves', () => {
      const ctx = createMockContext({
        hasMoreMoves: () => false,
        isActive: () => true,
      })
      
      const result = handleContradiction(ctx)
      
      expect(result.type).toBe('stop')
      expect(result).toHaveProperty('error')
    })

    it('returns stop with error when not active', () => {
      const ctx = createMockContext({
        hasMoreMoves: () => true,
        isActive: () => false,
      })
      
      const result = handleContradiction(ctx)
      
      expect(result.type).toBe('stop')
    })
  })

  // ===========================================================================
  // handleError tests
  // ===========================================================================
  describe('handleError', () => {
    it('calls onUnpinpointableError with explanation', () => {
      const onUnpinpointableError = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Error',
            action: 'error',
            digit: 0,
            targets: [],
            explanation: 'Too many errors found',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
            userEntryCount: 5,
          },
        }),
        onUnpinpointableError,
      })
      
      const result = handleError(ctx)
      
      expect(result).toEqual({ type: 'stop' })
      expect(onUnpinpointableError).toHaveBeenCalledWith('Too many errors found', 5)
    })

    it('uses default message when no explanation', () => {
      const onUnpinpointableError = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Error',
            action: 'error',
            digit: 0,
            targets: [],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        onUnpinpointableError,
      })
      
      handleError(ctx)
      
      expect(onUnpinpointableError).toHaveBeenCalledWith(
        'Too many incorrect entries to fix automatically.',
        0
      )
    })
  })

  // ===========================================================================
  // handleDiagnostic tests
  // ===========================================================================
  describe('handleDiagnostic', () => {
    it('calls onStatus with explanation', () => {
      const onStatus = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Diagnostic',
            action: 'diagnostic',
            digit: 0,
            targets: [],
            explanation: 'Checking for errors...',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        onStatus,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      
      const result = handleDiagnostic(ctx)
      
      expect(onStatus).toHaveBeenCalledWith('Checking for errors...')
      expect(result).toEqual({ type: 'skip' })
    })

    it('returns stop when no more moves', () => {
      const ctx = createMockContext({
        hasMoreMoves: () => false,
        isActive: () => true,
      })
      
      const result = handleDiagnostic(ctx)
      
      expect(result).toEqual({ type: 'stop' })
    })

    it('uses default message when no explanation', () => {
      const onStatus = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Diagnostic',
            action: 'diagnostic',
            digit: 0,
            targets: [],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        onStatus,
      })
      
      handleDiagnostic(ctx)
      
      expect(onStatus).toHaveBeenCalledWith('Taking another look...')
    })
  })

  // ===========================================================================
  // handleUnpinpointableError tests
  // ===========================================================================
  describe('handleUnpinpointableError', () => {
    it('calls onUnpinpointableError with explanation and user entry count', () => {
      const onUnpinpointableError = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Error',
            action: 'unpinpointable-error',
            digit: 0,
            targets: [],
            explanation: 'Cannot find the error',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
            userEntryCount: 10,
          },
        }),
        onUnpinpointableError,
      })
      
      const result = handleUnpinpointableError(ctx)
      
      expect(result).toEqual({ type: 'stop' })
      expect(onUnpinpointableError).toHaveBeenCalledWith('Cannot find the error', 10)
    })

    it('uses default message with user entry count when no explanation', () => {
      const onUnpinpointableError = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Error',
            action: 'unpinpointable-error',
            digit: 0,
            targets: [],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
            userEntryCount: 3,
          },
        }),
        onUnpinpointableError,
      })
      
      handleUnpinpointableError(ctx)
      
      expect(onUnpinpointableError).toHaveBeenCalledWith(
        "Couldn't pinpoint the error. Check your 3 entries.",
        3
      )
    })
  })

  // ===========================================================================
  // handleClearCandidates tests
  // ===========================================================================
  describe('handleClearCandidates', () => {
    it('calls applyMove and addToHistory', () => {
      const applyMove = vi.fn()
      const addToHistory = vi.fn()
      const ctx = createMockContext({
        applyMove,
        addToHistory,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      
      const result = handleClearCandidates(ctx)
      
      expect(applyMove).toHaveBeenCalled()
      expect(addToHistory).toHaveBeenCalled()
      expect(result).toEqual({ type: 'continue' })
    })

    it('returns stop when no more moves', () => {
      const ctx = createMockContext({
        hasMoreMoves: () => false,
        isActive: () => true,
      })
      
      const result = handleClearCandidates(ctx)
      
      expect(result).toEqual({ type: 'stop' })
    })
  })

  // ===========================================================================
  // handleFixError tests
  // ===========================================================================
  describe('handleFixError', () => {
    it('calls applyMove and addToHistory', () => {
      const applyMove = vi.fn()
      const addToHistory = vi.fn()
      const ctx = createMockContext({
        applyMove,
        addToHistory,
        onErrorFixed: undefined,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      
      const result = handleFixError(ctx)
      
      expect(applyMove).toHaveBeenCalled()
      expect(addToHistory).toHaveBeenCalled()
      expect(result).toEqual({ type: 'continue' })
    })

    it('returns pause with resume callback when onErrorFixed is provided', () => {
      const onErrorFixed = vi.fn()
      const ctx = createMockContext({
        onErrorFixed,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      
      const result = handleFixError(ctx)
      
      expect(result.type).toBe('pause')
      expect(result).toHaveProperty('resumeCallback')
    })

    it('resume callback calls playNextMove when active with more moves', () => {
      const playNextMove = vi.fn()
      const ctx = createMockContext({
        onErrorFixed: vi.fn(),
        playNextMove,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      
      const result = handleFixError(ctx)
      
      if (result.type === 'pause') {
        result.resumeCallback()
        expect(playNextMove).toHaveBeenCalled()
      }
    })

    it('returns stop when no more moves and no onErrorFixed', () => {
      const ctx = createMockContext({
        onErrorFixed: undefined,
        hasMoreMoves: () => false,
        isActive: () => true,
      })
      
      const result = handleFixError(ctx)
      
      expect(result).toEqual({ type: 'stop' })
    })
  })

  // ===========================================================================
  // handleRegularMove tests
  // ===========================================================================
  describe('handleRegularMove', () => {
    it('calls applyMove with converted candidates', () => {
      const applyMove = vi.fn()
      const addToHistory = vi.fn()
      const ctx = createMockContext({
        applyMove,
        addToHistory,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      const fallback = Array(81).fill(null).map(() => new Set([1, 2, 3]))
      
      const result = handleRegularMove(ctx, fallback)
      
      expect(applyMove).toHaveBeenCalled()
      expect(addToHistory).toHaveBeenCalled()
      expect(result).toEqual({ type: 'continue' })
    })

    it('returns stop when no more moves', () => {
      const ctx = createMockContext({
        hasMoreMoves: () => false,
        isActive: () => true,
      })
      const fallback = [new Set<number>()]
      
      const result = handleRegularMove(ctx, fallback)
      
      expect(result).toEqual({ type: 'stop' })
    })

    it('returns stop when not active', () => {
      const ctx = createMockContext({
        hasMoreMoves: () => true,
        isActive: () => false,
      })
      const fallback = [new Set<number>()]
      
      const result = handleRegularMove(ctx, fallback)
      
      expect(result).toEqual({ type: 'stop' })
    })
  })

  // ===========================================================================
  // dispatchMoveAction tests
  // ===========================================================================
  describe('dispatchMoveAction', () => {
    it('dispatches to handleContradiction for contradiction action', () => {
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Contradiction',
            action: 'contradiction',
            digit: 0,
            targets: [],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        hasMoreMoves: () => false,
      })
      const fallback = [new Set<number>()]
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result.type).toBe('stop')
      expect(result).toHaveProperty('error')
    })

    it('dispatches to handleError for error action', () => {
      const onUnpinpointableError = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Error',
            action: 'error',
            digit: 0,
            targets: [],
            explanation: 'Test error',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        onUnpinpointableError,
      })
      const fallback = [new Set<number>()]
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result).toEqual({ type: 'stop' })
      expect(onUnpinpointableError).toHaveBeenCalled()
    })

    it('dispatches to handleDiagnostic for diagnostic action', () => {
      const onStatus = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Diagnostic',
            action: 'diagnostic',
            digit: 0,
            targets: [],
            explanation: 'Status message',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        onStatus,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      const fallback = [new Set<number>()]
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result).toEqual({ type: 'skip' })
      expect(onStatus).toHaveBeenCalled()
    })

    it('dispatches to handleUnpinpointableError for unpinpointable-error action', () => {
      const onUnpinpointableError = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Error',
            action: 'unpinpointable-error',
            digit: 0,
            targets: [],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        onUnpinpointableError,
      })
      const fallback = [new Set<number>()]
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result).toEqual({ type: 'stop' })
    })

    it('dispatches to handleUnpinpointableError for stalled action', () => {
      const onUnpinpointableError = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Stalled',
            action: 'stalled',
            digit: 0,
            targets: [],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        onUnpinpointableError,
      })
      const fallback = [new Set<number>()]
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result).toEqual({ type: 'stop' })
    })

    it('dispatches to handleClearCandidates for clear-candidates action', () => {
      const applyMove = vi.fn()
      const addToHistory = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Clear',
            action: 'clear-candidates',
            digit: 0,
            targets: [],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        applyMove,
        addToHistory,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      const fallback = [new Set<number>()]
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result).toEqual({ type: 'continue' })
      expect(applyMove).toHaveBeenCalled()
    })

    it('dispatches to handleFixError for fix-error action', () => {
      const applyMove = vi.fn()
      const addToHistory = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Fix',
            action: 'fix-error',
            digit: 5,
            targets: [{ row: 0, col: 0 }],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        applyMove,
        addToHistory,
        onErrorFixed: undefined,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      const fallback = [new Set<number>()]
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result).toEqual({ type: 'continue' })
    })

    it('dispatches to handleRegularMove for place action', () => {
      const applyMove = vi.fn()
      const addToHistory = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Naked Single',
            action: 'place',
            digit: 5,
            targets: [{ row: 0, col: 0 }],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
          },
        }),
        applyMove,
        addToHistory,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      const fallback = Array(81).fill(null).map(() => new Set([1, 2, 3]))
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result).toEqual({ type: 'continue' })
      expect(applyMove).toHaveBeenCalled()
    })

    it('dispatches to handleRegularMove for eliminate action', () => {
      const applyMove = vi.fn()
      const ctx = createMockContext({
        moveResult: createMockMoveResult({
          move: {
            step_index: 0,
            technique: 'Pointing Pairs',
            action: 'eliminate',
            digit: 5,
            targets: [],
            explanation: '',
            refs: { title: '', slug: '', url: '' },
            highlights: { primary: [] },
            eliminations: [{ row: 0, col: 1, digit: 5 }],
          },
        }),
        applyMove,
        hasMoreMoves: () => true,
        isActive: () => true,
      })
      const fallback = [new Set<number>()]
      
      const result = dispatchMoveAction(ctx, fallback)
      
      expect(result).toEqual({ type: 'continue' })
    })
  })
})
