import { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react'
import { THEMES, themeToCssVars, getValidTheme, type ColorTheme } from './themes'

// Re-export types from themes.ts for backwards compatibility
export type { ColorTheme } from './themes'
export type ModePreference = 'light' | 'dark' | 'system'
export type Mode = 'light' | 'dark' // The effective/resolved mode
export type FontSize = 'xs' | 'small' | 'medium' | 'large' | 'xl'

interface ThemeContextType {
  colorTheme: ColorTheme
  mode: Mode // The effective mode (always light or dark)
  modePreference: ModePreference // User's preference (light, dark, or system)
  fontSize: FontSize
  setColorTheme: (theme: ColorTheme) => void
  setModePreference: (mode: ModePreference) => void
  setMode: (mode: Mode) => void // Deprecated, kept for compatibility
  setFontSize: (size: FontSize) => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// Font size CSS variable mappings
const FONT_SIZE_VARS: Record<FontSize, Record<string, string>> = {
  xs: {
    '--cell-font-size': '0.875rem',
    '--cell-font-size-sm': '1rem',
    '--cell-font-size-md': '1.125rem',
    '--candidate-font-size': '6px',
    '--candidate-font-size-sm': '7px',
    '--candidate-font-size-md': '8px',
    '--control-btn-size': '2.25rem',
    '--control-font-size': '0.875rem',
  },
  small: {
    '--cell-font-size': '1rem',
    '--cell-font-size-sm': '1.125rem',
    '--cell-font-size-md': '1.25rem',
    '--candidate-font-size': '7px',
    '--candidate-font-size-sm': '8px',
    '--candidate-font-size-md': '10px',
    '--control-btn-size': '2.5rem',
    '--control-font-size': '1rem',
  },
  medium: {
    '--cell-font-size': '1.125rem',
    '--cell-font-size-sm': '1.375rem',
    '--cell-font-size-md': '1.625rem',
    '--candidate-font-size': '8px',
    '--candidate-font-size-sm': '9px',
    '--candidate-font-size-md': '11px',
    '--control-btn-size': '3rem',
    '--control-font-size': '1.125rem',
  },
  large: {
    '--cell-font-size': '1.375rem',
    '--cell-font-size-sm': '1.625rem',
    '--cell-font-size-md': '2rem',
    '--candidate-font-size': '9px',
    '--candidate-font-size-sm': '11px',
    '--candidate-font-size-md': '13px',
    '--control-btn-size': '3.5rem',
    '--control-font-size': '1.375rem',
  },
  xl: {
    '--cell-font-size': '1.625rem',
    '--cell-font-size-sm': '1.875rem',
    '--cell-font-size-md': '2.25rem',
    '--candidate-font-size': '10px',
    '--candidate-font-size-sm': '12px',
    '--candidate-font-size-md': '14px',
    '--control-btn-size': '4rem',
    '--control-font-size': '1.5rem',
  },
}

// Helper to get system preference
function getSystemMode(): Mode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem('colorTheme')
    return getValidTheme(saved)
  })

  // Migration: convert old 'mode' to new 'modePreference'
  // Old values were 'light' or 'dark', new values include 'system'
  const [modePreference, setModePreference] = useState<ModePreference>(() => {
    const saved = localStorage.getItem('modePreference')
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      return saved as ModePreference
    }
    // Migrate from old 'mode' key if it exists
    const oldMode = localStorage.getItem('mode')
    if (oldMode && (oldMode === 'light' || oldMode === 'dark')) {
      return oldMode as ModePreference
    }
    // Default to system
    return 'system'
  })

  // Track system preference for 'system' mode
  const [systemMode, setSystemMode] = useState<Mode>(getSystemMode)

  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const saved = localStorage.getItem('fontSize')
    return (saved as FontSize) || 'xl'
  })

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setSystemMode(e.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  // Compute effective mode from preference
  const mode: Mode = modePreference === 'system' ? systemMode : modePreference

  useEffect(() => {
    localStorage.setItem('colorTheme', colorTheme)
    localStorage.setItem('modePreference', modePreference)
    localStorage.setItem('fontSize', fontSize)
    // Clean up old key
    localStorage.removeItem('mode')

    // Get theme colors from centralized themes.ts and convert to CSS vars
    const themeColors = THEMES[colorTheme][mode]
    const cssVars = themeToCssVars(themeColors)
    const fontSizeVars = FONT_SIZE_VARS[fontSize]
    const root = document.documentElement

    // Apply color theme
    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })

    // Apply font size variables
    Object.entries(fontSizeVars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })

    // Set font size class for additional CSS rules
    root.classList.remove('font-xs', 'font-small', 'font-medium', 'font-large', 'font-xl')
    root.classList.add(`font-${fontSize}`)

    // Also set class for tailwind dark mode utilities if needed
    if (mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [colorTheme, mode, modePreference, fontSize])

  // Toggle cycles through: current -> opposite -> system (if different from current)
  const toggleMode = () => {
    setModePreference((prev) => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }

  // Compatibility: setMode now sets modePreference directly
  const setMode = (newMode: Mode) => {
    setModePreference(newMode)
  }

  const contextValue = useMemo(
    () => ({
      colorTheme,
      mode,
      modePreference,
      fontSize,
      setColorTheme,
      setMode,
      setModePreference,
      setFontSize,
      toggleMode,
    }),
    [colorTheme, mode, modePreference, fontSize]
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook is co-located with context provider for better organization
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
