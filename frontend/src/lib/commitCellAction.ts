// Unified helper for all cell erasure/undo/clearAll actions
// Handles side effects (UI resets, highlights, selection, notes/erase mode), so all clear paths call this
// Usage: commitCellAction('erase', {...}), commitCellAction('clearAll', {...}), etc.

export type CellActionType = 'erase' | 'clearAll' | 'undo' | 'redo';

export interface CommitCellActionOptions {
  // Index of the cell for per-cell actions
  idx?: number
  // The game model (must provide eraseCell, clearAll, undo, redo)
  // Prefer the canonical game hook return type to keep typings consistent
  // Importing the type avoids widening with index signatures that break assignment
  game: import('../hooks/useSudokuGame').UseSudokuGameReturn
  // UI and state handler functions (all optional, pass any that matter)
  clearAfterErase?: () => void
  clearAfterUserCandidateOp?: () => void
  clearAfterDigitPlacement?: () => void
  clearAllAndDeselect?: () => void
  clearMoveHighlight?: () => void
  deselectCell?: () => void
  setEraseMode?: (flag: boolean) => void
  setNotesMode?: (flag: boolean) => void
  setAutoSolveStepsUsed?: (val: number) => void
  setAutoSolveErrorsFixed?: (val: number) => void
  // ...any other state/UI side effect functions needed
}

export function commitCellAction(
  actionType: CellActionType,
  opts: CommitCellActionOptions
) {
  const { idx, game } = opts;

  switch (actionType) {
    case 'erase':
      if (typeof idx === 'number') {
        game.eraseCell(idx);
      }
      opts.clearAfterErase?.();
      // Any shared highlight/deselect/clear logic that should always follow erasure
      opts.setEraseMode?.(false);
      // Reset hint counters if present
      opts.setAutoSolveStepsUsed?.(0);
      opts.setAutoSolveErrorsFixed?.(0);
      break;
    case 'clearAll':
      game.clearAll();
      opts.clearAllAndDeselect?.();
      opts.setNotesMode?.(false);
      opts.setAutoSolveStepsUsed?.(0);
      opts.setAutoSolveErrorsFixed?.(0);
      break;
    case 'undo':
      game.undo();
      // Often want to clear highlights but preserve digit highlight for multi-fill mode
      opts.deselectCell?.();
      opts.clearMoveHighlight?.();
      break;
    case 'redo':
      game.redo();
      opts.clearAllAndDeselect?.();
      break;
    default:
      throw new Error(`Unknown actionType: ${actionType}`);
  }
}
