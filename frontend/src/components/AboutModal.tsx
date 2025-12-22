import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { STORAGE_KEYS } from '../lib/constants'

// Combined content: About info + Tutorial steps
const ABOUT_SECTIONS = [
  {
    id: 'welcome',
    title: 'Welcome to Sudoku',
    icon: '🧩',
    content: (
      <>
        <p className="text-center text-foreground-muted mb-4">
          A free, educational Sudoku app designed to help you <strong className="text-foreground">learn</strong>, not just solve.
        </p>
        <div className="bg-accent-light rounded-lg p-4 mb-4">
          <p className="text-sm text-center text-accent font-medium">
            No ads. No guessing. Just logic.
          </p>
        </div>
        <p className="text-sm text-center text-foreground-muted">
          Fill each row, column, and 3x3 box with digits 1-9. No repeats allowed!
        </p>
      </>
    ),
  },
  {
    id: 'hints',
    title: 'Smart Hints',
    icon: '💡',
    content: (
      <>
        <div className="space-y-4">
          <div className="flex gap-3 items-start">
            <span className="text-lg">❓</span>
            <div>
              <h4 className="font-medium text-foreground text-sm">Technique Hints</h4>
              <p className="text-sm text-foreground-muted">
                Stuck? We'll tell you <em>which technique</em> to look for — learn to recognize patterns yourself.
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <span className="text-lg">💡</span>
            <div>
              <h4 className="font-medium text-foreground text-sm">Full Hints</h4>
              <p className="text-sm text-foreground-muted">
                Still stuck? See exactly where and how to apply the technique with highlighted cells.
              </p>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'notes',
    title: 'Notes Mode',
    icon: '✏️',
    content: (
      <>
        <p className="text-center text-foreground-muted mb-4">
          Toggle notes mode to pencil in possible candidates for a cell. This helps you track which numbers could go where.
        </p>
        <div className="bg-accent-light rounded-lg p-3">
          <p className="text-sm text-center text-accent font-medium">
            Press N or tap the pencil button to toggle notes. Use Auto-fill in the menu to fill all candidates at once!
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'solver',
    title: 'The Solver',
    icon: '🤖',
    content: (
      <>
        <p className="text-center text-foreground-muted mb-4">
          Watch the solver work through the puzzle step-by-step using real techniques.
        </p>
        <p className="text-center text-foreground-muted mb-4">
          <strong className="text-foreground">Made a mistake?</strong> The solver can fix your errors and get you back on track.
        </p>
        <div className="bg-accent-light rounded-lg p-3">
          <p className="text-sm text-center text-accent font-medium">
            Solve is tracked separately from hints — learn techniques without affecting your score.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'learn',
    title: 'Learn Techniques',
    icon: '📚',
    content: (
      <>
        <p className="text-center text-foreground-muted mb-4">
          From basic singles to advanced chains — master real solving techniques used by expert players.
        </p>
        <p className="text-center text-foreground-muted mb-4">
          Puzzles are graded by the techniques required. Start easy and work your way up!
        </p>
        <Link 
          to="/techniques" 
          className="block text-center text-accent hover:underline text-sm"
        >
          Explore technique library &rarr;
        </Link>
      </>
    ),
  },
  {
    id: 'shortcuts',
    title: 'Quick Tips',
    icon: '⌨️',
    content: (
      <>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center py-1 border-b border-board-border-light">
            <span className="text-foreground-muted">Navigate</span>
            <span className="font-mono text-foreground">Arrow keys</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-board-border-light">
            <span className="text-foreground-muted">Enter digit</span>
            <span className="font-mono text-foreground">1-9</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-board-border-light">
            <span className="text-foreground-muted">Notes mode</span>
            <span className="font-mono text-foreground">N</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-board-border-light">
            <span className="text-foreground-muted">Hint</span>
            <span className="font-mono text-foreground">H</span>
          </div>
          <div className="flex justify-between items-center py-1 border-b border-board-border-light">
            <span className="text-foreground-muted">Undo</span>
            <span className="font-mono text-foreground">Ctrl+Z</span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-foreground-muted">Erase</span>
            <span className="font-mono text-foreground">Delete</span>
          </div>
        </div>
      </>
    ),
  },
]

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
  /** If true, shows "Skip" button instead of close. Used for first-time onboarding. */
  isOnboarding?: boolean
}

export default function AboutModal({ isOpen, onClose, isOnboarding = false }: AboutModalProps) {
  const [currentStep, setCurrentStep] = useState(0)

  // Reset to first step when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
    }
  }, [isOpen])

  const handleNext = () => {
    if (currentStep < ABOUT_SECTIONS.length - 1) {
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
    if (isOnboarding) {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
    }
    onClose()
  }

  const handleSkip = () => {
    if (isOnboarding) {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true')
    }
    onClose()
  }

  if (!isOpen) return null

  const section = ABOUT_SECTIONS[currentStep]
  if (!section) return null
  
  const isLastStep = currentStep === ABOUT_SECTIONS.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleSkip}
      />
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-background p-6 shadow-2xl">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {ABOUT_SECTIONS.map((_, idx) => (
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
        <div className="text-center text-5xl mb-4">{section.icon}</div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center text-foreground mb-4">
          {section.title}
        </h2>

        {/* Content */}
        <div className="mb-6">
          {section.content}
        </div>

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
              {isOnboarding ? 'Skip' : 'Close'}
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 rounded-lg bg-accent py-2.5 font-medium text-btn-active-text transition-colors hover:opacity-90"
          >
            {isLastStep ? (isOnboarding ? "Let's Play!" : 'Done') : 'Next'}
          </button>
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-foreground-muted mt-4">
          {currentStep + 1} of {ABOUT_SECTIONS.length}
        </p>
      </div>
    </div>
  )
}

// Hook to manage about/onboarding modal state
// eslint-disable-next-line react-refresh/only-export-components -- Hook is co-located with modal component
export function useAboutModal() {
  const [showAbout, setShowAbout] = useState(false)
  const [isOnboarding, setIsOnboarding] = useState(false)

  // Check for first-time users on mount
  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
    if (!completed) {
      // Small delay to let the game load first
      const timer = setTimeout(() => {
        setIsOnboarding(true)
        setShowAbout(true)
      }, 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [])

  const openAbout = () => {
    setIsOnboarding(false)
    setShowAbout(true)
  }

  const closeAbout = () => {
    setShowAbout(false)
    setIsOnboarding(false)
  }

  const resetOnboarding = () => {
    localStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETE)
    setIsOnboarding(true)
    setShowAbout(true)
  }

  // For compatibility with existing onboarding checks
  const onboardingComplete = localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE) === 'true'

  return { 
    showAbout, 
    isOnboarding,
    onboardingComplete,
    openAbout, 
    closeAbout, 
    resetOnboarding,
    // Aliases for backwards compatibility
    showOnboarding: showAbout && isOnboarding,
    closeOnboarding: closeAbout,
  }
}
