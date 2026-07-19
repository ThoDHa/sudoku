import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TimerProvider, useTimer, useTimerControl, useTimerDisplay } from './TimerContext'
import { BackgroundManagerProvider } from './BackgroundManagerContext'

// jsdom does not implement window.matchMedia; BackgroundManagerProvider does
// not need it but keeping the stub matches the production browser environment.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// TimerProvider needs BackgroundManagerProvider as an ancestor; wrap once so
// each test mounts the hook consumer inside the full provider stack.
function mountWithProvider(node: React.ReactNode) {
  return render(
    <BackgroundManagerProvider>
      <TimerProvider>{node}</TimerProvider>
    </BackgroundManagerProvider>,
  )
}

describe('TimerContext defensive arms', () => {
  it('throws when useTimerControl is called outside a TimerProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Consumer = () => {
      useTimerControl()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(
      'useTimerControl must be used within a TimerProvider',
    )
    spy.mockRestore()
  })

  it('throws when useTimerDisplay is called outside a TimerProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Consumer = () => {
      useTimerDisplay()
      return null
    }

    expect(() => render(<Consumer />)).toThrow(
      'useTimerDisplay must be used within a TimerProvider',
    )
    spy.mockRestore()
  })

  it('combines control and display values when useTimer is called inside a TimerProvider', () => {
    // Reads a value from each context so the combinator's spread of both
    // objects executes at least once under coverage.
    const Consumer = () => {
      const timer = useTimer()
      return (
        <div data-testid="consumer">
          {typeof timer.startTimer === 'function' ? 'has-start' : 'no-start'}
          {typeof timer.formatTime === 'function' ? 'has-format' : 'no-format'}
        </div>
      )
    }

    const { getByTestId } = mountWithProvider(<Consumer />)
    expect(getByTestId('consumer').textContent).toBe('has-starthas-format')
  })
})
