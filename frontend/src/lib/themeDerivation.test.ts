import { describe, it, expect } from 'vitest'
import {
  blendColors,
  createSemanticColors,
  themeToCssVars,
  getValidTheme,
  getThemeColors,
} from './themeDerivation'
import { PALETTES, VALID_THEMES, THEME_MIGRATION } from './themes'
import type { Mode, SemanticColors, ThemePalette } from './themes'

// Hand-built high-contrast palette: every channel pair used in a blend differs
// by a wide margin, so a mutant that shifts a ratio or a channel slice moves
// the expected hex by several digits.
const BASE_PALETTE: ThemePalette = {
  bg: '#111111',
  bgSecondary: '#222222',
  boardBg: '#000000',
  text: '#333333',
  textMuted: '#444444',
  textGiven: '#555555',
  border: '#666666',
  borderLight: '#777777',
  accent: '#ffffff',
  accentMuted: '#888888',
  cellHover: '#999999',
  cellSelected: '#aaaaaa',
  cellPeer: '#bbbbbb',
  errorBg: '#cccccc',
  errorText: '#dddddd',
  hintText: '#eeeeee',
  btnBg: '#0f0f0f',
  btnHover: '#1f1f1f',
  shadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  shadowLight: '0 2px 6px rgba(0, 0, 0, 0.25)',
  diffEasy: '#123abc',
  diffMedium: '#234bcd',
  diffHard: '#345acd',
  diffExtreme: '#4567ab',
  diffImpossible: '#5678bc',
}

const MODES: Mode[] = ['light', 'dark']

describe('blendColors', () => {
  it('returns the first colour at ratio 0', () => {
    expect(blendColors('#123456', '#fedcba', 0)).toBe('#123456')
  })

  it('returns the second colour at ratio 1', () => {
    expect(blendColors('#123456', '#fedcba', 1)).toBe('#fedcba')
  })

  it('returns the rounded midpoint at ratio 0.5', () => {
    // r: (0x10 + 0xdf) / 2 = 119.5 -> 120 = 0x78
    // g: (0x20 + 0xef) / 2 = 135.5 -> 136 = 0x88
    // b: (0x30 + 0xff) / 2 = 151.5 -> 152 = 0x98
    expect(blendColors('#102030', '#dfefff', 0.5)).toBe('#788898')
  })

  it('pads a blended channel below 16 to two hex digits', () => {
    // 15 * 0.5 = 7.5 -> Math.round -> 8, which needs the padStart to two digits
    expect(blendColors('#0f0f0f', '#000000', 0.5)).toBe('#080808')
  })

  it('accepts inputs without the leading #', () => {
    expect(blendColors('102030', 'dfefff', 0.5)).toBe('#788898')
  })
})

describe('createSemanticColors', () => {
  it('derives the dark-mode branches from the palette', () => {
    const dark = createSemanticColors(BASE_PALETTE, true)

    // 2% white on #000000: round(255 * 0.02) = 5
    expect(dark.cellGiven).toBe('#050505')
    // 15% accent on #000000: round(255 * 0.15) = 38 = 0x26
    expect(dark.accentLight).toBe('#262626')
    expect(dark.textOnHighlight).toBe(BASE_PALETTE.bg)
    expect(dark.btnActiveText).toBe(BASE_PALETTE.bg)
  })

  it('derives the light-mode branches from the palette', () => {
    const light = createSemanticColors(BASE_PALETTE, false)

    expect(light.cellGiven).toBe(BASE_PALETTE.cellHover)
    // 12% accent on #000000: round(255 * 0.12) = 31 = 0x1f
    expect(light.accentLight).toBe('#1f1f1f')
    expect(light.textOnHighlight).toBe('#ffffff')
    expect(light.btnActiveText).toBe('#ffffff')
  })

  it('distinguishes the 0.15 dark accent ratio from the 0.12 light ratio', () => {
    const dark = createSemanticColors(BASE_PALETTE, true)
    const light = createSemanticColors(BASE_PALETTE, false)

    expect(dark.accentLight).not.toBe(light.accentLight)
  })

  it('passes palette fields through verbatim', () => {
    const colors = createSemanticColors(BASE_PALETTE, true)

    expect(colors.bg).toBe(BASE_PALETTE.bg)
    expect(colors.boardBg).toBe(BASE_PALETTE.boardBg)
    expect(colors.borderStrong).toBe(BASE_PALETTE.border)
    expect(colors.cellPrimary).toBe(BASE_PALETTE.accent)
    expect(colors.textEntered).toBe(BASE_PALETTE.accent)
    expect(colors.hintText).toBe(BASE_PALETTE.hintText)
    expect(colors.diffImpossible).toBe(BASE_PALETTE.diffImpossible)
  })
})

describe('themeToCssVars', () => {
  it('maps each of the 34 tokens to its own variable name, preserving values verbatim', () => {
    const colors: SemanticColors = {
      bg: 'v bg',
      bgSecondary: 'v bgSecondary',
      text: 'v text',
      textMuted: 'v textMuted',
      boardBg: 'v boardBg',
      borderStrong: 'v borderStrong',
      borderLight: 'v borderLight',
      cellBg: 'v cellBg',
      cellGiven: 'v cellGiven',
      cellHover: 'v cellHover',
      cellSelected: 'v cellSelected',
      cellPeer: 'v cellPeer',
      cellPrimary: 'v cellPrimary',
      cellSecondary: 'v cellSecondary',
      textGiven: 'v textGiven',
      textEntered: 'v textEntered',
      textCandidate: 'v textCandidate',
      textOnHighlight: 'v textOnHighlight',
      btnBg: 'v btnBg',
      btnHover: 'v btnHover',
      btnActive: 'v btnActive',
      btnActiveText: 'v btnActiveText',
      accent: 'v accent',
      accentLight: 'v accentLight',
      errorBg: 'v errorBg',
      errorText: 'v errorText',
      hintText: 'v hintText',
      shadow: 'v shadow',
      shadowLight: 'v shadowLight',
      diffEasy: 'v diffEasy',
      diffMedium: 'v diffMedium',
      diffHard: 'v diffHard',
      diffExtreme: 'v diffExtreme',
      diffImpossible: 'v diffImpossible',
    }

    const expected: Record<string, string> = {
      '--bg': 'v bg',
      '--bg-secondary': 'v bgSecondary',
      '--text': 'v text',
      '--text-muted': 'v textMuted',
      '--board-bg': 'v boardBg',
      '--border-strong': 'v borderStrong',
      '--border-light': 'v borderLight',
      '--cell-bg': 'v cellBg',
      '--cell-given': 'v cellGiven',
      '--cell-hover': 'v cellHover',
      '--cell-selected': 'v cellSelected',
      '--cell-peer': 'v cellPeer',
      '--cell-primary': 'v cellPrimary',
      '--cell-secondary': 'v cellSecondary',
      '--text-given': 'v textGiven',
      '--text-entered': 'v textEntered',
      '--text-candidate': 'v textCandidate',
      '--text-on-highlight': 'v textOnHighlight',
      '--btn-bg': 'v btnBg',
      '--btn-hover': 'v btnHover',
      '--btn-active': 'v btnActive',
      '--btn-active-text': 'v btnActiveText',
      '--accent': 'v accent',
      '--accent-light': 'v accentLight',
      '--error-bg': 'v errorBg',
      '--error-text': 'v errorText',
      '--hint-text': 'v hintText',
      '--shadow': 'v shadow',
      '--shadow-light': 'v shadowLight',
      '--diff-easy': 'v diffEasy',
      '--diff-medium': 'v diffMedium',
      '--diff-hard': 'v diffHard',
      '--diff-extreme': 'v diffExtreme',
      '--diff-impossible': 'v diffImpossible',
    }

    expect(Object.keys(themeToCssVars(colors))).toHaveLength(34)
    expect(themeToCssVars(colors)).toEqual(expected)
  })
})

describe('getValidTheme', () => {
  it('returns the default for null and for an empty string', () => {
    expect(getValidTheme(null)).toBe('tokyonight')
    expect(getValidTheme('')).toBe('tokyonight')
  })

  it('passes each valid theme through unchanged', () => {
    for (const theme of VALID_THEMES) {
      expect(getValidTheme(theme)).toBe(theme)
    }
  })

  it('migrates each legacy key to its recorded target', () => {
    for (const [legacy, target] of Object.entries(THEME_MIGRATION)) {
      expect(getValidTheme(legacy)).toBe(target)
    }
  })

  it('returns the default for an unrecognised string', () => {
    expect(getValidTheme('does-not-exist')).toBe('tokyonight')
  })
})

describe('getThemeColors', () => {
  // Captured from the eager THEMES record this accessor replaced, so the lazy
  // path is pinned to the exact bytes the old module-scope derivations produced.
  const ACCENT_LIGHT_ANCHORS: Record<string, string> = {
    'tokyonight:light': '#e6effc',
    'tokyonight:dark': '#2d3652',
    'dracula:light': '#f7f2fe',
    'dracula:dark': '#38334b',
    'nord:light': '#ecf0f5',
    'nord:dark': '#475565',
    'catppuccin:light': '#f1e7fd',
    'catppuccin:dark': '#3d3856',
    'gruvbox:light': '#faf1dc',
    'gruvbox:dark': '#483e29',
    'rosepine:light': '#faede9',
    'rosepine:dark': '#3e3543',
    'solarized:light': '#e5eff2',
    'solarized:dark': '#0c464f',
    'onedark:light': '#e8effd',
    'onedark:dark': '#344557',
  }

  it('returns the same content the eager THEMES record produced for all 16 combinations', () => {
    for (const theme of VALID_THEMES) {
      for (const mode of MODES) {
        expect(getThemeColors(theme, mode)).toEqual(
          createSemanticColors(PALETTES[theme][mode], mode === 'dark'),
        )
      }
    }
  })

  it('matches the recorded accentLight of the old eager record for each combination', () => {
    for (const theme of VALID_THEMES) {
      for (const mode of MODES) {
        expect(getThemeColors(theme, mode).accentLight).toBe(
          ACCENT_LIGHT_ANCHORS[`${theme}:${mode}`],
        )
      }
    }
  })

  it('derives a different colour object for each mode of the same theme', () => {
    for (const theme of VALID_THEMES) {
      expect(getThemeColors(theme, 'light')).not.toEqual(getThemeColors(theme, 'dark'))
    }
  })
})
