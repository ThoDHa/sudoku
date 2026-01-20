import { STORAGE_KEYS } from './constants'
import { debugLog } from './debug'

/**
 * Seed Validation and Normalization
 *
 * Ensures seeds are valid and in correct format before using them.
 * Prevents corruption issues and provides clear error messages.
 */

export interface SeedValidationResult {
  valid: boolean
  seed: string
  mode: 'daily' | 'practice' | 'custom' | null
  error?: string
}

/**
 * Get game mode from seed
 */
export function getGameMode(seed: string): 'daily' | 'practice' | 'custom' | null {
  if (!seed) return null
  
  if (seed.startsWith('daily-')) return 'daily'
  if (seed.startsWith('P') || seed.startsWith('practice-')) return 'practice'
  if (seed.startsWith('custom-')) return 'custom'
  
  return null
}

/**
 * Validate seed format and provide detailed error if invalid
 */
export function validateSeed(seed: string): SeedValidationResult {
  if (!seed || seed.length === 0) {
    return {
      valid: false,
      seed,
      mode: null,
      error: 'Seed cannot be empty',
    }
  }
  
  const mode = getGameMode(seed)
  
  if (!mode) {
    return {
      valid: false,
      seed,
      mode: null,
      error: 'Invalid seed format. Must start with: daily-, P, practice-, or custom-',
    }
  }
  
  // Additional validation for specific modes
  if (mode === 'daily') {
    const dailyMatch = seed.match(/^daily-\d{4}-\d{2}-\d{2}$/)
    if (!dailyMatch) {
      return {
        valid: false,
        seed,
        mode: 'daily',
        error: 'Invalid daily seed format. Expected: daily-YYYY-MM-DD',
      }
    }
  }
  
  if (mode === 'practice' && !seed.startsWith('P')) {
    return {
      valid: false,
      seed,
      mode: 'practice',
      error: 'Invalid practice seed format. Must start with: P',
    }
  }
  
  return {
    valid: true,
    seed,
    mode,
    error: undefined,
  }
}

/**
 * Extract seed from localStorage key with validation
 * This is the core function that had the slice bug
 */
export function extractSeedFromStorageKey(storageKey: string): { seed: string; valid: boolean; error?: string } {
  const prefix = STORAGE_KEYS.GAME_STATE_PREFIX
  
  // Defensive: Check if key actually starts with expected prefix
  if (!storageKey.startsWith(prefix)) {
    return {
      seed: '',
      valid: false,
      error: `Invalid storage key format. Expected prefix: ${prefix}`,
    }
  }
  
  // Extract seed
  const seed = storageKey.slice(prefix.length)
  
  // Validate extracted seed
  const validation = validateSeed(seed)
  
  if (!validation.valid) {
    return {
      seed,
      valid: false,
      error: validation.error,
    }
  }
  
  const result: SeedValidationResult = {
    seed,
    valid: true,
    mode: validation.mode,
  }
  
  if (validation.error) {
    result.error = validation.error
  }
  
  return result
}

/**
 * Create safe storage key from seed
 * This ensures we never create invalid keys
 */
export function createStorageKey(seed: string): string {
  const validation = validateSeed(seed)

  if (!validation.valid) {
    // If seed is invalid, don't create a key
    debugLog(`[SEED VALIDATION] Cannot create storage key for invalid seed: ${seed}`, validation.error)
    throw new Error(`Invalid seed: ${validation.error}`)
  }

  return `${STORAGE_KEYS.GAME_STATE_PREFIX}${seed}`
}

/**
 * Check if a seed matches expected game mode
 * Useful for debugging and validation
 */
export function seedMatchesMode(seed: string, expectedMode: 'daily' | 'practice' | 'custom'): boolean {
  const mode = getGameMode(seed)
  return mode === expectedMode
}
