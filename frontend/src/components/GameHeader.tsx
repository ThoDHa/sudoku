import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DifficultyBadge from './DifficultyBadge'
import Menu from './Menu'
import { Difficulty } from '../lib/hooks'
import { ColorTheme, FontSize, ModePreference } from '../lib/ThemeContext'
import { AutoSolveSpeed, setAutoSolveSpeed } from '../lib/preferences'

// Small inline spinner for buttons
function ButtonSpinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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

interface GameHeaderProps {
  difficulty: Difficulty
  // Timer state
  formatTime: () => string
  isPausedDueToVisibility: boolean
  hideTimer: boolean
  // Game state
  isComplete: boolean
  historyCount: number
  hasUnsavedProgress: boolean
  // Auto-solve state
  isAutoSolving: boolean
  isFetchingSolution: boolean
  isPaused: boolean
  autoSolveSpeed: AutoSolveSpeed
  onTogglePause: () => void
  onStopAutoSolve: () => void
  onSetAutoSolveSpeed: (speed: AutoSolveSpeed) => void
  // Actions
  onTechniqueHint: () => void
  techniqueHintDisabled: boolean
  techniqueHintLoading: boolean
  onHint: () => void
  hintLoading: boolean
  onHistoryOpen: () => void
  onShowResult: () => void
  onAutoFillNotes: () => void
  onCheckNotes: () => void
  onClearNotes: () => void
  onValidate: () => void
  onSolve: () => void
  onClearAll: () => void
  onTechniquesList: () => void
  onReportBug: () => void
  onFeatureRequest: () => void
  bugReportCopied: boolean
  // Theme settings
  mode: 'light' | 'dark'
  modePreference: ModePreference
  colorTheme: ColorTheme
  fontSize: FontSize
  hideTimerState: boolean
  onSetModePreference: (mode: ModePreference) => void
  onSetMode: (mode: 'light' | 'dark') => void // Deprecated, kept for compatibility
  onSetColorTheme: (theme: ColorTheme) => void
  onSetFontSize: (size: FontSize) => void
  onToggleHideTimer: () => void
}

export default function GameHeader({
  difficulty,
  formatTime,
  isPausedDueToVisibility,
  hideTimer,
  isComplete,
  historyCount,
  hasUnsavedProgress,
  isAutoSolving,
  isFetchingSolution,
  isPaused,
  autoSolveSpeed,
  onTogglePause,
  onStopAutoSolve,
  onSetAutoSolveSpeed,
  onTechniqueHint,
  techniqueHintDisabled,
  techniqueHintLoading,
  onHint,
  hintLoading,
  onHistoryOpen,
  onShowResult,
  onAutoFillNotes,
  onCheckNotes,
  onClearNotes,
  onValidate,
  onSolve,
  onClearAll,
  onTechniquesList,
  onReportBug,
  onFeatureRequest,
  bugReportCopied,
  mode,
  modePreference,
  colorTheme,
  fontSize,
  hideTimerState,
  onSetModePreference,
  onSetMode,
  onSetColorTheme,
  onSetFontSize,
  onToggleHideTimer,
}: GameHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false)
  const modeDropdownRef = useRef<HTMLDivElement>(null)

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

  const MAX_HISTORY_BADGE_COUNT = 99

  const handleSpeedChange = (speed: AutoSolveSpeed) => {
    setAutoSolveSpeed(speed)
    onSetAutoSolveSpeed(speed)
  }

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

  return (
    <>
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-board-border-light">
      {/* Main header row */}
      <div className="mx-auto max-w-4xl px-2 sm:px-4 h-16 flex items-center justify-between gap-2">
        {/* Left: Logo + Difficulty */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <Link to="/" className="flex items-center gap-1 sm:gap-2 font-semibold text-foreground">
            <img src={mode === 'dark' ? '/sudoku-icon-dark.svg' : '/sudoku-icon.svg'} alt="Sudoku" className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="hidden sm:inline">Sudoku</span>
          </Link>
          <DifficultyBadge difficulty={difficulty} size="sm" />
        </div>

        {/* Center: Timer (hidden when hideTimer is true) */}
        {!hideTimer && (
          <div className={`flex items-center gap-1 sm:gap-2 ${isPausedDueToVisibility ? 'text-accent' : 'text-foreground-muted'}`}>
            {isPausedDueToVisibility ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="font-mono text-sm">{formatTime()}</span>
            {isPausedDueToVisibility && (
              <span className="text-xs font-medium">PAUSED</span>
            )}
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
          {/* Loading indicator - shown while fetching solution */}
          {isAutoSolving && isFetchingSolution && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-foreground-muted">
              <ButtonSpinner className="h-4 w-4" />
              <span>Solving...</span>
            </div>
          )}

          {/* Speed controls + Stop button - shown when auto-solving and solution is ready */}
          {isAutoSolving && !isFetchingSolution && (
            <div className="hidden sm:flex items-center gap-1">
              {/* Speed controls */}
              <div className="flex items-center rounded-lg overflow-hidden border border-board-border-light">
                {speedOptions.map(({ speed, icon, label }) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    title={label}
                    className={`px-2 py-1.5 transition-colors ${
                      autoSolveSpeed === speed
                        ? 'bg-accent text-btn-active-text'
                        : 'bg-btn-bg text-foreground hover:bg-btn-hover'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              {/* Pause/Resume button */}
              <button
                onClick={onTogglePause}
                className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                  isPaused
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-btn-bg text-foreground hover:bg-btn-hover border border-board-border-light'
                }`}
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                  </svg>
                )}
              </button>
              {/* Stop button */}
              <button
                onClick={onStopAutoSolve}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm bg-red-500 text-white hover:bg-red-600 transition-colors"
                title="Stop solving"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Stop</span>
              </button>
            </div>
          )}

          {/* Technique hint button - shows technique modal without applying move */}
          {!isComplete && !isAutoSolving && (
            <button
              onClick={onTechniqueHint}
              disabled={techniqueHintDisabled || techniqueHintLoading}
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                techniqueHintDisabled || techniqueHintLoading
                  ? 'text-foreground-muted/50 cursor-not-allowed' 
                  : 'text-foreground-muted hover:text-accent hover:bg-btn-hover'
              }`}
              title={techniqueHintLoading ? "Loading..." : techniqueHintDisabled ? "Make a move to use again" : "Learn which technique to use"}
            >
              {techniqueHintLoading ? (
                <ButtonSpinner className="h-4 w-4" />
              ) : (
                <span className="text-base">❓</span>
              )}
              <span className="hidden sm:inline">Technique</span>
            </button>
          )}

          {/* Hint button */}
          {!isComplete && !isAutoSolving && (
            <button
              onClick={onHint}
              disabled={hintLoading}
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                hintLoading
                  ? 'text-foreground-muted/50 cursor-not-allowed'
                  : 'text-foreground-muted hover:text-accent hover:bg-btn-hover'
              }`}
              title={hintLoading ? "Loading..." : "Get a hint"}
            >
              {hintLoading ? (
                <ButtonSpinner className="h-4 w-4" />
              ) : (
                <span className="text-base">💡</span>
              )}
              <span className="hidden sm:inline">Hint</span>
            </button>
          )}

          {/* History button */}
          <button
            onClick={onHistoryOpen}
            className="relative flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
            title="View move history"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">History</span>
            {historyCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-btn-active-text">
                {historyCount > MAX_HISTORY_BADGE_COUNT ? `${MAX_HISTORY_BADGE_COUNT}+` : historyCount}
              </span>
            )}
          </button>

          {/* Share button - shown when puzzle is complete */}
          {isComplete && (
            <button
              onClick={onShowResult}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-btn-active-text transition-opacity hover:opacity-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          )}

          {/* Theme mode dropdown */}
          <div className="relative" ref={modeDropdownRef}>
            <button
              onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
              className="p-2 rounded text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
              title={`Theme: ${modePreference}`}
            >
              {modePreference === 'system' ? <ComputerIcon /> : mode === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            {modeDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-32 rounded-lg bg-background-secondary border border-board-border-light shadow-lg overflow-hidden z-50">
                <button
                  onClick={() => { onSetModePreference('light'); setModeDropdownOpen(false) }}
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
                  onClick={() => { onSetModePreference('dark'); setModeDropdownOpen(false) }}
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
                  onClick={() => { onSetModePreference('system'); setModeDropdownOpen(false) }}
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
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile auto-solve controls - second row */}
      {isAutoSolving && (
        <div className="sm:hidden border-t border-board-border-light px-2 py-2">
          {isFetchingSolution ? (
            <div className="flex items-center justify-center gap-2 py-1 text-foreground-muted">
              <ButtonSpinner className="h-4 w-4" />
              <span className="text-sm">Solving...</span>
            </div>
          ) : (
          <div className="flex items-center justify-center gap-2">
            {/* Speed controls */}
            <div className="flex items-center rounded-lg overflow-hidden border border-board-border-light">
              {speedOptions.map(({ speed, icon, label }) => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  title={label}
                  className={`px-3 py-2 transition-colors ${
                    autoSolveSpeed === speed
                      ? 'bg-accent text-btn-active-text'
                      : 'bg-btn-bg text-foreground hover:bg-btn-hover'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            {/* Pause/Resume button */}
            <button
              onClick={onTogglePause}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isPaused
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-btn-bg text-foreground hover:bg-btn-hover border border-board-border-light'
              }`}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Play
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                  </svg>
                  Pause
                </>
              )}
            </button>
            {/* Stop button */}
            <button
              onClick={onStopAutoSolve}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
              title="Stop solving"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Stop
            </button>
          </div>
          )}
        </div>
      )}
    </header>

    {/* Menu modal - outside header to overlay full page */}
    <Menu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        mode={mode}
        colorTheme={colorTheme}
        fontSize={fontSize}
        onSetMode={onSetMode}
        onSetColorTheme={onSetColorTheme}
        onSetFontSize={onSetFontSize}
        onReportBug={onReportBug}
        onFeatureRequest={onFeatureRequest}
        bugReportCopied={bugReportCopied}
        gameActions={{
          onAutoFillNotes,
          onCheckNotes,
          onClearNotes,
          onValidate,
          onSolve,
          onClearAll,
          onTechniquesList,
          isComplete,
          autoSolveSpeed,
          onSetAutoSolveSpeed,
          hideTimerState,
          onToggleHideTimer,
          hasUnsavedProgress,
        }}
      />
    </>
  )
}
