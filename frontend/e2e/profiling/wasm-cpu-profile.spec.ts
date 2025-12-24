/**
 * WASM CPU Profiling Test
 *
 * Uses Chrome DevTools Protocol to measure CPU usage in three scenarios:
 * 1. Baseline - Homepage with no WASM loaded
 * 2. WASM Idle - Game page with WASM loaded but no user interaction
 * 3. Post-Cleanup - After navigating away from game (WASM should be unloaded)
 *
 * This test helps identify if the Go WASM runtime is consuming CPU when idle,
 * which could cause battery drain and thermal issues on mobile devices.
 *
 * Run with: npx playwright test e2e/profiling/wasm-cpu-profile.spec.ts --project=chrome-desktop
 *
 * Tag: @profiling @slow
 */

import { test, expect, chromium, devices, type CDPSession, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ============================================
// Configuration
// ============================================

const PROFILE_DURATION_MS = 30_000; // 30 seconds per scenario (longer for accuracy)
const WARMUP_MS = 3_000; // 3 seconds warmup before profiling

// Use port 5173 for dev server, or override with PLAYWRIGHT_BASE_URL for production
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_DIR = path.join(__dirname, 'results');

// Device configurations to test
const DEVICE_CONFIGS = [
  { name: 'pixel-5', device: 'Pixel 5', label: 'Android (Pixel 5)' },
  { name: 'iphone-12', device: 'iPhone 12', label: 'iOS (iPhone 12)' },
] as const;

// ============================================
// Types
// ============================================

interface ProfileResult {
  scenario: string;
  device: string;
  timestamp: string;
  durationMs: number;
  metrics: {
    jsHeapUsedSize: number;
    jsHeapTotalSize: number;
    scriptDuration: number;
    taskDuration: number;
    layoutCount: number;
    recalcStyleCount: number;
  };
  profile: {
    startTime: number;
    endTime: number;
    totalSamples: number;
    topFunctions: Array<{
      functionName: string;
      url: string;
      hitCount: number;
      percentage: number;
    }>;
  };
  rawProfile?: unknown; // Full profile for detailed analysis
}

interface ComparisonReport {
  timestamp: string;
  device: string;
  deviceLabel: string;
  profileDurationMs: number;
  baseUrl: string;
  scenarios: ProfileResult[];
  analysis: {
    wasmCpuOverhead: number; // % increase from baseline to WASM idle
    cleanupEffectiveness: number; // % return to baseline after cleanup
    memoryOverheadMB: number; // Additional memory used by WASM
    verdict: 'PASS' | 'WARN' | 'FAIL';
    findings: string[];
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract a metric value by name from CDP Performance.getMetrics response
 */
function getMetric(metrics: Array<{ name: string; value: number }>, name: string): number {
  const metric = metrics.find((m) => m.name === name);
  return metric?.value ?? 0;
}

/**
 * Analyze profile nodes to find top CPU-consuming functions
 */
function analyzeProfileNodes(
  profile: {
    nodes?: Array<{
      id: number;
      callFrame?: { functionName?: string; url?: string };
    }>;
    samples?: number[];
  }
): ProfileResult['profile']['topFunctions'] {
  const nodes = profile.nodes || [];
  const samples = profile.samples || [];
  const totalSamples = samples.length;

  if (totalSamples === 0) return [];

  // Count samples per node
  const hitCounts = new Map<number, number>();
  for (const nodeId of samples) {
    hitCounts.set(nodeId, (hitCounts.get(nodeId) || 0) + 1);
  }

  // Map node IDs to function info
  const nodeMap = new Map<number, (typeof nodes)[0]>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Build top functions list
  const topFunctions: ProfileResult['profile']['topFunctions'] = [];
  for (const [nodeId, hitCount] of hitCounts.entries()) {
    const node = nodeMap.get(nodeId);
    if (node && node.callFrame) {
      topFunctions.push({
        functionName: node.callFrame.functionName || '(anonymous)',
        url: node.callFrame.url || '',
        hitCount,
        percentage: (hitCount / totalSamples) * 100,
      });
    }
  }

  // Sort by hit count descending
  topFunctions.sort((a, b) => b.hitCount - a.hitCount);

  return topFunctions.slice(0, 20); // Top 20
}

/**
 * Profile a single scenario
 */
async function profileScenario(
  page: Page,
  client: CDPSession,
  scenarioName: string,
  deviceName: string,
  setupFn: () => Promise<void>,
): Promise<ProfileResult> {
  console.log(`  ⏳ Setting up ${scenarioName}...`);

  // Setup the scenario
  await setupFn();

  // Warmup period
  console.log(`  ⏳ Warmup (${WARMUP_MS / 1000}s)...`);
  await page.waitForTimeout(WARMUP_MS);

  // Get metrics before profiling
  const metricsBefore = await client.send('Performance.getMetrics');

  // Start CPU profiling
  console.log(`  ⏳ Profiling (${PROFILE_DURATION_MS / 1000}s)...`);
  await client.send('Profiler.start');

  // Wait for profile duration (this is the idle measurement period)
  await page.waitForTimeout(PROFILE_DURATION_MS);

  // Stop profiling
  const { profile } = await client.send('Profiler.stop');

  // Get metrics after profiling
  const metricsAfter = await client.send('Performance.getMetrics');

  // Analyze profile nodes to find top CPU consumers
  const topFunctions = analyzeProfileNodes(profile);

  const result: ProfileResult = {
    scenario: scenarioName,
    device: deviceName,
    timestamp: new Date().toISOString(),
    durationMs: PROFILE_DURATION_MS,
    metrics: {
      jsHeapUsedSize: getMetric(metricsAfter.metrics, 'JSHeapUsedSize'),
      jsHeapTotalSize: getMetric(metricsAfter.metrics, 'JSHeapTotalSize'),
      scriptDuration:
        getMetric(metricsAfter.metrics, 'ScriptDuration') -
        getMetric(metricsBefore.metrics, 'ScriptDuration'),
      taskDuration:
        getMetric(metricsAfter.metrics, 'TaskDuration') -
        getMetric(metricsBefore.metrics, 'TaskDuration'),
      layoutCount:
        getMetric(metricsAfter.metrics, 'LayoutCount') -
        getMetric(metricsBefore.metrics, 'LayoutCount'),
      recalcStyleCount:
        getMetric(metricsAfter.metrics, 'RecalcStyleCount') -
        getMetric(metricsBefore.metrics, 'RecalcStyleCount'),
    },
    profile: {
      startTime: profile.startTime,
      endTime: profile.endTime,
      totalSamples: profile.samples?.length ?? 0,
      topFunctions,
    },
  };

  console.log(`  ✅ ${scenarioName} complete (${result.profile.totalSamples} samples)`);
  return result;
}

/**
 * Generate comparison report with analysis
 */
function generateComparisonReport(results: ProfileResult[], deviceName: string, deviceLabel: string): ComparisonReport {
  const baseline = results.find((r) => r.scenario === 'baseline')!;
  const wasmIdle = results.find((r) => r.scenario === 'wasm-idle')!;
  const postCleanup = results.find((r) => r.scenario === 'post-cleanup')!;

  // Calculate CPU overhead (comparing scriptDuration)
  const baselineScript = baseline.metrics.scriptDuration;
  const wasmIdleScript = wasmIdle.metrics.scriptDuration;
  const postCleanupScript = postCleanup.metrics.scriptDuration;

  // Avoid division by zero
  const wasmCpuOverhead =
    baselineScript > 0
      ? ((wasmIdleScript - baselineScript) / baselineScript) * 100
      : wasmIdleScript > 0
        ? 100
        : 0;

  // Cleanup effectiveness: how much did we return to baseline?
  const wasmOverhead = wasmIdleScript - baselineScript;
  const cleanupReturn = wasmIdleScript - postCleanupScript;
  const cleanupEffectiveness = wasmOverhead > 0 ? (cleanupReturn / wasmOverhead) * 100 : 100;

  // Memory overhead
  const memoryOverheadMB =
    (wasmIdle.metrics.jsHeapUsedSize - baseline.metrics.jsHeapUsedSize) / 1024 / 1024;

  // Generate findings
  const findings: string[] = [];

  if (wasmCpuOverhead > 50) {
    findings.push(`WASM idle CPU usage is ${wasmCpuOverhead.toFixed(0)}% higher than baseline`);
  } else if (wasmCpuOverhead > 20) {
    findings.push(`WASM idle CPU usage is ${wasmCpuOverhead.toFixed(0)}% higher than baseline (moderate)`);
  } else {
    findings.push(`WASM idle CPU overhead is minimal (${wasmCpuOverhead.toFixed(0)}%)`);
  }

  if (memoryOverheadMB > 5) {
    findings.push(`WASM adds ${memoryOverheadMB.toFixed(1)}MB memory overhead`);
  }

  if (cleanupEffectiveness < 80) {
    findings.push(
      `Cleanup only ${cleanupEffectiveness.toFixed(0)}% effective - WASM may not be fully unloading`
    );
  } else if (cleanupEffectiveness >= 80) {
    findings.push(`Cleanup is ${cleanupEffectiveness.toFixed(0)}% effective`);
  }

  // Look for Go runtime specific functions in WASM idle
  const goFunctions = wasmIdle.profile.topFunctions.filter(
    (f) =>
      f.url.includes('wasm') ||
      f.url.includes('wasm_exec') ||
      f.functionName.toLowerCase().includes('go') ||
      f.functionName.includes('runtime')
  );
  if (goFunctions.length > 0) {
    const totalGoPercentage = goFunctions.reduce((sum, f) => sum + f.percentage, 0);
    if (totalGoPercentage > 5) {
      findings.push(
        `Go/WASM functions consuming ${totalGoPercentage.toFixed(1)}% CPU when idle: ${goFunctions
          .slice(0, 3)
          .map((f) => f.functionName)
          .join(', ')}`
      );
    }
  }

  // Compare sample counts (higher = more CPU activity)
  const baselineSamples = baseline.profile.totalSamples;
  const wasmIdleSamples = wasmIdle.profile.totalSamples;
  if (wasmIdleSamples > baselineSamples * 1.5) {
    findings.push(
      `WASM idle has ${((wasmIdleSamples / baselineSamples - 1) * 100).toFixed(0)}% more CPU samples than baseline`
    );
  }

  // Determine verdict
  let verdict: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
  if (wasmCpuOverhead > 100 || cleanupEffectiveness < 50) {
    verdict = 'FAIL';
  } else if (wasmCpuOverhead > 50 || cleanupEffectiveness < 80) {
    verdict = 'WARN';
  }

  return {
    timestamp: new Date().toISOString(),
    device: deviceName,
    deviceLabel,
    profileDurationMs: PROFILE_DURATION_MS,
    baseUrl: BASE_URL,
    scenarios: results.map((r) => ({ ...r, rawProfile: undefined })), // Exclude raw profiles from report
    analysis: {
      wasmCpuOverhead,
      cleanupEffectiveness,
      memoryOverheadMB,
      verdict,
      findings,
    },
  };
}

/**
 * Save individual profile to JSON
 */
function saveProfile(result: ProfileResult, filename: string): void {
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  console.log(`  📁 Saved: ${filename}`);
}

/**
 * Save comparison report to JSON
 */
function saveReport(report: ComparisonReport, filename: string): void {
  const filepath = path.join(RESULTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`  📁 Saved: ${filename}`);
}

/**
 * Print formatted report to console
 */
function printReport(results: ProfileResult[], report: ComparisonReport): void {
  const divider = '='.repeat(70);
  const subDivider = '-'.repeat(70);

  console.log('\n' + divider);
  console.log(`📊 WASM CPU PROFILING RESULTS - ${report.deviceLabel}`);
  console.log(`   Profile Duration: ${PROFILE_DURATION_MS / 1000}s per scenario`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(divider);

  for (const r of results) {
    console.log(`\n📍 ${r.scenario.toUpperCase()}`);
    console.log(subDivider);
    console.log(`   JS Heap Used:     ${(r.metrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   JS Heap Total:    ${(r.metrics.jsHeapTotalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Script Duration:  ${r.metrics.scriptDuration.toFixed(4)}s`);
    console.log(`   Task Duration:    ${r.metrics.taskDuration.toFixed(4)}s`);
    console.log(`   Layout Count:     ${r.metrics.layoutCount}`);
    console.log(`   Style Recalcs:    ${r.metrics.recalcStyleCount}`);
    console.log(`   CPU Samples:      ${r.profile.totalSamples}`);

    if (r.profile.topFunctions.length > 0) {
      console.log(`\n   Top CPU Consumers:`);
      for (const fn of r.profile.topFunctions.slice(0, 5)) {
        const name = fn.functionName || '(anonymous)';
        const shortUrl = fn.url ? ` [${path.basename(fn.url)}]` : '';
        console.log(
          `     ${fn.percentage.toFixed(1).padStart(5)}% | ${fn.hitCount.toString().padStart(5)} samples | ${name}${shortUrl}`
        );
      }
    }
  }

  console.log('\n' + divider);
  console.log('📈 ANALYSIS');
  console.log(divider);
  console.log(`   WASM CPU Overhead:     ${report.analysis.wasmCpuOverhead.toFixed(1)}%`);
  console.log(`   Memory Overhead:       ${report.analysis.memoryOverheadMB.toFixed(1)} MB`);
  console.log(`   Cleanup Effectiveness: ${report.analysis.cleanupEffectiveness.toFixed(1)}%`);
  console.log(`   Verdict:               ${report.analysis.verdict}`);
  console.log(`\n   Findings:`);
  for (const finding of report.analysis.findings) {
    console.log(`     • ${finding}`);
  }

  console.log('\n' + divider);
  console.log(`📁 Results saved to: ${RESULTS_DIR}`);
  console.log(divider + '\n');
}

/**
 * Run profiling for a specific device
 */
async function runDeviceProfiling(
  deviceConfig: typeof DEVICE_CONFIGS[number]
): Promise<ComparisonReport> {
  const { name: deviceName, device: deviceId, label: deviceLabel } = deviceConfig;
  
  console.log(`\n${'#'.repeat(70)}`);
  console.log(`# 📱 PROFILING: ${deviceLabel}`);
  console.log(`${'#'.repeat(70)}\n`);

  // Launch browser with device emulation (Chromium for CDP support)
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    ...devices[deviceId],
  });

  const page = await context.newPage();

  // Skip onboarding
  await page.addInitScript(() => {
    localStorage.setItem('sudoku_onboarding_complete', 'true');
  });

  // Create CDP session for performance profiling
  const client = await context.newCDPSession(page);

  // Enable Performance and Profiler domains
  await client.send('Performance.enable');
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 100 }); // 100μs sampling

  const results: ProfileResult[] = [];

  // === SCENARIO A: BASELINE (NO WASM) ===
  console.log('📊 Scenario A: Baseline (no WASM)');
  const baselineResult = await profileScenario(page, client, 'baseline', deviceName, async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  });
  results.push(baselineResult);
  saveProfile(baselineResult, `${deviceName}-baseline-profile.json`);

  // === SCENARIO B: WASM LOADED BUT IDLE ===
  console.log('\n📊 Scenario B: WASM Idle');
  const wasmIdleResult = await profileScenario(page, client, 'wasm-idle', deviceName, async () => {
    await page.goto(`${BASE_URL}/cpu-profile-test?d=easy`, { waitUntil: 'networkidle', timeout: 60000 });
    // Wait for the grid to appear (game loaded)
    await page.waitForSelector('[role="grid"]', { timeout: 30000 });
    // Extra wait for WASM to fully initialize
    await page.waitForTimeout(2000);
  });
  results.push(wasmIdleResult);
  saveProfile(wasmIdleResult, `${deviceName}-wasm-idle-profile.json`);

  // === SCENARIO C: POST CLEANUP ===
  console.log('\n📊 Scenario C: Post-Cleanup');
  const postCleanupResult = await profileScenario(page, client, 'post-cleanup', deviceName, async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    // Wait for cleanup to complete
    await page.waitForTimeout(3000);
  });
  results.push(postCleanupResult);
  saveProfile(postCleanupResult, `${deviceName}-post-cleanup-profile.json`);

  // === GENERATE COMPARISON REPORT ===
  const report = generateComparisonReport(results, deviceName, deviceLabel);
  saveReport(report, `${deviceName}-comparison-report.json`);

  // Print formatted report to console
  printReport(results, report);

  // Cleanup
  await client.detach();
  await browser.close();

  return report;
}

// ============================================
// Test Suite
// ============================================

test.describe('@profiling @slow WASM CPU Profiling', () => {
  test.beforeAll(async () => {
    // Ensure results directory exists
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
    }
  });

  test('profile WASM runtime CPU usage - Pixel 5 (Android)', async () => {
    // Increase test timeout for long profiling (3 scenarios × 30s + warmup + overhead)
    test.setTimeout(300_000); // 5 minutes

    console.log('\n🚀 Starting WASM CPU Profiling - Pixel 5 (Android)...\n');
    console.log(`   Base URL: ${BASE_URL}`);

    const report = await runDeviceProfiling(DEVICE_CONFIGS[0]);

    // === ASSERTIONS ===
    expect(report.scenarios.length).toBe(3);
    expect(report.scenarios.every((r) => r.profile.totalSamples > 0)).toBe(true);

    // Log verdict for CI visibility
    logVerdict(report);
  });

  test('profile WASM runtime CPU usage - iPhone 12 (iOS)', async () => {
    // Increase test timeout for long profiling (3 scenarios × 30s + warmup + overhead)
    test.setTimeout(300_000); // 5 minutes

    console.log('\n🚀 Starting WASM CPU Profiling - iPhone 12 (iOS)...\n');
    console.log(`   Base URL: ${BASE_URL}`);

    const report = await runDeviceProfiling(DEVICE_CONFIGS[1]);

    // === ASSERTIONS ===
    expect(report.scenarios.length).toBe(3);
    expect(report.scenarios.every((r) => r.profile.totalSamples > 0)).toBe(true);

    // Log verdict for CI visibility
    logVerdict(report);
  });
});

function logVerdict(report: ComparisonReport): void {
  if (report.analysis.verdict === 'FAIL') {
    console.warn(`⚠️  VERDICT [${report.deviceLabel}]: FAIL - Significant WASM CPU overhead detected!`);
    console.warn('   Consider implementing lazy WASM loading or TinyGo migration.');
  } else if (report.analysis.verdict === 'WARN') {
    console.warn(`⚠️  VERDICT [${report.deviceLabel}]: WARN - Moderate WASM CPU overhead detected.`);
    console.warn('   Monitor for user-reported battery issues.');
  } else {
    console.log(`✅ VERDICT [${report.deviceLabel}]: PASS - No significant WASM CPU overhead detected.`);
  }
}
