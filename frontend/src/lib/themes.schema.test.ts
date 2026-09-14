import { describe, it, expect } from 'vitest'
import { getThemeColors, themeToCssVars } from './themeDerivation'
import { PALETTES, VALID_THEMES, THEME_MIGRATION } from './themes'
import type { ColorTheme, Mode, SemanticColors, ThemePalette } from './themes'
import {
  validateThemeCoverage,
  validateSemanticTokens,
  validateColorValues,
  validatePalette,
  validateCssVarKeys,
  validateMigrationTable,
} from './themeSchema'

const MODES: Mode[] = ['light', 'dark']
const THEME_KEYS = Object.keys(PALETTES) as ColorTheme[]
const REQUIRED_PALETTE_FIELDS = Object.keys(PALETTES.tokyonight.light)

// The canonical token list is derived from one concrete derived theme inside
// the tests, never at module scope, so a token added to SemanticColors
// without being wired through themeToCssVars breaks the length and count
// assertions below and the derivation code keeps per-test coverage
// attribution instead of being executed during module evaluation.
function canonicalTokens(): string[] {
  return Object.keys(getThemeColors(THEME_KEYS[0]!, 'light'))
}

function expectExactThrow(fn: () => void, message: string): void {
  let thrown: unknown
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(Error)
  expect((thrown as Error).message).toBe(message)
}

describe('theme schema: real data', () => {
  it('holds 8 themes, 2 modes, 34 tokens, 25 palette fields and 9 migrations before iterating', () => {
    expect(VALID_THEMES).toHaveLength(8)
    expect(THEME_KEYS).toHaveLength(8)
    expect(MODES).toHaveLength(2)
    expect(canonicalTokens()).toHaveLength(34)
    expect(REQUIRED_PALETTE_FIELDS).toHaveLength(25)
    expect(Object.keys(THEME_MIGRATION)).toHaveLength(9)
  })

  it('keeps the palette keys and VALID_THEMES as the same sorted 8 members', () => {
    expect(() => validateThemeCoverage(THEME_KEYS, VALID_THEMES)).not.toThrow()
  })

  it('derives the canonical 34 tokens with valid values for all 16 combinations', () => {
    const canonical = canonicalTokens()
    expect(Object.keys(themeToCssVars(getThemeColors(THEME_KEYS[0]!, 'light'))).length).toBe(
      canonical.length,
    )
    for (const theme of THEME_KEYS) {
      for (const mode of MODES) {
        const colors = getThemeColors(theme, mode)
        expect(() => validateSemanticTokens(colors, canonical, `${theme}/${mode}`)).not.toThrow()
        expect(() => validateColorValues(colors, `${theme}/${mode}`)).not.toThrow()
      }
    }
  })

  it('carries all 25 palette fields with non-empty values in all 16 palettes', () => {
    for (const theme of THEME_KEYS) {
      for (const mode of MODES) {
        expect(() =>
          validatePalette(PALETTES[theme][mode], REQUIRED_PALETTE_FIELDS, `${theme}/${mode}`),
        ).not.toThrow()
      }
    }
  })

  it('maps the derived colours to 34 unique --prefixed css variables', () => {
    const cssVars = themeToCssVars(getThemeColors('tokyonight', 'dark'))
    expect(() => validateCssVarKeys(Object.keys(cssVars), 34)).not.toThrow()
  })

  it('keeps every migration target valid and no migration key valid', () => {
    expect(() => validateMigrationTable(THEME_MIGRATION, VALID_THEMES)).not.toThrow()
  })
})

describe('theme schema: negative fixtures', () => {
  it('rejects palette keys that miss a valid theme', () => {
    expectExactThrow(
      () => validateThemeCoverage(['tokyonight'], ['tokyonight', 'dracula']),
      'palette keys [tokyonight] do not cover the valid themes [dracula, tokyonight]',
    )
  })

  it('rejects palette keys that hold an unknown theme', () => {
    expectExactThrow(
      () => validateThemeCoverage(['nord', 'tokyonight'], ['dracula', 'tokyonight']),
      'palette keys [nord, tokyonight] do not cover the valid themes [dracula, tokyonight]',
    )
  })

  it('rejects palette keys that form a prefix of the valid themes', () => {
    expectExactThrow(
      () => validateThemeCoverage(['dracula', 'nord'], ['dracula', 'nord', 'tokyonight']),
      'palette keys [dracula, nord] do not cover the valid themes [dracula, nord, tokyonight]',
    )
  })

  it('rejects derived colours with a missing token', () => {
    const colors = { bg: '#111111' } as unknown as SemanticColors
    expectExactThrow(
      () => validateSemanticTokens(colors, ['bg', 'accent'], 'fixture'),
      'fixture: derived token count 1 does not match the canonical 2',
    )
  })

  it('rejects derived colours with an unexpected token', () => {
    const colors = { bg: '#111111', bogus: '#222222' } as unknown as SemanticColors
    // sorted actual [bg, bogus] against sorted canonical [accent, bg]: the
    // first index already differs, and the message names the actual token.
    expectExactThrow(
      () => validateSemanticTokens(colors, ['bg', 'accent'], 'fixture'),
      'fixture: unexpected token bg, expected accent',
    )
  })

  it('rejects a non-hex colour value', () => {
    const colors = { bg: 'red' } as unknown as SemanticColors
    expectExactThrow(
      () => validateColorValues(colors, 'fixture'),
      'fixture: bg must be a hex colour, found red',
    )
  })

  it('rejects a colour value with junk before the hex digits', () => {
    const colors = { bg: 'x#ffffff' } as unknown as SemanticColors
    expectExactThrow(
      () => validateColorValues(colors, 'fixture'),
      'fixture: bg must be a hex colour, found x#ffffff',
    )
  })

  it('rejects a colour value with trailing characters after the hex digits', () => {
    const colors = { bg: '#ffffff0' } as unknown as SemanticColors
    expectExactThrow(
      () => validateColorValues(colors, 'fixture'),
      'fixture: bg must be a hex colour, found #ffffff0',
    )
  })

  it('rejects an empty colour value', () => {
    const colors = { bg: '' } as unknown as SemanticColors
    expectExactThrow(() => validateColorValues(colors, 'fixture'), 'fixture: bg is empty')
  })

  it('rejects a shadow without a length unit', () => {
    const colors = { shadow: 'sudden' } as unknown as SemanticColors
    expectExactThrow(
      () => validateColorValues(colors, 'fixture'),
      'fixture: shadow must contain a length unit, found sudden',
    )
  })

  it('rejects an empty shadowLight', () => {
    const colors = { shadowLight: '' } as unknown as SemanticColors
    expectExactThrow(() => validateColorValues(colors, 'fixture'), 'fixture: shadowLight is empty')
  })

  it('rejects an empty derived-colours object', () => {
    const colors = {} as unknown as SemanticColors
    expectExactThrow(
      () => validateColorValues(colors, 'fixture'),
      'fixture: no derived tokens to validate',
    )
  })

  it('rejects a palette with a missing required field', () => {
    const palette = { accent: '#ffffff' } as unknown as ThemePalette
    expectExactThrow(
      () => validatePalette(palette, ['bg', 'accent'], 'fixture'),
      'fixture: palette field bg is empty or missing',
    )
  })

  it('rejects a palette with an empty required field', () => {
    const palette = { bg: '', accent: '#ffffff' } as unknown as ThemePalette
    expectExactThrow(
      () => validatePalette(palette, ['bg', 'accent'], 'fixture'),
      'fixture: palette field bg is empty or missing',
    )
  })

  it('rejects an empty required-field list', () => {
    const palette = { bg: '#111111' } as unknown as ThemePalette
    expectExactThrow(
      () => validatePalette(palette, [], 'fixture'),
      'fixture: no required palette fields supplied',
    )
  })

  it('rejects css variables with an unexpected count', () => {
    expectExactThrow(
      () => validateCssVarKeys(['--bg', '--text'], 3),
      'css variables: expected 3 entries, found 2',
    )
  })

  it('rejects duplicate css variable names', () => {
    expectExactThrow(
      () => validateCssVarKeys(['--bg', '--bg'], 2),
      'css variables: duplicate variable names',
    )
  })

  it('rejects a css variable name without the -- prefix', () => {
    expectExactThrow(
      () => validateCssVarKeys(['--bg', 'text'], 2),
      'css variables: text does not start with --',
    )
  })

  it('rejects a migration target that is not a valid theme', () => {
    const migration = { blue: 'vanishes' } as unknown as Record<string, ColorTheme>
    expectExactThrow(
      () => validateMigrationTable(migration, ['tokyonight', 'dracula']),
      'theme migration: target vanishes of legacy key blue is not a valid theme',
    )
  })

  it('rejects a migration key that shadows a valid theme', () => {
    expectExactThrow(
      () => validateMigrationTable({ dracula: 'tokyonight' }, ['tokyonight', 'dracula']),
      'theme migration: legacy key dracula is itself a valid theme, so the entry is unreachable',
    )
  })

  it('rejects an empty migration table', () => {
    expectExactThrow(
      () => validateMigrationTable({}, ['tokyonight']),
      'theme migration: the migration table is empty',
    )
  })
})
