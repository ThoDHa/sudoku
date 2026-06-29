import { useCallback, useEffect, useRef } from 'react'

type VisibilitySetTimeout = (callback: () => void, delay: number) => () => void

/**
 * Schedules a single replaceable toast-clear timeout.
 *
 * Each call cancels any still-pending clearer from the previous call so a
 * stale auto-clear can never fire and wipe a newer toast. The clearer is also
 * canceled on unmount. Visibility awareness (cancel on tab hide) is inherited
 * from the injected `visibilitySetTimeout`, which comes from
 * `useVisibilityAwareTimeout` so the host keeps a single visibility-hook
 * instance.
 *
 * @param visibilitySetTimeout - the visibility-aware setTimeout to layer on
 * @returns scheduleToastClear(delay, onClear) - schedules `onClear` after
 *   `delay`, replacing any prior pending clearer
 */
export function useToastClearTimer(visibilitySetTimeout: VisibilitySetTimeout) {
  const cancelRef = useRef<(() => void) | null>(null)

  const scheduleToastClear = useCallback(
    (delay: number, onClear: () => void) => {
      // Cancel any still-pending clearer so a stale auto-clear from an older
      // toast cannot fire and wipe the newer one.
      if (cancelRef.current) {
        cancelRef.current()
        cancelRef.current = null
      }
      cancelRef.current = visibilitySetTimeout(() => {
        cancelRef.current = null
        onClear()
      }, delay)
    },
    [visibilitySetTimeout],
  )

  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current()
        cancelRef.current = null
      }
    }
  }, [])

  return scheduleToastClear
}
