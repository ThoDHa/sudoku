import { useCallback, useEffect, useRef, useState } from 'react'
import { getMostRecentGame, clearInProgressGame, type SavedGameInfo } from '../lib/gameSettings'
import { STORAGE_KEYS } from '../lib/constants'
import { logger } from '../lib/logger'

export interface UseInProgressGameCheckOptions {
  seed: string | undefined
  encoded: string | undefined
  sharedStateParam: string | null
  navigate: (path: string) => void
}

export interface UseInProgressGameCheckReturn {
  showInProgressConfirm: boolean
  existingInProgressGame: SavedGameInfo | null
  onResumeExistingGame: () => void
  onStartNewGame: () => void
}

// Detects a saved in-progress game for a DIFFERENT seed than the one the user
// is navigating to, and surfaces a resume-vs-new confirmation. The effect is
// mount-gated by handledInitialNavigationRef so it runs at most once per mount
// (seed changes re-mount GameContent via its key, but the generic check must not
// re-fire mid-session). A shared-state link (?s=...) yields to
// restoreOrPromptSharedState, which owns the resume-vs-open-shared choice.
export function useInProgressGameCheck(
  options: UseInProgressGameCheckOptions,
): UseInProgressGameCheckReturn {
  const { seed, encoded, sharedStateParam, navigate } = options

  // Track if we've handled initial navigation (to prevent in-progress check after seed changes)
  const handledInitialNavigationRef = useRef(false)
  const [showInProgressConfirm, setShowInProgressConfirm] = useState(false)
  const [existingInProgressGame, setExistingInProgressGame] = useState<SavedGameInfo | null>(null)

  // Check for existing in-progress game when navigating to a different puzzle
  useEffect(() => {
    // Skip if user already confirmed navigation (from Homepage or Menu)
    // Both Homepage and Menu handle their own in-progress confirmations
    // Also skip if we've already handled initial navigation (to prevent check after seed changes)
    const skipInProgressCheck = sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)
    if (skipInProgressCheck) {
      sessionStorage.removeItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)
    }
    if (skipInProgressCheck || handledInitialNavigationRef.current) {
      return
    }

    // A shared-state link (?s=…) carries the sharer's position, and
    // restoreOrPromptSharedState owns the resume-vs-open-shared choice. The generic
    // "resume your other game" prompt must not race it (loadPuzzle is async, so this
    // effect would otherwise fire first and its Resume would navigate away to an
    // unrelated saved game). Mark navigation handled so it stays skipped after
    // consumeShareParams strips the s param and this effect re-runs. See SHARE-2.
    if (sharedStateParam) {
      handledInitialNavigationRef.current = true
      return
    }

    const savedGame = getMostRecentGame()
    // Mark that we've handled initial navigation for this component mount
    handledInitialNavigationRef.current = true
    logger.debug(
      '[IN-PROGRESS CHECK] Current URL seed:',
      seed,
      'Saved game found:',
      savedGame ? savedGame.seed : 'none',
    )
    // Show prompt if:
    // - There's a saved game
    // - It's for a DIFFERENT seed than what we're trying to load
    // - It's not complete (progress < 100%)
    if (
      savedGame &&
      savedGame.seed !== seed &&
      savedGame.seed !== encoded &&
      savedGame.progress < 100
    ) {
      logger.debug(
        '[IN-PROGRESS CHECK] Showing modal: Existing game found',
        savedGame.seed,
        'vs current:',
        seed,
      )
      setExistingInProgressGame(savedGame)
      setShowInProgressConfirm(true)
    } else {
      logger.debug('[IN-PROGRESS CHECK] No modal needed (no existing game or same seed)')
    }
  }, [seed, encoded, sharedStateParam])

  // Handlers for in-progress game confirmation modal
  const onResumeExistingGame = useCallback(() => {
    if (existingInProgressGame) {
      // Set flag so we don't show modal again when navigating to resumed game
      sessionStorage.setItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK, 'true')
      const targetUrl = `/${existingInProgressGame.seed}?d=${existingInProgressGame.difficulty}`
      navigate(targetUrl)
    }
    setShowInProgressConfirm(false)
  }, [existingInProgressGame, navigate])

  const onStartNewGame = useCallback(() => {
    if (existingInProgressGame) {
      clearInProgressGame(existingInProgressGame.seed)
    }
    // Set flag so we don't check for in-progress games again after user explicitly chose "Start New"
    sessionStorage.setItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK, 'true')
    setShowInProgressConfirm(false)
    setExistingInProgressGame(null)
  }, [existingInProgressGame])

  return {
    showInProgressConfirm,
    existingInProgressGame,
    onResumeExistingGame,
    onStartNewGame,
  }
}
