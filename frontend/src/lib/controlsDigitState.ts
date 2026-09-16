export interface ControlsProps {
  notesMode: boolean
  onNotesToggle: () => void
  onDigit: (digit: number) => void
  onEraseMode: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  eraseMode: boolean
  digitCounts: number[] // Array of 9 elements: how many of each digit (1-9) are placed
  highlightedDigit: number | null // Currently selected digit for multi-fill mode
  isComplete: boolean // Whether the puzzle is solved
  isSolving?: boolean // Whether auto-solve is running
}

export interface DigitStateContext {
  digitCounts: number[]
  highlightedDigit: number | null
  isComplete: boolean
  isSolving: boolean
}

export interface DigitButtonState {
  digit: number
  remaining: number
  digitComplete: boolean
  isSelected: boolean
  isDisabled: boolean
  showSelectedMuted: boolean
  ariaLabel: string
  className: string
  badgeClassName: string
}

export const BTN_BASE = 'bg-btn-bg text-foreground'

/**
 * Derives the render state for one digit button: how many of the digit remain,
 * whether the digit is complete, selected, disabled or shown muted during
 * auto-solve, and the aria label plus the fully resolved class names that
 * follow from those flags.
 *
 * @param digit - The digit (1-9) whose button state is derived.
 * @param context - The prop slice the derivation reads: `digitCounts`,
 *   `highlightedDigit`, `isComplete` and `isSolving`.
 * @returns Plain render data; `Controls` renders it without further branching.
 */
export function getDigitButtonState(digit: number, context: DigitStateContext): DigitButtonState {
  const remaining = 9 - (context.digitCounts[digit - 1] || 0)
  const digitComplete = remaining === 0
  const isSelected = context.highlightedDigit === digit
  const isDisabled = digitComplete || context.isComplete || context.isSolving

  // During auto-solve, show selected state with muted opacity
  const showSelectedMuted = isSelected && context.isSolving && !digitComplete

  const className = `control-digit-btn ${
    showSelectedMuted
      ? 'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-2 ring-offset-background opacity-60 cursor-not-allowed'
      : isDisabled
        ? 'bg-btn-bg text-foreground-muted opacity-40 cursor-not-allowed'
        : isSelected
          ? 'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-2 ring-offset-background'
          : BTN_BASE
  }`

  return {
    digit,
    remaining,
    digitComplete,
    isSelected,
    isDisabled,
    showSelectedMuted,
    ariaLabel: `Enter ${digit}, ${remaining} remaining`,
    className,
    badgeClassName: `digit-remaining-badge ${
      digitComplete ? 'bg-accent text-btn-active-text' : 'bg-accent-light text-accent'
    }`,
  }
}

/**
 * Memo comparator for `Controls`: returns true when the props are equal so the
 * re-render is skipped. Primitive props are compared by value, `digitCounts`
 * element-by-element (arrays are rebuilt by the parent), and callback props by
 * reference (they may change when parent state changes).
 *
 * @param prevProps - The previous render's props.
 * @param nextProps - The next render's props.
 * @returns True when `Controls` can skip the re-render, false when it must run.
 */
export function areControlsPropsEqual(prevProps: ControlsProps, nextProps: ControlsProps): boolean {
  // Compare primitive props
  if (
    prevProps.notesMode !== nextProps.notesMode ||
    prevProps.eraseMode !== nextProps.eraseMode ||
    prevProps.canUndo !== nextProps.canUndo ||
    prevProps.canRedo !== nextProps.canRedo ||
    prevProps.highlightedDigit !== nextProps.highlightedDigit ||
    prevProps.isComplete !== nextProps.isComplete ||
    prevProps.isSolving !== nextProps.isSolving
  ) {
    return false // Props changed, re-render
  }

  // Compare digitCounts array element-by-element
  const prevCounts = prevProps.digitCounts
  const nextCounts = nextProps.digitCounts
  if (prevCounts.length !== nextCounts.length) return false
  // every() instead of a < loop bound: under the length guard above, a < bound generates an equivalent <= mutant, while every() exposes no bound token to mutate (MUT-8-10-4-1)
  if (!prevCounts.every((count, i) => count === nextCounts[i])) return false

  // Compare callback references - they may change when parent state changes
  if (
    prevProps.onNotesToggle !== nextProps.onNotesToggle ||
    prevProps.onDigit !== nextProps.onDigit ||
    prevProps.onEraseMode !== nextProps.onEraseMode ||
    prevProps.onUndo !== nextProps.onUndo ||
    prevProps.onRedo !== nextProps.onRedo
  ) {
    return false // Callbacks changed, re-render
  }

  return true // Props are equal, skip re-render
}
