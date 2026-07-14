import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Toast } from './Toast'

describe('Toast live-region semantics', () => {
  it('defaults to role=status with aria-live=polite', () => {
    render(<Toast>saved</Toast>)
    const toast = screen.getByRole('status')
    expect(toast).toHaveAttribute('aria-live', 'polite')
    expect(toast).toHaveTextContent('saved')
  })

  it('supports role=alert with aria-live=assertive for errors', () => {
    render(<Toast role="alert">something broke</Toast>)
    const toast = screen.getByRole('alert')
    expect(toast).toHaveAttribute('aria-live', 'assertive')
  })
})
