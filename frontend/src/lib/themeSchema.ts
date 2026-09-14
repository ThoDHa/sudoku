/**
 * Executable schema validation for the theme data in `themes.ts`.
 *
 * Every rule throws with a message naming the offending entry, so the schema
 * test can drive each validator from two directions: the real tables (which
 * must pass) and hand-built invalid fixtures (which must fail with an exact
 * message). No literal data lives at module scope, so no mutant here can be
 * static; the validators only run when called.
 */

import type { ColorTheme, SemanticColors, ThemePalette } from './themes'

/**
 * Asserts the palette record and the validity list name exactly the same
 * themes, compared as sorted arrays, so the two lists cannot drift apart.
 */
export function validateThemeCoverage(
  paletteKeys: readonly string[],
  validThemes: readonly string[],
): void {
  const sortedPalettes = [...paletteKeys].sort()
  const sortedValid = [...validThemes].sort()
  if (sortedPalettes.length !== sortedValid.length) {
    throw new Error(
      `palette keys [${sortedPalettes.join(', ')}] do not cover the valid themes [${sortedValid.join(', ')}]`,
    )
  }
  sortedPalettes.forEach((key, index) => {
    if (key !== sortedValid[index]) {
      throw new Error(
        `palette keys [${sortedPalettes.join(', ')}] do not cover the valid themes [${sortedValid.join(', ')}]`,
      )
    }
  })
}

/**
 * Asserts a derived colour object carries exactly the canonical token list,
 * with neither a missing nor an extra key.
 */
export function validateSemanticTokens(
  colors: SemanticColors,
  canonicalTokens: readonly string[],
  label: string,
): void {
  const actual = Object.keys(colors).sort()
  const expected = [...canonicalTokens].sort()
  if (actual.length !== expected.length) {
    throw new Error(
      `${label}: derived token count ${actual.length} does not match the canonical ${expected.length}`,
    )
  }
  actual.forEach((token, index) => {
    if (token !== expected[index]) {
      throw new Error(`${label}: unexpected token ${token}, expected ${expected[index]}`)
    }
  })
}

/**
 * Asserts every derived value is non-empty, and is a hex colour unless the
 * token is one of the two CSS shadow strings, which must carry a length unit.
 */
export function validateColorValues(colors: SemanticColors, label: string): void {
  const tokens = Object.keys(colors)
  if (tokens.length === 0) {
    throw new Error(`${label}: no derived tokens to validate`)
  }
  const hexPattern = /^#[0-9a-f]{6}$/i
  for (const token of tokens) {
    const value = colors[token as keyof SemanticColors]
    if (value.length === 0) {
      throw new Error(`${label}: ${token} is empty`)
    }
    if (token === 'shadow' || token === 'shadowLight') {
      if (!value.includes('px')) {
        throw new Error(`${label}: ${token} must contain a length unit, found ${value}`)
      }
    } else if (!hexPattern.test(value)) {
      throw new Error(`${label}: ${token} must be a hex colour, found ${value}`)
    }
  }
}

/**
 * Asserts a palette carries every required field with a non-empty value.
 */
export function validatePalette(
  palette: ThemePalette,
  requiredFields: readonly string[],
  label: string,
): void {
  if (requiredFields.length === 0) {
    throw new Error(`${label}: no required palette fields supplied`)
  }
  for (const field of requiredFields) {
    const value = palette[field as keyof ThemePalette]
    if (value === undefined || value.length === 0) {
      throw new Error(`${label}: palette field ${field} is empty or missing`)
    }
  }
}

/**
 * Asserts a css-variable key list has the expected size, no duplicates and
 * every name prefixed with `--`.
 */
export function validateCssVarKeys(keys: readonly string[], expectedCount: number): void {
  if (keys.length !== expectedCount) {
    throw new Error(`css variables: expected ${expectedCount} entries, found ${keys.length}`)
  }
  if (new Set(keys).size !== keys.length) {
    throw new Error('css variables: duplicate variable names')
  }
  for (const key of keys) {
    if (!key.startsWith('--')) {
      throw new Error(`css variables: ${key} does not start with --`)
    }
  }
}

/**
 * Asserts every migration target is a valid theme and no migration key is
 * itself valid, which would make the entry unreachable in getValidTheme.
 */
export function validateMigrationTable(
  migration: Record<string, ColorTheme>,
  validThemes: readonly string[],
): void {
  const entries = Object.entries(migration)
  if (entries.length === 0) {
    throw new Error('theme migration: the migration table is empty')
  }
  const validSet = new Set(validThemes)
  for (const [legacy, target] of entries) {
    if (!validSet.has(target)) {
      throw new Error(
        `theme migration: target ${target} of legacy key ${legacy} is not a valid theme`,
      )
    }
    if (validSet.has(legacy)) {
      throw new Error(
        `theme migration: legacy key ${legacy} is itself a valid theme, so the entry is unreachable`,
      )
    }
  }
}
