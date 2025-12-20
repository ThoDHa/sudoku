interface ResultSummaryProps {
  timeMs: number
  difficulty: string
  dateUtc: string
  hintsUsed: number
  techniqueHintsUsed?: number
  mistakes: number
  autoSolveUsed?: boolean
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function ResultSummary({
  timeMs,
  difficulty,
  dateUtc,
  hintsUsed,
  techniqueHintsUsed,
  mistakes,
  autoSolveUsed,
}: ResultSummaryProps) {
  return (
    <div className="text-center">
      <p className="text-5xl font-bold text-[var(--text)]">{formatTime(timeMs)}</p>
      <div className="mt-4 flex justify-center gap-4">
        <span className="inline-flex items-center rounded-full bg-[var(--btn-bg)] px-3 py-1 text-sm font-medium capitalize text-[var(--text)]">
          {difficulty}
        </span>
        <span className="inline-flex items-center rounded-full bg-[var(--btn-bg)] px-3 py-1 text-sm text-[var(--text)]">
          {dateUtc}
        </span>
      </div>
      <div className="mt-4 flex justify-center gap-6 text-sm text-[var(--text-muted)]">
        {autoSolveUsed ? (
          <span>
            <strong className="text-[var(--text)]">🤖</strong> solved
          </span>
        ) : (
          <>
            <span>
              <strong className="text-[var(--text)]">{hintsUsed}</strong> hints
            </span>
            {(techniqueHintsUsed ?? 0) > 0 && (
              <span>
                <strong className="text-[var(--text)]">{techniqueHintsUsed}</strong> technique hints
              </span>
            )}
          </>
        )}
        <span>
          <strong className="text-[var(--text)]">{mistakes}</strong> mistakes
        </span>
      </div>
    </div>
  )
}
