import { useState, useEffect } from 'react'
import { STORAGE_KEYS } from '../lib/constants'

interface OnboardingStep {
  title: string
  description: string
  icon: string
  tip?: string
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to Sudoku!',
    description: 'Fill each row, column, and 3x3 box with the digits 1-9. No repeats allowed!',
    icon: '🧩',
    tip: 'Tap a cell, then tap a number to fill it in.',
  },
  {
    title: 'Use Notes Mode',
    description: 'Toggle notes mode to pencil in possible candidates for a cell. This helps you track which numbers could go where.',
    icon: '✏️',
    tip: 'Press N or tap the pencil button to toggle notes. Use Auto-fill in the menu to fill all candidates at once!',
  },
  {
    title: 'Get Hints',
    description: 'Stuck? Tap the hint button (💡) to get a logical hint that teaches you solving techniques. Each hint counts toward your score.',
    icon: '💡',
    tip: 'Hints show you techniques like Naked Singles, Hidden Pairs, X-Wing and more!',
  },
  {
    title: 'Solve',
    description: 'Want to see how the puzzle is solved? Use Solve from the menu to watch the solver work through it step-by-step.',
    icon: '🤖',
    tip: 'Solve is tracked separately from hints, so you can learn techniques without affecting your hint count.',
  },
  {
    title: 'Check Your Progress',
    description: 'Use the menu (☰) to validate your board, clear entries, or change settings like dark mode.',
    icon: '⚙️',
    tip: 'The timer pauses automatically when you switch tabs.',
  },
  {
    title: 'Keyboard Shortcuts',
    description: 'On desktop, use arrow keys to navigate, 1-9 to enter digits, and keyboard shortcuts for quick actions.',
    icon: '⌨️',
    tip: 'Ctrl+Z = Undo, H = Hint, N = Notes mode, V = Validate, Delete = Erase',
  },
]

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0)

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
    onClose()
  }

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
    onClose()
  }

  if (!isOpen) return null

  const step = ONBOARDING_STEPS[currentStep]
  if (!step) return null
  
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleSkip}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {ONBOARDING_STEPS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStep(idx)}
              className={`w-2 h-2 rounded-full transition-all ${
                idx === currentStep
                  ? 'bg-accent w-6'
                  : idx < currentStep
                  ? 'bg-accent'
                  : 'bg-board-border-light'
              }`}
              aria-label={`Go to step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="text-center text-5xl mb-4">{step.icon}</div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center text-foreground mb-3">
          {step.title}
        </h2>

        {/* Description */}
        <p className="text-center text-foreground-muted mb-4">
          {step.description}
        </p>

        {/* Tip */}
        {step.tip && (
          <div className="bg-accent-light rounded-lg p-3 mb-6">
            <p className="text-sm text-center text-accent font-medium">
              💡 {step.tip}
            </p>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3">
          {currentStep > 0 ? (
            <button
              onClick={handlePrev}
              className="flex-1 rounded-lg border border-board-border-light py-2.5 font-medium text-foreground transition-colors hover:bg-btn-hover"
            >
              Back
            </button>
          ) : (
            <button
              onClick={handleSkip}
              className="flex-1 rounded-lg border border-board-border-light py-2.5 font-medium text-foreground-muted transition-colors hover:bg-btn-hover"
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 rounded-lg bg-accent py-2.5 font-medium text-btn-active-text transition-colors hover:opacity-90"
          >
            {isLastStep ? "Let's Play!" : 'Next'}
          </button>
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-foreground-muted mt-4">
          {currentStep + 1} of {ONBOARDING_STEPS.length}
        </p>
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook is co-located with modal component for better organization
export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
    if (!completed) {
      // Small delay to let the game load first
      const timer = setTimeout(() => {
        setShowOnboarding(true)
      }, 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [])

  const closeOnboarding = () => {
    setShowOnboarding(false)
  }

  const resetOnboarding = () => {
    localStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
    setShowOnboarding(true)
  }

  return { showOnboarding, closeOnboarding, resetOnboarding }
}
