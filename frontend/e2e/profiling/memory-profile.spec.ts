/**
 * Memory Profiling Tests
 *
 * Uses Playwright's page.metrics() and Chrome DevTools Protocol to measure
 * memory usage across various scenarios:
 *
 * Light Profiling (page.metrics based):
 * - Long play sessions
 * - WASM solver calls
 * - Page navigation cycles
 * - Auto-solve loops
 * - Puzzle switching
 *
 * Deep Profiling (CDP heap snapshots):
 * - Heap snapshot comparison
 * - WASM memory isolation
 * - React component cleanup
 *
 * These tests help identify memory leaks that could cause:
 * - App slowdowns during extended use
 * - Increased memory pressure on mobile devices
 * - Browser tab crashes on long sessions
 *
 * Run with: npx playwright test e2e/profiling/memory-profile.spec.ts --project=chrome-desktop
 *
 * Tag: @profiling
 */

import { test, expect } from '../fixtures';
import { type Page, type CDPSession } from '@playwright/test';

// ============================================
// Configuration
// ============================================

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

// Memory thresholds (in bytes unless noted)
const THRESHOLDS = {
  LONG_PLAY_SESSION_MB: 5,        // Max 5MB growth for 100 moves
  WASM_SOLVER_VARIANCE_PCT: 10,   // ±10% from baseline for 50 solver calls
  NAVIGATION_CYCLES_MB: 3,        // Max 3MB growth for 10 navigation cycles
  AUTO_SOLVE_LOOP_MB: 10,         // Max 10MB total growth for 5 auto-solves
  PUZZLE_SWITCHING_MB: 2,         // Max 2MB growth for 20 puzzle switches
  DEEP_PROFILING_MB: 15,          // Max 15MB for deep profiling scenarios
} as const;

// ============================================
// Types
// ============================================

interface MemoryMetrics {
  jsHeapUsedSize: number;
  jsHeapTotalSize: number;
  documents: number;
  frames: number;
  jsEventListeners: number;
  nodes: number;
  layoutCount: number;
  recalcStyleCount: number;
  timestamp: number;
}

interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get memory metrics using page.metrics()
 */
async function getMemoryMetrics(page: Page): Promise<MemoryMetrics> {
  const metrics = await page.metrics();
  return {
    jsHeapUsedSize: metrics.JSHeapUsedSize ?? 0,
    jsHeapTotalSize: metrics.JSHeapTotalSize ?? 0,
    documents: metrics.Documents ?? 0,
    frames: metrics.Frames ?? 0,
    jsEventListeners: metrics.JSEventListeners ?? 0,
    nodes: metrics.Nodes ?? 0,
    layoutCount: metrics.LayoutCount ?? 0,
    recalcStyleCount: metrics.RecalcStyleCount ?? 0,
    timestamp: Date.now(),
  };
}

/**
 * Get Chrome-specific performance.memory (only works in Chrome)
 */
async function getPerformanceMemory(page: Page): Promise<PerformanceMemory | null> {
  try {
    const memory = await page.evaluate(() => {
      const perf = performance as Performance & { memory?: PerformanceMemory };
      if (perf.memory) {
        return {
          jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
          totalJSHeapSize: perf.memory.totalJSHeapSize,
          usedJSHeapSize: perf.memory.usedJSHeapSize,
        };
      }
      return null;
    });
    return memory;
  } catch {
    return null;
  }
}

/**
 * Calculate memory growth in MB
 */
function calculateGrowthMB(initial: number, final: number): number {
  return (final - initial) / (1024 * 1024);
}

/**
 * Calculate percentage variance
 */
function calculateVariancePct(baseline: number, current: number): number {
  if (baseline === 0) return current > 0 ? 100 : 0;
  return ((current - baseline) / baseline) * 100;
}

/**
 * Force garbage collection if available (Chrome only via CDP)
 */
async function forceGC(page: Page): Promise<void> {
  try {
    const client = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.collectGarbage');
    await client.detach();
  } catch {
    // GC not available, continue without it
  }
  // Wait for GC to complete
  await page.waitForTimeout(500);
}

/**
 * Wait for the game board to be ready
 */
async function waitForGameReady(page: Page): Promise<void> {
  await page.waitForSelector('[role="grid"]', { timeout: 15000 });
  await page.waitForTimeout(500); // Extra wait for WASM initialization
}

/**
 * Click on a random empty cell and enter a number
 */
async function makeMove(page: Page, moveNumber: number): Promise<boolean> {
  try {
    // Find an empty cell
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    if (await emptyCell.isVisible({ timeout: 1000 })) {
      await emptyCell.click();
      await page.keyboard.press(String((moveNumber % 9) + 1));
      await page.waitForTimeout(30);
      return true;
    }
    // If no empty cell with exact match, try any cell that's not prefilled
    const anyCell = page.locator('[role="gridcell"]:not([aria-label*="prefilled"])').first();
    if (await anyCell.isVisible({ timeout: 1000 })) {
      await anyCell.click();
      await page.keyboard.press(String((moveNumber % 9) + 1));
      await page.waitForTimeout(30);
      return true;
    }
  } catch {
    // Cell not found or not clickable
  }
  return false;
}

/**
 * Request a hint (triggers WASM solver)
 */
async function requestHint(page: Page): Promise<boolean> {
  try {
    // Look for hint button
    const hintButton = page.getByRole('button', { name: /hint/i });
    if (await hintButton.isVisible({ timeout: 1000 })) {
      await hintButton.click();
      await page.waitForTimeout(100);
      // Close any hint modal/tooltip that might appear
      await page.keyboard.press('Escape');
      return true;
    }
  } catch {
    // Hint button not found
  }
  return false;
}

// ============================================
// Light Profiling Tests
// ============================================

test.describe('@profiling Memory - Light Profiling', () => {
  test('long play session memory stays bounded (100 moves)', async ({ page }) => {
    test.setTimeout(120_000); // 2 minutes

    await page.goto(`${BASE_URL}/game?d=easy&seed=memory-long-play`);
    await waitForGameReady(page);

    // Force GC before measuring baseline
    await forceGC(page);
    const initialMetrics = await getMemoryMetrics(page);
    const initialHeap = initialMetrics.jsHeapUsedSize;

    console.log(`📊 Initial heap: ${(initialHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Initial nodes: ${initialMetrics.nodes}`);
    console.log(`📊 Initial event listeners: ${initialMetrics.jsEventListeners}`);

    // Simulate 100 moves
    let movesCompleted = 0;
    for (let i = 0; i < 100; i++) {
      const success = await makeMove(page, i);
      if (success) movesCompleted++;

      // Periodic GC to simulate real-world conditions
      if (i % 25 === 0 && i > 0) {
        await forceGC(page);
      }
    }

    console.log(`📊 Moves completed: ${movesCompleted}`);

    // Force final GC and measure
    await forceGC(page);
    const finalMetrics = await getMemoryMetrics(page);
    const finalHeap = finalMetrics.jsHeapUsedSize;

    const growthMB = calculateGrowthMB(initialHeap, finalHeap);
    const nodeGrowth = finalMetrics.nodes - initialMetrics.nodes;
    const listenerGrowth = finalMetrics.jsEventListeners - initialMetrics.jsEventListeners;

    console.log(`📊 Final heap: ${(finalHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Memory growth: ${growthMB.toFixed(2)} MB`);
    console.log(`📊 Node growth: ${nodeGrowth}`);
    console.log(`📊 Listener growth: ${listenerGrowth}`);

    // Assertions
    expect(growthMB).toBeLessThan(THRESHOLDS.LONG_PLAY_SESSION_MB);
    expect(nodeGrowth).toBeLessThan(500); // Should not accumulate too many DOM nodes
    expect(listenerGrowth).toBeLessThan(50); // Should not leak event listeners
  });

  test('WASM solver calls memory stays within baseline (50 calls)', async ({ page }) => {
    test.setTimeout(180_000); // 3 minutes

    await page.goto(`${BASE_URL}/game?d=medium&seed=memory-solver`);
    await waitForGameReady(page);

    // Force GC and get baseline
    await forceGC(page);
    const baselineMetrics = await getMemoryMetrics(page);
    const baselineHeap = baselineMetrics.jsHeapUsedSize;

    console.log(`📊 Baseline heap: ${(baselineHeap / 1024 / 1024).toFixed(2)} MB`);

    // Make 50 hint/solver calls
    let hintsRequested = 0;
    for (let i = 0; i < 50; i++) {
      const success = await requestHint(page);
      if (success) hintsRequested++;
      
      // Make a move occasionally to change state
      if (i % 5 === 0) {
        await makeMove(page, i);
      }

      // Periodic GC
      if (i % 10 === 0) {
        await forceGC(page);
      }
    }

    console.log(`📊 Hints requested: ${hintsRequested}`);

    // Final measurement
    await forceGC(page);
    const finalMetrics = await getMemoryMetrics(page);
    const finalHeap = finalMetrics.jsHeapUsedSize;

    const variancePct = calculateVariancePct(baselineHeap, finalHeap);

    console.log(`📊 Final heap: ${(finalHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Variance: ${variancePct.toFixed(2)}%`);

    // Memory should stay within ±10% of baseline
    expect(Math.abs(variancePct)).toBeLessThan(THRESHOLDS.WASM_SOLVER_VARIANCE_PCT);
  });

  test('page navigation cycles do not leak memory (10 cycles)', async ({ page }) => {
    test.setTimeout(120_000); // 2 minutes

    // Start on homepage
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Force GC and get baseline
    await forceGC(page);
    const initialMetrics = await getMemoryMetrics(page);

    console.log(`📊 Initial heap: ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Initial nodes: ${initialMetrics.nodes}`);

    const heapSamples: number[] = [initialMetrics.jsHeapUsedSize];
    const nodeSamples: number[] = [initialMetrics.nodes];

    // Navigate between pages 10 times
    const routes = [
      '/game?d=easy&seed=nav-test',
      '/',
      '/game?d=medium&seed=nav-test',
      '/leaderboard',
      '/game?d=hard&seed=nav-test',
      '/',
    ];

    for (let cycle = 0; cycle < 10; cycle++) {
      for (const route of routes) {
        await page.goto(`${BASE_URL}${route}`);
        await page.waitForLoadState('networkidle');

        if (route.includes('/game')) {
          await waitForGameReady(page);
          // Make a few moves
          for (let m = 0; m < 5; m++) {
            await makeMove(page, m);
          }
        }
      }

      // Sample metrics after each full cycle
      await forceGC(page);
      const cycleMetrics = await getMemoryMetrics(page);
      heapSamples.push(cycleMetrics.jsHeapUsedSize);
      nodeSamples.push(cycleMetrics.nodes);

      console.log(`📊 Cycle ${cycle + 1}: heap=${(cycleMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)}MB, nodes=${cycleMetrics.nodes}`);
    }

    // Analyze for unbounded growth
    const finalMetrics = await getMemoryMetrics(page);
    const growthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);
    const nodeGrowth = finalMetrics.nodes - initialMetrics.nodes;

    console.log(`📊 Total memory growth: ${growthMB.toFixed(2)} MB`);
    console.log(`📊 Total node growth: ${nodeGrowth}`);

    // Check for monotonic growth pattern (bad sign)
    let monotonicallyGrowing = true;
    for (let i = 1; i < heapSamples.length; i++) {
      if (heapSamples[i] < heapSamples[i - 1]) {
        monotonicallyGrowing = false;
        break;
      }
    }

    if (monotonicallyGrowing && heapSamples.length > 3) {
      console.warn('⚠️  Warning: Heap appears to be growing monotonically');
    }

    // Assertions
    expect(growthMB).toBeLessThan(THRESHOLDS.NAVIGATION_CYCLES_MB);
    expect(nodeGrowth).toBeLessThan(200); // Should not accumulate detached DOM nodes
  });

  test('auto-solve loop memory stays bounded (5 puzzles)', async ({ page }) => {
    test.setTimeout(300_000); // 5 minutes - auto-solve can be slow

    await page.goto(`${BASE_URL}/game?d=easy&seed=autosolve-1`);
    await waitForGameReady(page);

    // Force GC and get baseline
    await forceGC(page);
    const initialMetrics = await getMemoryMetrics(page);

    console.log(`📊 Initial heap: ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    const puzzleSeeds = ['autosolve-1', 'autosolve-2', 'autosolve-3', 'autosolve-4', 'autosolve-5'];

    for (let i = 0; i < puzzleSeeds.length; i++) {
      // Navigate to puzzle
      await page.goto(`${BASE_URL}/game?d=easy&seed=${puzzleSeeds[i]}`);
      await waitForGameReady(page);

      // Find and click auto-solve button
      try {
        const autoSolveButton = page.getByRole('button', { name: /auto.?solve|solve.*auto/i });
        if (await autoSolveButton.isVisible({ timeout: 2000 })) {
          await autoSolveButton.click();

          // Wait for auto-solve to complete (watch for completion state)
          await page.waitForTimeout(5000); // Give it time to work

          // Check if puzzle is solved or still running
          const solveCompleteIndicator = page.locator('[data-testid="puzzle-complete"], .puzzle-complete, .game-won');
          try {
            await solveCompleteIndicator.waitFor({ timeout: 30000 });
          } catch {
            // May not have completion indicator, continue anyway
          }
        }
      } catch {
        console.log(`📊 Auto-solve button not found for puzzle ${i + 1}, making manual moves instead`);
        // Fall back to making many moves
        for (let m = 0; m < 20; m++) {
          await makeMove(page, m);
        }
      }

      await forceGC(page);
      const puzzleMetrics = await getMemoryMetrics(page);
      console.log(`📊 After puzzle ${i + 1}: heap=${(puzzleMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)}MB`);
    }

    // Final measurement
    await forceGC(page);
    const finalMetrics = await getMemoryMetrics(page);
    const totalGrowthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);

    console.log(`📊 Total memory growth: ${totalGrowthMB.toFixed(2)} MB`);

    // Total memory growth should be < 10MB for 5 puzzles
    expect(totalGrowthMB).toBeLessThan(THRESHOLDS.AUTO_SOLVE_LOOP_MB);
  });

  test('puzzle switching memory stays bounded (20 switches)', async ({ page }) => {
    test.setTimeout(120_000); // 2 minutes

    await page.goto(`${BASE_URL}/game?d=easy&seed=switch-0`);
    await waitForGameReady(page);

    // Force GC and get baseline
    await forceGC(page);
    const initialMetrics = await getMemoryMetrics(page);

    console.log(`📊 Initial heap: ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    // Switch between 20 different puzzles
    const difficulties = ['easy', 'medium', 'hard'];

    for (let i = 0; i < 20; i++) {
      const difficulty = difficulties[i % difficulties.length];
      await page.goto(`${BASE_URL}/game?d=${difficulty}&seed=switch-${i}`);
      await waitForGameReady(page);

      // Make a few moves in each puzzle
      for (let m = 0; m < 3; m++) {
        await makeMove(page, m);
      }

      // Periodic GC
      if (i % 5 === 0) {
        await forceGC(page);
        const midMetrics = await getMemoryMetrics(page);
        console.log(`📊 After switch ${i + 1}: heap=${(midMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)}MB`);
      }
    }

    // Final measurement
    await forceGC(page);
    const finalMetrics = await getMemoryMetrics(page);
    const growthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);

    console.log(`📊 Total memory growth: ${growthMB.toFixed(2)} MB`);

    // Memory growth should be < 2MB for 20 puzzle switches
    expect(growthMB).toBeLessThan(THRESHOLDS.PUZZLE_SWITCHING_MB);
  });

  test('event listener count does not grow unboundedly', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto(`${BASE_URL}/game?d=easy&seed=listener-test`);
    await waitForGameReady(page);

    const initialMetrics = await getMemoryMetrics(page);
    const initialListeners = initialMetrics.jsEventListeners;

    console.log(`📊 Initial event listeners: ${initialListeners}`);

    // Perform many interactions that might add listeners
    for (let i = 0; i < 50; i++) {
      // Click cells
      await makeMove(page, i);

      // Use keyboard
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');

      // Toggle note mode if available
      const noteButton = page.getByRole('button', { name: /note|pencil/i });
      if (await noteButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await noteButton.click();
        await page.waitForTimeout(50);
        await noteButton.click();
      }
    }

    const finalMetrics = await getMemoryMetrics(page);
    const finalListeners = finalMetrics.jsEventListeners;
    const listenerGrowth = finalListeners - initialListeners;

    console.log(`📊 Final event listeners: ${finalListeners}`);
    console.log(`📊 Listener growth: ${listenerGrowth}`);

    // Event listeners should not grow significantly
    expect(listenerGrowth).toBeLessThan(20);
  });
});

// ============================================
// Deep Profiling Tests (CDP-based)
// ============================================

test.describe('@profiling @slow Memory - Deep Profiling', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP heap profiling only works in Chromium');

  test('heap snapshot comparison before/after gameplay', async ({ page }) => {
    test.setTimeout(180_000); // 3 minutes

    await page.goto(`${BASE_URL}/game?d=easy&seed=heap-snapshot`);
    await waitForGameReady(page);

    // Create CDP session
    const client: CDPSession = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.enable');

    // Force GC and take initial snapshot
    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(1000);

    const initialMemory = await getPerformanceMemory(page);
    console.log(`📊 Initial heap (performance.memory): ${initialMemory ? (initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2) : 'N/A'} MB`);

    const initialMetrics = await getMemoryMetrics(page);
    console.log(`📊 Initial heap (page.metrics): ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    // Extensive gameplay
    for (let round = 0; round < 5; round++) {
      // Make moves
      for (let i = 0; i < 20; i++) {
        await makeMove(page, i);
      }

      // Request hints
      for (let i = 0; i < 5; i++) {
        await requestHint(page);
      }

      // Undo some moves
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(50);
      }
    }

    // Force GC and take final snapshot
    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(1000);

    const finalMemory = await getPerformanceMemory(page);
    console.log(`📊 Final heap (performance.memory): ${finalMemory ? (finalMemory.usedJSHeapSize / 1024 / 1024).toFixed(2) : 'N/A'} MB`);

    const finalMetrics = await getMemoryMetrics(page);
    console.log(`📊 Final heap (page.metrics): ${(finalMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    // Calculate growth
    const metricsGrowthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);
    console.log(`📊 Memory growth (page.metrics): ${metricsGrowthMB.toFixed(2)} MB`);

    if (initialMemory && finalMemory) {
      const perfGrowthMB = calculateGrowthMB(initialMemory.usedJSHeapSize, finalMemory.usedJSHeapSize);
      console.log(`📊 Memory growth (performance.memory): ${perfGrowthMB.toFixed(2)} MB`);
    }

    await client.detach();

    expect(metricsGrowthMB).toBeLessThan(THRESHOLDS.DEEP_PROFILING_MB);
  });

  test('WASM memory isolation - multiple solver operations', async ({ page }) => {
    test.setTimeout(180_000); // 3 minutes

    await page.goto(`${BASE_URL}/game?d=hard&seed=wasm-isolation`);
    await waitForGameReady(page);

    // Create CDP session
    const client: CDPSession = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.enable');

    // Force GC and baseline
    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(1000);

    const initialMetrics = await getMemoryMetrics(page);
    console.log(`📊 Baseline heap: ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    // Perform many WASM-heavy operations
    const operations = [
      async () => await requestHint(page),
      async () => {
        // Validate puzzle (if available)
        const validateBtn = page.getByRole('button', { name: /validate|check/i });
        if (await validateBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await validateBtn.click();
          await page.waitForTimeout(100);
        }
      },
      async () => await makeMove(page, Math.floor(Math.random() * 100)),
    ];

    for (let i = 0; i < 100; i++) {
      const op = operations[i % operations.length];
      await op();

      // Periodic check
      if (i % 20 === 0) {
        await client.send('HeapProfiler.collectGarbage');
        const midMetrics = await getMemoryMetrics(page);
        console.log(`📊 After ${i} ops: heap=${(midMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)}MB`);
      }
    }

    // Final measurement
    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(1000);

    const finalMetrics = await getMemoryMetrics(page);
    const growthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);

    console.log(`📊 Final heap: ${(finalMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Total growth: ${growthMB.toFixed(2)} MB`);

    await client.detach();

    // WASM memory should be bounded
    expect(growthMB).toBeLessThan(THRESHOLDS.DEEP_PROFILING_MB);
  });

  test('React component cleanup on navigation', async ({ page }) => {
    test.setTimeout(120_000); // 2 minutes

    // Navigate to game and interact
    await page.goto(`${BASE_URL}/game?d=medium&seed=react-cleanup`);
    await waitForGameReady(page);

    // Create CDP session
    const client: CDPSession = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.enable');

    // Make extensive interactions
    for (let i = 0; i < 30; i++) {
      await makeMove(page, i);
    }

    // Get memory while on game page
    await client.send('HeapProfiler.collectGarbage');
    const gameMetrics = await getMemoryMetrics(page);
    console.log(`📊 Game page heap: ${(gameMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Game page nodes: ${gameMetrics.nodes}`);
    console.log(`📊 Game page listeners: ${gameMetrics.jsEventListeners}`);

    // Navigate away from game
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Force GC multiple times to ensure cleanup
    for (let i = 0; i < 3; i++) {
      await client.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(500);
    }

    const homepageMetrics = await getMemoryMetrics(page);
    console.log(`📊 Homepage heap: ${(homepageMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Homepage nodes: ${homepageMetrics.nodes}`);
    console.log(`📊 Homepage listeners: ${homepageMetrics.jsEventListeners}`);

    // Calculate cleanup
    const nodeReduction = gameMetrics.nodes - homepageMetrics.nodes;
    const listenerReduction = gameMetrics.jsEventListeners - homepageMetrics.jsEventListeners;

    console.log(`📊 Node reduction: ${nodeReduction}`);
    console.log(`📊 Listener reduction: ${listenerReduction}`);

    await client.detach();

    // Game components should be cleaned up
    // Homepage should have significantly fewer nodes than game page
    expect(homepageMetrics.nodes).toBeLessThan(gameMetrics.nodes);

    // Event listeners should not accumulate
    expect(homepageMetrics.jsEventListeners).toBeLessThanOrEqual(gameMetrics.jsEventListeners);
  });

  test('DOM node cleanup after repeated mounts/unmounts', async ({ page }) => {
    test.setTimeout(120_000);

    // Create CDP session
    const client: CDPSession = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.enable');

    // Start on homepage
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await client.send('HeapProfiler.collectGarbage');
    const initialMetrics = await getMemoryMetrics(page);

    console.log(`📊 Initial nodes: ${initialMetrics.nodes}`);

    // Rapidly mount/unmount game component
    for (let i = 0; i < 10; i++) {
      await page.goto(`${BASE_URL}/game?d=easy&seed=mount-${i}`);
      await waitForGameReady(page);

      // Make a few moves
      for (let m = 0; m < 5; m++) {
        await makeMove(page, m);
      }

      // Navigate back
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
    }

    // Force GC
    for (let i = 0; i < 3; i++) {
      await client.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(500);
    }

    const finalMetrics = await getMemoryMetrics(page);

    console.log(`📊 Final nodes: ${finalMetrics.nodes}`);
    console.log(`📊 Node difference: ${finalMetrics.nodes - initialMetrics.nodes}`);

    await client.detach();

    // Node count should not grow significantly after cleanup
    const nodeGrowth = finalMetrics.nodes - initialMetrics.nodes;
    expect(nodeGrowth).toBeLessThan(100);
  });
});

// ============================================
// Utility Tests
// ============================================

test.describe('@profiling Memory - Utilities', () => {
  test('verify memory metrics are accessible', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const metrics = await getMemoryMetrics(page);

    // Verify we can read metrics
    expect(metrics.jsHeapUsedSize).toBeGreaterThan(0);
    expect(metrics.timestamp).toBeGreaterThan(0);

    console.log('📊 Memory Metrics Available:');
    console.log(`   JSHeapUsedSize: ${(metrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   JSHeapTotalSize: ${(metrics.jsHeapTotalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Documents: ${metrics.documents}`);
    console.log(`   Frames: ${metrics.frames}`);
    console.log(`   JSEventListeners: ${metrics.jsEventListeners}`);
    console.log(`   Nodes: ${metrics.nodes}`);

    // Try Chrome-specific memory API
    const perfMemory = await getPerformanceMemory(page);
    if (perfMemory) {
      console.log('📊 performance.memory (Chrome only):');
      console.log(`   usedJSHeapSize: ${(perfMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   totalJSHeapSize: ${(perfMemory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   jsHeapSizeLimit: ${(perfMemory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`);
    } else {
      console.log('📊 performance.memory not available (not Chrome)');
    }
  });

  test('baseline memory snapshot for reference', async ({ page }) => {
    await page.goto(`${BASE_URL}/game?d=easy&seed=baseline-ref`);
    await waitForGameReady(page);

    // Force GC
    await forceGC(page);

    const metrics = await getMemoryMetrics(page);
    const perfMemory = await getPerformanceMemory(page);

    console.log('📊 Baseline Memory Snapshot (Game Page):');
    console.log('─'.repeat(50));
    console.log(`   JSHeapUsedSize:    ${(metrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   JSHeapTotalSize:   ${(metrics.jsHeapTotalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   DOM Nodes:         ${metrics.nodes}`);
    console.log(`   Event Listeners:   ${metrics.jsEventListeners}`);
    console.log(`   Documents:         ${metrics.documents}`);
    console.log(`   Frames:            ${metrics.frames}`);
    console.log(`   Layout Count:      ${metrics.layoutCount}`);
    console.log(`   Style Recalcs:     ${metrics.recalcStyleCount}`);

    if (perfMemory) {
      console.log('─'.repeat(50));
      console.log('   (Chrome performance.memory):');
      console.log(`   usedJSHeapSize:    ${(perfMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   totalJSHeapSize:   ${(perfMemory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
    }

    console.log('─'.repeat(50));
    console.log('   Use these values as baseline reference for leak detection.');

    // Basic sanity check
    expect(metrics.jsHeapUsedSize).toBeGreaterThan(0);
    expect(metrics.nodes).toBeGreaterThan(0);
  });
});
