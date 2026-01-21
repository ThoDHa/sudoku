/**
 * Shared type definitions for Sudoku
 *
 * These types are used across the application and WASM module.
 * Extracted to separate file to reduce circular dependencies in code splitting.
 */

export interface CellRef {
  row: number
  col: number
}

export interface Candidate {
  row: number
  col: number
  digit: number
}

export interface TechniqueRef {
  title: string
  slug: string
  url: string
}

export interface Highlights {
  primary: CellRef[]
  secondary?: CellRef[]
}

export interface Move {
  step_index: number
  technique: string
  action: string // "assign" | "eliminate" | "candidate" | "fix-error" | "fix-conflict" | "contradiction" | "unpinpointable-error"
  digit: number
  targets: CellRef[]
  eliminations?: Candidate[]
  explanation: string
  refs: TechniqueRef
  highlights: Highlights
}

export interface BoardState {
  cells: number[]
  candidates: number[][]
}

export interface Conflict {
  cell1: number
  cell2: number
  value: number
  type: string // "row" | "column" | "box"
}

export interface MoveResult {
  board: number[]
  candidates: number[][]
  move: Move | null
}

export interface SolveAllResult {
  moves: MoveResult[]
  solved: boolean
  finalBoard: number[]
}

export interface SolveWithStepsResult {
  moves: Move[]
  status: string
  finalBoard: number[]
  solved: boolean
}

export interface AnalyzePuzzleResult {
  difficulty: string
  techniques: Record<string, number>
  status: string
}

export interface ValidateBoardResult {
  valid: boolean
  reason?: string
  message?: string
  incorrectCells?: number[]
}

export interface ValidateCustomResult {
  valid: boolean
  unique?: boolean
  reason?: string
  solution?: number[]
}

export interface PuzzleForSeedResult {
  givens: number[]
  solution: number[]
  puzzleId: string
  seed: string
  difficulty: string
  error?: string
}

export interface FindNextMoveResult {
  move: Move | null
  board: BoardState
  solved: boolean
}

export interface SudokuWasmAPI {
  // Human solver
  createBoard(givens: number[]): BoardState
  createBoardWithCandidates(cells: number[], candidates: number[][]): BoardState
  findNextMove(cells: number[], candidates: number[][], givens: number[]): FindNextMoveResult
  solveWithSteps(givens: number[], maxSteps?: number): SolveWithStepsResult
  analyzePuzzle(givens: number[]): AnalyzePuzzleResult
  solveAll(cells: number[], candidates: number[][], givens: number[]): SolveAllResult
  checkAndFixWithSolution(cells: number[], candidates: number[][], givens: number[], solution: number[]): SolveAllResult

  // DP solver
  solve(grid: number[]): number[] | null
  hasUniqueSolution(grid: number[]): boolean
  isValid(grid: number[]): boolean
  findConflicts(grid: number[]): Conflict[]
  generateFullGrid(seed: number): number[]
  carveGivens(fullGrid: number[], targetGivens: number, seed: number): number[]
  carveGivensWithSubset(fullGrid: number[], seed: number): Record<string, number[]>
}
