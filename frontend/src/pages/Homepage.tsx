import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createGameRoute } from '../lib/constants'
import { useDailySeed, useLastDailyDifficulty, Difficulty } from '../lib/hooks'
import { isTodayCompleted, getDailyStreak } from '../lib/scores'
import { getHomepageMode, onHomepageModeChange, HomepageMode } from '../lib/preferences'
import DifficultyGrid from '../components/DifficultyGrid'

export default function Homepage() {
  const { data } = useDailySeed()
  const { difficulty, setDifficulty } = useLastDailyDifficulty()
  const navigate = useNavigate()
  
  const [mode, setMode] = useState<HomepageMode>(getHomepageMode())
  const [practiceSeed, setPracticeSeed] = useState(() => `P${Date.now()}`)
  
  // Subscribe to homepage mode changes from the menu
  useEffect(() => {
    return onHomepageModeChange(setMode)
  }, [])
  
  const completed = isTodayCompleted()
  const streak = getDailyStreak()

  // Generate a new practice seed when switching to practice mode
  useEffect(() => {
    if (mode === 'practice') {
      setPracticeSeed(`P${Date.now()}`)
    }
  }, [mode])

  // Handler for practice mode - just navigates, DifficultyGrid handles the rest
  const handlePracticeSelect = (_diff: Difficulty) => {
    // Generate new seed for next time
    setPracticeSeed(`P${Date.now()}`)
  }

  // If today's daily is completed and we're in daily mode, show completion screen
  if (mode === 'daily' && completed) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 bg-[var(--bg)] text-[var(--text)]">
        {/* Constrain to puzzle size - uses .game-container class from index.css */}
        <div className="game-container aspect-square flex flex-col items-center justify-center">
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
            onClick={() => navigate(createGameRoute('medium'))}
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
      {/* Constrain to puzzle size - uses .game-container class from index.css */}
      <div className="game-container aspect-square flex flex-col items-center justify-center">
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
                routePrefix="/p"
              />
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold">Practice Mode</h1>
            <p className="mb-4 text-sm text-[var(--text-muted)]">Choose your difficulty</p>

            <div className="w-full">
              <DifficultyGrid
                seed={practiceSeed}
                lastSelected={null}
                onSelect={handlePracticeSelect}
                routePrefix="/game"
              />
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
