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

export function SunIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

export function MoonIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

export function ComputerIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
  notimplemented: '🔬',
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
      <div className={`relative z-10 w-full ${maxWidthClasses[maxWidth]} rounded-2xl bg-background shadow-2xl ${className}`}>
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1 text-foreground-muted hover:bg-btn-hover hover:text-foreground"
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
    primary: 'bg-accent text-btn-active-text hover:opacity-90',
    secondary: 'border border-accent text-accent hover:bg-accent hover:text-btn-active-text',
    ghost: 'border border-board-border-light text-foreground hover:bg-btn-hover',
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
        <h3 className="mb-2 text-sm font-semibold text-foreground">🎯 The Goal</h3>
        <p className="text-sm leading-relaxed text-foreground-muted">
          Fill every cell in the 9×9 grid with a digit from 1 to 9 so that each digit appears exactly once in every row, column, and 3×3 box.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">📋 The Rules</h3>
        <ul className="space-y-1 text-sm text-foreground-muted">
          <li>↔️ Each row must contain the digits 1-9 with no repeats</li>
          <li>↕️ Each column must contain the digits 1-9 with no repeats</li>
          <li>⬚ Each 3×3 box must contain the digits 1-9 with no repeats</li>
          <li>✨ There is only one valid solution for each puzzle</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">🚀 Getting Started</h3>
        <ul className="space-y-1 text-sm text-foreground-muted">
          <li>🔒 <strong>Givens:</strong> The pre-filled numbers are clues — these cannot be changed</li>
          <li>✏️ <strong>Candidates/Notes:</strong> Use notes to track which digits are possible in each empty cell</li>
          <li>❌ <strong>Elimination:</strong> When you place a digit, eliminate it as a candidate from all cells in the same row, column, and box</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">🧠 Basic Strategy</h3>
        <ol className="list-inside list-decimal space-y-1 text-sm text-foreground-muted">
          <li>Use "Auto-fill notes" from the menu to see all possible candidates</li>
          <li>Look for cells with only one candidate (Naked Singles)</li>
          <li>Look for digits that can only go in one place in a row/column/box (Hidden Singles)</li>
          <li>As you fill cells, candidates are automatically eliminated</li>
          <li>Use the "Hint" button when stuck — it will find and apply the next logical step</li>
        </ol>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">💡 Hints vs Solve</h3>
        <ul className="space-y-1 text-sm text-foreground-muted">
          <li>💡 <strong>Hints:</strong> Get one logical step at a time. Each hint counts toward your score.</li>
          <li>🤖 <strong>Solve:</strong> Watch the solver complete the puzzle step-by-step. Tracked separately from hints.</li>
          <li>⚡ <strong>Smart Detection:</strong> The solver immediately fills cells when they have only one possible digit.</li>
        </ul>
      </div>

      <div className="rounded-lg bg-background-secondary p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">📊 Difficulty Levels</h3>
        <ul className="space-y-2 text-sm text-foreground-muted">
          <li>🟢 <span className="font-medium text-green-600 dark:text-green-400">Easy:</span> Can be solved with Naked and Hidden Singles only</li>
          <li>🟡 <span className="font-medium text-yellow-600 dark:text-yellow-400">Medium:</span> Requires pairs, triples, and basic intersection techniques</li>
          <li>🟠 <span className="font-medium text-orange-600 dark:text-orange-400">Hard:</span> Requires X-Wings, XY-Wings, and other advanced patterns</li>
          <li>🔴 <span className="font-medium text-red-600 dark:text-red-400">Expert:</span> Requires chains, coloring, and complex pattern recognition</li>
        </ul>
      </div>

      <div className="rounded-lg border border-board-border-light p-4">
        <h3 className="mb-2 text-sm font-semibold text-foreground">🎮 Tips for Success</h3>
        <ul className="space-y-1 text-sm text-foreground-muted">
          <li>✏️ Always use pencil marks (notes) — they're essential for harder puzzles</li>
          <li>👀 Scan rows, columns, and boxes systematically</li>
          <li>🔍 When stuck, look for pairs and triples of candidates</li>
          <li>📚 Use the techniques list to learn new solving methods</li>
          <li>🎯 Use hints to learn — they teach you real solving techniques</li>
          <li>🏆 Practice makes perfect — start with easier puzzles and work your way up</li>
        </ul>
      </div>
    </div>
  )
}

// ============ How the Solver Works Content ============
// Documentation explaining the solver architecture and error correction approach

export function HowSolverWorksContent() {
  return (
    <div className="space-y-6">
      {/* Overview */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Overview</h2>
        <p className="text-sm leading-relaxed text-foreground-muted">
          Our solver uses <strong>pure logical deduction</strong> — the same techniques human experts use. 
          It never guesses, never backtracks, and never peeks at the solution. Every move can be explained 
          with a specific technique, making it an ideal learning tool.
        </p>
      </div>

      {/* Technique Tiers */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">🎯 Technique Tiers</h2>
        <p className="mb-3 text-sm text-foreground-muted">
          The solver organizes 39+ techniques into tiers based on complexity. It always tries simpler 
          techniques first, escalating only when needed:
        </p>
        <div className="space-y-2">
          <div className="rounded-lg bg-background-secondary p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-diff-easy font-medium">🌱 Simple</span>
            </div>
            <p className="text-xs text-foreground-muted">
              <strong>Naked Singles, Hidden Singles</strong> — The fundamentals. Most easy puzzles 
              need only these. A naked single is a cell with one candidate; a hidden single is a 
              digit that can only go in one place within a house.
            </p>
          </div>
          
          <div className="rounded-lg bg-background-secondary p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-diff-medium font-medium">🌿 Medium</span>
            </div>
            <p className="text-xs text-foreground-muted">
              <strong>Pairs, Triples, Pointing, Claiming</strong> — Pattern recognition within houses. 
              These techniques eliminate candidates by finding groups of cells that must contain 
              specific digits.
            </p>
          </div>
          
          <div className="rounded-lg bg-background-secondary p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-diff-extreme font-medium">🌳 Hard</span>
            </div>
            <p className="text-xs text-foreground-muted">
              <strong>X-Wing, Swordfish, XY-Wing, Chains</strong> — Advanced patterns spanning 
              multiple houses. These require tracking relationships between candidates across 
              the entire grid.
            </p>
          </div>
          
          <div className="rounded-lg bg-background-secondary p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-foreground-muted font-medium">🔬 Extreme</span>
            </div>
            <p className="text-xs text-foreground-muted">
              <strong>Unique Rectangles, ALS Chains, Forcing Chains</strong> — Expert-level 
              techniques for the hardest puzzles. These exploit advanced logical constraints 
              and require deep chain reasoning.
            </p>
          </div>
        </div>
      </div>

      {/* How Hints Work */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">💡 How Hints Work</h2>
        <p className="mb-3 text-sm text-foreground-muted">
          When you request a hint, the solver follows this process:
        </p>
        <ol className="list-inside list-decimal space-y-2 text-sm text-foreground-muted">
          <li>
            <strong>Fill candidates</strong> — If your notes are incomplete, it first ensures 
            all valid candidates are marked
          </li>
          <li>
            <strong>Detect singles</strong> — Instantly fills any cell with only one possible digit
          </li>
          <li>
            <strong>Apply techniques</strong> — Starting from Simple tier, tries each technique 
            until one finds a move
          </li>
          <li>
            <strong>Explain the move</strong> — Returns a detailed explanation with highlighted cells
          </li>
        </ol>
      </div>

      {/* Error Correction */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">🔧 Error Correction</h2>
        <p className="mb-3 text-sm text-foreground-muted">
          Made mistakes? The solver can handle corrupted boards — even ones with many wrong entries. 
          It corrects errors <strong>one at a time</strong>, explaining why each cell is wrong:
        </p>
        
        <div className="space-y-3">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <h4 className="mb-1 text-sm font-medium text-foreground">🚨 Direct Conflicts</h4>
            <p className="text-xs text-foreground-muted">
              <strong>Detected first.</strong> If you placed a 5 in a row that already has a 5, 
              that's an immediate conflict. The solver spots these instantly and explains: 
              "This cell conflicts with the 5 in R3C7."
            </p>
          </div>
          
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3">
            <h4 className="mb-1 text-sm font-medium text-foreground">🚫 Blocking Cells</h4>
            <p className="text-xs text-foreground-muted">
              <strong>Detected second.</strong> Your entry might not conflict directly, but it 
              blocks all possibilities for another cell. The solver traces the logical chain: 
              "This 7 eliminates all candidates from R4C2."
            </p>
          </div>
          
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
            <h4 className="mb-1 text-sm font-medium text-foreground">🔍 Technique Violations</h4>
            <p className="text-xs text-foreground-muted">
              <strong>Detected last.</strong> Some errors only reveal themselves through advanced 
              logic. The solver uses the same techniques it uses for solving to detect these, 
              providing technique-level explanations.
            </p>
          </div>
        </div>
      </div>

      {/* Philosophy */}
      <div className="rounded-lg border border-board-border-light p-4">
        <h2 className="mb-2 text-lg font-semibold text-foreground">🧘 The "No Guessing" Philosophy</h2>
        <p className="text-sm text-foreground-muted">
          Unlike brute-force solvers that try possibilities until something works, our solver 
          proves each move is correct <em>before</em> making it. This means:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-foreground-muted">
          <li>✅ Every move comes with a logical explanation</li>
          <li>✅ You learn real techniques, not trial-and-error</li>
          <li>✅ The solver can detect when a puzzle requires guessing (and won't do it)</li>
          <li>✅ If the solver can't proceed, the puzzle may be too hard or have no solution</li>
        </ul>
      </div>

      {/* Technical Note */}
      <div className="rounded-lg bg-background-secondary p-4">
        <h2 className="mb-2 text-lg font-semibold text-foreground">⚙️ Under the Hood</h2>
        <p className="text-sm text-foreground-muted">
          The solver is written in Go and compiled to WebAssembly for fast, offline-capable 
          operation. It runs entirely in your browser — your puzzles never leave your device.
        </p>
        <p className="mt-2 text-sm text-foreground-muted">
          For the technically curious: the solver uses constraint propagation with a 
          technique-based inference engine. Each technique is a pattern matcher that identifies 
          specific logical structures in the candidate grid.
        </p>
      </div>
    </div>
  )
}
