import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { generateShareText, generatePuzzleUrl } from '../lib/scores'
import ResultSummary from '../components/ResultSummary'
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'

export default function Result() {
  const [searchParams] = useSearchParams()
  const [copied, setCopied] = useState(false)
  
  const seed = searchParams.get('s')
  const difficulty = searchParams.get('d')
  const timeMs = parseInt(searchParams.get('t') || '0', 10)
  const hintsUsed = parseInt(searchParams.get('h') || '0', 10)

  if (!seed || !difficulty) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)]">
        <p className="text-xl font-medium text-[var(--text)]">Result not found</p>
        <p className="text-[var(--text-muted)]">Invalid or missing result data in URL</p>
        <Link
          to="/daily"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[var(--btn-active-text)] hover:opacity-90"
        >
          Back to Daily
        </Link>
      </div>
    )
  }

  const score = {
    seed,
    difficulty,
    timeMs,
    hintsUsed,
    mistakes: 0,
    completedAt: new Date().toISOString(),
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const puzzleUrl = generatePuzzleUrl(score, baseUrl)
  const shareText = generateShareText(score, puzzleUrl)

  const handleShare = async () => {
    try {
      // Try native share first (mobile)
      if (navigator.share) {
        await navigator.share({
          text: shareText,
        })
        return
      }
      
      // Fallback to clipboard
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = shareText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-[var(--bg)] text-[var(--text)]">
      <h1 className="mb-6 text-2xl font-bold">Puzzle Complete!</h1>
      
      <ResultSummary
        timeMs={timeMs}
        difficulty={difficulty}
        dateUtc={new Date().toISOString().split('T')[0]}
        hintsUsed={hintsUsed}
        mistakes={0}
      />
      
      {/* Share preview */}
      <div className="mt-6 w-full max-w-sm rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
        <p className="mb-3 text-sm font-medium text-[var(--text-muted)]">Share your result</p>
        <pre className="mb-4 whitespace-pre-wrap text-sm text-[var(--text)] font-mono bg-[var(--bg)] p-3 rounded border border-[var(--border-light)]">
          {shareText}
        </pre>
        <button
          onClick={handleShare}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-[var(--btn-active-text)] hover:opacity-90 transition-colors"
        >
          {copied ? (
            <>
              <CheckIcon className="h-5 w-5" />
              Copied!
            </>
          ) : (
            <>
              <ClipboardDocumentIcon className="h-5 w-5" />
              Share Result
            </>
          )}
        </button>
      </div>

      <div className="mt-8 flex gap-4">
        <Link
          to={`/game/${seed}?d=${difficulty}`}
          className="rounded-lg border border-[var(--border-light)] px-4 py-2 hover:bg-[var(--btn-hover)] text-[var(--text)]"
        >
          Try Again
        </Link>
        <Link
          to="/daily"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[var(--btn-active-text)] hover:opacity-90"
        >
          New Puzzle
        </Link>
      </div>
    </div>
  )
}
