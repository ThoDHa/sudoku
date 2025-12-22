import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ColorTheme, FontSize } from '../lib/ThemeContext'
import { AutoSolveSpeed, setAutoSolveSpeed, HomepageMode } from '../lib/preferences'
import { clearAllCaches, CACHE_VERSION } from '../lib/cache-version'
import { getAutoSaveEnabled, setAutoSaveEnabled } from '../lib/gameSettings'
import { createGameRoute, SPEED_OPTIONS, COLOR_THEMES } from '../lib/constants'

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
  hasUnsavedProgress?: boolean // True if user has made moves and game not complete
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

// =============================================================================
// SUBCOMPONENT: NavigationSection
// =============================================================================
interface NavigationSectionProps {
  onClose: () => void
}

function NavigationSection({ onClose }: NavigationSectionProps) {
  return (
    <>
      <Link
        to="/"
        onClick={onClose}
        className="flex items-center gap-3 px-3 py-2.5 text-foreground rounded-lg hover:bg-btn-hover"
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
        className="flex items-center gap-3 px-3 py-2.5 text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Learn Techniques
      </Link>
      <Link
        to="/leaderboard"
        onClick={onClose}
        className="flex items-center gap-3 px-3 py-2.5 text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Leaderboard
      </Link>
      <Link
        to="/custom"
        onClick={onClose}
        className="flex items-center gap-3 px-3 py-2.5 text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Custom Puzzle
      </Link>
      <Link
        to="/techniques/how-to-play"
        onClick={onClose}
        className="flex items-center gap-3 px-3 py-2.5 text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        How to Play
      </Link>
      <Link
        to="/about"
        onClick={onClose}
        className="flex items-center gap-3 px-3 py-2.5 text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        About
      </Link>
      <div className="my-1 border-t border-board-border-light" />
    </>
  )
}

// =============================================================================
// SUBCOMPONENT: GameActionsSection
// =============================================================================
interface GameActionsSectionProps {
  gameActions: GameActions
  onClose: () => void
  newPuzzleMenuOpen: boolean
  setNewPuzzleMenuOpen: (open: boolean) => void
  setSettingsExpanded: (expanded: boolean) => void
  handleNewPuzzle: (difficulty: string) => void
  handleSpeedChange: (speed: AutoSolveSpeed) => void
}

function GameActionsSection({
  gameActions,
  onClose,
  newPuzzleMenuOpen,
  setNewPuzzleMenuOpen,
  setSettingsExpanded,
  handleNewPuzzle,
  handleSpeedChange,
}: GameActionsSectionProps) {
  return (
    <>
      <div className="px-3 py-1">
        <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Actions</span>
      </div>
      <button
        onClick={() => { gameActions.onAutoFillNotes(); onClose() }}
        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Auto-fill Notes
      </button>
      <button
        onClick={() => { gameActions.onCheckNotes(); onClose() }}
        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        Check Notes
      </button>
      <button
        onClick={() => { gameActions.onClearNotes(); onClose() }}
        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        Clear Notes
      </button>
      <button
        onClick={() => { gameActions.onValidate(); onClose() }}
        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Check Progress
      </button>
      
      {/* Solve with speed options */}
      <div className="flex w-full items-center px-3 py-2 rounded-lg hover:bg-btn-hover">
        <button
          onClick={() => { gameActions.onSolve(); onClose() }}
          className="flex items-center gap-3 text-sm text-foreground"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Solve
        </button>
        <div className="ml-auto flex gap-0.5">
          {SPEED_OPTIONS.map(({ speed, iconPaths, hasRect, label }) => (
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
                  ? 'bg-accent text-btn-active-text'
                  : 'text-foreground-muted hover:bg-btn-hover hover:text-foreground'
              }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                {iconPaths.map((d, i) => <path key={i} d={d} />)}
                {hasRect && <rect x="20" y="5" width="2" height="14" />}
              </svg>
            </button>
          ))}
        </div>
      </div>
      
      <button
        onClick={() => { gameActions.onClearAll(); onClose() }}
        className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
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

      <div className="my-1 border-t border-board-border-light" />

      {/* New Game submenu */}
      <div className="rounded-lg overflow-hidden">
        <button
          onClick={() => {
            setNewPuzzleMenuOpen(!newPuzzleMenuOpen)
            setSettingsExpanded(false)
          }}
          className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
        >
          <span className="flex items-center gap-3">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Game
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
                onClick={() => handleNewPuzzle(d)}
                className="block w-full px-3 py-1.5 text-left text-sm capitalize text-foreground-muted hover:text-foreground rounded-lg hover:bg-btn-hover"
              >
                {d}
              </button>
            ))}
            <button
              onClick={() => handleNewPuzzle('custom')}
              className="block w-full px-3 py-1.5 text-left text-sm text-foreground-muted hover:text-foreground rounded-lg hover:bg-btn-hover"
            >
              Custom
            </button>
          </div>
        )}
      </div>

      <div className="my-1 border-t border-board-border-light" />
    </>
  )
}

// =============================================================================
// SUBCOMPONENT: SettingsSection
// =============================================================================
interface SettingsSectionProps {
  settingsExpanded: boolean
  setSettingsExpanded: (expanded: boolean) => void
  setNewPuzzleMenuOpen: (open: boolean) => void
  colorTheme: ColorTheme
  onSetColorTheme: (theme: ColorTheme) => void
  gameActions: GameActions | undefined
  autoSaveEnabled: boolean
  handleAutoSaveToggle: () => void
}

function SettingsSection({
  settingsExpanded,
  setSettingsExpanded,
  setNewPuzzleMenuOpen,
  colorTheme,
  onSetColorTheme,
  gameActions,
  autoSaveEnabled,
  handleAutoSaveToggle,
}: SettingsSectionProps) {
  return (
    <div className="rounded-lg overflow-hidden">
      <button
        onClick={() => {
          setSettingsExpanded(!settingsExpanded)
          setNewPuzzleMenuOpen(false)
        }}
        className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
      >
        <span className="flex items-center gap-3">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </span>
        <svg className={`h-3 w-3 transition-transform ${settingsExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {settingsExpanded && (
        <div className="ml-4 py-1 space-y-1">
          {/* Color theme picker */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm text-foreground-muted">{COLOR_THEMES.find(t => t.key === colorTheme)?.label ?? colorTheme}</span>
            <div className="flex gap-1">
              {COLOR_THEMES.map((theme) => (
                <button
                  key={theme.key}
                  onClick={() => onSetColorTheme(theme.key)}
                  className={`w-4 h-4 rounded-full ${theme.color} transition-transform ${
                    colorTheme === theme.key 
                      ? 'ring-2 ring-offset-1 ring-foreground scale-110' 
                      : 'hover:scale-110'
                  }`}
                  title={theme.label}
                />
              ))}
            </div>
          </div>

          {/* Timer + Auto-save toggles (game only) */}
          {gameActions && (
            <div className="space-y-1">
              {/* Show Timer toggle */}
              <button
                onClick={gameActions.onToggleHideTimer}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-btn-hover rounded-lg"
              >
                <span className="flex items-center gap-3">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Show Timer
                </span>
                <div className={`w-9 h-5 rounded-full transition-colors ${!gameActions.hideTimerState ? 'bg-accent' : 'bg-board-border-light'}`}>
                  <div className={`w-5 h-5 rounded-full bg-background shadow transition-transform ${!gameActions.hideTimerState ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </button>
              
              {/* Auto-save Progress toggle */}
              <button
                onClick={handleAutoSaveToggle}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-btn-hover rounded-lg"
              >
                <span className="flex items-center gap-3">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Auto-Save Progress
                </span>
                <div className={`w-9 h-5 rounded-full transition-colors ${autoSaveEnabled ? 'bg-accent' : 'bg-board-border-light'}`}>
                  <div className={`w-5 h-5 rounded-full bg-background shadow transition-transform ${autoSaveEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT: Menu
// =============================================================================
export default function Menu({
  isOpen,
  onClose,
  mode: _mode,
  colorTheme,
  fontSize: _fontSize,
  onSetMode: _onSetMode,
  onSetColorTheme,
  onSetFontSize: _onSetFontSize,
  onReportBug,
  bugReportCopied = false,
  gameActions,
  homepageActions,
  showNavigation = false,
  onFeatureRequest,
}: MenuProps) {
  // Keep these in props for API compatibility but unused after removal from UI
  void _fontSize
  void _onSetFontSize
  void _mode
  void _onSetMode
  
  const navigate = useNavigate()
  const [newPuzzleMenuOpen, setNewPuzzleMenuOpen] = useState(false)
  const [settingsExpanded, setSettingsExpanded] = useState(!gameActions) // Collapsed on game page
  const [cacheCleared, setCacheCleared] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabledState] = useState(getAutoSaveEnabled)
  const [confirmNewPuzzle, setConfirmNewPuzzle] = useState<string | null>(null) // Difficulty to confirm

  // Close submenu when menu closes
  useEffect(() => {
    if (!isOpen) {
      setNewPuzzleMenuOpen(false)
      setConfirmNewPuzzle(null)
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

  // Handle starting a new puzzle - show confirmation if game in progress
  const handleNewPuzzle = (difficulty: string) => {
    if (gameActions?.hasUnsavedProgress) {
      setConfirmNewPuzzle(difficulty)
    } else {
      if (difficulty === 'custom') {
        navigate('/custom')
      } else {
        navigate(createGameRoute(difficulty))
      }
      onClose()
    }
  }

  // Confirm and navigate to new puzzle
  const confirmAndNavigate = () => {
    if (confirmNewPuzzle) {
      if (confirmNewPuzzle === 'custom') {
        navigate('/custom')
      } else {
        navigate(createGameRoute(confirmNewPuzzle))
      }
      onClose()
    }
  }

  const handleClearCache = async () => {
    try {
      await clearAllCaches()
      setCacheCleared(true)
      setTimeout(() => setCacheCleared(false), 3000)
      // Reload page to get fresh content
      window.location.reload()
    } catch (error) {
      console.error('Failed to clear caches:', error)
    }
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
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl border border-board-border-light bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-board-border-light">
            <span className="text-lg font-semibold text-foreground">Menu</span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-btn-hover"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-3 space-y-1">
            {/* Navigation Links (for non-game pages) */}
            {showNavigation && <NavigationSection onClose={onClose} />}

            {/* Game Actions (for game page) */}
            {gameActions && (
              <GameActionsSection
                gameActions={gameActions}
                onClose={onClose}
                newPuzzleMenuOpen={newPuzzleMenuOpen}
                setNewPuzzleMenuOpen={setNewPuzzleMenuOpen}
                setSettingsExpanded={setSettingsExpanded}
                handleNewPuzzle={handleNewPuzzle}
                handleSpeedChange={handleSpeedChange}
              />
            )}

            {/* Settings Section - Collapsible */}
            <SettingsSection
              settingsExpanded={settingsExpanded}
              setSettingsExpanded={setSettingsExpanded}
              setNewPuzzleMenuOpen={setNewPuzzleMenuOpen}
              colorTheme={colorTheme}
              onSetColorTheme={onSetColorTheme}
              gameActions={gameActions}
              autoSaveEnabled={autoSaveEnabled}
              handleAutoSaveToggle={handleAutoSaveToggle}
            />

            {/* Homepage mode toggle (homepage only) */}
            {homepageActions && (
              <div className="px-3 py-2">
                <div className="text-xs text-foreground-muted mb-2">Homepage Mode</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => homepageActions.onSetHomepageMode('daily')}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      homepageActions.homepageMode === 'daily'
                        ? 'bg-accent text-btn-active-text'
                        : 'bg-background-secondary text-foreground hover:bg-btn-hover'
                    }`}
                  >
                    Daily Puzzle
                  </button>
                  <button
                    onClick={() => homepageActions.onSetHomepageMode('game')}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      homepageActions.homepageMode === 'game'
                        ? 'bg-accent text-btn-active-text'
                        : 'bg-background-secondary text-foreground hover:bg-btn-hover'
                    }`}
                  >
                    Game
                  </button>
                </div>
              </div>
            )}

            <div className="my-1 border-t border-board-border-light" />

            {/* Learn Techniques (game page) */}
            {gameActions && (
              <button
                onClick={() => { gameActions.onTechniquesList(); onClose() }}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
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
                className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-btn-hover"
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
                <div className="my-1 border-t border-board-border-light" />
                <div className="px-3 py-1">
                  <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">Debug</span>
                </div>
                <button
                  onClick={handleClearCache}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground-muted rounded-lg hover:bg-btn-hover"
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
              onClick={handleClearCache}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground-muted rounded-lg hover:bg-btn-hover"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {cacheCleared ? 'App Cache Cleared!' : 'Clear App Cache'}
            </button>

            {/* Report Bug */}
            <button
              onClick={() => { onReportBug(); onClose() }}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground-muted rounded-lg hover:bg-btn-hover"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {bugReportCopied ? 'Copied!' : 'Report Bug'}
            </button>

            {/* GitHub */}
            <a
              href="https://github.com/ThoDHa/sudoku"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground-muted rounded-lg hover:bg-btn-hover"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              GitHub
            </a>

            {/* Version */}
            <div className="px-3 py-2 text-xs text-foreground-muted text-center border-t border-board-border-light mt-2">
              v{__COMMIT_HASH__}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Confirmation Modal for New Game */}
      {confirmNewPuzzle && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-[101]" 
            onClick={() => setConfirmNewPuzzle(null)}
          />
          <div className="fixed inset-0 z-[102] flex items-center justify-center p-4">
            <div 
              className="w-full max-w-xs rounded-xl border border-board-border-light bg-background shadow-2xl p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-foreground mb-2">Start New Game?</h3>
              <p className="text-sm text-foreground-muted mb-4">
                You have a game in progress. Starting a new puzzle will abandon your current progress.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmNewPuzzle(null)}
                  className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-board-border-light text-foreground hover:bg-btn-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAndNavigate}
                  className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-accent text-btn-active-text hover:opacity-90"
                >
                  Start New
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
