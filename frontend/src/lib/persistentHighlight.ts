import type { MoveHighlight } from '../hooks/useHighlightState'
import { hasCandidate } from './candidatesUtils'
import { ACTION_ASSIGN, ACTION_CANDIDATE, BOARD_SIZE } from './constants'

/**
 * Physical item tracking for persistent regular-hint highlights.
 *
 * A persistent highlight tracks the hinted items against the live board with
 * cheap, solver-free checks: an elimination item resolves when its candidate
 * note is absent from the cell (removed explicitly, or the cell got filled
 * with any digit), a placement item resolves when its target cell holds the
 * hinted digit, and a note-addition item resolves when the note is present
 * (or the cell got filled, which moots the addition).
 */

/** One trackable hint item: an elimination, a digit placement, or a note addition. */
export interface HintedItem {
  kind: 'elimination' | 'placement' | 'candidate'
  row: number
  col: number
  digit: number
}

/** Moves with these actions place the hinted digit into their target cells. */
// ACTION_PLACE is the frontend user-move action (solver-generated moves use
// ACTION_ASSIGN); it has no generated constant, so it is named here.
const ACTION_PLACE = 'place'
const PLACEMENT_ACTIONS: ReadonlySet<string> = new Set([ACTION_ASSIGN, ACTION_PLACE])

const CELL_INDEX = (row: number, col: number): number => row * BOARD_SIZE + col

/**
 * Which trackable item kind a move's targets represent, or null when the
 * action is unmodeled (fix-error, fix-candidate, stalled, ...) or the move
 * has no concrete digit. Unmodeled moves collect no target items, so they
 * never become persistent.
 */
function targetItemKind(action: string, digit: number): HintedItem['kind'] | null {
  if (digit <= 0) return null
  if (action === ACTION_CANDIDATE) return 'candidate'
  if (PLACEMENT_ACTIONS.has(action)) return 'placement'
  return null
}

const eliminationItem = (elimination: { row: number; col: number; digit: number }): HintedItem => ({
  kind: 'elimination',
  row: elimination.row,
  col: elimination.col,
  digit: elimination.digit,
})

const targetItem = (
  kind: HintedItem['kind'],
  row: number,
  col: number,
  digit: number,
): HintedItem => ({
  kind,
  row,
  col,
  digit,
})

/**
 * Collect the trackable items a hint move asks the user to perform:
 * eliminations always, plus targets as placements (assign/place) or note
 * additions (candidate) when the move carries a concrete digit.
 */
export function collectHintedItems(move: MoveHighlight): HintedItem[] {
  const items: HintedItem[] = (move.eliminations ?? []).map(eliminationItem)
  const kind = targetItemKind(move.action, move.digit)
  if (kind) {
    for (const target of move.targets ?? []) {
      items.push(targetItem(kind, target.row, target.col, move.digit))
    }
  }
  return items
}

/** True when the move asks for at least one physically trackable item. */
export function hasTrackableItems(move: MoveHighlight): boolean {
  return collectHintedItems(move).length > 0
}

/**
 * An elimination item is pending while its candidate note is still present in
 * an empty cell; a removed note or any digit placed in the cell resolves it.
 */
export function isEliminationPending(
  item: HintedItem,
  board: number[],
  candidates: Uint16Array,
): boolean {
  const idx = CELL_INDEX(item.row, item.col)
  return board[idx] === 0 && hasCandidate(candidates[idx] || 0, item.digit)
}

/** A placement item is performed once the target cell holds the hinted digit. */
export function isPlacementPerformed(
  row: number,
  col: number,
  digit: number,
  board: number[],
): boolean {
  return board[CELL_INDEX(row, col)] === digit
}

/** A note-addition item is pending while the cell is empty and lacks the note. */
function isNoteAdditionPending(
  row: number,
  col: number,
  digit: number,
  board: number[],
  candidates: Uint16Array,
): boolean {
  const idx = CELL_INDEX(row, col)
  return board[idx] === 0 && !hasCandidate(candidates[idx] || 0, digit)
}

function isItemPending(item: HintedItem, board: number[], candidates: Uint16Array): boolean {
  switch (item.kind) {
    case 'elimination':
      return isEliminationPending(item, board, candidates)
    case 'placement':
      return !isPlacementPerformed(item.row, item.col, item.digit, board)
    case 'candidate':
      return isNoteAdditionPending(item.row, item.col, item.digit, board, candidates)
  }
}

/** Number of hinted items still waiting to be performed on the live board. */
export function countPendingHintedItems(
  move: MoveHighlight,
  board: number[],
  candidates: Uint16Array,
): number {
  return collectHintedItems(move).filter((item) => isItemPending(item, board, candidates)).length
}

export interface ResolvedPersistentHighlight {
  /** The highlight shrunk to its pending items (pattern highlights preserved). */
  highlight: MoveHighlight
  /** How many hinted items still wait to be performed. */
  pendingItemCount: number
}

/**
 * Resolve a persistent highlight against the live board in one pass: the
 * shrunk highlight and the pending count share the same item evaluation, so
 * they can never disagree. Resolved eliminations and performed placements
 * stop being displayed, while the technique pattern highlights
 * (primary/secondary) stay as context until the highlight clears entirely.
 * Targets of unmodeled actions pass through untouched.
 */
export function resolvePersistentHighlight(
  move: MoveHighlight,
  board: number[],
  candidates: Uint16Array,
): ResolvedPersistentHighlight {
  const pending = collectHintedItems(move).filter((item) => isItemPending(item, board, candidates))

  const eliminations = pending
    .filter((item) => item.kind === 'elimination')
    .map(({ row, col, digit }) => ({ row, col, digit }))

  const moveTargets = move.targets ?? []
  let targets: MoveHighlight['targets'] = moveTargets
  const kind = targetItemKind(move.action, move.digit)
  if (kind) {
    const pendingTargetCells = new Set(
      pending.filter((item) => item.kind === kind).map((item) => CELL_INDEX(item.row, item.col)),
    )
    targets = moveTargets.filter((target) =>
      pendingTargetCells.has(CELL_INDEX(target.row, target.col)),
    )
  }

  return {
    highlight: { ...move, eliminations, targets },
    pendingItemCount: pending.length,
  }
}
