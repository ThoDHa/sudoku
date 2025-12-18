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
}: ControlsProps) {
  const renderDigitButton = (digit: number) => {
    const remaining = 9 - (digitCounts[digit - 1] || 0)
    const digitComplete = remaining === 0
    const isSelected = highlightedDigit === digit

    return (
      <button
        key={digit}
        onClick={() => onDigit(digit)}
        disabled={digitComplete || isComplete}
        aria-label={`Enter ${digit}, ${remaining} remaining`}
        className={`control-digit-btn ${
          digitComplete || isComplete
            ? 'bg-[var(--btn-bg)] text-[var(--text-muted)] opacity-40 cursor-not-allowed'
            : isSelected
            ? 'bg-[var(--accent)] text-[var(--btn-active-text)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]'
            : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)] active:bg-[var(--accent)] active:text-[var(--btn-active-text)]'
        }`}
      >
        {digit}
        <span
          className={`digit-remaining-badge ${
            digitComplete
              ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
              : 'bg-[var(--accent-light)] text-[var(--accent)]'
          }`}
        >
          {remaining}
        </span>
      </button>
    )
  }

  return (
    <div className="controls-container mt-3 sm:mt-4 flex flex-col items-center gap-1.5 sm:gap-2">
      {/* Row 1: Digits 1-5 */}
      <div className="flex gap-1.5 sm:gap-2 justify-center w-full">
        {[1, 2, 3, 4, 5].map(renderDigitButton)}
      </div>

      {/* Row 2: Digits 6-9 + Erase */}
      <div className="flex gap-1.5 sm:gap-2 justify-center w-full">
        {[6, 7, 8, 9].map(renderDigitButton)}
        
        {/* Erase button - toggleable like digits */}
        <button
          onClick={onEraseMode}
          disabled={isComplete}
          aria-label="Erase mode"
          aria-pressed={eraseMode}
          className={`control-digit-btn ${
            isComplete
              ? 'bg-[var(--btn-bg)] text-[var(--text-muted)] opacity-40 cursor-not-allowed'
              : eraseMode
              ? 'bg-[var(--accent)] text-[var(--btn-active-text)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]'
              : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)] active:bg-[var(--accent)] active:text-[var(--btn-active-text)]'
          }`}
          title="Erase mode - click cells to erase"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414a2 2 0 011.414-.586H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
          </svg>
        </button>
      </div>

      {/* Row 3: Notes + Undo + Redo */}
      <div className="flex gap-1.5 sm:gap-2 justify-center w-full">
        <button
          onClick={onNotesToggle}
          disabled={isComplete}
          aria-label={notesMode ? 'Notes mode on' : 'Notes mode off'}
          aria-pressed={notesMode}
          className={`control-digit-btn ${
            isComplete
              ? 'bg-[var(--btn-bg)] opacity-40 cursor-not-allowed'
              : notesMode
              ? 'bg-[var(--btn-active)] text-[var(--btn-active-text)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]'
              : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
          }`}
          title="Toggle notes mode (N)"
        >
          <span aria-hidden="true" className="text-lg">✏️</span>
        </button>

        <button
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo"
          className="control-digit-btn bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
          </svg>
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo"
          className="control-digit-btn bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Y)"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 10h-10a5 5 0 00-5 5v2M21 10l-4-4m4 4l-4 4" />
          </svg>
        </button>
      </div>
    </div>
  )
}
