/**
 * Reusable test helpers and mocks for frontend tests
 * Centralized so tests can import consistent mock objects and scenario data
 */

const NAKED_SINGLE = 'Naked Single'
const HIDDEN_SINGLE = 'Hidden Single'
const ONLY_CANDIDATE_EXPLANATION = 'Only candidate for this cell'

export const createMockBackgroundManager = (
  overrides?: Partial<{
    isHidden: boolean
    shouldPauseOperations: boolean
    registerCallback: (...args: unknown[]) => void
    unregisterCallback: (...args: unknown[]) => void
    isWindowBlurred: boolean
    isInDeepPause: boolean
    visibilityState: 'visible' | 'hidden'
    forceResume: (...args: unknown[]) => void
    forcePause: (...args: unknown[]) => void
  }>,
) => ({
  isHidden: false,
  shouldPauseOperations: false,
  // Use plain no-op callbacks so this module can be imported in production
  // Tests may pass spies via the overrides argument (e.g. vi.fn())
  registerCallback: () => {},
  unregisterCallback: () => {},
  isWindowBlurred: false,
  isInDeepPause: false,
  visibilityState: 'visible' as const,
  forceResume: () => {},
  forcePause: () => {},
  ...(overrides || {}),
})

export const createEvidencePuzzle = () => {
  const board = Array(81).fill(0)
  board[0] = 5
  board[4] = 3
  board[8] = 7
  board[9] = 6
  board[18] = 8
  board[20] = 3
  board[27] = 1
  board[35] = 9
  board[36] = 8
  board[44] = 2
  board[45] = 4
  board[53] = 5
  board[54] = 7
  board[62] = 3
  board[63] = 2
  board[71] = 6
  board[72] = 9
  board[80] = 1
  return board
}

export const createEvidenceSolution = () => {
  const solution = [...createEvidencePuzzle()]
  solution[1] = 4
  solution[2] = 2
  solution[3] = 9
  solution[5] = 1
  solution[6] = 6
  solution[7] = 8
  for (let i = 0; i < 81; i++) {
    if (solution[i] === 0) {
      solution[i] = (i % 9) + 1
    }
  }
  return solution
}

// Helper to produce moves whose shapes match the shared Move/Highlights types

const fullCandidates = () =>
  Array(81)
    .fill(null)
    .map(() => [1, 2, 3, 4, 5, 6, 7, 8, 9])

const boardWithCell = (cell: number, digit: number) => {
  const board = [...createEvidencePuzzle()]
  board[cell] = digit
  return board
}

export const createBugScenarioMoves = () => [
  {
    board: [...createEvidencePuzzle()],
    candidates: fullCandidates(),
    move: {
      step_index: 0,
      technique: NAKED_SINGLE,
      action: 'place',
      digit: 1,
      targets: [{ row: 0, col: 1 }],
      explanation: ONLY_CANDIDATE_EXPLANATION,
      refs: { title: NAKED_SINGLE, slug: 'naked-single', url: '/techniques/naked-single' },
      highlights: { primary: [{ row: 0, col: 1 }] },
    },
  },
  {
    board: boardWithCell(1, 1),
    candidates: fullCandidates(),
    move: {
      step_index: 1,
      technique: HIDDEN_SINGLE,
      action: 'place',
      digit: 4,
      targets: [{ row: 0, col: 2 }],
      explanation: ONLY_CANDIDATE_EXPLANATION,
      refs: { title: HIDDEN_SINGLE, slug: 'hidden-single', url: '/techniques/hidden-single' },
      highlights: { primary: [{ row: 0, col: 2 }] },
    },
  },
]

export const createFixedScenarioMoves = () => [
  {
    board: [...createEvidencePuzzle()],
    candidates: fullCandidates(),
    move: {
      step_index: 0,
      technique: NAKED_SINGLE,
      action: 'place',
      digit: 4,
      targets: [{ row: 0, col: 1 }],
      explanation: ONLY_CANDIDATE_EXPLANATION,
      refs: { title: NAKED_SINGLE, slug: 'naked-single', url: '/techniques/naked-single' },
      highlights: { primary: [{ row: 0, col: 1 }] },
    },
  },
  {
    board: boardWithCell(1, 4),
    candidates: fullCandidates(),
    move: {
      step_index: 1,
      technique: HIDDEN_SINGLE,
      action: 'place',
      digit: 2,
      targets: [{ row: 0, col: 2 }],
      explanation: ONLY_CANDIDATE_EXPLANATION,
      refs: { title: HIDDEN_SINGLE, slug: 'hidden-single', url: '/techniques/hidden-single' },
      highlights: { primary: [{ row: 0, col: 2 }] },
    },
  },
]
