// Shared UI components

import { ReactNode } from 'react'
import { getTierColor } from '../lib/constants'

// ============ Icons ============

export function CloseIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function ChevronRightIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

export function ChevronLeftIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

export function InfoIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

// ============ Tier Badge ============

interface TierBadgeProps {
  tier: string
  size?: 'sm' | 'md'
  showEmoji?: boolean
}

const TIER_EMOJIS: Record<string, string> = {
  simple: '🌱',
  medium: '🌿',
  hard: '🌳',
  auto: '🤖',
}

export function TierBadge({ tier, size = 'sm', showEmoji = false }: TierBadgeProps) {
  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-xs' 
    : 'px-3 py-1 text-sm'
  
  const emoji = showEmoji ? TIER_EMOJIS[tier.toLowerCase()] || '' : ''
  
  return (
    <span className={`rounded-full font-medium ${sizeClasses} ${getTierColor(tier)}`}>
      {emoji && <span className="mr-1">{emoji}</span>}{tier}
    </span>
  )
}

// ============ Modal ============

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | '2xl'
  showCloseButton?: boolean
  className?: string
}

export function Modal({ 
  isOpen, 
  onClose, 
  children, 
  maxWidth = 'md',
  showCloseButton = true,
  className = ''
}: ModalProps) {
  if (!isOpen) return null

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    '2xl': 'max-w-2xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative z-10 w-full ${maxWidthClasses[maxWidth]} rounded-2xl bg-[var(--bg)] shadow-2xl ${className}`}>
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--btn-hover)] hover:text-[var(--text)]"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        )}
        {children}
      </div>
    </div>
  )
}

// ============ Buttons ============

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  fullWidth?: boolean
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  fullWidth = false,
}: ButtonProps) {
  const baseClasses = 'rounded-lg font-medium transition-colors'
  
  const variantClasses = {
    primary: 'bg-[var(--accent)] text-[var(--btn-active-text)] hover:opacity-90',
    secondary: 'border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--btn-active-text)]',
    ghost: 'border border-[var(--border-light)] text-[var(--text)] hover:bg-[var(--btn-hover)]',
  }
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3',
  }
  
  const widthClass = fullWidth ? 'w-full' : ''
  const disabledClass = disabled ? 'opacity-50 cursor-not-allowed' : ''
  
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${disabledClass} ${className}`}
    >
      {children}
    </button>
  )
}

// ============ How to Play Content ============
// Shared content component for the "How to Play Sudoku" section

export function HowToPlayContent() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">🎯 The Goal</h3>
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">
          Fill every cell in the 9×9 grid with a digit from 1 to 9 so that each digit appears exactly once in every row, column, and 3×3 box.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">📋 The Rules</h3>
        <ul className="space-y-1 text-sm text-[var(--text-muted)]">
          <li>↔️ Each row must contain the digits 1-9 with no repeats</li>
          <li>↕️ Each column must contain the digits 1-9 with no repeats</li>
          <li>⬚ Each 3×3 box must contain the digits 1-9 with no repeats</li>
          <li>✨ There is only one valid solution for each puzzle</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">🚀 Getting Started</h3>
        <ul className="space-y-1 text-sm text-[var(--text-muted)]">
          <li>🔒 <strong>Givens:</strong> The pre-filled numbers are clues — these cannot be changed</li>
          <li>✏️ <strong>Candidates/Notes:</strong> Use notes to track which digits are possible in each empty cell</li>
          <li>❌ <strong>Elimination:</strong> When you place a digit, eliminate it as a candidate from all cells in the same row, column, and box</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">🧠 Basic Strategy</h3>
        <ol className="list-inside list-decimal space-y-1 text-sm text-[var(--text-muted)]">
          <li>Use "Auto-fill notes" from the menu to see all possible candidates</li>
          <li>Look for cells with only one candidate (Naked Singles)</li>
          <li>Look for digits that can only go in one place in a row/column/box (Hidden Singles)</li>
          <li>As you fill cells, candidates are automatically eliminated</li>
          <li>Use the "Hint" button when stuck — it will find and apply the next logical step</li>
        </ol>
      </div>

      <div className="rounded-lg bg-[var(--bg-secondary)] p-4">
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">📊 Difficulty Levels</h3>
        <ul className="space-y-2 text-sm text-[var(--text-muted)]">
          <li>🟢 <span className="font-medium text-green-600 dark:text-green-400">Easy:</span> Can be solved with Naked and Hidden Singles only</li>
          <li>🟡 <span className="font-medium text-yellow-600 dark:text-yellow-400">Medium:</span> Requires pairs, triples, and basic intersection techniques</li>
          <li>🟠 <span className="font-medium text-orange-600 dark:text-orange-400">Hard:</span> Requires X-Wings, XY-Wings, and other advanced patterns</li>
          <li>🔴 <span className="font-medium text-red-600 dark:text-red-400">Expert:</span> Requires chains, coloring, and complex pattern recognition</li>
        </ul>
      </div>

      <div className="rounded-lg border border-[var(--border-light)] p-4">
        <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">💡 Tips for Success</h3>
        <ul className="space-y-1 text-sm text-[var(--text-muted)]">
          <li>✏️ Always use pencil marks (notes) — they're essential for harder puzzles</li>
          <li>👀 Scan rows, columns, and boxes systematically</li>
          <li>🔍 When stuck, look for pairs and triples of candidates</li>
          <li>📚 Use the techniques list to learn new solving methods</li>
          <li>🏆 Practice makes perfect — start with easier puzzles and work your way up</li>
        </ul>
      </div>
    </div>
  )
}
