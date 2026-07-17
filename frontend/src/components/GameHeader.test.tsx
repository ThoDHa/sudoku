import React from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import GameHeader from './GameHeader'
import { dispatchKeyDown } from '../test-utils'
import { type Difficulty } from '../lib/hooks'
import { type ColorTheme, type FontSize, type ModePreference } from '../lib/ThemeContext'
import { type AutoSolveSpeed } from '../lib/preferences'

// TimerDisplay pulls in timer/background-manager contexts that are irrelevant
// to the menu open-state contract under test. Stub it to keep the harness flat.
vi.mock('./TimerDisplay', () => ({
  TimerDisplay: () => null,
}))

type GameHeaderProps = React.ComponentProps<typeof GameHeader>

function defaultProps(overrides: Partial<GameHeaderProps> = {}): GameHeaderProps {
  return {
    difficulty: 'easy' as Difficulty,
    seed: undefined,
    hideTimer: false,
    isComplete: false,
    historyCount: 0,
    hasUnsavedProgress: false,
    isAutoSolving: false,
    isFetchingSolution: false,
    isPaused: false,
    autoSolveSpeed: 'normal' as AutoSolveSpeed,
    onTogglePause: vi.fn(),
    onStopAutoSolve: vi.fn(),
    onSetAutoSolveSpeed: vi.fn(),
    onTechniqueHint: vi.fn(),
    techniqueHintDisabled: false,
    techniqueHintLoading: false,
    onHint: vi.fn(),
    hintLoading: false,
    hintDisabled: false,
    onHistoryOpen: vi.fn(),
    onShowResult: vi.fn(),
    onSharePuzzle: vi.fn(),
    onShareState: vi.fn(),
    onAutoFillNotes: vi.fn(),
    onCheckNotes: vi.fn(),
    onClearNotes: vi.fn(),
    onValidate: vi.fn(),
    onSolve: vi.fn(),
    onClearAll: vi.fn(),
    onTechniquesList: vi.fn(),
    onAbout: vi.fn(),
    onCopyDebugInfo: vi.fn(),
    onFeatureRequest: vi.fn(),
    debugInfoCopied: false,
    mode: 'light',
    modePreference: 'system' as ModePreference,
    colorTheme: 'tokyonight' as ColorTheme,
    fontSize: 'medium' as FontSize,
    hideTimerState: false,
    onSetModePreference: vi.fn(),
    onSetMode: vi.fn(),
    onSetColorTheme: vi.fn(),
    onSetFontSize: vi.fn(),
    onToggleHideTimer: vi.fn(),
    menuOpen: false,
    onMenuOpenChange: vi.fn(),
    ...overrides,
  }
}

function renderGameHeader(props: Partial<GameHeaderProps> = {}) {
  return render(
    <MemoryRouter>
      <GameHeader {...defaultProps(props)} />
    </MemoryRouter>,
  )
}

describe('GameHeader menu open-state contract', () => {
  it('forwards menuOpen to Menu and calls onMenuOpenChange(false) on menu close', () => {
    const onMenuOpenChange = vi.fn()
    const { container } = renderGameHeader({ menuOpen: true, onMenuOpenChange })

    // menuOpen=true is forwarded to <Menu isOpen>; the menu backdrop renders.
    const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/50')
    expect(backdrop).not.toBeNull()

    // Trigger Menu's onClose (its document-level Escape listener).
    dispatchKeyDown({ key: 'Escape' })

    expect(onMenuOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not call onMenuOpenChange when the menu is closed', () => {
    const onMenuOpenChange = vi.fn()
    const { container } = renderGameHeader({ menuOpen: false, onMenuOpenChange })

    // menuOpen=false: no menu backdrop rendered.
    const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/50')
    expect(backdrop).toBeNull()

    dispatchKeyDown({ key: 'Escape' })

    expect(onMenuOpenChange).not.toHaveBeenCalled()
  })
})

describe('GameHeader icon-only button accessibility', () => {
  it('exposes an accessible name on the history, share, hint, and menu buttons', () => {
    const { getByRole } = renderGameHeader()

    // Icon-only (their visible labels are hidden below the sm breakpoint via
    // `hidden sm:inline`), so the accessible name must come from aria-label.
    expect(getByRole('button', { name: 'View move history' })).toBeInTheDocument()
    expect(
      getByRole('button', { name: 'Share the puzzle or your current game' }),
    ).toBeInTheDocument()
    expect(getByRole('button', { name: 'Get a hint' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Learn which technique to use' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Menu' })).toBeInTheDocument()
  })

  it('exposes an accessible name on the auto-solve speed, pause, and stop buttons', () => {
    // AutoSolveControls renders twice: a desktop variant (`hidden sm:flex`) and a
    // mobile variant (`sm:hidden`). The test environment does not load the
    // Tailwind CSS that hides one of them, so both appear in the accessibility
    // tree. Asserting two matches therefore verifies BOTH variants are labeled.
    const { getAllByRole } = renderGameHeader({ isAutoSolving: true })

    expect(getAllByRole('button', { name: 'Auto-solve speed 1x' })).toHaveLength(2)
    expect(getAllByRole('button', { name: 'Auto-solve speed Skip' })).toHaveLength(2)
    expect(getAllByRole('button', { name: 'Pause' })).toHaveLength(2)
    expect(getAllByRole('button', { name: 'Stop solving' })).toHaveLength(2)
  })
})
