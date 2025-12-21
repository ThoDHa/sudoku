import { useState, useEffect } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useDailySeed, useLastDailyDifficulty, Difficulty } from '../lib/hooks'
import { isTodayCompleted, getDailyStreak } from '../lib/scores'
import { getHomepageMode, setHomepageMode, onHomepageModeChange, HomepageMode } from '../lib/preferences'
import { getMostRecentGame, clearInProgressGame, getInProgressGames } from '../lib/gameSettings'
import { useTheme } from '../lib/ThemeContext'
import DifficultyGrid from '../components/DifficultyGrid'

/**
 * Find an in-progress game for a specific seed (e.g., today's daily seed)
 */
function getInProgressGameForSeed(seed: string) {
  const games = getInProgressGames()
  return games.find(g => g.seed === seed) ?? null
}

// Enso logo - loads light or dark version based on theme
function EnsoLogo() {
  const { mode } = useTheme()
  const base = import.meta.env.BASE_URL
  const src = mode === 'dark' ? `${base}sudoku-icon-dark.svg` : `${base}sudoku-icon.svg`
  
  return (
    <img 
      src={src} 
      alt="Enso" 
      className="enso-logo"
    />
  )
}

export default function Homepage() {
  const { data } = useDailySeed()
  const { difficulty, setDifficulty } = useLastDailyDifficulty()
  const navigate = useNavigate()
  
  const [mode, setMode] = useState<HomepageMode>(getHomepageMode())
  const [practiceSeed, setPracticeSeed] = useState(() => `P${Date.now()}`)
  const [inProgressGame, setInProgressGame] = useState(() => getMostRecentGame())
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  
  // Check if today's daily puzzle has an in-progress game
  const dailyInProgress = getInProgressGameForSeed(data.seed)
  
  // Subscribe to homepage mode changes from the menu
  useEffect(() => {
    return onHomepageModeChange(setMode)
  }, [])
  
  // Refresh in-progress game status when returning to homepage
  useEffect(() => {
    setInProgressGame(getMostRecentGame())
  }, [])
  
  const completed = isTodayCompleted()
  const streak = getDailyStreak()
  
  // AUTO-REDIRECT: If in daily mode and today's daily has an in-progress game, resume it immediately
  if (mode === 'daily' && !completed && dailyInProgress) {
    return <Navigate to={`/p/${data.seed}?d=${dailyInProgress.difficulty}`} replace />
  }

  // Generate a new practice seed when switching to practice mode
  useEffect(() => {
    if (mode === 'practice') {
      setPracticeSeed(`P${Date.now()}`)
    }
  }, [mode])

  // Confirm starting new game (abandoning current)
  const confirmNewGame = () => {
    // Clear the old in-progress game before navigating
    if (inProgressGame) {
      clearInProgressGame(inProgressGame.seed)
      setInProgressGame(null)
    }
    if (pendingNavigation) {
      navigate(pendingNavigation)
    }
    setShowNewGameConfirm(false)
    setPendingNavigation(null)
  }

  // Handler for practice mode - persist mode and generate new seed
  const handlePracticeSelect = (_diff: Difficulty) => {
    // Persist practice mode so returning to homepage shows practice
    setHomepageMode('practice')
    // Generate new seed for next time
    setPracticeSeed(`P${Date.now()}`)
  }

  // Handler for daily mode - persist mode
  const handleDailySelect = (diff: Difficulty) => {
    // Persist daily mode so returning to homepage shows daily
    setHomepageMode('daily')
    setDifficulty(diff)
  }

  // If today's daily is completed and we're in daily mode, show completion screen
  if (mode === 'daily' && completed) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 bg-background text-foreground">
        {/* Constrain to puzzle size - uses .game-container class from index.css */}
        <div className="game-container flex flex-col items-center justify-center">
          <EnsoLogo />
          <h1 className="homepage-title">Daily Complete!</h1>
          <p className="homepage-subtitle text-foreground-muted">{data.date_utc}</p>
          
          {/* Streak display */}
          <div className="mb-4 flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-accent">{streak.currentStreak}</div>
              <div className="text-xs text-foreground-muted">Current Streak</div>
            </div>
            <div className="h-10 w-px bg-board-border-light" />
            <div className="text-center">
              <div className="text-3xl font-bold">{streak.longestStreak}</div>
              <div className="text-xs text-foreground-muted">Best Streak</div>
            </div>
          </div>
          
          <p className="mb-4 text-center text-sm text-foreground-muted">
            Come back tomorrow for a new puzzle!
          </p>
          
          <button
            onClick={() => {
              setHomepageMode('practice')
              setMode('practice')
            }}
            className="w-full rounded-xl bg-accent px-6 py-3 font-semibold text-white transition-colors hover:opacity-90"
          >
            Play Practice Game
          </button>
          
          <div className="mt-4 flex w-full gap-2">
            <Link
              to="/custom"
              className="flex-1 rounded-lg border border-board-border-light px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
            >
              Custom
            </Link>
            <Link
              to="/techniques"
              className="flex-1 rounded-lg border border-board-border-light px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
            >
              Techniques
            </Link>
            <Link
              to="/leaderboard"
              className="flex-1 rounded-lg border border-board-border-light px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
            >
              Stats
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-4 bg-background text-foreground">
      {/* Constrain to puzzle size - uses .game-container class from index.css */}
      {/* Removed aspect-square to allow content to flow naturally on all viewport sizes */}
      <div className="game-container flex flex-col items-center justify-center">
        {mode === 'daily' ? (
          <>
            <EnsoLogo />
            <h1 className="homepage-title">Daily Sudoku</h1>
            <p className="homepage-subtitle text-foreground-muted">{data.date_utc}</p>
            
            {/* Streak display */}
            {streak.currentStreak > 0 && (
              <div className="mb-4 flex items-center gap-2 text-accent">
                <span className="text-lg">🔥</span>
                <span className="text-sm font-semibold">{streak.currentStreak} day streak</span>
              </div>
            )}
            
            <div className="w-full">
              <DifficultyGrid
                seed={data.seed}
                lastSelected={difficulty}
                onSelect={handleDailySelect}
                routePrefix="/p"
                resumeDifficulty={inProgressGame?.difficulty}
                onBeforeNavigate={(path) => {
                  // Only show confirmation if clicking a DIFFERENT difficulty than the resumable one
                  if (inProgressGame && !path.includes(`d=${inProgressGame.difficulty}`)) {
                    setPendingNavigation(path)
                    setShowNewGameConfirm(true)
                    return false
                  }
                  return true
                }}
              />
            </div>
          </>
        ) : (
          <>
            <EnsoLogo />
            <h1 className="homepage-title">Practice Mode</h1>
            <p className="homepage-subtitle text-foreground-muted">Choose your difficulty</p>

            <div className="w-full">
              <DifficultyGrid
                seed={practiceSeed}
                lastSelected={null}
                onSelect={handlePracticeSelect}
                routePrefix="/game"
                resumeDifficulty={inProgressGame?.difficulty}
                resumeSeed={inProgressGame?.seed}
                onBeforeNavigate={(path) => {
                  // Only show confirmation if there's an in-progress game AND we're starting a NEW game
                  // (not resuming the existing one)
                  if (inProgressGame && !path.includes(inProgressGame.seed)) {
                    setPendingNavigation(path)
                    setShowNewGameConfirm(true)
                    return false
                  }
                  return true
                }}
              />
            </div>
          </>
        )}
        
        <div className="mt-6 flex w-full gap-2">
          <Link
            to="/custom"
            className="flex-1 rounded-lg border border-board-border-light px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
          >
            Custom
          </Link>
          <Link
            to="/techniques"
            className="flex-1 rounded-lg border border-board-border-light px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
          >
            Techniques
          </Link>
          <Link
            to="/leaderboard"
            className="flex-1 rounded-lg border border-board-border-light px-3 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-btn-hover"
          >
            Stats
          </Link>
        </div>
      </div>

      {/* Confirmation modal for starting new game */}
      {showNewGameConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-background-secondary p-6 shadow-theme">
            <h2 className="mb-2 text-lg font-semibold text-foreground">Start New Game?</h2>
            <p className="mb-6 text-sm text-foreground-muted">
              You have a <span className="capitalize font-medium">{inProgressGame?.difficulty}</span> game in progress. Starting a new game will abandon your current progress.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNewGameConfirm(false)
                  setPendingNavigation(null)
                }}
                className="flex-1 rounded-lg border border-board-border-light px-4 py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
              >
                Cancel
              </button>
              <button
                onClick={confirmNewGame}
                className="flex-1 rounded-lg bg-accent px-4 py-2 font-medium text-btn-active-text transition-colors hover:opacity-90"
              >
                Start New
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
