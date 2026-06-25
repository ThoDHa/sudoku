import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getGameMode,
  validateSeed,
  extractSeedFromStorageKey,
  createStorageKey,
  seedMatchesMode,
} from './seedValidation'
import { STORAGE_KEYS } from './constants'

const PREFIX = STORAGE_KEYS.GAME_STATE_PREFIX

describe('getGameMode', () => {
  it('returns null for an empty seed', () => {
    expect(getGameMode('')).toBeNull()
  })

  it('returns daily for a seed starting with daily-', () => {
    expect(getGameMode('daily-2024-01-01')).toBe('daily')
  })

  it('returns practice for a seed starting with uppercase P', () => {
    expect(getGameMode('P123')).toBe('practice')
  })

  it('returns practice for a seed starting with practice-', () => {
    expect(getGameMode('practice-456')).toBe('practice')
  })

  it('returns custom for a seed starting with custom-', () => {
    expect(getGameMode('custom-board')).toBe('custom')
  })

  it('returns null for an unrecognized seed prefix', () => {
    expect(getGameMode('garbage')).toBeNull()
  })
})

describe('validateSeed', () => {
  it('rejects an empty seed with a cannot-be-empty error', () => {
    const result = validateSeed('')
    expect(result.valid).toBe(false)
    expect(result.mode).toBeNull()
    expect(result.error).toBe('Seed cannot be empty')
  })

  it('rejects a seed with no recognized mode prefix', () => {
    const result = validateSeed('garbage')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/Invalid seed format/)
  })

  it('accepts a well-formed daily seed', () => {
    const result = validateSeed('daily-2024-03-15')
    expect(result.valid).toBe(true)
    expect(result.mode).toBe('daily')
    expect(result.error).toBeUndefined()
  })

  it('rejects a daily seed that does not match the date format', () => {
    const result = validateSeed('daily-foo')
    expect(result.valid).toBe(false)
    expect(result.mode).toBe('daily')
    expect(result.error).toBe('Invalid daily seed format. Expected: daily-YYYY-MM-DD')
  })

  it('accepts a practice seed starting with uppercase P', () => {
    const result = validateSeed('P999')
    expect(result.valid).toBe(true)
    expect(result.mode).toBe('practice')
  })

  it('accepts a practice seed using the practice- prefix', () => {
    const result = validateSeed('practice-42')
    expect(result.valid).toBe(true)
    expect(result.mode).toBe('practice')
  })

  it('accepts a custom seed', () => {
    const result = validateSeed('custom-anything')
    expect(result.valid).toBe(true)
    expect(result.mode).toBe('custom')
  })
})

describe('extractSeedFromStorageKey', () => {
  it('rejects a storage key that does not use the game-state prefix', () => {
    const result = extractSeedFromStorageKey('other_key')
    expect(result.valid).toBe(false)
    expect(result.seed).toBe('')
    expect(result.error).toContain(PREFIX)
  })

  it('extracts and validates a well-formed daily seed key', () => {
    const result = extractSeedFromStorageKey(`${PREFIX}daily-2024-01-01`)
    expect(result.valid).toBe(true)
    expect(result.seed).toBe('daily-2024-01-01')
  })

  it('reports the underlying error when the extracted seed is invalid', () => {
    const result = extractSeedFromStorageKey(`${PREFIX}daily-broken`)
    expect(result.valid).toBe(false)
    expect(result.seed).toBe('daily-broken')
    expect(result.error).toBe('Invalid daily seed format. Expected: daily-YYYY-MM-DD')
  })
})

describe('createStorageKey', () => {
  it('builds a prefixed key for a valid seed', () => {
    expect(createStorageKey('P1')).toBe(`${PREFIX}P1`)
  })

  it('throws when given an invalid seed', () => {
    expect(() => createStorageKey('garbage')).toThrowError(/Invalid seed/)
  })
})

describe('seedMatchesMode', () => {
  it('returns true when the seed mode matches the expected mode', () => {
    expect(seedMatchesMode('daily-2024-01-01', 'daily')).toBe(true)
  })

  it('returns false when the seed mode differs from the expected mode', () => {
    expect(seedMatchesMode('P1', 'daily')).toBe(false)
  })

  it('returns false when the seed has no recognizable mode', () => {
    expect(seedMatchesMode('garbage', 'daily')).toBe(false)
  })
})
