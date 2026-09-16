/** Formats a zero-based cell coordinate as its 1-based "R<row>C<col>" label. */
export const formatCell = (row: number, col: number): string => `R${row + 1}C${col + 1}`

/** Joins the formatted labels of the given cells into a comma-separated list. */
export const formatCells = (cells: { row: number; col: number }[]): string =>
  cells.map((t) => formatCell(t.row, t.col)).join(', ')

/**
 * Extracts the auto-filled cell count from a "Fill Candidates" move
 * explanation such as "Filled all candidates for 27 cells".
 *
 * @param explanation - The move explanation to parse, if any.
 * @returns The parsed count, or 0 when the explanation is missing or does not
 *   contain a "<n> cells" fragment.
 */
export function parseAutoFillCellCount(explanation: string | undefined): number {
  const match = explanation?.match(/(\d+) cells/)
  return match && match[1] ? parseInt(match[1], 10) : 0
}

/**
 * Returns the plural suffix for a count: "s" for every value except exactly 1.
 *
 * @param count - The count being suffixed.
 * @returns "s" unless the count is exactly 1.
 */
export function pluralSuffix(count: number): string {
  return count !== 1 ? 's' : ''
}

/**
 * Converts a position in the reversed move list back to the move's original
 * (chronological) index: the newest move (reverseIdx 0) has the highest index.
 *
 * @param moveCount - The total number of moves in the history.
 * @param reverseIdx - The zero-based position in the reversed list.
 * @returns The move's original index into the un-reversed list.
 */
export function originalMoveIndex(moveCount: number, reverseIdx: number): number {
  return moveCount - 1 - reverseIdx
}

/**
 * Converts a move's original index to its 1-based display number.
 *
 * @param originalIndex - The move's index into the un-reversed list.
 * @returns The 1-based move number shown in the history list.
 */
export function moveDisplayNumber(originalIndex: number): number {
  return originalIndex + 1
}
