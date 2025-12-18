import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDailySeed, useLastDailyDifficulty, Difficulty } from '../lib/hooks'
import { isTodayCompleted, getDailyStreak } from '../lib/scores'
import { getHomepageMode } from '../lib/preferences'
import DifficultyGrid from '../components/DifficultyGrid'
import DifficultyBadge from '../components/DifficultyBadge'

const difficulties: { key: Difficulty; description: string }[] = [
  { key: 'easy', description: 'Great for beginners' },
  { key: 'medium', description: 'Some logic required' },
  { key: 'hard', description: 'Advanced techniques' },
  { key: 'extreme', description: 'For experienced solvers' },
  { key: 'impossible', description: 'Extreme challenge' },
]

export default function Daily() {
  const { data } = useDailySeed()
  const { difficulty, setDifficulty } = useLastDailyDifficulty()
  const navigate = useNavigate()
  
  const mode = getHomepageMode()
  const [hoveredDifficulty, setHoveredDifficulty] = useState<Difficulty | null>(null)
  
  const completed = isTodayCompleted()
  const streak = getDailyStreak()

  const generateSeed = () => `P${Date.now()}`

  const handlePracticePlay = (diff: Difficulty) => {
    navigate(`/game/${generateSeed()}?d=${diff}`)
  }

  // If today's daily is completed and we're in daily mode, show completion screen
  if (mode === 'daily' && completed) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 bg-[var(--bg)] text-[var(--text)]">
        {/* Constrain to puzzle width - uses .game-container class from index.css */}
        <div className="game-container flex flex-col items-center">
          <div className="mb-4 text-5xl">✅</div>
          <h1 className="mb-1 text-2xl font-bold">Daily Complete!</h1>
          <p className="mb-3 text-sm text-[var(--text-muted)]">{data.date_utc}</p>
          
          {/* Streak display */}
          <div className="mb-4 flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-[var(--accent)]">{streak.currentStreak}</div>
              <div className="text-xs text-[var(--text-muted)]">Current Streak</div>
            </div>
            <div className="h-10 w-px bg-[var(--border-light)]" />
            <div className="text-center">
              <div className="text-3xl font-bold">{streak.longestStreak}</div>
              <div className="text-xs text-[var(--text-muted)]">Best Streak</div>
            </div>
          </div>
          
          <p className="mb-4 text-center text-sm text-[var(--text-muted)]">
            Come back tomorrow for a new puzzle!
          </p>
          
          <button
            onClick={() => navigate(`/game/${generateSeed()}?d=medium`)}
            className="w-full rounded-xl bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:opacity-90"
          >
            Play Practice Game
          </button>
          
          <div className="mt-4 flex w-full gap-2">
            <Link
              to="/custom"
              className="flex-1 rounded-lg border border-[var(--border-light)] px-3 py-2 text-center text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
            >
              Custom
            </Link>
            <Link
              to="/techniques"
              className="flex-1 rounded-lg border border-[var(--border-light)] px-3 py-2 text-center text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
            >
              Techniques
            </Link>
            <Link
              to="/leaderboard"
              className="flex-1 rounded-lg border border-[var(--border-light)] px-3 py-2 text-center text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
            >
              Stats
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-4 bg-[var(--bg)] text-[var(--text)]">
      {/* Constrain to puzzle width - uses .game-container class from index.css */}
      <div className="game-container flex flex-col items-center">
        {mode === 'daily' ? (
          <>
            <h1 className="mb-1 text-2xl font-bold">Daily Sudoku</h1>
            <p className="mb-1 text-sm text-[var(--text-muted)]">{data.date_utc}</p>
            
            {/* Streak display */}
            {streak.currentStreak > 0 && (
              <div className="mb-4 flex items-center gap-2 text-[var(--accent)]">
                <span className="text-lg">🔥</span>
                <span className="text-sm font-semibold">{streak.currentStreak} day streak</span>
              </div>
            )}
            
            <div className="w-full">
              <DifficultyGrid
                seed={data.seed}
                lastSelected={difficulty}
                onSelect={setDifficulty}
              />
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold">Practice Mode</h1>
            <p className="mb-4 text-sm text-[var(--text-muted)]">Choose your difficulty</p>

            <div className="w-full space-y-2">
              {difficulties.map(({ key, description }) => (
                <button
                  key={key}
                  onClick={() => handlePracticePlay(key)}
                  onMouseEnter={() => setHoveredDifficulty(key)}
                  onMouseLeave={() => setHoveredDifficulty(null)}
                  className="w-full rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 text-left transition-all hover:border-[var(--accent)] hover:bg-[var(--btn-hover)]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <DifficultyBadge difficulty={key} size="sm" />
                      <span className="text-sm text-[var(--text-muted)]">{description}</span>
                    </div>
                    {hoveredDifficulty === key && (
                      <span className="text-sm font-medium text-[var(--accent)]">Play &rarr;</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        
        <div className="mt-6 flex w-full gap-2">
          <Link
            to="/custom"
            className="flex-1 rounded-lg border border-[var(--border-light)] px-3 py-2 text-center text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
          >
            Custom
          </Link>
          <Link
            to="/techniques"
            className="flex-1 rounded-lg border border-[var(--border-light)] px-3 py-2 text-center text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
          >
            Techniques
          </Link>
          <Link
            to="/leaderboard"
            className="flex-1 rounded-lg border border-[var(--border-light)] px-3 py-2 text-center text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
          >
            Stats
          </Link>
        </div>
      </div>
    </div>
  )
}
