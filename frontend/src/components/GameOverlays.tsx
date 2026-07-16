/**
 * GameOverlays - Raw overlay modals for the Game page
 *
 * This component contains three modal dialogs rendered as raw overlays
 * (using the data-overlay-backdrop / data-modal markup pattern):
 * 1. In-Progress Game Confirmation - offers to resume or start new when a game is in progress
 * 2. Shared-link "Load shared game?" - offers to load a shared puzzle
 * 3. Difficulty Chooser - shown when opening a shared link without a difficulty
 */

import { CloseIcon } from './ui'
import DifficultyGrid from './DifficultyGrid'
import { Difficulty } from '../lib/hooks'
import { type SavedGameInfo } from '../lib/gameSettings'

interface GameOverlaysProps {
  // In-Progress Game Confirmation Modal
  showInProgressConfirm: boolean
  existingInProgressGame: SavedGameInfo | null
  onStartNewGame: () => void
  onResumeExistingGame: () => void

  // Shared-link "Load shared game?" Modal
  showShareConflict: boolean
  shareHasCurrentGame: boolean
  onResumeOwnGame: () => void
  onStartFromShared: () => void

  // Difficulty Chooser Modal
  showDifficultyChooser: boolean
  seed: string
  onSelectDifficulty: (difficulty: Difficulty) => void
  onCloseDifficultyChooser: () => void
  pathname: string
}

export default function GameOverlays({
  showInProgressConfirm,
  existingInProgressGame,
  onStartNewGame,
  onResumeExistingGame,
  showShareConflict,
  shareHasCurrentGame,
  onResumeOwnGame,
  onStartFromShared,
  showDifficultyChooser,
  seed,
  onSelectDifficulty,
  onCloseDifficultyChooser,
  pathname,
}: GameOverlaysProps) {
  return (
    <>
      {/* In-Progress Game Confirmation Modal */}
      {showInProgressConfirm && existingInProgressGame && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-overlay-backdrop
        >
          <div
            className="w-full max-w-sm rounded-xl bg-background-secondary p-6 shadow-theme"
            data-modal
          >
            <h2 className="mb-2 text-lg font-semibold text-foreground">Game In Progress</h2>
            <p className="mb-6 text-sm text-foreground-muted">
              You have a{' '}
              <span className="capitalize font-medium">{existingInProgressGame.difficulty}</span>{' '}
              game in progress ({existingInProgressGame.progress}% complete). Do you want to
              continue that game or start a new one?
            </p>
            <div className="flex gap-3">
              <button
                onClick={onStartNewGame}
                className="flex-1 rounded-lg border border-board-border-light px-4 py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
              >
                Start New
              </button>
              <button
                onClick={onResumeExistingGame}
                className="flex-1 rounded-lg bg-accent px-4 py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared-link modal: offer to load the shared game. When a game is in
          progress, a "Resume current game" button (and the X/backdrop) keeps it,
          navigating back when the shared link is for a different puzzle. With no
          game in progress, the X/backdrop backs out to the homepage. */}
      {showShareConflict && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-overlay-backdrop
          onClick={onResumeOwnGame}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-background-secondary p-6 shadow-theme"
            data-modal
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onResumeOwnGame}
              className="absolute right-3 top-3 rounded p-1 text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
              aria-label="Close"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
            <h2 className="mb-6 pr-8 text-lg font-semibold text-foreground">Load shared game?</h2>
            <div className="flex gap-3">
              {shareHasCurrentGame && (
                <button
                  onClick={onResumeOwnGame}
                  className="flex-1 rounded-lg border border-board-border-light px-4 py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
                >
                  Resume current game
                </button>
              )}
              <button
                onClick={onStartFromShared}
                className="flex-1 rounded-lg bg-accent px-4 py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
              >
                Load shared game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Difficulty Chooser Modal - shown when opening shared link without difficulty */}
      {showDifficultyChooser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-overlay-backdrop
        >
          <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-theme" data-modal>
            <h2 className="text-xl font-semibold text-foreground text-center mb-2">
              Choose Difficulty
            </h2>
            <p className="text-sm text-foreground-muted text-center mb-6">
              Select a difficulty level to start the puzzle
            </p>
            <div className="flex justify-center">
              <DifficultyGrid
                seed={seed}
                lastSelected={null}
                onSelect={() => {}}
                onBeforeNavigate={(path) => {
                  // Extract difficulty from path (e.g., "/?d=medium" -> "medium")
                  const match = path.match(/d=(\w+)/)
                  if (match && match[1]) {
                    const diff = match[1] as Difficulty
                    onSelectDifficulty(diff)
                    onCloseDifficultyChooser()
                    // Update URL without triggering navigation/re-render
                    window.history.replaceState(null, '', `${pathname}?d=${diff}`)
                  }
                  return false // Prevent grid's own navigation
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
