import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { STORAGE_KEYS, MAX_DIGIT, TOTAL_CELLS } from '../lib/constants'
import { getGameMode } from '../lib/gameSettings'
import { shouldShowDailyPrompt, markDailyPromptShown } from '../lib/dailyPrompt'
import { getPuzzle, validateCustomPuzzle } from '../lib/solver-service'
import { decodePuzzle, decodePuzzleWithState, encodePuzzle } from '../lib/puzzleEncoding'
import type { Difficulty } from '../lib/hooks'
import type { useBackgroundManager } from './useBackgroundManager'
import type { useTimerControl } from '../lib/TimerContext'

type TimerControl = ReturnType<typeof useTimerControl>
type BackgroundManager = ReturnType<typeof useBackgroundManager>

export interface PuzzleData {
  puzzle_id: string
  seed: string
  difficulty: string
  givens: number[]
  solution: number[]
}

// Result of resolving where the puzzle comes from for the current route.
interface ResolvedPuzzle {
  givens: number[]
  solution: number[]
  puzzleData: PuzzleData
  initialState: number[] | null
  initialCandidates: number[][] | null
}

// Read a givens array previously written with JSON.stringify(number[]). Narrows
// the parsed value to an integer array in digit range (0..MAX_DIGIT, where 0 is
// an empty cell) so a corrupted localStorage entry fails here instead of being
// passed to the solver as an untyped value.
function parseStoredGivens(raw: string): number[] {
  const parsed: unknown = JSON.parse(raw)
  if (
    !Array.isArray(parsed) ||
    !parsed.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_DIGIT)
  ) {
    throw new Error('Stored puzzle data is malformed')
  }
  return parsed as number[]
}

// Validate custom givens and build the puzzleData payload shared by the
// full-state and legacy custom-puzzle link branches.
async function validateAndBuildCustom(
  customGivens: number[],
  encoded: string,
  setEncodedPuzzle: (value: string) => void,
): Promise<{ solution: number[]; puzzleData: PuzzleData }> {
  const validation = await validateCustomPuzzle(customGivens, '')
  if (!validation.valid) {
    throw new Error(`Invalid puzzle: ${validation.reason || 'unknown error'}`)
  }
  if (!validation.unique) {
    throw new Error('Invalid puzzle: has multiple solutions')
  }
  if (!validation.solution) {
    throw new Error('Invalid puzzle: could not compute solution')
  }
  setEncodedPuzzle(encoded)
  return {
    solution: validation.solution,
    puzzleData: {
      puzzle_id: `custom-${encoded.substring(0, 8)}`,
      seed: `custom-${encoded.substring(0, 8)}`,
      difficulty: 'custom',
      givens: customGivens,
      solution: validation.solution,
    },
  }
}

// Resolve an encoded custom-puzzle link (full-state or legacy givens-only).
async function resolveEncodedCustom(
  encoded: string,
  setEncodedPuzzle: (value: string) => void,
): Promise<ResolvedPuzzle> {
  let givens: number[]
  let initialState: number[] | null = null
  let initialCandidates: number[][] | null = null

  if (encoded.startsWith('e') || encoded.startsWith('c')) {
    const decoded = decodePuzzleWithState(encoded)
    if (!decoded) {
      throw new Error('Invalid puzzle link. The puzzle could not be decoded.')
    }
    givens = decoded.givens
    initialState = decoded.board
    if (decoded.candidates) {
      initialCandidates = decoded.candidates
    }
  } else {
    try {
      givens = decodePuzzle(encoded)
      if (givens.length !== TOTAL_CELLS) {
        throw new Error('Invalid puzzle encoding')
      }
    } catch {
      throw new Error('Invalid puzzle link. The puzzle could not be decoded.')
    }
  }

  const { solution, puzzleData } = await validateAndBuildCustom(givens, encoded, setEncodedPuzzle)
  return { givens, solution, puzzleData, initialState, initialCandidates }
}

// Resolve a custom puzzle previously saved to localStorage by its seed.
async function resolveStoredCustom(
  effectiveSeed: string,
  setEncodedPuzzle: (value: string | null) => void,
): Promise<ResolvedPuzzle> {
  const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${effectiveSeed}`)
  if (!storedGivens) {
    throw new Error('Custom puzzle not found. Please re-enter the puzzle.')
  }
  const givens = parseStoredGivens(storedGivens)
  const validation = await validateCustomPuzzle(givens, '')
  if (!validation.valid || !validation.unique || !validation.solution) {
    throw new Error('Stored puzzle is invalid')
  }
  setEncodedPuzzle(encodePuzzle(givens))
  return {
    givens,
    solution: validation.solution,
    puzzleData: {
      puzzle_id: effectiveSeed,
      seed: effectiveSeed,
      difficulty: 'custom',
      givens,
      solution: validation.solution,
    },
    initialState: null,
    initialCandidates: null,
  }
}

// Resolve a practice puzzle saved to localStorage by TechniqueDetailView.
async function resolvePractice(
  effectiveSeed: string,
  difficulty: Difficulty,
  setEncodedPuzzle: (value: string | null) => void,
): Promise<ResolvedPuzzle> {
  const storedGivens = localStorage.getItem(`${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${effectiveSeed}`)
  if (!storedGivens) {
    throw new Error('Practice puzzle not found. Please try again from the technique page.')
  }
  const givens = parseStoredGivens(storedGivens)
  const validation = await validateCustomPuzzle(givens, '')
  if (!validation.valid || !validation.unique || !validation.solution) {
    throw new Error('Practice puzzle is invalid')
  }
  setEncodedPuzzle(null)
  return {
    givens,
    solution: validation.solution,
    puzzleData: {
      puzzle_id: effectiveSeed,
      seed: effectiveSeed,
      difficulty,
      givens,
      solution: validation.solution,
    },
    initialState: null,
    initialCandidates: null,
  }
}

// Resolve a puzzle fetched from the static pool. ensurePuzzleBank is warmed
// inside getPuzzle (solver-service), so this is the one fetch entry point.
async function resolveFetched(
  effectiveSeed: string | undefined,
  difficulty: Difficulty,
  setEncodedPuzzle: (value: string | null) => void,
): Promise<ResolvedPuzzle> {
  const fetchedPuzzle = await getPuzzle(effectiveSeed ?? '', difficulty)
  setEncodedPuzzle(null)
  return {
    givens: fetchedPuzzle.givens,
    solution: fetchedPuzzle.solution,
    puzzleData: {
      puzzle_id: fetchedPuzzle.puzzle_id,
      seed: fetchedPuzzle.seed,
      difficulty: fetchedPuzzle.difficulty,
      givens: fetchedPuzzle.givens,
      solution: fetchedPuzzle.solution,
    },
    initialState: null,
    initialCandidates: null,
  }
}

// Dispatch to the correct puzzle source for the current route: encoded custom
// link, stored custom/practice puzzle, or a fetched puzzle from the static pool.
async function fetchPuzzleSource(params: {
  isEncodedCustom: boolean
  encoded: string | undefined
  difficulty: Difficulty
  effectiveSeed: string | undefined
  setEncodedPuzzle: (value: string | null) => void
}): Promise<ResolvedPuzzle> {
  const { isEncodedCustom, encoded, difficulty, effectiveSeed, setEncodedPuzzle } = params
  if (isEncodedCustom && encoded) {
    return resolveEncodedCustom(encoded, setEncodedPuzzle)
  }
  if (difficulty === 'custom' && effectiveSeed?.startsWith('custom-')) {
    return resolveStoredCustom(effectiveSeed, setEncodedPuzzle)
  }
  if (effectiveSeed?.startsWith('practice-')) {
    return resolvePractice(effectiveSeed, difficulty, setEncodedPuzzle)
  }
  return resolveFetched(effectiveSeed, difficulty, setEncodedPuzzle)
}

// Overlay a portable-link `s` state param onto a resolved puzzle. The seed already
// produced the givens; the param supplies the sharer's board and pencil notes.
function applySharedStateParam(
  resolved: ResolvedPuzzle,
  sharedStateParam: string | null,
): { initialState: number[] | null; initialCandidates: number[][] | null } {
  let { initialState, initialCandidates } = resolved
  if (!initialState && sharedStateParam) {
    const decodedShared = decodePuzzleWithState(sharedStateParam)
    if (decodedShared) {
      initialState = decodedShared.board
      initialCandidates = decodedShared.candidates ?? null
    }
  }
  return { initialState, initialCandidates }
}

export interface UsePuzzleLoaderOptions {
  effectiveSeed: string | undefined
  isEncodedCustom: boolean
  encoded: string | undefined
  difficulty: Difficulty
  sharedStateParam: string | null
  alreadyCompletedToday: boolean
  showDifficultyChooser: boolean
  showOnboarding: boolean
  onboardingComplete: boolean
  backgroundManager: BackgroundManager
  /** Shared with the persistence hook and the restore orchestration in Game. */
  hasRestoredSavedState: RefObject<boolean>
  /** Owned by Game (the share-conflict flow); this hook only resets it per load. */
  loadedFromSharedUrl: RefObject<boolean>
  /** Invoked when a shared-state link resolves; opens the share-conflict modal. */
  restoreOrPromptSharedState: (board: number[], candidates: number[][] | null, seed: string) => void
  setIncorrectCells: (cells: number[]) => void
  setShowDailyPrompt: (show: boolean) => void
  timerControl: TimerControl
}

export interface UsePuzzleLoaderReturn {
  loading: boolean
  error: string | null
  puzzle: PuzzleData | null
  initialBoard: number[]
  solution: number[]
  encodedPuzzle: string | null
}

/**
 * Resolves the puzzle for the current route and exposes its loading lifecycle.
 * Owns the loading/error/puzzle/initialBoard/solution/encodedPuzzle state and
 * the single fetch effect, delegating the share-conflict decision back to Game
 * via `restoreOrPromptSharedState`. The restore orchestration (applying a saved
 * or shared board onto `game`) stays in Game because it mutates `game`/timer.
 */
export function usePuzzleLoader({
  effectiveSeed,
  isEncodedCustom,
  encoded,
  difficulty,
  sharedStateParam,
  alreadyCompletedToday,
  showDifficultyChooser,
  showOnboarding,
  onboardingComplete,
  backgroundManager,
  hasRestoredSavedState: hasRestoredSavedStateRef,
  loadedFromSharedUrl: loadedFromSharedUrlRef,
  restoreOrPromptSharedState,
  setIncorrectCells,
  setShowDailyPrompt,
  timerControl,
}: UsePuzzleLoaderOptions): UsePuzzleLoaderReturn {
  const [encodedPuzzle, setEncodedPuzzle] = useState<string | null>(encoded || null)
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null)
  const [initialBoard, setInitialBoard] = useState<number[]>([])
  const [solution, setSolution] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch puzzle. Wrapped in a named function so the rule recognizes the
  // setState calls as callback-scoped, not direct effect-body mutations.
  useEffect(() => {
    const initiatePuzzleLoad = () => {
      // Check if we should show the daily prompt (for practice games only) - INDEPENDENT of onboarding!
      // Suppress it when opening a shared current-state link: the recipient came
      // to view a specific shared board, not to be nudged to the daily.
      if (getGameMode(effectiveSeed || '') === 'practice' && !sharedStateParam) {
        if (shouldShowDailyPrompt()) {
          setShowDailyPrompt(true)
          markDailyPromptShown()
        }
      }

      // Don't load puzzle while onboarding is showing
      if (showOnboarding) {
        setLoading(false) // Show empty board behind modal, not loading spinner
        return
      }
      // Don't load puzzle until difficulty is chosen (for shared links without ?d= param)
      if (showDifficultyChooser) {
        setLoading(false)
        return
      }
      // For new users, wait for onboarding to appear first (500ms delay in useOnboarding)
      // This prevents the puzzle from loading before onboarding shows
      if (!onboardingComplete) {
        setLoading(false)
        return
      }

      if (!effectiveSeed && !isEncodedCustom) {
        return
      }

      // DEFINE loadPuzzle function BEFORE calling it
      const loadPuzzle = async () => {
        try {
          setLoading(true)
          setError(null)

          /* istanbul ignore start -- redundant re-check: the effect's outer guards return before loadPuzzle is defined/called when either flag is true, so both are always false in this closure and the skip path is unreachable */
          if (showDifficultyChooser || showOnboarding) {
            setLoading(false)
            return
          }
          /* istanbul ignore stop */

          // Early return if puzzle already loaded and state restored
          if (puzzle && hasRestoredSavedStateRef.current) {
            setLoading(false)
            return
          }

          if (backgroundManager.shouldPauseOperations) {
            setLoading(false)
            return
          }

          // Note: WASM is NOT loaded here. It loads on-demand when user requests hints/solve.
          // Puzzles come from static pool (getPuzzle) or are validated with pure TypeScript (validateCustomPuzzle).

          setIncorrectCells([])

          const resolved = await fetchPuzzleSource({
            isEncodedCustom,
            encoded,
            difficulty,
            effectiveSeed,
            setEncodedPuzzle,
          })
          const { givens, puzzleData } = resolved
          // Portable seed links carry the sharer's progress in the `s` param; overlay
          // it so the shared-state path below (game.restoreState) applies board+notes.
          const { initialState, initialCandidates } = applySharedStateParam(
            resolved,
            sharedStateParam,
          )

          setPuzzle(puzzleData)
          // For shared state, use the provided full board
          // For completed daily puzzles, show solved board (solution)
          // Otherwise show initial givens
          if (initialState) {
            setInitialBoard([...givens]) // Givens for marking non-editable cells
          } else if (alreadyCompletedToday) {
            setInitialBoard([...puzzleData.solution])
          } else {
            setInitialBoard([...givens])
          }
          setSolution([...puzzleData.solution])

          // Reset timer for non-completed puzzles (timer will be started later by initialBoard effect)
          if (!alreadyCompletedToday && !showDifficultyChooser) {
            timerControl.resetTimer()
          }
          setLoading(false)

          // This load owns loadedFromSharedUrlRef: default false, set true only when
          // shared state is actually applied (restoreOrPromptSharedState). The
          // seed-reset effect must not touch it.
          loadedFromSharedUrlRef.current = false
          // Apply the shared board, or prompt when the recipient has their own progress.
          if (initialState) {
            restoreOrPromptSharedState(initialState, initialCandidates, puzzleData.seed)
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unknown error')
          setLoading(false)
        }
      }

      void loadPuzzle()
    }
    initiatePuzzleLoad()
  }, [
    effectiveSeed,
    encoded,
    isEncodedCustom,
    difficulty,
    sharedStateParam,
    alreadyCompletedToday,
    showDifficultyChooser,
    showOnboarding,
  ])

  return { loading, error, puzzle, initialBoard, solution, encodedPuzzle }
}
