// Shared constants for the application

// =============================================================================
// GRID CONSTANTS
// =============================================================================
export const MIN_GIVENS = 17

// =============================================================================
// TIMING CONSTANTS (milliseconds)
// =============================================================================
export const PLAY_DELAY = 25
export const TIMER_UPDATE_INTERVAL = 1000  // Reduced from 100ms to 1000ms for battery savings
export const TOAST_DURATION_SUCCESS = 2000
export const TOAST_DURATION_INFO = 3000
export const TOAST_DURATION_ERROR = 4000
export const TOAST_DURATION_FIX_ERROR = 2000
export const HISTORY_SCROLL_DELAY = 50

// =============================================================================
// TIME CONVERSION
// =============================================================================
export const MS_PER_SECOND = 1000
export const SECONDS_PER_MINUTE = 60
export const SECONDS_PER_HOUR = 3600

// =============================================================================
// STORAGE KEYS
// =============================================================================
export const STORAGE_KEYS = {
  SCORES: 'sudoku_scores',
  PREFERENCES: 'sudoku_preferences',
  LAST_DAILY_DIFFICULTY: 'lastDailyDifficulty',
  COLOR_THEME: 'colorTheme',
  MODE: 'mode',
  FONT_SIZE: 'fontSize',
  DEVICE_ID: 'deviceId',
  CUSTOM_PUZZLE_PREFIX: 'custom_puzzle_',
  GAME_STATE_PREFIX: 'sudoku_game_',
  ONBOARDING_COMPLETE: 'sudoku_onboarding_complete',
  DAILY_COMPLETIONS: 'sudoku_daily_completions',
  DAILY_STREAK: 'sudoku_daily_streak',
} as const

// =============================================================================
// SCORES
// =============================================================================
export const MAX_STORED_SCORES = 100

// =============================================================================
// UI CONSTANTS
// =============================================================================
export const MAX_HISTORY_BADGE_COUNT = 99

// =============================================================================
// DIFFICULTIES & TIERS
// =============================================================================
export const TIERS = ['Simple', 'Medium', 'Hard'] as const
export type Tier = (typeof TIERS)[number]

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'extreme', 'impossible'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

// Tier colors for technique badges
export const TIER_COLORS: Record<string, string> = {
  simple: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  hard: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  auto: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
}

// Technique-specific colors for history view (more granular than tier)
export const TECHNIQUE_COLORS: Record<string, string> = {
  'Naked Single': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'Hidden Single': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'Pointing Pair': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Box-Line Reduction': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Naked Pair': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'Hidden Pair': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'Naked Triple': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Hidden Triple': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Naked Quad': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Hidden Quad': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'X-Wing': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'Swordfish': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'Jellyfish': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'XY-Wing': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'W-Wing': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'Simple Coloring': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'Skyscraper': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'X-Chain': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'XY-Chain': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'Unique Rectangle': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'BUG': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'Finned X-Wing': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'Empty Rectangle': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
}

export function getTierColor(tier: string): string {
  return TIER_COLORS[tier.toLowerCase()] ?? TIER_COLORS['auto'] ?? ''
}

export function getTechniqueColor(technique: string): string {
  return TECHNIQUE_COLORS[technique] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
}

// =============================================================================
// NAVIGATION UTILITIES
// =============================================================================
export function generatePuzzleSeed(): string {
  return `P${Date.now()}`
}

export function createGameRoute(difficulty: string): string {
  return `/game/${generatePuzzleSeed()}?d=${difficulty}`
}
