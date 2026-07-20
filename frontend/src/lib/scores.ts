import { STORAGE_KEYS, MAX_STORED_SCORES, SECONDS_PER_HOUR, MS_PER_SECOND } from './constants'
import { getShareBaseUrl } from './shareLinks'
import {
  STORAGE_SCHEMA_VERSION,
  migrateVersionedEnvelope,
  wrapVersionedEnvelope,
  type MigrationMap,
} from './storageMigration'

export interface Score {
  seed: string
  difficulty: string
  timeMs: number
  hintsUsed: number
  techniqueHintsUsed?: number // Technique-only hints (shows technique name, doesn't apply move)
  mistakes?: number
  completedAt: string // ISO date string
  encodedPuzzle?: string // For custom puzzles - encoded givens for sharing
  autoFillUsed?: boolean // Whether auto-fill notes was used
  autoSolveUsed?: boolean // Whether auto-solve was used (solves entire puzzle)
}

const SCORE_MIGRATIONS: MigrationMap<Score[]> = {}

export function getScores(): Score[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SCORES)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    const migrated = migrateVersionedEnvelope<Score[]>(
      parsed,
      SCORE_MIGRATIONS,
      STORAGE_SCHEMA_VERSION,
    )
    return Array.isArray(migrated) ? migrated : []
  } catch {
    return []
  }
}

export function saveScore(score: Score): void {
  const scores = getScores()
  scores.unshift(score) // Add to beginning (most recent first)
  // Keep only last MAX_STORED_SCORES scores
  const trimmed = scores.slice(0, MAX_STORED_SCORES)
  localStorage.setItem(
    STORAGE_KEYS.SCORES,
    JSON.stringify(wrapVersionedEnvelope(trimmed, STORAGE_SCHEMA_VERSION)),
  )
}

// Helper to check if a score used any assists (hints, technique hints, or auto-solve)
function isAssistedScore(score: Score): boolean {
  return score.hintsUsed > 0 || (score.techniqueHintsUsed ?? 0) > 0 || score.autoSolveUsed === true
}

// Get best scores for each difficulty without any assists (pure solves)
export function getBestScoresPure(): Record<string, Score> {
  const scores = getScores()
  const best: Record<string, Score> = {}

  for (const score of scores) {
    // Skip assisted scores
    if (isAssistedScore(score)) continue

    const existing = best[score.difficulty]
    if (!existing || score.timeMs < existing.timeMs) {
      best[score.difficulty] = score
    }
  }

  return best
}

// Get best scores for each difficulty with assists (hints or auto-solve used)
export function getBestScoresAssisted(): Record<string, Score> {
  const scores = getScores()
  const best: Record<string, Score> = {}

  for (const score of scores) {
    // Only include assisted scores
    if (!isAssistedScore(score)) continue

    const existing = best[score.difficulty]
    if (!existing || score.timeMs < existing.timeMs) {
      best[score.difficulty] = score
    }
  }

  return best
}

export function getRecentScores(limit = 10): Score[] {
  return getScores().slice(0, limit)
}

// Format time as M:SS or H:MM:SS
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / MS_PER_SECOND)
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Check if a seed is a daily puzzle (format: daily-YYYY-MM-DD)
export function isDailySeed(seed: string): boolean {
  return /^daily-\d{4}-\d{2}-\d{2}$/.test(seed)
}

// Extract the date from a daily seed (e.g., "daily-2025-01-15" -> "2025-01-15")
export function getDailyDate(seed: string): string | null {
  const match = seed.match(/^daily-(\d{4}-\d{2}-\d{2})$/)
  return match?.[1] ?? null
}

// Generate Wordle-style share text
export function generateShareText(score: Score, puzzleUrl: string, streak?: number): string {
  const difficulty = score.difficulty.charAt(0).toUpperCase() + score.difficulty.slice(1)
  const time = formatTime(score.timeMs)

  let text = ''

  // Include appropriate header based on puzzle type
  const dailyDate = getDailyDate(score.seed)
  if (dailyDate) {
    text += `Daily Sudoku ${dailyDate}\n`
  } else if (score.difficulty === 'custom') {
    text += `Sudoku (Custom)\n`
  } else {
    text += `Sudoku\n`
  }

  text += `${difficulty} ⏱️ ${time}`

  // Show hints and auto-fill usage if any assists were used
  const assists: string[] = []
  if (score.autoSolveUsed) {
    assists.push(`🤖 solved`)
  } else if (score.hintsUsed > 0) {
    assists.push(`💡 ${score.hintsUsed} hint${score.hintsUsed > 1 ? 's' : ''}`)
  }
  const techniqueHints = score.techniqueHintsUsed ?? 0
  if (techniqueHints > 0) {
    assists.push(`❓ ${techniqueHints} technique hint${techniqueHints > 1 ? 's' : ''}`)
  }
  if (score.autoFillUsed) {
    assists.push(`📝 auto-fill`)
  }

  if (assists.length > 0) {
    text += ` (${assists.join(', ')})`
  }

  // Add streak for daily puzzles
  if (dailyDate && streak && streak > 1) {
    text += `\n🔥 ${streak} day streak`
  }

  text += `\n\n${puzzleUrl}`

  return text
}

// Generate puzzle URL for challenge
// Note: We don't include difficulty in the URL - recipient chooses their own difficulty
export function generatePuzzleUrl(score: Score): string {
  const base = getShareBaseUrl()

  // For custom puzzles with encoded data, use the /c/ route
  if (score.difficulty === 'custom' && score.encodedPuzzle) {
    return `${base}/c/${score.encodedPuzzle}`
  }
  if (score.difficulty === 'custom') {
    return `${base}/custom`
  }
  // Share link without difficulty - recipient chooses their own
  return `${base}/${score.seed}`
}

// =============================================================================
// DAILY PUZZLE TRACKING
// =============================================================================

interface DailyStreak {
  currentStreak: number
  longestStreak: number
  lastCompletedDate: string | null // YYYY-MM-DD format
}

const DAILY_STREAK_MIGRATIONS: MigrationMap<DailyStreak> = {}

const DEFAULT_DAILY_STREAK: DailyStreak = {
  currentStreak: 0,
  longestStreak: 0,
  lastCompletedDate: null,
}

/**
 * Get the current UTC date as YYYY-MM-DD string
 */
export function getTodayUTC(): string {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayLocal(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get yesterday's UTC date as YYYY-MM-DD string
 */
function getYesterdayUTC(): string {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 1)
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Narrow an unknown JSON.parse result into a string[] for the completions set,
// so a corrupted entry returns an empty set instead of seeding it with
// non-string values (or, for a string payload, its individual characters).
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

/**
 * Get the set of completed daily dates
 */
export function getDailyCompletions(): Set<string> {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.DAILY_COMPLETIONS)
    if (!data) return new Set()
    const parsed: unknown = JSON.parse(data)
    if (!isStringArray(parsed)) return new Set()
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

/**
 * Check if today's daily puzzle has been completed
 */
export function isTodayCompleted(): boolean {
  const completions = getDailyCompletions()
  return completions.has(getTodayUTC())
}

/**
 * Get the daily streak data
 */
export function getDailyStreak(): DailyStreak {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.DAILY_STREAK)
    // Stryker disable next-line ConditionalExpression: forcing `true` makes JSON.parse(null) yield null, which migrateVersionedEnvelope returns as-is; the subsequent `=== null` check then returns the default streak — the same outcome as the falsy path
    if (data) {
      const parsed: unknown = JSON.parse(data)
      const migrated = migrateVersionedEnvelope<DailyStreak>(
        parsed,
        DAILY_STREAK_MIGRATIONS,
        STORAGE_SCHEMA_VERSION,
      )
      if (migrated === null) return { ...DEFAULT_DAILY_STREAK }
      const streak = migrated
      // Check if streak is still valid (last completed was today or yesterday)
      const today = getTodayUTC()
      const yesterday = getYesterdayUTC()
      if (streak.lastCompletedDate !== today && streak.lastCompletedDate !== yesterday) {
        // Streak is broken
        return {
          currentStreak: 0,
          longestStreak: streak.longestStreak,
          lastCompletedDate: streak.lastCompletedDate,
        }
      }
      return streak
    }
  } catch {
    // Ignore errors
  }
  return { ...DEFAULT_DAILY_STREAK }
}

/**
 * Mark today's daily puzzle as completed and update streak
 */
export function markDailyCompleted(): void {
  const today = getTodayUTC()
  const yesterday = getYesterdayUTC()

  // Add to completions set
  const completions = getDailyCompletions()
  if (completions.has(today)) {
    // Already completed today
    return
  }
  completions.add(today)
  localStorage.setItem(STORAGE_KEYS.DAILY_COMPLETIONS, JSON.stringify([...completions]))

  // Update streak
  const streak = getDailyStreak()
  let newStreak: number

  if (streak.lastCompletedDate === yesterday) {
    // Continuing streak
    newStreak = streak.currentStreak + 1
  } else if (streak.lastCompletedDate === today) {
    // Already counted today
    return
  } else {
    // Starting new streak
    newStreak = 1
  }

  const newLongest = Math.max(streak.longestStreak, newStreak)

  localStorage.setItem(
    STORAGE_KEYS.DAILY_STREAK,
    JSON.stringify(
      wrapVersionedEnvelope(
        { currentStreak: newStreak, longestStreak: newLongest, lastCompletedDate: today },
        STORAGE_SCHEMA_VERSION,
      ),
    ),
  )
}
