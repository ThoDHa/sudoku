/**
 * Shared Sudoku validation utilities
 * Provides unit iteration helpers and validation functions used by both
 * useSudokuGame.ts and Board.tsx to eliminate code duplication.
 */

/**
 * Get all cell indices in a row (0-8)
 */
export function getRowCells(row: number): number[] {
  const cells: number[] = []
  for (let col = 0; col < 9; col++) {
    cells.push(row * 9 + col)
  }
  return cells
}

/**
 * Get all cell indices in a column (0-8)
 */
export function getColCells(col: number): number[] {
  const cells: number[] = []
  for (let row = 0; row < 9; row++) {
    cells.push(row * 9 + col)
  }
  return cells
}

/**
 * Get all cell indices in a 3x3 box (0-8)
 * Boxes are numbered left-to-right, top-to-bottom:
 *   0 1 2
 *   3 4 5
 *   6 7 8
 */
export function getBoxCells(box: number): number[] {
  const cells: number[] = []
  const boxRow = Math.floor(box / 3) * 3
  const boxCol = (box % 3) * 3
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      cells.push(r * 9 + c)
    }
  }
  return cells
}

/**
 * Iterate over all 27 units (9 rows, 9 columns, 9 boxes)
 * @param callback - Called for each unit. Return false to stop iteration early.
 */
export function forEachUnit(
  callback: (unitType: 'row' | 'col' | 'box', index: number, cells: number[]) => boolean | void
): void {
  // Check rows
  for (let i = 0; i < 9; i++) {
    if (callback('row', i, getRowCells(i)) === false) return
  }
  // Check columns
  for (let i = 0; i < 9; i++) {
    if (callback('col', i, getColCells(i)) === false) return
  }
  // Check boxes
  for (let i = 0; i < 9; i++) {
    if (callback('box', i, getBoxCells(i)) === false) return
  }
}

/**
 * Find all cells that have duplicate values in their row, column, or box.
 * Used by Board.tsx to highlight conflicting cells.
 * @param board - 81-element array of cell values (0 = empty)
 * @returns Set of cell indices that contain duplicate values
 */
export function findDuplicates(board: number[]): Set<number> {
  const duplicates = new Set<number>()

  forEachUnit((_unitType, _index, cells) => {
    // Map value -> list of cell indices with that value
    const seen = new Map<number, number[]>()
    
    for (const idx of cells) {
      const val = board[idx] ?? 0
      if (val !== 0) {
        const existing = seen.get(val)
        if (existing) {
          existing.push(idx)
        } else {
          seen.set(val, [idx])
        }
      }
    }
    
    // Mark all cells with duplicate values
    seen.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((i) => duplicates.add(i))
      }
    })
  })

  return duplicates
}

/**
 * Check if a board represents a valid complete Sudoku solution.
 * Used by useSudokuGame.ts to detect puzzle completion.
 * @param board - 81-element array of cell values (0 = empty)
 * @returns true if board is completely filled with valid values
 */
export function isValidSolution(board: number[]): boolean {
  let isValid = true

  forEachUnit((_unitType, _index, cells) => {
    const seen = new Set<number>()
    
    for (const idx of cells) {
      const val = board[idx] ?? 0
      // Reject empty cells or duplicates
      if (val === 0 || seen.has(val)) {
        isValid = false
        return false // Stop iteration early
      }
      seen.add(val)
    }
    return undefined // Continue iteration
  })

  return isValid
}
