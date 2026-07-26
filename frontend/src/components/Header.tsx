import { useState, useCallback, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/ThemeContext'
import { useClickOutside } from '../hooks/useClickOutside'
import ThemeModeDropdown from './ThemeModeDropdown'
import { getHomepageMode, setHomepageMode, type HomepageMode } from '../lib/preferences'
import { buildDebugInfo, formatDebugJson } from '../lib/debugInfo'
import Menu from './Menu'
import { Toast } from './Toast'
import { copyToClipboard, COPY_TOAST_DURATION } from '../lib/clipboard'

function MenuIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  )
}

const NAV_LINK_ACTIVE = 'text-accent'
const NAV_LINK_INACTIVE = 'text-foreground-muted hover:text-foreground'
const navLinkClass = (active: boolean) =>
  `px-3 py-1.5 rounded text-sm font-medium transition-colors ${active ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}`

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const modeDropdownRef = useRef<HTMLDivElement>(null)
  const [homepageModeState, setHomepageModeState] = useState<HomepageMode>(getHomepageMode)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const {
    colorTheme,
    setColorTheme,
    mode,
    modePreference,
    setModePreference,
    toggleMode,
    fontSize,
    setFontSize,
  } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  // Close dropdown when clicking outside
  useClickOutside(modeDropdownRef, modeDropdownOpen, () => {
    setModeDropdownOpen(false)
  })

  // Load homepage preference on mount
  // Hide header on game pages - they have their own UI
  // Game routes: /c/* for custom, or /:seed (anything not a known route)
  const knownRoutes = ['/', '/r', '/techniques', '/technique', '/custom', '/leaderboard', '/about']
  const isKnownRoute = knownRoutes.some(
    (route) => location.pathname === route || location.pathname.startsWith(route + '/'),
  )
  const isGamePage =
    location.pathname.startsWith('/c/') || (!isKnownRoute && location.pathname !== '/')

  // Close menu on route change (adjusting state during render avoids the effect)
  const [prevPathname, setPrevPathname] = useState(location.pathname)
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname)
    setMenuOpen(false)
  }

  // Bug report handlers - split into copy and report
  const handleCopyDebugInfo = useCallback(async () => {
    const debugInfo = buildDebugInfo(location.pathname, colorTheme, mode, homepageModeState)
    const debugJson = formatDebugJson(debugInfo)

    // Copy debug info to clipboard
    const success = await copyToClipboard(debugJson)
    if (success) {
      setToastMessage('Debug info copied!')
      setTimeout(() => {
        setToastMessage(null)
      }, COPY_TOAST_DURATION)
    }
  }, [location.pathname, colorTheme, mode, homepageModeState])

  // Feature request handler
  const handleFeatureRequest = useCallback(() => {
    // Open GitHub issues page (short URL for desktop compatibility)
    window.open('https://github.com/thodha/sudoku/issues', '_blank', 'noopener,noreferrer')
  }, [])

  // Handle homepage mode change
  const handleSetHomepageMode = useCallback(
    (newMode: HomepageMode) => {
      setHomepageMode(newMode)
      setHomepageModeState(newMode)
      if (location.pathname === '/') {
        setMenuOpen(false)
        void navigate('/')
      }
    },
    [location.pathname, navigate],
  )

  if (isGamePage) return null

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-b border-board-border-light h-12">
        <div className="mx-auto max-w-4xl px-4 h-full">
          <div className="flex h-full items-center justify-between">
            {/* Left: Logo */}
            <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
              <img
                src={
                  mode === 'dark'
                    ? `${import.meta.env.BASE_URL}sudoku-icon-dark.svg`
                    : `${import.meta.env.BASE_URL}sudoku-icon.svg`
                }
                alt="Sudoku"
                className="h-8 w-8"
              />
              <span>Sudoku</span>
            </Link>

            {/* Center: Nav links - desktop only */}
            <nav className="hidden sm:flex items-center gap-1">
              <Link to="/" className={navLinkClass(location.pathname === '/')}>
                {homepageModeState === 'daily' ? 'Daily' : 'Game'}
              </Link>
              <Link
                to="/techniques"
                className={navLinkClass(location.pathname.startsWith('/technique'))}
              >
                Learn
              </Link>
              <Link
                to="/leaderboard"
                className={navLinkClass(location.pathname === '/leaderboard')}
              >
                Scores
              </Link>
              <Link to="/about" className={navLinkClass(location.pathname === '/about')}>
                About
              </Link>
            </nav>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
              {/* Theme mode dropdown */}
              <ThemeModeDropdown
                mode={mode}
                modePreference={modePreference}
                isOpen={modeDropdownOpen}
                onToggle={() => {
                  setModeDropdownOpen(!modeDropdownOpen)
                }}
                onSetModePreference={setModePreference}
                dropdownRef={modeDropdownRef}
              />

              {/* Menu button */}
              <button
                onClick={() => {
                  setMenuOpen(true)
                }}
                className="p-2 rounded text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
                title="Menu"
                aria-label="Menu"
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
        onClose={() => {
          setMenuOpen(false)
        }}
        mode={mode}
        colorTheme={colorTheme}
        fontSize={fontSize}
        onSetMode={() => {
          toggleMode()
        }}
        onSetColorTheme={setColorTheme}
        onSetFontSize={setFontSize}
        onCopyDebugInfo={() => void handleCopyDebugInfo()}
        onFeatureRequest={handleFeatureRequest}
        showNavigation={true}
        homepageActions={{
          homepageMode: homepageModeState,
          onSetHomepageMode: handleSetHomepageMode,
        }}
      />

      {/* Toast notification */}
      {toastMessage && (
        <Toast className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 bg-foreground text-background rounded-lg shadow-lg text-sm font-medium">
          {toastMessage}
        </Toast>
      )}
    </>
  )
}
