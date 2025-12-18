/**
 * Static puzzle data - embedded at build time
 * 
 * This file is auto-generated from puzzles.json and practice_puzzles.json
 * Run: npm run generate-puzzles (or equivalent) to regenerate
 */

// Difficulty key mapping
export const DifficultyKey: Record<string, string> = {
  easy: 'e',
  medium: 'm',
  hard: 'h',
  extreme: 'x',
  impossible: 'i',
}

export const KeyToDifficulty: Record<string, string> = {
  e: 'easy',
  m: 'medium',
  h: 'hard',
  x: 'extreme',
  i: 'impossible',
}

// Compact puzzle format: solution string + given indices per difficulty
export interface CompactPuzzle {
  s: string // solution as 81-char string
  g: Record<string, number[]> // difficulty key -> cell indices to reveal
}

// Practice puzzle reference
export interface PracticePuzzleRef {
  i: number // puzzle index
  d: string // difficulty key
}

// Import the JSON data
import puzzlesJson from '../../puzzles.json'
import practiceJson from '../../practice_puzzles.json'

// Type the imported data
const puzzlesData = puzzlesJson as { puzzles: CompactPuzzle[] }
const practiceData = practiceJson as { techniques: Record<string, PracticePuzzleRef[]> }

/**
 * Get puzzle count
 */
export function getPuzzleCount(): number {
  return puzzlesData.puzzles.length
}

/**
 * Get a puzzle by index and difficulty
 */
export function getPuzzleByIndex(
  index: number,
  difficulty: string
): { givens: number[]; solution: number[] } | null {
  if (index < 0 || index >= puzzlesData.puzzles.length) {
    return null
  }

  const puzzle = puzzlesData.puzzles[index]
  if (!puzzle) {
    return null
  }
  const diffKey = DifficultyKey[difficulty] ?? difficulty

  // Parse solution
  const solution = Array.from(puzzle.s).map((c) => parseInt(c, 10))

  // Get indices for this difficulty
  const indices = puzzle.g[diffKey]
  if (!indices) {
    return null
  }

  // Build givens array (0 for empty cells)
  const givens = new Array(81).fill(0)
  for (const idx of indices) {
    givens[idx] = solution[idx]
  }

  return { givens, solution }
}

/**
 * Hash a string to get a deterministic puzzle index (FNV-1a)
 */
function hashSeed(seed: string): number {
  let hash = 2166136261 // FNV offset basis
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619) // FNV prime
  }
  return Math.abs(hash)
}

/**
 * Get a puzzle by seed and difficulty
 */
export function getPuzzleBySeed(
  seed: string,
  difficulty: string
): { givens: number[]; puzzleIndex: number } | null {
  const count = getPuzzleCount()
  if (count === 0) return null

  const index = hashSeed(seed) % count
  const result = getPuzzleByIndex(index, difficulty)
  if (!result) return null

  return { givens: result.givens, puzzleIndex: index }
}

/**
 * Get a practice puzzle for a technique
 */
export function getPracticePuzzle(
  technique: string
): { givens: number[]; difficulty: string; puzzleIndex: number } | null {
  const refs = practiceData.techniques[technique]
  if (!refs || refs.length === 0) {
    return null
  }

  // Pick one deterministically based on current date (so it changes daily)
  const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  const ref = refs[dayOfYear % refs.length]
  if (!ref) {
    return null
  }

  const difficulty = KeyToDifficulty[ref.d] ?? ref.d
  const result = getPuzzleByIndex(ref.i, difficulty)
  if (!result) return null

  return {
    givens: result.givens,
    difficulty,
    puzzleIndex: ref.i,
  }
}

/**
 * Get all available technique slugs that have practice puzzles
 */
export function getAvailablePracticeTechniques(): string[] {
  return Object.keys(practiceData.techniques)
}
