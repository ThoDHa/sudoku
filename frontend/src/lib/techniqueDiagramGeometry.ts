import type { DiagramCell } from './techniques'

/** Key under which a cell's row/column pair is stored in the diagram cell map. */
export const cellKey = (row: number, col: number): string => `${row}-${col}`

/** Indexes the diagram cells by their row/column key; later entries win. */
export function buildCellMap(cells: DiagramCell[]): Map<string, DiagramCell> {
  const cellMap = new Map<string, DiagramCell>()
  cells.forEach((cell) => {
    cellMap.set(cellKey(cell.row, cell.col), cell)
  })
  return cellMap
}

/**
 * Resolves the rect fill for a board position from the four-way precedence:
 * primary, then secondary, then elimination highlight, else the default
 * background.
 *
 * @param cellMap - The cell map built by {@link buildCellMap}.
 * @param row - The zero-based board row.
 * @param col - The zero-based board column.
 * @returns The CSS `fill` value for the cell's rect.
 */
export function getCellFill(cellMap: Map<string, DiagramCell>, row: number, col: number): string {
  const cell = cellMap.get(cellKey(row, col))
  if (cell?.highlight === 'primary') return 'var(--cell-primary)'
  if (cell?.highlight === 'secondary') return 'var(--cell-secondary)'
  if (cell?.highlight === 'elimination') return 'var(--accent-light)'
  return 'var(--cell-bg)'
}

/**
 * Decides whether a cell's candidates render in the on-highlight color: cells
 * highlighted primary or secondary always do; elimination-highlighted cells
 * only when the view asks for eliminations to read as highlighted.
 *
 * @param cell - The cell whose candidates are being rendered, if present.
 * @param highlightElimination - Whether elimination highlights count as
 *   highlighted for candidate coloring.
 * @returns Whether the candidates use the on-highlight contrast color.
 */
export function isCellHighlighted(
  cell: DiagramCell | undefined,
  highlightElimination: boolean,
): boolean {
  if (cell?.highlight === 'primary' || cell?.highlight === 'secondary') return true
  if (cell?.highlight === 'elimination') return highlightElimination
  return false
}

/**
 * Places a candidate digit within its cell's 3x3 sub-grid: digits 1-3 fill the
 * top row, 4-6 the middle, 7-9 the bottom, left to right.
 *
 * @param digit - The candidate digit, 1 through 9.
 * @returns The zero-based sub-grid row and column for the digit.
 */
export function candidateSubgridPlacement(digit: number): { cRow: number; cCol: number } {
  return { cRow: Math.floor((digit - 1) / 3), cCol: (digit - 1) % 3 }
}
