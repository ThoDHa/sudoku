import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/ThemeContext'
import { getHomepageMode, setHomepageMode, HomepageMode } from '../lib/preferences'
import { getScores, getDailyStreak, getDailyCompletions } from '../lib/scores'
import Menu from './Menu'

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

function ComputerIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const modeDropdownRef = useRef<HTMLDivElement>(null)
  const [homepageModeState, setHomepageModeState] = useState<HomepageMode>('daily')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const { colorTheme, setColorTheme, mode, modePreference, setModePreference, toggleMode, fontSize, setFontSize } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(event.target as Node)) {
        setModeDropdownOpen(false)
      }
    }
    if (modeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [modeDropdownOpen])

  // Load homepage preference on mount
  useEffect(() => {
    setHomepageModeState(getHomepageMode())
  }, [])

  // Hide header on game pages - they have their own UI
  // Game routes: /c/* for custom, or /:seed (anything not a known route)
  const knownRoutes = ['/', '/r', '/techniques', '/technique', '/custom', '/leaderboard', '/about']
  const isKnownRoute = knownRoutes.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  )
  const isGamePage = location.pathname.startsWith('/c/') ||
                     (!isKnownRoute && location.pathname !== '/')

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
        homepageMode: homepageModeState,
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
  }, [location.pathname, colorTheme, mode, homepageModeState])

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
  }, [])

  // Handle homepage mode change
  const handleSetHomepageMode = useCallback((newMode: HomepageMode) => {
    setHomepageMode(newMode)
    setHomepageModeState(newMode)
    if (location.pathname === '/') {
      setMenuOpen(false)
      navigate('/')
    }
  }, [location.pathname, navigate])

  if (isGamePage) return null

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-b border-board-border-light h-12">
        <div className="mx-auto max-w-4xl px-4 h-full">
          <div className="flex h-full items-center justify-between">
            {/* Left: Logo */}
            <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
              <img src={mode === 'dark' ? `${import.meta.env.BASE_URL}sudoku-icon-dark.svg` : `${import.meta.env.BASE_URL}sudoku-icon.svg`} alt="Sudoku" className="h-8 w-8" />
              <span>Sudoku</span>
            </Link>

            {/* Center: Nav links - desktop only */}
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                to="/"
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname === '/'
                    ? 'text-accent'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                {homepageModeState === 'daily' ? 'Daily' : 'Game'}
              </Link>
              <Link
                to="/techniques"
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/technique')
                    ? 'text-accent'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                Learn
              </Link>
              <Link
                to="/leaderboard"
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname === '/leaderboard'
                    ? 'text-accent'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                Scores
              </Link>
              <Link
                to="/about"
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  location.pathname === '/about'
                    ? 'text-accent'
                    : 'text-foreground-muted hover:text-foreground'
                }`}
              >
                About
              </Link>
            </nav>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              {/* Theme mode dropdown */}
              <div className="relative" ref={modeDropdownRef}>
                <button
                  onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
                  className="p-2 rounded text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
                  title={`Theme: ${modePreference === 'system' ? `System (${mode})` : modePreference}`}
                >
                  {mode === 'dark' ? <MoonIcon /> : <SunIcon />}
                </button>
                {modeDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-32 rounded-lg bg-background-secondary border border-board-border-light shadow-lg overflow-hidden z-50">
                    <button
                      onClick={() => { setModePreference('light'); setModeDropdownOpen(false) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        modePreference === 'light' 
                          ? 'bg-accent text-btn-active-text' 
                          : 'text-foreground hover:bg-btn-hover'
                      }`}
                    >
                      <SunIcon className="h-4 w-4" />
                      Light
                    </button>
                    <button
                      onClick={() => { setModePreference('dark'); setModeDropdownOpen(false) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        modePreference === 'dark' 
                          ? 'bg-accent text-btn-active-text' 
                          : 'text-foreground hover:bg-btn-hover'
                      }`}
                    >
                      <MoonIcon className="h-4 w-4" />
                      Dark
                    </button>
                    <button
                      onClick={() => { setModePreference('system'); setModeDropdownOpen(false) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        modePreference === 'system' 
                          ? 'bg-accent text-btn-active-text' 
                          : 'text-foreground hover:bg-btn-hover'
                      }`}
                    >
                      <ComputerIcon className="h-4 w-4" />
                      System
                    </button>
                  </div>
                )}
              </div>

              {/* Menu button */}
              <button
                onClick={() => setMenuOpen(true)}
                className="p-2 rounded text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
                title="Menu"
              >
                <MenuIcon />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Menu modal */}
      <Menu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        mode={mode}
        colorTheme={colorTheme}
        fontSize={fontSize}
        onSetMode={() => toggleMode()}
        onSetColorTheme={setColorTheme}
        onSetFontSize={setFontSize}
        onReportBug={handleReportBug}
        onFeatureRequest={handleFeatureRequest}
        showNavigation={true}
        homepageActions={{
          homepageMode: homepageModeState,
          onSetHomepageMode: handleSetHomepageMode,
        }}
      />

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 bg-foreground text-background rounded-lg shadow-lg text-sm font-medium">
          {toastMessage}
        </div>
      )}
    </>
  )
}
