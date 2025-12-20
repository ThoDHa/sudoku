import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useDailySeed, useLastDailyDifficulty, Difficulty } from '../lib/hooks'
import { isTodayCompleted, getDailyStreak } from '../lib/scores'
import { getHomepageMode, setHomepageMode, onHomepageModeChange, HomepageMode } from '../lib/preferences'
import DifficultyGrid from '../components/DifficultyGrid'

// Enso circle with 9 - Zen brushstroke logo
function EnsoLogo({ size = 80 }: { size?: number }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 512 512" 
      className="mb-4"
    >
      {/* Background - subtle warm paper texture color */}
      <rect width="512" height="512" className="fill-background" rx="64"/>
      
      {/* Enso circle - the Zen brushstroke, intentionally incomplete */}
      <g transform="translate(256, 256)">
        {/* Main enso stroke - thick calligraphic brush arc */}
        <path 
          d="M 140 -100 
             A 180 180 0 1 0 100 -145
             Q 115 -140 130 -125
             A 140 140 0 1 1 105 -80
             Q 115 -90 140 -100"
          className="fill-foreground"
          stroke="none"
        />
        
        {/* Brush stroke start - thicker with ink pooling effect */}
        <ellipse cx="140" cy="-100" rx="28" ry="20" className="fill-foreground" transform="rotate(-35 140 -100)"/>
        
        {/* Brush stroke tail - tapered end where brush lifts */}
        <path 
          d="M 100 -145 
             Q 85 -155 70 -160
             Q 80 -150 100 -145"
          className="fill-foreground"
          opacity="0.8"
        />
      </g>
      
      {/* Number 9 - clean, centered within the enso */}
      <text 
        x="256" 
        y="305" 
        fontFamily="Georgia, 'Times New Roman', serif" 
        fontSize="220" 
        fontWeight="400" 
        className="fill-foreground" 
        textAnchor="middle"
      >9</text>
    </svg>
  )
}

export default function Homepage() {
  const { data } = useDailySeed()
  const { difficulty, setDifficulty } = useLastDailyDifficulty()
  
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
      <div className="flex h-full flex-col items-center justify-center p-4 bg-background text-foreground">
        {/* Constrain to puzzle size - uses .game-container class from index.css */}
        <div className="game-container aspect-square flex flex-col items-center justify-center">
          <EnsoLogo size={80} />
          <h1 className="mb-1 text-2xl font-bold">Daily Complete!</h1>
          <p className="mb-3 text-sm text-foreground-muted">{data.date_utc}</p>
          
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
      <div className="game-container aspect-square flex flex-col items-center justify-center">
        {mode === 'daily' ? (
          <>
            <EnsoLogo size={80} />
            <h1 className="mb-1 text-2xl font-bold">Daily Sudoku</h1>
            <p className="mb-1 text-sm text-foreground-muted">{data.date_utc}</p>
            
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
                onSelect={setDifficulty}
                routePrefix="/p"
              />
            </div>
          </>
        ) : (
          <>
            <EnsoLogo size={80} />
            <h1 className="mb-1 text-2xl font-bold">Practice Mode</h1>
            <p className="mb-4 text-sm text-foreground-muted">Choose your difficulty</p>

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
