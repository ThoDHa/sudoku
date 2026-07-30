import { useRef, useState } from 'react'
import type { RefObject } from 'react'
import { isValidSolution } from '../lib/validationUtils'
import { arraysToCandidates } from '../lib/candidatesUtils'
import { getMostRecentGame } from '../lib/gameSettings'
import { STORAGE_KEYS } from '../lib/constants'
import type { UseSudokuGameReturn } from './useSudokuGame'
import type { useTimerControl } from '../lib/TimerContext'
import type { SavedGameState } from '../lib/savedGameState'

type TimerControl = ReturnType<typeof useTimerControl>

export interface SharedBoardPayload {
  board: number[]
  candidates: number[][] | null
  elapsedMs: number | null
}

export interface ResumeTarget {
  seed: string
  difficulty: string
}

export interface UseShareConflictOptions {
  game: UseSudokuGameReturn
  timerControl: TimerControl
  restoredAsCompleteRef: RefObject<boolean>
  hasRestoredSavedState: RefObject<boolean>
  loadedFromSharedUrl: RefObject<boolean>
  alreadyCompletedToday: boolean
  showDifficultyChooser: boolean
  sharedTimeParam: string | null
  encoded: string | undefined
  loadSavedGameState: (puzzleSeed: string) => SavedGameState | null
  navigate: (path: string) => void
}

export interface UseShareConflictReturn {
  showShareConflict: boolean
  pendingSharedState: SharedBoardPayload | null
  resumeTarget: ResumeTarget | null
  shareHasCurrentGame: boolean
  shareResolvedRef: RefObject<boolean>
  applySharedBoard: (shared: SharedBoardPayload) => void
  consumeShareParams: () => void
  finalizeSharedUrlLoad: () => void
  handleResumeOwnGame: () => void
  handleStartFromShared: () => void
  restoreOrPromptSharedState: (board: number[], candidates: number[][] | null, seed: string) => void
}

// Parse a shared `t` elapsed-time param into positive milliseconds, or null.
function parseSharedElapsedMs(sharedTimeParam: string | null): number | null {
  if (!sharedTimeParam) {
    return null
  }
  const ms = parseInt(sharedTimeParam, 10)
  return Number.isFinite(ms) && ms > 0 ? ms : null
}

/**
 * Owns the share-link conflict flow: when a recipient opens a state-link (`s`/`t`
 * params), classify their current game (same-puzzle save, different-puzzle game,
 * or none) and surface a modal letting them choose "Load shared game" vs "Resume
 * mine". Owns the modal state, the shared-board apply, the one-time share-param
 * strip from the URL, and the restore-finalize handshake with the restore effect.
 *
 * The refs `hasRestoredSavedStateRef`, `loadedFromSharedUrlRef`, and
 * `restoredAsCompleteRef` cross the boundary explicitly because the restore
 * orchestration in Game reads/writes them; this hook never hides that state.
 */
export function useShareConflict({
  game,
  timerControl,
  restoredAsCompleteRef,
  hasRestoredSavedState: hasRestoredSavedStateRef,
  loadedFromSharedUrl: loadedFromSharedUrlRef,
  alreadyCompletedToday,
  showDifficultyChooser,
  sharedTimeParam,
  encoded,
  loadSavedGameState,
  navigate,
}: UseShareConflictOptions): UseShareConflictReturn {
  // Shared state-link vs the recipient's own saved progress for the same puzzle:
  // when both exist, the recipient chooses (resume mine / open shared) instead of
  // one silently winning. Pending holds the shared board until they decide.
  const [showShareConflict, setShowShareConflict] = useState(false)
  const [pendingSharedState, setPendingSharedState] = useState<SharedBoardPayload | null>(null)
  // When the shared-game modal is up and the game in progress is a DIFFERENT puzzle
  // than the shared one, this holds where dismissing the modal navigates back to.
  // Null means the in-progress game is this same puzzle (dismiss = keep the board).
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget | null>(null)
  // Whether a game is in progress when the shared-game modal is shown. Drives the
  // "Resume current game" button (shown only then) and the dismiss behavior:
  // with a game, dismiss keeps it; without one, dismiss goes to the homepage.
  const [shareHasCurrentGame, setShareHasCurrentGame] = useState(false)
  const shareResolvedRef = useRef(false)

  // Overlay a shared board (from a state-link's `s`/`t`) onto the current game.
  const applySharedBoard = (shared: SharedBoardPayload) => {
    const candidatesArray = shared.candidates ?? Array.from({ length: 81 }, () => [] as number[])
    restoredAsCompleteRef.current = isValidSolution(shared.board)
    game.restoreState(shared.board, arraysToCandidates(candidatesArray), [])
    if (shared.elapsedMs !== null) {
      timerControl.setElapsedMs(shared.elapsedMs)
    }
  }

  // Drop the one-time `s`/`t` share params from the URL so a later reload takes
  // the normal saved-state path instead of re-applying the sharer's snapshot.
  // Uses history.replaceState rather than the router's setSearchParams, which did
  // not persist when called from the initial-load effect; this cleans the address
  // bar reliably without re-navigating (the shared state is already applied).
  const consumeShareParams = () => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('s') && !url.searchParams.has('t')) {
      return
    }
    url.searchParams.delete('s')
    url.searchParams.delete('t')
    window.history.replaceState(window.history.state, '', url.toString())
  }

  // Finalize a shared-URL load: mark restored, start the clock, and consume the
  // one-time share params so a later reload takes the normal saved-state path.
  const finalizeSharedUrlLoad = () => {
    loadedFromSharedUrlRef.current = false
    hasRestoredSavedStateRef.current = true
    if (!alreadyCompletedToday && !showDifficultyChooser) {
      timerControl.startTimer()
    }
    // consumeShareParams self-guards on the actual URL, so call it unconditionally
    // (a stale sharedStateParam closure was suppressing the strip).
    consumeShareParams()
  }

  // Shared-game modal dismissed (Resume current game, the X, or the backdrop):
  // keep what the recipient was doing instead of loading the shared game.
  const handleResumeOwnGame = () => {
    shareResolvedRef.current = true
    setShowShareConflict(false)
    setPendingSharedState(null)
    consumeShareParams()
    if (resumeTarget) {
      // Current game is a different puzzle: navigate back to it. The flag stops the
      // in-progress check from re-prompting on arrival.
      sessionStorage.setItem(STORAGE_KEYS.SKIP_IN_PROGRESS_CHECK, 'true')
      navigate(`/${resumeTarget.seed}?d=${resumeTarget.difficulty}`)
      setResumeTarget(null)
    } else if (!shareHasCurrentGame) {
      // No game to keep: back out of the shared link to the homepage.
      navigate('/')
    }
    // Otherwise the current game is this same puzzle: its saved board is already
    // restored, so closing the modal keeps it.
  }

  // Share-conflict modal: recipient discards their progress for the shared position.
  const handleStartFromShared = () => {
    if (pendingSharedState) {
      applySharedBoard(pendingSharedState)
      if (!alreadyCompletedToday && !showDifficultyChooser) {
        timerControl.startTimer()
      }
    }
    shareResolvedRef.current = true
    setShowShareConflict(false)
    setPendingSharedState(null)
    setResumeTarget(null)
    setShareHasCurrentGame(false)
    consumeShareParams()
  }

  // On a shared state-link, always prompt before loading the shared game (the
  // recipient chooses "Load shared game", or dismisses to keep what they were
  // doing / return home). Kept out of loadPuzzle for clarity.
  const restoreOrPromptSharedState = (
    board: number[],
    candidates: number[][] | null,
    seed: string,
  ) => {
    if (shareResolvedRef.current) {
      return
    }
    const shared = { board, candidates, elapsedMs: parseSharedElapsedMs(sharedTimeParam) }
    // Classify the recipient's current game: their own save for THIS puzzle, a
    // game on a DIFFERENT puzzle, or none. It decides the modal's buttons and
    // what dismissing does.
    const saved = loadSavedGameState(seed)
    const hasThisPuzzleProgress = !!(saved && saved.history.length > 0)
    const otherGame = getMostRecentGame()
    const otherInProgress =
      !!otherGame &&
      otherGame.seed !== seed &&
      otherGame.seed !== encoded &&
      otherGame.progress < 100
    setPendingSharedState(shared)
    // Different-puzzle game: dismiss = go back to it. Same-puzzle or none: no target.
    setResumeTarget(
      !hasThisPuzzleProgress && otherInProgress && otherGame
        ? { seed: otherGame.seed, difficulty: otherGame.difficulty }
        : null,
    )
    setShareHasCurrentGame(hasThisPuzzleProgress || otherInProgress)
    setShowShareConflict(true)
  }

  return {
    showShareConflict,
    pendingSharedState,
    resumeTarget,
    shareHasCurrentGame,
    shareResolvedRef,
    applySharedBoard,
    consumeShareParams,
    finalizeSharedUrlLoad,
    handleResumeOwnGame,
    handleStartFromShared,
    restoreOrPromptSharedState,
  }
}
