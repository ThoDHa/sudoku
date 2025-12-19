import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type ColorTheme = 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'teal' | 'red' | 'indigo'
export type Mode = 'light' | 'dark'
export type FontSize = 'xs' | 'small' | 'medium' | 'large' | 'xl'

interface ThemeContextType {
  colorTheme: ColorTheme
  mode: Mode
  fontSize: FontSize
  setColorTheme: (theme: ColorTheme) => void
  setMode: (mode: Mode) => void
  setFontSize: (size: FontSize) => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const COLOR_THEMES: Record<ColorTheme, { light: Record<string, string>; dark: Record<string, string> }> = {
  blue: {
    light: {
      '--bg': '#eff6ff',
      '--bg-secondary': '#dbeafe',
      '--text': '#1e3a5f',
      '--text-muted': '#4a6fa5',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#dbeafe',
      '--cell-selected': '#93c5fd',
      '--cell-peer': '#bfdbfe',
      '--cell-primary': '#60a5fa',
      '--cell-secondary': '#93c5fd',
      '--border-strong': '#1e3a5f',
      '--border-light': '#93c5fd',
      '--text-given': '#1e3a5f',
      '--text-entered': '#2563eb',
      '--text-candidate': '#3b82f6',
      '--btn-bg': '#dbeafe',
      '--btn-hover': '#bfdbfe',
      '--btn-active': '#2563eb',
      '--btn-active-text': '#ffffff',
      '--accent': '#2563eb',
      '--accent-light': '#dbeafe',
    },
    dark: {
      '--bg': '#0f1729',
      '--bg-secondary': '#172140',
      '--text': '#e2e8f0',
      '--text-muted': '#94a3b8',
      '--board-bg': '#1a2850',
      '--cell-bg': '#1a2850',
      '--cell-hover': '#243565',
      '--cell-selected': '#3b5998',
      '--cell-peer': '#1e3060',
      '--cell-primary': '#3b82f6',
      '--cell-secondary': '#60a5fa',
      '--border-strong': '#e2e8f0',
      '--border-light': '#3b5998',
      '--text-given': '#e2e8f0',
      '--text-entered': '#93c5fd',
      '--text-candidate': '#60a5fa',
      '--btn-bg': '#1e3570',
      '--btn-hover': '#2a4585',
      '--btn-active': '#5b8bd4',
      '--btn-active-text': '#ffffff',
      '--accent': '#60a5fa',
      '--accent-light': '#1e3570',
    },
  },
  green: {
    light: {
      '--bg': '#f0fdf4',
      '--bg-secondary': '#dcfce7',
      '--text': '#14532d',
      '--text-muted': '#166534',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#dcfce7',
      '--cell-selected': '#86efac',
      '--cell-peer': '#d1fae5',
      '--cell-primary': '#4ade80',
      '--cell-secondary': '#86efac',
      '--border-strong': '#14532d',
      '--border-light': '#86efac',
      '--text-given': '#14532d',
      '--text-entered': '#16a34a',
      '--text-candidate': '#22c55e',
      '--btn-bg': '#dcfce7',
      '--btn-hover': '#bbf7d0',
      '--btn-active': '#16a34a',
      '--btn-active-text': '#ffffff',
      '--accent': '#16a34a',
      '--accent-light': '#dcfce7',
    },
    dark: {
      '--bg': '#0a1f1a',
      '--bg-secondary': '#0f2e24',
      '--text': '#d1fae5',
      '--text-muted': '#86efac',
      '--board-bg': '#134035',
      '--cell-bg': '#134035',
      '--cell-hover': '#1a5545',
      '--cell-selected': '#2d7a5a',
      '--cell-peer': '#164538',
      '--cell-primary': '#22c55e',
      '--cell-secondary': '#4ade80',
      '--border-strong': '#d1fae5',
      '--border-light': '#2d7a5a',
      '--text-given': '#d1fae5',
      '--text-entered': '#86efac',
      '--text-candidate': '#4ade80',
      '--btn-bg': '#1a5545',
      '--btn-hover': '#248060',
      '--btn-active': '#4ade80',
      '--btn-active-text': '#0a1f1a',
      '--accent': '#4ade80',
      '--accent-light': '#1a5545',
    },
  },
  purple: {
    light: {
      '--bg': '#faf5ff',
      '--bg-secondary': '#f3e8ff',
      '--text': '#581c87',
      '--text-muted': '#7c3aed',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#f3e8ff',
      '--cell-selected': '#d8b4fe',
      '--cell-peer': '#ede9fe',
      '--cell-primary': '#c084fc',
      '--cell-secondary': '#d8b4fe',
      '--border-strong': '#581c87',
      '--border-light': '#d8b4fe',
      '--text-given': '#581c87',
      '--text-entered': '#9333ea',
      '--text-candidate': '#a855f7',
      '--btn-bg': '#f3e8ff',
      '--btn-hover': '#e9d5ff',
      '--btn-active': '#9333ea',
      '--btn-active-text': '#ffffff',
      '--accent': '#9333ea',
      '--accent-light': '#f3e8ff',
    },
    dark: {
      '--bg': '#150f24',
      '--bg-secondary': '#1f1835',
      '--text': '#ede9fe',
      '--text-muted': '#c4b5fd',
      '--board-bg': '#2a2050',
      '--cell-bg': '#2a2050',
      '--cell-hover': '#3a2d68',
      '--cell-selected': '#5a4590',
      '--cell-peer': '#302458',
      '--cell-primary': '#8b5cf6',
      '--cell-secondary': '#a78bfa',
      '--border-strong': '#ede9fe',
      '--border-light': '#6d5aae',
      '--text-given': '#ede9fe',
      '--text-entered': '#c4b5fd',
      '--text-candidate': '#a78bfa',
      '--btn-bg': '#3a2d68',
      '--btn-hover': '#4a3d80',
      '--btn-active': '#a78bfa',
      '--btn-active-text': '#150f24',
      '--accent': '#a78bfa',
      '--accent-light': '#3a2d68',
    },
  },
  orange: {
    light: {
      '--bg': '#fff7ed',
      '--bg-secondary': '#ffedd5',
      '--text': '#7c2d12',
      '--text-muted': '#c2410c',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#ffedd5',
      '--cell-selected': '#fed7aa',
      '--cell-peer': '#fef3c7',
      '--cell-primary': '#fb923c',
      '--cell-secondary': '#fdba74',
      '--border-strong': '#7c2d12',
      '--border-light': '#fdba74',
      '--text-given': '#7c2d12',
      '--text-entered': '#ea580c',
      '--text-candidate': '#f97316',
      '--btn-bg': '#ffedd5',
      '--btn-hover': '#fed7aa',
      '--btn-active': '#ea580c',
      '--btn-active-text': '#ffffff',
      '--accent': '#ea580c',
      '--accent-light': '#ffedd5',
    },
    dark: {
      '--bg': '#1a1208',
      '--bg-secondary': '#2a1e10',
      '--text': '#fef3c7',
      '--text-muted': '#fcd34d',
      '--board-bg': '#3d2a15',
      '--cell-bg': '#3d2a15',
      '--cell-hover': '#50381e',
      '--cell-selected': '#7a5530',
      '--cell-peer': '#45301a',
      '--cell-primary': '#f59e0b',
      '--cell-secondary': '#fbbf24',
      '--border-strong': '#fef3c7',
      '--border-light': '#b57020',
      '--text-given': '#fef3c7',
      '--text-entered': '#fcd34d',
      '--text-candidate': '#fbbf24',
      '--btn-bg': '#50381e',
      '--btn-hover': '#654525',
      '--btn-active': '#fb923c',
      '--btn-active-text': '#1a1208',
      '--accent': '#fbbf24',
      '--accent-light': '#50381e',
    },
  },
  pink: {
    light: {
      '--bg': '#fdf2f8',
      '--bg-secondary': '#fce7f3',
      '--text': '#831843',
      '--text-muted': '#be185d',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#fce7f3',
      '--cell-selected': '#fbcfe8',
      '--cell-peer': '#fce7f3',
      '--cell-primary': '#f472b6',
      '--cell-secondary': '#f9a8d4',
      '--border-strong': '#831843',
      '--border-light': '#f9a8d4',
      '--text-given': '#831843',
      '--text-entered': '#db2777',
      '--text-candidate': '#ec4899',
      '--btn-bg': '#fce7f3',
      '--btn-hover': '#fbcfe8',
      '--btn-active': '#db2777',
      '--btn-active-text': '#ffffff',
      '--accent': '#db2777',
      '--accent-light': '#fce7f3',
    },
    dark: {
      '--bg': '#1f0f18',
      '--bg-secondary': '#2d1525',
      '--text': '#fce7f3',
      '--text-muted': '#f9a8d4',
      '--board-bg': '#401830',
      '--cell-bg': '#401830',
      '--cell-hover': '#552040',
      '--cell-selected': '#803060',
      '--cell-peer': '#481a35',
      '--cell-primary': '#ec4899',
      '--cell-secondary': '#f472b6',
      '--border-strong': '#fce7f3',
      '--border-light': '#a04070',
      '--text-given': '#fce7f3',
      '--text-entered': '#f9a8d4',
      '--text-candidate': '#f472b6',
      '--btn-bg': '#552040',
      '--btn-hover': '#6a2850',
      '--btn-active': '#f472b6',
      '--btn-active-text': '#1f0f18',
      '--accent': '#f472b6',
      '--accent-light': '#552040',
    },
  },
  teal: {
    light: {
      '--bg': '#f0fdfa',
      '--bg-secondary': '#ccfbf1',
      '--text': '#134e4a',
      '--text-muted': '#0f766e',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#ccfbf1',
      '--cell-selected': '#5eead4',
      '--cell-peer': '#99f6e4',
      '--cell-primary': '#2dd4bf',
      '--cell-secondary': '#5eead4',
      '--border-strong': '#134e4a',
      '--border-light': '#5eead4',
      '--text-given': '#134e4a',
      '--text-entered': '#0d9488',
      '--text-candidate': '#14b8a6',
      '--btn-bg': '#ccfbf1',
      '--btn-hover': '#99f6e4',
      '--btn-active': '#0d9488',
      '--btn-active-text': '#ffffff',
      '--accent': '#0d9488',
      '--accent-light': '#ccfbf1',
    },
    dark: {
      '--bg': '#0f1f1f',
      '--bg-secondary': '#152e2e',
      '--text': '#ccfbf1',
      '--text-muted': '#5eead4',
      '--board-bg': '#1a3d3d',
      '--cell-bg': '#1a3d3d',
      '--cell-hover': '#245050',
      '--cell-selected': '#357575',
      '--cell-peer': '#1f4545',
      '--cell-primary': '#14b8a6',
      '--cell-secondary': '#2dd4bf',
      '--border-strong': '#ccfbf1',
      '--border-light': '#357575',
      '--text-given': '#ccfbf1',
      '--text-entered': '#5eead4',
      '--text-candidate': '#2dd4bf',
      '--btn-bg': '#245050',
      '--btn-hover': '#2e6060',
      '--btn-active': '#2dd4bf',
      '--btn-active-text': '#0f1f1f',
      '--accent': '#2dd4bf',
      '--accent-light': '#245050',
    },
  },
  red: {
    light: {
      '--bg': '#fef2f2',
      '--bg-secondary': '#fecaca',
      '--text': '#7f1d1d',
      '--text-muted': '#b91c1c',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#fecaca',
      '--cell-selected': '#fca5a5',
      '--cell-peer': '#fee2e2',
      '--cell-primary': '#f87171',
      '--cell-secondary': '#fca5a5',
      '--border-strong': '#7f1d1d',
      '--border-light': '#fca5a5',
      '--text-given': '#7f1d1d',
      '--text-entered': '#dc2626',
      '--text-candidate': '#ef4444',
      '--btn-bg': '#fecaca',
      '--btn-hover': '#fca5a5',
      '--btn-active': '#dc2626',
      '--btn-active-text': '#ffffff',
      '--accent': '#dc2626',
      '--accent-light': '#fecaca',
    },
    dark: {
      '--bg': '#1f0f0f',
      '--bg-secondary': '#2e1515',
      '--text': '#fecaca',
      '--text-muted': '#fca5a5',
      '--board-bg': '#3d1a1a',
      '--cell-bg': '#3d1a1a',
      '--cell-hover': '#502424',
      '--cell-selected': '#753535',
      '--cell-peer': '#451f1f',
      '--cell-primary': '#ef4444',
      '--cell-secondary': '#f87171',
      '--border-strong': '#fecaca',
      '--border-light': '#753535',
      '--text-given': '#fecaca',
      '--text-entered': '#fca5a5',
      '--text-candidate': '#f87171',
      '--btn-bg': '#502424',
      '--btn-hover': '#602e2e',
      '--btn-active': '#f87171',
      '--btn-active-text': '#1f0f0f',
      '--accent': '#f87171',
      '--accent-light': '#502424',
    },
  },
  indigo: {
    light: {
      '--bg': '#eef2ff',
      '--bg-secondary': '#e0e7ff',
      '--text': '#312e81',
      '--text-muted': '#4338ca',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#e0e7ff',
      '--cell-selected': '#a5b4fc',
      '--cell-peer': '#c7d2fe',
      '--cell-primary': '#818cf8',
      '--cell-secondary': '#a5b4fc',
      '--border-strong': '#312e81',
      '--border-light': '#a5b4fc',
      '--text-given': '#312e81',
      '--text-entered': '#4f46e5',
      '--text-candidate': '#6366f1',
      '--btn-bg': '#e0e7ff',
      '--btn-hover': '#c7d2fe',
      '--btn-active': '#4f46e5',
      '--btn-active-text': '#ffffff',
      '--accent': '#4f46e5',
      '--accent-light': '#e0e7ff',
    },
    dark: {
      '--bg': '#0f0f1f',
      '--bg-secondary': '#15152e',
      '--text': '#e0e7ff',
      '--text-muted': '#a5b4fc',
      '--board-bg': '#1a1a3d',
      '--cell-bg': '#1a1a3d',
      '--cell-hover': '#242450',
      '--cell-selected': '#353575',
      '--cell-peer': '#1f1f45',
      '--cell-primary': '#6366f1',
      '--cell-secondary': '#818cf8',
      '--border-strong': '#e0e7ff',
      '--border-light': '#353575',
      '--text-given': '#e0e7ff',
      '--text-entered': '#a5b4fc',
      '--text-candidate': '#818cf8',
      '--btn-bg': '#242450',
      '--btn-hover': '#2e2e60',
      '--btn-active': '#818cf8',
      '--btn-active-text': '#0f0f1f',
      '--accent': '#818cf8',
      '--accent-light': '#242450',
    },
  },
}

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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem('colorTheme')
    return (saved as ColorTheme) || 'blue'
  })

  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem('mode')
    if (saved) return saved as Mode
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const saved = localStorage.getItem('fontSize')
    return (saved as FontSize) || 'xl'
  })

  useEffect(() => {
    localStorage.setItem('colorTheme', colorTheme)
    localStorage.setItem('mode', mode)
    localStorage.setItem('fontSize', fontSize)

    const theme = COLOR_THEMES[colorTheme][mode]
    const fontSizeVars = FONT_SIZE_VARS[fontSize]
    const root = document.documentElement

    // Apply color theme
    Object.entries(theme).forEach(([key, value]) => {
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
  }, [colorTheme, mode, fontSize])

  const toggleMode = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  return (
    <ThemeContext.Provider value={{ colorTheme, mode, fontSize, setColorTheme, setMode, setFontSize, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
