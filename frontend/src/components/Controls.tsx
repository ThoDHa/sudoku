interface ControlsProps {
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

export default function Controls({
  notesMode,
  onNotesToggle,
  onDigit,
  onEraseMode,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  eraseMode,
  digitCounts,
  highlightedDigit,
  isComplete,
  isSolving = false,
}: ControlsProps) {
  const renderDigitButton = (digit: number) => {
    const remaining = 9 - (digitCounts[digit - 1] || 0)
    const digitComplete = remaining === 0
    const isSelected = highlightedDigit === digit
    const isDisabled = digitComplete || isComplete || isSolving

    // During auto-solve, show selected state with muted opacity
    const showSelectedMuted = isSelected && isSolving && !digitComplete

    return (
      <button
        key={digit}
        onClick={() => onDigit(digit)}
        disabled={isDisabled}
        aria-label={`Enter ${digit}, ${remaining} remaining`}
        className={`control-digit-btn ${
          showSelectedMuted
            ? 'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-2 ring-offset-background opacity-60 cursor-not-allowed'
            : isDisabled
            ? 'bg-btn-bg text-foreground-muted opacity-40 cursor-not-allowed'
            : isSelected
            ? 'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-2 ring-offset-background'
              : 'bg-btn-bg text-foreground'
        }`}
      >
        {digit}
        <span
          className={`digit-remaining-badge ${
            digitComplete
              ? 'bg-accent text-btn-active-text'
              : 'bg-accent-light text-accent'
          }`}
        >
          {remaining}
        </span>
      </button>
    )
  }

  const controlsDisabled = isComplete || isSolving

  // During auto-solve, show selected states with muted opacity
  const notesShowSelectedMuted = notesMode && isSolving

  return (
    <div className="controls-grid flex flex-col items-center">
      {/* 3x3 Digit Grid - collapses to single row on very short screens */}
      <div className="digit-grid">
        {/* Default: 3x3 grid, Short screens: single row */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(renderDigitButton)}
      </div>

      {/* Single Row of 4 Action Buttons */}
      <div className="action-row flex justify-center">
        <button
          onClick={onNotesToggle}
          disabled={controlsDisabled}
          aria-label={notesMode ? 'Notes mode on' : 'Notes mode off'}
          aria-pressed={notesMode}
          className={`control-action-btn-compact ${
            notesShowSelectedMuted
              ? 'bg-btn-active text-btn-active-text ring-2 ring-accent ring-offset-1 ring-offset-background opacity-60 cursor-not-allowed'
              : controlsDisabled
              ? 'bg-btn-bg opacity-40 cursor-not-allowed'
              : notesMode
              ? 'bg-btn-active text-btn-active-text ring-2 ring-accent ring-offset-1 ring-offset-background'
              : 'bg-btn-bg text-foreground'
          }`}
          title="Notes mode"
        >
          <span aria-hidden="true" className="text-base">✏️</span>
        </button>

        {/* Delete/Erase button */}
        <button
          onClick={onEraseMode}
          disabled={controlsDisabled}
          aria-label="Erase mode"
          aria-pressed={eraseMode}
          className={`control-action-btn-compact ${
            controlsDisabled
              ? 'bg-btn-bg text-foreground-muted opacity-40 cursor-not-allowed'
              : eraseMode
              ? 'bg-accent text-btn-active-text ring-2 ring-accent ring-offset-1 ring-offset-background'
            : 'bg-btn-bg text-foreground'
          }`}
          title="Erase"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
          </svg>
        </button>

        <button
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          className="control-action-btn-compact bg-btn-bg text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
          </svg>
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          className="control-action-btn-compact bg-btn-bg text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          title="Redo"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a5 5 0 00-5 5v2M21 10l-4-4m4 4l-4 4" />
          </svg>
        </button>
      </div>
    </div>
  )
}
