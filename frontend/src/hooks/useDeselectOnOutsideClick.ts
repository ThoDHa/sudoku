import { useEffect } from 'react'
import type { RefObject } from 'react'

export interface UseDeselectOnOutsideClickOptions {
  selectedCellRef: RefObject<number | null>
  selectedCellsRef: RefObject<Set<number>>
  deselectCell: () => void
  clearMoveHighlight: () => void
  setEraseMode: (value: boolean) => void
}

// Deselects the active cell selection when the user clicks/taps genuine empty
// space, i.e. NOT on a cell, the board, the digit/action controls, an overlay
// opener button, or anywhere inside an overlay panel/backdrop. Bespoke selector
// list kept identical to the original inline effect: the attribute set matters
// for distinguishing board UI, overlay openers, and modal interiors from the
// empty areas that should clear the selection.
export function useDeselectOnOutsideClick(options: UseDeselectOnOutsideClickOptions): void {
  const { selectedCellRef, selectedCellsRef, deselectCell, clearMoveHighlight, setEraseMode } =
    options

  useEffect(() => {
    const handleInteraction = (event: Event) => {
      // Only process if a cell or multi-select is active
      if (selectedCellRef.current === null && selectedCellsRef.current.size === 0) return

      const target = event.target as Element | null
      /* v8 ignore next -- defensive guard: a dispatched DOM click/touchstart always carries a non-null event.target (the browser/jsdom assigns it during dispatch), so this null check is unreachable for genuine events */
      if (!target) return

      // Check for actual modals AND overlay backdrops (not toasts/notifications).
      // [data-overlay-backdrop] covers all three backdrop structural patterns; [data-modal]
      // revives the panel-interior guard (panel wrappers carry the attribute).
      const clickedInsideModal = target.closest(
        '[role="dialog"], .modal, [data-modal], [data-overlay-backdrop]',
      )

      // Check if click is on interactive game elements that should NOT trigger deselection
      const clickedOnCell = target.closest('.sudoku-cell') !== null
      const clickedOnBoard = target.closest('.sudoku-board') !== null
      const clickedOnDigitButton = target.closest('.control-digit-btn') !== null
      const clickedOnActionButton = target.closest('.control-action-btn-compact') !== null
      // Opening an overlay should not wipe the board selection. Each overlay opener button
      // carries a data-*-button attribute; they are grouped here as one concept.
      const clickedOnOverlayOpener =
        target.closest('[data-menu-button], [data-history-button], [data-share-button]') !== null

      // Deselect if click is NOT on a cell/board, NOT on digit/action buttons, NOT on an
      // overlay opener, and NOT inside an overlay (panel or backdrop). This leaves only
      // genuine empty-space clicks triggering deselection.
      // The board check prevents deselection from synthetic clicks after multi-select drags.
      if (
        !clickedOnCell &&
        !clickedOnBoard &&
        !clickedOnDigitButton &&
        !clickedOnActionButton &&
        !clickedOnOverlayOpener &&
        !clickedInsideModal
      ) {
        deselectCell()
        setEraseMode(false)
        clearMoveHighlight()
      }
    }

    // Listen to both click and touchstart for mobile compatibility
    // Use capture phase to ensure we get the event before other handlers
    document.addEventListener('click', handleInteraction, { capture: true })
    document.addEventListener('touchstart', handleInteraction, { capture: true })
    return () => {
      document.removeEventListener('click', handleInteraction, true)
      document.removeEventListener('touchstart', handleInteraction, true)
    }
  }, [selectedCellRef, selectedCellsRef, deselectCell, clearMoveHighlight, setEraseMode])
}
