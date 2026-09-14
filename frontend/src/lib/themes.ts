/**
 * Centralized theme definitions for the Sudoku app.
 *
 * This file is the SINGLE SOURCE OF TRUTH for all theme color data.
 *
 * Architecture:
 * 1. ThemePalette interface - what each theme must provide
 * 2. PALETTES - raw color values for each theme (light/dark)
 * 3. VALID_THEMES and THEME_MIGRATION - the accepted theme names and the
 *    legacy names that migrate onto them
 *
 * The palette → semantic-colour derivation, the CSS-variable mapping and the
 * saved-theme validation live in `themeDerivation.ts`, which derives on call
 * instead of building a THEMES record at module load.
 *
 * Official color sources:
 * - Tokyo Night: https://github.com/tokyo-night/tokyo-night-vscode-theme
 * - Dracula: https://draculatheme.com/contribute
 * - Nord: https://www.nordtheme.com/docs/colors-and-palettes
 * - Catppuccin: https://catppuccin.com/palette
 * - Gruvbox: https://github.com/morhetz/gruvbox
 * - Rosé Pine: https://rosepinetheme.com/palette
 * - Solarized: https://ethanschoonover.com/solarized/
 * - One Dark: https://github.com/atom/one-dark-syntax
 */

// ============================================================
// THEME PALETTE INTERFACE
// ============================================================

/**
 * Unified palette interface - what each theme variant must provide.
 * The semantic mapping function uses these to generate UI colors.
 */
export interface ThemePalette {
  // Backgrounds
  bg: string // Page background
  bgSecondary: string // Secondary/card background
  boardBg: string // Board and cell background

  // Text
  text: string // Primary text
  textMuted: string // Muted/secondary text
  textGiven: string // Given digit text (often same as text)

  // Borders
  border: string // Strong borders (box separators)
  borderLight: string // Light borders (cell separators)

  // Accent colors
  accent: string // Primary accent (buttons, entered digits, highlights)
  accentMuted: string // Muted accent (secondary highlights)

  // Cell states
  cellHover: string // Hovered cell
  cellSelected: string // Selected cell
  cellPeer: string // Peer cells (same row/col/box as selected)

  // Error states
  errorBg: string // Error background
  errorText: string // Error text

  // Hint states
  hintText: string // Hint text (green, for additions)

  // Button states
  btnBg: string // Button background
  btnHover: string // Button hover

  // Shadows
  shadow: string // Standard shadow (for cards, modals)
  shadowLight: string // Lighter shadow (for subtle elevation)

  // Difficulty colors (for badges, cards)
  diffEasy: string
  diffMedium: string
  diffHard: string
  diffExtreme: string
  diffImpossible: string
}

// ============================================================
// SEMANTIC UI COLOR MAPPING
// ============================================================

/**
 * Semantic colors for the Sudoku UI.
 * Generated from ThemePalette by createSemanticColors().
 */
export interface SemanticColors {
  // Page backgrounds
  bg: string
  bgSecondary: string

  // Text colors
  text: string
  textMuted: string

  // Board
  boardBg: string
  borderStrong: string
  borderLight: string

  // Cell backgrounds
  cellBg: string
  cellGiven: string // Same as cellBg (given digits distinguished by text color)
  cellHover: string
  cellSelected: string
  cellPeer: string
  cellPrimary: string // Primary highlight (matching digit)
  cellSecondary: string // Secondary highlight

  // Cell text
  textGiven: string
  textEntered: string
  textCandidate: string
  textOnHighlight: string

  // Buttons
  btnBg: string
  btnHover: string
  btnActive: string
  btnActiveText: string

  // Accent
  accent: string
  accentLight: string

  // Error states
  errorBg: string
  errorText: string

  // Hint states
  hintText: string

  // Shadows
  shadow: string
  shadowLight: string

  // Difficulty colors
  diffEasy: string
  diffMedium: string
  diffHard: string
  diffExtreme: string
  diffImpossible: string
}

// ============================================================
// THEME PALETTES
// ============================================================

export type ColorTheme =
  | 'tokyonight'
  | 'dracula'
  | 'nord'
  | 'catppuccin'
  | 'gruvbox'
  | 'rosepine'
  | 'solarized'
  | 'onedark'
export type Mode = 'light' | 'dark'

// Dark themes share the same neutral drop shadows; defining them once keeps the
// palette table free of repeated rgba literals.
const DARK_SHADOW = '0 4px 12px rgba(0, 0, 0, 0.4)'
const DARK_SHADOW_LIGHT = '0 2px 6px rgba(0, 0, 0, 0.25)'

export const PALETTES: Record<ColorTheme, { light: ThemePalette; dark: ThemePalette }> = {
  // ----------------------------------------
  // TOKYO NIGHT
  // https://github.com/tokyo-night/tokyo-night-vscode-theme
  // ----------------------------------------
  tokyonight: {
    light: {
      bg: '#e1e2e7',
      bgSecondary: '#d5d6db',
      boardBg: '#ffffff',
      text: '#3760bf',
      textMuted: '#6172b0',
      textGiven: '#3760bf',
      border: '#3760bf',
      borderLight: '#9699a3',
      accent: '#2e7de9',
      accentMuted: '#b4c0e0',
      cellHover: '#f0f1f5',
      cellSelected: '#b4c0e0',
      cellPeer: '#e8f0fc',
      errorBg: '#fecaca',
      errorText: '#f52a65',
      hintText: '#22863a',
      btnBg: '#ffffff',
      btnHover: '#c8c9cf',
      shadow: '0 4px 12px rgba(55, 96, 191, 0.15)',
      shadowLight: '0 2px 6px rgba(55, 96, 191, 0.08)',
      diffEasy: '#22863a',
      diffMedium: '#b08800',
      diffHard: '#d15704',
      diffExtreme: '#cb2431',
      diffImpossible: '#8b2c8b',
    },
    dark: {
      bg: '#1a1b26',
      bgSecondary: '#16161e',
      boardBg: '#1f2335',
      text: '#c0caf5',
      textMuted: '#565f89',
      textGiven: '#c0caf5',
      border: '#c0caf5',
      borderLight: '#3b4261',
      accent: '#7aa2f7',
      accentMuted: '#3d59a1',
      cellHover: '#292e42',
      cellSelected: '#33467c',
      cellPeer: '#252a3f',
      errorBg: '#4a2040',
      errorText: '#f7768e',
      hintText: '#9ece6a',
      btnBg: '#1f2335',
      btnHover: '#292e42',
      shadow: DARK_SHADOW,
      shadowLight: DARK_SHADOW_LIGHT,
      diffEasy: '#9ece6a',
      diffMedium: '#e0af68',
      diffHard: '#ff9e64',
      diffExtreme: '#f7768e',
      diffImpossible: '#bb9af7',
    },
  },

  // ----------------------------------------
  // DRACULA
  // https://draculatheme.com/contribute
  // ----------------------------------------
  dracula: {
    light: {
      bg: '#f8f8f2',
      bgSecondary: '#ebebeb',
      boardBg: '#ffffff',
      text: '#282a36',
      textMuted: '#6272a4',
      textGiven: '#282a36',
      border: '#282a36',
      borderLight: '#a0a0a0',
      accent: '#bd93f9',
      accentMuted: '#e6d6ff',
      cellHover: '#f5f5f0',
      cellSelected: '#e6d6ff',
      cellPeer: '#f5f0fc',
      errorBg: '#fecaca',
      errorText: '#ff5555',
      hintText: '#2e7d32',
      btnBg: '#ebebeb',
      btnHover: '#dededb',
      shadow: '0 4px 12px rgba(40, 42, 54, 0.15)',
      shadowLight: '0 2px 6px rgba(40, 42, 54, 0.08)',
      diffEasy: '#2e7d32',
      diffMedium: '#b08800',
      diffHard: '#d15704',
      diffExtreme: '#cb2431',
      diffImpossible: '#8b2c8b',
    },
    dark: {
      bg: '#282a36',
      bgSecondary: '#1e1f29',
      boardBg: '#21222c',
      text: '#f8f8f2',
      textMuted: '#6272a4',
      textGiven: '#f8f8f2',
      border: '#f8f8f2',
      borderLight: '#44475a',
      accent: '#bd93f9',
      accentMuted: '#6272a4',
      cellHover: '#343746',
      cellSelected: '#44475a',
      cellPeer: '#2a2835',
      errorBg: '#4a2020',
      errorText: '#ff5555',
      hintText: '#50fa7b',
      btnBg: '#343746',
      btnHover: '#44475a',
      shadow: DARK_SHADOW,
      shadowLight: DARK_SHADOW_LIGHT,
      diffEasy: '#50fa7b',
      diffMedium: '#f1fa8c',
      diffHard: '#ffb86c',
      diffExtreme: '#ff5555',
      diffImpossible: '#ff79c6',
    },
  },

  // ----------------------------------------
  // NORD
  // https://www.nordtheme.com/docs/colors-and-palettes
  // ----------------------------------------
  nord: {
    light: {
      bg: '#eceff4',
      bgSecondary: '#e5e9f0',
      boardBg: '#ffffff',
      text: '#2e3440',
      textMuted: '#4c566a',
      textGiven: '#2e3440',
      border: '#2e3440',
      borderLight: '#9ba4b4',
      accent: '#5e81ac',
      accentMuted: '#b8c9d9',
      cellHover: '#f5f7fa',
      cellSelected: '#b8c9d9',
      cellPeer: '#e8eef5',
      errorBg: '#e8c5c8',
      errorText: '#bf616a',
      hintText: '#4c8c4a',
      btnBg: '#e5e9f0',
      btnHover: '#d8dee9',
      shadow: '0 4px 12px rgba(46, 52, 64, 0.12)',
      shadowLight: '0 2px 6px rgba(46, 52, 64, 0.06)',
      diffEasy: '#4c8c4a',
      diffMedium: '#b08800',
      diffHard: '#c95d1e',
      diffExtreme: '#bf616a',
      diffImpossible: '#8b5c8b',
    },
    dark: {
      bg: '#2e3440',
      bgSecondary: '#242933',
      boardBg: '#3b4252',
      text: '#eceff4',
      textMuted: '#8892a6',
      textGiven: '#eceff4',
      border: '#eceff4',
      borderLight: '#4c566a',
      accent: '#88c0d0',
      accentMuted: '#5e81ac',
      cellHover: '#434c5e',
      cellSelected: '#4c566a',
      cellPeer: '#3d4657',
      errorBg: '#59363a',
      errorText: '#bf616a',
      hintText: '#a3be8c',
      btnBg: '#434c5e',
      btnHover: '#4c566a',
      shadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
      shadowLight: '0 2px 6px rgba(0, 0, 0, 0.2)',
      diffEasy: '#a3be8c',
      diffMedium: '#ebcb8b',
      diffHard: '#d08770',
      diffExtreme: '#bf616a',
      diffImpossible: '#b48ead',
    },
  },

  // ----------------------------------------
  // CATPPUCCIN
  // https://catppuccin.com/palette
  // ----------------------------------------
  catppuccin: {
    light: {
      bg: '#eff1f5',
      bgSecondary: '#e6e9ef',
      boardBg: '#ffffff',
      text: '#4c4f69',
      textMuted: '#6c6f85',
      textGiven: '#4c4f69',
      border: '#4c4f69',
      borderLight: '#9ca0b0',
      accent: '#8839ef',
      accentMuted: '#dcc6f7',
      cellHover: '#f5f6f9',
      cellSelected: '#dcc6f7',
      cellPeer: '#f3eefa',
      errorBg: '#f5c6ce',
      errorText: '#d20f39',
      hintText: '#40a02b',
      btnBg: '#e6e9ef',
      btnHover: '#dce0e8',
      shadow: '0 4px 12px rgba(76, 79, 105, 0.12)',
      shadowLight: '0 2px 6px rgba(76, 79, 105, 0.06)',
      diffEasy: '#40a02b',
      diffMedium: '#df8e1d',
      diffHard: '#fe640b',
      diffExtreme: '#d20f39',
      diffImpossible: '#8839ef',
    },
    dark: {
      bg: '#1e1e2e',
      bgSecondary: '#181825',
      boardBg: '#24243a',
      text: '#cdd6f4',
      textMuted: '#6c7086',
      textGiven: '#cdd6f4',
      border: '#cdd6f4',
      borderLight: '#45475a',
      accent: '#cba6f7',
      accentMuted: '#6c7086',
      cellHover: '#313244',
      cellSelected: '#45475a',
      cellPeer: '#2c2a42',
      errorBg: '#5c3a4a',
      errorText: '#f38ba8',
      hintText: '#a6e3a1',
      btnBg: '#313244',
      btnHover: '#45475a',
      shadow: DARK_SHADOW,
      shadowLight: DARK_SHADOW_LIGHT,
      diffEasy: '#a6e3a1',
      diffMedium: '#f9e2af',
      diffHard: '#fab387',
      diffExtreme: '#f38ba8',
      diffImpossible: '#cba6f7',
    },
  },

  // ----------------------------------------
  // GRUVBOX
  // https://github.com/morhetz/gruvbox
  // ----------------------------------------
  gruvbox: {
    light: {
      bg: '#fbf1c7',
      bgSecondary: '#f2e5bc',
      boardBg: '#fffdf5',
      text: '#282828',
      textMuted: '#665c54',
      textGiven: '#282828',
      border: '#282828',
      borderLight: '#a89984',
      accent: '#d79921',
      accentMuted: '#e9c46a',
      cellHover: '#faf5e0',
      cellSelected: '#e9c46a',
      cellPeer: '#f7eed8',
      errorBg: '#f5c6c6',
      errorText: '#cc241d',
      hintText: '#79740e',
      btnBg: '#f2e5bc',
      btnHover: '#ebdbb2',
      shadow: '0 4px 12px rgba(40, 40, 40, 0.12)',
      shadowLight: '0 2px 6px rgba(40, 40, 40, 0.06)',
      diffEasy: '#79740e',
      diffMedium: '#b57614',
      diffHard: '#af3a03',
      diffExtreme: '#9d0006',
      diffImpossible: '#8f3f71',
    },
    dark: {
      bg: '#1d2021',
      bgSecondary: '#141617',
      boardBg: '#282828',
      text: '#ebdbb2',
      textMuted: '#928374',
      textGiven: '#ebdbb2',
      border: '#ebdbb2',
      borderLight: '#504945',
      accent: '#fabd2f',
      accentMuted: '#665c54',
      cellHover: '#32302f',
      cellSelected: '#3c3836',
      cellPeer: '#302e28',
      errorBg: '#5a2a2a',
      errorText: '#fb4934',
      hintText: '#b8bb26',
      btnBg: '#32302f',
      btnHover: '#3c3836',
      shadow: DARK_SHADOW,
      shadowLight: DARK_SHADOW_LIGHT,
      diffEasy: '#b8bb26',
      diffMedium: '#fabd2f',
      diffHard: '#fe8019',
      diffExtreme: '#fb4934',
      diffImpossible: '#d3869b',
    },
  },

  // ----------------------------------------
  // ROSÉ PINE
  // https://rosepinetheme.com/palette
  // ----------------------------------------
  rosepine: {
    light: {
      bg: '#faf4ed',
      bgSecondary: '#f2e9e1',
      boardBg: '#fffcf8',
      text: '#575279',
      textMuted: '#797593',
      textGiven: '#575279',
      border: '#575279',
      borderLight: '#9893a5',
      accent: '#d7827e',
      accentMuted: '#f4c6c3',
      cellHover: '#faf5ef',
      cellSelected: '#f4c6c3',
      cellPeer: '#fcf0ee',
      errorBg: '#f5c6ce',
      errorText: '#b4637a',
      hintText: '#286983',
      btnBg: '#f2e9e1',
      btnHover: '#dfdad9',
      shadow: '0 4px 12px rgba(87, 82, 121, 0.12)',
      shadowLight: '0 2px 6px rgba(87, 82, 121, 0.06)',
      diffEasy: '#286983',
      diffMedium: '#ea9d34',
      diffHard: '#d7827e',
      diffExtreme: '#b4637a',
      diffImpossible: '#907aa9',
    },
    dark: {
      bg: '#191724',
      bgSecondary: '#13111d',
      boardBg: '#1f1d2e',
      text: '#e0def4',
      textMuted: '#6e6a86',
      textGiven: '#e0def4',
      border: '#e0def4',
      borderLight: '#524f67',
      accent: '#ebbcba',
      accentMuted: '#524f67',
      cellHover: '#26233a',
      cellSelected: '#524f67',
      cellPeer: '#241f32',
      errorBg: '#5a3040',
      errorText: '#eb6f92',
      hintText: '#9ccfd8',
      btnBg: '#26233a',
      btnHover: '#524f67',
      shadow: DARK_SHADOW,
      shadowLight: DARK_SHADOW_LIGHT,
      diffEasy: '#9ccfd8',
      diffMedium: '#f6c177',
      diffHard: '#ebbcba',
      diffExtreme: '#eb6f92',
      diffImpossible: '#c4a7e7',
    },
  },

  // ----------------------------------------
  // SOLARIZED
  // https://ethanschoonover.com/solarized/
  // ----------------------------------------
  solarized: {
    light: {
      bg: '#fdf6e3',
      bgSecondary: '#eee8d5',
      boardBg: '#fffdf6',
      text: '#657b83',
      textMuted: '#839496',
      textGiven: '#586e75',
      border: '#586e75',
      borderLight: '#93a1a1',
      accent: '#268bd2',
      accentMuted: '#b8d4e8',
      cellHover: '#faf4e4',
      cellSelected: '#b8d4e8',
      cellPeer: '#f5efe0',
      errorBg: '#f5c6c6',
      errorText: '#dc322f',
      hintText: '#859900',
      btnBg: '#eee8d5',
      btnHover: '#dfd9c6',
      shadow: '0 4px 12px rgba(88, 110, 117, 0.12)',
      shadowLight: '0 2px 6px rgba(88, 110, 117, 0.06)',
      diffEasy: '#859900',
      diffMedium: '#b58900',
      diffHard: '#cb4b16',
      diffExtreme: '#dc322f',
      diffImpossible: '#6c71c4',
    },
    dark: {
      bg: '#002b36',
      bgSecondary: '#001e26',
      boardBg: '#073642',
      text: '#839496',
      textMuted: '#586e75',
      textGiven: '#93a1a1',
      border: '#93a1a1',
      borderLight: '#094555',
      accent: '#2aa198',
      accentMuted: '#586e75',
      cellHover: '#0a4a5a',
      cellSelected: '#0d5c6e',
      cellPeer: '#084350',
      errorBg: '#4a2020',
      errorText: '#dc322f',
      hintText: '#859900',
      btnBg: '#0a4a5a',
      btnHover: '#0d5c6e',
      shadow: DARK_SHADOW,
      shadowLight: DARK_SHADOW_LIGHT,
      diffEasy: '#859900',
      diffMedium: '#b58900',
      diffHard: '#cb4b16',
      diffExtreme: '#dc322f',
      diffImpossible: '#6c71c4',
    },
  },

  // ----------------------------------------
  // ONE DARK
  // https://github.com/atom/one-dark-syntax
  // ----------------------------------------
  onedark: {
    light: {
      bg: '#f0f0f1',
      bgSecondary: '#e5e5e6',
      boardBg: '#ffffff',
      text: '#383a42',
      textMuted: '#696c77',
      textGiven: '#383a42',
      border: '#383a42',
      borderLight: '#c5c5c7',
      accent: '#4078f2',
      accentMuted: '#c4d5f7',
      cellHover: '#f5f5f6',
      cellSelected: '#c4d5f7',
      cellPeer: '#eef2fc',
      errorBg: '#f5c6c6',
      errorText: '#e45649',
      hintText: '#50a14f',
      btnBg: '#e5e5e6',
      btnHover: '#d8d8d9',
      shadow: '0 4px 12px rgba(56, 58, 66, 0.12)',
      shadowLight: '0 2px 6px rgba(56, 58, 66, 0.06)',
      diffEasy: '#50a14f',
      diffMedium: '#c18401',
      diffHard: '#e45649',
      diffExtreme: '#ca1243',
      diffImpossible: '#a626a4',
    },
    dark: {
      bg: '#282c34',
      bgSecondary: '#1e2127',
      boardBg: '#2c323c',
      text: '#abb2bf',
      textMuted: '#5c6370',
      textGiven: '#abb2bf',
      border: '#abb2bf',
      borderLight: '#4b5263',
      accent: '#61afef',
      accentMuted: '#5c6370',
      cellHover: '#3a404c',
      cellSelected: '#4d5566',
      cellPeer: '#323842',
      errorBg: '#4a2a2a',
      errorText: '#e06c75',
      hintText: '#98c379',
      btnBg: '#3a404c',
      btnHover: '#4d5566',
      shadow: DARK_SHADOW,
      shadowLight: DARK_SHADOW_LIGHT,
      diffEasy: '#98c379',
      diffMedium: '#e5c07b',
      diffHard: '#d19a66',
      diffExtreme: '#e06c75',
      diffImpossible: '#c678dd',
    },
  },
}

// ============================================================
// VALID THEMES & MIGRATION
// ============================================================

export const VALID_THEMES: ColorTheme[] = [
  'tokyonight',
  'dracula',
  'nord',
  'catppuccin',
  'gruvbox',
  'rosepine',
  'solarized',
  'onedark',
]

export const THEME_MIGRATION: Record<string, ColorTheme> = {
  blue: 'tokyonight',
  indigo: 'tokyonight',
  purple: 'dracula',
  teal: 'nord',
  green: 'nord',
  orange: 'gruvbox',
  pink: 'rosepine',
  red: 'gruvbox',
  classic: 'tokyonight',
}
