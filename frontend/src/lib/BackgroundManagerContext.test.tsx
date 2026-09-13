import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { BackgroundManagerProvider, useBackgroundManagerContext } from './BackgroundManagerContext'

describe('BackgroundManagerContext defensive arms', () => {
  it('throws when useBackgroundManagerContext is called outside a BackgroundManagerProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Consumer = () => {
      useBackgroundManagerContext()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(
      'useBackgroundManagerContext must be used within a BackgroundManagerProvider',
    )
    spy.mockRestore()
  })

  it('shares one BackgroundManager instance with every consumer under the provider', () => {
    const seen: unknown[] = []
    const Consumer = () => {
      seen.push(useBackgroundManagerContext())
      return null
    }

    render(
      <BackgroundManagerProvider>
        <Consumer />
        <Consumer />
      </BackgroundManagerProvider>,
    )

    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])
    expect(seen[0]).toHaveProperty('shouldPauseOperations')
  })
})
