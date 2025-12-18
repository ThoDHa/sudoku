import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDailySeed, useLastDailyDifficulty, Difficulty } from '../lib/hooks'
import { isTodayCompleted, getDailyStreak } from '../lib/scores'
import { getHomepageMode, setHomepageMode, HomepageMode } from '../lib/preferences'
import DifficultyGrid from '../components/DifficultyGrid'
import DifficultyBadge from '../components/DifficultyBadge'

const difficulties: { key: Difficulty; description: string; givensHint: string }[] = [
  { key: 'easy', description: 'Great for beginners', givensHint: '~38-40 givens' },
  { key: 'medium', description: 'Some logic required', givensHint: '~32-36 givens' },
  { key: 'hard', description: 'Advanced techniques needed', givensHint: '~26-30 givens' },
  { key: 'extreme', description: 'For experienced solvers', givensHint: '~22-25 givens' },
  { key: 'impossible', description: 'Extreme challenge', givensHint: '~17-21 givens' },
]

export default function Daily() {
  const { data } = useDailySeed()
  const { difficulty, setDifficulty } = useLastDailyDifficulty()
  const navigate = useNavigate()
  
  const [mode, setMode] = useState<HomepageMode>(getHomepageMode())
  const [hoveredDifficulty, setHoveredDifficulty] = useState<Difficulty | null>(null)
  
  const completed = isTodayCompleted()
  const streak = getDailyStreak()

  const handleModeChange = (newMode: HomepageMode) => {
    setMode(newMode)
    setHomepageMode(newMode)
  }

  const generateSeed = () => `P${Date.now()}`

  const handlePracticePlay = (diff: Difficulty) => {
    navigate(`/game/${generateSeed()}?d=${diff}`)
  }

  // If today's daily is completed, show completion screen
  if (mode === 'daily' && completed) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 bg-[var(--bg)] text-[var(--text)]">
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
        
        <button
          onClick={() => handleModeChange('practice')}
          className="rounded-xl bg-[var(--accent)] px-8 py-4 text-lg font-semibold text-white transition-colors hover:opacity-90"
        >
          Play Practice Game
        </button>
        
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
    <div className="flex h-full flex-col items-center justify-center p-8 bg-[var(--bg)] text-[var(--text)]">
      {/* Mode Toggle */}
      <div className="mb-6 flex rounded-xl bg-[var(--bg-secondary)] p-1">
        <button
          onClick={() => handleModeChange('daily')}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            mode === 'daily'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          Daily
        </button>
        <button
          onClick={() => handleModeChange('practice')}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            mode === 'practice'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          Practice
        </button>
      </div>

      {mode === 'daily' ? (
        <>
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
        </>
      ) : (
        <>
          <h1 className="mb-2 text-3xl font-bold">Practice Mode</h1>
          <p className="mb-8 text-[var(--text-muted)]">Choose your difficulty</p>

          <div className="w-full max-w-md space-y-3">
            {difficulties.map(({ key, description, givensHint }) => (
              <button
                key={key}
                onClick={() => handlePracticePlay(key)}
                onMouseEnter={() => setHoveredDifficulty(key)}
                onMouseLeave={() => setHoveredDifficulty(null)}
                className="w-full rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4 text-left transition-all hover:border-[var(--accent)] hover:bg-[var(--btn-hover)]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <DifficultyBadge difficulty={key} size="md" />
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-[var(--text-muted)]">{givensHint}</span>
                    {hoveredDifficulty === key && (
                      <p className="mt-1 text-sm font-medium text-[var(--accent)]">Play &rarr;</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      
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
