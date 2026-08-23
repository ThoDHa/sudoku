import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// Module-level mocks. vi.mock is hoisted above the imports by vitest's
// transformer, so the hook under test sees these stubbed implementations
// instead of the real lib code.
vi.mock('../lib/validationUtils', () => ({
  isValidSolution: vi.fn(),
}))
vi.mock('../lib/candidatesUtils', () => ({
  arraysToCandidates: vi.fn(() => new Uint16Array(81)),
}))
vi.mock('../lib/gameSettings', () => ({
  getMostRecentGame: vi.fn(() => null),
}))

import { useShareConflict } from './useShareConflict'
import { isValidSolution } from '../lib/validationUtils'
import { arraysToCandidates } from '../lib/candidatesUtils'
import { getMostRecentGame } from '../lib/gameSettings'
import { createMockMove } from '../test-utils'
import { STORAGE_KEYS } from '../lib/constants'
import type { SavedGameState } from '../lib/savedGameState'

type UseShareConflictOptions = Parameters<typeof useShareConflict>[0]

const isValidSolutionMock = isValidSolution as unknown as Mock
const arraysToCandidatesMock = arraysToCandidates as unknown as Mock
const getMostRecentGameMock = getMostRecentGame as unknown as Mock

const BASE_URL = 'http://localhost:3000/'

function setLocation(href: string): void {
  window.history.replaceState({}, '', href)
}

function makeSavedGame(history: SavedGameState['history']): SavedGameState {
  return {
    board: [1],
    candidates: [],
    elapsedMs: 0,
    history,
    autoFillUsed: false,
    savedAt: 0,
    difficulty: 'easy',
  } as unknown as SavedGameState
}

function buildOptions(overrides: Partial<UseShareConflictOptions> = {}): UseShareConflictOptions {
  return {
    game: { restoreState: vi.fn() } as unknown as UseShareConflictOptions['game'],
    timerControl: {
      setElapsedMs: vi.fn(),
      startTimer: vi.fn(),
    } as unknown as UseShareConflictOptions['timerControl'],
    restoredAsCompleteRef: { current: false },
    hasRestoredSavedState: { current: false },
    loadedFromSharedUrl: { current: false },
    alreadyCompletedToday: false,
    showDifficultyChooser: false,
    sharedTimeParam: null,
    encoded: undefined,
    loadSavedGameState: vi.fn(() => null),
    navigate: vi.fn(),
    ...overrides,
  }
}

describe('useShareConflict', () => {
  beforeEach(() => {
    setLocation(BASE_URL)
    sessionStorage.clear()
    isValidSolutionMock.mockReset()
    arraysToCandidatesMock.mockReset()
    arraysToCandidatesMock.mockReturnValue(new Uint16Array(81))
    getMostRecentGameMock.mockReset()
    getMostRecentGameMock.mockReturnValue(null)
  })

  afterEach(() => {
    setLocation(BASE_URL)
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('opens with the modal closed, nothing pending, and no current game recorded', () => {
      const { result } = renderHook(() => useShareConflict(buildOptions()))

      expect({
        showShareConflict: result.current.showShareConflict,
        pendingSharedState: result.current.pendingSharedState,
        resumeTarget: result.current.resumeTarget,
        shareHasCurrentGame: result.current.shareHasCurrentGame,
        shareResolved: result.current.shareResolvedRef.current,
      }).toEqual({
        showShareConflict: false,
        pendingSharedState: null,
        resumeTarget: null,
        shareHasCurrentGame: false,
        shareResolved: false,
      })
    })
  })

  describe('applySharedBoard', () => {
    it('passes provided candidates through arraysToCandidates, sets elapsedMs, and marks complete on a valid solution', () => {
      isValidSolutionMock.mockReturnValue(true)
      const fakeCandidates = new Uint16Array(81)
      arraysToCandidatesMock.mockReturnValue(fakeCandidates)
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      act(() =>
        result.current.applySharedBoard({
          board: [1, 2],
          candidates: [[1], [2]],
          elapsedMs: 5_000,
        }),
      )

      expect(arraysToCandidatesMock).toHaveBeenCalledWith([[1], [2]])
      expect(opts.game.restoreState).toHaveBeenCalledWith([1, 2], fakeCandidates, [])
      expect(opts.timerControl.setElapsedMs).toHaveBeenCalledWith(5_000)
      expect(opts.restoredAsCompleteRef.current).toBe(true)
    })

    it('defaults to 81 empty candidate arrays when candidates is null and skips setElapsedMs when elapsedMs is null', () => {
      isValidSolutionMock.mockReturnValue(false)
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      act(() =>
        result.current.applySharedBoard({
          board: [0],
          candidates: null,
          elapsedMs: null,
        }),
      )

      expect(arraysToCandidatesMock).toHaveBeenCalledTimes(1)
      const passed = arraysToCandidatesMock.mock.calls[0]![0] as number[][]
      expect(passed).toHaveLength(81)
      expect(passed[0]).toEqual([])
      expect(opts.timerControl.setElapsedMs).not.toHaveBeenCalled()
      expect(opts.restoredAsCompleteRef.current).toBe(false)
    })
  })

  describe('consumeShareParams', () => {
    it('strips the s param via replaceState when only s is present', () => {
      setLocation(`${BASE_URL}?s=abc`)
      const { result } = renderHook(() => useShareConflict(buildOptions()))
      act(() => result.current.consumeShareParams())
      expect(window.location.href).toBe(BASE_URL)
    })

    it('strips the t param via replaceState when only t is present', () => {
      setLocation(`${BASE_URL}?t=1000`)
      const { result } = renderHook(() => useShareConflict(buildOptions()))
      act(() => result.current.consumeShareParams())
      expect(window.location.href).toBe(BASE_URL)
    })

    it('returns early without touching the URL when neither s nor t is present', () => {
      setLocation(`${BASE_URL}?foo=bar`)
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
      try {
        const { result } = renderHook(() => useShareConflict(buildOptions()))
        act(() => result.current.consumeShareParams())
        // The early return must skip replaceState outright: pushing an
        // equivalent URL would still rewrite the history entry for nothing.
        expect(replaceStateSpy).not.toHaveBeenCalled()
        expect(window.location.href).toBe(`${BASE_URL}?foo=bar`)
      } finally {
        replaceStateSpy.mockRestore()
      }
    })

    it('replaces state with the preserved history state, an empty title, and the stripped URL', () => {
      setLocation(`${BASE_URL}?s=abc&t=1000`)
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
      try {
        const { result } = renderHook(() => useShareConflict(buildOptions()))
        act(() => result.current.consumeShareParams())
        // The empty title keeps the document title untouched, and the existing
        // history state is carried across rather than dropped.
        expect(replaceStateSpy.mock.calls).toEqual([[window.history.state, '', BASE_URL]])
      } finally {
        replaceStateSpy.mockRestore()
      }
    })
  })

  describe('finalizeSharedUrlLoad', () => {
    it('starts the timer when not already completed today and not showing the difficulty chooser', () => {
      const opts = buildOptions({ alreadyCompletedToday: false, showDifficultyChooser: false })
      const { result } = renderHook(() => useShareConflict(opts))
      act(() => result.current.finalizeSharedUrlLoad())
      expect(opts.loadedFromSharedUrl.current).toBe(false)
      expect(opts.hasRestoredSavedState.current).toBe(true)
      expect(opts.timerControl.startTimer).toHaveBeenCalledTimes(1)
    })

    it('does not start the timer when alreadyCompletedToday is true (short-circuit)', () => {
      const opts = buildOptions({ alreadyCompletedToday: true, showDifficultyChooser: false })
      const { result } = renderHook(() => useShareConflict(opts))
      act(() => result.current.finalizeSharedUrlLoad())
      expect(opts.timerControl.startTimer).not.toHaveBeenCalled()
    })

    it('does not start the timer when showDifficultyChooser is true', () => {
      const opts = buildOptions({ alreadyCompletedToday: false, showDifficultyChooser: true })
      const { result } = renderHook(() => useShareConflict(opts))
      act(() => result.current.finalizeSharedUrlLoad())
      expect(opts.timerControl.startTimer).not.toHaveBeenCalled()
    })

    it('always invokes consumeShareParams so the URL is cleaned even when the timer is gated', () => {
      setLocation(`${BASE_URL}?s=abc&t=1000`)
      const opts = buildOptions({ alreadyCompletedToday: true })
      const { result } = renderHook(() => useShareConflict(opts))
      act(() => result.current.finalizeSharedUrlLoad())
      expect(window.location.href).toBe(BASE_URL)
    })
  })

  describe('handleResumeOwnGame', () => {
    it('navigates to the resume target and sets the skip-check flag when a different-puzzle game is in progress', () => {
      getMostRecentGameMock.mockReturnValue({
        seed: 'other-puzzle',
        difficulty: 'hard',
        savedAt: 1,
        elapsedMs: 0,
        progress: 50,
      })
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1, 2], null, 'myseed'))
      expect(result.current.resumeTarget).toEqual({ seed: 'other-puzzle', difficulty: 'hard' })

      act(() => result.current.handleResumeOwnGame())

      expect(sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)).toBe('true')
      expect(opts.navigate).toHaveBeenCalledWith('/other-puzzle?d=hard')
      expect(result.current.showShareConflict).toBe(false)
      expect(result.current.shareResolvedRef.current).toBe(true)
    })

    it('navigates to home when there is no current game to keep', () => {
      // Defaults: loadSavedGameState returns null, getMostRecentGame returns null.
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))
      expect(result.current.resumeTarget).toBeNull()
      expect(result.current.shareHasCurrentGame).toBe(false)

      act(() => result.current.handleResumeOwnGame())

      expect(opts.navigate).toHaveBeenCalledWith('/')
      // No resume target means no skip-check flag.
      expect(sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)).toBeNull()
    })

    it('keeps the current game (no navigate) when the recipient has this-puzzle progress', () => {
      const opts = buildOptions({
        loadSavedGameState: vi.fn(() => makeSavedGame([createMockMove()])),
      })
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))
      expect(result.current.shareHasCurrentGame).toBe(true)
      expect(result.current.resumeTarget).toBeNull()

      act(() => result.current.handleResumeOwnGame())

      // Same-puzzle branch: modal closes but no navigation occurs.
      expect(opts.navigate).not.toHaveBeenCalled()
      expect(result.current.showShareConflict).toBe(false)
    })
  })

  describe('handleStartFromShared', () => {
    it('applies the shared board and starts the timer when neither gate flag is set', () => {
      isValidSolutionMock.mockReturnValue(true)
      const opts = buildOptions({
        sharedTimeParam: '1000',
        alreadyCompletedToday: false,
        showDifficultyChooser: false,
      })
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1, 2], [[1]], 'myseed'))
      expect(result.current.pendingSharedState?.elapsedMs).toBe(1000)

      act(() => result.current.handleStartFromShared())

      expect(opts.game.restoreState).toHaveBeenCalledTimes(1)
      expect(opts.timerControl.startTimer).toHaveBeenCalledTimes(1)
      expect(opts.timerControl.setElapsedMs).toHaveBeenCalledWith(1000)
      expect(result.current.showShareConflict).toBe(false)
      expect(result.current.pendingSharedState).toBeNull()
      expect(result.current.shareResolvedRef.current).toBe(true)
    })

    it('does not start the timer when alreadyCompletedToday is true (short-circuit)', () => {
      isValidSolutionMock.mockReturnValue(false)
      const opts = buildOptions({
        sharedTimeParam: '1000',
        alreadyCompletedToday: true,
        showDifficultyChooser: false,
      })
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))
      act(() => result.current.handleStartFromShared())

      expect(opts.game.restoreState).toHaveBeenCalledTimes(1)
      expect(opts.timerControl.startTimer).not.toHaveBeenCalled()
    })

    it('does not start the timer when showDifficultyChooser is true', () => {
      isValidSolutionMock.mockReturnValue(false)
      const opts = buildOptions({
        sharedTimeParam: '1000',
        alreadyCompletedToday: false,
        showDifficultyChooser: true,
      })
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))
      act(() => result.current.handleStartFromShared())

      expect(opts.game.restoreState).toHaveBeenCalledTimes(1)
      expect(opts.timerControl.startTimer).not.toHaveBeenCalled()
    })

    it('clears shareHasCurrentGame once the recipient discards their own progress', () => {
      isValidSolutionMock.mockReturnValue(false)
      const opts = buildOptions({
        loadSavedGameState: vi.fn(() => makeSavedGame([createMockMove()])),
      })
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))
      expect(result.current.shareHasCurrentGame).toBe(true)

      act(() => result.current.handleStartFromShared())

      // The kept game was just overwritten by the shared board, so the flag
      // that drives the "Resume current game" button must go back down.
      expect(result.current.shareHasCurrentGame).toBe(false)
    })

    it('skips applySharedBoard entirely when no pendingSharedState is set', () => {
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      // No prior restoreOrPromptSharedState: pendingSharedState stays null.
      act(() => result.current.handleStartFromShared())

      expect(opts.game.restoreState).not.toHaveBeenCalled()
      expect(opts.timerControl.startTimer).not.toHaveBeenCalled()
      expect(result.current.shareResolvedRef.current).toBe(true)
    })
  })

  describe('restoreOrPromptSharedState', () => {
    it('returns early without showing the modal when shareResolvedRef is already true', () => {
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))
      result.current.shareResolvedRef.current = true

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))

      expect(result.current.showShareConflict).toBe(false)
      expect(result.current.pendingSharedState).toBeNull()
    })

    it('classifies a same-puzzle save (history non-empty) as no-resume-target with a current game', () => {
      const opts = buildOptions({
        loadSavedGameState: vi.fn(() => makeSavedGame([createMockMove()])),
      })
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))

      expect(result.current.resumeTarget).toBeNull()
      expect(result.current.shareHasCurrentGame).toBe(true)
      expect(result.current.showShareConflict).toBe(true)
    })

    it('treats a same-puzzle save with an empty history as no progress worth keeping', () => {
      // A save exists but the recipient has not placed a single digit, so there
      // is nothing to resume: only a non-empty history counts as progress.
      const opts = buildOptions({ loadSavedGameState: vi.fn(() => makeSavedGame([])) })
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))

      expect(result.current.shareHasCurrentGame).toBe(false)
      expect(result.current.resumeTarget).toBeNull()
      expect(result.current.showShareConflict).toBe(true)
    })

    it('classifies a different-puzzle game in progress as a resume target', () => {
      getMostRecentGameMock.mockReturnValue({
        seed: 'other-puzzle',
        difficulty: 'medium',
        savedAt: 1,
        elapsedMs: 0,
        progress: 30,
      })
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))

      expect(result.current.resumeTarget).toEqual({ seed: 'other-puzzle', difficulty: 'medium' })
      expect(result.current.shareHasCurrentGame).toBe(true)
    })

    it('treats an other-game whose seed equals the current seed as the same puzzle', () => {
      // Covers the `otherGame.seed !== seed` short-circuit in the otherInProgress chain.
      getMostRecentGameMock.mockReturnValue({
        seed: 'myseed',
        difficulty: 'easy',
        savedAt: 1,
        elapsedMs: 0,
        progress: 40,
      })
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))

      expect(result.current.resumeTarget).toBeNull()
      expect(result.current.shareHasCurrentGame).toBe(false)
    })

    it('treats an other-game whose seed matches the encoded form as the same puzzle', () => {
      // Covers the `otherGame.seed !== encoded` short-circuit in the otherInProgress chain.
      getMostRecentGameMock.mockReturnValue({
        seed: 'encoded-form',
        difficulty: 'easy',
        savedAt: 1,
        elapsedMs: 0,
        progress: 40,
      })
      const opts = buildOptions({ encoded: 'encoded-form' })
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))

      expect(result.current.resumeTarget).toBeNull()
      expect(result.current.shareHasCurrentGame).toBe(false)
    })

    it('treats a completed other game (progress === 100) as not in progress', () => {
      // Covers the `otherGame.progress < 100` short-circuit in the otherInProgress chain.
      getMostRecentGameMock.mockReturnValue({
        seed: 'completed-game',
        difficulty: 'easy',
        savedAt: 1,
        elapsedMs: 0,
        progress: 100,
      })
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))

      expect(result.current.resumeTarget).toBeNull()
      expect(result.current.shareHasCurrentGame).toBe(false)
    })

    it('classifies as no-current-game when both this-puzzle save and other in-progress are absent', () => {
      // Defaults: loadSavedGameState -> null, getMostRecentGame -> null.
      const opts = buildOptions()
      const { result } = renderHook(() => useShareConflict(opts))

      act(() => result.current.restoreOrPromptSharedState([1], null, 'myseed'))

      expect(result.current.resumeTarget).toBeNull()
      expect(result.current.shareHasCurrentGame).toBe(false)
      expect(result.current.showShareConflict).toBe(true)
    })
  })

  describe('parseSharedElapsedMs (exercised via sharedTimeParam)', () => {
    it('returns null when sharedTimeParam is null', () => {
      const opts = buildOptions({ sharedTimeParam: null })
      const { result } = renderHook(() => useShareConflict(opts))
      act(() => result.current.restoreOrPromptSharedState([1], null, 'seed'))
      expect(result.current.pendingSharedState?.elapsedMs).toBeNull()
    })

    it('returns null when sharedTimeParam is non-numeric (parseInt yields NaN)', () => {
      const opts = buildOptions({ sharedTimeParam: 'abc' })
      const { result } = renderHook(() => useShareConflict(opts))
      act(() => result.current.restoreOrPromptSharedState([1], null, 'seed'))
      expect(result.current.pendingSharedState?.elapsedMs).toBeNull()
    })

    it('returns null when sharedTimeParam parses to zero (ms > 0 fails)', () => {
      const opts = buildOptions({ sharedTimeParam: '0' })
      const { result } = renderHook(() => useShareConflict(opts))
      act(() => result.current.restoreOrPromptSharedState([1], null, 'seed'))
      expect(result.current.pendingSharedState?.elapsedMs).toBeNull()
    })

    it('returns the positive millisecond value when sharedTimeParam is a positive integer', () => {
      const opts = buildOptions({ sharedTimeParam: '4500' })
      const { result } = renderHook(() => useShareConflict(opts))
      act(() => result.current.restoreOrPromptSharedState([1], null, 'seed'))
      expect(result.current.pendingSharedState?.elapsedMs).toBe(4500)
    })
  })
})
