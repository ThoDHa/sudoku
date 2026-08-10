import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, afterAll, type Mock } from 'vitest'

// =============================================================================
// MODULE MOCKS
// All persistence collaborators are mocked so the hook's own branches can be
// driven deterministically without pulling in seed format, storage migration,
// or autosave-pref logic under test.
// =============================================================================

vi.mock('../lib/autoSaveGuard', () => ({
  shouldSuppressAutoSave: vi.fn(() => false),
}))
vi.mock('../lib/autoSaveSeedGuard', () => ({
  shouldAllowStaleSave: vi.fn(() => true),
}))
vi.mock('../lib/gameSettings', () => ({
  getAutoSaveEnabled: vi.fn(() => true),
  clearOtherGamesForMode: vi.fn(),
}))
vi.mock('../lib/seedValidation', () => ({
  validateSeed: vi.fn((s: string) => ({ valid: true, seed: s })),
  extractSeedFromStorageKey: vi.fn(() => ({ valid: true, seed: 'seed1' })),
}))
vi.mock('../lib/savedGameState', () => ({
  buildSavedState: vi.fn((x: unknown) => ({ ...(x as Record<string, unknown>) })),
}))
vi.mock('../lib/candidatesUtils', () => ({
  candidatesToArrays: vi.fn(() => []),
}))
vi.mock('../lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

// Mocked modules must be imported AFTER vi.mock so the resolved instances point
// at the mocked implementations.
import { useGamePersistence, type UseGamePersistenceOptions } from './useGamePersistence'
import type { PuzzleData } from './usePuzzleLoader'
import { shouldSuppressAutoSave } from '../lib/autoSaveGuard'
import { shouldAllowStaleSave } from '../lib/autoSaveSeedGuard'
import { getAutoSaveEnabled, clearOtherGamesForMode } from '../lib/gameSettings'
import { validateSeed, extractSeedFromStorageKey } from '../lib/seedValidation'
import { buildSavedState } from '../lib/savedGameState'
import { candidatesToArrays } from '../lib/candidatesUtils'
import { logger } from '../lib/logger'
import { STORAGE_KEYS } from '../lib/constants'

// =============================================================================
// CONSTANTS & FIXTURES
// =============================================================================

const STORAGE_KEY = `${STORAGE_KEYS.GAME_STATE_PREFIX}seed1`
const OTHER_STORAGE_KEY = `${STORAGE_KEYS.GAME_STATE_PREFIX}seed2`
// requestIdleCallback is stubbed as a delayed setTimeout so the debounce timer
// (500ms) can fire and leave the idle callback pending, letting cleanup tests
// observe cancellation before the idle callback resolves.
const IDLE_CALLBACK_DELAY_MS = 50

function makePuzzle(seed = 'seed1'): PuzzleData {
  return { puzzle_id: 'pid', seed, difficulty: 'easy', givens: [], solution: [] }
}

interface OptionsOverrides {
  puzzle?: PuzzleData | null
  isComplete?: boolean
  board?: number[]
  shouldPauseOperations?: boolean
  isHidden?: boolean
  autoFillUsed?: boolean
  hintsUsed?: number
  techniqueHintsUsed?: number
  restored?: boolean
}

function makeOptions(overrides: OptionsOverrides = {}): UseGamePersistenceOptions {
  const puzzle = overrides.puzzle === undefined ? makePuzzle() : overrides.puzzle
  const board = overrides.board ?? Array(81).fill(0)
  const game = {
    board,
    candidates: new Uint16Array(81),
    candidatesVersion: 0,
    history: [],
    historyIndex: 0,
    canUndo: false,
    canRedo: false,
    isComplete: overrides.isComplete ?? false,
    digitCounts: Array(10).fill(0),
  } as unknown as UseGamePersistenceOptions['game']
  const timerControl = {
    getElapsedMs: () => 0,
  } as unknown as UseGamePersistenceOptions['timerControl']
  const backgroundManager = {
    shouldPauseOperations: overrides.shouldPauseOperations ?? false,
    isHidden: overrides.isHidden ?? false,
  } as unknown as UseGamePersistenceOptions['backgroundManager']
  return {
    puzzle,
    game,
    timerControl,
    backgroundManager,
    autoFillUsed: overrides.autoFillUsed ?? false,
    hintsUsed: overrides.hintsUsed ?? 0,
    techniqueHintsUsed: overrides.techniqueHintsUsed ?? 0,
    hasRestoredSavedState: { current: overrides.restored ?? true },
  }
}

// The buildSavedState mock spreads its input straight through, so the persisted
// JSON is exactly the argument the hook assembled. That lets every save site be
// asserted as a whole payload rather than a handful of cherry-picked keys.
function expectedPayload(overrides: Record<string, unknown> = {}) {
  return {
    board: Array(81).fill(0),
    candidates: [],
    elapsedMs: 0,
    history: [],
    autoFillUsed: false,
    difficulty: 'easy',
    isComplete: false,
    hintsUsed: 0,
    techniqueHintsUsed: 0,
    ...overrides,
  }
}

// The corruption log reports the observed array lengths so a support report can
// distinguish "wrong length" from "wrong type" without the raw payload.
function corruptionMessage(board: number | undefined, candidates: number | undefined) {
  return `[STORAGE ERROR] Corrupted saved state for seed: seed1 - board: ${board}, candidates: ${candidates}`
}

// The full context object the hook must hand to the auto-save suppression guard.
function expectedSuppressionContext(overrides: Record<string, unknown> = {}) {
  return {
    hasPuzzle: true,
    hasRestoredSavedState: true,
    isComplete: false,
    autoSaveEnabled: true,
    ...overrides,
  }
}

// Holder pattern: renderHook closure reads holder.current, so reassigning and
// calling rerender() flushes the hook with fresh props while preserving the
// hook instance (and its internal refs) across the re-render.
interface Holder {
  current: UseGamePersistenceOptions
}

function renderPersistence(initial: UseGamePersistenceOptions) {
  const holder: Holder = { current: initial }
  const utils = renderHook(() => useGamePersistence(holder.current))
  return {
    ...utils,
    holder,
    rerenderWith(next: UseGamePersistenceOptions) {
      holder.current = next
      act(() => utils.rerender())
    },
  }
}

// =============================================================================
// TEST SUITE
// =============================================================================

// jsdom does not implement requestIdleCallback/cancelIdleCallback. These are
// assigned to window ONCE for the whole suite (beforeAll) so that deferred
// React effect cleanups, which vitest may flush at suite teardown, always find
// a defined cancelIdleCallback even after individual test teardowns run.
// cancelIdleCallback is wired to clearTimeout so the cleanup branch genuinely
// cancels pending idle work scheduled as a delayed setTimeout by the rIC stub.
const idleCallbackMock = vi.fn((cb: () => void) => setTimeout(cb, IDLE_CALLBACK_DELAY_MS))
const cancelIdleCallbackMock = vi.fn((handle: number) => clearTimeout(handle))

describe('useGamePersistence', () => {
  afterAll(() => {
    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
    delete (window as unknown as { cancelIdleCallback?: unknown }).cancelIdleCallback
  })

  beforeEach(() => {
    vi.useFakeTimers()
    // Re-arm the idle globals AFTER useFakeTimers: sinon's fake timers replace
    // window.requestIdleCallback/cancelIdleCallback with their own fakes, which
    // would otherwise intercept the hook's idle scheduling and break the
    // setTimeout-based stub below. Reassigning here lets our stubs win while
    // the rest of the timer surface stays faked.
    ;(window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = idleCallbackMock
    ;(window as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback =
      cancelIdleCallbackMock
    localStorage.clear()
    vi.clearAllMocks()

    // Reset mocked collaborators to their default happy-path returns so each
    // test starts from a known state regardless of overrides in prior tests.
    ;(shouldSuppressAutoSave as Mock).mockReturnValue(false)
    ;(shouldAllowStaleSave as Mock).mockReturnValue(true)
    ;(getAutoSaveEnabled as Mock).mockReturnValue(true)
    ;(validateSeed as Mock).mockImplementation((s: string) => ({
      valid: true,
      seed: s,
      mode: 'practice',
    }))
    ;(extractSeedFromStorageKey as Mock).mockReturnValue({
      valid: true,
      seed: 'seed1',
      mode: 'practice',
    })
    ;(buildSavedState as unknown as Mock).mockImplementation((x: unknown) => ({
      ...(x as Record<string, unknown>),
    }))
    ;(candidatesToArrays as unknown as Mock).mockReturnValue([])
    ;(clearOtherGamesForMode as Mock).mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    // Re-arm the suite-persistent idle globals in case a test deleted
    // requestIdleCallback (the fallback-path tests) and restores only it.
    ;(window as unknown as { requestIdleCallback: unknown }).requestIdleCallback = idleCallbackMock
    ;(window as unknown as { cancelIdleCallback: unknown }).cancelIdleCallback =
      cancelIdleCallbackMock
  })

  // ---------------------------------------------------------------------------
  // restoredAsCompleteRef surface
  // ---------------------------------------------------------------------------
  describe('returned surface', () => {
    it('exposes a mutable restoredAsCompleteRef starting at false', () => {
      const { result } = renderPersistence(makeOptions())
      expect(result.current.restoredAsCompleteRef).toEqual({ current: false })
      act(() => {
        result.current.restoredAsCompleteRef.current = true
      })
      expect(result.current.restoredAsCompleteRef.current).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // saveGameState
  // ---------------------------------------------------------------------------
  describe('saveGameState', () => {
    it('writes the serialized snapshot to localStorage on the happy path', () => {
      const { result } = renderPersistence(makeOptions({ restored: true }))
      act(() => result.current.saveGameState())
      expect(clearOtherGamesForMode).toHaveBeenCalledWith('seed1')
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(expectedPayload())
    })

    it('persists the current tracking counters in the snapshot', () => {
      const { result } = renderPersistence(
        makeOptions({
          restored: true,
          autoFillUsed: true,
          hintsUsed: 4,
          techniqueHintsUsed: 2,
          board: makeBoardWith(3, 9),
        }),
      )
      act(() => result.current.saveGameState())
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(
        expectedPayload({
          board: makeBoardWith(3, 9),
          autoFillUsed: true,
          hintsUsed: 4,
          techniqueHintsUsed: 2,
        }),
      )
    })

    it('is a no-op when there is no puzzle', () => {
      const { result } = renderPersistence(makeOptions({ puzzle: null, restored: true }))
      act(() => result.current.saveGameState())
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('is a no-op before the initial restore has applied (hasRestoredSavedState false)', () => {
      const { result } = renderPersistence(makeOptions({ restored: false }))
      act(() => result.current.saveGameState())
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('logs a warning and swallows a localStorage.setItem failure', () => {
      const { result } = renderPersistence(makeOptions({ restored: true }))
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })
      expect(() => act(() => result.current.saveGameState())).not.toThrow()
      expect(logger.warn).toHaveBeenCalledWith('Failed to save game state:', expect.any(Error))
      spy.mockRestore()
    })

    it('throws when the puzzle seed is invalid (getStorageKey rejects it)', () => {
      ;(validateSeed as Mock).mockReturnValue({ valid: false, seed: 'bad', error: 'bad seed' })
      const { result } = renderPersistence(makeOptions({ restored: true }))
      expect(() => result.current.saveGameState()).toThrow(
        /Cannot create storage key for invalid seed/,
      )
    })
  })

  // ---------------------------------------------------------------------------
  // clearSavedGameState
  // ---------------------------------------------------------------------------
  describe('clearSavedGameState', () => {
    it('removes the stored entry for the current puzzle seed', () => {
      localStorage.setItem(STORAGE_KEY, '{"board":[]}') // seed an entry to remove
      const { result } = renderPersistence(makeOptions())
      act(() => result.current.clearSavedGameState())
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('removes the entry for the seed active at call time, not the seed at mount', () => {
      localStorage.setItem(STORAGE_KEY, '{"board":[]}')
      localStorage.setItem(OTHER_STORAGE_KEY, '{"board":[]}')
      const { result, rerenderWith } = renderPersistence(makeOptions())
      rerenderWith(makeOptions({ puzzle: makePuzzle('seed2') }))
      act(() => result.current.clearSavedGameState())
      expect(localStorage.getItem(OTHER_STORAGE_KEY)).toBeNull()
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    })

    it('is a no-op when there is no puzzle', () => {
      const { result } = renderPersistence(makeOptions({ puzzle: null }))
      const spy = vi.spyOn(Storage.prototype, 'removeItem')
      act(() => result.current.clearSavedGameState())
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    })

    it('logs a warning and swallows a localStorage.removeItem failure', () => {
      const { result } = renderPersistence(makeOptions())
      const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('remove failed')
      })
      expect(() => act(() => result.current.clearSavedGameState())).not.toThrow()
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to clear saved game state:',
        expect.any(Error),
      )
      spy.mockRestore()
    })

    it('propagates the getStorageKey error for an invalid seed', () => {
      ;(validateSeed as Mock).mockReturnValue({ valid: false, seed: 'bad', error: 'bad seed' })
      const { result } = renderPersistence(makeOptions())
      expect(() => result.current.clearSavedGameState()).toThrow(
        /Cannot create storage key for invalid seed/,
      )
    })
  })

  // ---------------------------------------------------------------------------
  // loadSavedGameState
  // ---------------------------------------------------------------------------
  describe('loadSavedGameState', () => {
    function seedStore(value: unknown) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    }

    it('returns null without logging when no entry exists for the seed', () => {
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      // An absent entry is the normal "new game" case, not corruption: it must
      // short-circuit before parsing rather than fall into the corruption log.
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('returns the parsed state when board and candidates are both length 81', () => {
      seedStore({ board: Array(81).fill(0), candidates: Array.from({ length: 81 }, () => []) })
      const { result } = renderPersistence(makeOptions())
      const loaded = result.current.loadSavedGameState('seed1')
      expect(loaded).not.toBeNull()
      expect(loaded!.board).toHaveLength(81)
      expect(loaded!.candidates).toHaveLength(81)
    })

    it('warns and returns null when board length is not 81', () => {
      seedStore({ board: Array(80).fill(0), candidates: Array.from({ length: 81 }, () => []) })
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(corruptionMessage(80, 81))
    })

    it('warns and returns null when candidates length is not 81', () => {
      seedStore({ board: Array(81).fill(0), candidates: Array.from({ length: 80 }, () => []) })
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(corruptionMessage(81, 80))
    })

    it('warns and returns null when board is missing (optional-chaining short-circuit)', () => {
      seedStore({ candidates: Array.from({ length: 81 }, () => []) })
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(corruptionMessage(undefined, 81))
    })

    it('warns and returns null when candidates are missing (optional-chaining short-circuit)', () => {
      seedStore({ board: Array(81).fill(0) })
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(corruptionMessage(81, undefined))
    })

    it('logs an error and returns null when the stored seed fails extraction', () => {
      seedStore({ board: Array(81).fill(0), candidates: Array.from({ length: 81 }, () => []) })
      ;(extractSeedFromStorageKey as Mock).mockReturnValue({
        valid: false,
        seed: '',
        error: 'invalid key',
      })
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Cannot load game'))
    })

    it('logs an error and returns null when JSON.parse throws', () => {
      localStorage.setItem(STORAGE_KEY, '{not valid json')
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load saved game'),
        expect.any(Error),
      )
    })

    it('returns null and logs when the seed is invalid (never throws)', () => {
      ;(validateSeed as Mock).mockReturnValue({ valid: false, seed: 'bad', error: 'bad seed' })
      const { result } = renderPersistence(makeOptions())
      // loadSavedGameState resolves the storage key inside its try/catch, so an
      // invalid seed is swallowed into a null return plus an error log rather
      // than propagating (the declared SavedGameState | null contract).
      expect(result.current.loadSavedGameState('bad')).toBeNull()
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load saved game'),
        expect.any(Error),
      )
    })

    it('warns and returns null when the parsed payload is null', () => {
      localStorage.setItem(STORAGE_KEY, 'null')
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(corruptionMessage(undefined, undefined))
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('warns and returns null when the parsed payload is a primitive (non-object)', () => {
      localStorage.setItem(STORAGE_KEY, '5')
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(corruptionMessage(undefined, undefined))
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('warns and returns null when board contains a non-number element', () => {
      const board: unknown[] = Array(81).fill(0)
      board[80] = 'x'
      seedStore({ board, candidates: Array.from({ length: 81 }, () => []) })
      const { result } = renderPersistence(makeOptions())
      expect(result.current.loadSavedGameState('seed1')).toBeNull()
      expect(logger.warn).toHaveBeenCalledWith(corruptionMessage(81, 81))
    })
  })

  // ---------------------------------------------------------------------------
  // ref-sync effects (isCompleteRef and currentSeedRef)
  // ---------------------------------------------------------------------------
  describe('ref-sync effects', () => {
    it('seeds currentSeedRef with the puzzle seed and tolerates a null puzzle', () => {
      // null-puzzle render exercises the falsy ternary branch of the
      // currentSeedRef sync effect.
      const { result, rerenderWith } = renderPersistence(
        makeOptions({ puzzle: null, restored: true }),
      )
      // With puzzle null, saveGameState bails on the puzzle check; no write.
      act(() => result.current.saveGameState())
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

      // Restoring a puzzle exercises the truthy ternary branch.
      rerenderWith(makeOptions({ puzzle: makePuzzle('seed1'), restored: true }))
      act(() => result.current.saveGameState())
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    })

    it('mirrors game.isComplete into the completion flag read by saveGameState', () => {
      const { result, rerenderWith } = renderPersistence(makeOptions({ isComplete: true }))
      act(() => result.current.saveGameState())
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).isComplete).toBe(true)

      rerenderWith(makeOptions({ isComplete: false }))
      act(() => result.current.saveGameState())
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).isComplete).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // debounced auto-save effect (effect 3)
  // ---------------------------------------------------------------------------
  describe('debounced auto-save effect', () => {
    it('schedules an idle-callback save after the debounce window elapses', async () => {
      renderPersistence(makeOptions({ restored: true }))
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(clearOtherGamesForMode).toHaveBeenCalledWith('seed1')
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    })

    it('passes the full suppression context to the auto-save guard', () => {
      renderPersistence(makeOptions({ restored: true }))
      expect(shouldSuppressAutoSave).toHaveBeenCalledTimes(1)
      expect(shouldSuppressAutoSave).toHaveBeenCalledWith(expectedSuppressionContext())
    })

    it('reports the live puzzle/restore/completion flags in the suppression context', () => {
      renderPersistence(makeOptions({ puzzle: null, restored: false, isComplete: true }))
      expect(shouldSuppressAutoSave).toHaveBeenCalledWith(
        expectedSuppressionContext({
          hasPuzzle: false,
          hasRestoredSavedState: false,
          isComplete: true,
        }),
      )
    })

    it('requests the idle callback with a bounded timeout', () => {
      renderPersistence(makeOptions({ restored: true }))
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(idleCallbackMock).toHaveBeenCalledWith(expect.any(Function), { timeout: 1000 })
    })

    it('passes the scheduled and current seeds to the stale-save guard', async () => {
      renderPersistence(makeOptions({ restored: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(shouldAllowStaleSave).toHaveBeenCalledWith({
        scheduledSeed: 'seed1',
        currentSeed: 'seed1',
      })
    })

    it('tracks the active seed across puzzle changes for the stale-save guard', async () => {
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true }))
      rerenderWith(makeOptions({ puzzle: makePuzzle('seed2'), restored: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(shouldAllowStaleSave).toHaveBeenCalledWith({
        scheduledSeed: 'seed2',
        currentSeed: 'seed2',
      })
      expect(localStorage.getItem(OTHER_STORAGE_KEY)).not.toBeNull()
    })

    it('clears the unsaved-changes flag after an idle-path save', async () => {
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      // A later hidden -> visible round trip has nothing to flush, because the
      // idle save already drained the pending changes.
      rerenderWith(makeOptions({ restored: true, isHidden: true }))
      rerenderWith(makeOptions({ restored: true, isHidden: false }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
    })

    it('does not save while shouldSuppressAutoSave is true', async () => {
      ;(shouldSuppressAutoSave as Mock).mockReturnValue(true)
      renderPersistence(makeOptions({ restored: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('marks unsaved changes and skips scheduling while shouldPauseOperations is true', async () => {
      renderPersistence(makeOptions({ restored: true, shouldPauseOperations: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('skips the save when the seed has gone stale (shouldAllowStaleSave false)', async () => {
      ;(shouldAllowStaleSave as Mock).mockReturnValue(false)
      renderPersistence(makeOptions({ restored: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })

    it('skips the save when backgroundManager.shouldPauseOperations flips true before fire time', async () => {
      const opts = makeOptions({ restored: true })
      const holder: Holder = { current: opts }
      renderHook(() => useGamePersistence(holder.current))
      // Mutate shouldPauseOperations on the same object reference (no re-render)
      // so the scheduled closure observes the new value at fire time without
      // triggering a cleanup/reschedule.
      ;(
        holder.current.backgroundManager as { shouldPauseOperations: boolean }
      ).shouldPauseOperations = true
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })

    it('cancels the pending idle handle when deps change before fire time', () => {
      cancelIdleCallbackMock.mockClear()
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true }))
      // Advance only past the debounce so scheduleAutoSave runs and schedules
      // the idle callback, but NOT past the idle delay (handle still pending).
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(cancelIdleCallbackMock).not.toHaveBeenCalled()
      // Re-render with a changed board -> cleanup cancels the pending idle handle.
      rerenderWith(makeOptions({ restored: true, board: makeBoardWith(0, 5) }))
      expect(cancelIdleCallbackMock).toHaveBeenCalled()
    })

    it('runs cleanup with a null idle handle after the save has fired (unmount path)', async () => {
      cancelIdleCallbackMock.mockClear()
      const { result, unmount } = renderPersistence(makeOptions({ restored: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
      // The idle callback already fired (idleHandle set to null before saving),
      // so unmount cleanup skips cancelIdleCallback and clearTimeout(inner)
      // (both null-handle branches of the cleanup block).
      act(() => unmount())
      expect(cancelIdleCallbackMock).not.toHaveBeenCalled()
      void result
    })

    it('falls back to setTimeout when requestIdleCallback is unavailable', async () => {
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
      renderPersistence(makeOptions({ restored: true }))
      // debounce (500ms) + fallback setTimeout (500ms) = 1000ms total
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100)
      })
      expect(clearOtherGamesForMode).toHaveBeenCalledWith('seed1')
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    })

    it('cancels the pending fallback setTimeout when deps change before fire time', () => {
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true }))
      // Advance past the debounce so the fallback setTimeout is scheduled
      // (innerTimeoutId set) but not past the fallback delay.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      // Re-render with a changed board -> cleanup clears innerTimeoutId.
      rerenderWith(makeOptions({ restored: true, board: makeBoardWith(0, 7) }))
      // No save should have occurred yet (inner callback would fire at 1000ms).
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })

    it('passes the scheduled and current seeds to the stale-save guard on the fallback path', async () => {
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
      renderPersistence(makeOptions({ restored: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100)
      })
      expect(shouldAllowStaleSave).toHaveBeenCalledWith({
        scheduledSeed: 'seed1',
        currentSeed: 'seed1',
      })
    })

    it('clears the unsaved-changes flag after a fallback-path save', async () => {
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100)
      })
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      rerenderWith(makeOptions({ restored: true, isHidden: true }))
      rerenderWith(makeOptions({ restored: true, isHidden: false }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
    })

    it('cancels the pending fallback timeout on unmount so no stale save fires', async () => {
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
      const { unmount } = renderPersistence(makeOptions({ restored: true }))
      // Past the debounce so the fallback setTimeout is armed, but short of its
      // own 500ms delay.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      act(() => unmount())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('does not clear a fallback timeout that was never armed', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
      const { unmount } = renderPersistence(makeOptions({ restored: true }))
      // The idle path is taken here, so the fallback handle stays null and
      // cleanup must not ask the platform to clear a timer that never existed.
      act(() => {
        vi.advanceTimersByTime(500)
      })
      act(() => unmount())
      expect(clearTimeoutSpy).toHaveBeenCalled()
      expect(clearTimeoutSpy).not.toHaveBeenCalledWith(null)
      clearTimeoutSpy.mockRestore()
    })

    it('skips the save on the fallback path when the seed has gone stale', async () => {
      ;(shouldAllowStaleSave as Mock).mockReturnValue(false)
      delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
      renderPersistence(makeOptions({ restored: true }))
      // debounce (500ms) + fallback setTimeout (500ms) = 1000ms total
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100)
      })
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // visibility catch-up save (effect 4)
  // ---------------------------------------------------------------------------
  describe('visibility catch-up save', () => {
    it('flushes unsaved changes once when transitioning hidden -> visible', () => {
      // First render: hidden + paused so effect 3 records unsaved changes.
      const { rerenderWith } = renderPersistence(
        makeOptions({ restored: true, isHidden: true, shouldPauseOperations: true }),
      )
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
      // Second render: visible + unpaused -> catch-up save fires.
      rerenderWith(makeOptions({ restored: true, isHidden: false, shouldPauseOperations: false }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    })

    it('clears the unsaved-changes flag after the catch-up save', () => {
      const { rerenderWith } = renderPersistence(
        makeOptions({ restored: true, isHidden: true, shouldPauseOperations: true }),
      )
      rerenderWith(makeOptions({ restored: true, isHidden: false, shouldPauseOperations: false }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      // A second hidden -> visible round trip with nothing pending must not
      // re-save, which only holds if the catch-up drained the flag.
      rerenderWith(makeOptions({ restored: true, isHidden: true, shouldPauseOperations: false }))
      rerenderWith(makeOptions({ restored: true, isHidden: false, shouldPauseOperations: false }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
    })

    it('does not save on the initial mount (wasHidden is false)', () => {
      renderPersistence(makeOptions({ restored: true, isHidden: false }))
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })

    it('does not save when remaining hidden across a re-render', () => {
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true, isHidden: true }))
      // Change the board so saveGameState identity changes and effect 4 re-runs
      // while isHidden stays true (isNowVisible stays false).
      rerenderWith(makeOptions({ restored: true, isHidden: true, board: makeBoardWith(1, 3) }))
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })

    it('does not save when becoming visible without unsaved changes', () => {
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true, isHidden: true }))
      // No pause path ran, so hasUnsavedChanges is still false.
      rerenderWith(makeOptions({ restored: true, isHidden: false }))
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })

    it('does not save when auto-save is disabled at the moment of becoming visible', () => {
      const { rerenderWith } = renderPersistence(
        makeOptions({ restored: true, isHidden: true, shouldPauseOperations: true }),
      )
      // Flip autoSave off so effect 3 keeps hasUnsavedChanges intact (it
      // returns early) while effect 4's getAutoSaveEnabled() gate is false.
      ;(getAutoSaveEnabled as Mock).mockReturnValue(false)
      rerenderWith(makeOptions({ restored: true, isHidden: false, shouldPauseOperations: false }))
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // beforeunload flush (effect 5)
  // ---------------------------------------------------------------------------
  describe('beforeunload flush', () => {
    function dispatchBeforeUnload() {
      act(() => {
        window.dispatchEvent(new Event('beforeunload'))
      })
    }

    it('writes a synchronous snapshot when the guard allows it', () => {
      renderPersistence(makeOptions({ restored: true, isComplete: false }))
      dispatchBeforeUnload()
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    })

    it('passes the full suppression context when deciding to flush', () => {
      renderPersistence(makeOptions({ restored: true }))
      // Drop the mount-time call from the auto-save effect so only the
      // beforeunload call is under assertion.
      ;(shouldSuppressAutoSave as Mock).mockClear()
      dispatchBeforeUnload()
      expect(shouldSuppressAutoSave).toHaveBeenCalledTimes(1)
      expect(shouldSuppressAutoSave).toHaveBeenCalledWith(expectedSuppressionContext())
    })

    it('writes the whole snapshot built from the props current at unload time', () => {
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true }))
      rerenderWith(
        makeOptions({
          restored: true,
          puzzle: makePuzzle('seed2'),
          board: makeBoardWith(0, 4),
          autoFillUsed: true,
          hintsUsed: 3,
          techniqueHintsUsed: 2,
        }),
      )
      dispatchBeforeUnload()
      expect(JSON.parse(localStorage.getItem(OTHER_STORAGE_KEY)!)).toEqual(
        expectedPayload({
          board: makeBoardWith(0, 4),
          autoFillUsed: true,
          hintsUsed: 3,
          techniqueHintsUsed: 2,
        }),
      )
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('records the completion flag in the unload snapshot', () => {
      const { rerenderWith } = renderPersistence(makeOptions({ restored: true }))
      rerenderWith(makeOptions({ restored: true, isComplete: true }))
      dispatchBeforeUnload()
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(
        expectedPayload({ isComplete: true }),
      )
    })

    it('skips the write when there is no puzzle', () => {
      renderPersistence(makeOptions({ puzzle: null, restored: true }))
      dispatchBeforeUnload()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('skips the write when shouldSuppressAutoSave is true', () => {
      ;(shouldSuppressAutoSave as Mock).mockReturnValue(true)
      renderPersistence(makeOptions({ restored: true }))
      dispatchBeforeUnload()
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('swallows a localStorage.setItem failure during unload (empty catch)', () => {
      renderPersistence(makeOptions({ restored: true }))
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('unload quota')
      })
      expect(() => dispatchBeforeUnload()).not.toThrow()
      expect(logger.warn).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  // ---------------------------------------------------------------------------
  // save-on-complete (effect 6)
  // ---------------------------------------------------------------------------
  describe('save-on-complete', () => {
    it('saves exactly once when the puzzle becomes complete after restore', () => {
      const { result, rerenderWith } = renderPersistence(makeOptions({ isComplete: false }))
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
      rerenderWith(makeOptions({ isComplete: true }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      // Re-rendering complete again must not save a second time (once guard).
      rerenderWith(makeOptions({ isComplete: true }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      void result
    })

    it('saves once when the hook mounts with an already-complete puzzle', () => {
      renderPersistence(makeOptions({ isComplete: true, restored: true }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(
        expectedPayload({ isComplete: true }),
      )
    })

    it('resets the once guard when isComplete returns to false, allowing a later re-save', () => {
      const { rerenderWith } = renderPersistence(makeOptions({ isComplete: false }))
      rerenderWith(makeOptions({ isComplete: true }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      // Drop back to in-progress -> resets hasSavedOnCompleteRef.
      rerenderWith(makeOptions({ isComplete: false }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(1)
      // Complete again -> the reset permits a fresh save.
      rerenderWith(makeOptions({ isComplete: true }))
      expect(clearOtherGamesForMode).toHaveBeenCalledTimes(2)
    })

    it('does not save on completion before the initial restore has applied', () => {
      const { rerenderWith } = renderPersistence(
        makeOptions({ isComplete: false, restored: false }),
      )
      rerenderWith(makeOptions({ isComplete: true, restored: false }))
      expect(clearOtherGamesForMode).not.toHaveBeenCalled()
    })
  })
})

// =============================================================================
// LOCAL HELPERS (declared after the suite to keep the test body readable)
// =============================================================================

function makeBoardWith(index: number, value: number): number[] {
  const board = Array(81).fill(0)
  board[index] = value
  return board
}
