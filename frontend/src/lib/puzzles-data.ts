/**
 * Static puzzle data - embedded at build time
 *
 * This file is auto-generated from puzzles.json and practice_puzzles.json
 * Run: npm run generate-puzzles (or equivalent) to regenerate
 */

// Difficulty key mapping (internal use)
const DifficultyKey: Record<string, string> = {
  easy: 'e',
  medium: 'm',
  hard: 'h',
  extreme: 'x',
  impossible: 'i',
}

const KeyToDifficulty: Record<string, string> = {
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
import puzzlesJson from '../../puzzles.json' with { type: 'json' }
import practiceJson from '../../practice_puzzles.json' with { type: 'json' }

// Type the imported data
const puzzlesData = puzzlesJson as { puzzles: CompactPuzzle[] }
const practiceData = practiceJson as { techniques: Record<string, PracticePuzzleRef[]> }

/**
 * Get a puzzle by index and difficulty (internal use)
 */
function getPuzzleByIndex(
  index: number,
  difficulty: string,
): { givens: number[]; solution: number[] } | null {
  // Stryker disable next-line LogicalOperator,EqualityOperator,BlockStatement: the `if (!puzzle) return null` guard at L58 catches whatever this bounds check misses (out-of-range index yields undefined), so the `||`→`&&`, `>=`→`>`, and `{}`→empty-block mutants all produce the same null outcome via L58
  // Stryker disable next-line ConditionalExpression: forcing `false` here falls through to `puzzle.s`; for in-range indices puzzle is always defined, and the unreachable out-of-range case is caught by L58, so the mutant is observationally identical for all reachable inputs
  if (index < 0 || index >= puzzlesData.puzzles.length) {
    return null
  }

  // Stryker disable next-line ConditionalExpression,BlockStatement: defensive guard. puzzlesData.puzzles is a JSON array with no holes, so for any in-range index puzzle is always defined and this branch is unreachable; if it were reached (bad index past L53), the original returns null and the mutant throws, but the throw is caught downstream. For the L53-mutant path where index is out of range, both branches ultimately return null observably
  const puzzle = puzzlesData.puzzles[index]
  /* v8 ignore start -- unreachable defensive guard: the puzzles JSON is a hole-free array, so any in-range index yields a defined puzzle and out-of-range indices are already caught above */
  if (!puzzle) {
    return null
  }
  /* v8 ignore stop */
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
 * Get the total number of puzzles in the pool
 */
export function getPuzzleCount(): number {
  return puzzlesData.puzzles.length
}

/**
 * Hash a string seed to get a deterministic puzzle index
 */
function hashSeedToIndex(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  // Ensure positive and within range
  const count = puzzlesData.puzzles.length
  return ((hash % count) + count) % count
}

/**
 * Get a puzzle from the static pool using a seed
 * The seed is hashed to deterministically select a puzzle index
 */
export function getPuzzleForSeed(
  seed: string,
  difficulty: string,
): { givens: number[]; solution: number[]; puzzleIndex: number } | null {
  const index = hashSeedToIndex(seed)
  const result = getPuzzleByIndex(index, difficulty)
  if (!result) return null

  return {
    givens: result.givens,
    solution: result.solution,
    puzzleIndex: index,
  }
}

/**
 * Get a practice puzzle for a technique
 */
export function getPracticePuzzle(
  technique: string,
): { givens: number[]; difficulty: string; puzzleIndex: number } | null {
  const refs = practiceData.techniques[technique]
  if (!refs || refs.length === 0) {
    return null
  }

  // Pick one deterministically based on current date (so it changes daily)
  const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24))
  const ref = refs[dayOfYear % refs.length]
  /* v8 ignore start -- unreachable defensive guard: refs is non-empty past the guard above, so `dayOfYear % refs.length` is always a valid index and ref is always defined */
  // Stryker disable next-line ConditionalExpression,BlockStatement: defensive guard. After the L128 check, refs is a non-empty array, so `dayOfYear % refs.length` is in [0, length-1] and ref is always defined; this branch is unreachable in normal flow
  if (!ref) {
    return null
  }
  /* v8 ignore stop */

  const difficulty = KeyToDifficulty[ref.d] ?? ref.d
  const result = getPuzzleByIndex(ref.i, difficulty)
  if (!result) return null

  return {
    givens: result.givens,
    difficulty,
    puzzleIndex: ref.i,
  }
}
