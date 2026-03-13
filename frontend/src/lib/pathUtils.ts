/**
 * Path calculation utilities for drag-to-select functionality
 * Uses Bresenham's line algorithm to determine which cells a drag path crosses
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
 * Bresenham's line algorithm - calculates all cells on a line between two points
 * @param start - Starting cell index
 * @param end - Ending cell index
 * @returns Array of cell indices that the path crosses
 */
export function calculatePathCells(start: number, end: number): number[] {
  const startCoords = cellIndexToCoords(start)
  const endCoords = cellIndexToCoords(end)

  const cells: number[] = []

  let x0 = startCoords.col
  let y0 = startCoords.row
  const x1 = endCoords.col
  const y1 = endCoords.row

  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    cells.push(coordsToCellIndex(y0, x0))

    if (x0 === x1 && y0 === y1) break

    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }

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
