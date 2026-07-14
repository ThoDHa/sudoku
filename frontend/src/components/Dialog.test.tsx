import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { vi, afterEach, describe, it, expect } from 'vitest'
import { Dialog } from './Dialog'

afterEach(cleanup)

function Modal({
  isOpen = true,
  onClose = () => {},
}: { isOpen?: boolean; onClose?: () => void } = {}) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} titleId="dialog-title">
      <h2 id="dialog-title">Title</h2>
      <button>One</button>
      <button>Two</button>
    </Dialog>
  )
}

describe('Dialog accessibility semantics', () => {
  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('exposes role=dialog, aria-modal=true, and aria-labelledby', () => {
    render(<Modal />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title')
  })
})

describe('Dialog focus trap', () => {
  it('moves focus to the first focusable element on open', () => {
    render(<Modal />)
    expect(document.activeElement).toBe(screen.getByText('One'))
  })

  it('wraps Tab focus from the last element back to the first', () => {
    render(<Modal />)
    const last = screen.getByText('Two')
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByText('One'))
  })

  it('wraps Shift+Tab focus from the first element to the last', () => {
    render(<Modal />)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByText('Two'))
  })

  it('restores focus to the triggering element on close', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const { unmount } = render(<Modal />)
    expect(document.activeElement).toBe(screen.getByText('One'))

    unmount()
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })
})

describe('Dialog close behavior', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)
    fireEvent.click(document.querySelector('[data-overlay-backdrop]')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when a panel element is clicked', () => {
    const onClose = vi.fn()
    render(<Modal onClose={onClose} />)
    fireEvent.click(screen.getByText('Title'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('honors closeOnEscape=false', () => {
    const onClose = vi.fn()
    render(
      <Dialog isOpen onClose={onClose} titleId="t" closeOnEscape={false}>
        <h2 id="t">T</h2>
      </Dialog>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
