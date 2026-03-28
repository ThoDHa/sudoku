import type { Move } from '../hooks/useSudokuGame'
import type { MoveHighlight } from '../hooks/useHighlightState'
import type { KeyboardShortcutHandlers } from '../hooks/useKeyboardShortcuts'
import { createMockBackgroundManager } from './mocks'
import { vi } from 'vitest'

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
  technique: 'Naked Single',
  action: 'place',
  digit: 5,
  targets: [{ row: 0, col: 2 }],
  explanation: 'Test move explanation',
  refs: { title: 'Naked Single', slug: 'naked-single', url: '/techniques/naked-single' },
  highlights: {
    primary: [{ row: 0, col: 2 }],
    secondary: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  },
  ...overrides,
})

export const createMockKeyboardHandlers = (): KeyboardShortcutHandlers => ({
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onHint: vi.fn(),
  onValidate: vi.fn(),
  onToggleNotesMode: vi.fn(),
  onClearAllAndDeselect: vi.fn(),
})

export const createMockAutoSolveMove = (overrides?: Partial<{
  action: string
  technique: string
  digit: number
  explanation: string
  userEntryCount: number
}>) => ({
  board: Array(81).fill(0),
  candidates: Array(81).fill(null).map(() => [1, 2, 3]),
  move: {
    step_index: 0,
    technique: overrides?.technique ?? 'Naked Single',
    action: overrides?.action ?? 'place',
    digit: overrides?.digit ?? 5,
    targets: [{ row: 0, col: 0 }],
    explanation: overrides?.explanation ?? 'Test move',
    refs: { title: 'Test', slug: 'test', url: '/test' },
    highlights: { primary: [] },
    userEntryCount: overrides?.userEntryCount,
  },
})

export const createMockSolveResponse = (moveCount: number = 3, overrides?: { solved?: boolean }) => ({
  solved: overrides?.solved ?? true,
  moves: Array(moveCount).fill(null).map((_, i) => ({
    ...createMockAutoSolveMove(),
    move: {
      ...createMockAutoSolveMove().move,
      step_index: i,
      explanation: `Move ${i + 1}`,
    },
  })),
})

export const createDefaultAutoSolveOptions = (overrides?: Partial<Parameters<typeof import('../hooks/useAutoSolve').useAutoSolve>[0]>) => ({
  getBoard: vi.fn(() => Array(81).fill(0)),
  getCandidates: vi.fn(() => Array(81).fill(null).map(() => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]))),
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
  ...overrides,
})
