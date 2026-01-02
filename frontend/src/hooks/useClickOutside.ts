import { useEffect, RefObject } from 'react'

/**
 * Hook that detects clicks outside a referenced element.
 * Useful for closing dropdowns, modals, etc.
 * 
 * @param ref - React ref to the element to monitor
 * @param isActive - Whether the hook should be actively listening
 * @param onClickOutside - Callback to invoke when a click outside is detected
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  isActive: boolean,
  onClickOutside: () => void
): void {
  useEffect(() => {
    if (!isActive) return

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [ref, isActive, onClickOutside])
}
