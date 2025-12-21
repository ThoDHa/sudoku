import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Open-source community theme names with decidedly blue default
export type ColorTheme = 'tokyonight' | 'dracula' | 'nord' | 'catppuccin' | 'gruvbox' | 'rosepine' | 'solarized' | 'onedark'
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

// Open-source themes with their authentic deepest dark mode colors
const COLOR_THEMES: Record<ColorTheme, { light: Record<string, string>; dark: Record<string, string> }> = {
  // Tokyo Night - Deep storm blue, decidedly blue theme (DEFAULT)
  tokyonight: {
    light: {
      '--bg': '#e1e2e7',
      '--bg-secondary': '#d5d6db',
      '--text': '#3760bf',
      '--text-muted': '#6172b0',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#f0f1f5',
      '--cell-selected': '#b4c0e0',
      '--cell-peer': '#f5f5f8',
      '--cell-primary': '#2e7de9',
      '--cell-secondary': '#b4c0e0',
      '--border-strong': '#3760bf',
      '--border-light': '#9699a3',
      '--text-given': '#3760bf',
      '--text-entered': '#2e7de9',
      '--text-candidate': '#2e7de9',
      '--text-on-highlight': '#ffffff',
      '--btn-bg': '#d5d6db',
      '--btn-hover': '#c8c9cf',
      '--btn-active': '#2e7de9',
      '--btn-active-text': '#ffffff',
      '--accent': '#2e7de9',
      '--accent-light': '#d5d6db',
    },
    dark: {
      '--bg': '#1a1b26',
      '--bg-secondary': '#16161e',
      '--text': '#c0caf5',
      '--text-muted': '#565f89',
      '--board-bg': '#1f2335',
      '--cell-bg': '#1f2335',
      '--cell-hover': '#292e42',
      '--cell-selected': '#33467c',
      '--cell-peer': '#24283b',
      '--cell-primary': '#7aa2f7',
      '--cell-secondary': '#3d59a1',
      '--border-strong': '#c0caf5',
      '--border-light': '#3b4261',
      '--text-given': '#c0caf5',
      '--text-entered': '#7aa2f7',
      '--text-candidate': '#7aa2f7',
      '--text-on-highlight': '#1a1b26',
      '--btn-bg': '#24283b',
      '--btn-hover': '#292e42',
      '--btn-active': '#7aa2f7',
      '--btn-active-text': '#1a1b26',
      '--accent': '#7aa2f7',
      '--accent-light': '#24283b',
    },
  },

  // Dracula - Deep purple-gray
  dracula: {
    light: {
      '--bg': '#f8f8f2',
      '--bg-secondary': '#ebebeb',
      '--text': '#282a36',
      '--text-muted': '#6272a4',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#f5f5f0',
      '--cell-selected': '#e6d6ff',
      '--cell-peer': '#fafaf5',
      '--cell-primary': '#bd93f9',
      '--cell-secondary': '#e6d6ff',
      '--border-strong': '#282a36',
      '--border-light': '#a0a0a0',
      '--text-given': '#282a36',
      '--text-entered': '#bd93f9',
      '--text-candidate': '#bd93f9',
      '--text-on-highlight': '#ffffff',
      '--btn-bg': '#ebebeb',
      '--btn-hover': '#dededb',
      '--btn-active': '#bd93f9',
      '--btn-active-text': '#ffffff',
      '--accent': '#bd93f9',
      '--accent-light': '#ebebeb',
    },
    dark: {
      '--bg': '#282a36',
      '--bg-secondary': '#1e1f29',
      '--text': '#f8f8f2',
      '--text-muted': '#6272a4',
      '--board-bg': '#21222c',
      '--cell-bg': '#21222c',
      '--cell-hover': '#343746',
      '--cell-selected': '#44475a',
      '--cell-peer': '#2c2d3a',
      '--cell-primary': '#bd93f9',
      '--cell-secondary': '#6272a4',
      '--border-strong': '#f8f8f2',
      '--border-light': '#44475a',
      '--text-given': '#f8f8f2',
      '--text-entered': '#bd93f9',
      '--text-candidate': '#bd93f9',
      '--text-on-highlight': '#282a36',
      '--btn-bg': '#343746',
      '--btn-hover': '#44475a',
      '--btn-active': '#bd93f9',
      '--btn-active-text': '#282a36',
      '--accent': '#bd93f9',
      '--accent-light': '#343746',
    },
  },

  // Nord - Polar night, muted arctic blue-gray
  nord: {
    light: {
      '--bg': '#eceff4',
      '--bg-secondary': '#e5e9f0',
      '--text': '#2e3440',
      '--text-muted': '#4c566a',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#f5f7fa',
      '--cell-selected': '#b8c9d9',
      '--cell-peer': '#f8f9fc',
      '--cell-primary': '#5e81ac',
      '--cell-secondary': '#b8c9d9',
      '--border-strong': '#2e3440',
      '--border-light': '#9ba4b4',
      '--text-given': '#2e3440',
      '--text-entered': '#5e81ac',
      '--text-candidate': '#5e81ac',
      '--text-on-highlight': '#ffffff',
      '--btn-bg': '#e5e9f0',
      '--btn-hover': '#d8dee9',
      '--btn-active': '#5e81ac',
      '--btn-active-text': '#ffffff',
      '--accent': '#5e81ac',
      '--accent-light': '#d8dee9',
    },
    dark: {
      '--bg': '#2e3440',
      '--bg-secondary': '#242933',
      '--text': '#eceff4',
      '--text-muted': '#8892a6',
      '--board-bg': '#3b4252',
      '--cell-bg': '#3b4252',
      '--cell-hover': '#434c5e',
      '--cell-selected': '#4c566a',
      '--cell-peer': '#3f4859',
      '--cell-primary': '#88c0d0',
      '--cell-secondary': '#5e81ac',
      '--border-strong': '#eceff4',
      '--border-light': '#4c566a',
      '--text-given': '#eceff4',
      '--text-entered': '#88c0d0',
      '--text-candidate': '#88c0d0',
      '--text-on-highlight': '#2e3440',
      '--btn-bg': '#434c5e',
      '--btn-hover': '#4c566a',
      '--btn-active': '#88c0d0',
      '--btn-active-text': '#2e3440',
      '--accent': '#88c0d0',
      '--accent-light': '#434c5e',
    },
  },

  // Catppuccin Mocha - Deep purple-brown, rich and warm
  catppuccin: {
    light: {
      '--bg': '#eff1f5',
      '--bg-secondary': '#e6e9ef',
      '--text': '#4c4f69',
      '--text-muted': '#6c6f85',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#f5f6f9',
      '--cell-selected': '#dcc6f7',
      '--cell-peer': '#f8f9fb',
      '--cell-primary': '#8839ef',
      '--cell-secondary': '#dcc6f7',
      '--border-strong': '#4c4f69',
      '--border-light': '#9ca0b0',
      '--text-given': '#4c4f69',
      '--text-entered': '#8839ef',
      '--text-candidate': '#8839ef',
      '--text-on-highlight': '#ffffff',
      '--btn-bg': '#e6e9ef',
      '--btn-hover': '#dce0e8',
      '--btn-active': '#8839ef',
      '--btn-active-text': '#ffffff',
      '--accent': '#8839ef',
      '--accent-light': '#dce0e8',
    },
    dark: {
      '--bg': '#1e1e2e',
      '--bg-secondary': '#181825',
      '--text': '#cdd6f4',
      '--text-muted': '#6c7086',
      '--board-bg': '#24243a',
      '--cell-bg': '#24243a',
      '--cell-hover': '#313244',
      '--cell-selected': '#45475a',
      '--cell-peer': '#2a2a40',
      '--cell-primary': '#cba6f7',
      '--cell-secondary': '#6c7086',
      '--border-strong': '#cdd6f4',
      '--border-light': '#45475a',
      '--text-given': '#cdd6f4',
      '--text-entered': '#cba6f7',
      '--text-candidate': '#cba6f7',
      '--text-on-highlight': '#1e1e2e',
      '--btn-bg': '#313244',
      '--btn-hover': '#45475a',
      '--btn-active': '#cba6f7',
      '--btn-active-text': '#1e1e2e',
      '--accent': '#cba6f7',
      '--accent-light': '#313244',
    },
  },

  // Gruvbox - Retro earthy brown, deepest dark variant
  gruvbox: {
    light: {
      '--bg': '#fbf1c7',
      '--bg-secondary': '#f2e5bc',
      '--text': '#282828',
      '--text-muted': '#504945',
      '--board-bg': '#fffdf5',
      '--cell-bg': '#fffdf5',
      '--cell-hover': '#faf5e0',
      '--cell-selected': '#e9c46a',
      '--cell-peer': '#fcf8ea',
      '--cell-primary': '#d79921',
      '--cell-secondary': '#e9c46a',
      '--border-strong': '#282828',
      '--border-light': '#a89984',
      '--text-given': '#282828',
      '--text-entered': '#b57614',
      '--text-candidate': '#d79921',
      '--text-on-highlight': '#282828',
      '--btn-bg': '#f2e5bc',
      '--btn-hover': '#ebdbb2',
      '--btn-active': '#d79921',
      '--btn-active-text': '#282828',
      '--accent': '#d79921',
      '--accent-light': '#ebdbb2',
    },
    dark: {
      '--bg': '#1d2021',
      '--bg-secondary': '#141617',
      '--text': '#ebdbb2',
      '--text-muted': '#928374',
      '--board-bg': '#282828',
      '--cell-bg': '#282828',
      '--cell-hover': '#32302f',
      '--cell-selected': '#3c3836',
      '--cell-peer': '#2c2a29',
      '--cell-primary': '#fabd2f',
      '--cell-secondary': '#665c54',
      '--border-strong': '#ebdbb2',
      '--border-light': '#504945',
      '--text-given': '#ebdbb2',
      '--text-entered': '#fabd2f',
      '--text-candidate': '#fabd2f',
      '--text-on-highlight': '#1d2021',
      '--btn-bg': '#32302f',
      '--btn-hover': '#3c3836',
      '--btn-active': '#fabd2f',
      '--btn-active-text': '#1d2021',
      '--accent': '#fabd2f',
      '--accent-light': '#32302f',
    },
  },

  // Rosé Pine - Muted rose/pink with deep purple-brown base
  rosepine: {
    light: {
      '--bg': '#faf4ed',
      '--bg-secondary': '#f2e9e1',
      '--text': '#575279',
      '--text-muted': '#797593',
      '--board-bg': '#fffcf8',
      '--cell-bg': '#fffcf8',
      '--cell-hover': '#faf5ef',
      '--cell-selected': '#f4c6c3',
      '--cell-peer': '#fcf7f2',
      '--cell-primary': '#d7827e',
      '--cell-secondary': '#f4c6c3',
      '--border-strong': '#575279',
      '--border-light': '#9893a5',
      '--text-given': '#575279',
      '--text-entered': '#d7827e',
      '--text-candidate': '#d7827e',
      '--text-on-highlight': '#ffffff',
      '--btn-bg': '#f2e9e1',
      '--btn-hover': '#e4dcd4',
      '--btn-active': '#d7827e',
      '--btn-active-text': '#ffffff',
      '--accent': '#d7827e',
      '--accent-light': '#e4dcd4',
    },
    dark: {
      '--bg': '#191724',
      '--bg-secondary': '#13111d',
      '--text': '#e0def4',
      '--text-muted': '#6e6a86',
      '--board-bg': '#1f1d2e',
      '--cell-bg': '#1f1d2e',
      '--cell-hover': '#26233a',
      '--cell-selected': '#393552',
      '--cell-peer': '#221f31',
      '--cell-primary': '#ebbcba',
      '--cell-secondary': '#524f67',
      '--border-strong': '#e0def4',
      '--border-light': '#393552',
      '--text-given': '#e0def4',
      '--text-entered': '#ebbcba',
      '--text-candidate': '#ebbcba',
      '--text-on-highlight': '#191724',
      '--btn-bg': '#26233a',
      '--btn-hover': '#393552',
      '--btn-active': '#ebbcba',
      '--btn-active-text': '#191724',
      '--accent': '#ebbcba',
      '--accent-light': '#26233a',
    },
  },

  // Solarized Dark - Classic blue-gray with cyan accent
  solarized: {
    light: {
      '--bg': '#fdf6e3',
      '--bg-secondary': '#eee8d5',
      '--text': '#657b83',
      '--text-muted': '#839496',
      '--board-bg': '#fffdf6',
      '--cell-bg': '#fffdf6',
      '--cell-hover': '#faf4e4',
      '--cell-selected': '#b8d4e8',
      '--cell-peer': '#fcf8ed',
      '--cell-primary': '#268bd2',
      '--cell-secondary': '#b8d4e8',
      '--border-strong': '#586e75',
      '--border-light': '#93a1a1',
      '--text-given': '#586e75',
      '--text-entered': '#268bd2',
      '--text-candidate': '#268bd2',
      '--text-on-highlight': '#ffffff',
      '--btn-bg': '#eee8d5',
      '--btn-hover': '#dfd9c6',
      '--btn-active': '#268bd2',
      '--btn-active-text': '#ffffff',
      '--accent': '#268bd2',
      '--accent-light': '#dfd9c6',
    },
    dark: {
      '--bg': '#002b36',
      '--bg-secondary': '#001e26',
      '--text': '#839496',
      '--text-muted': '#586e75',
      '--board-bg': '#073642',
      '--cell-bg': '#073642',
      '--cell-hover': '#0a4a5a',
      '--cell-selected': '#0d5c6e',
      '--cell-peer': '#084350',
      '--cell-primary': '#2aa198',
      '--cell-secondary': '#586e75',
      '--border-strong': '#93a1a1',
      '--border-light': '#094555',
      '--text-given': '#93a1a1',
      '--text-entered': '#2aa198',
      '--text-candidate': '#2aa198',
      '--text-on-highlight': '#002b36',
      '--btn-bg': '#0a4a5a',
      '--btn-hover': '#0d5c6e',
      '--btn-active': '#2aa198',
      '--btn-active-text': '#002b36',
      '--accent': '#2aa198',
      '--accent-light': '#0a4a5a',
    },
  },

  // One Dark - Atom's signature deep gray-blue
  onedark: {
    light: {
      '--bg': '#f0f0f1',
      '--bg-secondary': '#e5e5e6',
      '--text': '#383a42',
      '--text-muted': '#696c77',
      '--board-bg': '#ffffff',
      '--cell-bg': '#ffffff',
      '--cell-hover': '#f5f5f6',
      '--cell-selected': '#c4d5f7',
      '--cell-peer': '#f8f8f9',
      '--cell-primary': '#4078f2',
      '--cell-secondary': '#c4d5f7',
      '--border-strong': '#383a42',
      '--border-light': '#c5c5c7',
      '--text-given': '#383a42',
      '--text-entered': '#4078f2',
      '--text-candidate': '#4078f2',
      '--text-on-highlight': '#ffffff',
      '--btn-bg': '#e5e5e6',
      '--btn-hover': '#d8d8d9',
      '--btn-active': '#4078f2',
      '--btn-active-text': '#ffffff',
      '--accent': '#4078f2',
      '--accent-light': '#e5e5e6',
    },
    dark: {
      '--bg': '#282c34',
      '--bg-secondary': '#1e2127',
      '--text': '#abb2bf',
      '--text-muted': '#5c6370',
      '--board-bg': '#2c323c',
      '--cell-bg': '#2c323c',
      '--cell-hover': '#3a404c',
      '--cell-selected': '#4d5566',
      '--cell-peer': '#323842',
      '--cell-primary': '#61afef',
      '--cell-secondary': '#5c6370',
      '--border-strong': '#abb2bf',
      '--border-light': '#4b5263',
      '--text-given': '#abb2bf',
      '--text-entered': '#61afef',
      '--text-candidate': '#61afef',
      '--text-on-highlight': '#282c34',
      '--btn-bg': '#3a404c',
      '--btn-hover': '#4d5566',
      '--btn-active': '#61afef',
      '--btn-active-text': '#282c34',
      '--accent': '#61afef',
      '--accent-light': '#3a404c',
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

// Map old theme names to new open-source theme names
const THEME_MIGRATION: Record<string, ColorTheme> = {
  'blue': 'tokyonight',
  'indigo': 'tokyonight',
  'purple': 'dracula',
  'teal': 'nord',
  'green': 'nord',
  'orange': 'gruvbox',
  'pink': 'rosepine',
  'red': 'gruvbox',
  'classic': 'tokyonight',
}

// Valid theme names
const VALID_THEMES: ColorTheme[] = ['tokyonight', 'dracula', 'nord', 'catppuccin', 'gruvbox', 'rosepine', 'solarized', 'onedark']

// Helper to get system preference
function getSystemMode(): Mode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Helper to validate and migrate theme
function getValidTheme(saved: string | null): ColorTheme {
  if (!saved) return 'tokyonight'
  
  // Check if it's already a valid theme
  if (VALID_THEMES.includes(saved as ColorTheme)) {
    return saved as ColorTheme
  }
  
  // Try to migrate from old theme names
  const migrated = THEME_MIGRATION[saved]
  if (migrated) {
    return migrated
  }
  
  // Default fallback - decidedly blue
  return 'tokyonight'
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

  return (
    <ThemeContext.Provider value={{ colorTheme, mode, modePreference, fontSize, setColorTheme, setMode, setModePreference, setFontSize, toggleMode }}>
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
