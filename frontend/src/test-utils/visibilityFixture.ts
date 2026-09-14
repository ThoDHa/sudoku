import { vi, beforeEach, afterEach } from 'vitest'

/**
 * Registers the shared visibility/fake-timer test fixture at the calling
 * describe block. The beforeEach fakes timers with shouldAdvanceTime enabled
 * and stubs document.visibilityState to 'visible' via a configurable getter;
 * the afterEach restores real timers and reinstates the original
 * visibilityState property descriptor, or deletes the stub when no descriptor
 * existed before it.
 *
 * Call at describe scope so the hooks register in the same order the
 * hand-rolled copies registered them (timers faked first), which keeps
 * Stryker's perTest mutant coverage identical to the inline fixture.
 */
export function installVisibleDocumentWithFakeTimers(): void {
  let originalVisibilityState: PropertyDescriptor | undefined

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Mock document.visibilityState to 'visible' by default
    originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    // Restore original visibilityState
    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState)
    } else {
      // @ts-expect-error - restoring default
      delete document.visibilityState
    }
  })
}
