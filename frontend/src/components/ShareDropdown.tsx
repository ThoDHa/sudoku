import type { RefObject } from 'react'

const SHARE_OPTIONS = [
  { key: 'puzzle', label: 'Share puzzle', description: 'Just the puzzle, nothing filled in' },
  { key: 'state', label: 'Share my current game', description: 'Your progress and notes' },
] as const

type ShareOptionKey = (typeof SHARE_OPTIONS)[number]['key']

interface ShareDropdownProps {
  isOpen: boolean
  onToggle: () => void
  onSharePuzzle: () => void
  onShareState: () => void
  dropdownRef: RefObject<HTMLDivElement | null>
}

function ShareIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  )
}

// Share control offering two choices: the bare puzzle, or the current game state.
export default function ShareDropdown({
  isOpen,
  onToggle,
  onSharePuzzle,
  onShareState,
  dropdownRef,
}: ShareDropdownProps) {
  const handleSelect = (key: ShareOptionKey) => {
    if (key === 'puzzle') {
      onSharePuzzle()
    } else {
      onShareState()
    }
    onToggle()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
        title="Share the puzzle or your current game"
        aria-haspopup="true"
        aria-expanded={isOpen}
        data-share-button
      >
        <ShareIcon />
        <span className="hidden sm:inline">Share</span>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg bg-background-secondary border border-board-border-light shadow-lg overflow-hidden z-50">
          {SHARE_OPTIONS.map(({ key, label, description }) => (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              className="w-full flex flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors text-foreground hover:bg-btn-hover"
            >
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-foreground-muted">{description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
