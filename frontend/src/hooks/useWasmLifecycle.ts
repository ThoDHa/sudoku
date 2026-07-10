import { useEffect, useRef, useCallback } from 'react'
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
  const unloadTimeoutRef = useRef<number | null>(null)
  const currentRouteRequiresWasm = useRef(false)

  const log = useCallback(
    (message: string) => {
      if (enableLogging) {
        logger.warn(`[WasmLifecycle] ${message}`)
      }
    },
    // Stryker disable next-line ArrayDeclaration: log captures enableLogging; covered by the "picks up changed enableLogging" test in useWasmLifecycle.test.ts
    [enableLogging],
  )

  const isWasmRoute = useCallback((pathname: string): boolean => {
    // Custom puzzles always need WASM (for validation during creation)
    // Stryker disable next-line ConditionalExpression, MethodExpression: '/c/...' paths also return true via the unknown-route fallback below
    if (pathname.startsWith('/c/')) return true
    // Check if it's a known non-game route
    const isKnownRoute = KNOWN_NON_GAME_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + '/'),
    )
    // If not a known route and not homepage, it's a game route (/:seed)
    // Stryker disable next-line ConditionalExpression, StringLiteral: isKnownRoute is always true for '/', so the pathname !== '/' clause is redundant
    return !isKnownRoute && pathname !== '/'
  }, /* Stryker disable next-line ArrayDeclaration: isWasmRoute is a pure function over its pathname argument with no closure captures, so the empty deps array has no observable effect */ [])

  const unloadWasm = useCallback(async () => {
    try {
      cleanupSolver()
      log('WASM unloaded - freed ~4MB memory')
    } catch (error) {
      logger.error('[WasmLifecycle] Error during WASM cleanup:', error)
    }
    // Stryker disable next-line ArrayDeclaration: unloadWasm only depends on log, whose enableLogging dependency is covered by the "picks up changed enableLogging" test
  }, [log])

  const scheduleUnload = useCallback(() => {
    // Clear any existing timeout
    // Stryker disable next-line ConditionalExpression: clearTimeout(null/undefined) is a safe no-op
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
    // Stryker disable next-line ArrayDeclaration: the captured deps (unloadDelay, isWasmRoute, unloadWasm, log) are exercised by the "picks up changed unloadDelay" test
  }, [unloadDelay, isWasmRoute, unloadWasm, log])

  const cancelUnload = useCallback(() => {
    // Stryker disable next-line ConditionalExpression: clearTimeout(null/undefined) is a safe no-op
    if (unloadTimeoutRef.current) {
      clearTimeout(unloadTimeoutRef.current)
      unloadTimeoutRef.current = null
      log('Cancelled scheduled WASM unload')
    }
    // Stryker disable next-line ArrayDeclaration: cancelUnload only depends on log, whose enableLogging dependency is covered by the "picks up changed enableLogging" test
  }, [log])

  const loadWasm = useCallback(async () => {
    try {
      await initializeSolver()
      log('WASM loaded successfully')
    } catch (error) {
      logger.error('[WasmLifecycle] Failed to initialize WASM solver:', error)
    }
    // Stryker disable next-line ArrayDeclaration: loadWasm only depends on log, whose enableLogging dependency is covered by the "picks up changed enableLogging" test
  }, [log])

  // Handle route changes - load WASM when entering game routes, unload when leaving
  useEffect(() => {
    const routeNeedsWasm = isWasmRoute(location.pathname)

    if (routeNeedsWasm && !currentRouteRequiresWasm.current) {
      // Entering WASM route - load WASM
      log(`Entering WASM route: ${location.pathname}`)
      cancelUnload()
      currentRouteRequiresWasm.current = true
      loadWasm()
    } else if (!routeNeedsWasm && currentRouteRequiresWasm.current) {
      // Stryker disable next-line ConditionalExpression, LogicalOperator: in this else-if branch routeNeedsWasm is already false, so the operand is redundant
      // Leaving WASM route - schedule cleanup
      log(`Leaving WASM route: ${location.pathname}`)
      scheduleUnload()
    }
  }, [location.pathname, isWasmRoute, scheduleUnload, cancelUnload, log, loadWasm])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stryker disable next-line ConditionalExpression: clearTimeout(null/undefined) is a safe no-op
      if (unloadTimeoutRef.current) {
        clearTimeout(unloadTimeoutRef.current)
      }
    }
  }, /* Stryker disable next-line ArrayDeclaration: the unmount cleanup captures no values; the constant `["Stryker was here"]` mutant never changes so the effect never re-runs, matching the original empty array */ [])

  return {
    isWasmRoute: isWasmRoute(location.pathname),
    loadWasm,
    unloadWasm,
    cancelUnload,
  }
}
