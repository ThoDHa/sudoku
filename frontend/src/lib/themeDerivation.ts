/**
 * Theme derivation logic for the Sudoku app.
 *
 * Everything here is pure derivation from the palette data in `themes.ts`:
 * palette → semantic colours, semantic colours → CSS variables, and saved
 * theme name → valid theme. Nothing runs at module load; `getThemeColors`
 * derives on call so mutants here are covered per test rather than statically.
 */

import { PALETTES, VALID_THEMES, THEME_MIGRATION } from './themes'
import type { ColorTheme, Mode, SemanticColors, ThemePalette } from './themes'

/**
 * Blends two hex colors at a given ratio.
 * ratio = 0 returns color1, ratio = 1 returns color2
 */
export function blendColors(color1: string, color2: string, ratio: number): string {
  const hex = (c: string) => parseInt(c, 16)
  const c1 = color1.replace('#', '')
  const c2 = color2.replace('#', '')

  const r = Math.round(hex(c1.slice(0, 2)) * (1 - ratio) + hex(c2.slice(0, 2)) * ratio)
  const g = Math.round(hex(c1.slice(2, 4)) * (1 - ratio) + hex(c2.slice(2, 4)) * ratio)
  const b = Math.round(hex(c1.slice(4, 6)) * (1 - ratio) + hex(c2.slice(4, 6)) * ratio)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Creates semantic colors from a theme palette.
 * This is the SINGLE source of truth for how palette → semantic mapping works.
 * All themes use the same logic.
 */
export function createSemanticColors(p: ThemePalette, isDark: boolean): SemanticColors {
  // cellGiven: Light mode uses cellHover, dark mode uses very subtle 2% lighter blend
  const cellGiven = isDark ? blendColors(p.boardBg, '#ffffff', 0.02) : p.cellHover

  // accentLight: Subtle accent wash for digit matching highlights
  // Lighter than accentMuted to contrast with candidate highlights
  const accentLight = isDark
    ? blendColors(p.boardBg, p.accent, 0.15) // 15% accent on dark bg
    : blendColors(p.boardBg, p.accent, 0.12) // 12% accent on light bg

  return {
    // Backgrounds
    bg: p.bg,
    bgSecondary: p.bgSecondary,

    // Text
    text: p.text,
    textMuted: p.textMuted,

    // Board
    boardBg: p.boardBg,
    borderStrong: p.border,
    borderLight: p.borderLight,

    // Cells - cellGiven: light uses cellHover, dark uses subtle blend
    cellBg: p.boardBg,
    cellGiven: cellGiven,
    cellHover: p.cellHover,
    cellSelected: p.cellSelected,
    cellPeer: p.cellPeer,
    cellPrimary: p.accent,
    cellSecondary: p.accentMuted,

    // Text
    textGiven: p.textGiven,
    textEntered: p.accent,
    textCandidate: p.accent,
    textOnHighlight: isDark ? p.bg : '#ffffff',

    // Buttons
    btnBg: p.btnBg,
    btnHover: p.btnHover,
    btnActive: p.accent,
    btnActiveText: isDark ? p.bg : '#ffffff',

    // Accent
    accent: p.accent,
    accentLight: accentLight,

    // Errors
    errorBg: p.errorBg,
    errorText: p.errorText,

    // Hints
    hintText: p.hintText,

    // Shadows
    shadow: p.shadow,
    shadowLight: p.shadowLight,

    // Difficulty colors
    diffEasy: p.diffEasy,
    diffMedium: p.diffMedium,
    diffHard: p.diffHard,
    diffExtreme: p.diffExtreme,
    diffImpossible: p.diffImpossible,
  }
}

/**
 * Derives the semantic colours for one theme and mode on demand, replacing the
 * eager THEMES record that ran createSemanticColors 16 times at module load.
 */
export function getThemeColors(theme: ColorTheme, mode: Mode): SemanticColors {
  return createSemanticColors(PALETTES[theme][mode], mode === 'dark')
}

/**
 * Converts semantic colors to CSS custom property names.
 */
export function themeToCssVars(colors: SemanticColors): Record<string, string> {
  return {
    '--bg': colors.bg,
    '--bg-secondary': colors.bgSecondary,
    '--text': colors.text,
    '--text-muted': colors.textMuted,
    '--board-bg': colors.boardBg,
    '--border-strong': colors.borderStrong,
    '--border-light': colors.borderLight,
    '--cell-bg': colors.cellBg,
    '--cell-given': colors.cellGiven,
    '--cell-hover': colors.cellHover,
    '--cell-selected': colors.cellSelected,
    '--cell-peer': colors.cellPeer,
    '--cell-primary': colors.cellPrimary,
    '--cell-secondary': colors.cellSecondary,
    '--text-given': colors.textGiven,
    '--text-entered': colors.textEntered,
    '--text-candidate': colors.textCandidate,
    '--text-on-highlight': colors.textOnHighlight,
    '--btn-bg': colors.btnBg,
    '--btn-hover': colors.btnHover,
    '--btn-active': colors.btnActive,
    '--btn-active-text': colors.btnActiveText,
    '--accent': colors.accent,
    '--accent-light': colors.accentLight,
    '--error-bg': colors.errorBg,
    '--error-text': colors.errorText,
    '--hint-text': colors.hintText,
    '--shadow': colors.shadow,
    '--shadow-light': colors.shadowLight,
    '--diff-easy': colors.diffEasy,
    '--diff-medium': colors.diffMedium,
    '--diff-hard': colors.diffHard,
    '--diff-extreme': colors.diffExtreme,
    '--diff-impossible': colors.diffImpossible,
  }
}

/**
 * Validates a saved theme name and migrates legacy names to their replacements.
 * Unknown names fall back to the default theme.
 */
export function getValidTheme(saved: string | null): ColorTheme {
  if (VALID_THEMES.includes(saved as ColorTheme)) {
    return saved as ColorTheme
  }

  const migrated = THEME_MIGRATION[String(saved)]
  if (migrated) {
    return migrated
  }

  return 'tokyonight'
}
