import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useShareActions } from './useShareActions'
import type { ShareValidationMessage } from './useShareActions'
import { TOAST_DURATION_INFO, TOAST_DURATION_ERROR } from '../lib/constants'

vi.mock('../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

vi.mock('../lib/shareLinks', () => ({
  buildPuzzleShareUrl: vi.fn(() => 'https://example.test/puzzle'),
  buildStateShareUrl: vi.fn(() => 'https://example.test/state'),
}))

vi.mock('../lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { copyToClipboard } from '../lib/clipboard'
import { buildPuzzleShareUrl, buildStateShareUrl } from '../lib/shareLinks'
import { logger } from '../lib/logger'

const mockedCopyToClipboard = vi.mocked(copyToClipboard)
const mockedBuildPuzzleShareUrl = vi.mocked(buildPuzzleShareUrl)
const mockedBuildStateShareUrl = vi.mocked(buildStateShareUrl)
const mockedLoggerError = vi.mocked(logger.error)

function renderShareHook(overrides: Partial<Parameters<typeof useShareActions>[0]> = {}) {
  const setValidationMessage = vi.fn()
  // The real scheduleToastClear fires its callback after the delay; invoke it
  // synchronously here so every `() => setValidationMessage(null)` clearer arrow
  // is exercised (not just captured) for full coverage.
  const scheduleToastClear = vi.fn((_delay: number, cb: () => void) => cb())
  const result = renderHook(
    (props: Parameters<typeof useShareActions>[0]) => useShareActions(props),
    {
      initialProps: {
        isEncodedCustom: false,
        seed: 'daily-x',
        difficulty: 'medium',
        givens: [1, 2, 3],
        board: [1, 2, 3],
        candidates: [[], []],
        elapsedMs: 44000,
        scheduleToastClear,
        setValidationMessage,
        ...overrides,
      } as Parameters<typeof useShareActions>[0],
    },
  )
  return { ...result, setValidationMessage, scheduleToastClear }
}

describe('useShareActions', () => {
  beforeEach(() => {
    mockedCopyToClipboard.mockReset()
    mockedBuildPuzzleShareUrl.mockReset()
    mockedBuildStateShareUrl.mockReset()
    mockedLoggerError.mockReset()
    mockedBuildPuzzleShareUrl.mockReturnValue('https://example.test/puzzle')
    mockedBuildStateShareUrl.mockReturnValue('https://example.test/state')
  })

  describe('onSharePuzzle', () => {
    it('copies the puzzle URL and surfaces a success toast with the info duration', async () => {
      mockedCopyToClipboard.mockResolvedValue(true)
      const { result, scheduleToastClear, setValidationMessage } = renderShareHook()

      await act(async () => {
        await result.current.onSharePuzzle()
      })

      expect(mockedBuildPuzzleShareUrl).toHaveBeenCalledWith({
        isEncodedCustom: false,
        seed: 'daily-x',
        difficulty: 'medium',
        givens: [1, 2, 3],
      })
      expect(mockedCopyToClipboard).toHaveBeenCalledWith('https://example.test/puzzle')
      expect(setValidationMessage).toHaveBeenCalledWith({
        type: 'success',
        message: 'Puzzle link copied to clipboard!',
      })
      expect(scheduleToastClear).toHaveBeenCalledWith(TOAST_DURATION_INFO, expect.any(Function))
    })

    it('surfaces an error toast when the clipboard write fails', async () => {
      mockedCopyToClipboard.mockResolvedValue(false)
      const { result, scheduleToastClear, setValidationMessage } = renderShareHook()

      await act(async () => {
        await result.current.onSharePuzzle()
      })

      expect(setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to copy link',
      })
      expect(scheduleToastClear).toHaveBeenCalledWith(TOAST_DURATION_ERROR, expect.any(Function))
    })

    it('routes a builder throw to the share-error toast and logs it', async () => {
      mockedBuildPuzzleShareUrl.mockImplementation(() => {
        throw new Error('encode blew up')
      })
      const { result, scheduleToastClear, setValidationMessage } = renderShareHook()

      await act(async () => {
        await result.current.onSharePuzzle()
      })

      expect(mockedLoggerError).toHaveBeenCalledWith('Share error:', expect.any(Error))
      expect(setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to create share link',
      })
      expect(scheduleToastClear).toHaveBeenCalledWith(TOAST_DURATION_ERROR, expect.any(Function))
      // Clipboard must never be reached when the builder throws.
      expect(mockedCopyToClipboard).not.toHaveBeenCalled()
    })
  })

  describe('onShareState', () => {
    it('builds the state URL from board/candidates/elapsed and surfaces a success toast', async () => {
      mockedCopyToClipboard.mockResolvedValue(true)
      const { result, scheduleToastClear, setValidationMessage } = renderShareHook({
        board: [5, 6],
        candidates: [[1], [2]],
        elapsedMs: 9000,
      })

      await act(async () => {
        await result.current.onShareState()
      })

      expect(mockedBuildStateShareUrl).toHaveBeenCalledWith({
        isEncodedCustom: false,
        seed: 'daily-x',
        difficulty: 'medium',
        givens: [1, 2, 3],
        board: [5, 6],
        candidates: [[1], [2]],
        elapsedMs: 9000,
      })
      expect(mockedCopyToClipboard).toHaveBeenCalledWith('https://example.test/state')
      expect(setValidationMessage).toHaveBeenCalledWith({
        type: 'success',
        message: 'Game link copied to clipboard!',
      })
      expect(scheduleToastClear).toHaveBeenCalledWith(TOAST_DURATION_INFO, expect.any(Function))
    })

    it('surfaces an error toast when the clipboard write fails', async () => {
      mockedCopyToClipboard.mockResolvedValue(false)
      const { result, setValidationMessage } = renderShareHook()

      await act(async () => {
        await result.current.onShareState()
      })

      expect(setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to copy link',
      })
    })

    it('routes a state-builder throw to the share-error toast', async () => {
      mockedBuildStateShareUrl.mockImplementation(() => {
        throw new Error('state encode failed')
      })
      const { result, setValidationMessage } = renderShareHook()

      await act(async () => {
        await result.current.onShareState()
      })

      expect(mockedLoggerError).toHaveBeenCalledWith('Share error:', expect.any(Error))
      expect(setValidationMessage).toHaveBeenCalledWith({
        type: 'error',
        message: 'Failed to create share link',
      })
      expect(mockedCopyToClipboard).not.toHaveBeenCalled()
    })
  })

  describe('seed omission', () => {
    it('builds both URLs without a seed field when seed is undefined', async () => {
      mockedCopyToClipboard.mockResolvedValue(true)
      const { result } = renderShareHook({ seed: undefined })

      await act(async () => {
        await result.current.onSharePuzzle()
      })
      expect(mockedBuildPuzzleShareUrl).toHaveBeenCalledWith({
        isEncodedCustom: false,
        difficulty: 'medium',
        givens: [1, 2, 3],
      })

      await act(async () => {
        await result.current.onShareState()
      })
      expect(mockedBuildStateShareUrl).toHaveBeenCalledWith({
        isEncodedCustom: false,
        difficulty: 'medium',
        givens: [1, 2, 3],
        board: [1, 2, 3],
        candidates: [[], []],
        elapsedMs: 44000,
      })
    })
  })

  describe('toast clear callback clears the message', () => {
    it('invokes the scheduled clearer with a function that nulls the validation message', async () => {
      mockedCopyToClipboard.mockResolvedValue(true)
      const { result, scheduleToastClear, setValidationMessage } = renderShareHook()

      await act(async () => {
        await result.current.onSharePuzzle()
      })

      const call = scheduleToastClear.mock.calls[0]
      if (!call) throw new Error('expected a scheduled clear')
      const clearer = call[1] as () => void
      clearer()
      expect(setValidationMessage).toHaveBeenLastCalledWith(null)
    })
  })

  it('accepts a typed ShareValidationMessage via setValidationMessage without type errors', async () => {
    mockedCopyToClipboard.mockResolvedValue(true)
    const { result, setValidationMessage } = renderShareHook()

    await act(async () => {
      await result.current.onSharePuzzle()
    })

    const call = setValidationMessage.mock.calls[0]
    if (!call) throw new Error('expected a validation message')
    const firstCallArg = call[0] as ShareValidationMessage
    expect(firstCallArg.type).toBe('success')
  })

  it('awaits resolution before returning (promise ordering)', async () => {
    let resolveCopy: (value: boolean) => void = () => {}
    mockedCopyToClipboard.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCopy = resolve
      }),
    )
    const { result, setValidationMessage } = renderShareHook()

    let settled = false
    const promise = act(async () => {
      await result.current.onSharePuzzle()
      settled = true
    })

    // While the clipboard promise is pending, the success toast must not have fired.
    expect(setValidationMessage).not.toHaveBeenCalled()
    resolveCopy(true)
    await promise
    await waitFor(() => {
      expect(settled).toBe(true)
    })
    expect(setValidationMessage).toHaveBeenCalled()
  })
})
