import { useState, useRef, memo } from 'react'
import { Link } from 'react-router-dom'
import DifficultyBadge from './DifficultyBadge'
import Menu from './Menu'
import { TimerDisplay } from './TimerDisplay'
import { SunIcon, MoonIcon, ComputerIcon } from './ui'
import { Difficulty } from '../lib/hooks'
import { ColorTheme, FontSize, ModePreference } from '../lib/ThemeContext'
import { AutoSolveSpeed, setAutoSolveSpeed } from '../lib/preferences'
import { useClickOutside } from '../hooks/useClickOutside'
import { MAX_HISTORY_BADGE_COUNT } from '../lib/constants'

// Small inline spinner for buttons
function ButtonSpinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

// Speed button options for auto-solve controls (module-level for reuse)
const SPEED_OPTIONS = [
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

// ============================================================================
// Subcomponent: AutoSolveControls
// ============================================================================
interface AutoSolveControlsProps {
  isFetchingSolution: boolean
  isPaused: boolean
  autoSolveSpeed: AutoSolveSpeed
  onTogglePause: () => void
  onStopAutoSolve: () => void
  onSpeedChange: (speed: AutoSolveSpeed) => void
  variant: 'desktop' | 'mobile'
}

function AutoSolveControls({
  isFetchingSolution,
  isPaused,
  autoSolveSpeed,
  onTogglePause,
  onStopAutoSolve,
  onSpeedChange,
  variant,
}: AutoSolveControlsProps) {
  if (variant === 'desktop') {
    if (isFetchingSolution) {
      return (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm text-foreground-muted">
          <ButtonSpinner className="h-4 w-4" />
          <span>Solving...</span>
        </div>
      )
    }
    return (
      <div className="hidden sm:flex items-center gap-1">
        <div className="flex items-center rounded-lg overflow-hidden border border-board-border-light">
          {SPEED_OPTIONS.map(({ speed, icon, label }) => (
            <button
              key={speed}
              onClick={() => onSpeedChange(speed)}
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
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          )}
        </button>
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
    )
  }

  // Mobile variant
  if (isFetchingSolution) {
    return (
      <div className="flex items-center justify-center gap-2 py-1 text-foreground-muted">
        <ButtonSpinner className="h-4 w-4" />
        <span className="text-sm">Solving...</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="flex items-center rounded-lg overflow-hidden border border-board-border-light">
        {SPEED_OPTIONS.map(({ speed, icon, label }) => (
          <button
            key={speed}
            onClick={() => onSpeedChange(speed)}
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
          <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Play</>
        ) : (
          <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause</>
        )}
      </button>
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
  )
}

// ============================================================================
// Subcomponent: HintButtons
// ============================================================================
interface HintButtonsProps {
  onTechniqueHint: () => void
  techniqueHintDisabled: boolean
  techniqueHintLoading: boolean
  onHint: () => void
  hintLoading: boolean
  hintDisabled: boolean
}

function HintButtons({ onTechniqueHint, techniqueHintDisabled, techniqueHintLoading, onHint, hintLoading, hintDisabled }: HintButtonsProps) {
  return (
    <>
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
        {techniqueHintLoading ? <ButtonSpinner className="h-4 w-4" /> : <span className="text-base">❓</span>}
        <span className="hidden sm:inline">Technique</span>
      </button>
      <button
        onClick={onHint}
        disabled={hintLoading || hintDisabled}
        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
          hintLoading || hintDisabled ? 'text-foreground-muted/50 cursor-not-allowed' : 'text-foreground-muted hover:text-accent hover:bg-btn-hover'
        }`}
        title={hintLoading ? "Loading..." : hintDisabled ? "Make a move to use again" : "Get a hint"}
      >
        {hintLoading ? <ButtonSpinner className="h-4 w-4" /> : <span className="text-base">💡</span>}
        <span className="hidden sm:inline">Hint</span>
      </button>
    </>
  )
}

// ============================================================================
// Subcomponent: ThemeModeDropdown
// ============================================================================
interface ThemeModeDropdownProps {
  mode: 'light' | 'dark'
  modePreference: ModePreference
  isOpen: boolean
  onToggle: () => void
  onSetModePreference: (mode: ModePreference) => void
  dropdownRef: React.RefObject<HTMLDivElement>
}

function ThemeModeDropdown({ mode, modePreference, isOpen, onToggle, onSetModePreference, dropdownRef }: ThemeModeDropdownProps) {
  const handleSelect = (pref: ModePreference) => { onSetModePreference(pref); onToggle() }
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="p-2 rounded text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
        title={`Theme: ${modePreference === 'system' ? `System (${mode})` : modePreference}`}
      >
        {mode === 'dark' ? <MoonIcon /> : <SunIcon />}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 rounded-lg bg-background-secondary border border-board-border-light shadow-lg overflow-hidden z-50">
          <button onClick={() => handleSelect('light')} className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${modePreference === 'light' ? 'bg-accent text-btn-active-text' : 'text-foreground hover:bg-btn-hover'}`}>
            <SunIcon className="h-4 w-4" />Light
          </button>
          <button onClick={() => handleSelect('dark')} className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${modePreference === 'dark' ? 'bg-accent text-btn-active-text' : 'text-foreground hover:bg-btn-hover'}`}>
            <MoonIcon className="h-4 w-4" />Dark
          </button>
          <button onClick={() => handleSelect('system')} className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${modePreference === 'system' ? 'bg-accent text-btn-active-text' : 'text-foreground hover:bg-btn-hover'}`}>
            <ComputerIcon className="h-4 w-4" />System
          </button>
        </div>
      )}
    </div>
  )
}

interface GameHeaderProps {
  difficulty: Difficulty
  seed?: string | undefined // Puzzle seed for mode detection (optional, may be undefined)
  // Timer state - hideTimer prop controls visibility
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
  hintDisabled: boolean
  onHistoryOpen: () => void
  onShowResult: () => void
  onShare: () => void
  onAutoFillNotes: () => void
  onCheckNotes: () => void
  onClearNotes: () => void
  onValidate: () => void
  onSolve: () => void
  onClearAll: () => void
  onTechniquesList: () => void
  onAbout: () => void
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

export default memo(function GameHeader({
  difficulty,
  seed,
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
  hintDisabled,
  onHistoryOpen,
  onShowResult,
  onShare,
  onAutoFillNotes,
  onCheckNotes,
  onClearNotes,
  onValidate,
  onSolve,
  onClearAll,
  onTechniquesList,
  onAbout,
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
  useClickOutside(modeDropdownRef, modeDropdownOpen, () => setModeDropdownOpen(false))

  const handleSpeedChange = (speed: AutoSolveSpeed) => {
    setAutoSolveSpeed(speed)
    onSetAutoSolveSpeed(speed)
  }

  return (
    <>
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-board-border-light">
      {/* Main header row */}
      <div className="mx-auto max-w-4xl px-2 sm:px-4 h-12 flex items-center justify-between gap-2">
        {/* Left: Logo + Difficulty */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <Link to="/" className="flex items-center gap-1 sm:gap-2 font-semibold text-foreground">
            <img src={mode === 'dark' ? `${import.meta.env.BASE_URL}sudoku-icon-dark.svg` : `${import.meta.env.BASE_URL}sudoku-icon.svg`} alt="Sudoku" className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="hidden sm:inline">Sudoku</span>
          </Link>
          <DifficultyBadge difficulty={difficulty} size="sm" />
        </div>

        {/* Center: Timer - uses TimerDisplay component to isolate re-renders */}
        <TimerDisplay hideTimer={hideTimer} />

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Desktop auto-solve controls */}
          {isAutoSolving && (
            <AutoSolveControls
              isFetchingSolution={isFetchingSolution}
              isPaused={isPaused}
              autoSolveSpeed={autoSolveSpeed}
              onTogglePause={onTogglePause}
              onStopAutoSolve={onStopAutoSolve}
              onSpeedChange={handleSpeedChange}
              variant="desktop"
            />
          )}

          {/* Hint buttons */}
          {!isComplete && !isAutoSolving && (
            <HintButtons
              onTechniqueHint={onTechniqueHint}
              techniqueHintDisabled={techniqueHintDisabled}
              techniqueHintLoading={techniqueHintLoading}
              onHint={onHint}
              hintLoading={hintLoading}
              hintDisabled={hintDisabled}
            />
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

          {/* Share button - shows result if complete, otherwise shares progress */}
          <button
            onClick={isComplete ? onShowResult : onShare}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
            title={isComplete ? "Share your result" : "Share puzzle with current progress"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span className="hidden sm:inline">{isComplete ? 'Result' : 'Share'}</span>
          </button>

          {/* Theme mode dropdown */}
          <ThemeModeDropdown
            mode={mode}
            modePreference={modePreference}
            isOpen={modeDropdownOpen}
            onToggle={() => setModeDropdownOpen(!modeDropdownOpen)}
            onSetModePreference={onSetModePreference}
            dropdownRef={modeDropdownRef}
          />

          {/* Menu button */}
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 rounded text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
            title="Menu"
            aria-label="Menu"
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
          <AutoSolveControls
            isFetchingSolution={isFetchingSolution}
            isPaused={isPaused}
            autoSolveSpeed={autoSolveSpeed}
            onTogglePause={onTogglePause}
            onStopAutoSolve={onStopAutoSolve}
            onSpeedChange={handleSpeedChange}
            variant="mobile"
          />
        </div>
      )}
    </header>

    {/* Menu modal - outside header to overlay full page */}
    <Menu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        currentSeed={seed}
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
          onAbout,
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
})
