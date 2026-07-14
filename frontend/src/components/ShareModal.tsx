import { CloseIcon, ShareIcon } from './ui'
import { Dialog } from './Dialog'

const SHARE_OPTIONS = [
  { key: 'puzzle', label: 'Share puzzle', description: 'Just the puzzle, nothing filled in' },
  { key: 'state', label: 'Share my current game', description: 'Your progress and notes' },
] as const

type ShareOptionKey = (typeof SHARE_OPTIONS)[number]['key']

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  onSharePuzzle: () => void
  onShareState: () => void
}

// Share control as a centered modal: two choices (bare puzzle vs current game),
// closable via the X, the backdrop, or Escape.
export default function ShareModal({
  isOpen,
  onClose,
  onSharePuzzle,
  onShareState,
}: ShareModalProps) {
  if (!isOpen) {
    return null
  }

  const handleSelect = (key: ShareOptionKey) => {
    if (key === 'puzzle') {
      onSharePuzzle()
    } else {
      onShareState()
    }
    onClose()
  }

  return (
    // shareGuard adds data-share-button so the board's outside-click deselect
    // guard ignores every click within the share modal.
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      titleId="share-modal-title"
      panelClassName="w-full max-w-sm rounded-xl bg-background-secondary p-6 shadow-theme"
      backdropClassName="bg-black/50"
      shareGuard
    >
      <button
        onClick={onClose}
        className="absolute right-3 top-3 rounded p-1 text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
        aria-label="Close"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      <h2
        id="share-modal-title"
        className="mb-1 flex items-center gap-2 text-lg font-semibold text-foreground"
      >
        <ShareIcon />
        Share
      </h2>
      <p className="mb-5 text-sm text-foreground-muted">Send a link a friend can open and play.</p>
      <div className="flex flex-col gap-2">
        {SHARE_OPTIONS.map(({ key, label, description }) => (
          <button
            key={key}
            onClick={() => handleSelect(key)}
            className="w-full flex flex-col items-start gap-0.5 rounded-lg border border-board-border-light px-4 py-3 text-left transition-colors text-foreground hover:bg-btn-hover"
          >
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-foreground-muted">{description}</span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}
