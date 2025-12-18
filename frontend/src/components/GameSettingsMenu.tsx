import { useState } from 'react'
import { ColorTheme, FontSize } from '../lib/ThemeContext'
import { AutoSolveSpeed, setAutoSolveSpeed } from '../lib/preferences'

const fontSizes: { key: FontSize; label: string }[] = [
  { key: 'xs', label: 'A' },
  { key: 'small', label: 'A' },
  { key: 'medium', label: 'A' },
  { key: 'large', label: 'A' },
  { key: 'xl', label: 'A' },
]

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

interface GameSettingsMenuProps {
  isOpen: boolean
  onClose: () => void
  // Game state
  isComplete: boolean
  // Auto-solve state
  autoSolveSpeed: AutoSolveSpeed
  onSetAutoSolveSpeed: (speed: AutoSolveSpeed) => void
  // Actions
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

export default function GameSettingsMenu({
  isOpen,
  onClose,
  isComplete,
  autoSolveSpeed,
  onSetAutoSolveSpeed,
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
}: GameSettingsMenuProps) {
  const [newPuzzleMenuOpen, setNewPuzzleMenuOpen] = useState(false)

  const handleSpeedChange = (speed: AutoSolveSpeed) => {
    setAutoSolveSpeed(speed)
    onSetAutoSolveSpeed(speed)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-[var(--bg)] z-[100]">
      <div className="flex flex-col h-full">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-[var(--border-light)]">
          <span className="text-lg font-semibold text-[var(--text)]">Menu</span>
          <button
            onClick={onClose}
            className="p-2 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)]"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {/* Primary Actions */}
      <div className="px-1 py-1.5">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Actions</span>
      </div>
      <button
        onClick={() => { onAutoFillNotes(); onClose() }}
        className="flex w-full items-center gap-3 px-4 py-3 text-base font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Auto-fill Notes
      </button>
      <button
        onClick={() => { onCheckNotes(); onClose() }}
        className="flex w-full items-center gap-3 px-4 py-3 text-base font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        Check Notes
      </button>
      <button
        onClick={() => { onClearNotes(); onClose() }}
        className="flex w-full items-center gap-3 px-4 py-3 text-base font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        Clear Notes
      </button>
      <button
        onClick={() => { onValidate(); onClose() }}
        className="flex w-full items-center gap-3 px-4 py-3 text-base font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Check Progress
      </button>
      {/* Solve with inline speed icons */}
      <div className="flex w-full items-center px-4 py-3 rounded-xl bg-[var(--bg-secondary)]">
        <button
          onClick={() => { onSolve(); onClose() }}
          className="flex items-center gap-3 text-base font-medium text-[var(--text)] hover:text-[var(--accent)]"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Solve
        </button>
        <div className="ml-auto flex gap-1">
          {speedOptions.map(({ speed, icon, label }) => (
            <button
              key={speed}
              onClick={(e) => {
                e.stopPropagation()
                handleSpeedChange(speed)
                onClose()
                onSolve()
              }}
              title={`${label} - Click to start`}
              className={`p-2 rounded-lg ${
                autoSolveSpeed === speed
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
        onClick={() => { onClearAll(); onClose() }}
        className="flex w-full items-center gap-3 px-4 py-3 text-base font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
      >
        {isComplete ? (
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

      <div className="my-4 border-t border-[var(--border-light)]" />

      {/* New Puzzle submenu */}
      <div className="rounded-xl bg-[var(--bg-secondary)] overflow-hidden">
        <button
          onClick={() => setNewPuzzleMenuOpen(!newPuzzleMenuOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-base font-medium text-[var(--text)] hover:bg-[var(--btn-hover)]"
        >
          <span className="flex items-center gap-3">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Puzzle
          </span>
          <svg className={`h-5 w-5 transition-transform ${newPuzzleMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {newPuzzleMenuOpen && (
          <div className="border-t border-[var(--border-light)] py-2">
            {['easy', 'medium', 'hard', 'extreme', 'impossible'].map((d) => (
              <button
                key={d}
                onClick={() => { window.location.href = `/game/P${Date.now()}?d=${d}` }}
                className="block w-full px-6 py-2 text-left text-base capitalize text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)]"
              >
                {d}
              </button>
            ))}
            <div className="my-2 mx-4 border-t border-[var(--border-light)]" />
            <button
              onClick={() => { window.location.href = '/custom' }}
              className="block w-full px-6 py-2 text-left text-base text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--btn-hover)]"
            >
              Custom
            </button>
          </div>
        )}
      </div>

      <div className="my-4 border-t border-[var(--border-light)]" />

      {/* Settings Section */}
      <div className="px-1 py-1.5">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Settings</span>
      </div>
      
      {/* Theme color selector with light/dark toggle */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--bg-secondary)]">
        <button
          onClick={() => onSetMode(mode === 'light' ? 'dark' : 'light')}
          className="p-2 rounded-lg text-[var(--text)] hover:bg-[var(--btn-hover)] transition-colors"
          title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {mode === 'dark' ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
        <div className="flex gap-2">
          {(['blue', 'green', 'purple', 'orange', 'pink'] as ColorTheme[]).map((color) => (
            <button
              key={color}
              onClick={() => onSetColorTheme(color)}
              className={`w-8 h-8 rounded-full transition-transform ${
                color === 'blue' ? 'bg-blue-500' :
                color === 'green' ? 'bg-green-500' :
                color === 'purple' ? 'bg-purple-500' :
                color === 'orange' ? 'bg-orange-500' :
                'bg-pink-500'
              } ${
                colorTheme === color 
                  ? 'ring-2 ring-offset-1 ring-[var(--text)] scale-110' 
                  : 'hover:scale-110'
              }`}
              title={`${color} theme`}
            />
          ))}
        </div>
      </div>

      {/* Font size selector - just A's in different sizes */}
      <div className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl bg-[var(--bg-secondary)]">
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

      {/* Hide timer toggle */}
      <button
        onClick={onToggleHideTimer}
        className="flex w-full items-center justify-between px-4 py-3 text-base font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
      >
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {hideTimerState ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          <span>{hideTimerState ? 'Show Timer' : 'Hide Timer'}</span>
        </div>
        <div className={`w-10 h-5 rounded-full transition-colors ${hideTimerState ? 'bg-[var(--accent)]' : 'bg-[var(--border-light)]'}`}>
          <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${hideTimerState ? 'translate-x-5' : 'translate-x-0'}`} />
        </div>
      </button>

      <div className="my-4 border-t border-[var(--border-light)]" />

      {/* More Options */}
      <div className="px-1 py-1.5">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">More</span>
      </div>
      <button
        onClick={() => { onTechniquesList(); onClose() }}
        className="flex w-full items-center gap-3 px-4 py-3 text-base font-medium text-[var(--text)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Learn Techniques
      </button>
      <button
        onClick={() => { onReportBug(); onClose() }}
        className="flex w-full items-center gap-3 px-4 py-3 text-base font-medium text-[var(--text-muted)] rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--btn-hover)]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        {bugReportCopied ? 'Copied!' : 'Report Bug'}
      </button>
        </div>
      </div>
    </div>
  )
}
