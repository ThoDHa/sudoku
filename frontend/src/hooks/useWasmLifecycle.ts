import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { logger } from '../lib/logger'
import { initializeSolver, cleanupSolver } from '../lib/solver-service'

interface UseWasmLifecycleOptions {
  /** Delay before unloading WASM when leaving routes (default: 2000ms) */
  unloadDelay?: number
  /** Enable console logging for WASM lifecycle events */
  enableLogging?: boolean
}

// Known non-game routes - everything else is a game route (/:seed or /c/:encoded)
const KNOWN_NON_GAME_ROUTES = ['/', '/r', '/techniques', '/technique', '/custom', '/leaderboard']

/**
 * Hook to manage WASM unloading based on current route
 *
 * WASM is loaded lazily on-demand when hints/solve are requested (see solver-service.ts getApi()).
 * This hook handles cleanup when leaving game routes to save ~4MB memory.
 *
 * Note: We intentionally do NOT load WASM eagerly on game routes because:
 * - Puzzles come from static pool (no WASM needed)
 * - Custom puzzle validation uses pure TypeScript dp-solver
 * - WASM only needed for hints, auto-solve, and check-and-fix operations
 */
export function useWasmLifecycle(options: UseWasmLifecycleOptions = {}) {
  const { unloadDelay = 2000, enableLogging = false } = options

  const location = useLocation()
  const unloadTimeoutRef = useRef<number | undefined>(undefined)
  const currentRouteRequiresWasm = useRef(false)

  const log = (message: string) => {
    if (enableLogging) {
      logger.warn(`[WasmLifecycle] ${message}`)
    }
  }

  const isWasmRoute = (pathname: string): boolean => {
    // Check if it's a known non-game route
    const isKnownRoute = KNOWN_NON_GAME_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + '/'),
    )
    // Unknown routes are game routes (/:seed or /c/:encoded).
    return !isKnownRoute
  }

  const unloadWasm = async () => {
    try {
      cleanupSolver()
      log('WASM unloaded - freed ~4MB memory')
    } catch (error) {
      logger.error('[WasmLifecycle] Error during WASM cleanup:', error)
    }
  }

  const scheduleUnload = () => {
    // clearTimeout on a missing handle is a no-op.
    clearTimeout(unloadTimeoutRef.current)

    // Schedule unload with delay to handle rapid navigation
    unloadTimeoutRef.current = window.setTimeout(() => {
      // Double-check current route before unloading
      const stillNeedsWasm = isWasmRoute(window.location.pathname)
      if (!stillNeedsWasm) {
        void unloadWasm()
        currentRouteRequiresWasm.current = false
      }
      unloadTimeoutRef.current = undefined
    }, unloadDelay)

    log(`Scheduled WASM unload in ${unloadDelay}ms`)
  }

  const cancelUnload = () => {
    // The guard exists only so an unscheduled cancel is not announced.
    if (unloadTimeoutRef.current) {
      clearTimeout(unloadTimeoutRef.current)
      unloadTimeoutRef.current = undefined
      log('Cancelled scheduled WASM unload')
    }
  }

  const loadWasm = async () => {
    try {
      await initializeSolver()
      log('WASM loaded successfully')
    } catch (error) {
      logger.error('[WasmLifecycle] Failed to initialize WASM solver:', error)
    }
  }

  // Handle route changes - load WASM when entering game routes, unload when leaving
  useEffect(() => {
    const routeNeedsWasm = isWasmRoute(location.pathname)

    if (routeNeedsWasm && !currentRouteRequiresWasm.current) {
      // Entering WASM route - load WASM
      log(`Entering WASM route: ${location.pathname}`)
      cancelUnload()
      currentRouteRequiresWasm.current = true
      void loadWasm()
    } else if (!routeNeedsWasm && currentRouteRequiresWasm.current) {
      log(`Leaving WASM route: ${location.pathname}`)
      scheduleUnload()
    }
  }, [location.pathname, isWasmRoute, scheduleUnload, cancelUnload, log, loadWasm])

  // Cleanup on unmount
  useEffect(
    () => {
      return () => {
        clearTimeout(unloadTimeoutRef.current)
      }
    },
    // Stryker disable next-line ArrayDeclaration: the only generated replacement is ["Stryker was here"], a constant array; the cleanup captures no values and re-running the effect cannot change what it clears, so the mutant is observationally identical
    [],
  )

  return {
    isWasmRoute: isWasmRoute(location.pathname),
    loadWasm,
    unloadWasm,
    cancelUnload,
  }
}
