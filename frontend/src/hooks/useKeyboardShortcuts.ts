import { useEffect } from 'react'

/**
 * Handlers for keyboard shortcuts
 */
export interface KeyboardShortcutHandlers {
  onUndo: () => void
  onRedo: () => void
  onHint: () => void
  onValidate: () => void
  onToggleNotesMode: () => void
  onClearAllAndDeselect: () => void
}

/**
 * Options for keyboard shortcuts
 */
export interface KeyboardShortcutOptions {
  /** Whether shortcuts should be disabled (e.g., when modals are open) */
  disabled?: boolean
}

/**
 * Hook for managing global keyboard shortcuts in the game
 * 
 * Shortcuts:
 * - Ctrl/Cmd + Z: Undo
 * - Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
 * - H: Hint
 * - N or Space: Toggle notes mode
 * - V: Validate
 * - Escape: Deselect and clear highlights
 */
export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  options: KeyboardShortcutOptions = {}
) {
  const { disabled = false } = options

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if disabled
      if (disabled) return

      // Don't trigger shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd + Z = Undo
      if (ctrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        handlers.onUndo()
        return
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y = Redo
      if ((ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z') || 
          (ctrlOrCmd && e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        handlers.onRedo()
        return
      }

      // H = Hint
      if (e.key.toLowerCase() === 'h' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handlers.onHint()
        return
      }

      // N = Toggle Notes mode
      if (e.key.toLowerCase() === 'n' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handlers.onToggleNotesMode()
        return
      }

      // V = Validate
      if (e.key.toLowerCase() === 'v' && !ctrlOrCmd && !e.altKey) {
        e.preventDefault()
        handlers.onValidate()
        return
      }

      // Escape = Deselect cell and clear highlights
      if (e.key === 'Escape') {
        e.preventDefault()
        handlers.onClearAllAndDeselect()
        return
      }

      // Space = Toggle notes mode (alternative)
      if (e.key === ' ' && !ctrlOrCmd) {
        // Only if not on a focusable element that uses space
        const activeTag = document.activeElement?.tagName
        if (activeTag !== 'BUTTON' && activeTag !== 'A') {
          e.preventDefault()
          handlers.onToggleNotesMode()
        }
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handlers, disabled])
}
