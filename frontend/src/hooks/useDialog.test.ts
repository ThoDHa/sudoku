import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { vi, afterEach, describe, it, expect } from 'vitest'
import { useDialog } from './useDialog'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

interface HarnessProps {
  open?: boolean
  onClose?: () => void
  closeOnEscape?: boolean
  children?: ReactNode
}

// Mirrors a real consumer: spreads the hook's returned props onto a mounted
// panel element and renders nothing while closed, exactly as Dialog.tsx does.
function Harness({ open = true, onClose = () => {}, closeOnEscape, children }: HarnessProps) {
  const panel = useDialog({
    open,
    onClose,
    ...(closeOnEscape !== undefined ? { closeOnEscape } : {}),
  })
  if (!open) return null
  return createElement('div', { ...panel, 'data-testid': 'panel' }, children)
}

function renderHarness(props: HarnessProps = {}, children?: ReactNode) {
  return render(createElement(Harness, { ...props, children }))
}

describe('useDialog', () => {
  describe('Escape handling', () => {
    it('closes on Escape using the closeOnEscape default when the prop is omitted', () => {
      const onClose = vi.fn()
      render(createElement(Harness, { onClose }, createElement('button', null, 'One')))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not close on a key that is neither Escape nor Tab', () => {
      const onClose = vi.fn()
      render(createElement(Harness, { onClose }, createElement('button', null, 'One')))
      fireEvent.keyDown(document, { key: 'a' })
      expect(onClose).not.toHaveBeenCalled()
    })

    it('does not react to Escape while closed', () => {
      const onClose = vi.fn()
      render(createElement(Harness, { open: false, onClose }, createElement('button', null, 'One')))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
    })

    it('picks up onClose and closeOnEscape changes between renders', () => {
      const first = vi.fn()
      const second = vi.fn()
      const { rerender } = renderHarness({ onClose: first, closeOnEscape: false })
      rerender(createElement(Harness, { onClose: second }))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(second).toHaveBeenCalledTimes(1)
      expect(first).not.toHaveBeenCalled()
    })
  })

  describe('focus trap', () => {
    it('focuses the panel on Tab when the dialog has no focusable children', () => {
      render(createElement(Harness, {}, createElement('p', null, 'text only')))
      const outside = document.createElement('button')
      outside.textContent = 'Outside'
      document.body.appendChild(outside)
      outside.focus()
      expect(document.activeElement).toBe(outside)
      fireEvent.keyDown(document, { key: 'Tab' })
      expect(document.activeElement).toBe(screen.getByTestId('panel'))
      document.body.removeChild(outside)
    })

    it('leaves focus untouched on a key that is neither Escape nor Tab', () => {
      render(
        createElement(
          Harness,
          {},
          createElement('button', null, 'One'),
          createElement('button', null, 'Two'),
        ),
      )
      const last = screen.getByText('Two')
      last.focus()
      expect(document.activeElement).toBe(last)
      fireEvent.keyDown(document, { key: 'a' })
      expect(document.activeElement).toBe(last)
    })

    it('leaves focus on a middle element when Tab is pressed from it', () => {
      render(
        createElement(
          Harness,
          {},
          createElement('button', null, 'One'),
          createElement('button', null, 'Two'),
          createElement('button', null, 'Three'),
        ),
      )
      const middle = screen.getByText('Two')
      middle.focus()
      fireEvent.keyDown(document, { key: 'Tab' })
      expect(document.activeElement).toBe(middle)
    })

    it('leaves focus on a middle element when Shift+Tab is pressed from it', () => {
      render(
        createElement(
          Harness,
          {},
          createElement('button', null, 'One'),
          createElement('button', null, 'Two'),
          createElement('button', null, 'Three'),
        ),
      )
      const middle = screen.getByText('Two')
      middle.focus()
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(middle)
    })
  })

  describe('dialog stack', () => {
    it('lets only the topmost dialog handle Escape', () => {
      const onOuterClose = vi.fn()
      const onInnerClose = vi.fn()
      render(
        createElement(Harness, { onClose: onOuterClose }, createElement('button', null, 'Outer')),
      )
      render(
        createElement(Harness, { onClose: onInnerClose }, createElement('button', null, 'Inner')),
      )
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onInnerClose).toHaveBeenCalledTimes(1)
      expect(onOuterClose).not.toHaveBeenCalled()
    })

    it('returns key handling to the outer dialog after the topmost dialog closes', () => {
      const onOuterClose = vi.fn()
      const onInnerClose = vi.fn()
      render(
        createElement(Harness, { onClose: onOuterClose }, createElement('button', null, 'Outer')),
      )
      const inner = render(
        createElement(Harness, { onClose: onInnerClose }, createElement('button', null, 'Inner')),
      )
      inner.unmount()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onOuterClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('open toggling and cleanup', () => {
    it('stops handling keys after being closed by a rerender', () => {
      const onClose = vi.fn()
      const { rerender } = renderHarness({ onClose }, createElement('button', null, 'One'))
      rerender(
        createElement(Harness, { open: false, onClose }, createElement('button', null, 'One')),
      )
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
    })

    it('restores focus to the trigger when closed by a rerender', () => {
      const trigger = document.createElement('button')
      trigger.textContent = 'Trigger'
      document.body.appendChild(trigger)
      trigger.focus()
      const { rerender } = renderHarness({}, createElement('button', null, 'One'))
      expect(document.activeElement).toBe(screen.getByText('One'))
      rerender(createElement(Harness, { open: false }, createElement('button', null, 'One')))
      expect(document.activeElement).toBe(trigger)
      document.body.removeChild(trigger)
    })

    it('handles Escape exactly once per press after closing and reopening', () => {
      const onClose = vi.fn()
      const { rerender } = renderHarness({ onClose }, createElement('button', null, 'One'))
      rerender(
        createElement(Harness, { open: false, onClose }, createElement('button', null, 'One')),
      )
      rerender(createElement(Harness, { onClose }, createElement('button', null, 'One')))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('unmounts cleanly when nothing was focused before opening', () => {
      const { unmount } = renderHarness({}, createElement('button', null, 'One'))
      expect(() => unmount()).not.toThrow()
    })

    it('removes its keydown listener when the dialog closes', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener')
      const { unmount } = renderHarness({}, createElement('button', null, 'One'))
      unmount()
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    })

    // document.activeElement is a prototype accessor; an own-property getter
    // shadows it so the test controls what the hook remembers on open. A
    // throwing focus restore surfaces as a window error event or console.error
    // (React 19 routes uncaught cleanup errors through whichever exists).
    async function expectNoErrorRestoringFocusFrom(activeElement: unknown) {
      const reported: ErrorEvent[] = []
      const onError = (e: ErrorEvent) => reported.push(e)
      window.addEventListener('error', onError)
      vi.spyOn(console, 'error').mockImplementation(() => {})
      Object.defineProperty(document, 'activeElement', {
        configurable: true,
        get: () => activeElement,
      })
      try {
        const { unmount } = renderHarness({}, createElement('button', null, 'One'))
        unmount()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(reported).toEqual([])
        expect(console.error).not.toHaveBeenCalled()
      } finally {
        window.removeEventListener('error', onError)
        delete (document as { activeElement?: unknown }).activeElement
      }
    }

    it('restores nothing and reports no error when no element was focused before opening', async () => {
      await expectNoErrorRestoringFocusFrom(null)
    })

    it('restores nothing and reports no error when the remembered element cannot take focus', async () => {
      await expectNoErrorRestoringFocusFrom({})
    })
  })

  describe('returned panel props', () => {
    it('returns a panel that is programmatically focusable but out of tab order', () => {
      render(createElement(Harness, {}, createElement('button', null, 'One')))
      expect(screen.getByTestId('panel')).toHaveAttribute('tabindex', '-1')
    })

    it('returns exactly the documented panel props when titleId is omitted', () => {
      let captured: ReturnType<typeof useDialog> | undefined
      function Probe() {
        captured = useDialog({ open: true, onClose: () => {} })
        return null
      }
      render(createElement(Probe))
      expect(captured).toStrictEqual({
        ref: expect.any(Object),
        role: 'dialog',
        'aria-modal': true,
        tabIndex: -1,
      })
    })

    it('keeps focus handling with the remaining dialog after another dialog unmounts', () => {
      // The open-dialog stack has to track exactly the mounted dialogs: a
      // leaked entry would leave an unmounted panel topmost so the surviving
      // dialog stops reacting, and a missing entry leaves nothing topmost at
      // all.
      const first = render(createElement(Harness, {}, createElement('button', null, 'One')))
      const second = render(createElement(Harness, {}, createElement('button', null, 'Two')))

      screen.getByText('Two').focus()
      fireEvent.keyDown(document, { key: 'Tab' })
      // The topmost dialog re-claims focus onto its own first focusable element.
      expect(document.activeElement).toBe(screen.getByText('Two'))

      second.unmount()
      // The remaining dialog is topmost again and handles Tab itself.
      screen.getByText('One').focus()
      fireEvent.keyDown(document, { key: 'Tab' })
      expect(document.activeElement).toBe(screen.getByText('One'))

      first.unmount()
      render(createElement(Harness, {}, createElement('button', null, 'Three')))
      screen.getByText('Three').focus()
      fireEvent.keyDown(document, { key: 'Tab' })
      expect(document.activeElement).toBe(screen.getByText('Three'))
    })
  })
})
