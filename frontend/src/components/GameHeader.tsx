import { useRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DifficultyBadge from './DifficultyBadge'
import GameSettingsMenu from './GameSettingsMenu'
import { Difficulty } from '../lib/hooks'
import { ColorTheme, FontSize } from '../lib/ThemeContext'
import { AutoSolveSpeed, setAutoSolveSpeed } from '../lib/preferences'

interface GameHeaderProps {
  difficulty: Difficulty
  // Timer state
  formatTime: () => string
  isPausedDueToVisibility: boolean
  hideTimer: boolean
  // Game state
  isComplete: boolean
  historyCount: number
  // Auto-solve state
  isAutoSolving: boolean
  isPaused: boolean
  autoSolveSpeed: AutoSolveSpeed
  onTogglePause: () => void
  onStopAutoSolve: () => void
  onSetAutoSolveSpeed: (speed: AutoSolveSpeed) => void
  // Actions
  onHint: () => void
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
  bugReportCopied: boolean
  // Theme settings
  mode: 'light' | 'dark'
  colorTheme: ColorTheme
  fontSize: FontSize
  hideTimerState: boolean
  onSetMode: (mode: 'light' | 'dark') => void
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
  isAutoSolving,
  isPaused,
  autoSolveSpeed,
  onTogglePause,
  onStopAutoSolve,
  onSetAutoSolveSpeed,
  onHint,
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
  bugReportCopied,
  mode,
  colorTheme,
  fontSize,
  hideTimerState,
  onSetMode,
  onSetColorTheme,
  onSetFontSize,
  onToggleHideTimer,
}: GameHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const MAX_HISTORY_BADGE_COUNT = 99

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    <header className="sticky top-0 z-40 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border-light)]">
      <div className="mx-auto max-w-4xl px-4 h-14 flex items-center justify-between">
        {/* Left: Logo + Difficulty */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-[var(--text)]">
            <span className="text-xl">🧩</span>
            <span className="hidden sm:inline">Sudoku</span>
          </Link>
          <DifficultyBadge difficulty={difficulty} size="sm" />
        </div>

        {/* Center: Timer (hidden when hideTimer is true) */}
        {!hideTimer && (
          <div className={`flex items-center gap-2 ${isPausedDueToVisibility ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
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
        <div className="flex items-center gap-1">
          {/* Speed controls + Stop button - shown when auto-solving */}
          {isAutoSolving && (
            <div className="flex items-center gap-1">
              {/* Speed controls */}
              <div className="flex items-center rounded-lg overflow-hidden border border-[var(--border-light)]">
                {speedOptions.map(({ speed, icon, label }) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    title={label}
                    className={`px-2 py-1.5 transition-colors ${
                      autoSolveSpeed === speed
                        ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                        : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
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
                    : 'bg-[var(--btn-bg)] text-[var(--text)] hover:bg-[var(--btn-hover)] border border-[var(--border-light)]'
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
                <span className="hidden sm:inline">Stop</span>
              </button>
            </div>
          )}

          {/* Hint button */}
          {!isComplete && !isAutoSolving && (
            <button
              onClick={onHint}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--btn-hover)] transition-colors"
              title="Get a hint"
            >
              <span className="text-base">💡</span>
              <span className="hidden sm:inline">Hint</span>
            </button>
          )}

          {/* History button */}
          <button
            onClick={onHistoryOpen}
            className="relative flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
            title="View move history"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">History</span>
            {historyCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-[var(--btn-active-text)]">
                {historyCount > MAX_HISTORY_BADGE_COUNT ? `${MAX_HISTORY_BADGE_COUNT}+` : historyCount}
              </span>
            )}
          </button>

          {/* Share button - shown when puzzle is complete */}
          {isComplete && (
            <button
              onClick={onShowResult}
              className="flex items-center gap-1 rounded-full bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--btn-active-text)] transition-opacity hover:opacity-90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          )}

          {/* Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
              title="Menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <GameSettingsMenu
              isOpen={menuOpen}
              onClose={() => setMenuOpen(false)}
              isComplete={isComplete}
              autoSolveSpeed={autoSolveSpeed}
              onSetAutoSolveSpeed={onSetAutoSolveSpeed}
              onAutoFillNotes={onAutoFillNotes}
              onCheckNotes={onCheckNotes}
              onClearNotes={onClearNotes}
              onValidate={onValidate}
              onSolve={onSolve}
              onClearAll={onClearAll}
              onTechniquesList={onTechniquesList}
              onReportBug={onReportBug}
              bugReportCopied={bugReportCopied}
              mode={mode}
              colorTheme={colorTheme}
              fontSize={fontSize}
              hideTimerState={hideTimerState}
              onSetMode={onSetMode}
              onSetColorTheme={onSetColorTheme}
              onSetFontSize={onSetFontSize}
              onToggleHideTimer={onToggleHideTimer}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
