import { Link } from 'react-router-dom'
import { useDailySeed, useLastDailyDifficulty } from '../lib/hooks'
import DifficultyGrid from '../components/DifficultyGrid'

export default function Daily() {
  const { data } = useDailySeed()
  const { difficulty, setDifficulty } = useLastDailyDifficulty()

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
