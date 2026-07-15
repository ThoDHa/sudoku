import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useBackgroundManagerContext } from '../lib/BackgroundManagerContext'

/**
 * Hook that provides a mechanism to "freeze" expensive computations when hidden.
 * Returns functions to check if frozen and to skip expensive operations.
 *
 * Usage:
 * - Use `isFrozen` to conditionally skip expensive operations
 * - Use `skipWhenFrozen` to wrap callbacks that shouldn't run when hidden
 *
 * This helps reduce battery usage by preventing:
 * - Expensive state calculations when user can't see results
 * - Unnecessary re-renders triggered by state updates
 * - React reconciliation on complex component trees
 */
export function useFrozenWhenHidden() {
  const backgroundManager = useBackgroundManagerContext()

  // Use ref for immediate access without React state update lag
  // Stryker disable next-line BooleanLiteral: the mount effect overwrites isFrozenRef from backgroundManager before any read, so the initial false is observationally identical to true
  const isFrozenRef = useRef(false)

  // Track frozen state
  useEffect(() => {
    isFrozenRef.current = backgroundManager.isHidden || backgroundManager.isInDeepPause
  }, [backgroundManager.isHidden, backgroundManager.isInDeepPause])

  // Check if currently frozen
  const isFrozen = useCallback(
    () => {
      return isFrozenRef.current
    },
    /* Stryker disable next-line ArrayDeclaration: isFrozen captures only the stable isFrozenRef, so a constant deps entry is observationally identical to the empty array */ [],
  )

  // Wrap a callback to skip execution when frozen
  const skipWhenFrozen = useCallback(
    // `any[]` is the standard contravariant bound for a generic callback wrapper:
    // `unknown[]` rejects callbacks with specific parameter types (contravariance),
    // forcing `as unknown as` casts at call sites.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <T extends (...args: any[]) => unknown>(callback: T): T => {
      return ((...args: Parameters<T>) => {
        if (isFrozenRef.current) {
          return undefined // Skip when frozen
        }
        return callback(...args)
      }) as T
    },
    // Stryker disable next-line ArrayDeclaration: skipWhenFrozen captures only the stable isFrozenRef, so a constant deps entry is observationally identical to the empty array
    [],
  )

  // For state updates that should be skipped when hidden
  const shouldSkipStateUpdate = useCallback(
    () => {
      return isFrozenRef.current
    },
    /* Stryker disable next-line ArrayDeclaration: shouldSkipStateUpdate captures only the stable isFrozenRef, so a constant deps entry is observationally identical to the empty array */ [],
  )

  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference.
  return useMemo(
    () => ({
      isFrozen,
      skipWhenFrozen,
      shouldSkipStateUpdate,
      isCurrentlyFrozen: backgroundManager.isHidden || backgroundManager.isInDeepPause,
    }),
    [
      isFrozen,
      skipWhenFrozen,
      shouldSkipStateUpdate,
      backgroundManager.isHidden,
      backgroundManager.isInDeepPause,
    ],
  )
}
