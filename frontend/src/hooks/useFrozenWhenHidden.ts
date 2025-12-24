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
  const isFrozenRef = useRef(false)
  
  // Track frozen state
  useEffect(() => {
    isFrozenRef.current = backgroundManager.isHidden || backgroundManager.isInDeepPause
  }, [backgroundManager.isHidden, backgroundManager.isInDeepPause])
  
  // Check if currently frozen
  const isFrozen = useCallback(() => {
    return isFrozenRef.current
  }, [])
  
  // Wrap a callback to skip execution when frozen
  const skipWhenFrozen = useCallback(<T extends (...args: unknown[]) => unknown>(
    callback: T
  ): T => {
    return ((...args: Parameters<T>) => {
      if (isFrozenRef.current) {
        return undefined // Skip when frozen
      }
      return callback(...args)
    }) as T
  }, [])
  
  // For state updates that should be skipped when hidden
  const shouldSkipStateUpdate = useCallback(() => {
    return isFrozenRef.current
  }, [])
  
  // CRITICAL: Memoize return object to prevent cascading re-renders.
  // Without this, every render creates a new object reference.
  return useMemo(() => ({
    isFrozen,
    skipWhenFrozen,
    shouldSkipStateUpdate,
    isCurrentlyFrozen: backgroundManager.isHidden || backgroundManager.isInDeepPause,
  }), [isFrozen, skipWhenFrozen, shouldSkipStateUpdate, backgroundManager.isHidden, backgroundManager.isInDeepPause])
}
