/**
 * DailyPromptModal - Prompts users to try the daily puzzle when starting practice mode
 * 
 * Shows a modal with:
 * - Message encouraging daily puzzle completion
 * - "Go to Daily" button to navigate to today's daily puzzle
 * - "Continue Practice" button to proceed with practice mode
 * - "Don't show this again" checkbox to disable future prompts
 */

import { useState } from 'react'

interface DailyPromptModalProps {
  open: boolean
  onGoToDaily: () => void
  onContinuePractice: () => void
  onDontShowAgain: () => void
}

export default function DailyPromptModal({
  open,
  onGoToDaily,
  onContinuePractice,
  onDontShowAgain,
}: DailyPromptModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  if (!open) return null

  const handleContinue = () => {
    if (dontShowAgain) {
      onDontShowAgain()
    }
    onContinuePractice()
  }

  const handleGoToDaily = () => {
    if (dontShowAgain) {
      onDontShowAgain()
    }
    onGoToDaily()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleContinue}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
        <h2 className="mb-2 text-lg font-bold text-foreground">Daily Puzzle</h2>
        <p className="mb-4 text-sm text-foreground-muted">
          You haven't done the daily puzzle yet today. Do you want to try it?
        </p>
        
        {/* Checkbox */}
        <label className="mb-6 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4 rounded border-board-border-light text-accent focus:ring-2 focus:ring-accent focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-sm text-foreground-muted">Don't show this again</span>
        </label>
        
        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleContinue}
            className="flex-1 rounded-lg border border-board-border-light py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
          >
            Continue Practice
          </button>
          <button
            onClick={handleGoToDaily}
            className="flex-1 rounded-lg bg-accent py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
          >
            Go to Daily
          </button>
        </div>
      </div>
    </div>
  )
}
