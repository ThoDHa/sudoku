import { Link } from 'react-router-dom'
import { useDailySeed, useLastDailyDifficulty } from '../lib/hooks'
import { isTodayCompleted, getDailyStreak } from '../lib/scores'
import DifficultyGrid from '../components/DifficultyGrid'

export default function Daily() {
  const { data } = useDailySeed()
  const { difficulty, setDifficulty } = useLastDailyDifficulty()
  
  const completed = isTodayCompleted()
  const streak = getDailyStreak()

  // If today's daily is completed, redirect to play page
  if (completed) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center p-8 bg-[var(--bg)] text-[var(--text)]">
        <div className="mb-6 text-6xl">✅</div>
        <h1 className="mb-2 text-3xl font-bold">Daily Complete!</h1>
        <p className="mb-4 text-[var(--text-muted)]">{data.date_utc}</p>
        
        {/* Streak display */}
        <div className="mb-8 flex items-center gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-[var(--accent)]">{streak.currentStreak}</div>
            <div className="text-sm text-[var(--text-muted)]">Current Streak</div>
          </div>
          <div className="h-12 w-px bg-[var(--border-light)]" />
          <div className="text-center">
            <div className="text-4xl font-bold">{streak.longestStreak}</div>
            <div className="text-sm text-[var(--text-muted)]">Best Streak</div>
          </div>
        </div>
        
        <p className="mb-8 text-center text-[var(--text-muted)]">
          Come back tomorrow for a new puzzle!<br />
          In the meantime, try a practice game.
        </p>
        
        <Link
          to="/play"
          className="rounded-xl bg-[var(--accent)] px-8 py-4 text-lg font-semibold text-white transition-colors hover:opacity-90"
        >
          Play Practice Game
        </Link>
        
        <div className="mt-8 flex flex-wrap justify-center gap-4">
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

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-8 bg-[var(--bg)] text-[var(--text)]">
      <h1 className="mb-2 text-3xl font-bold">Daily Sudoku</h1>
      <p className="mb-2 text-[var(--text-muted)]">{data.date_utc}</p>
      
      {/* Streak display */}
      {streak.currentStreak > 0 && (
        <div className="mb-6 flex items-center gap-2 text-[var(--accent)]">
          <span className="text-xl">🔥</span>
          <span className="font-semibold">{streak.currentStreak} day streak</span>
        </div>
      )}
      
      <DifficultyGrid
        seed={data.seed}
        lastSelected={difficulty}
        onSelect={setDifficulty}
      />
      
      <div className="mt-12 flex flex-wrap justify-center gap-4">
        <Link
          to="/play"
          className="rounded-lg border border-[var(--border-light)] px-6 py-3 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Practice Mode
        </Link>
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
