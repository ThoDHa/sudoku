import { useEffect } from 'react'

export interface UseGameKeyboardShortcutsOptions {
  handleUndo: () => void
  handleRedo: () => void
  handleNext: () => void
  handleValidate: () => void
  clearAllAndDeselect: () => void
  setNotesMode: (updater: (prev: boolean) => boolean) => void
  /** True when any modal that should swallow keyboard input is open. */
  isModalOpen: boolean
}

/**
 * Wires the global `keydown` listener for the game page: undo/redo (Ctrl/Cmd+Z,
 * Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y), hint (H), notes toggle (N, Space), validate (V),
 * and deselect (Escape). Shortcuts are suppressed while typing in an input/textarea
 * or while any modal is open.
 *
 * The seven per-modal open flags are collapsed into a single `isModalOpen`
 * boolean by the caller: re-subscribing when one flag changes but the OR stays
 * true is a no-op remove+add, so observable behavior is unchanged.
 */
export function useGameKeyboardShortcuts({
  handleUndo,
  handleRedo,
  handleNext,
  handleValidate,
  clearAllAndDeselect,
  setNotesMode,
  isModalOpen,
}: UseGameKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Don't trigger shortcuts when modals are open
      if (isModalOpen) {
        return
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd + Z = Undo
      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handleUndo()
        return
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if (
        (ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z') ||
        (ctrlOrCmd && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault()
        handleRedo()
        return
      }

      // H = Hint
      if (e.key.toLowerCase() === 'h' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handleNext()
        return
      }

      // N = Toggle Notes mode
      if (e.key.toLowerCase() === 'n' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        setNotesMode((prev) => !prev)
        return
      }

      // V = Validate
      if (e.key.toLowerCase() === 'v' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handleValidate()
        return
      }

      // Escape = Deselect cell and clear highlights
      if (e.key === 'Escape') {
        e.preventDefault()
        clearAllAndDeselect()
        return
      }

      // Space = Toggle notes mode (alternative)
      if (e.key === ' ' && !ctrlOrCmd) {
        // Only if not on a focusable element that uses space
        const activeTag = document.activeElement?.tagName
        if (activeTag !== 'BUTTON' && activeTag !== 'A') {
          e.preventDefault()
          setNotesMode((prev) => !prev)
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    handleUndo,
    handleRedo,
    handleNext,
    handleValidate,
    clearAllAndDeselect,
    setNotesMode,
    isModalOpen,
  ])
}
