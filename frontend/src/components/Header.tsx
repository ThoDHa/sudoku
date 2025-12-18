import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme, ColorTheme } from '../lib/ThemeContext'
import { getHomepageMode, setHomepageMode, HomepageMode } from '../lib/preferences'
import { getScores, getDailyStreak, getDailyCompletions } from '../lib/scores'

function MenuIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function SunIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function MoonIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

const colorThemes: { key: ColorTheme; color: string }[] = [
  { key: 'blue', color: 'bg-blue-500' },
  { key: 'green', color: 'bg-green-500' },
  { key: 'purple', color: 'bg-purple-500' },
  { key: 'orange', color: 'bg-orange-500' },
  { key: 'pink', color: 'bg-pink-500' },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [homepageMode, setHomepageModeState] = useState<HomepageMode>('daily')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const { colorTheme, setColorTheme, mode, toggleMode } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  // Load homepage preference on mount
  useEffect(() => {
    setHomepageModeState(getHomepageMode())
  }, [])

  // Hide header on game pages - they have their own UI
  const isGamePage = location.pathname.startsWith('/p/') || 
                     location.pathname.startsWith('/game/') || 
                     location.pathname.startsWith('/c/')

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Bug report handler - collects general debug info
  const handleReportBug = useCallback(async () => {
    const scores = getScores()
    const streak = getDailyStreak()
    const completions = getDailyCompletions()
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      page: location.pathname,
      settings: {
        colorTheme: colorTheme,
        mode: mode,
        homepageMode: homepageMode,
      },
      stats: {
        totalGamesPlayed: scores.length,
        dailyStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        dailyCompletions: completions.size,
      },
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookiesEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        viewportSize: `${window.innerWidth}x${window.innerHeight}`,
        devicePixelRatio: window.devicePixelRatio,
      },
      storage: {
        localStorageAvailable: (() => {
          try {
            localStorage.setItem('test', 'test')
            localStorage.removeItem('test')
            return true
          } catch {
            return false
          }
        })(),
      },
    }

    const debugJson = JSON.stringify(debugInfo, null, 2)
    
    const issueBody = `## Bug Description
<!-- Please describe the bug you encountered -->

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior
<!-- What did you expect to happen? -->

## Actual Behavior
<!-- What actually happened? -->

<details>
<summary>Debug Information (click to expand)</summary>

\`\`\`json
${debugJson}
\`\`\`

</details>
`

    // Copy debug info to clipboard
    try {
      await navigator.clipboard.writeText(debugJson)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = debugJson
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    
    setToastMessage('Debug info copied!')
    setTimeout(() => setToastMessage(null), 2000)
    
    // Open GitHub issue
    const issueUrl = new URL('https://github.com/ThoDHa/sudoku/issues/new')
    issueUrl.searchParams.set('title', `Bug: [Please describe briefly]`)
    issueUrl.searchParams.set('body', issueBody)
    issueUrl.searchParams.set('labels', 'bug')
    
    window.open(issueUrl.toString(), '_blank')
    setMenuOpen(false)
  }, [location.pathname, colorTheme, mode, homepageMode])

  // Feature request handler
  const handleFeatureRequest = useCallback(() => {
    const issueBody = `## Feature Description
<!-- Please describe the feature you'd like to see -->

## Use Case
<!-- Why would this feature be useful? -->

## Possible Implementation
<!-- Optional: any ideas on how this could work? -->
`

    const issueUrl = new URL('https://github.com/ThoDHa/sudoku/issues/new')
    issueUrl.searchParams.set('title', `Feature: [Please describe briefly]`)
    issueUrl.searchParams.set('body', issueBody)
    issueUrl.searchParams.set('labels', 'enhancement')
    
    window.open(issueUrl.toString(), '_blank')
    setMenuOpen(false)
  }, [])

  if (isGamePage) return null

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border-light)] h-16">
        <div className="mx-auto max-w-4xl px-4 h-full">
          <div className="flex h-full items-center justify-between">
            {/* Left: Logo */}
            <Link to="/" className="flex items-center gap-2 font-semibold text-[var(--text)]">
              <span className="text-xl">🧩</span>
              <span>Sudoku</span>
            </Link>

            {/* Center: Nav links - desktop only */}
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname === '/' || location.pathname === '/daily'
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Play
              </Link>
              <Link
                to="/techniques"
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/technique')
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Learn
              </Link>
              <Link
                to="/leaderboard"
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname === '/leaderboard'
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Scores
              </Link>
            </nav>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              {/* Dark mode toggle */}
              <button
                onClick={toggleMode}
                className="p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
                title={mode === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>

              {/* Menu button */}
              <button
                onClick={() => setMenuOpen(true)}
                className="p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
                title="Menu"
              >
                <MenuIcon />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Fullscreen menu modal */}
      {menuOpen && (
        <div className="fixed inset-0 bg-[var(--bg)] z-50">
          <div className="flex flex-col h-full">
            {/* Header with close button */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-[var(--border-light)]">
              <span className="text-lg font-semibold text-[var(--text)]">Menu</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)]"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Navigation links */}
            <div className="flex-1 p-4 space-y-2 overflow-y-auto">
              <Link
                to="/"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-4 text-lg font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
              >
                Play
              </Link>
              <Link
                to="/techniques"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-4 text-lg font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
              >
                Learn Techniques
              </Link>
              <Link
                to="/leaderboard"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-4 text-lg font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
              >
                Leaderboard
              </Link>
              <Link
                to="/custom"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-4 text-lg font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
              >
                Custom Puzzle
              </Link>
              <Link
                to="/techniques/how-to-play"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-4 text-lg font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
              >
                How to Play
              </Link>
              
              {/* Divider */}
              <div className="my-4 border-t border-[var(--border-light)]" />
              
              {/* Feedback section */}
              <button
                onClick={handleFeatureRequest}
                className="w-full text-left px-4 py-4 text-lg font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
              >
                Request Feature
              </button>
              <button
                onClick={handleReportBug}
                className="w-full text-left px-4 py-4 text-lg font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
              >
                Report Bug
              </button>
            </div>

            {/* Settings at bottom */}
            <div className="p-4 border-t border-[var(--border-light)] space-y-4">
              {/* Dark mode toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-muted)]">Dark Mode</span>
                <button
                  onClick={toggleMode}
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    mode === 'dark' ? 'bg-[var(--accent)]' : 'bg-[var(--border-light)]'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      mode === 'dark' ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Theme colors */}
              <div>
                <div className="text-sm text-[var(--text-muted)] mb-3">Theme Color</div>
                <div className="flex gap-3">
                  {colorThemes.map((theme) => (
                    <button
                      key={theme.key}
                      onClick={() => setColorTheme(theme.key)}
                      className={`w-10 h-10 rounded-full ${theme.color} transition-transform ${
                        colorTheme === theme.key ? 'ring-2 ring-offset-2 ring-[var(--text)] scale-110' : 'hover:scale-110'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Homepage preference */}
              <div>
                <div className="text-sm text-[var(--text-muted)] mb-3">Homepage</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setHomepageMode('daily')
                      setHomepageModeState('daily')
                      if (location.pathname === '/') {
                        setMenuOpen(false)
                        navigate('/')
                      }
                    }}
                    className={`flex-1 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                      homepageMode === 'daily'
                        ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                    }`}
                  >
                    Daily Puzzle
                  </button>
                  <button
                    onClick={() => {
                      setHomepageMode('practice')
                      setHomepageModeState('practice')
                      if (location.pathname === '/') {
                        setMenuOpen(false)
                        navigate('/')
                      }
                    }}
                    className={`flex-1 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                      homepageMode === 'practice'
                        ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                    }`}
                  >
                    Practice Mode
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 bg-[var(--text)] text-[var(--bg)] rounded-lg shadow-lg text-sm font-medium">
          {toastMessage}
        </div>
      )}
    </>
  )
}
