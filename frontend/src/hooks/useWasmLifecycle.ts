import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

interface UseWasmLifecycleOptions {
  /** Routes that require WASM (default: game routes) */
  wasmRoutes?: string[]
  /** Delay before unloading WASM when leaving routes (default: 2000ms) */
  unloadDelay?: number
  /** Enable console logging for WASM lifecycle events */
  enableLogging?: boolean
}

/**
 * Hook to manage WASM loading and unloading based on current route
 * Automatically loads WASM when entering game routes and unloads when leaving
 * to save ~4MB of memory on non-game pages.
 */
export function useWasmLifecycle(options: UseWasmLifecycleOptions = {}) {
  const {
    wasmRoutes = ['/p/', '/game/', '/c/', '/custom'],
    unloadDelay = 2000,
    enableLogging = false
  } = options

  const location = useLocation()
  const unloadTimeoutRef = useRef<number | null>(null)
  const currentRouteRequiresWasm = useRef(false)

  const log = useCallback((message: string) => {
    if (enableLogging) {
      console.warn(`[WasmLifecycle] ${message}`)
    }
  }, [enableLogging])

  const isWasmRoute = useCallback((pathname: string): boolean => {
    return wasmRoutes.some(route => pathname.startsWith(route))
  }, [wasmRoutes])

  const loadWasm = useCallback(async () => {
    try {
      const { initializeSolver } = await import('../lib/solver-service')
      await initializeSolver()
      log('WASM loaded successfully')
    } catch (error) {
      console.error('[WasmLifecycle] Failed to initialize WASM solver:', error)
    }
  }, [log])

  const unloadWasm = useCallback(async () => {
    try {
      const { cleanupSolver } = await import('../lib/solver-service')
      cleanupSolver()
      log('WASM unloaded - freed ~4MB memory')
    } catch (error) {
      console.error('[WasmLifecycle] Error during WASM cleanup:', error)
    }
  }, [log])

  const scheduleUnload = useCallback(() => {
    // Clear any existing timeout
    if (unloadTimeoutRef.current) {
      clearTimeout(unloadTimeoutRef.current)
    }

    // Schedule unload with delay to handle rapid navigation
    unloadTimeoutRef.current = window.setTimeout(() => {
      // Double-check current route before unloading
      const stillNeedsWasm = isWasmRoute(window.location.pathname)
      if (!stillNeedsWasm) {
        unloadWasm()
        currentRouteRequiresWasm.current = false
      }
      unloadTimeoutRef.current = null
    }, unloadDelay)

    log(`Scheduled WASM unload in ${unloadDelay}ms`)
  }, [unloadDelay, isWasmRoute, unloadWasm, log])

  const cancelUnload = useCallback(() => {
    if (unloadTimeoutRef.current) {
      clearTimeout(unloadTimeoutRef.current)
      unloadTimeoutRef.current = null
      log('Cancelled scheduled WASM unload')
    }
  }, [log])

  // Handle route changes
  useEffect(() => {
    const routeNeedsWasm = isWasmRoute(location.pathname)

    if (routeNeedsWasm && !currentRouteRequiresWasm.current) {
      // Entering WASM route
      log(`Entering WASM route: ${location.pathname}`)
      cancelUnload()
      loadWasm()
      currentRouteRequiresWasm.current = true
    } else if (!routeNeedsWasm && currentRouteRequiresWasm.current) {
      // Leaving WASM route
      log(`Leaving WASM route: ${location.pathname}`)
      scheduleUnload()
    }
  }, [location.pathname, isWasmRoute, loadWasm, scheduleUnload, cancelUnload, log])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unloadTimeoutRef.current) {
        clearTimeout(unloadTimeoutRef.current)
      }
    }
  }, [])

  return {
    isWasmRoute: isWasmRoute(location.pathname),
    loadWasm,
    unloadWasm,
    cancelUnload
  }
}