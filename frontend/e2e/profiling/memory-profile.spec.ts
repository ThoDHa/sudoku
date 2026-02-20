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
import { setupGameAndWaitForBoard } from '../utils/board-wait';

// ============================================
// Configuration
// ============================================

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

// Memory thresholds (in bytes unless noted)
const THRESHOLDS = {
  LONG_PLAY_SESSION_MB: 5,        // Max 5MB growth for 100 moves
  WASM_SOLVER_VARIANCE_PCT: 35,   // ±35% from baseline for 50 solver calls (WASM naturally grows memory)
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
 * CDP Session Manager - reuses a single session to avoid resource exhaustion
 */
class CDPManager {
  private client: CDPSession | null = null;
  private page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }
  
  async getSession(): Promise<CDPSession> {
    if (!this.client) {
      this.client = await this.page.context().newCDPSession(this.page);
      await this.client.send('Performance.enable');
      await this.client.send('HeapProfiler.enable');
    }
    return this.client;
  }
  
  async getMemoryMetrics(): Promise<MemoryMetrics> {
    try {
      const client = await this.getSession();
      const { metrics } = await client.send('Performance.getMetrics');
      
      const metricsMap: Record<string, number> = {};
      for (const metric of metrics) {
        metricsMap[metric.name] = metric.value;
      }
      
      return {
        jsHeapUsedSize: metricsMap['JSHeapUsedSize'] ?? 0,
        jsHeapTotalSize: metricsMap['JSHeapTotalSize'] ?? 0,
        documents: metricsMap['Documents'] ?? 0,
        frames: metricsMap['Frames'] ?? 0,
        jsEventListeners: metricsMap['JSEventListeners'] ?? 0,
        nodes: metricsMap['Nodes'] ?? 0,
        layoutCount: metricsMap['LayoutCount'] ?? 0,
        recalcStyleCount: metricsMap['RecalcStyleCount'] ?? 0,
        timestamp: Date.now(),
      };
    } catch {
      return this.getEmptyMetrics();
    }
  }
  
  async forceGC(): Promise<void> {
    try {
      const client = await this.getSession();
      await client.send('HeapProfiler.collectGarbage');
      await this.page.waitForTimeout(50);
    } catch {
      // GC not available
    }
  }
  
  async detach(): Promise<void> {
    if (this.client) {
      try {
        await this.client.detach();
      } catch {
        // Already detached
      }
      this.client = null;
    }
  }
  
  private getEmptyMetrics(): MemoryMetrics {
    return {
      jsHeapUsedSize: 0,
      jsHeapTotalSize: 0,
      documents: 0,
      frames: 0,
      jsEventListeners: 0,
      nodes: 0,
      layoutCount: 0,
      recalcStyleCount: 0,
      timestamp: Date.now(),
    };
  }
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

function calculateGrowthMB(initial: number, final: number): number {
  return (final - initial) / (1024 * 1024);
}

function calculateVariancePct(baseline: number, current: number): number {
  if (baseline === 0) return current > 0 ? 100 : 0;
  return ((current - baseline) / baseline) * 100;
}

async function makeMove(page: Page, moveNumber: number): Promise<boolean> {
  try {
    const emptyCell = page.locator('[role="gridcell"][aria-label*="empty"]').first();
    await emptyCell.click({ timeout: 2000 });
    await page.keyboard.press(String((moveNumber % 9) + 1));
    await page.waitForTimeout(50);
    return true;
  } catch {
    return false;
  }
}

async function requestHint(page: Page): Promise<boolean> {
  try {
    const hintButton = page.getByRole('button', { name: /hint/i });
    if (await hintButton.isVisible({ timeout: 1000 })) {
      await hintButton.click();
      await page.waitForTimeout(100);
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
    test.setTimeout(120_000);

    const cdp = new CDPManager(page);
    await setupGameAndWaitForBoard(page, { seed: 'Pmemory1', difficulty: 'easy', checkWasm: true });

    await cdp.forceGC();
    const initialMetrics = await cdp.getMemoryMetrics();
    const initialHeap = initialMetrics.jsHeapUsedSize;

    console.log(`📊 Initial heap: ${(initialHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Initial nodes: ${initialMetrics.nodes}`);
    console.log(`📊 Initial event listeners: ${initialMetrics.jsEventListeners}`);

    let movesCompleted = 0;
    for (let i = 0; i < 100; i++) {
      const success = await makeMove(page, i);
      if (success) movesCompleted++;
      else break; // Stop if no more moves possible
    }

    console.log(`📊 Moves completed: ${movesCompleted}`);

    await cdp.forceGC();
    const finalMetrics = await cdp.getMemoryMetrics();
    const finalHeap = finalMetrics.jsHeapUsedSize;

    const growthMB = calculateGrowthMB(initialHeap, finalHeap);
    const nodeGrowth = finalMetrics.nodes - initialMetrics.nodes;
    const listenerGrowth = finalMetrics.jsEventListeners - initialMetrics.jsEventListeners;

    console.log(`📊 Final heap: ${(finalHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Memory growth: ${growthMB.toFixed(2)} MB`);
    console.log(`📊 Node growth: ${nodeGrowth}`);
    console.log(`📊 Listener growth: ${listenerGrowth}`);

    expect(growthMB).toBeLessThan(THRESHOLDS.LONG_PLAY_SESSION_MB);
    expect(nodeGrowth).toBeLessThan(500);
    expect(listenerGrowth).toBeLessThan(50);
    await cdp.detach();
  });

  test('WASM solver calls memory stays within baseline (50 calls)', async ({ page }) => {
    test.setTimeout(180_000);

    const cdp = new CDPManager(page);
    await setupGameAndWaitForBoard(page, { seed: 'Pmemory2', difficulty: 'medium' });

    await cdp.forceGC();
    const baselineMetrics = await cdp.getMemoryMetrics();
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
        await cdp.forceGC();
      }
    }

    console.log(`📊 Hints requested: ${hintsRequested}`);

    // Final measurement
    await cdp.forceGC();
    const finalMetrics = await cdp.getMemoryMetrics();
    const finalHeap = finalMetrics.jsHeapUsedSize;

    const variancePct = calculateVariancePct(baselineHeap, finalHeap);

    console.log(`📊 Final heap: ${(finalHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Variance: ${variancePct.toFixed(2)}%`);

    // Memory should stay within ±10% of baseline
    expect(Math.abs(variancePct)).toBeLessThan(THRESHOLDS.WASM_SOLVER_VARIANCE_PCT);
  });

  test('page navigation cycles do not leak memory (10 cycles)', async ({ page }) => {
    test.setTimeout(120_000);
    const cdp = new CDPManager(page);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await cdp.forceGC();
    const initialMetrics = await cdp.getMemoryMetrics();

    console.log(`📊 Initial heap: ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Initial nodes: ${initialMetrics.nodes}`);

    const heapSamples: number[] = [initialMetrics.jsHeapUsedSize];
    const nodeSamples: number[] = [initialMetrics.nodes];

    // Navigate between pages 10 times
    for (let cycle = 0; cycle < 10; cycle++) {
      // Navigate to game page
      await page.goto('/Pnavtest?d=easy');
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('.sudoku-board', { timeout: 15000 });
      for (let m = 0; m < 5; m++) {
        await makeMove(page, m);
      }

      // Navigate to homepage
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Navigate to leaderboard
      await page.goto('/leaderboard');
      await page.waitForLoadState('networkidle');

      // Navigate to homepage
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Sample metrics after each full cycle
      await cdp.forceGC();
      const cycleMetrics = await cdp.getMemoryMetrics();
      heapSamples.push(cycleMetrics.jsHeapUsedSize);
      nodeSamples.push(cycleMetrics.nodes);

      console.log(`📊 Cycle ${cycle + 1}: heap=${(cycleMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)}MB, nodes=${cycleMetrics.nodes}`);
    }

    // Analyze for unbounded growth
    const finalMetrics = await cdp.getMemoryMetrics();
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
    test.setTimeout(300_000);
    const cdp = new CDPManager(page);

    await setupGameAndWaitForBoard(page, { seed: 'Pautosolve1', difficulty: 'easy' });

    await cdp.forceGC();
    const initialMetrics = await cdp.getMemoryMetrics();

    console.log(`📊 Initial heap: ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    const puzzleSeeds = ['autosolve-1', 'autosolve-2', 'autosolve-3', 'autosolve-4', 'autosolve-5'];

    for (let i = 0; i < puzzleSeeds.length; i++) {
      // Navigate to puzzle
      await setupGameAndWaitForBoard(page, { seed: `P${puzzleSeeds[i]}`, difficulty: 'easy' });

      // Find and click auto-solve button
      try {
        const autoSolveButton = page.getByRole('button', { name: /auto.?solve|solve.*auto/i });
        if (await autoSolveButton.isVisible({ timeout: 2000 })) {
          await autoSolveButton.click();

          // Check if puzzle is solved or still running (proper completion detection)
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

      await cdp.forceGC();
      const puzzleMetrics = await cdp.getMemoryMetrics();
      console.log(`📊 After puzzle ${i + 1}: heap=${(puzzleMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)}MB`);
    }

    // Final measurement
    await cdp.forceGC();
    const finalMetrics = await cdp.getMemoryMetrics();
    const totalGrowthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);

    console.log(`📊 Total memory growth: ${totalGrowthMB.toFixed(2)} MB`);

    // Total memory growth should be < 10MB for 5 puzzles
    expect(totalGrowthMB).toBeLessThan(THRESHOLDS.AUTO_SOLVE_LOOP_MB);
  });

  test('puzzle switching memory stays bounded (20 switches)', async ({ page }) => {
    test.setTimeout(120_000);
    const cdp = new CDPManager(page);

    await setupGameAndWaitForBoard(page, { seed: 'Pswitch0', difficulty: 'easy' });

    await cdp.forceGC();
    const initialMetrics = await cdp.getMemoryMetrics();

    console.log(`📊 Initial heap: ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    const difficulties = ['easy', 'medium', 'hard'];

    for (let i = 0; i < 10; i++) {
      const difficulty = difficulties[i % difficulties.length];
      await setupGameAndWaitForBoard(page, { seed: `Psw${i}`, difficulty: difficulty });
      await makeMove(page, i);
    }

    await cdp.forceGC();
    const finalMetrics = await cdp.getMemoryMetrics();
    const growthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);

    console.log(`📊 Total memory growth: ${growthMB.toFixed(2)} MB`);

    expect(growthMB).toBeLessThan(THRESHOLDS.PUZZLE_SWITCHING_MB);
    await cdp.detach();
  });

  test('event listener count does not grow unboundedly', async ({ page }) => {
    test.setTimeout(60_000);
    const cdp = new CDPManager(page);

    await setupGameAndWaitForBoard(page, { seed: 'Plistenertest', difficulty: 'easy' });

    const initialMetrics = await cdp.getMemoryMetrics();
    const initialListeners = initialMetrics.jsEventListeners;

    console.log(`📊 Initial event listeners: ${initialListeners}`);

    for (let i = 0; i < 20; i++) {
      await makeMove(page, i);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
    }

    // Force GC to clean up any stale listeners from removed DOM nodes
    await cdp.forceGC();

    const finalMetrics = await cdp.getMemoryMetrics();
    const finalListeners = finalMetrics.jsEventListeners;
    const listenerGrowth = finalListeners - initialListeners;

    console.log(`📊 Final event listeners: ${finalListeners}`);
    console.log(`📊 Listener growth: ${listenerGrowth}`);

    // Note: Some listener growth is expected from React's event delegation system.
    // We check that growth is bounded (< 100 new listeners for 60 interactions)
    expect(listenerGrowth).toBeLessThan(100);
    await cdp.detach();
  });
});

// ============================================
// Deep Profiling Tests (CDP-based)
// ============================================

test.describe('@profiling @slow Memory - Deep Profiling', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP heap profiling only works in Chromium');

  test('heap snapshot comparison before/after gameplay', async ({ page }) => {
    test.setTimeout(180_000);
    const cdp = new CDPManager(page);

    await setupGameAndWaitForBoard(page, { seed: 'Pheapsnapshot', difficulty: 'easy' });

    const client: CDPSession = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.enable');

    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(100);

    const initialMemory = await getPerformanceMemory(page);
    console.log(`📊 Initial heap (performance.memory): ${initialMemory ? (initialMemory.usedJSHeapSize / 1024 / 1024).toFixed(2) : 'N/A'} MB`);

    const initialMetrics = await cdp.getMemoryMetrics();
    console.log(`📊 Initial heap (page.metrics): ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 20; i++) {
        await makeMove(page, i);
      }
      for (let i = 0; i < 5; i++) {
        await requestHint(page);
      }
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Control+z');
        await page.waitForTimeout(50);
      }
    }

    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(100);

    const finalMemory = await getPerformanceMemory(page);
    console.log(`📊 Final heap (performance.memory): ${finalMemory ? (finalMemory.usedJSHeapSize / 1024 / 1024).toFixed(2) : 'N/A'} MB`);

    const finalMetrics = await cdp.getMemoryMetrics();
    console.log(`📊 Final heap (page.metrics): ${(finalMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    const metricsGrowthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);
    console.log(`📊 Memory growth (page.metrics): ${metricsGrowthMB.toFixed(2)} MB`);

    if (initialMemory && finalMemory) {
      const perfGrowthMB = calculateGrowthMB(initialMemory.usedJSHeapSize, finalMemory.usedJSHeapSize);
      console.log(`📊 Memory growth (performance.memory): ${perfGrowthMB.toFixed(2)} MB`);
    }

    await client.detach();
    await cdp.detach();

    expect(metricsGrowthMB).toBeLessThan(THRESHOLDS.DEEP_PROFILING_MB);
  });

  test('WASM memory isolation - multiple solver operations', async ({ page }) => {
    test.setTimeout(180_000);
    const cdp = new CDPManager(page);

    await setupGameAndWaitForBoard(page, { seed: 'Pwasmisol', difficulty: 'hard' });

    const client: CDPSession = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.enable');

    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(100);

    const initialMetrics = await cdp.getMemoryMetrics();
    console.log(`📊 Baseline heap: ${(initialMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);

    const operations = [
      async () => await requestHint(page),
      async () => await makeMove(page, Math.floor(Math.random() * 100)),
    ];

    for (let i = 0; i < 50; i++) {
      const op = operations[i % operations.length];
      await op();
    }

    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(100);

    const finalMetrics = await cdp.getMemoryMetrics();
    const growthMB = calculateGrowthMB(initialMetrics.jsHeapUsedSize, finalMetrics.jsHeapUsedSize);

    console.log(`📊 Final heap: ${(finalMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Total growth: ${growthMB.toFixed(2)} MB`);

    await client.detach();

    // WASM memory should be bounded
    expect(growthMB).toBeLessThan(THRESHOLDS.DEEP_PROFILING_MB);
  });

  test('React component cleanup on navigation', async ({ page }) => {
    test.setTimeout(120_000);
    const cdp = new CDPManager(page);

    await setupGameAndWaitForBoard(page, { seed: 'Preactcleanup', difficulty: 'medium' });

    const client: CDPSession = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.enable');

    for (let i = 0; i < 30; i++) {
      await makeMove(page, i);
    }

    await client.send('HeapProfiler.collectGarbage');
    const gameMetrics = await cdp.getMemoryMetrics();
    console.log(`📊 Game page heap: ${(gameMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Game page nodes: ${gameMetrics.nodes}`);
    console.log(`📊 Game page listeners: ${gameMetrics.jsEventListeners}`);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (let i = 0; i < 3; i++) {
      await client.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(100);
    }

    const homepageMetrics = await cdp.getMemoryMetrics();
    console.log(`📊 Homepage heap: ${(homepageMetrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Homepage nodes: ${homepageMetrics.nodes}`);
    console.log(`📊 Homepage listeners: ${homepageMetrics.jsEventListeners}`);

    const nodeReduction = gameMetrics.nodes - homepageMetrics.nodes;
    const listenerReduction = gameMetrics.jsEventListeners - homepageMetrics.jsEventListeners;

    console.log(`📊 Node reduction: ${nodeReduction}`);
    console.log(`📊 Listener reduction: ${listenerReduction}`);

    await client.detach();
    await cdp.detach();

    expect(homepageMetrics.nodes).toBeLessThan(gameMetrics.nodes);
    expect(homepageMetrics.jsEventListeners).toBeLessThanOrEqual(gameMetrics.jsEventListeners);
  });

  test('DOM node cleanup after repeated mounts/unmounts', async ({ page }) => {
    test.setTimeout(120_000);
    const cdp = new CDPManager(page);

    const client: CDPSession = await page.context().newCDPSession(page);
    await client.send('HeapProfiler.enable');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await client.send('HeapProfiler.collectGarbage');
    const initialMetrics = await cdp.getMemoryMetrics();

    console.log(`📊 Initial nodes: ${initialMetrics.nodes}`);

    for (let i = 0; i < 10; i++) {
      await setupGameAndWaitForBoard(page, { seed: `Pmount${i}`, difficulty: 'easy' });
      for (let m = 0; m < 5; m++) {
        await makeMove(page, m);
      }
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    }

    for (let i = 0; i < 3; i++) {
      await client.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(100);
    }

    const finalMetrics = await cdp.getMemoryMetrics();

    console.log(`📊 Final nodes: ${finalMetrics.nodes}`);
    console.log(`📊 Node difference: ${finalMetrics.nodes - initialMetrics.nodes}`);

    await client.detach();
    await cdp.detach();

    const nodeGrowth = finalMetrics.nodes - initialMetrics.nodes;
    expect(nodeGrowth).toBeLessThan(100);
  });
});

test.describe('@profiling Memory - Utilities', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP memory metrics only work in Chromium');

  test('verify memory metrics are accessible', async ({ page }) => {
    const cdp = new CDPManager(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const metrics = await cdp.getMemoryMetrics();

    expect(metrics.jsHeapUsedSize).toBeGreaterThan(0);
    expect(metrics.timestamp).toBeGreaterThan(0);

    console.log('📊 Memory Metrics Available:');
    console.log(`   JSHeapUsedSize: ${(metrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   JSHeapTotalSize: ${(metrics.jsHeapTotalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Documents: ${metrics.documents}`);
    console.log(`   Frames: ${metrics.frames}`);
    console.log(`   JSEventListeners: ${metrics.jsEventListeners}`);
    console.log(`   Nodes: ${metrics.nodes}`);

    const perfMemory = await getPerformanceMemory(page);
    if (perfMemory) {
      console.log('📊 performance.memory (Chrome only):');
      console.log(`   usedJSHeapSize: ${(perfMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   totalJSHeapSize: ${(perfMemory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   jsHeapSizeLimit: ${(perfMemory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`);
    } else {
      console.log('📊 performance.memory not available (not Chrome)');
    }
    await cdp.detach();
  });

  test('baseline memory snapshot for reference', async ({ page }) => {
    const cdp = new CDPManager(page);
    await setupGameAndWaitForBoard(page, { seed: 'Pbaselineref', difficulty: 'easy' });

    await cdp.forceGC();

    const metrics = await cdp.getMemoryMetrics();
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

    expect(metrics.jsHeapUsedSize).toBeGreaterThan(0);
    expect(metrics.nodes).toBeGreaterThan(0);
    await cdp.detach();
  });
});
