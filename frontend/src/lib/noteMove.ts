/**
 * Builds the single-cell note-toggle move pieces shared by `setCell`'s notes
 * branch and `toggleCandidate` in `useSudokuGame`.
 *
 * The module owns the construction only: it takes the candidate array as a
 * parameter (never the render-state vs ref source decision) and returns the
 * pieces the hook feeds to `createMove`. The guards, the 100 ms note-toggle
 * debounce, the ref writes, and the history dispatch stay in the hook.
 */

import { hasCandidate, toggleCandidate } from './candidatesUtils'
import { formatCell } from './historyMoveFormat'

/**
 * Toggles one note digit on one cell of a candidate array.
 *
 * @param candidates - The source candidate masks; never mutated.
 * @param idx - The flat cell index to toggle.
 * @param digit - The note digit to toggle.
 * @returns Whether the cell held the digit before the toggle, and a fresh
 *   candidate array with the digit toggled.
 */
export const toggleCellNote = (
  candidates: Uint16Array,
  idx: number,
  digit: number,
): { hadCandidate: boolean; candidates: Uint16Array } => {
  const hadCandidate = hasCandidate(candidates[idx] || 0, digit)
  const newCandidates = new Uint16Array(candidates)
  newCandidates[idx] = toggleCandidate(newCandidates[idx] || 0, digit)
  return { hadCandidate, candidates: newCandidates }
}

/**
 * Describes a single-cell note toggle as a history-move action and explanation.
 *
 * @param hadCandidate - Whether the cell held the digit before the toggle
 *   (a removal) or not (an addition).
 * @param digit - The note digit being toggled.
 * @param row - The zero-based cell row.
 * @param col - The zero-based cell column.
 * @returns The `eliminate` action and "Removed note" explanation for a
 *   removal, or the `note` action and "Added note" explanation for an addition.
 */
export const describeNoteToggle = (
  hadCandidate: boolean,
  digit: number,
  row: number,
  col: number,
): { action: 'note' | 'eliminate'; explanation: string } => ({
  action: hadCandidate ? 'eliminate' : 'note',
  explanation: hadCandidate
    ? `Removed note ${digit} from ${formatCell(row, col)}`
    : `Added note ${digit} to ${formatCell(row, col)}`,
})
