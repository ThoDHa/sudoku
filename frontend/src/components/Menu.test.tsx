import React from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import Menu from './Menu'
import { dispatchKeyDown } from '../test-utils'

type MenuProps = React.ComponentProps<typeof Menu>

function defaultProps(overrides: Partial<MenuProps> = {}): MenuProps {
  return {
    isOpen: true,
    onClose: vi.fn(),
    mode: 'light',
    colorTheme: 'tokyonight',
    fontSize: 'medium',
    onSetMode: vi.fn(),
    onSetColorTheme: vi.fn(),
    onSetFontSize: vi.fn(),
    onCopyDebugInfo: vi.fn(),
    ...overrides,
  }
}

function renderMenu(props: Partial<MenuProps> = {}) {
  return render(
    <MemoryRouter>
      <Menu {...defaultProps(props)} />
    </MemoryRouter>,
  )
}

describe('Menu escape key handling', () => {
  it('calls onClose when Escape is pressed while the menu is open', () => {
    const onClose = vi.fn()
    renderMenu({ isOpen: true, onClose })

    dispatchKeyDown({ key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the menu is closed', () => {
    const onClose = vi.fn()
    renderMenu({ isOpen: false, onClose })

    dispatchKeyDown({ key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not call onClose for non-Escape keys', () => {
    const onClose = vi.fn()
    renderMenu({ isOpen: true, onClose })

    dispatchKeyDown({ key: 'Enter' })

    expect(onClose).not.toHaveBeenCalled()
  })
})
