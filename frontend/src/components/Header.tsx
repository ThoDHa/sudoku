import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme, ColorTheme } from '../lib/ThemeContext'
import { getHomepageMode, setHomepageMode, HomepageMode } from '../lib/preferences'

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

  if (isGamePage) return null

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border-light)] h-14">
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
            <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--border-light)]">
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
                      setHomepageMode('difficulty')
                      setHomepageModeState('difficulty')
                      if (location.pathname === '/') {
                        setMenuOpen(false)
                        navigate('/')
                      }
                    }}
                    className={`flex-1 px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                      homepageMode === 'difficulty'
                        ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                    }`}
                  >
                    Difficulty Select
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
