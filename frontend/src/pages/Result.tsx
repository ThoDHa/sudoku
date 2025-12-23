import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { generateShareText, generatePuzzleUrl } from '../lib/scores'
import { copyToClipboard, COPY_TOAST_DURATION } from '../lib/clipboard'
import ResultSummary from '../components/ResultSummary'
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline'

export default function Result() {
  const [searchParams] = useSearchParams()
  const [copied, setCopied] = useState(false)
  
  const seed = searchParams.get('s')
  const difficulty = searchParams.get('d')
  const timeMs = parseInt(searchParams.get('t') || '0', 10)
  const hintsUsed = parseInt(searchParams.get('h') || '0', 10)
  const techniqueHintsUsed = parseInt(searchParams.get('th') || '0', 10)
  const autoSolveUsed = searchParams.get('a') === '1'

  if (!seed || !difficulty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background">
        <p className="text-xl font-medium text-foreground">Result not found</p>
        <p className="text-foreground-muted">Invalid or missing result data in URL</p>
        <Link
          to="/"
          className="rounded-lg bg-accent px-4 py-2 text-btn-active-text hover:opacity-90"
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
    techniqueHintsUsed,
    mistakes: 0,
    completedAt: new Date().toISOString(),
    autoSolveUsed,
  }

  const puzzleUrl = generatePuzzleUrl(score)
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
      const success = await copyToClipboard(shareText)
      if (success) {
        setCopied(true)
        setTimeout(() => setCopied(false), COPY_TOAST_DURATION)
      }
    } catch {
      // Native share was cancelled or failed, no action needed
    }
  }

  return (
    <div className="page-container flex h-full flex-col items-center justify-center text-foreground">
      <h1 className="page-title text-center">Puzzle Complete!</h1>
      
      <ResultSummary
        timeMs={timeMs}
        difficulty={difficulty}
        dateUtc={new Date().toISOString().split('T')[0] ?? ''}
        hintsUsed={hintsUsed}
        techniqueHintsUsed={techniqueHintsUsed}
        mistakes={0}
        autoSolveUsed={autoSolveUsed}
      />
      
      {/* Share preview */}
      <div className="mt-6 w-full max-w-sm rounded-lg border border-board-border-light bg-background-secondary p-4">
        <p className="mb-3 text-sm font-medium text-foreground-muted">Share your result</p>
        <pre className="mb-4 whitespace-pre-wrap text-sm text-foreground font-mono bg-background p-3 rounded border border-board-border-light">
          {shareText}
        </pre>
        <button
          onClick={handleShare}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-btn-active-text hover:opacity-90 transition-colors"
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
          to={`/${seed}?d=${difficulty}`}
          className="rounded-lg border border-board-border-light px-4 py-2 hover:bg-btn-hover text-foreground"
        >
          Try Again
        </Link>
        <Link
          to="/"
          className="rounded-lg bg-accent px-4 py-2 text-btn-active-text hover:opacity-90"
        >
          New Game
        </Link>
      </div>
    </div>
  )
}
