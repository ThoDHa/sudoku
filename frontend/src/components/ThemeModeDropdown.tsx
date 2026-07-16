import type { RefObject } from 'react'
import { SunIcon, MoonIcon, ComputerIcon } from './ui'
import type { ModePreference } from '../lib/ThemeContext'

const ACTIVE = 'bg-accent text-btn-active-text'
const INACTIVE = 'text-foreground hover:bg-btn-hover'

const MODE_OPTIONS: { pref: ModePreference; label: string; Icon: typeof SunIcon }[] = [
  { pref: 'light', label: 'Light', Icon: SunIcon },
  { pref: 'dark', label: 'Dark', Icon: MoonIcon },
  { pref: 'system', label: 'System', Icon: ComputerIcon },
]

interface ThemeModeDropdownProps {
  mode: 'light' | 'dark'
  modePreference: ModePreference
  isOpen: boolean
  onToggle: () => void
  onSetModePreference: (mode: ModePreference) => void
  dropdownRef: RefObject<HTMLDivElement | null>
}

export default function ThemeModeDropdown({
  mode,
  modePreference,
  isOpen,
  onToggle,
  onSetModePreference,
  dropdownRef,
}: ThemeModeDropdownProps) {
  const handleSelect = (pref: ModePreference) => {
    onSetModePreference(pref)
    onToggle()
  }
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className="p-2 rounded text-foreground-muted hover:text-foreground hover:bg-btn-hover transition-colors"
        title={`Theme: ${modePreference === 'system' ? `System (${mode})` : modePreference}`}
        aria-label={`Theme: ${modePreference === 'system' ? `System (${mode})` : modePreference}`}
      >
        {mode === 'dark' ? <MoonIcon /> : <SunIcon />}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 rounded-lg bg-background-secondary border border-board-border-light shadow-lg overflow-hidden z-50">
          {MODE_OPTIONS.map(({ pref, label, Icon }) => (
            <button
              key={pref}
              onClick={() => handleSelect(pref)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                modePreference === pref ? ACTIVE : INACTIVE
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
