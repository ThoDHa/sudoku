import { STORAGE_KEYS, MAX_STORED_SCORES, SECONDS_PER_HOUR, MS_PER_SECOND } from './constants'

export interface Score {
  seed: string
  difficulty: string
  timeMs: number
  hintsUsed: number
  mistakes: number
  completedAt: string // ISO date string
  encodedPuzzle?: string // For custom puzzles - the encoded givens for sharing
  autoFillUsed?: boolean // Whether auto-fill notes was used
  autoSolveUsed?: boolean // Whether auto-solve was used (solves entire puzzle)
}

export function getScores(): Score[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SCORES)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveScore(score: Score): void {
  const scores = getScores()
  scores.unshift(score) // Add to beginning (most recent first)
  // Keep only last MAX_STORED_SCORES scores
  const trimmed = scores.slice(0, MAX_STORED_SCORES)
  localStorage.setItem(STORAGE_KEYS.SCORES, JSON.stringify(trimmed))
}

export function getBestScores(): Record<string, Score> {
  const scores = getScores()
  const best: Record<string, Score> = {}
  
  for (const score of scores) {
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

// Check if a seed is a daily puzzle (date format like YYYY-MM-DD)
function isDailySeed(seed: string): boolean {
  // Daily seeds are dates in format YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(seed)
}

// Generate Wordle-style share text
export function generateShareText(score: Score, puzzleUrl: string): string {
  const difficulty = score.difficulty.charAt(0).toUpperCase() + score.difficulty.slice(1)
  const time = formatTime(score.timeMs)
  
  let text = ''
  
  // Only include date for daily puzzles
  if (isDailySeed(score.seed)) {
    text += `Sudoku ${score.seed}\n`
  } else if (score.difficulty === 'custom') {
    text += `Sudoku (Custom)\n`
  } else {
    text += `Sudoku (Practice)\n`
  }
  
  text += `${difficulty} ⏱️ ${time}`
  
  // Show hints and auto-fill usage if any assists were used
  const assists: string[] = []
  if (score.autoSolveUsed) {
    assists.push(`🤖 auto-solve`)
  } else if (score.hintsUsed > 0) {
    assists.push(`💡 ${score.hintsUsed} hint${score.hintsUsed > 1 ? 's' : ''}`)
  }
  if (score.autoFillUsed) {
    assists.push(`📝 auto-fill`)
  }
  
  if (assists.length > 0) {
    text += ` (${assists.join(', ')})`
  }
  
  text += `\n\n${puzzleUrl}`
  
  return text
}

// Generate puzzle URL for challenge
export function generatePuzzleUrl(score: Score, baseUrl: string): string {
  // For custom puzzles with encoded data, use the /c/ route
  if (score.difficulty === 'custom' && score.encodedPuzzle) {
    return `${baseUrl}/c/${score.encodedPuzzle}`
  }
  // For custom puzzles without encoded data (legacy), don't include a shareable link
  if (score.difficulty === 'custom') {
    return `${baseUrl}/custom`
  }
  return `${baseUrl}/game/${score.seed}?d=${score.difficulty}`
}
