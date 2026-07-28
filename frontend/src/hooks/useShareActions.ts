import { useCallback } from 'react'
import { copyToClipboard } from '../lib/clipboard'
import { buildPuzzleShareUrl, buildStateShareUrl } from '../lib/shareLinks'
import { logger } from '../lib/logger'
import { TOAST_DURATION_INFO, TOAST_DURATION_ERROR } from '../lib/constants'

export interface ShareValidationMessage {
  type: 'success' | 'error' | 'info'
  message: string
  action?: { label: string; onClick: () => void }
}

export interface UseShareActionsOptions {
  isEncodedCustom: boolean
  seed: string | undefined
  difficulty: string
  givens: number[]
  board: number[]
  candidates: number[][]
  elapsedMs: number
  scheduleToastClear: (delay: number, onClear: () => void) => void
  setValidationMessage: (message: ShareValidationMessage | null) => void
}

export interface UseShareActionsReturn {
  onSharePuzzle: () => Promise<void>
  onShareState: () => Promise<void>
}

// Share-link actions for the GameHeader share buttons. Builds the puzzle and
// state share URLs (lib/shareLinks, already tested), copies to the clipboard,
// and surfaces success/failure through the shared validation-message toast.
export function useShareActions(options: UseShareActionsOptions): UseShareActionsReturn {
  const {
    isEncodedCustom,
    seed,
    difficulty,
    givens,
    board,
    candidates,
    elapsedMs,
    scheduleToastClear,
    setValidationMessage,
  } = options

  // Copy a share URL to the clipboard and surface the outcome as a toast.
  const copyShareUrl = useCallback(
    async (url: string, label: string) => {
      const success = await copyToClipboard(url)
      if (success) {
        setValidationMessage({ type: 'success', message: `${label} link copied to clipboard!` })
        scheduleToastClear(TOAST_DURATION_INFO, () => {
          setValidationMessage(null)
        })
      } else {
        setValidationMessage({ type: 'error', message: 'Failed to copy link' })
        // Stryker disable next-line BlockStatement: toast clearer only nulls the validation message; the surrounding test verifies the error toast was set, not that the clearer no-ops it
        scheduleToastClear(TOAST_DURATION_ERROR, () => {
          setValidationMessage(null)
        })
      }
    },
    // Stryker disable next-line ArrayDeclaration: useCallback deps are manual memoization to be replaced by React Compiler; test mocks provide stable objects
    [scheduleToastClear, setValidationMessage],
  )

  const handleShareError = useCallback(
    (err: unknown) => {
      logger.error('Share error:', err)
      setValidationMessage({ type: 'error', message: 'Failed to create share link' })
      // Stryker disable next-line BlockStatement: toast clearer only nulls the validation message; the error-path test asserts the error toast and the scheduled clear delay, not the clearer body
      scheduleToastClear(TOAST_DURATION_ERROR, () => {
        setValidationMessage(null)
      })
    },
    // Stryker disable next-line ArrayDeclaration: useCallback deps are manual memoization to be replaced by React Compiler; test mocks provide stable objects
    [scheduleToastClear, setValidationMessage],
  )

  // Share the bare puzzle (givens only): a short seed link for portable puzzles,
  // an encoded /c/ link for localStorage-backed ones.
  const onSharePuzzle = useCallback(async () => {
    try {
      const url = buildPuzzleShareUrl({
        isEncodedCustom,
        ...(seed !== undefined ? { seed } : {}),
        difficulty,
        givens,
      })
      await copyShareUrl(url, 'Puzzle')
    } catch (err) {
      handleShareError(err)
    }
    // Stryker disable next-line ArrayDeclaration: useCallback deps are manual memoization to be replaced by React Compiler; test mocks provide stable objects
  }, [isEncodedCustom, seed, difficulty, givens, copyShareUrl, handleShareError])

  // Share the exact current position: givens plus the player's entries, notes,
  // and elapsed time.
  const onShareState = useCallback(async () => {
    try {
      const url = buildStateShareUrl({
        isEncodedCustom,
        ...(seed !== undefined ? { seed } : {}),
        difficulty,
        givens,
        board,
        candidates,
        elapsedMs,
      })
      await copyShareUrl(url, 'Game')
    } catch (err) {
      handleShareError(err)
    }
    // Stryker disable next-line ArrayDeclaration: useCallback deps are manual memoization to be replaced by React Compiler; test mocks provide stable objects
  }, [
    isEncodedCustom,
    seed,
    difficulty,
    givens,
    board,
    candidates,
    elapsedMs,
    copyShareUrl,
    handleShareError,
  ])

  return { onSharePuzzle, onShareState }
}
