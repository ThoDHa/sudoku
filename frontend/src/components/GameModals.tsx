/**
 * GameModals - Confirmation dialogs for Game page actions
 * 
 * This component contains three modal dialogs:
 * 1. Solve Confirmation - Confirms auto-solve of the entire puzzle
 * 2. Clear/Restart Confirmation - Confirms clearing entries or restarting
 * 3. Show Solution Confirmation - Offers to show solution when error can't be pinpointed
 */

interface GameModalsProps {
  // Solve confirmation modal
  solveConfirmOpen: boolean
  setSolveConfirmOpen: (open: boolean) => void
  onSolve: () => void
  
  // Clear/Restart confirmation modal
  showClearConfirm: boolean
  setShowClearConfirm: (open: boolean) => void
  isComplete: boolean
  onRestart: () => void
  onClearAll: () => void
  
  // Show solution confirmation modal
  showSolutionConfirm: boolean
  setShowSolutionConfirm: (open: boolean) => void
  unpinpointableErrorMessage: string | null
  onShowSolution: () => void
}

export default function GameModals({
  solveConfirmOpen,
  setSolveConfirmOpen,
  onSolve,
  showClearConfirm,
  setShowClearConfirm,
  isComplete,
  onRestart,
  onClearAll,
  showSolutionConfirm,
  setShowSolutionConfirm,
  unpinpointableErrorMessage,
  onShowSolution,
}: GameModalsProps) {
  return (
    <>
      {/* Solve Confirmation Dialog */}
      {solveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSolveConfirmOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-foreground">Solve Puzzle?</h2>
            <p className="mb-6 text-sm text-foreground-muted">
              This will automatically solve the entire puzzle using logical techniques. Are you sure?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSolveConfirmOpen(false)}
                className="flex-1 rounded-lg border border-board-border-light py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSolveConfirmOpen(false)
                  onSolve()
                }}
                className="flex-1 rounded-lg bg-accent py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
              >
                Solve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All / Restart Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowClearConfirm(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-foreground">
              {isComplete ? 'Restart Puzzle?' : 'Clear All Entries?'}
            </h2>
            <p className="mb-6 text-sm text-foreground-muted">
              {isComplete 
                ? 'This will reset the puzzle to its initial state and restart the timer from zero.'
                : 'This will remove all your entered numbers and notes, but keep your timer running.'
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-lg border border-board-border-light py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowClearConfirm(false)
                  if (isComplete) {
                    onRestart()
                  } else {
                    onClearAll()
                  }
                }}
                className="flex-1 rounded-lg bg-accent py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
              >
                {isComplete ? 'Restart' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show Solution Confirmation Dialog */}
      {showSolutionConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-foreground">Show Solution?</h2>
            <p className="mb-6 text-sm text-foreground-muted">
              {unpinpointableErrorMessage || "Hmm, I couldn't pinpoint the error. One of your entries might need checking."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSolutionConfirm(false)}
                className="flex-1 rounded-lg border border-board-border-light py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
              >
                Let Me Fix It
              </button>
              <button
                onClick={() => {
                  setShowSolutionConfirm(false)
                  onShowSolution()
                }}
                className="flex-1 rounded-lg bg-accent py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
              >
                Show Solution
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
