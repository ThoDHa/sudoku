/**
 * Pure TypeScript Sudoku Solver using Backtracking/DP
 * 
 * This provides fast validation and solving without loading WASM.
 * Used for custom puzzle validation where we only need to:
 * 1. Check if the puzzle is valid (no conflicts)
 * 2. Find a solution
 * 3. Check if the solution is unique
 * 
 * For hints and human-style solving, WASM is still required.
 */

// ==================== Types ====================

export interface Conflict {
  cell1: number  // First cell index (0-80)
  cell2: number  // Second cell index (0-80)
  value: number  // The conflicting value
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

  // Helper to safely get grid value
  const getCell = (idx: number): number => grid[idx] ?? 0

  // Check rows
  for (let row = 0; row < 9; row++) {
    const positions = new Map<number, number[]>()
    for (let col = 0; col < 9; col++) {
      const val = getCell(row * 9 + col)
      if (val === 0) continue
      let arr = positions.get(val)
      if (!arr) {
        arr = []
        positions.set(val, arr)
      }
      arr.push(col)
    }
    for (const [val, cols] of positions) {
      if (cols.length > 1) {
        for (let i = 0; i < cols.length; i++) {
          for (let j = i + 1; j < cols.length; j++) {
            const c1 = cols[i]
            const c2 = cols[j]
            if (c1 !== undefined && c2 !== undefined) {
              addConflict(row * 9 + c1, row * 9 + c2, val, 'row')
            }
          }
        }
      }
    }
  }

  // Check columns
  for (let col = 0; col < 9; col++) {
    const positions = new Map<number, number[]>()
    for (let row = 0; row < 9; row++) {
      const val = getCell(row * 9 + col)
      if (val === 0) continue
      let arr = positions.get(val)
      if (!arr) {
        arr = []
        positions.set(val, arr)
      }
      arr.push(row)
    }
    for (const [val, rows] of positions) {
      if (rows.length > 1) {
        for (let i = 0; i < rows.length; i++) {
          for (let j = i + 1; j < rows.length; j++) {
            const r1 = rows[i]
            const r2 = rows[j]
            if (r1 !== undefined && r2 !== undefined) {
              addConflict(r1 * 9 + col, r2 * 9 + col, val, 'column')
            }
          }
        }
      }
    }
  }

  // Check boxes
  for (let box = 0; box < 9; box++) {
    const positions = new Map<number, number[]>()
    const boxRow = Math.floor(box / 3) * 3
    const boxCol = (box % 3) * 3
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        const val = getCell(r * 9 + c)
        if (val === 0) continue
        let arr = positions.get(val)
        if (!arr) {
          arr = []
          positions.set(val, arr)
        }
        arr.push(r * 9 + c)
      }
    }
    for (const [val, cells] of positions) {
      if (cells.length > 1) {
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const cell1 = cells[i]
            const cell2 = cells[j]
            if (cell1 !== undefined && cell2 !== undefined) {
              addConflict(cell1, cell2, val, 'box')
            }
          }
        }
      }
    }
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
export function validateBoard(board: number[], solution: number[]): {
  valid: boolean
  message?: string
  incorrectCells?: number[]
} {
  if (board.length !== 81 || solution.length !== 81) {
    return { valid: false, message: 'Invalid board or solution length' }
  }

  const incorrectCells: number[] = []
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
    if (count >= maxCount) return

    // Find next empty cell
    let idx = -1
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
  for (let c = 0; c < 9; c++) {
    if (board[row * 9 + c] === digit) return false
  }

  // Check column
  for (let r = 0; r < 9; r++) {
    if (board[r * 9 + col] === digit) return false
  }

  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3
  const boxCol = Math.floor(col / 3) * 3
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if (board[r * 9 + c] === digit) return false
    }
  }

  return true
}
