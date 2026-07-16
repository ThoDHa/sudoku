import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { usePuzzleLoader, type UsePuzzleLoaderOptions } from './usePuzzleLoader'
import type { Difficulty } from '../lib/hooks'

vi.mock('../lib/solver-service', () => ({
  getPuzzle: vi.fn(),
  validateCustomPuzzle: vi.fn(),
}))
vi.mock('../lib/puzzleEncoding', () => ({
  decodePuzzle: vi.fn(),
  decodePuzzleWithState: vi.fn(),
  encodePuzzle: vi.fn(),
}))
vi.mock('../lib/dailyPrompt', () => ({
  shouldShowDailyPrompt: vi.fn(),
  markDailyPromptShown: vi.fn(),
}))
vi.mock('../lib/gameSettings', () => ({
  getGameMode: vi.fn(),
}))

import { getPuzzle, validateCustomPuzzle } from '../lib/solver-service'
import { decodePuzzle, decodePuzzleWithState, encodePuzzle } from '../lib/puzzleEncoding'
import { shouldShowDailyPrompt, markDailyPromptShown } from '../lib/dailyPrompt'
import { getGameMode } from '../lib/gameSettings'
import { STORAGE_KEYS } from '../lib/constants'

const getPuzzleMock = getPuzzle as unknown as Mock
const validateCustomPuzzleMock = validateCustomPuzzle as unknown as Mock
const decodePuzzleMock = decodePuzzle as unknown as Mock
const decodePuzzleWithStateMock = decodePuzzleWithState as unknown as Mock
const encodePuzzleMock = encodePuzzle as unknown as Mock
const shouldShowDailyPromptMock = shouldShowDailyPrompt as unknown as Mock
const markDailyPromptShownMock = markDailyPromptShown as unknown as Mock
const getGameModeMock = getGameMode as unknown as Mock

const givens81 = (): number[] =>
  Array(81)
    .fill(0)
    .map((_, i) => (i < 30 ? 5 : 0))
const solution81 = (): number[] =>
  Array(81)
    .fill(0)
    .map((_, i) => (i % 9) + 1)
const board81 = (): number[] =>
  Array(81)
    .fill(0)
    .map((_, i) => (i < 50 ? 7 : 0))
const candidates81 = (): number[][] =>
  Array(81)
    .fill(null)
    .map(() => [1, 2, 3])

interface OptionsOverrides {
  effectiveSeed?: string | undefined
  isEncodedCustom?: boolean
  encoded?: string | undefined
  difficulty?: Difficulty
  sharedStateParam?: string | null
  alreadyCompletedToday?: boolean
  showDifficultyChooser?: boolean
  showOnboarding?: boolean
  onboardingComplete?: boolean
  shouldPauseOperations?: boolean
  hasRestoredSavedState?: { current: boolean }
  loadedFromSharedUrl?: { current: boolean }
  restoreOrPromptSharedState?: Mock
  setIncorrectCells?: Mock
  setShowDailyPrompt?: Mock
  resetTimer?: Mock
}

function makeOptions(overrides: OptionsOverrides = {}): UsePuzzleLoaderOptions {
  const hasSeed = Object.prototype.hasOwnProperty.call(overrides, 'effectiveSeed')
  const hasEncoded = Object.prototype.hasOwnProperty.call(overrides, 'encoded')
  return {
    effectiveSeed: hasSeed ? overrides.effectiveSeed : 'seed1',
    isEncodedCustom: overrides.isEncodedCustom ?? false,
    encoded: hasEncoded ? overrides.encoded : undefined,
    difficulty: overrides.difficulty ?? 'easy',
    sharedStateParam: overrides.sharedStateParam ?? null,
    alreadyCompletedToday: overrides.alreadyCompletedToday ?? false,
    showDifficultyChooser: overrides.showDifficultyChooser ?? false,
    showOnboarding: overrides.showOnboarding ?? false,
    onboardingComplete: overrides.onboardingComplete ?? true,
    backgroundManager: {
      shouldPauseOperations: overrides.shouldPauseOperations ?? false,
      isHidden: false,
    } as UsePuzzleLoaderOptions['backgroundManager'],
    hasRestoredSavedState: overrides.hasRestoredSavedState ?? { current: false },
    loadedFromSharedUrl: overrides.loadedFromSharedUrl ?? { current: false },
    restoreOrPromptSharedState: overrides.restoreOrPromptSharedState ?? vi.fn(),
    setIncorrectCells: overrides.setIncorrectCells ?? vi.fn(),
    setShowDailyPrompt: overrides.setShowDailyPrompt ?? vi.fn(),
    timerControl: {
      resetTimer: overrides.resetTimer ?? vi.fn(),
    } as unknown as UsePuzzleLoaderOptions['timerControl'],
  }
}

async function flushLoading(result: { current: { loading: boolean } }): Promise<void> {
  // vi.waitFor inside act does not let React flush state updates from async
  // effects, so we instead poll on macrotasks which yield to the React
  // reconciler between iterations.
  for (let i = 0; i < 100; i++) {
    if (result.current.loading === false) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error('flushLoading timed out: loading never became false')
}

async function flushMicro(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('usePuzzleLoader', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    getPuzzleMock.mockResolvedValue({
      puzzle_id: 'p1',
      seed: 'seed1',
      difficulty: 'easy',
      givens: givens81(),
      solution: solution81(),
    })
    validateCustomPuzzleMock.mockResolvedValue({
      valid: true,
      unique: true,
      solution: solution81(),
    })
    decodePuzzleMock.mockReturnValue(givens81())
    decodePuzzleWithStateMock.mockReturnValue({
      givens: givens81(),
      board: board81(),
      candidates: null,
    })
    encodePuzzleMock.mockReturnValue('enc')
    shouldShowDailyPromptMock.mockReturnValue(false)
    markDailyPromptShownMock.mockReturnValue(undefined)
    getGameModeMock.mockReturnValue(null)
  })

  describe('initial encodedPuzzle state', () => {
    it('initializes to the encoded string when provided and effect early-returns', async () => {
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ encoded: 'abc', showOnboarding: true })),
      )
      await flushMicro()
      expect(result.current.encodedPuzzle).toBe('abc')
      expect(result.current.loading).toBe(false)
      expect(getPuzzleMock).not.toHaveBeenCalled()
    })

    it('initializes to null when encoded is undefined', async () => {
      const { result } = renderHook(() => usePuzzleLoader(makeOptions({ showOnboarding: true })))
      await flushMicro()
      expect(result.current.encodedPuzzle).toBeNull()
    })
  })

  describe('daily prompt gating', () => {
    it('shows daily prompt when practice mode, no shared state, and shouldShow returns true', async () => {
      getGameModeMock.mockReturnValue('practice')
      shouldShowDailyPromptMock.mockReturnValue(true)
      const setShowDailyPrompt = vi.fn()
      renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'practice-x',
            sharedStateParam: null,
            showOnboarding: true,
            setShowDailyPrompt,
          }),
        ),
      )
      await flushMicro()
      expect(setShowDailyPrompt).toHaveBeenCalledWith(true)
      expect(markDailyPromptShownMock).toHaveBeenCalledTimes(1)
    })

    it('skips daily prompt when a sharedStateParam is present', async () => {
      getGameModeMock.mockReturnValue('practice')
      shouldShowDailyPromptMock.mockReturnValue(true)
      const setShowDailyPrompt = vi.fn()
      renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'practice-x',
            sharedStateParam: 'eSharedState',
            showOnboarding: true,
            setShowDailyPrompt,
          }),
        ),
      )
      await flushMicro()
      expect(setShowDailyPrompt).not.toHaveBeenCalled()
    })

    it('skips daily prompt when game mode is not practice', async () => {
      getGameModeMock.mockReturnValue('daily')
      shouldShowDailyPromptMock.mockReturnValue(true)
      const setShowDailyPrompt = vi.fn()
      renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'daily-x',
            showOnboarding: true,
            setShowDailyPrompt,
          }),
        ),
      )
      await flushMicro()
      expect(setShowDailyPrompt).not.toHaveBeenCalled()
    })

    it('skips daily prompt when shouldShowDailyPrompt returns false', async () => {
      getGameModeMock.mockReturnValue('practice')
      shouldShowDailyPromptMock.mockReturnValue(false)
      const setShowDailyPrompt = vi.fn()
      renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'practice-x',
            showOnboarding: true,
            setShowDailyPrompt,
          }),
        ),
      )
      await flushMicro()
      expect(setShowDailyPrompt).not.toHaveBeenCalled()
      expect(markDailyPromptShownMock).not.toHaveBeenCalled()
    })
  })

  describe('effect early returns (before loadPuzzle)', () => {
    it('returns with loading false when showOnboarding is true', async () => {
      const { result } = renderHook(() => usePuzzleLoader(makeOptions({ showOnboarding: true })))
      await flushMicro()
      expect(result.current.loading).toBe(false)
      expect(result.current.puzzle).toBeNull()
      expect(getPuzzleMock).not.toHaveBeenCalled()
    })

    it('returns with loading false when showDifficultyChooser is true', async () => {
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ showDifficultyChooser: true })),
      )
      await flushMicro()
      expect(result.current.loading).toBe(false)
      expect(getPuzzleMock).not.toHaveBeenCalled()
    })

    it('returns with loading false when onboardingComplete is false', async () => {
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ onboardingComplete: false })),
      )
      await flushMicro()
      expect(result.current.loading).toBe(false)
      expect(getPuzzleMock).not.toHaveBeenCalled()
    })

    it('returns without ever setting loading false when no effectiveSeed and not encoded custom', async () => {
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ effectiveSeed: undefined, isEncodedCustom: false })),
      )
      await flushMicro()
      expect(result.current.loading).toBe(true)
      expect(getPuzzleMock).not.toHaveBeenCalled()
    })
  })

  describe('loadPuzzle early returns', () => {
    it('returns with loading false when backgroundManager.shouldPauseOperations is true', async () => {
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ shouldPauseOperations: true })),
      )
      await flushLoading(result)
      expect(result.current.loading).toBe(false)
      expect(getPuzzleMock).not.toHaveBeenCalled()
    })

    it('returns without refetching when a puzzle is already loaded and hasRestoredSavedState is true', async () => {
      const hasRestored = { current: false }
      const resetTimer = vi.fn()
      const { result, rerender } = renderHook(
        (props: UsePuzzleLoaderOptions) => usePuzzleLoader(props),
        {
          initialProps: makeOptions({
            effectiveSeed: 'seed1',
            hasRestoredSavedState: hasRestored,
            resetTimer,
          }),
        },
      )
      await flushLoading(result)
      expect(result.current.puzzle).not.toBeNull()
      expect(getPuzzleMock).toHaveBeenCalledTimes(1)

      hasRestored.current = true
      getPuzzleMock.mockClear()
      rerender(
        makeOptions({
          effectiveSeed: 'seed2',
          hasRestoredSavedState: hasRestored,
          resetTimer,
        }),
      )
      await flushLoading(result)
      expect(result.current.loading).toBe(false)
      expect(getPuzzleMock).not.toHaveBeenCalled()
    })
  })

  describe('fetchPuzzleSource: resolveFetched (default arm)', () => {
    it('fetches via getPuzzle, clears encodedPuzzle, resets timer, resets shared refs', async () => {
      const resetTimer = vi.fn()
      const setIncorrectCells = vi.fn()
      const loadedFromSharedUrl = { current: true }
      const { result } = renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'fetchSeed',
            resetTimer,
            setIncorrectCells,
            loadedFromSharedUrl,
          }),
        ),
      )
      await flushLoading(result)
      expect(getPuzzleMock).toHaveBeenCalledWith('fetchSeed', 'easy')
      expect(result.current.puzzle).not.toBeNull()
      expect(result.current.encodedPuzzle).toBeNull()
      expect(setIncorrectCells).toHaveBeenCalledWith([])
      expect(resetTimer).toHaveBeenCalledTimes(1)
      expect(loadedFromSharedUrl.current).toBe(false)
    })

    it('falls back to empty seed when isEncodedCustom is true but encoded is undefined', async () => {
      // Covers the `effectiveSeed ?? ''` fallback inside resolveFetched: with
      // isEncodedCustom=true the outer !effectiveSeed guard is bypassed, but
      // with encoded=undefined the encoded-custom arm is skipped, so the
      // dispatcher falls through to resolveFetched with effectiveSeed=undefined.
      const { result } = renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: undefined,
            isEncodedCustom: true,
            encoded: undefined,
          }),
        ),
      )
      await flushLoading(result)
      expect(getPuzzleMock).toHaveBeenCalledWith('', 'easy')
      expect(result.current.puzzle).not.toBeNull()
    })

    it('sets error to err.message when getPuzzle rejects with an Error', async () => {
      getPuzzleMock.mockRejectedValue(new Error('network down'))
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ effectiveSeed: 'failSeed' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('network down')
      expect(result.current.loading).toBe(false)
    })

    it('coerces non-Error rejections to "Unknown error"', async () => {
      getPuzzleMock.mockRejectedValue('a string error')
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ effectiveSeed: 'failSeed' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Unknown error')
    })
  })

  describe('fetchPuzzleSource: resolveEncodedCustom (full-state branch)', () => {
    it('decodes an e-prefixed encoded custom link with full state and candidates', async () => {
      decodePuzzleWithStateMock.mockReturnValue({
        givens: givens81(),
        board: board81(),
        candidates: candidates81(),
      })
      const restoreOrPromptSharedState = vi.fn()
      const { result } = renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            isEncodedCustom: true,
            encoded: 'eXYZ',
            restoreOrPromptSharedState,
          }),
        ),
      )
      await flushLoading(result)
      expect(decodePuzzleWithStateMock).toHaveBeenCalledWith('eXYZ')
      expect(validateCustomPuzzleMock).toHaveBeenCalledTimes(1)
      expect(result.current.encodedPuzzle).toBe('eXYZ')
      expect(restoreOrPromptSharedState).toHaveBeenCalledWith(
        board81(),
        candidates81(),
        expect.any(String),
      )
    })

    it('decodes a c-prefixed encoded custom link through the same path with null candidates', async () => {
      decodePuzzleWithStateMock.mockReturnValue({
        givens: givens81(),
        board: board81(),
        candidates: null,
      })
      const restoreOrPromptSharedState = vi.fn()
      const { result } = renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            isEncodedCustom: true,
            encoded: 'cXYZ',
            restoreOrPromptSharedState,
          }),
        ),
      )
      await flushLoading(result)
      expect(decodePuzzleWithStateMock).toHaveBeenCalledWith('cXYZ')
      expect(restoreOrPromptSharedState).toHaveBeenCalledWith(board81(), null, expect.any(String))
    })

    it('throws when decodePuzzleWithState returns null for an e-prefixed link', async () => {
      decodePuzzleWithStateMock.mockReturnValue(null)
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'eBad' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Invalid puzzle link. The puzzle could not be decoded.')
    })
  })

  describe('fetchPuzzleSource: resolveEncodedCustom (legacy givens-only branch)', () => {
    it('decodes a legacy encoded link via decodePuzzle', async () => {
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'legacy' })),
      )
      await flushLoading(result)
      expect(decodePuzzleMock).toHaveBeenCalledWith('legacy')
      expect(result.current.puzzle).not.toBeNull()
      expect(result.current.encodedPuzzle).toBe('legacy')
    })

    it('surfaces the catch error when decodePuzzle returns wrong length', async () => {
      decodePuzzleMock.mockReturnValue([1, 2, 3])
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'legacy' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Invalid puzzle link. The puzzle could not be decoded.')
    })

    it('surfaces the catch error when decodePuzzle throws', async () => {
      decodePuzzleMock.mockImplementation(() => {
        throw new Error('decode boom')
      })
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'legacy' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Invalid puzzle link. The puzzle could not be decoded.')
    })
  })

  describe('validateAndBuildCustom failure arms', () => {
    function setupFullState(): void {
      decodePuzzleWithStateMock.mockReturnValue({
        givens: givens81(),
        board: board81(),
        candidates: null,
      })
    }

    it('throws "Invalid puzzle: <reason>" when validation.valid is false with a reason', async () => {
      setupFullState()
      validateCustomPuzzleMock.mockResolvedValue({ valid: false, reason: 'bad givens' })
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'eX' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Invalid puzzle: bad givens')
    })

    it('throws the default reason when validation.valid is false without a reason', async () => {
      setupFullState()
      validateCustomPuzzleMock.mockResolvedValue({ valid: false })
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'eX' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Invalid puzzle: unknown error')
    })

    it('throws "Invalid puzzle: has multiple solutions" when validation.unique is false', async () => {
      setupFullState()
      validateCustomPuzzleMock.mockResolvedValue({
        valid: true,
        unique: false,
        solution: solution81(),
      })
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'eX' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Invalid puzzle: has multiple solutions')
    })

    it('throws "Invalid puzzle: could not compute solution" when validation.solution is missing', async () => {
      setupFullState()
      validateCustomPuzzleMock.mockResolvedValue({ valid: true, unique: true })
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'eX' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Invalid puzzle: could not compute solution')
    })
  })

  describe('fetchPuzzleSource: resolveStoredCustom', () => {
    it('resolves a stored custom puzzle from localStorage and encodes it', async () => {
      const givens = givens81()
      localStorage.setItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}custom-abc`, JSON.stringify(givens))
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ difficulty: 'custom', effectiveSeed: 'custom-abc' })),
      )
      await flushLoading(result)
      expect(validateCustomPuzzleMock).toHaveBeenCalledWith(givens, '')
      expect(encodePuzzleMock).toHaveBeenCalledWith(givens)
      expect(result.current.encodedPuzzle).toBe('enc')
      expect(result.current.puzzle).not.toBeNull()
    })

    it('throws "Custom puzzle not found" when localStorage is empty', async () => {
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ difficulty: 'custom', effectiveSeed: 'custom-missing' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Custom puzzle not found. Please re-enter the puzzle.')
    })

    it('throws "Stored puzzle is invalid" when validation fails', async () => {
      localStorage.setItem(
        `${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}custom-bad`,
        JSON.stringify(givens81()),
      )
      validateCustomPuzzleMock.mockResolvedValue({ valid: false })
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ difficulty: 'custom', effectiveSeed: 'custom-bad' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Stored puzzle is invalid')
    })

    it('throws "Stored puzzle data is malformed" when the stored value is not an array', async () => {
      localStorage.setItem(
        `${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}custom-malformed`,
        JSON.stringify('not-an-array'),
      )
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ difficulty: 'custom', effectiveSeed: 'custom-malformed' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Stored puzzle data is malformed')
    })
  })

  describe('fetchPuzzleSource: resolvePractice', () => {
    it('resolves a stored practice puzzle from localStorage and clears encodedPuzzle', async () => {
      const givens = givens81()
      localStorage.setItem(
        `${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}practice-abc`,
        JSON.stringify(givens),
      )
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ effectiveSeed: 'practice-abc', difficulty: 'medium' })),
      )
      await flushLoading(result)
      expect(validateCustomPuzzleMock).toHaveBeenCalledWith(givens, '')
      expect(result.current.encodedPuzzle).toBeNull()
      expect(result.current.puzzle).not.toBeNull()
      expect(result.current.puzzle?.difficulty).toBe('medium')
    })

    it('throws "Practice puzzle not found" when localStorage is empty', async () => {
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ effectiveSeed: 'practice-missing' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe(
        'Practice puzzle not found. Please try again from the technique page.',
      )
    })

    it('throws "Practice puzzle is invalid" when validation fails', async () => {
      localStorage.setItem(
        `${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}practice-bad`,
        JSON.stringify(givens81()),
      )
      validateCustomPuzzleMock.mockResolvedValue({ valid: false })
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ effectiveSeed: 'practice-bad' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Practice puzzle is invalid')
    })

    it('throws "Stored puzzle data is malformed" when the stored givens contain a non-numeric value', async () => {
      const bad: unknown[] = [...givens81()]
      bad[0] = 'x'
      localStorage.setItem(
        `${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}practice-malformed`,
        JSON.stringify(bad),
      )
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ effectiveSeed: 'practice-malformed' })),
      )
      await flushLoading(result)
      expect(result.current.error).toBe('Stored puzzle data is malformed')
    })
  })

  describe('applySharedStateParam overlay', () => {
    it('overlays shared state when initialState is null and the param decodes with candidates', async () => {
      const sharedBoard = board81()
      const sharedCands = candidates81()
      decodePuzzleWithStateMock.mockReturnValue({
        givens: givens81(),
        board: sharedBoard,
        candidates: sharedCands,
      })
      const restoreOrPromptSharedState = vi.fn()
      const { result } = renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'sharedSeed',
            sharedStateParam: 'eShared',
            restoreOrPromptSharedState,
          }),
        ),
      )
      await flushLoading(result)
      expect(decodePuzzleWithStateMock).toHaveBeenCalledWith('eShared')
      expect(restoreOrPromptSharedState).toHaveBeenCalledWith(
        sharedBoard,
        sharedCands,
        expect.any(String),
      )
    })

    it('overlays shared state with null candidates when the decoded payload omits them', async () => {
      const sharedBoard = board81()
      decodePuzzleWithStateMock.mockReturnValue({
        givens: givens81(),
        board: sharedBoard,
      })
      const restoreOrPromptSharedState = vi.fn()
      const { result } = renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'sharedSeed',
            sharedStateParam: 'eShared',
            restoreOrPromptSharedState,
          }),
        ),
      )
      await flushLoading(result)
      expect(restoreOrPromptSharedState).toHaveBeenCalledWith(sharedBoard, null, expect.any(String))
    })

    it('does not overlay and does not call restoreOrPromptSharedState when the param decodes to null', async () => {
      decodePuzzleWithStateMock.mockReturnValue(null)
      const restoreOrPromptSharedState = vi.fn()
      const { result } = renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'sharedSeed',
            sharedStateParam: 'eShared',
            restoreOrPromptSharedState,
          }),
        ),
      )
      await flushLoading(result)
      expect(restoreOrPromptSharedState).not.toHaveBeenCalled()
    })
  })

  describe('initialBoard and timer behavior', () => {
    it('sets initialBoard to the solution when alreadyCompletedToday is true and skips resetTimer', async () => {
      const sol = solution81()
      getPuzzleMock.mockResolvedValue({
        puzzle_id: 'p1',
        seed: 'doneSeed',
        difficulty: 'easy',
        givens: givens81(),
        solution: sol,
      })
      const resetTimer = vi.fn()
      const { result } = renderHook(() =>
        usePuzzleLoader(
          makeOptions({
            effectiveSeed: 'doneSeed',
            alreadyCompletedToday: true,
            resetTimer,
          }),
        ),
      )
      await flushLoading(result)
      expect(result.current.initialBoard).toEqual(sol)
      expect(result.current.solution).toEqual(sol)
      expect(resetTimer).not.toHaveBeenCalled()
    })

    it('sets initialBoard to the givens by default and resets the timer', async () => {
      const givens = givens81()
      getPuzzleMock.mockResolvedValue({
        puzzle_id: 'p1',
        seed: 'g',
        difficulty: 'easy',
        givens,
        solution: solution81(),
      })
      const resetTimer = vi.fn()
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ effectiveSeed: 'g', resetTimer })),
      )
      await flushLoading(result)
      expect(result.current.initialBoard).toEqual(givens)
      expect(resetTimer).toHaveBeenCalledTimes(1)
    })

    it('sets initialBoard to the givens when initialState is present (encoded custom)', async () => {
      const givens = givens81()
      decodePuzzleWithStateMock.mockReturnValue({
        givens,
        board: board81(),
        candidates: null,
      })
      const { result } = renderHook(() =>
        usePuzzleLoader(makeOptions({ isEncodedCustom: true, encoded: 'eX' })),
      )
      await flushLoading(result)
      expect(result.current.initialBoard).toEqual(givens)
    })
  })
})
