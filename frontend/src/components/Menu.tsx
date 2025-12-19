import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ColorTheme, FontSize } from '../lib/ThemeContext'
import { AutoSolveSpeed, setAutoSolveSpeed, HomepageMode } from '../lib/preferences'
import { clearAllCaches, CACHE_VERSION } from '../lib/cache-version'
import { getAutoSaveEnabled, setAutoSaveEnabled } from '../lib/gameSettings'
import { createGameRoute } from '../lib/constants'

// Font size options
const fontSizes: { key: FontSize; label: string }[] = [
  { key: 'xs', label: 'A' },
  { key: 'small', label: 'A' },
  { key: 'medium', label: 'A' },
  { key: 'large', label: 'A' },
  { key: 'xl', label: 'A' },
]

// Auto-solve speed options
const speedOptions = [
  { speed: 'slow' as const, icon: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ), label: '1x' },
  { speed: 'normal' as const, icon: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 5v14l8-7z"/>
      <path d="M12 5v14l8-7z"/>
    </svg>
  ), label: '2x' },
  { speed: 'fast' as const, icon: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 5v14l6-7z"/>
      <path d="M9 5v14l6-7z"/>
      <path d="M16 5v14l6-7z"/>
    </svg>
  ), label: '3x' },
  { speed: 'instant' as const, icon: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 5v14l5-7z"/>
      <path d="M8 5v14l5-7z"/>
      <path d="M14 5v14l5-7z"/>
      <rect x="20" y="5" width="2" height="14"/>
    </svg>
  ), label: 'Skip' },
]

// Color theme options
const colorThemes: { key: ColorTheme; color: string }[] = [
  { key: 'blue', color: 'bg-blue-500' },
  { key: 'green', color: 'bg-green-500' },
  { key: 'purple', color: 'bg-purple-500' },
  { key: 'orange', color: 'bg-orange-500' },
  { key: 'pink', color: 'bg-pink-500' },
]

// Game actions (for game page)
interface GameActions {
  onAutoFillNotes: () => void
  onCheckNotes: () => void
  onClearNotes: () => void
  onValidate: () => void
  onSolve: () => void
  onClearAll: () => void
  onTechniquesList: () => void
  isComplete: boolean
  autoSolveSpeed: AutoSolveSpeed
  onSetAutoSolveSpeed: (speed: AutoSolveSpeed) => void
  hideTimerState: boolean
  onToggleHideTimer: () => void
}

// Homepage actions (for homepage)
interface HomepageActions {
  homepageMode: HomepageMode
  onSetHomepageMode: (mode: HomepageMode) => void
}

interface MenuProps {
  isOpen: boolean
  onClose: () => void
  // Theme settings (always shown)
  mode: 'light' | 'dark'
  colorTheme: ColorTheme
  fontSize: FontSize
  onSetMode: (mode: 'light' | 'dark') => void
  onSetColorTheme: (theme: ColorTheme) => void
  onSetFontSize: (size: FontSize) => void
  // Bug report
  onReportBug: () => void
  bugReportCopied?: boolean
  // Optional: game-specific actions
  gameActions?: GameActions
  // Optional: homepage-specific actions
  homepageActions?: HomepageActions
  // Optional: show navigation links (for non-game pages)
  showNavigation?: boolean
  // Optional: feature request handler
  onFeatureRequest?: () => void
}

export default function Menu({
  isOpen,
  onClose,
  mode,
  colorTheme,
  fontSize,
  onSetMode,
  onSetColorTheme,
  onSetFontSize,
  onReportBug,
  bugReportCopied = false,
  gameActions,
  homepageActions,
  showNavigation = false,
  onFeatureRequest,
}: MenuProps) {
  const navigate = useNavigate()
  const [newPuzzleMenuOpen, setNewPuzzleMenuOpen] = useState(false)
  const [cacheCleared, setCacheCleared] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabledState] = useState(getAutoSaveEnabled)

  // Close submenu when menu closes
  useEffect(() => {
    if (!isOpen) {
      setNewPuzzleMenuOpen(false)
    }
  }, [isOpen])

  const handleSpeedChange = (speed: AutoSolveSpeed) => {
    if (gameActions) {
      setAutoSolveSpeed(speed)
      gameActions.onSetAutoSolveSpeed(speed)
    }
  }

  const handleAutoSaveToggle = () => {
    const newValue = !autoSaveEnabled
    setAutoSaveEnabledState(newValue)
    setAutoSaveEnabled(newValue)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-[99]" 
        onClick={onClose}
      />
      
      {/* Modal - centered in viewport */}
      <div 
        className="fixed inset-0 z-[100] overflow-y-auto"
        onClick={onClose}
      >
        <div className="min-h-full flex items-center justify-center p-4">
          <div 
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border-light)] bg-[var(--bg)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-light)]">
            <span className="text-lg font-semibold text-[var(--text)]">Menu</span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-3 space-y-1">
            {/* Navigation Links (for non-game pages) */}
            {showNavigation && (
              <>
                <Link
                  to="/"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Play
                </Link>
                <Link
                  to="/techniques"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Learn Techniques
                </Link>
                <Link
                  to="/leaderboard"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Leaderboard
                </Link>
                <Link
                  to="/custom"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Custom Puzzle
                </Link>
                <Link
                  to="/techniques/how-to-play"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2.5 text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  How to Play
                </Link>
                <div className="my-2 border-t border-[var(--border-light)]" />
              </>
            )}

            {/* Game Actions (for game page) */}
            {gameActions && (
              <>
                <div className="px-3 py-1">
                  <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Actions</span>
                </div>
                <button
                  onClick={() => { gameActions.onAutoFillNotes(); onClose() }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Auto-fill Notes
                </button>
                <button
                  onClick={() => { gameActions.onCheckNotes(); onClose() }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Check Notes
                </button>
                <button
                  onClick={() => { gameActions.onClearNotes(); onClose() }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear Notes
                </button>
                <button
                  onClick={() => { gameActions.onValidate(); onClose() }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Check Progress
                </button>
                
                {/* Solve with speed options */}
                <div className="flex w-full items-center px-3 py-2 rounded-lg hover:bg-[var(--btn-hover)]">
                  <button
                    onClick={() => { gameActions.onSolve(); onClose() }}
                    className="flex items-center gap-3 text-sm text-[var(--text)]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Solve
                  </button>
                  <div className="ml-auto flex gap-0.5">
                    {speedOptions.map(({ speed, icon, label }) => (
                      <button
                        key={speed}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSpeedChange(speed)
                          onClose()
                          gameActions.onSolve()
                        }}
                        title={`${label} - Click to start`}
                        className={`p-1 rounded ${
                          gameActions.autoSolveSpeed === speed
                            ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                            : 'text-[var(--text-muted)] hover:bg-[var(--btn-hover)] hover:text-[var(--text)]'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
                
                <button
                  onClick={() => { gameActions.onClearAll(); onClose() }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  {gameActions.isComplete ? (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Restart
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear All
                    </>
                  )}
                </button>

                <div className="my-2 border-t border-[var(--border-light)]" />

                {/* New Puzzle submenu */}
                <div className="rounded-lg overflow-hidden">
                  <button
                    onClick={() => setNewPuzzleMenuOpen(!newPuzzleMenuOpen)}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                  >
                    <span className="flex items-center gap-3">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New Puzzle
                    </span>
                    <svg className={`h-3 w-3 transition-transform ${newPuzzleMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {newPuzzleMenuOpen && (
                    <div className="ml-8 py-1 space-y-0.5">
                      {['easy', 'medium', 'hard', 'extreme', 'impossible'].map((d) => (
                        <button
                          key={d}
                          onClick={() => { 
                            navigate(createGameRoute(d))
                            onClose()
                          }}
                          className="block w-full px-3 py-1.5 text-left text-sm capitalize text-[var(--text-muted)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                        >
                          {d}
                        </button>
                      ))}
                      <button
                        onClick={() => { 
                          navigate('/custom')
                          onClose()
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm text-[var(--text-muted)] hover:text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
                      >
                        Custom
                      </button>
                    </div>
                  )}
                </div>

                <div className="my-2 border-t border-[var(--border-light)]" />
              </>
            )}

            {/* Settings Section */}
            <div className="px-3 py-1">
              <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Settings</span>
            </div>

            {/* Theme: dark mode toggle + color picker */}
            <div className="flex items-center justify-between px-3 py-2">
              <button
                onClick={() => onSetMode(mode === 'light' ? 'dark' : 'light')}
                className="p-1.5 rounded-lg text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
                title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {mode === 'dark' ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <div className="flex gap-2">
                {colorThemes.map((theme) => (
                  <button
                    key={theme.key}
                    onClick={() => onSetColorTheme(theme.key)}
                    className={`w-6 h-6 rounded-full ${theme.color} transition-transform ${
                      colorTheme === theme.key 
                        ? 'ring-2 ring-offset-2 ring-[var(--text)] scale-110' 
                        : 'hover:scale-110'
                    }`}
                    title={`${theme.key} theme`}
                  />
                ))}
              </div>
            </div>

            {/* Font size selector */}
            <div className="flex items-center justify-center gap-1 px-3 py-2">
              {fontSizes.map((size) => (
                <button
                  key={size.key}
                  onClick={() => onSetFontSize(size.key)}
                  aria-label={`${size.key} text size`}
                  className={`font-size-btn font-size-btn-${size.key} ${
                    fontSize === size.key 
                      ? 'bg-[var(--accent)] text-[var(--btn-active-text)]' 
                      : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                  }`}
                >
                  {size.label}
                </button>
              ))}
            </div>

            {/* Hide timer toggle (game only) */}
            {gameActions && (
              <button
                onClick={gameActions.onToggleHideTimer}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
              >
                <div className="flex items-center gap-3">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {gameActions.hideTimerState ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}

            {/* Auto-save toggle (game only) */}
            {gameActions && (
              <button
                onClick={handleAutoSaveToggle}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
              >
                <div className="flex items-center gap-3">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>Auto-Save Progress</span>
                </div>
                <div className={`w-8 h-5 rounded-full transition-colors ${autoSaveEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-light)]'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${autoSaveEnabled ? 'translate-x-3' : 'translate-x-0'}`} />
                </div>
              </button>
            )}
                  </svg>
                  <span>{gameActions.hideTimerState ? 'Show Timer' : 'Hide Timer'}</span>
                </div>
                <div className={`w-8 h-5 rounded-full transition-colors ${gameActions.hideTimerState ? 'bg-[var(--accent)]' : 'bg-[var(--border-light)]'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${gameActions.hideTimerState ? 'translate-x-3' : 'translate-x-0'}`} />
                </div>
              </button>
            )}

            {/* Homepage mode toggle (homepage only) */}
            {homepageActions && (
              <div className="px-3 py-2">
                <div className="text-xs text-[var(--text-muted)] mb-2">Homepage Mode</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => homepageActions.onSetHomepageMode('daily')}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      homepageActions.homepageMode === 'daily'
                        ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                    }`}
                  >
                    Daily Puzzle
                  </button>
                  <button
                    onClick={() => homepageActions.onSetHomepageMode('practice')}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      homepageActions.homepageMode === 'practice'
                        ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                    }`}
                  >
                    Practice Mode
                  </button>
                </div>
              </div>
            )}

            <div className="my-2 border-t border-[var(--border-light)]" />

            {/* Learn Techniques (game page) */}
            {gameActions && (
              <button
                onClick={() => { gameActions.onTechniquesList(); onClose() }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Learn Techniques
              </button>
            )}

            {/* Feature request (non-game pages) */}
            {onFeatureRequest && (
              <button
                onClick={() => { onFeatureRequest(); onClose() }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text)] rounded-lg hover:bg-[var(--btn-hover)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Request Feature
              </button>
            )}

            {/* Debug Section */}
            {import.meta.env.DEV && (
              <>
                <div className="my-2 border-t border-[var(--border-light)]" />
                <div className="px-3 py-1">
                  <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Debug</span>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await clearAllCaches()
                      setCacheCleared(true)
                      setTimeout(() => setCacheCleared(false), 3000)
                      // Reload page to get fresh content
                      window.location.reload()
                    } catch (error) {
                      console.error('Failed to clear caches:', error)
                    }
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text-muted)] rounded-lg hover:bg-[var(--btn-hover)]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {cacheCleared ? 'Cache Cleared!' : `Clear Cache (v${CACHE_VERSION})`}
                </button>
              </>
            )}

            {/* Production Cache Clear (always available) */}
            <button
              onClick={async () => {
                try {
                  await clearAllCaches()
                  setCacheCleared(true)
                  setTimeout(() => setCacheCleared(false), 3000)
                  // Reload page to get fresh content
                  window.location.reload()
                } catch (error) {
                  console.error('Failed to clear caches:', error)
                }
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text-muted)] rounded-lg hover:bg-[var(--btn-hover)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {cacheCleared ? 'App Cache Cleared!' : 'Clear App Cache'}
            </button>

            {/* Report Bug */}
            <button
              onClick={() => { onReportBug(); onClose() }}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text-muted)] rounded-lg hover:bg-[var(--btn-hover)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {bugReportCopied ? 'Copied!' : 'Report Bug'}
            </button>

            {/* Request Feature */}
            {onFeatureRequest && (
              <button
                onClick={() => { onFeatureRequest(); onClose() }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--text-muted)] rounded-lg hover:bg-[var(--btn-hover)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Request Feature
              </button>
            )}

            {/* Version */}
            <div className="px-3 py-2 text-xs text-[var(--text-muted)] text-center border-t border-[var(--border-light)] mt-2">
              v{__COMMIT_HASH__}
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  )
}
