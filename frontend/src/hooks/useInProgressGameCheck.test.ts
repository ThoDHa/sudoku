import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useInProgressGameCheck } from './useInProgressGameCheck'
import { STORAGE_KEYS } from '../lib/constants'
import type { SavedGameInfo } from '../lib/gameSettings'

vi.mock('../lib/gameSettings', () => ({
  getMostRecentGame: vi.fn(() => null),
  clearInProgressGame: vi.fn(),
}))

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { getMostRecentGame, clearInProgressGame } from '../lib/gameSettings'

const mockedGetMostRecentGame = vi.mocked(getMostRecentGame)
const mockedClearInProgressGame = vi.mocked(clearInProgressGame)

function makeSavedGame(overrides: Partial<SavedGameInfo> = {}): SavedGameInfo {
  return {
    seed: 'saved-seed',
    difficulty: 'hard',
    savedAt: 1000,
    elapsedMs: 5000,
    progress: 50,
    ...overrides,
  }
}

function renderInProgressHook(
  overrides: {
    seed?: string | undefined
    encoded?: string | undefined
    sharedStateParam?: string | null
    navigate?: (path: string) => void
  } = {},
) {
  const navigate = overrides.navigate ?? vi.fn()
  const result = renderHook(
    ({
      seed,
      encoded,
      sharedStateParam,
      navigate,
    }: {
      seed: string | undefined
      encoded: string | undefined
      sharedStateParam: string | null
      navigate: (path: string) => void
    }) => useInProgressGameCheck({ seed, encoded, sharedStateParam, navigate }),
    {
      initialProps: {
        seed: overrides.seed ?? 'current-seed',
        encoded: overrides.encoded ?? undefined,
        sharedStateParam: overrides.sharedStateParam ?? null,
        navigate,
      },
    },
  )
  return { ...result, navigate }
}

describe('useInProgressGameCheck', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockedGetMostRecentGame.mockReset()
    mockedClearInProgressGame.mockReset()
    mockedGetMostRecentGame.mockReturnValue(null)
  })

  describe('initial check effect', () => {
    it('shows no modal when there is no saved game', () => {
      mockedGetMostRecentGame.mockReturnValue(null)
      const { result } = renderInProgressHook({ seed: 'current-seed' })
      expect(result.current.showInProgressConfirm).toBe(false)
      expect(result.current.existingInProgressGame).toBeNull()
    })

    it('shows no modal when the saved game is for the same seed', () => {
      mockedGetMostRecentGame.mockReturnValue(makeSavedGame({ seed: 'current-seed' }))
      const { result } = renderInProgressHook({ seed: 'current-seed' })
      expect(result.current.showInProgressConfirm).toBe(false)
      expect(result.current.existingInProgressGame).toBeNull()
    })

    it('shows no modal when the saved game matches the encoded segment', () => {
      mockedGetMostRecentGame.mockReturnValue(makeSavedGame({ seed: 'encoded-blob' }))
      const { result } = renderInProgressHook({ seed: 'current-seed', encoded: 'encoded-blob' })
      expect(result.current.showInProgressConfirm).toBe(false)
    })

    it('shows no modal when the saved game is already complete (progress >= 100)', () => {
      mockedGetMostRecentGame.mockReturnValue(makeSavedGame({ seed: 'other-seed', progress: 100 }))
      const { result } = renderInProgressHook({ seed: 'current-seed' })
      expect(result.current.showInProgressConfirm).toBe(false)
      expect(result.current.existingInProgressGame).toBeNull()
    })

    it('shows the modal when a different, incomplete saved game exists', () => {
      const saved = makeSavedGame({ seed: 'other-seed', progress: 30, difficulty: 'medium' })
      mockedGetMostRecentGame.mockReturnValue(saved)
      const { result } = renderInProgressHook({ seed: 'current-seed' })
      expect(result.current.showInProgressConfirm).toBe(true)
      expect(result.current.existingInProgressGame).toEqual(saved)
    })

    it('consumes and honors the SKIP_IN_PROGRESS_CHECK sessionStorage flag (no modal)', () => {
      sessionStorage.setItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK, 'true')
      mockedGetMostRecentGame.mockReturnValue(makeSavedGame({ seed: 'other-seed' }))
      const { result } = renderInProgressHook({ seed: 'current-seed' })
      expect(result.current.showInProgressConfirm).toBe(false)
      // Flag is consumed (removed) after being honored.
      expect(sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)).toBeNull()
    })

    it('yields to a shared-state link and shows no modal even when a saved game exists', () => {
      mockedGetMostRecentGame.mockReturnValue(makeSavedGame({ seed: 'other-seed' }))
      const { result } = renderInProgressHook({
        seed: 'current-seed',
        sharedStateParam: 'shared-state',
      })
      expect(result.current.showInProgressConfirm).toBe(false)
      expect(result.current.existingInProgressGame).toBeNull()
    })

    it('runs the check at most once per mount even if deps re-fire with the same values', () => {
      mockedGetMostRecentGame.mockReturnValue(makeSavedGame({ seed: 'other-seed' }))
      const { result, rerender } = renderInProgressHook({ seed: 'current-seed' })
      expect(result.current.showInProgressConfirm).toBe(true)
      // The first run already marked navigation handled; a same-deps rerender must not
      // re-invoke getMostRecentGame or reset the modal state.
      const callsAfterFirst = mockedGetMostRecentGame.mock.calls.length
      rerender({
        seed: 'current-seed',
        encoded: undefined,
        sharedStateParam: null,
        navigate: vi.fn(),
      })
      expect(mockedGetMostRecentGame.mock.calls.length).toBe(callsAfterFirst)
    })

    it('suppresses the check when the seed changes within the same mount', () => {
      // The parent (<Game>) remounts GameContent via key={seed}, so a genuine seed
      // change starts a fresh hook instance. Within one mount, however, the
      // handledInitialNavigationRef guard must keep the check from re-firing on a
      // mid-session seed change (this is the regression it was added to prevent).
      mockedGetMostRecentGame.mockReturnValue(null)
      const { rerender } = renderInProgressHook({ seed: 'seed-a' })
      const callsAfterFirst = mockedGetMostRecentGame.mock.calls.length
      expect(callsAfterFirst).toBeGreaterThanOrEqual(1)

      mockedGetMostRecentGame.mockReturnValue(makeSavedGame({ seed: 'totally-different' }))
      rerender({
        seed: 'seed-b',
        encoded: undefined,
        sharedStateParam: null,
        navigate: vi.fn(),
      })

      expect(mockedGetMostRecentGame.mock.calls.length).toBe(callsAfterFirst)
    })
  })

  describe('onResumeExistingGame', () => {
    it('navigates to the saved game URL, sets the skip flag, and closes the modal', async () => {
      const saved = makeSavedGame({ seed: 'other-seed', difficulty: 'hard', progress: 30 })
      mockedGetMostRecentGame.mockReturnValue(saved)
      const navigate = vi.fn()
      const { result } = renderInProgressHook({ seed: 'current-seed', navigate })
      expect(result.current.showInProgressConfirm).toBe(true)

      act(() => {
        result.current.onResumeExistingGame()
      })

      expect(navigate).toHaveBeenCalledWith('/other-seed?d=hard')
      expect(sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)).toBe('true')
      await waitFor(() => {
        expect(result.current.showInProgressConfirm).toBe(false)
      })
    })

    it('only closes the modal when there is no existing game (no navigation)', () => {
      mockedGetMostRecentGame.mockReturnValue(null)
      const navigate = vi.fn()
      const { result } = renderInProgressHook({ seed: 'current-seed', navigate })
      act(() => {
        result.current.onResumeExistingGame()
      })
      expect(navigate).not.toHaveBeenCalled()
      expect(result.current.showInProgressConfirm).toBe(false)
    })
  })

  describe('onStartNewGame', () => {
    it('clears the saved game, sets the skip flag, closes the modal, and clears state', async () => {
      const saved = makeSavedGame({ seed: 'other-seed', progress: 30 })
      mockedGetMostRecentGame.mockReturnValue(saved)
      const { result } = renderInProgressHook({ seed: 'current-seed' })
      expect(result.current.existingInProgressGame).not.toBeNull()

      act(() => {
        result.current.onStartNewGame()
      })

      expect(mockedClearInProgressGame).toHaveBeenCalledWith('other-seed')
      expect(sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)).toBe('true')
      await waitFor(() => {
        expect(result.current.showInProgressConfirm).toBe(false)
      })
      expect(result.current.existingInProgressGame).toBeNull()
    })

    it('does not call clearInProgressGame when there is no existing game', () => {
      mockedGetMostRecentGame.mockReturnValue(null)
      const { result } = renderInProgressHook({ seed: 'current-seed' })
      act(() => {
        result.current.onStartNewGame()
      })
      expect(mockedClearInProgressGame).not.toHaveBeenCalled()
      expect(sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)).toBe('true')
    })
  })

  describe('diagnostic log content', () => {
    it('logs the exact decision messages when the modal is shown', async () => {
      const loggerMod = await import('../lib/logger')
      const debugMock = vi.mocked(loggerMod.logger.debug)
      mockedGetMostRecentGame.mockReturnValue(makeSavedGame())
      renderInProgressHook({ seed: 'current-seed' })
      expect(debugMock).toHaveBeenCalledWith(
        '[IN-PROGRESS CHECK] Current URL seed:',
        'current-seed',
        'Saved game found:',
        'saved-seed',
      )
      expect(debugMock).toHaveBeenCalledWith(
        '[IN-PROGRESS CHECK] Showing modal: Existing game found',
        'saved-seed',
        'vs current:',
        'current-seed',
      )
    })

    it('logs the exact no-modal messages when no saved game exists', async () => {
      const loggerMod = await import('../lib/logger')
      const debugMock = vi.mocked(loggerMod.logger.debug)
      renderInProgressHook({ seed: 'current-seed' })
      expect(debugMock).toHaveBeenCalledWith(
        '[IN-PROGRESS CHECK] Current URL seed:',
        'current-seed',
        'Saved game found:',
        'none',
      )
      expect(debugMock).toHaveBeenCalledWith(
        '[IN-PROGRESS CHECK] No modal needed (no existing game or same seed)',
      )
    })
  })
})
