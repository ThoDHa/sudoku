/**
 * Path calculation utilities for drag-to-select functionality
 * Uses L-shaped (Manhattan) path: moves vertically first, then horizontally
 */

/**
 * Convert cell index (0-80) to row/column coordinates
 * @param idx - Cell index (0-80)
 * @returns Object with row (0-8) and col (0-8)
 */
export function cellIndexToCoords(idx: number): { row: number; col: number } {
  const row = Math.floor(idx / 9)
  const col = idx % 9
  return { row, col }
}

/**
 * Convert row/column coordinates to cell index
 * @param row - Row (0-8)
 * @param col - Column (0-8)
 * @returns Cell index (0-80)
 */
export function coordsToCellIndex(row: number, col: number): number {
  return row * 9 + col
}

/**
 * L-shaped path calculation: moves vertically first, then horizontally.
 * Selects all cells along the right-angle path between two points on the grid.
 * @param start - Starting cell index
 * @param end - Ending cell index
 * @returns Array of cell indices along the L-shaped path
 */
export function calculatePathCells(start: number, end: number): number[] {
  const startCoords = cellIndexToCoords(start)
  const endCoords = cellIndexToCoords(end)

  const cells: number[] = []

  const startRow = startCoords.row
  const startCol = startCoords.col
  const endRow = endCoords.row
  const endCol = endCoords.col

  // Phase 1: Move vertically from startRow toward endRow (column stays at startCol)
  const rowStep = startRow <= endRow ? 1 : -1
  for (let row = startRow; row !== endRow; row += rowStep) {
    cells.push(coordsToCellIndex(row, startCol))
  }

  // Phase 2: Move horizontally from startCol to endCol (row is now endRow)
  const colStep = startCol <= endCol ? 1 : -1
  for (let col = startCol; col !== endCol; col += colStep) {
    cells.push(coordsToCellIndex(endRow, col))
  }

  // Add the final cell
  cells.push(coordsToCellIndex(endRow, endCol))

  return cells
}

/**
 * Check if drag should be blocked when encountering a given cell
 * @param currentCell - Current cell index during drag
 * @param initialBoard - Array representing given cells (non-zero = given)
 * @returns true if drag should stop (current cell is a given)
 */
export function isDragBlocked(currentCell: number, initialBoard: number[]): boolean {
  return initialBoard[currentCell] !== 0
}
