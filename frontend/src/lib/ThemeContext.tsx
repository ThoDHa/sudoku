import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Popular community themes
export type ColorTheme = 'catppuccin' | 'tokyonight' | 'dracula' | 'nord' | 'gruvbox' | 'rosepine' | 'solarized' | 'onedark'
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

// Popular community color themes
// Each theme has official light and dark variants based on their published color palettes
const COLOR_THEMES: Record<ColorTheme, { light: Record<string, string>; dark: Record<string, string> }> = {
  // Catppuccin - Soothing pastel theme
  // Light: Latte, Dark: Mocha
  // https://github.com/catppuccin/catppuccin
  catppuccin: {
    light: {
      // Latte palette
      '--bg': '#eff1f5',           // Base
      '--bg-secondary': '#e6e9ef', // Mantle
      '--text': '#4c4f69',         // Text
      '--text-muted': '#6c6f85',   // Subtext0
      '--board-bg': '#e6e9ef',     // Mantle
      '--cell-bg': '#eff1f5',      // Base
      '--cell-hover': '#ccd0da',   // Surface0
      '--cell-selected': '#bcc0cc', // Surface1
      '--cell-peer': '#dce0e8',    // Crust
      '--cell-primary': '#8839ef', // Mauve (accent)
      '--cell-secondary': '#ca9ee6', // Lighter mauve
      '--border-strong': '#4c4f69', // Text
      '--border-light': '#acb0be', // Surface2
      '--text-given': '#4c4f69',   // Text
      '--text-entered': '#8839ef', // Mauve
      '--text-candidate': '#7287fd', // Lavender
      '--text-on-highlight': '#eff1f5', // Base (light on dark highlight)
      '--btn-bg': '#ccd0da',       // Surface0
      '--btn-hover': '#bcc0cc',    // Surface1
      '--btn-active': '#8839ef',   // Mauve
      '--btn-active-text': '#eff1f5', // Base
      '--accent': '#8839ef',       // Mauve
      '--accent-light': '#dce0e8', // Crust
    },
    dark: {
      // Mocha palette
      '--bg': '#1e1e2e',           // Base
      '--bg-secondary': '#181825', // Mantle
      '--text': '#cdd6f4',         // Text
      '--text-muted': '#a6adc8',   // Subtext0
      '--board-bg': '#181825',     // Mantle
      '--cell-bg': '#1e1e2e',      // Base
      '--cell-hover': '#313244',   // Surface0
      '--cell-selected': '#45475a', // Surface1
      '--cell-peer': '#11111b',    // Crust
      '--cell-primary': '#cba6f7', // Mauve
      '--cell-secondary': '#b4befe', // Lavender
      '--border-strong': '#cdd6f4', // Text
      '--border-light': '#585b70', // Surface2
      '--text-given': '#cdd6f4',   // Text
      '--text-entered': '#cba6f7', // Mauve
      '--text-candidate': '#b4befe', // Lavender
      '--text-on-highlight': '#1e1e2e', // Base (dark on light highlight)
      '--btn-bg': '#313244',       // Surface0
      '--btn-hover': '#45475a',    // Surface1
      '--btn-active': '#cba6f7',   // Mauve
      '--btn-active-text': '#1e1e2e', // Base
      '--accent': '#cba6f7',       // Mauve
      '--accent-light': '#313244', // Surface0
    },
  },

  // Tokyo Night - Clean theme inspired by Tokyo city lights
  // Light: Tokyo Night Light, Dark: Tokyo Night Storm
  // https://github.com/enkia/tokyo-night-vscode-theme
  tokyonight: {
    light: {
      '--bg': '#d5d6db',           // Background
      '--bg-secondary': '#cbccd1', // Secondary bg
      '--text': '#343b58',         // Foreground
      '--text-muted': '#6c6e75',   // Comments
      '--board-bg': '#d5d6db',     // Background
      '--cell-bg': '#e6e7ed',      // Editor background
      '--cell-hover': '#c4c5cb',   // Hover
      '--cell-selected': '#b6b8c0', // Selection
      '--cell-peer': '#dcdee4',    // Peer cells
      '--cell-primary': '#5a3e8e', // Purple (control keywords)
      '--cell-secondary': '#7287fd', // Blue (functions)
      '--border-strong': '#343b58', // Foreground
      '--border-light': '#9ca0b0', // Overlay
      '--text-given': '#343b58',   // Foreground
      '--text-entered': '#2959aa', // Blue
      '--text-candidate': '#5a3e8e', // Purple
      '--text-on-highlight': '#e6e7ed', // Light bg
      '--btn-bg': '#c4c5cb',       // Button bg
      '--btn-hover': '#b6b8c0',    // Button hover
      '--btn-active': '#2959aa',   // Blue
      '--btn-active-text': '#e6e7ed', // Light
      '--accent': '#2959aa',       // Blue
      '--accent-light': '#dcdee4', // Light accent
    },
    dark: {
      // Storm variant
      '--bg': '#1a1b26',           // Background (Night)
      '--bg-secondary': '#16161e', // Darker
      '--text': '#a9b1d6',         // Foreground
      '--text-muted': '#565f89',   // Comments
      '--board-bg': '#1a1b26',     // Background
      '--cell-bg': '#24283b',      // Storm background
      '--cell-hover': '#292e42',   // Hover
      '--cell-selected': '#33467c', // Selection
      '--cell-peer': '#1f2335',    // Peer cells
      '--cell-primary': '#bb9af7', // Purple
      '--cell-secondary': '#7aa2f7', // Blue
      '--border-strong': '#a9b1d6', // Foreground
      '--border-light': '#414868', // Terminal black
      '--text-given': '#c0caf5',   // Variables
      '--text-entered': '#7aa2f7', // Blue
      '--text-candidate': '#bb9af7', // Purple
      '--text-on-highlight': '#1a1b26', // Dark bg
      '--btn-bg': '#292e42',       // Button bg
      '--btn-hover': '#33467c',    // Button hover
      '--btn-active': '#7aa2f7',   // Blue
      '--btn-active-text': '#1a1b26', // Dark
      '--accent': '#7aa2f7',       // Blue
      '--accent-light': '#292e42', // Dark accent
    },
  },

  // Dracula - Dark theme with vibrant colors
  // Light: Van Helsing (community light variant), Dark: Dracula
  // https://draculatheme.com
  dracula: {
    light: {
      // Van Helsing - Dracula's light counterpart
      '--bg': '#f8f8f2',           // Foreground as bg
      '--bg-secondary': '#f2f2ec', // Lighter
      '--text': '#282a36',         // Background as text
      '--text-muted': '#6272a4',   // Comment
      '--board-bg': '#f2f2ec',     // Secondary
      '--cell-bg': '#f8f8f2',      // Main bg
      '--cell-hover': '#e8e8e2',   // Hover
      '--cell-selected': '#d8d8d2', // Selected
      '--cell-peer': '#ececec',    // Peer
      '--cell-primary': '#bd93f9', // Purple
      '--cell-secondary': '#ff79c6', // Pink
      '--border-strong': '#282a36', // Dark
      '--border-light': '#d0d0d0', // Light border
      '--text-given': '#282a36',   // Dark text
      '--text-entered': '#bd93f9', // Purple
      '--text-candidate': '#6272a4', // Comment
      '--text-on-highlight': '#f8f8f2', // Light
      '--btn-bg': '#e8e8e2',       // Button
      '--btn-hover': '#d8d8d2',    // Hover
      '--btn-active': '#bd93f9',   // Purple
      '--btn-active-text': '#f8f8f2', // Light
      '--accent': '#bd93f9',       // Purple
      '--accent-light': '#ececec', // Light accent
    },
    dark: {
      // Official Dracula palette
      '--bg': '#282a36',           // Background
      '--bg-secondary': '#21222c', // Darker bg
      '--text': '#f8f8f2',         // Foreground
      '--text-muted': '#6272a4',   // Comment
      '--board-bg': '#21222c',     // Board bg
      '--cell-bg': '#282a36',      // Background
      '--cell-hover': '#343746',   // Hover
      '--cell-selected': '#44475a', // Current line / Selection
      '--cell-peer': '#2d2f3b',    // Peer cells
      '--cell-primary': '#bd93f9', // Purple
      '--cell-secondary': '#ff79c6', // Pink
      '--border-strong': '#f8f8f2', // Foreground
      '--border-light': '#44475a', // Selection
      '--text-given': '#f8f8f2',   // Foreground
      '--text-entered': '#bd93f9', // Purple
      '--text-candidate': '#ff79c6', // Pink
      '--text-on-highlight': '#282a36', // Background
      '--btn-bg': '#343746',       // Button
      '--btn-hover': '#44475a',    // Selection
      '--btn-active': '#bd93f9',   // Purple
      '--btn-active-text': '#282a36', // Background
      '--accent': '#bd93f9',       // Purple
      '--accent-light': '#343746', // Dark accent
    },
  },

  // Nord - Arctic, north-bluish color palette
  // https://www.nordtheme.com
  nord: {
    light: {
      // Nord Light (Snow Storm as base)
      '--bg': '#eceff4',           // nord6
      '--bg-secondary': '#e5e9f0', // nord5
      '--text': '#2e3440',         // nord0
      '--text-muted': '#4c566a',   // nord3
      '--board-bg': '#e5e9f0',     // nord5
      '--cell-bg': '#eceff4',      // nord6
      '--cell-hover': '#d8dee9',   // nord4
      '--cell-selected': '#d8dee9', // nord4
      '--cell-peer': '#e5e9f0',    // nord5
      '--cell-primary': '#5e81ac', // nord10
      '--cell-secondary': '#81a1c1', // nord9
      '--border-strong': '#2e3440', // nord0
      '--border-light': '#d8dee9', // nord4
      '--text-given': '#2e3440',   // nord0
      '--text-entered': '#5e81ac', // nord10
      '--text-candidate': '#81a1c1', // nord9
      '--text-on-highlight': '#eceff4', // nord6
      '--btn-bg': '#d8dee9',       // nord4
      '--btn-hover': '#e5e9f0',    // nord5
      '--btn-active': '#5e81ac',   // nord10
      '--btn-active-text': '#eceff4', // nord6
      '--accent': '#5e81ac',       // nord10
      '--accent-light': '#e5e9f0', // nord5
    },
    dark: {
      // Nord Dark (Polar Night as base)
      '--bg': '#2e3440',           // nord0
      '--bg-secondary': '#3b4252', // nord1
      '--text': '#eceff4',         // nord6
      '--text-muted': '#d8dee9',   // nord4
      '--board-bg': '#3b4252',     // nord1
      '--cell-bg': '#2e3440',      // nord0
      '--cell-hover': '#434c5e',   // nord2
      '--cell-selected': '#4c566a', // nord3
      '--cell-peer': '#3b4252',    // nord1
      '--cell-primary': '#88c0d0', // nord8
      '--cell-secondary': '#81a1c1', // nord9
      '--border-strong': '#eceff4', // nord6
      '--border-light': '#4c566a', // nord3
      '--text-given': '#eceff4',   // nord6
      '--text-entered': '#88c0d0', // nord8
      '--text-candidate': '#81a1c1', // nord9
      '--text-on-highlight': '#2e3440', // nord0
      '--btn-bg': '#434c5e',       // nord2
      '--btn-hover': '#4c566a',    // nord3
      '--btn-active': '#88c0d0',   // nord8
      '--btn-active-text': '#2e3440', // nord0
      '--accent': '#88c0d0',       // nord8
      '--accent-light': '#434c5e', // nord2
    },
  },

  // Gruvbox - Retro groove color scheme
  // https://github.com/morhetz/gruvbox
  gruvbox: {
    light: {
      // Gruvbox Light
      '--bg': '#fbf1c7',           // bg0
      '--bg-secondary': '#ebdbb2', // bg1
      '--text': '#3c3836',         // fg0
      '--text-muted': '#665c54',   // fg3
      '--board-bg': '#ebdbb2',     // bg1
      '--cell-bg': '#fbf1c7',      // bg0
      '--cell-hover': '#d5c4a1',   // bg2
      '--cell-selected': '#bdae93', // bg3
      '--cell-peer': '#f2e5bc',    // bg0_h
      '--cell-primary': '#d65d0e', // orange
      '--cell-secondary': '#af3a03', // dark orange
      '--border-strong': '#3c3836', // fg0
      '--border-light': '#bdae93', // bg3
      '--text-given': '#3c3836',   // fg0
      '--text-entered': '#d65d0e', // orange
      '--text-candidate': '#b57614', // yellow dark
      '--text-on-highlight': '#fbf1c7', // bg0
      '--btn-bg': '#d5c4a1',       // bg2
      '--btn-hover': '#bdae93',    // bg3
      '--btn-active': '#d65d0e',   // orange
      '--btn-active-text': '#fbf1c7', // bg0
      '--accent': '#d65d0e',       // orange
      '--accent-light': '#ebdbb2', // bg1
    },
    dark: {
      // Gruvbox Dark
      '--bg': '#282828',           // bg0
      '--bg-secondary': '#3c3836', // bg1
      '--text': '#ebdbb2',         // fg0
      '--text-muted': '#a89984',   // fg3
      '--board-bg': '#3c3836',     // bg1
      '--cell-bg': '#282828',      // bg0
      '--cell-hover': '#504945',   // bg2
      '--cell-selected': '#665c54', // bg3
      '--cell-peer': '#32302f',    // bg0_h
      '--cell-primary': '#fe8019', // orange
      '--cell-secondary': '#fabd2f', // yellow
      '--border-strong': '#ebdbb2', // fg0
      '--border-light': '#665c54', // bg3
      '--text-given': '#ebdbb2',   // fg0
      '--text-entered': '#fe8019', // orange
      '--text-candidate': '#fabd2f', // yellow
      '--text-on-highlight': '#282828', // bg0
      '--btn-bg': '#504945',       // bg2
      '--btn-hover': '#665c54',    // bg3
      '--btn-active': '#fe8019',   // orange
      '--btn-active-text': '#282828', // bg0
      '--accent': '#fe8019',       // orange
      '--accent-light': '#3c3836', // bg1
    },
  },

  // Rosé Pine - All natural pine, faux fur and a bit of soho vibes
  // Light: Dawn, Dark: Moon
  // https://rosepinetheme.com
  rosepine: {
    light: {
      // Rosé Pine Dawn
      '--bg': '#faf4ed',           // base
      '--bg-secondary': '#fffaf3', // surface
      '--text': '#575279',         // text
      '--text-muted': '#797593',   // muted
      '--board-bg': '#fffaf3',     // surface
      '--cell-bg': '#faf4ed',      // base
      '--cell-hover': '#f2e9e1',   // overlay
      '--cell-selected': '#dfdad9', // highlight med
      '--cell-peer': '#f4ede8',    // highlight low
      '--cell-primary': '#907aa9', // iris
      '--cell-secondary': '#d7827e', // rose
      '--border-strong': '#575279', // text
      '--border-light': '#dfdad9', // highlight med
      '--text-given': '#575279',   // text
      '--text-entered': '#907aa9', // iris
      '--text-candidate': '#d7827e', // rose
      '--text-on-highlight': '#faf4ed', // base
      '--btn-bg': '#f2e9e1',       // overlay
      '--btn-hover': '#dfdad9',    // highlight med
      '--btn-active': '#907aa9',   // iris
      '--btn-active-text': '#faf4ed', // base
      '--accent': '#907aa9',       // iris
      '--accent-light': '#f4ede8', // highlight low
    },
    dark: {
      // Rosé Pine Moon
      '--bg': '#232136',           // base
      '--bg-secondary': '#2a273f', // surface
      '--text': '#e0def4',         // text
      '--text-muted': '#908caa',   // muted
      '--board-bg': '#2a273f',     // surface
      '--cell-bg': '#232136',      // base
      '--cell-hover': '#393552',   // overlay
      '--cell-selected': '#44415a', // highlight med
      '--cell-peer': '#2a283e',    // highlight low
      '--cell-primary': '#c4a7e7', // iris
      '--cell-secondary': '#ea9a97', // rose
      '--border-strong': '#e0def4', // text
      '--border-light': '#44415a', // highlight med
      '--text-given': '#e0def4',   // text
      '--text-entered': '#c4a7e7', // iris
      '--text-candidate': '#ea9a97', // rose
      '--text-on-highlight': '#232136', // base
      '--btn-bg': '#393552',       // overlay
      '--btn-hover': '#44415a',    // highlight med
      '--btn-active': '#c4a7e7',   // iris
      '--btn-active-text': '#232136', // base
      '--accent': '#c4a7e7',       // iris
      '--accent-light': '#2a283e', // highlight low
    },
  },

  // Solarized - Precision colors for machines and people
  // https://ethanschoonover.com/solarized/
  solarized: {
    light: {
      '--bg': '#fdf6e3',           // base3
      '--bg-secondary': '#eee8d5', // base2
      '--text': '#657b83',         // base00
      '--text-muted': '#93a1a1',   // base1
      '--board-bg': '#eee8d5',     // base2
      '--cell-bg': '#fdf6e3',      // base3
      '--cell-hover': '#eee8d5',   // base2
      '--cell-selected': '#d6d0b8', // darker base2
      '--cell-peer': '#f5efdc',    // between base2 and base3
      '--cell-primary': '#268bd2', // blue
      '--cell-secondary': '#2aa198', // cyan
      '--border-strong': '#657b83', // base00
      '--border-light': '#d6d0b8', // darker base2
      '--text-given': '#586e75',   // base01 (darker)
      '--text-entered': '#268bd2', // blue
      '--text-candidate': '#2aa198', // cyan
      '--text-on-highlight': '#fdf6e3', // base3
      '--btn-bg': '#eee8d5',       // base2
      '--btn-hover': '#d6d0b8',    // darker
      '--btn-active': '#268bd2',   // blue
      '--btn-active-text': '#fdf6e3', // base3
      '--accent': '#268bd2',       // blue
      '--accent-light': '#eee8d5', // base2
    },
    dark: {
      '--bg': '#002b36',           // base03
      '--bg-secondary': '#073642', // base02
      '--text': '#839496',         // base0
      '--text-muted': '#586e75',   // base01
      '--board-bg': '#073642',     // base02
      '--cell-bg': '#002b36',      // base03
      '--cell-hover': '#094656',   // lighter base02
      '--cell-selected': '#0b5266', // even lighter
      '--cell-peer': '#03303c',    // between base03 and base02
      '--cell-primary': '#268bd2', // blue
      '--cell-secondary': '#2aa198', // cyan
      '--border-strong': '#839496', // base0
      '--border-light': '#094656', // lighter base02
      '--text-given': '#93a1a1',   // base1 (brighter)
      '--text-entered': '#268bd2', // blue
      '--text-candidate': '#2aa198', // cyan
      '--text-on-highlight': '#002b36', // base03
      '--btn-bg': '#094656',       // lighter base02
      '--btn-hover': '#0b5266',    // even lighter
      '--btn-active': '#268bd2',   // blue
      '--btn-active-text': '#002b36', // base03
      '--accent': '#268bd2',       // blue
      '--accent-light': '#073642', // base02
    },
  },

  // One Dark / One Light - Atom's iconic theme
  // https://github.com/atom/atom/tree/master/packages/one-dark-syntax
  onedark: {
    light: {
      // One Light
      '--bg': '#fafafa',           // background
      '--bg-secondary': '#f0f0f0', // secondary
      '--text': '#383a42',         // foreground
      '--text-muted': '#a0a1a7',   // comment
      '--board-bg': '#f0f0f0',     // secondary
      '--cell-bg': '#fafafa',      // background
      '--cell-hover': '#e5e5e6',   // hover
      '--cell-selected': '#d4d4d5', // selection
      '--cell-peer': '#f0f0f0',    // peer
      '--cell-primary': '#a626a4', // purple
      '--cell-secondary': '#4078f2', // blue
      '--border-strong': '#383a42', // foreground
      '--border-light': '#d4d4d5', // selection
      '--text-given': '#383a42',   // foreground
      '--text-entered': '#a626a4', // purple
      '--text-candidate': '#4078f2', // blue
      '--text-on-highlight': '#fafafa', // background
      '--btn-bg': '#e5e5e6',       // hover
      '--btn-hover': '#d4d4d5',    // selection
      '--btn-active': '#a626a4',   // purple
      '--btn-active-text': '#fafafa', // background
      '--accent': '#a626a4',       // purple
      '--accent-light': '#f0f0f0', // secondary
    },
    dark: {
      // One Dark
      '--bg': '#282c34',           // background
      '--bg-secondary': '#21252b', // darker
      '--text': '#abb2bf',         // foreground
      '--text-muted': '#5c6370',   // comment
      '--board-bg': '#21252b',     // darker
      '--cell-bg': '#282c34',      // background
      '--cell-hover': '#2c323c',   // hover
      '--cell-selected': '#3e4451', // selection
      '--cell-peer': '#2a2e36',    // peer
      '--cell-primary': '#c678dd', // purple
      '--cell-secondary': '#61afef', // blue
      '--border-strong': '#abb2bf', // foreground
      '--border-light': '#3e4451', // selection
      '--text-given': '#abb2bf',   // foreground
      '--text-entered': '#c678dd', // purple
      '--text-candidate': '#61afef', // blue
      '--text-on-highlight': '#282c34', // background
      '--btn-bg': '#2c323c',       // hover
      '--btn-hover': '#3e4451',    // selection
      '--btn-active': '#c678dd',   // purple
      '--btn-active-text': '#282c34', // background
      '--accent': '#c678dd',       // purple
      '--accent-light': '#2c323c', // hover
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

// Map old theme names to new ones for migration
const THEME_MIGRATION: Record<string, ColorTheme> = {
  'blue': 'catppuccin',
  'green': 'gruvbox',
  'purple': 'dracula',
  'orange': 'gruvbox',
  'pink': 'rosepine',
  'teal': 'nord',
  'red': 'dracula',
  'indigo': 'tokyonight',
}

// Helper to get system preference
function getSystemMode(): Mode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Helper to validate and migrate theme
function getValidTheme(saved: string | null): ColorTheme {
  if (!saved) return 'tokyonight'
  
  // Check if it's already a valid new theme
  if (saved in COLOR_THEMES) {
    return saved as ColorTheme
  }
  
  // Try to migrate from old theme
  const migrated = THEME_MIGRATION[saved]
  if (migrated) {
    return migrated
  }
  
  // Default fallback
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

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
