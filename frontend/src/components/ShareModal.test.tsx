import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import ShareModal from './ShareModal'

function renderModal(overrides: Partial<Parameters<typeof ShareModal>[0]> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onSharePuzzle: vi.fn(),
    onShareState: vi.fn(),
    ...overrides,
  }
  render(<ShareModal {...props} />)
  return props
}

describe('ShareModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByText('Share puzzle')).toBeNull()
  })

  it('shows both options and a close button when open', () => {
    renderModal()
    expect(screen.getByText('Share puzzle')).toBeInTheDocument()
    expect(screen.getByText('Share my current game')).toBeInTheDocument()
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })

  it('shares the puzzle and closes when the first option is chosen', () => {
    const props = renderModal()
    fireEvent.click(screen.getByText('Share puzzle'))
    expect(props.onSharePuzzle).toHaveBeenCalledTimes(1)
    expect(props.onShareState).not.toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('shares the current game and closes when the second option is chosen', () => {
    const props = renderModal()
    fireEvent.click(screen.getByText('Share my current game'))
    expect(props.onShareState).toHaveBeenCalledTimes(1)
    expect(props.onSharePuzzle).not.toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('closes via the X button', () => {
    const props = renderModal()
    fireEvent.click(screen.getByLabelText('Close'))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', () => {
    const props = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
