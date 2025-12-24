import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRef, RefObject } from 'react'
import { useClickOutside } from './useClickOutside'

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Creates a DOM element and appends it to the document body.
 * Returns the element for use in tests.
 */
function createDOMElement(tagName: string = 'div'): HTMLElement {
  const element = document.createElement(tagName)
  document.body.appendChild(element)
  return element
}

/**
 * Removes an element from the document body.
 */
function removeDOMElement(element: HTMLElement): void {
  if (element.parentNode) {
    element.parentNode.removeChild(element)
  }
}

/**
 * Creates a mousedown event and dispatches it on the specified target.
 * Note: We omit the 'view' property because jsdom has issues with it.
 */
function simulateMouseDown(target: EventTarget): void {
  const event = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
}

/**
 * Custom wrapper to test hooks with refs.
 * This creates a hook that manages both the ref and the useClickOutside call.
 */
function setupHook(
  element: HTMLElement | null,
  isActive: boolean,
  onClickOutside: () => void
) {
  return renderHook(
    ({ element, isActive, onClickOutside }) => {
      const ref = useRef<HTMLElement>(element)
      useClickOutside(ref as RefObject<HTMLElement>, isActive, onClickOutside)
      return { ref }
    },
    {
      initialProps: { element, isActive, onClickOutside },
    }
  )
}

// =============================================================================
// TESTS
// =============================================================================

describe('useClickOutside', () => {
  let testElement: HTMLElement
  let outsideElement: HTMLElement

  beforeEach(() => {
    // Create test elements before each test
    testElement = createDOMElement('div')
    testElement.setAttribute('data-testid', 'inside-element')
    
    outsideElement = createDOMElement('div')
    outsideElement.setAttribute('data-testid', 'outside-element')
  })

  afterEach(() => {
    // Clean up DOM elements after each test
    removeDOMElement(testElement)
    removeDOMElement(outsideElement)
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // CLICK OUTSIDE DETECTION TESTS
  // ===========================================================================
  describe('Click Outside Detection', () => {
    it('calls onClickOutside when clicking outside the referenced element', () => {
      const onClickOutside = vi.fn()
      
      setupHook(testElement, true, onClickOutside)
      
      simulateMouseDown(outsideElement)
      
      expect(onClickOutside).toHaveBeenCalledTimes(1)
    })

    it('calls onClickOutside when clicking on document body', () => {
      const onClickOutside = vi.fn()
      
      setupHook(testElement, true, onClickOutside)
      
      simulateMouseDown(document.body)
      
      expect(onClickOutside).toHaveBeenCalledTimes(1)
    })

    it('calls onClickOutside when dispatching event on document', () => {
      const onClickOutside = vi.fn()
      
      setupHook(testElement, true, onClickOutside)
      
      const event = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
      })
      document.dispatchEvent(event)
      
      expect(onClickOutside).toHaveBeenCalledTimes(1)
    })

    it('calls onClickOutside for each outside click', () => {
      const onClickOutside = vi.fn()
      
      setupHook(testElement, true, onClickOutside)
      
      simulateMouseDown(outsideElement)
      simulateMouseDown(outsideElement)
      simulateMouseDown(outsideElement)
      
      expect(onClickOutside).toHaveBeenCalledTimes(3)
    })
  })

  // ===========================================================================
  // CLICK INSIDE BEHAVIOR TESTS
  // ===========================================================================
  describe('Click Inside Behavior', () => {
    it('does NOT call onClickOutside when clicking inside the referenced element', () => {
      const onClickOutside = vi.fn()
      
      setupHook(testElement, true, onClickOutside)
      
      simulateMouseDown(testElement)
      
      expect(onClickOutside).not.toHaveBeenCalled()
    })

    it('does NOT call onClickOutside when clicking on a child element', () => {
      const onClickOutside = vi.fn()
      
      // Create a child element inside testElement
      const childElement = document.createElement('span')
      testElement.appendChild(childElement)
      
      setupHook(testElement, true, onClickOutside)
      
      simulateMouseDown(childElement)
      
      expect(onClickOutside).not.toHaveBeenCalled()
    })

    it('does NOT call onClickOutside when clicking on deeply nested child', () => {
      const onClickOutside = vi.fn()
      
      // Create nested children
      const level1 = document.createElement('div')
      const level2 = document.createElement('div')
      const level3 = document.createElement('button')
      
      level2.appendChild(level3)
      level1.appendChild(level2)
      testElement.appendChild(level1)
      
      setupHook(testElement, true, onClickOutside)
      
      simulateMouseDown(level3)
      
      expect(onClickOutside).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // ISACTIVE TOGGLE TESTS
  // ===========================================================================
  describe('isActive Toggle', () => {
    it('does NOT call onClickOutside when isActive is false', () => {
      const onClickOutside = vi.fn()
      
      setupHook(testElement, false, onClickOutside)
      
      simulateMouseDown(outsideElement)
      
      expect(onClickOutside).not.toHaveBeenCalled()
    })

    it('does NOT add event listener when isActive is false', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
      const onClickOutside = vi.fn()
      
      setupHook(testElement, false, onClickOutside)
      
      // Should not have added a mousedown listener
      expect(addEventListenerSpy).not.toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function)
      )
    })

    it('starts responding to clicks when isActive changes from false to true', () => {
      const onClickOutside = vi.fn()
      
      const { rerender } = setupHook(testElement, false, onClickOutside)
      
      // Click while inactive - should not trigger
      simulateMouseDown(outsideElement)
      expect(onClickOutside).not.toHaveBeenCalled()
      
      // Rerender with isActive = true
      rerender({ element: testElement, isActive: true, onClickOutside })
      
      // Click while active - should trigger
      simulateMouseDown(outsideElement)
      expect(onClickOutside).toHaveBeenCalledTimes(1)
    })

    it('stops responding to clicks when isActive changes from true to false', () => {
      const onClickOutside = vi.fn()
      
      const { rerender } = setupHook(testElement, true, onClickOutside)
      
      // Click while active - should trigger
      simulateMouseDown(outsideElement)
      expect(onClickOutside).toHaveBeenCalledTimes(1)
      
      // Rerender with isActive = false
      rerender({ element: testElement, isActive: false, onClickOutside })
      
      // Click while inactive - should not trigger
      simulateMouseDown(outsideElement)
      expect(onClickOutside).toHaveBeenCalledTimes(1) // Still just 1
    })

    it('handles multiple toggles of isActive correctly', () => {
      const onClickOutside = vi.fn()
      
      const { rerender } = setupHook(testElement, true, onClickOutside)
      
      // Active - triggers
      simulateMouseDown(outsideElement)
      expect(onClickOutside).toHaveBeenCalledTimes(1)
      
      // Inactive
      rerender({ element: testElement, isActive: false, onClickOutside })
      simulateMouseDown(outsideElement)
      expect(onClickOutside).toHaveBeenCalledTimes(1)
      
      // Active again
      rerender({ element: testElement, isActive: true, onClickOutside })
      simulateMouseDown(outsideElement)
      expect(onClickOutside).toHaveBeenCalledTimes(2)
      
      // Inactive again
      rerender({ element: testElement, isActive: false, onClickOutside })
      simulateMouseDown(outsideElement)
      expect(onClickOutside).toHaveBeenCalledTimes(2)
    })
  })

  // ===========================================================================
  // CLEANUP TESTS
  // ===========================================================================
  describe('Cleanup on Unmount', () => {
    it('removes event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const onClickOutside = vi.fn()
      
      const { unmount } = setupHook(testElement, true, onClickOutside)
      
      unmount()
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function)
      )
    })

    it('does not call onClickOutside after unmount', () => {
      const onClickOutside = vi.fn()
      
      const { unmount } = setupHook(testElement, true, onClickOutside)
      
      unmount()
      
      // Click after unmount - should not trigger
      simulateMouseDown(outsideElement)
      
      expect(onClickOutside).not.toHaveBeenCalled()
    })

    it('does not attempt to remove listener when isActive was false', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const onClickOutside = vi.fn()
      
      const { unmount } = setupHook(testElement, false, onClickOutside)
      
      unmount()
      
      // Should not have attempted to remove mousedown listener since none was added
      expect(removeEventListenerSpy).not.toHaveBeenCalledWith(
        'mousedown',
        expect.any(Function)
      )
    })
  })

  // ===========================================================================
  // RERENDER BEHAVIOR TESTS
  // ===========================================================================
  describe('Rerender Behavior', () => {
    it('uses updated callback after rerender', () => {
      const onClickOutside1 = vi.fn()
      const onClickOutside2 = vi.fn()
      
      const { rerender } = setupHook(testElement, true, onClickOutside1)
      
      // Click with first callback
      simulateMouseDown(outsideElement)
      expect(onClickOutside1).toHaveBeenCalledTimes(1)
      expect(onClickOutside2).not.toHaveBeenCalled()
      
      // Rerender with new callback
      rerender({ element: testElement, isActive: true, onClickOutside: onClickOutside2 })
      
      // Click with second callback
      simulateMouseDown(outsideElement)
      expect(onClickOutside1).toHaveBeenCalledTimes(1) // Still just 1
      expect(onClickOutside2).toHaveBeenCalledTimes(1)
    })

    it('properly cleans up old listener when callback changes', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
      const onClickOutside1 = vi.fn()
      const onClickOutside2 = vi.fn()
      
      const { rerender } = setupHook(testElement, true, onClickOutside1)
      
      // Clear spies to check only the rerender behavior
      removeEventListenerSpy.mockClear()
      addEventListenerSpy.mockClear()
      
      // Rerender with new callback
      rerender({ element: testElement, isActive: true, onClickOutside: onClickOutside2 })
      
      // Should have removed old listener and added new one
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
    })
  })

  // ===========================================================================
  // NULL REF HANDLING TESTS
  // ===========================================================================
  describe('Null Ref Handling', () => {
    it('does not throw when ref.current is null', () => {
      const onClickOutside = vi.fn()
      
      // Setup with null element
      expect(() => {
        setupHook(null, true, onClickOutside)
      }).not.toThrow()
    })

    it('calls onClickOutside when ref.current is null (click is always outside)', () => {
      const onClickOutside = vi.fn()
      
      setupHook(null, true, onClickOutside)
      
      simulateMouseDown(outsideElement)
      
      // When ref.current is null, the condition `ref.current && !ref.current.contains(...)` 
      // evaluates to false, so onClickOutside is NOT called
      expect(onClickOutside).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // EVENT DETAILS TESTS
  // ===========================================================================
  describe('Event Details', () => {
    it('responds to mousedown events specifically', () => {
      const onClickOutside = vi.fn()
      
      setupHook(testElement, true, onClickOutside)
      
      // mousedown should trigger
      simulateMouseDown(outsideElement)
      expect(onClickOutside).toHaveBeenCalledTimes(1)
      
      // Other mouse events should NOT trigger
      const clickEvent = new MouseEvent('click', { bubbles: true })
      outsideElement.dispatchEvent(clickEvent)
      expect(onClickOutside).toHaveBeenCalledTimes(1) // Still 1
      
      const mouseupEvent = new MouseEvent('mouseup', { bubbles: true })
      outsideElement.dispatchEvent(mouseupEvent)
      expect(onClickOutside).toHaveBeenCalledTimes(1) // Still 1
    })

    it('receives bubbled events from child elements of outside element', () => {
      const onClickOutside = vi.fn()
      
      // Create a child inside the outside element
      const outsideChild = document.createElement('button')
      outsideElement.appendChild(outsideChild)
      
      setupHook(testElement, true, onClickOutside)
      
      // Click on the child of outside element - should still count as outside
      simulateMouseDown(outsideChild)
      
      expect(onClickOutside).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // MULTIPLE HOOKS TESTS
  // ===========================================================================
  describe('Multiple Hooks', () => {
    it('multiple hooks can coexist and independently detect outside clicks', () => {
      const element1 = createDOMElement('div')
      const element2 = createDOMElement('div')
      const onClickOutside1 = vi.fn()
      const onClickOutside2 = vi.fn()
      
      setupHook(element1, true, onClickOutside1)
      setupHook(element2, true, onClickOutside2)
      
      // Click on element1 - should trigger callback2 (outside element2)
      simulateMouseDown(element1)
      expect(onClickOutside1).not.toHaveBeenCalled()
      expect(onClickOutside2).toHaveBeenCalledTimes(1)
      
      // Click on element2 - should trigger callback1 (outside element1)
      simulateMouseDown(element2)
      expect(onClickOutside1).toHaveBeenCalledTimes(1)
      expect(onClickOutside2).toHaveBeenCalledTimes(1) // Still 1
      
      // Click outside both - should trigger both
      simulateMouseDown(outsideElement)
      expect(onClickOutside1).toHaveBeenCalledTimes(2)
      expect(onClickOutside2).toHaveBeenCalledTimes(2)
      
      // Clean up
      removeDOMElement(element1)
      removeDOMElement(element2)
    })
  })
})
