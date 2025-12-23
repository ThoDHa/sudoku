import { formatTime } from '../lib/scores'

interface ResultSummaryProps {
  timeMs: number
  difficulty: string
  dateUtc: string
  hintsUsed: number
  techniqueHintsUsed?: number
  mistakes: number
  autoSolveUsed?: boolean
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
      <p className="text-5xl font-bold text-foreground">{formatTime(timeMs)}</p>
      <div className="mt-4 flex justify-center gap-4">
        <span className="inline-flex items-center rounded-full bg-btn-bg px-3 py-1 text-sm font-medium capitalize text-foreground">
          {difficulty}
        </span>
        <span className="inline-flex items-center rounded-full bg-btn-bg px-3 py-1 text-sm text-foreground">
          {dateUtc}
        </span>
      </div>
      <div className="mt-4 flex justify-center gap-6 text-sm text-foreground-muted">
        {autoSolveUsed ? (
          <span>
            <strong className="text-foreground">🤖</strong> solved
          </span>
        ) : (
          <>
            <span>
              <strong className="text-foreground">{hintsUsed}</strong> hints
            </span>
            {(techniqueHintsUsed ?? 0) > 0 && (
              <span>
                <strong className="text-foreground">{techniqueHintsUsed}</strong> technique hints
              </span>
            )}
          </>
        )}
        <span>
          <strong className="text-foreground">{mistakes}</strong> mistakes
        </span>
      </div>
    </div>
  )
}
