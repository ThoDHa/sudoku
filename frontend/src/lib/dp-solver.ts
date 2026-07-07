/**
 * Pure TypeScript Sudoku Solver using Backtracking/DP
 *
 * This provides fast validation and solving without loading WASM.
 * Used for custom puzzle validation where we only need to:
 * 1. Check if puzzle is valid (no conflicts)
 * 2. Find a solution
 * 3. Check if solution is unique
 *
 * For hints and human-style solving, WASM is still required.
 */

import { BOARD_SIZE, SUBGRID_SIZE } from './constants'

// ==================== Types ====================

export interface Conflict {
  cell1: number // First cell index (0-80)
  cell2: number // Second cell index (0-80)
  value: number // The conflicting value
  type: 'row' | 'column' | 'box'
}

export interface ValidateResult {
  valid: boolean
  unique?: boolean
  reason?: string
  solution?: number[]
}

// ==================== Core Solver ====================

/**
 * Solve a Sudoku puzzle using backtracking.
 * Returns the solved grid or null if unsolvable.
 */
export function solve(grid: number[]): number[] | null {
  const board = [...grid]
  if (solveBacktrack(board)) {
    return board
  }
  return null
}

/**
 * Check if a puzzle has exactly one solution.
 */
export function hasUniqueSolution(grid: number[]): boolean {
  const count = countSolutions(grid, 2)
  return count === 1
}

/**
 * Check if the grid has no conflicts (no duplicate values in rows, columns, or boxes).
 */
export function isValid(grid: number[]): boolean {
  const conflicts = findConflicts(grid)
  return conflicts.length === 0
}

/**
 * Find all conflicting cell pairs in the grid.
 */
export function findConflicts(grid: number[]): Conflict[] {
  const conflicts: Conflict[] = []
  const seen = new Set<string>()

  const addConflict = (cell1: number, cell2: number, value: number, type: Conflict['type']) => {
    const key = `${Math.min(cell1, cell2)}-${Math.max(cell1, cell2)}-${value}`
    if (!seen.has(key)) {
      seen.add(key)
      conflicts.push({ cell1, cell2, value, type })
    }
  }

  // Collect every conflicting pair inside one unit (a row, column, or box).
  // `seen` is shared across all units so a pair that conflicts in more than
  // one unit (e.g. two cells sharing both a row and a box) is reported once.
  const emitConflictingPairs = (cells: number[], value: number, type: Conflict['type']) => {
    // Stryker disable next-line EqualityOperator, UpdateOperator: i <= cells.length yields undefined (skipped by the guard below); i-- from 0 is an infinite loop the harness times out on
    for (let i = 0; i < cells.length; i++) {
      // Stryker disable next-line EqualityOperator, UpdateOperator: j <= cells.length yields undefined (skipped by the guard below); j-- from i+1 is an infinite loop the harness times out on
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i]
        const b = cells[j]
        // Stryker disable next-line ConditionalExpression,LogicalOperator: cells comes from positions.get(val).arr (always defined numeric cell indices); both halves of this defensive guard are always true under the original outer loops, so every mutant here is observationally equivalent
        if (a !== undefined && b !== undefined) {
          addConflict(a, b, value, type)
        }
      }
    }
  }

  const findInUnit = (cellIndices: number[], type: Conflict['type']) => {
    const positions = new Map<number, number[]>()
    for (const idx of cellIndices) {
      const val = grid[idx] ?? 0
      if (val === 0) continue
      let arr = positions.get(val)
      if (!arr) {
        arr = []
        positions.set(val, arr)
      }
      arr.push(idx)
    }
    for (const [val, cells] of positions) {
      // Stryker disable next-line ConditionalExpression,EqualityOperator: positions entries always have length >= 1 (we only push when val !== 0); with length === 1 the inner nested loops in emitConflictingPairs emit zero pairs, so > 1, >= 1, and `true` all behave identically
      if (cells.length > 1) emitConflictingPairs(cells, val, type)
    }
  }

  // Rows
  // Stryker disable next-line EqualityOperator, UpdateOperator: row === BOARD_SIZE yields undefined grid cells (skipped by the val === 0 guard); row-- from 0 is an infinite loop the harness times out on
  for (let row = 0; row < BOARD_SIZE; row++) {
    // Stryker disable next-line ArrayDeclaration: a seeded non-numeric first element maps to grid[undefined] ?? 0 and is skipped
    const indices: number[] = []
    // Stryker disable next-line UpdateOperator: col-- from 0 is an infinite loop the harness times out on
    for (let col = 0; col < BOARD_SIZE; col++) indices.push(row * BOARD_SIZE + col)
    findInUnit(indices, 'row')
  }

  // Columns
  // Stryker disable next-line UpdateOperator,EqualityOperator: col-- from 0 is an infinite loop the harness times out on; col <= BOARD_SIZE adds an extra iteration reading out-of-bounds cells (grid[81] ?? 0 = 0, skipped) and pair dedup via the shared `seen` set prevents re-reporting, so the mutant produces the same conflict list
  for (let col = 0; col < BOARD_SIZE; col++) {
    // Stryker disable next-line ArrayDeclaration: a seeded non-numeric first element maps to grid[undefined] ?? 0 and is skipped
    const indices: number[] = []
    // Stryker disable next-line EqualityOperator, UpdateOperator: row === BOARD_SIZE yields undefined grid cells (skipped by the val === 0 guard); row-- from 0 is an infinite loop the harness times out on
    for (let row = 0; row < BOARD_SIZE; row++) indices.push(row * BOARD_SIZE + col)
    findInUnit(indices, 'column')
  }

  // Boxes
  // Stryker disable next-line EqualityOperator, UpdateOperator: box === BOARD_SIZE yields undefined grid cells (skipped by the val === 0 guard); box-- from 0 is an infinite loop the harness times out on
  for (let box = 0; box < BOARD_SIZE; box++) {
    const boxRow = Math.floor(box / SUBGRID_SIZE) * SUBGRID_SIZE
    const boxCol = (box % SUBGRID_SIZE) * SUBGRID_SIZE
    // Stryker disable next-line ArrayDeclaration: a seeded non-numeric first element maps to grid[undefined] ?? 0 and is skipped
    const indices: number[] = []
    // Stryker disable next-line UpdateOperator: r-- from boxRow (>= 0) is an infinite loop the harness times out on
    for (let r = boxRow; r < boxRow + SUBGRID_SIZE; r++) {
      // Stryker disable next-line UpdateOperator: c-- from boxCol (>= 0) is an infinite loop the harness times out on
      for (let c = boxCol; c < boxCol + SUBGRID_SIZE; c++) {
        indices.push(r * BOARD_SIZE + c)
      }
    }
    findInUnit(indices, 'box')
  }

  return conflicts
}

/**
 * Validate a custom puzzle: check validity, solvability, and uniqueness.
 */
export function validatePuzzle(givens: number[]): ValidateResult {
  // Check for conflicts first
  if (!isValid(givens)) {
    return { valid: false, reason: 'Puzzle has conflicting numbers' }
  }

  // Try to solve
  const solution = solve(givens)
  if (!solution) {
    return { valid: false, reason: 'Puzzle has no solution' }
  }

  // Check uniqueness
  if (!hasUniqueSolution(givens)) {
    return { valid: true, unique: false, reason: 'Puzzle has multiple solutions', solution }
  }

  return { valid: true, unique: true, solution }
}

/**
 * Validate a board against a known solution.
 * Returns which cells are incorrect (if any).
 */
export function validateBoardAgainstSolution(
  board: number[],
  solution: number[],
): {
  valid: boolean
  message?: string
  incorrectCells?: number[]
} {
  if (board.length !== 81 || solution.length !== 81) {
    return { valid: false, message: 'Invalid board or solution length' }
  }

  const incorrectCells: number[] = []
  // Stryker disable next-line EqualityOperator, UpdateOperator: i === 81 yields undefined (coerced to 0 by ?? 0, boardVal 0 is ignored); i-- from 0 is an infinite loop the harness times out on
  for (let i = 0; i < 81; i++) {
    const boardVal = board[i] ?? 0
    const solutionVal = solution[i] ?? 0
    if (boardVal !== 0 && boardVal !== solutionVal) {
      incorrectCells.push(i)
    }
  }

  if (incorrectCells.length > 0) {
    const msg = `Found ${incorrectCells.length} incorrect cell${incorrectCells.length > 1 ? 's' : ''}`
    return { valid: false, message: msg, incorrectCells }
  }

  return { valid: true, message: 'All entries are correct so far!' }
}

// ==================== Internal Helpers ====================

/**
 * Backtracking solver - modifies board in place.
 */
function solveBacktrack(board: number[]): boolean {
  // Find next empty cell
  let idx = -1
  // Stryker disable next-line EqualityOperator, UpdateOperator: i === 81 yields board[81] === undefined which is not === 0, so idx is unaffected; i-- from 0 is an infinite loop the harness times out on
  for (let i = 0; i < 81; i++) {
    if (board[i] === 0) {
      idx = i
      break
    }
  }

  // All cells filled = solved
  if (idx === -1) {
    return true
  }

  const row = Math.floor(idx / 9)
  const col = idx % 9

  for (let digit = 1; digit <= 9; digit++) {
    if (canPlace(board, row, col, digit)) {
      board[idx] = digit
      if (solveBacktrack(board)) {
        return true
      }
      board[idx] = 0
    }
  }

  return false
}

/**
 * Count solutions up to maxCount.
 */
function countSolutions(grid: number[], maxCount: number): number {
  const board = [...grid]
  let count = 0

  function countHelper(): void {
    // Stryker disable next-line ConditionalExpression, EqualityOperator: early pruning at maxCount is a performance optimization; hasUniqueSolution only checks count === 1
    if (count >= maxCount) return

    // Find next empty cell
    let idx = -1
    // Stryker disable next-line EqualityOperator, UpdateOperator: i === 81 yields board[81] === undefined which is not === 0, so idx is unaffected; i-- from 0 is an infinite loop the harness times out on
    for (let i = 0; i < 81; i++) {
      if (board[i] === 0) {
        idx = i
        break
      }
    }

    // All cells filled = found a solution
    if (idx === -1) {
      count++
      return
    }

    const row = Math.floor(idx / 9)
    const col = idx % 9

    for (let digit = 1; digit <= 9; digit++) {
      if (canPlace(board, row, col, digit)) {
        board[idx] = digit
        countHelper()
        board[idx] = 0
        // Stryker disable next-line ConditionalExpression, EqualityOperator: early pruning at maxCount is a performance optimization; hasUniqueSolution only checks count === 1
        if (count >= maxCount) return
      }
    }
  }

  countHelper()
  return count
}

/**
 * Check if a digit can be placed at the given position.
 */
function canPlace(board: number[], row: number, col: number, digit: number): boolean {
  // Check row
  // Stryker disable next-line UpdateOperator: c-- from 0 is an infinite loop the harness times out on
  for (let c = 0; c < 9; c++) {
    if (board[row * 9 + c] === digit) return false
  }

  // Check column
  // Stryker disable next-line EqualityOperator, UpdateOperator: r === 9 yields board[81 + col] === undefined which never equals digit; r-- from 0 is an infinite loop the harness times out on
  for (let r = 0; r < 9; r++) {
    if (board[r * 9 + col] === digit) return false
  }

  // Check SUBGRID_SIZE x SUBGRID_SIZE box
  const boxRow = Math.floor(row / SUBGRID_SIZE) * SUBGRID_SIZE
  const boxCol = Math.floor(col / SUBGRID_SIZE) * SUBGRID_SIZE
  // Stryker disable next-line UpdateOperator: r-- from boxRow (>= 0) is an infinite loop the harness times out on
  for (let r = boxRow; r < boxRow + SUBGRID_SIZE; r++) {
    // Stryker disable next-line UpdateOperator: c-- from boxCol (>= 0) is an infinite loop the harness times out on
    for (let c = boxCol; c < boxCol + SUBGRID_SIZE; c++) {
      if (board[r * 9 + c] === digit) return false
    }
  }

  return true
}
