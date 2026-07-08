import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getGameMode,
  validateSeed,
  extractSeedFromStorageKey,
  createStorageKey,
  seedMatchesMode,
} from './seedValidation'
import { logger } from './logger'
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

// =============================================================================
// MUTATION-KILLING: empty-seed error path + daily-regex anchors
// =============================================================================

describe('validateSeed - empty seed error message', () => {
  it('returns the cannot-be-empty error (not the format error) for an empty seed', () => {
    const result = validateSeed('')
    expect(result.error).toBe('Seed cannot be empty')
    // A mutation that skips the empty check would fall through to getGameMode(''),
    // which returns null, producing the "Invalid seed format" error instead.
    expect(result.error).not.toMatch(/Invalid seed format/)
  })
})

describe('validateSeed - daily date regex anchors', () => {
  it('rejects a daily seed with extra trailing characters after the date', () => {
    const result = validateSeed('daily-2024-01-15extra')
    expect(result.valid).toBe(false)
    expect(result.mode).toBe('daily')
    expect(result.error).toBe('Invalid daily seed format. Expected: daily-YYYY-MM-DD')
  })

  it('rejects a daily seed with extra leading characters before daily-', () => {
    const result = validateSeed('xdaily-2024-01-15')
    // No recognized prefix -> mode is null -> generic format error
    expect(result.valid).toBe(false)
    expect(result.mode).toBeNull()
  })

  it('rejects a daily seed where the date is only a prefix of the tail', () => {
    const result = validateSeed('daily-2024-01-151')
    expect(result.valid).toBe(false)
    expect(result.mode).toBe('daily')
  })

  it('rejects a daily seed with daily-YYYY-MM-DD appearing only as a non-leading substring', () => {
    // getGameMode still classifies this as daily (starts with 'daily-'), so the
    // daily-regex check is reached. The regex's leading anchor (^) is the only
    // thing that rejects this shape; removing it would let the suffix match.
    const result = validateSeed('daily-Xdaily-2024-01-15')
    expect(result.valid).toBe(false)
    expect(result.mode).toBe('daily')
    expect(result.error).toBe('Invalid daily seed format. Expected: daily-YYYY-MM-DD')
  })
})

describe('createStorageKey - debug log on invalid seed', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs the exact invalid-seed debug message before throwing', () => {
    const spy = vi.spyOn(logger, 'debug').mockImplementation(() => {})

    expect(() => createStorageKey('garbage')).toThrow(/Invalid seed/)
    expect(spy).toHaveBeenCalledWith(
      '[SEED VALIDATION] Cannot create storage key for invalid seed: garbage',
      'Invalid seed format. Must start with: daily-, P, practice-, or custom-',
    )

    spy.mockRestore()
  })
})
