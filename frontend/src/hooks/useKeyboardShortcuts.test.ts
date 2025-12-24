import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useKeyboardShortcuts, KeyboardShortcutHandlers } from './useKeyboardShortcuts'

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Create mock handlers for keyboard shortcuts
 */
const createMockHandlers = (): KeyboardShortcutHandlers => ({
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  onHint: vi.fn(),
  onValidate: vi.fn(),
  onToggleNotesMode: vi.fn(),
  onClearAllAndDeselect: vi.fn(),
})

/**
 * Create and dispatch a keyboard event on document
 */
const dispatchKeyDown = (options: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...options,
  })
  document.dispatchEvent(event)
  return event
}

/**
 * Create a keyboard event with preventDefault spy
 */
const createKeyEventWithPreventDefault = (options: KeyboardEventInit): {
  event: KeyboardEvent
  preventDefaultSpy: ReturnType<typeof vi.fn>
} => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...options,
  })
  const preventDefaultSpy = vi.fn()
  Object.defineProperty(event, 'preventDefault', {
    value: preventDefaultSpy,
  })
  return { event, preventDefaultSpy }
}

// =============================================================================
// TESTS
// =============================================================================

describe('useKeyboardShortcuts', () => {
  let originalPlatform: PropertyDescriptor | undefined

  beforeEach(() => {
    // Store original platform descriptor
    originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform')
  })

  afterEach(() => {
    // Restore original platform
    if (originalPlatform) {
      Object.defineProperty(navigator, 'platform', originalPlatform)
    }
    vi.restoreAllMocks()
  })

  /**
   * Helper to mock navigator.platform
   */
  const mockPlatform = (platform: string) => {
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      get: () => platform,
    })
  }

  // ===========================================================================
  // UNDO SHORTCUT TESTS (Ctrl/Cmd + Z)
  // ===========================================================================
  describe('Undo Shortcut (Ctrl/Cmd + Z)', () => {
    it('triggers onUndo with Ctrl+Z on Windows', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', ctrlKey: true })

      expect(handlers.onUndo).toHaveBeenCalledTimes(1)
    })

    it('triggers onUndo with Cmd+Z on Mac', () => {
      mockPlatform('MacIntel')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', metaKey: true })

      expect(handlers.onUndo).toHaveBeenCalledTimes(1)
    })

    it('does NOT trigger onUndo with Ctrl+Z on Mac (uses metaKey)', () => {
      mockPlatform('MacIntel')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', ctrlKey: true })

      expect(handlers.onUndo).not.toHaveBeenCalled()
    })

    it('does NOT trigger onUndo with Cmd+Z on Windows (uses ctrlKey)', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', metaKey: true })

      expect(handlers.onUndo).not.toHaveBeenCalled()
    })

    it('does NOT trigger onUndo with Ctrl+Shift+Z (that is redo)', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', ctrlKey: true, shiftKey: true })

      expect(handlers.onUndo).not.toHaveBeenCalled()
      expect(handlers.onRedo).toHaveBeenCalledTimes(1)
    })

    it('handles uppercase Z key', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'Z', ctrlKey: true })

      expect(handlers.onUndo).toHaveBeenCalledTimes(1)
    })

    it('calls preventDefault on Ctrl+Z', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: 'z',
        ctrlKey: true,
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // REDO SHORTCUT TESTS (Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y)
  // ===========================================================================
  describe('Redo Shortcut (Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y)', () => {
    it('triggers onRedo with Ctrl+Shift+Z on Windows', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', ctrlKey: true, shiftKey: true })

      expect(handlers.onRedo).toHaveBeenCalledTimes(1)
    })

    it('triggers onRedo with Cmd+Shift+Z on Mac', () => {
      mockPlatform('MacIntel')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', metaKey: true, shiftKey: true })

      expect(handlers.onRedo).toHaveBeenCalledTimes(1)
    })

    it('triggers onRedo with Ctrl+Y on Windows', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'y', ctrlKey: true })

      expect(handlers.onRedo).toHaveBeenCalledTimes(1)
    })

    it('triggers onRedo with Cmd+Y on Mac', () => {
      mockPlatform('MacIntel')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'y', metaKey: true })

      expect(handlers.onRedo).toHaveBeenCalledTimes(1)
    })

    it('handles uppercase Y key', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'Y', ctrlKey: true })

      expect(handlers.onRedo).toHaveBeenCalledTimes(1)
    })

    it('calls preventDefault on Ctrl+Shift+Z', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('calls preventDefault on Ctrl+Y', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: 'y',
        ctrlKey: true,
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // HINT SHORTCUT TESTS (H key)
  // ===========================================================================
  describe('Hint Shortcut (H key)', () => {
    it('triggers onHint with H key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'h' })

      expect(handlers.onHint).toHaveBeenCalledTimes(1)
    })

    it('handles uppercase H key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'H' })

      expect(handlers.onHint).toHaveBeenCalledTimes(1)
    })

    it('does NOT trigger onHint with Ctrl+H', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'h', ctrlKey: true })

      expect(handlers.onHint).not.toHaveBeenCalled()
    })

    it('does NOT trigger onHint with Alt+H', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'h', altKey: true })

      expect(handlers.onHint).not.toHaveBeenCalled()
    })

    it('calls preventDefault on H key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: 'h',
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // TOGGLE NOTES MODE SHORTCUT TESTS (N key)
  // ===========================================================================
  describe('Toggle Notes Mode Shortcut (N key)', () => {
    it('triggers onToggleNotesMode with N key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'n' })

      expect(handlers.onToggleNotesMode).toHaveBeenCalledTimes(1)
    })

    it('handles uppercase N key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'N' })

      expect(handlers.onToggleNotesMode).toHaveBeenCalledTimes(1)
    })

    it('does NOT trigger onToggleNotesMode with Ctrl+N', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'n', ctrlKey: true })

      expect(handlers.onToggleNotesMode).not.toHaveBeenCalled()
    })

    it('does NOT trigger onToggleNotesMode with Alt+N', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'n', altKey: true })

      expect(handlers.onToggleNotesMode).not.toHaveBeenCalled()
    })

    it('calls preventDefault on N key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: 'n',
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // VALIDATE SHORTCUT TESTS (V key)
  // ===========================================================================
  describe('Validate Shortcut (V key)', () => {
    it('triggers onValidate with V key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'v' })

      expect(handlers.onValidate).toHaveBeenCalledTimes(1)
    })

    it('handles uppercase V key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'V' })

      expect(handlers.onValidate).toHaveBeenCalledTimes(1)
    })

    it('does NOT trigger onValidate with Ctrl+V (paste)', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'v', ctrlKey: true })

      expect(handlers.onValidate).not.toHaveBeenCalled()
    })

    it('does NOT trigger onValidate with Alt+V', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'v', altKey: true })

      expect(handlers.onValidate).not.toHaveBeenCalled()
    })

    it('calls preventDefault on V key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: 'v',
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // ESCAPE SHORTCUT TESTS
  // ===========================================================================
  describe('Escape Shortcut', () => {
    it('triggers onClearAllAndDeselect with Escape key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'Escape' })

      expect(handlers.onClearAllAndDeselect).toHaveBeenCalledTimes(1)
    })

    it('calls preventDefault on Escape key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: 'Escape',
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // SPACE KEY SHORTCUT TESTS (Toggle Notes Mode Alternative)
  // ===========================================================================
  describe('Space Key Shortcut (Toggle Notes Mode)', () => {
    it('triggers onToggleNotesMode with Space key', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: ' ' })

      expect(handlers.onToggleNotesMode).toHaveBeenCalledTimes(1)
    })

    it('does NOT trigger onToggleNotesMode with Ctrl+Space', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: ' ', ctrlKey: true })

      expect(handlers.onToggleNotesMode).not.toHaveBeenCalled()
    })

    it('does NOT trigger onToggleNotesMode when active element is BUTTON', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // Create and focus a button
      const button = document.createElement('button')
      document.body.appendChild(button)
      button.focus()

      dispatchKeyDown({ key: ' ' })

      expect(handlers.onToggleNotesMode).not.toHaveBeenCalled()

      // Cleanup
      document.body.removeChild(button)
    })

    it('does NOT trigger onToggleNotesMode when active element is A (anchor)', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // Create and focus an anchor
      const anchor = document.createElement('a')
      anchor.href = '#'
      document.body.appendChild(anchor)
      anchor.focus()

      dispatchKeyDown({ key: ' ' })

      expect(handlers.onToggleNotesMode).not.toHaveBeenCalled()

      // Cleanup
      document.body.removeChild(anchor)
    })

    it('triggers onToggleNotesMode when active element is DIV', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // Create and focus a div (with tabIndex to make it focusable)
      const div = document.createElement('div')
      div.tabIndex = 0
      document.body.appendChild(div)
      div.focus()

      dispatchKeyDown({ key: ' ' })

      expect(handlers.onToggleNotesMode).toHaveBeenCalledTimes(1)

      // Cleanup
      document.body.removeChild(div)
    })

    it('calls preventDefault on Space key when handler fires', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: ' ',
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })

    it('does NOT call preventDefault on Space when active element is BUTTON', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // Create and focus a button
      const button = document.createElement('button')
      document.body.appendChild(button)
      button.focus()

      const { event, preventDefaultSpy } = createKeyEventWithPreventDefault({
        key: ' ',
      })
      document.dispatchEvent(event)

      expect(preventDefaultSpy).not.toHaveBeenCalled()

      // Cleanup
      document.body.removeChild(button)
    })
  })

  // ===========================================================================
  // DISABLED OPTION TESTS
  // ===========================================================================
  describe('Disabled Option', () => {
    it('does NOT trigger any handler when disabled=true', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers, { disabled: true }))

      // Try all shortcuts
      dispatchKeyDown({ key: 'z', ctrlKey: true })
      dispatchKeyDown({ key: 'z', ctrlKey: true, shiftKey: true })
      dispatchKeyDown({ key: 'y', ctrlKey: true })
      dispatchKeyDown({ key: 'h' })
      dispatchKeyDown({ key: 'n' })
      dispatchKeyDown({ key: 'v' })
      dispatchKeyDown({ key: 'Escape' })
      dispatchKeyDown({ key: ' ' })

      expect(handlers.onUndo).not.toHaveBeenCalled()
      expect(handlers.onRedo).not.toHaveBeenCalled()
      expect(handlers.onHint).not.toHaveBeenCalled()
      expect(handlers.onToggleNotesMode).not.toHaveBeenCalled()
      expect(handlers.onValidate).not.toHaveBeenCalled()
      expect(handlers.onClearAllAndDeselect).not.toHaveBeenCalled()
    })

    it('triggers handlers when disabled=false (explicit)', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers, { disabled: false }))

      dispatchKeyDown({ key: 'h' })

      expect(handlers.onHint).toHaveBeenCalledTimes(1)
    })

    it('triggers handlers when options not provided (default)', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'h' })

      expect(handlers.onHint).toHaveBeenCalledTimes(1)
    })

    it('respects disabled state change from false to true', () => {
      const handlers = createMockHandlers()
      const { rerender } = renderHook(
        ({ disabled }) => useKeyboardShortcuts(handlers, { disabled }),
        { initialProps: { disabled: false } }
      )

      // Initially enabled
      dispatchKeyDown({ key: 'h' })
      expect(handlers.onHint).toHaveBeenCalledTimes(1)

      // Disable
      rerender({ disabled: true })

      dispatchKeyDown({ key: 'h' })
      expect(handlers.onHint).toHaveBeenCalledTimes(1) // Still 1, not 2
    })

    it('respects disabled state change from true to false', () => {
      const handlers = createMockHandlers()
      const { rerender } = renderHook(
        ({ disabled }) => useKeyboardShortcuts(handlers, { disabled }),
        { initialProps: { disabled: true } }
      )

      // Initially disabled
      dispatchKeyDown({ key: 'h' })
      expect(handlers.onHint).not.toHaveBeenCalled()

      // Enable
      rerender({ disabled: false })

      dispatchKeyDown({ key: 'h' })
      expect(handlers.onHint).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // INPUT/TEXTAREA EXCLUSION TESTS
  // ===========================================================================
  describe('Input/Textarea Exclusion', () => {
    it('does NOT trigger handlers when target is HTMLInputElement', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // Create an input element
      const input = document.createElement('input')
      document.body.appendChild(input)

      // Create event with input as target
      const event = new KeyboardEvent('keydown', {
        key: 'h',
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'target', { value: input, writable: false })
      document.dispatchEvent(event)

      expect(handlers.onHint).not.toHaveBeenCalled()

      // Cleanup
      document.body.removeChild(input)
    })

    it('does NOT trigger handlers when target is HTMLTextAreaElement', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // Create a textarea element
      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)

      // Create event with textarea as target
      const event = new KeyboardEvent('keydown', {
        key: 'n',
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'target', { value: textarea, writable: false })
      document.dispatchEvent(event)

      expect(handlers.onToggleNotesMode).not.toHaveBeenCalled()

      // Cleanup
      document.body.removeChild(textarea)
    })

    it('does NOT trigger Undo when target is input', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      const input = document.createElement('input')
      document.body.appendChild(input)

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'target', { value: input, writable: false })
      document.dispatchEvent(event)

      expect(handlers.onUndo).not.toHaveBeenCalled()

      document.body.removeChild(input)
    })

    it('triggers handlers when target is regular element', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // Create a div element
      const div = document.createElement('div')
      document.body.appendChild(div)

      // Create event with div as target
      const event = new KeyboardEvent('keydown', {
        key: 'h',
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'target', { value: div, writable: false })
      document.dispatchEvent(event)

      expect(handlers.onHint).toHaveBeenCalledTimes(1)

      // Cleanup
      document.body.removeChild(div)
    })
  })

  // ===========================================================================
  // PLATFORM DETECTION TESTS
  // ===========================================================================
  describe('Platform Detection', () => {
    it('detects Mac platform correctly (MacIntel)', () => {
      mockPlatform('MacIntel')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // metaKey should work on Mac
      dispatchKeyDown({ key: 'z', metaKey: true })
      expect(handlers.onUndo).toHaveBeenCalledTimes(1)

      // ctrlKey should NOT work on Mac for undo
      dispatchKeyDown({ key: 'z', ctrlKey: true })
      expect(handlers.onUndo).toHaveBeenCalledTimes(1) // Still 1
    })

    it('detects Mac platform correctly (MacPPC)', () => {
      mockPlatform('MacPPC')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', metaKey: true })
      expect(handlers.onUndo).toHaveBeenCalledTimes(1)
    })

    it('detects Windows platform correctly', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // ctrlKey should work on Windows
      dispatchKeyDown({ key: 'z', ctrlKey: true })
      expect(handlers.onUndo).toHaveBeenCalledTimes(1)

      // metaKey should NOT work on Windows for undo
      dispatchKeyDown({ key: 'z', metaKey: true })
      expect(handlers.onUndo).toHaveBeenCalledTimes(1) // Still 1
    })

    it('detects Linux platform correctly (uses ctrlKey)', () => {
      mockPlatform('Linux x86_64')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', ctrlKey: true })
      expect(handlers.onUndo).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // CLEANUP TESTS
  // ===========================================================================
  describe('Cleanup on Unmount', () => {
    it('removes event listener when hook unmounts', () => {
      const handlers = createMockHandlers()
      const { unmount } = renderHook(() => useKeyboardShortcuts(handlers))

      // Handler works before unmount
      dispatchKeyDown({ key: 'h' })
      expect(handlers.onHint).toHaveBeenCalledTimes(1)

      // Unmount the hook
      unmount()

      // Handler should NOT be called after unmount
      dispatchKeyDown({ key: 'h' })
      expect(handlers.onHint).toHaveBeenCalledTimes(1) // Still 1
    })

    it('removes event listener when re-rendered with different handlers', () => {
      const handlers1 = createMockHandlers()
      const handlers2 = createMockHandlers()
      
      const { rerender } = renderHook(
        ({ handlers }) => useKeyboardShortcuts(handlers),
        { initialProps: { handlers: handlers1 } }
      )

      dispatchKeyDown({ key: 'h' })
      expect(handlers1.onHint).toHaveBeenCalledTimes(1)
      expect(handlers2.onHint).not.toHaveBeenCalled()

      // Rerender with new handlers
      rerender({ handlers: handlers2 })

      dispatchKeyDown({ key: 'h' })
      expect(handlers1.onHint).toHaveBeenCalledTimes(1) // Still 1 (old handler not called)
      expect(handlers2.onHint).toHaveBeenCalledTimes(1) // New handler called
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('Edge Cases', () => {
    it('handles multiple rapid key presses', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'h' })
      dispatchKeyDown({ key: 'h' })
      dispatchKeyDown({ key: 'h' })

      expect(handlers.onHint).toHaveBeenCalledTimes(3)
    })

    it('handles mixed shortcuts in sequence', () => {
      mockPlatform('Win32')
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z', ctrlKey: true })
      dispatchKeyDown({ key: 'h' })
      dispatchKeyDown({ key: 'n' })
      dispatchKeyDown({ key: 'Escape' })

      expect(handlers.onUndo).toHaveBeenCalledTimes(1)
      expect(handlers.onHint).toHaveBeenCalledTimes(1)
      expect(handlers.onToggleNotesMode).toHaveBeenCalledTimes(1)
      expect(handlers.onClearAllAndDeselect).toHaveBeenCalledTimes(1)
    })

    it('does NOT trigger handlers for unrecognized keys', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'x' })
      dispatchKeyDown({ key: 'q' })
      dispatchKeyDown({ key: '1' })
      dispatchKeyDown({ key: 'Enter' })

      expect(handlers.onUndo).not.toHaveBeenCalled()
      expect(handlers.onRedo).not.toHaveBeenCalled()
      expect(handlers.onHint).not.toHaveBeenCalled()
      expect(handlers.onToggleNotesMode).not.toHaveBeenCalled()
      expect(handlers.onValidate).not.toHaveBeenCalled()
      expect(handlers.onClearAllAndDeselect).not.toHaveBeenCalled()
    })

    it('handles Z key without modifier (not a shortcut)', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'z' })

      expect(handlers.onUndo).not.toHaveBeenCalled()
      expect(handlers.onRedo).not.toHaveBeenCalled()
    })

    it('handles Y key without modifier (not a shortcut)', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      dispatchKeyDown({ key: 'y' })

      expect(handlers.onRedo).not.toHaveBeenCalled()
    })

    it('does not trigger multiple handlers for single key press', () => {
      const handlers = createMockHandlers()
      renderHook(() => useKeyboardShortcuts(handlers))

      // N key should only trigger onToggleNotesMode
      dispatchKeyDown({ key: 'n' })

      expect(handlers.onToggleNotesMode).toHaveBeenCalledTimes(1)
      expect(handlers.onUndo).not.toHaveBeenCalled()
      expect(handlers.onRedo).not.toHaveBeenCalled()
      expect(handlers.onHint).not.toHaveBeenCalled()
      expect(handlers.onValidate).not.toHaveBeenCalled()
      expect(handlers.onClearAllAndDeselect).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // HANDLER UPDATES
  // ===========================================================================
  describe('Handler Updates', () => {
    it('uses updated handlers after rerender', () => {
      const handlers1 = createMockHandlers()
      const handlers2 = createMockHandlers()

      const { rerender } = renderHook(
        ({ handlers }) => useKeyboardShortcuts(handlers),
        { initialProps: { handlers: handlers1 } }
      )

      dispatchKeyDown({ key: 'h' })
      expect(handlers1.onHint).toHaveBeenCalledTimes(1)

      rerender({ handlers: handlers2 })

      dispatchKeyDown({ key: 'h' })
      expect(handlers2.onHint).toHaveBeenCalledTimes(1)
    })

    it('handles handler function changing', () => {
      const initialOnHint = vi.fn()
      const updatedOnHint = vi.fn()

      const handlers: KeyboardShortcutHandlers = {
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onHint: initialOnHint,
        onValidate: vi.fn(),
        onToggleNotesMode: vi.fn(),
        onClearAllAndDeselect: vi.fn(),
      }

      const { rerender } = renderHook(
        ({ h }) => useKeyboardShortcuts(h),
        { initialProps: { h: handlers } }
      )

      dispatchKeyDown({ key: 'h' })
      expect(initialOnHint).toHaveBeenCalledTimes(1)

      // Update the handler
      const updatedHandlers = { ...handlers, onHint: updatedOnHint }
      rerender({ h: updatedHandlers })

      dispatchKeyDown({ key: 'h' })
      expect(updatedOnHint).toHaveBeenCalledTimes(1)
      expect(initialOnHint).toHaveBeenCalledTimes(1) // Still 1
    })
  })
})
