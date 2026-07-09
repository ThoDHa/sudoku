import type { RefObject } from 'react'
import { ShareIcon } from './ui'

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
    // data-share-button on the container so the board's outside-click deselect
    // guard (Game.tsx) skips both the toggle and the option buttons inside it.
    <div className="relative" ref={dropdownRef} data-share-button>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
        title="Share the puzzle or your current game"
        aria-haspopup="true"
        aria-expanded={isOpen}
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
