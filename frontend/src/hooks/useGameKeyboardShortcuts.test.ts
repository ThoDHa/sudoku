import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useGameKeyboardShortcuts,
  type UseGameKeyboardShortcutsOptions,
} from './useGameKeyboardShortcuts'

function makeOptions(
  overrides: Partial<UseGameKeyboardShortcutsOptions> = {},
): UseGameKeyboardShortcutsOptions & {
  handleUndo: ReturnType<typeof vi.fn>
  handleRedo: ReturnType<typeof vi.fn>
  handleNext: ReturnType<typeof vi.fn>
  handleValidate: ReturnType<typeof vi.fn>
  clearAllAndDeselect: ReturnType<typeof vi.fn>
  setNotesMode: ReturnType<typeof vi.fn>
} {
  return {
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    handleNext: vi.fn(),
    handleValidate: vi.fn(),
    clearAllAndDeselect: vi.fn(),
    setNotesMode: vi.fn(),
    isModalOpen: false,
    ...overrides,
  }
}

function dispatchKeyDown(
  key: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {},
): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers }))
  })
}

function setPlatform(value: string): void {
  Object.defineProperty(navigator, 'platform', { value, configurable: true })
}

describe('useGameKeyboardShortcuts', () => {
  let originalPlatform: string

  beforeEach(() => {
    originalPlatform = navigator.platform
    setPlatform('Win32')
  })

  afterEach(() => {
    setPlatform(originalPlatform)
    document.body.innerHTML = ''
  })

  describe('early returns', () => {
    it('suppresses shortcuts when the keydown originates from an HTMLInputElement', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      const input = document.createElement('input')
      document.body.appendChild(input)

      act(() => {
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
        )
      })

      expect(options.handleUndo).not.toHaveBeenCalled()
    })

    it('suppresses shortcuts when the keydown originates from an HTMLTextAreaElement', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)

      act(() => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }))
      })

      expect(options.handleNext).not.toHaveBeenCalled()
    })

    it('suppresses shortcuts when isModalOpen is true', () => {
      const options = makeOptions({ isModalOpen: true })
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('h')

      expect(options.handleNext).not.toHaveBeenCalled()
    })
  })

  describe('undo (Ctrl/Cmd+Z without Shift)', () => {
    it('fires handleUndo on Ctrl+Z on a non-Mac platform', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('z', { ctrlKey: true })

      expect(options.handleUndo).toHaveBeenCalledTimes(1)
    })

    it('fires handleUndo on Cmd+Z on a Mac platform', () => {
      setPlatform('MacIntel')
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('z', { metaKey: true })

      expect(options.handleUndo).toHaveBeenCalledTimes(1)
    })

    it('fires handleUndo on Ctrl+Z with uppercase Z (case-insensitive)', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('Z', { ctrlKey: true })

      expect(options.handleUndo).toHaveBeenCalledTimes(1)
    })
  })

  describe('redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)', () => {
    it('fires handleRedo on Ctrl+Shift+Z', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('z', { ctrlKey: true, shiftKey: true })

      expect(options.handleRedo).toHaveBeenCalledTimes(1)
      expect(options.handleUndo).not.toHaveBeenCalled()
    })

    it('fires handleRedo on Ctrl+Y', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('y', { ctrlKey: true })

      expect(options.handleRedo).toHaveBeenCalledTimes(1)
    })

    it('fires handleRedo on Cmd+Shift+Z on a Mac platform', () => {
      setPlatform('MacIntel')
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('z', { metaKey: true, shiftKey: true })

      expect(options.handleRedo).toHaveBeenCalledTimes(1)
    })
  })

  describe('hint (H)', () => {
    it('fires handleNext on lowercase h', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('h')

      expect(options.handleNext).toHaveBeenCalledTimes(1)
    })

    it('fires handleNext on uppercase H (case-insensitive)', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('H')

      expect(options.handleNext).toHaveBeenCalledTimes(1)
    })

    it('does not fire handleNext when Ctrl is held', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('h', { ctrlKey: true })

      expect(options.handleNext).not.toHaveBeenCalled()
    })

    it('does not fire handleNext when Alt is held', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('h', { altKey: true })

      expect(options.handleNext).not.toHaveBeenCalled()
    })
  })

  describe('notes toggle (N)', () => {
    it('calls setNotesMode with a boolean toggling updater on lowercase n', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('n')

      expect(options.setNotesMode).toHaveBeenCalledTimes(1)
      const updater = options.setNotesMode.mock.calls[0][0] as (prev: boolean) => boolean
      expect(updater(true)).toBe(false)
      expect(updater(false)).toBe(true)
    })

    it('calls setNotesMode on uppercase N (case-insensitive)', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('N')

      expect(options.setNotesMode).toHaveBeenCalledTimes(1)
    })

    it('does not call setNotesMode when Ctrl is held', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('n', { ctrlKey: true })

      expect(options.setNotesMode).not.toHaveBeenCalled()
    })

    it('does not call setNotesMode when Alt is held', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('n', { altKey: true })

      expect(options.setNotesMode).not.toHaveBeenCalled()
    })
  })

  describe('validate (V)', () => {
    it('fires handleValidate on lowercase v', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('v')

      expect(options.handleValidate).toHaveBeenCalledTimes(1)
    })

    it('fires handleValidate on uppercase V (case-insensitive)', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('V')

      expect(options.handleValidate).toHaveBeenCalledTimes(1)
    })

    it('does not fire handleValidate when Ctrl is held', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('v', { ctrlKey: true })

      expect(options.handleValidate).not.toHaveBeenCalled()
    })

    it('does not fire handleValidate when Alt is held', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('v', { altKey: true })

      expect(options.handleValidate).not.toHaveBeenCalled()
    })
  })

  describe('deselect (Escape)', () => {
    it('fires clearAllAndDeselect on Escape', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown('Escape')

      expect(options.clearAllAndDeselect).toHaveBeenCalledTimes(1)
    })
  })

  describe('notes toggle via Space', () => {
    it('calls setNotesMode with a toggling updater when Space is pressed and no focusable element is active', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown(' ')

      expect(options.setNotesMode).toHaveBeenCalledTimes(1)
      const updater = options.setNotesMode.mock.calls[0][0] as (prev: boolean) => boolean
      expect(updater(true)).toBe(false)
      expect(updater(false)).toBe(true)
    })

    it('does not call setNotesMode when a BUTTON is the active element', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      const button = document.createElement('button')
      document.body.appendChild(button)
      button.focus()
      expect(document.activeElement).toBe(button)

      dispatchKeyDown(' ')

      expect(options.setNotesMode).not.toHaveBeenCalled()
    })

    it('does not call setNotesMode when an A (anchor) is the active element', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      const anchor = document.createElement('a')
      anchor.href = '#'
      document.body.appendChild(anchor)
      anchor.focus()

      dispatchKeyDown(' ')

      expect(options.setNotesMode).not.toHaveBeenCalled()
    })

    it('does not call setNotesMode when Ctrl is held together with Space', () => {
      const options = makeOptions()
      renderHook(() => useGameKeyboardShortcuts(options))

      dispatchKeyDown(' ', { ctrlKey: true })

      expect(options.setNotesMode).not.toHaveBeenCalled()
    })
  })

  describe('cleanup on unmount', () => {
    it('removes the keydown listener so no callback fires after unmount', () => {
      const options = makeOptions()
      const { unmount } = renderHook(() => useGameKeyboardShortcuts(options))

      unmount()

      dispatchKeyDown('h')

      expect(options.handleNext).not.toHaveBeenCalled()
    })
  })
})
