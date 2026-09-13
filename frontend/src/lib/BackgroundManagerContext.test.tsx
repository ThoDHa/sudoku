import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { BackgroundManagerProvider, useBackgroundManagerContext } from './BackgroundManagerContext'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BackgroundManagerContext defensive arms', () => {
  it('throws when useBackgroundManagerContext is called outside a BackgroundManagerProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Consumer = () => {
      useBackgroundManagerContext()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(
      'useBackgroundManagerContext must be used within a BackgroundManagerProvider',
    )
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
