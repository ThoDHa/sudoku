import { useEffect, useState } from 'react'
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

  // Compute initial in-progress state lazily (runs once per mount; seed
  // changes re-mount GameContent via its key). sessionStorage/localStorage
  // reads in initializers are the React-accepted lazy-init pattern.
  const [existingInProgressGame, setExistingInProgressGame] = useState<SavedGameInfo | null>(() => {
    const skip = sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)
    if (skip || sharedStateParam) return null
    const savedGame = getMostRecentGame()
    logger.debug(
      // Stryker disable next-line StringLiteral: log message content does not affect program behavior
      '[IN-PROGRESS CHECK] Current URL seed:',
      seed,
      // Stryker disable next-line StringLiteral: log message content does not affect program behavior
      'Saved game found:',
      // Stryker disable next-line StringLiteral: log label content does not affect program behavior
      savedGame ? savedGame.seed : 'none',
    )
    if (
      savedGame &&
      savedGame.seed !== seed &&
      savedGame.seed !== encoded &&
      savedGame.progress < 100
    ) {
      logger.debug(
        // Stryker disable next-line StringLiteral: log message content does not affect program behavior
        '[IN-PROGRESS CHECK] Showing modal: Existing game found',
        savedGame.seed,
        // Stryker disable next-line StringLiteral: log label content does not affect program behavior
        'vs current:',
        seed,
      )
      return savedGame
    }
    // Stryker disable next-line StringLiteral: log message content does not affect program behavior
    logger.debug('[IN-PROGRESS CHECK] No modal needed (no existing game or same seed)')
    return null
  })
  const [showInProgressConfirm, setShowInProgressConfirm] = useState(
    existingInProgressGame !== null,
  )

  // Mount-only: clean up the one-time skip flag (side effect, no setState)
  useEffect(() => {
    const skipInProgressCheck = sessionStorage.getItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)
    // Stryker disable next-line ConditionalExpression: removeItem on a missing key is a no-op, so always-true branching is observably identical to the guarded remove
    if (skipInProgressCheck) {
      sessionStorage.removeItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK)
    }
    // Stryker disable next-line ArrayDeclaration: useEffect deps are manual memoization; the effect is idempotent (read+remove) so re-running on identity changes is observably identical
  }, [])

  // Handlers for in-progress game confirmation modal
  const onResumeExistingGame = () => {
    if (existingInProgressGame) {
      // Set flag so we don't show modal again when navigating to resumed game
      sessionStorage.setItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK, 'true')
      const targetUrl = `/${existingInProgressGame.seed}?d=${existingInProgressGame.difficulty}`
      navigate(targetUrl)
    }
    setShowInProgressConfirm(false)
  }

  const onStartNewGame = () => {
    if (existingInProgressGame) {
      clearInProgressGame(existingInProgressGame.seed)
    }
    // Set flag so we don't check for in-progress games again after user explicitly chose "Start New"
    sessionStorage.setItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK, 'true')
    setShowInProgressConfirm(false)
    setExistingInProgressGame(null)
  }

  return {
    showInProgressConfirm,
    existingInProgressGame,
    onResumeExistingGame,
    onStartNewGame,
  }
}
