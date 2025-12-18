import { Link } from 'react-router-dom'
import { useDailySeed, useLastDailyDifficulty } from '../lib/hooks'
import DifficultyGrid from '../components/DifficultyGrid'

export default function Daily() {
  const { data, loading, error, refetch } = useDailySeed()
  const { difficulty, setDifficulty } = useLastDailyDifficulty()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-32 w-32 animate-pulse rounded-xl bg-[var(--btn-bg)]"
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mx-auto w-2/3">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="h-32 w-32 animate-pulse rounded-xl bg-[var(--btn-bg)]"
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)]">
        <p className="text-red-600">{error || 'Failed to load daily puzzle'}</p>
        <button
          onClick={refetch}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[var(--btn-active-text)] hover:opacity-90"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 bg-[var(--bg)] text-[var(--text)]">
      <h1 className="mb-2 text-3xl font-bold">Daily Sudoku</h1>
      <p className="mb-8 text-[var(--text-muted)]">{data.date_utc}</p>
      <DifficultyGrid
        seed={data.seed}
        lastSelected={difficulty}
        onSelect={setDifficulty}
      />
      
      <div className="mt-12 flex flex-wrap justify-center gap-4">
        <Link
          to="/custom"
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Enter Custom Puzzle
        </Link>
        <Link
          to="/techniques"
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Learn Techniques
        </Link>
        <Link
          to="/leaderboard"
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Your Stats
        </Link>
      </div>
    </div>
  )
}
