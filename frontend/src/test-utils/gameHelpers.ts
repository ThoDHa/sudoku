import type { Move } from '../hooks/useSudokuGame'
import type { MoveHighlight } from '../hooks/useHighlightState'
import type { SolveAllResult } from '../lib/solver-service'
import { createMockBackgroundManager } from './mocks'
import { vi } from 'vitest'

const NAKED_SINGLE = 'Naked Single'

export const createMockMove = (overrides?: Partial<Move>): Move => ({
  step_index: 0,
  technique: 'User Input',
  action: 'place',
  digit: 5,
  targets: [{ row: 4, col: 4 }],
  explanation: 'Test move',
  refs: { title: '', slug: '', url: '' },
  highlights: { primary: [] },
  isUserMove: true,
  ...overrides,
})

export const createMockMoveHighlight = (overrides?: Partial<MoveHighlight>): MoveHighlight => ({
  step_index: 0,
  technique: NAKED_SINGLE,
  action: 'place',
  digit: 5,
  targets: [{ row: 0, col: 2 }],
  explanation: 'Test move explanation',
  refs: { title: NAKED_SINGLE, slug: 'naked-single', url: '/techniques/naked-single' },
  highlights: {
    primary: [{ row: 0, col: 2 }],
    secondary: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ],
  },
  ...overrides,
})

export const createMockAutoSolveMove = (
  overrides?: Partial<{
    action: string
    technique: string
    digit: number
    explanation: string
    userEntryCount: number
  }>,
) => ({
  board: Array(81).fill(0),
  candidates: Array.from({ length: 81 }, () => [1, 2, 3]),
  move: {
    step_index: 0,
    technique: overrides?.technique ?? NAKED_SINGLE,
    action: overrides?.action ?? 'place',
    digit: overrides?.digit ?? 5,
    targets: [{ row: 0, col: 0 }],
    explanation: overrides?.explanation ?? 'Test move',
    refs: { title: 'Test', slug: 'test', url: '/test' },
    highlights: { primary: [] },
    ...(overrides?.userEntryCount !== undefined
      ? { userEntryCount: overrides.userEntryCount }
      : {}),
  },
})

// Build a SolveAllResult mock from either a move count or an explicit moves
// array. Returns the full runtime shape (including finalBoard) so callers do not
// need a local wrapper.
export const createMockSolveResponse = (
  movesOrCount: number | SolveAllResult['moves'] = 3,
  overrides?: { solved?: boolean },
): SolveAllResult => ({
  solved: overrides?.solved ?? true,
  moves:
    typeof movesOrCount === 'number'
      ? Array.from({ length: movesOrCount }, (_, i) => ({
          ...createMockAutoSolveMove(),
          move: {
            ...createMockAutoSolveMove().move,
            step_index: i,
            explanation: `Move ${i + 1}`,
          },
        }))
      : movesOrCount,
  finalBoard: Array(81).fill(0),
})

type AutoSolveOptions = Parameters<typeof import('../hooks/useAutoSolve').useAutoSolve>[0]

export const createDefaultAutoSolveOptions = (
  // Overrides may pass `undefined` to UNSET a defaulted callback: the
  // autoSolve tests kill optional-chaining mutants by exercising the
  // absent-callback path, so undefined values are dropped from the result
  // (key genuinely absent) rather than left as `key: undefined`.
  overrides?: { [K in keyof AutoSolveOptions]?: AutoSolveOptions[K] | undefined },
) => {
  const options = {
    getBoard: vi.fn(() => Array(81).fill(0)),
    getCandidates: vi.fn(() =>
      Array(81)
        .fill(null)
        .map(() => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])),
    ),
    getGivens: vi.fn(() => Array(81).fill(0)),
    applyMove: vi.fn(),
    applyState: vi.fn(),
    isComplete: vi.fn(() => false),
    onError: vi.fn(),
    onUnpinpointableError: vi.fn(),
    onStatus: vi.fn(),
    onErrorFixed: vi.fn(),
    onStepNavigate: vi.fn(),
    backgroundManager: createMockBackgroundManager(),
    stepDelay: 10,
  }
  if (!overrides) return options
  // Overrides may pass `undefined` to UNSET a defaulted callback (see the note
  // on the param above). Rebuild so unset keys are genuinely ABSENT from the
  // result rather than present as `key: undefined` (dynamic `delete` would also
  // work but trips @typescript-eslint/no-dynamic-delete).
  const unset = new Set(
    Object.entries(overrides)
      .filter(([, v]) => v === undefined)
      .map(([k]) => k),
  )
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined))
  return {
    ...Object.fromEntries(Object.entries(options).filter(([k]) => !unset.has(k))),
    ...defined,
  } as typeof options
}
