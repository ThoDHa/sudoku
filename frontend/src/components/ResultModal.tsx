import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatTime, generateShareText, generatePuzzleUrl } from '../lib/scores'
import { DIFFICULTIES } from '../lib/constants'
import { CloseIcon } from './ui'
import DifficultyBadge from './DifficultyBadge'

interface ResultModalProps {
  isOpen: boolean
  onClose: () => void
  seed: string
  difficulty: string
  timeMs: number
  hintsUsed: number
  autoFillUsed?: boolean
  autoSolveUsed?: boolean
  encodedPuzzle?: string | null // For custom puzzles - the encoded givens for sharing
}

const difficultyColors: Record<string, { base: string; selected: string }> = {
  easy: {
    base: 'bg-[var(--bg-secondary)] text-[var(--text)] border-2 border-green-500 hover:bg-green-50 dark:hover:bg-green-900/30',
    selected: 'bg-green-600 text-white border-2 border-green-600',
  },
  medium: {
    base: 'bg-[var(--bg-secondary)] text-[var(--text)] border-2 border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30',
    selected: 'bg-amber-500 text-white border-2 border-amber-500',
  },
  hard: {
    base: 'bg-[var(--bg-secondary)] text-[var(--text)] border-2 border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30',
    selected: 'bg-orange-600 text-white border-2 border-orange-600',
  },
  extreme: {
    base: 'bg-[var(--bg-secondary)] text-[var(--text)] border-2 border-red-500 hover:bg-red-50 dark:hover:bg-red-900/30',
    selected: 'bg-red-600 text-white border-2 border-red-600',
  },
  impossible: {
    base: 'bg-[var(--bg-secondary)] text-[var(--text)] border-2 border-fuchsia-500 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/30',
    selected: 'bg-fuchsia-600 text-white border-2 border-fuchsia-600',
  },
}

export default function ResultModal({
  isOpen,
  onClose,
  seed,
  difficulty,
  timeMs,
  hintsUsed,
  autoFillUsed,
  autoSolveUsed,
  encodedPuzzle,
}: ResultModalProps) {
  const [copied, setCopied] = useState(false)
  // Default to 'medium' if current difficulty is 'custom' (not a valid API difficulty)
  const [selectedDifficulty, setSelectedDifficulty] = useState(
    difficulty === 'custom' ? 'medium' : difficulty
  )
  const navigate = useNavigate()

  if (!isOpen) return null

  const score = {
    seed,
    difficulty,
    timeMs,
    hintsUsed,
    mistakes: 0,
    completedAt: new Date().toISOString(),
    encodedPuzzle: encodedPuzzle || undefined,
    autoFillUsed: autoFillUsed || false,
    autoSolveUsed: autoSolveUsed || false,
  }

  const baseUrl = window.location.origin
  const puzzleUrl = generatePuzzleUrl(score, baseUrl)
  const shareText = generateShareText(score, puzzleUrl)

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = shareText
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-[var(--bg)] p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--btn-hover)] hover:text-[var(--text)]"
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-[var(--text)]">🎉 Puzzle Complete!</h2>
          <p className="mt-1 text-[var(--text-muted)]">Great job solving the puzzle</p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-[var(--bg-secondary)] p-4 text-center">
            <p className="text-2xl font-bold text-[var(--accent)]">{formatTime(timeMs)}</p>
            <p className="text-xs text-[var(--text-muted)]">⏱️ Time</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] p-4 text-center flex flex-col items-center justify-center">
            <DifficultyBadge difficulty={difficulty} size="md" />
            <p className="text-xs text-[var(--text-muted)] mt-1">🎯 Difficulty</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] p-4 text-center">
            {autoSolveUsed ? (
              <>
                <p className="text-2xl font-bold text-[var(--accent)]">🤖</p>
                <p className="text-xs text-[var(--text-muted)]">Solved</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-[var(--accent)]">{hintsUsed}</p>
                <p className="text-xs text-[var(--text-muted)]">💡 Hints</p>
              </>
            )}
          </div>
        </div>

        {/* Share button */}
        <button
          onClick={handleShare}
          className="mb-4 w-full rounded-lg bg-[var(--accent)] py-3 font-medium text-[var(--btn-active-text)] transition-opacity hover:opacity-90"
        >
          {copied ? '✅ Copied!' : '📤 Share Result'}
        </button>

        {/* Share preview */}
        <div className="mb-6 rounded-lg bg-[var(--bg-secondary)] p-3">
          <pre className="whitespace-pre-wrap text-xs text-[var(--text-muted)]">{shareText}</pre>
        </div>

        {/* New Game Section */}
        <div className="mb-4">
          <p className="mb-3 text-sm font-medium text-[var(--text)] text-center">Start a new puzzle:</p>
          
          {/* Pyramid layout: 3 on top, 2 on bottom */}
          <div className="space-y-2 mb-3">
            {/* Top row: Easy, Medium, Hard */}
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTIES.slice(0, 3).map((d) => {
                const colors = difficultyColors[d]
                const isSelected = selectedDifficulty === d
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDifficulty(d)}
                    className={`rounded-lg py-2.5 text-sm font-medium capitalize transition-all ${
                      isSelected ? colors.selected : colors.base
                    }`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
            
            {/* Bottom row: Expert, Impossible (centered) */}
            <div className="flex justify-center gap-2">
              {DIFFICULTIES.slice(3).map((d) => {
                const colors = difficultyColors[d]
                const isSelected = selectedDifficulty === d
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDifficulty(d)}
                    className={`rounded-lg py-2.5 px-6 text-sm font-medium capitalize transition-all ${
                      isSelected ? colors.selected : colors.base
                    }`}
                    style={{ minWidth: '6rem' }}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
          
          <button
            onClick={() => navigate(`/game/P${Date.now()}?d=${selectedDifficulty}`)}
            className="w-full rounded-lg border-2 border-[var(--accent)] py-2.5 font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--btn-active-text)]"
          >
            Play {selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1)}
          </button>
        </div>

        {/* Navigation links */}
        <div className="flex gap-3">
          <Link
            to="/"
            className="flex-1 rounded-lg border border-[var(--border-light)] py-2 text-center font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
          >
            📅 Daily Puzzles
          </Link>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border-light)] py-2 text-center font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
          >
            🔍 Review Puzzle
          </button>
        </div>
      </div>
    </div>
  )
}
