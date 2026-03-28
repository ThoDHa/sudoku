import { vi } from 'vitest'

export const dispatchKeyDown = (options: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...options,
  })
  document.dispatchEvent(event)
  return event
}

export const createKeyEventWithPreventDefault = (options: KeyboardEventInit): {
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

export const mockPlatform = (platform: string) => {
  Object.defineProperty(navigator, 'platform', {
    configurable: true,
    get: () => platform,
  })
}
