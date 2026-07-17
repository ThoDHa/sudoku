import { getScores, getTodayUTC, isTodayCompleted, type Score } from './scores'

// Resolves the effective puzzle setup for the current URL so Game.tsx can decide
// whether to show the difficulty chooser, treat the puzzle as already completed
// today, and so on. Pure function extracted from Game.tsx; it touches only the
// daily-completion score store (read-only) and the URL-derived inputs.

export interface PuzzleSetup {
  effectiveSeed: string | undefined
  isEncodedCustom: boolean
  needsDifficultyChoice: boolean
  alreadyCompletedToday: boolean
  completedDailyScore: Score | undefined
}

export interface PuzzleSetupParams {
  seed: string | undefined
  encoded: string | undefined
  pathname: string
  difficultyParam: string | null
}

export function resolvePuzzleSetup(params: PuzzleSetupParams): PuzzleSetup {
  const { seed, encoded, pathname, difficultyParam } = params
  const effectiveSeed = seed || undefined
  const isEncodedCustom = pathname.startsWith('/c/') && !!encoded
  const needsDifficultyChoice =
    !difficultyParam &&
    !isEncodedCustom &&
    !effectiveSeed?.startsWith('custom-') &&
    !effectiveSeed?.startsWith('practice-')
  const isTodaysDailyPuzzle = effectiveSeed === `daily-${getTodayUTC()}`
  const alreadyCompletedToday = isTodaysDailyPuzzle && isTodayCompleted()
  const completedDailyScore = alreadyCompletedToday
    ? getScores().find((s) => s.seed === effectiveSeed)
    : undefined
  return {
    effectiveSeed,
    isEncodedCustom,
    needsDifficultyChoice,
    alreadyCompletedToday,
    completedDailyScore,
  }
}
