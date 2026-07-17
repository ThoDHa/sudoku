import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleMoveResult,
  createPlayNextMove,
  candidatesToSets,
  candidatesToArrays,
  type MoveHandlerContext,
  type MoveResult,
  type StateSnapshot,
} from './autoSolvePlayback'
import type { Move } from './useSudokuGame'

type MoveWithCount = Move & { userEntryCount?: number }

function buildMove(overrides: Partial<MoveWithCount> = {}): MoveWithCount {
  return {
    step_index: 0,
    technique: 'Naked Single',
    action: 'place',
    digit: 5,
    targets: [{ row: 0, col: 0 }],
    explanation: 'ctx-move',
    refs: { title: 'T', slug: 't', url: '/t' },
    highlights: { primary: [] },
    ...overrides,
  }
}

function buildMoveResult(overrides: Partial<MoveResult> = {}): MoveResult {
  return {
    board: Array(81).fill(0),
    candidates: Array(81)
      .fill(null)
      .map(() => [1, 2, 3]),
    move: buildMove(),
    ...overrides,
  }
}

interface MutableRef<T> {
  current: T
}

interface ContextBundle {
  context: MoveHandlerContext
  refs: {
    autoSolveRef: MutableRef<boolean>
    pausedRef: MutableRef<boolean>
    movesQueueRef: MutableRef<MoveResult[]>
    allMovesRef: MutableRef<MoveResult[]>
    stateHistoryRef: MutableRef<StateSnapshot[]>
    currentIndexRef: MutableRef<number>
    stepDelayRef: MutableRef<number>
  }
  mocks: {
    setCurrentIndex: ReturnType<typeof vi.fn>
    scheduleNextMove: ReturnType<typeof vi.fn>
    stopAutoSolve: ReturnType<typeof vi.fn>
    applyMove: ReturnType<typeof vi.fn>
    getCandidates: ReturnType<typeof vi.fn>
    onError: ReturnType<typeof vi.fn>
    onUnpinpointableError: ReturnType<typeof vi.fn>
    onStatus: ReturnType<typeof vi.fn>
    onErrorFixed: ReturnType<typeof vi.fn>
  }
}

function buildContext(
  overrides: {
    autoSolve?: boolean
    movesQueue?: MoveResult[]
    allMoves?: MoveResult[]
    stateHistory?: StateSnapshot[]
    currentIndex?: number
    stepDelay?: number
    skipSpecialMoves?: boolean
    omitCallbacks?: Array<'onError' | 'onUnpinpointableError' | 'onStatus' | 'onErrorFixed'>
  } = {},
): ContextBundle {
  const initialCandidates: Set<number>[] = Array(81)
    .fill(null)
    .map(() => new Set([7, 8, 9]))
  const fallbackCandidates: Set<number>[] = Array(81)
    .fill(null)
    .map(() => new Set([4, 5, 6]))

  const refs = {
    autoSolveRef: { current: overrides.autoSolve ?? true },
    pausedRef: { current: false },
    movesQueueRef: { current: overrides.movesQueue ?? [] },
    allMovesRef: { current: overrides.allMoves ?? overrides.movesQueue ?? [] },
    stateHistoryRef: { current: overrides.stateHistory ?? ([] as StateSnapshot[]) },
    currentIndexRef: { current: overrides.currentIndex ?? 0 },
    stepDelayRef: { current: overrides.stepDelay ?? 50 },
  }

  const mocks = {
    setCurrentIndex: vi.fn(),
    scheduleNextMove: vi.fn(),
    stopAutoSolve: vi.fn(),
    applyMove: vi.fn(),
    getCandidates: vi.fn(() => fallbackCandidates),
    onError: vi.fn(),
    onUnpinpointableError: vi.fn(),
    onStatus: vi.fn(),
    onErrorFixed: vi.fn(),
  }
  const omit = new Set(overrides.omitCallbacks ?? [])

  const context: MoveHandlerContext = {
    autoSolveRef: refs.autoSolveRef,
    pausedRef: refs.pausedRef,
    movesQueueRef: refs.movesQueueRef,
    allMovesRef: refs.allMovesRef,
    stateHistoryRef: refs.stateHistoryRef,
    currentIndexRef: refs.currentIndexRef,
    setCurrentIndex: mocks.setCurrentIndex,
    scheduleNextMove: mocks.scheduleNextMove,
    stopAutoSolve: mocks.stopAutoSolve,
    stepDelayRef: refs.stepDelayRef,
    applyMove: mocks.applyMove,
    getCandidates: mocks.getCandidates,
    initialCandidates,
    skipSpecialMoves: overrides.skipSpecialMoves ?? false,
  }
  // `omitCallbacks` exercises the absent-callback code paths: leave each key
  // genuinely absent rather than `undefined` (exactOptionalPropertyTypes).
  if (!omit.has('onError')) context.onError = mocks.onError
  if (!omit.has('onUnpinpointableError'))
    context.onUnpinpointableError = mocks.onUnpinpointableError
  if (!omit.has('onStatus')) context.onStatus = mocks.onStatus
  if (!omit.has('onErrorFixed')) context.onErrorFixed = mocks.onErrorFixed

  return { context, refs, mocks }
}

const playNextMoveSpy = vi.fn(async () => {})

describe('autoSolvePlayback', () => {
  beforeEach(() => {
    playNextMoveSpy.mockClear()
    playNextMoveSpy.mockResolvedValue(undefined)
  })

  describe('handleMoveResult - hasMoreMoves / continueOrStop (contradiction)', () => {
    it('routes an empty-queue contradiction to onError + stopAutoSolve and returns true', () => {
      const { context, mocks } = buildContext({
        autoSolve: true,
        movesQueue: [],
        currentIndex: 1,
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'contradiction', explanation: 'CTX' }),
      })

      const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      expect(mocks.onError).toHaveBeenCalledWith(
        'Puzzle has a contradiction that could not be resolved.',
      )
      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
      expect(mocks.scheduleNextMove).not.toHaveBeenCalled()
    })

    it('schedules the next move when contradiction occurs with moves still queued', () => {
      const queued = buildMoveResult()
      const { context, mocks } = buildContext({
        autoSolve: true,
        movesQueue: [queued],
        currentIndex: 1,
      })
      const contradiction = buildMoveResult({
        move: buildMove({ action: 'contradiction', explanation: 'CTX' }),
      })

      const result = handleMoveResult(contradiction, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      expect(mocks.scheduleNextMove).toHaveBeenCalledWith(playNextMoveSpy, 50)
      expect(mocks.onError).not.toHaveBeenCalled()
      expect(mocks.stopAutoSolve).not.toHaveBeenCalled()
    })

    it('treats contradiction as no-more-moves when autoSolveRef is false', () => {
      const { context, mocks } = buildContext({
        autoSolve: false,
        movesQueue: [buildMoveResult()],
        currentIndex: 1,
      })
      const contradiction = buildMoveResult({
        move: buildMove({ action: 'contradiction', explanation: 'CTX' }),
      })

      handleMoveResult(contradiction, 1, context, playNextMoveSpy)

      expect(mocks.onError).toHaveBeenCalledTimes(1)
      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
      expect(mocks.scheduleNextMove).not.toHaveBeenCalled()
    })
  })

  describe("handleMoveResult - 'error' action", () => {
    it('passes the explanation and userEntryCount to onUnpinpointableError', () => {
      const { context, mocks } = buildContext()
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'error', explanation: 'Too many wrong', userEntryCount: 4 }),
      })

      const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      expect(mocks.onUnpinpointableError).toHaveBeenCalledWith('Too many wrong', 4)
      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
    })

    it('uses the default explanation when the move has none and defaults userEntryCount to 0', () => {
      const { context, mocks } = buildContext()
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'error', explanation: '' }),
      })
      delete (moveResult.move as Partial<MoveWithCount>).userEntryCount

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(mocks.onUnpinpointableError).toHaveBeenCalledWith(
        'Too many incorrect entries to fix automatically.',
        0,
      )
    })

    it('does not throw when onUnpinpointableError is not provided', () => {
      const { context, mocks } = buildContext({ omitCallbacks: ['onUnpinpointableError'] })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'error', explanation: 'oops' }),
      })

      expect(() => handleMoveResult(moveResult, 1, context, playNextMoveSpy)).not.toThrow()
      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
    })
  })

  describe("handleMoveResult - 'diagnostic' action", () => {
    it('forwards the provided explanation to onStatus and returns true', () => {
      const { context, mocks } = buildContext({
        movesQueue: [buildMoveResult()],
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'diagnostic', explanation: 'Look closer' }),
      })

      const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      expect(mocks.onStatus).toHaveBeenCalledWith('Look closer')
      expect(mocks.scheduleNextMove).toHaveBeenCalledWith(playNextMoveSpy, 50)
    })

    it("falls back to the default 'Taking another look...' message when explanation is empty", () => {
      const { context, mocks } = buildContext({
        movesQueue: [],
        autoSolve: true,
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'diagnostic', explanation: '' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(mocks.onStatus).toHaveBeenCalledWith('Taking another look...')
    })

    it('does not throw when onStatus is not provided', () => {
      const { context, mocks } = buildContext({
        omitCallbacks: ['onStatus'],
        movesQueue: [buildMoveResult()],
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'diagnostic', explanation: 'x' }),
      })

      expect(() => handleMoveResult(moveResult, 1, context, playNextMoveSpy)).not.toThrow()
      expect(mocks.scheduleNextMove).toHaveBeenCalled()
    })
  })

  describe("handleMoveResult - 'unpinpointable-error' and 'stalled'", () => {
    it('uses the custom explanation for unpinpointable-error when provided', () => {
      const { context, mocks } = buildContext()
      const moveResult = buildMoveResult({
        move: buildMove({
          action: 'unpinpointable-error',
          explanation: 'Custom pinpoint',
          userEntryCount: 3,
        }),
      })

      const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      expect(mocks.onUnpinpointableError).toHaveBeenCalledWith('Custom pinpoint', 3)
    })

    it('renders the templated default for stalled when no explanation is given', () => {
      const { context, mocks } = buildContext()
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'stalled', explanation: '' }),
      })
      delete (moveResult.move as Partial<MoveWithCount>).userEntryCount

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(mocks.onUnpinpointableError).toHaveBeenCalledWith(
        "Couldn't pinpoint the error. Check your 0 entries.",
        0,
      )
    })
  })

  describe("handleMoveResult - 'clear-candidates' action", () => {
    it('applies the move and seeds empty Sets from initialCandidates when no candidates are provided', () => {
      const { context, mocks, refs } = buildContext({
        movesQueue: [],
      })
      const board = Array(81).fill(0)
      board[0] = 7
      const moveResult = buildMoveResult({
        board,
        candidates: null as unknown as MoveResult['candidates'],
        move: buildMove({ action: 'clear-candidates' }),
      })

      const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      expect(mocks.applyMove).toHaveBeenCalledTimes(1)
      const [, candidatesArg] = mocks.applyMove.mock.calls[0]!
      expect(candidatesArg).toHaveLength(81)
      candidatesArg.forEach((set: Set<number>) => {
        expect(set).toBeInstanceOf(Set)
        expect(set.size).toBe(0)
      })
      expect(refs.stateHistoryRef.current).toHaveLength(1)
      const snapshot = refs.stateHistoryRef.current[0]!
      expect(snapshot.board).toEqual(board)
      expect(snapshot.candidates).toEqual([])
    })

    it('maps provided candidate arrays to Sets and stores them in history', () => {
      const { context, mocks, refs } = buildContext()
      const board = Array(81).fill(0)
      board[5] = 9
      const candidates: (number[] | null)[] = Array(81).fill(null)
      candidates[5] = [9]
      candidates[10] = null
      const moveResult = buildMoveResult({
        board,
        candidates,
        move: buildMove({ action: 'clear-candidates' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      const [, candidatesArg] = mocks.applyMove.mock.calls[0]!
      expect(candidatesArg[5]).toBeInstanceOf(Set)
      expect(candidatesArg[5].has(9)).toBe(true)
      expect(candidatesArg[10]).toBeInstanceOf(Set)
      expect(candidatesArg[10].size).toBe(0)
      const snapshot = refs.stateHistoryRef.current[0]!
      expect(snapshot.candidates[5]).toEqual([9])
      expect(snapshot.candidates[10]).toEqual([])
    })
  })

  describe("handleMoveResult - 'fix-error' action", () => {
    it('invokes onErrorFixed with the explanation and a resume callback when more moves remain', () => {
      const queued = buildMoveResult()
      const { context, mocks } = buildContext({
        movesQueue: [queued],
        autoSolve: true,
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'fix-error', explanation: 'Cell R1C1 corrected' }),
      })

      const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      expect(mocks.onErrorFixed).toHaveBeenCalledTimes(1)
      const [msg, resume] = mocks.onErrorFixed.mock.calls[0]!
      expect(msg).toBe('Cell R1C1 corrected')
      expect(typeof resume).toBe('function')
      mocks.scheduleNextMove.mockClear()
      playNextMoveSpy.mockClear()
      resume()
      expect(playNextMoveSpy).toHaveBeenCalledTimes(1)
      expect(mocks.scheduleNextMove).not.toHaveBeenCalled()
    })

    it('uses the default fix-error message when explanation is empty', () => {
      const { context, mocks } = buildContext({ movesQueue: [buildMoveResult()] })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'fix-error', explanation: '' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      const [msg] = mocks.onErrorFixed.mock.calls[0]!
      expect(msg).toBe('Found and fixed an error in your entries.')
    })

    it('the resume callback stops auto-solve when no moves remain', () => {
      const { context, mocks } = buildContext({ movesQueue: [], autoSolve: true })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'fix-error', explanation: 'Fixed' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)
      const resume = mocks.onErrorFixed.mock.calls[0]![1] as () => void
      mocks.stopAutoSolve.mockClear()
      resume()
      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
    })

    it('falls back to continueOrStop when onErrorFixed is not provided', () => {
      const { context, mocks } = buildContext({
        omitCallbacks: ['onErrorFixed'],
        movesQueue: [buildMoveResult()],
        autoSolve: true,
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'fix-error', explanation: 'Fixed' }),
      })

      expect(() => handleMoveResult(moveResult, 1, context, playNextMoveSpy)).not.toThrow()
      expect(mocks.scheduleNextMove).toHaveBeenCalledWith(playNextMoveSpy, 50)
    })

    it('records the fix-error board and candidate arrays in history when candidates are absent', () => {
      const { refs, context, mocks } = buildContext({
        movesQueue: [buildMoveResult()],
      })
      const board = Array(81).fill(0)
      board[3] = 2
      const moveResult = buildMoveResult({
        board,
        candidates: null as unknown as MoveResult['candidates'],
        move: buildMove({ action: 'fix-error' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      const [, candidatesArg] = mocks.applyMove.mock.calls[0]!
      candidatesArg.forEach((set: Set<number>) => {
        expect(set).toBeInstanceOf(Set)
      })
      const snapshot = refs.stateHistoryRef.current[0]!
      expect(snapshot.board).toEqual(board)
      expect(snapshot.candidates).toHaveLength(81)
      expect(snapshot.candidates[0]).toEqual([4, 5, 6])
    })
  })

  describe('handleMoveResult - default (regular move)', () => {
    it('uses the moveResult candidates when present, converting arrays to Sets', () => {
      const { context, mocks, refs } = buildContext({
        movesQueue: [buildMoveResult()],
      })
      const board = Array(81).fill(0)
      board[0] = 1
      const candidates: (number[] | null)[] = Array(81).fill(null)
      candidates[0] = [1, 2]
      candidates[1] = null
      const moveResult = buildMoveResult({
        board,
        candidates,
        move: buildMove({ action: 'place' }),
      })

      const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      const [, candidatesArg] = mocks.applyMove.mock.calls[0]!
      expect(candidatesArg[0]).toBeInstanceOf(Set)
      expect(Array.from(candidatesArg[0] as Set<number>).sort()).toEqual([1, 2])
      expect(candidatesArg[1]).toBeInstanceOf(Set)
      expect(candidatesArg[1].size).toBe(0)
      const snapshot = refs.stateHistoryRef.current[0]!
      expect(snapshot.board).toEqual(board)
      expect(snapshot.candidates[0]).toEqual([1, 2])
      expect(snapshot.candidates[1]).toEqual([])
    })

    it('falls back to provided candidate Sets when moveResult.candidates is absent', () => {
      const { context, mocks } = buildContext({
        movesQueue: [buildMoveResult()],
      })
      const moveResult = buildMoveResult({
        candidates: null as unknown as MoveResult['candidates'],
        move: buildMove({ action: 'place' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      const [, candidatesArg] = mocks.applyMove.mock.calls[0]!
      candidatesArg.forEach((set: Set<number>) => {
        expect(set).toBeInstanceOf(Set)
        expect(Array.from(set).sort()).toEqual([7, 8, 9])
      })
    })
  })

  describe('handleMoveResult - skipSpecialMoves path', () => {
    it('skips a contradiction move when skipSpecialMoves is true and continues the queue', () => {
      const { context, mocks } = buildContext({
        skipSpecialMoves: true,
        movesQueue: [buildMoveResult()],
        autoSolve: true,
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'contradiction', explanation: 'CTX' }),
      })

      const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(result).toBe(true)
      expect(mocks.onError).not.toHaveBeenCalled()
      expect(mocks.scheduleNextMove).toHaveBeenCalledWith(playNextMoveSpy, 50)
      expect(mocks.stopAutoSolve).not.toHaveBeenCalled()
    })

    it('skips each declared special action under skipSpecialMoves=true', () => {
      const specialActions = [
        'contradiction',
        'error',
        'diagnostic',
        'unpinpointable-error',
        'stalled',
      ]
      for (const action of specialActions) {
        const { context, mocks } = buildContext({
          skipSpecialMoves: true,
          movesQueue: [buildMoveResult()],
          autoSolve: true,
        })
        const moveResult = buildMoveResult({
          move: buildMove({ action } as Partial<Move>),
        })

        const result = handleMoveResult(moveResult, 1, context, playNextMoveSpy)

        expect(result).toBe(true)
        expect(mocks.applyMove).not.toHaveBeenCalled()
        expect(mocks.onError).not.toHaveBeenCalled()
        expect(mocks.onStatus).not.toHaveBeenCalled()
        expect(mocks.onUnpinpointableError).not.toHaveBeenCalled()
        expect(mocks.onErrorFixed).not.toHaveBeenCalled()
        expect(mocks.scheduleNextMove).toHaveBeenCalled()
      }
    })

    it('does NOT skip clear-candidates even under skipSpecialMoves=true (not in special list)', () => {
      const { context, mocks } = buildContext({
        skipSpecialMoves: true,
        movesQueue: [buildMoveResult()],
        autoSolve: true,
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'clear-candidates' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(mocks.applyMove).toHaveBeenCalledTimes(1)
    })
  })

  describe('createPlayNextMove guards', () => {
    it('calls stopAutoSolve and shifts nothing when autoSolveRef is false', async () => {
      const { context, refs, mocks } = buildContext({
        autoSolve: false,
        movesQueue: [buildMoveResult()],
      })
      const play = createPlayNextMove(context)

      await play()

      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
      expect(mocks.applyMove).not.toHaveBeenCalled()
      expect(refs.movesQueueRef.current).toHaveLength(1)
    })

    it('shifts nothing and does not stop when pausedRef is true', async () => {
      const { context, refs, mocks } = buildContext({
        movesQueue: [buildMoveResult()],
      })
      refs.pausedRef.current = true
      const play = createPlayNextMove(context)

      await play()

      expect(mocks.stopAutoSolve).not.toHaveBeenCalled()
      expect(mocks.applyMove).not.toHaveBeenCalled()
      expect(refs.movesQueueRef.current).toHaveLength(1)
    })

    it('calls stopAutoSolve when the moves queue is empty', async () => {
      const { context, mocks } = buildContext({
        movesQueue: [],
      })
      const play = createPlayNextMove(context)

      await play()

      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
      expect(mocks.applyMove).not.toHaveBeenCalled()
    })

    it('shifts a move and delegates to handleMoveResult when guard conditions pass', async () => {
      const queued = buildMoveResult()
      const { context, refs, mocks } = buildContext({
        movesQueue: [queued],
        allMoves: [queued],
        autoSolve: true,
      })
      refs.currentIndexRef.current = 0
      refs.allMovesRef.current = [queued]
      const play = createPlayNextMove(context)

      await play()

      expect(refs.movesQueueRef.current).toHaveLength(0)
      expect(mocks.applyMove).toHaveBeenCalledTimes(1)
      expect(mocks.setCurrentIndex).toHaveBeenCalledWith(1)
      expect(refs.currentIndexRef.current).toBe(1)
    })
  })

  describe('candidatesToSets / candidatesToArrays', () => {
    it('converts a mixed candidates array into Sets treating null as empty', () => {
      const input: (number[] | null)[] = [null, [1, 2], []]
      const sets = candidatesToSets(input)
      expect(sets).toHaveLength(3)
      expect(sets[0]).toBeInstanceOf(Set)
      expect(sets[0]!.size).toBe(0)
      expect(sets[1]).toBeInstanceOf(Set)
      expect(Array.from(sets[1]!).sort()).toEqual([1, 2])
      expect(sets[2]!.size).toBe(0)
    })

    it('converts Sets back to sorted arrays', () => {
      const arrs = candidatesToArrays([new Set([3, 1, 2]), new Set<number>()])
      expect(arrs).toHaveLength(2)
      expect(arrs[0]).toHaveLength(3)
      expect(arrs[1]).toHaveLength(0)
    })
  })

  describe('continueOrStop - empty queue stops instead of scheduling', () => {
    it('calls stopAutoSolve (not scheduleNextMove) when no moves remain after a regular move', () => {
      const { context, mocks } = buildContext({ autoSolve: true, movesQueue: [], currentIndex: 1 })
      const moveResult = buildMoveResult({ move: buildMove({ action: 'place' }) })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
      expect(mocks.scheduleNextMove).not.toHaveBeenCalled()
    })

    it('schedules the next move when more moves remain after a regular move', () => {
      const { context, mocks } = buildContext({
        autoSolve: true,
        movesQueue: [buildMoveResult()],
        currentIndex: 1,
      })
      const moveResult = buildMoveResult({ move: buildMove({ action: 'place' }) })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      expect(mocks.scheduleNextMove).toHaveBeenCalledWith(playNextMoveSpy, 50)
      expect(mocks.stopAutoSolve).not.toHaveBeenCalled()
    })
  })

  describe('applyRegularMove - history snapshot candidates fallback', () => {
    it('stores materialized candidate arrays (not undefined) when moveResult.candidates is absent', () => {
      const { refs, context } = buildContext({ movesQueue: [] })
      const fallbackSets = context.initialCandidates
      const moveResult = buildMoveResult({
        candidates: null as unknown as MoveResult['candidates'],
        move: buildMove({ action: 'place' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      const snapshot = refs.stateHistoryRef.current[0]!
      expect(snapshot.candidates).toHaveLength(81)
      snapshot.candidates.forEach((arr, i) => {
        expect(Array.isArray(arr)).toBe(true)
        expect(arr!.slice().sort()).toEqual(Array.from(fallbackSets[i]!).sort())
      })
    })
  })

  describe('optional-callback safety for terminal actions', () => {
    it('does not throw when contradiction ends playback and onError is not provided', () => {
      const { context, mocks } = buildContext({
        omitCallbacks: ['onError'],
        autoSolve: true,
        movesQueue: [],
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'contradiction', explanation: 'CTX' }),
      })

      expect(() => handleMoveResult(moveResult, 1, context, playNextMoveSpy)).not.toThrow()
      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
    })

    it('does not throw when stalled ends playback and onUnpinpointableError is not provided', () => {
      const { context, mocks } = buildContext({
        omitCallbacks: ['onUnpinpointableError'],
        autoSolve: true,
        movesQueue: [],
      })
      const moveResult = buildMoveResult({
        move: buildMove({ action: 'stalled', explanation: '' }),
      })

      expect(() => handleMoveResult(moveResult, 1, context, playNextMoveSpy)).not.toThrow()
      expect(mocks.stopAutoSolve).toHaveBeenCalledTimes(1)
    })
  })

  describe('fix-error - candidate materialization (applyMove + history)', () => {
    it('builds Sets from non-null candidate entries and empty Sets from null entries', () => {
      const { context, mocks } = buildContext({ movesQueue: [buildMoveResult()] })
      const candidates: (number[] | null)[] = Array(81).fill(null)
      candidates[0] = [1, 2, 3]
      candidates[1] = null
      const moveResult = buildMoveResult({
        candidates,
        move: buildMove({ action: 'fix-error', explanation: 'Fixed R1C1' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      const [, candidatesArg] = mocks.applyMove.mock.calls[0]!
      expect(candidatesArg[0]).toBeInstanceOf(Set)
      expect(Array.from(candidatesArg[0] as Set<number>).sort()).toEqual([1, 2, 3])
      expect(candidatesArg[1]).toBeInstanceOf(Set)
      expect((candidatesArg[1] as Set<number>).size).toBe(0)
    })

    it('records the spread candidate arrays verbatim in the history snapshot', () => {
      const { refs, context } = buildContext({ movesQueue: [buildMoveResult()] })
      const candidates: (number[] | null)[] = Array(81).fill(null)
      candidates[5] = [7, 8]
      candidates[6] = null
      const moveResult = buildMoveResult({
        candidates,
        move: buildMove({ action: 'fix-error', explanation: 'Fixed' }),
      })

      handleMoveResult(moveResult, 1, context, playNextMoveSpy)

      const snapshot = refs.stateHistoryRef.current[0]!
      expect(snapshot.candidates[5]).toEqual([7, 8])
      expect(snapshot.candidates[6]).toEqual([])
    })
  })
})
