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

import {
  test,
  expect,
  chromium,
  devices,
  type CDPSession,
  type Page,
  type BrowserContext,
} from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ============================================
// Configuration
// ============================================

const PROFILE_DURATION_MS = 30_000 // 30 seconds per scenario (longer for accuracy)
const WARMUP_MS = 3_000 // 3 seconds warmup before profiling

// Verdict thresholds (PROF-001-D4). These are ABSOLUTE/percentage guards chosen
// to fire on a real regression (a WASM busy loop or a leak) while tolerating
// normal idle noise. Real baseline run: wasm-idle script≈0.02s, idle≈99.7%,
// memory overhead≈2.5MB — so these limits have large headroom.
const VERDICT_THRESHOLDS = {
  IDLE_PCT_PASS: 98, // >= 98% idle samples at wasm-idle → healthy
  IDLE_PCT_WARN: 95, // 95-98% → WARN, < 95% → FAIL
  SCRIPT_SECONDS_WARN: 1, // > 1s of script over 30s idle → WARN
  SCRIPT_SECONDS_FAIL: 5, // > 5s of script over 30s idle → FAIL (busy loop)
  MEMORY_OVERHEAD_WARN_MB: 10, // WASM adds more than this at idle → WARN
  MEMORY_OVERHEAD_FAIL_MB: 30, // → FAIL (leak/unbounded growth)
  CLEANUP_EFFECTIVENESS_WARN: 50, // < 50% of WASM memory released on navigate-away → WARN
  // Below this baseline scriptDuration (seconds) the overhead RATIO is treated
  // as meaningless (near-zero div) and reported as null instead of a false 100%.
  NEAR_ZERO_BASELINE_S: 0.05,
  // Below this absolute WASM overhead (MB) the cleanup-effectiveness RATIO is
  // treated as meaningless (small-denominator noise — a few hundred KB of
  // un-GC'd glue swings the percentage by tens of points) and reported as null,
  // mirroring NEAR_ZERO_BASELINE_S for the CPU overhead ratio. PROF-4.
  CLEANUP_DENOMINATOR_FLOOR_MB: 5,
} as const

// Base URL for the app under test. Left unset, Playwright's webServer starts a
// real `vite dev` instance on :5173. When overriding via PLAYWRIGHT_BASE_URL,
// point only at an app server that serves the SPA shell with a rewrite on every
// route (`vite dev`, `vite preview`, or an equivalent) — NOT a static file
// server like `serve`. A static server returns its own 404 for `/{seed}` (there
// is no such file), which surfaces as a grid-selector timeout in scenario B
// (PROF-5). The default flow (no override) is correct.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RESULTS_DIR = path.join(__dirname, 'results')

// Device configurations to test
const DEVICE_CONFIGS = [
  { name: 'pixel-5', device: 'Pixel 5', label: 'Android (Pixel 5)' },
  { name: 'iphone-12', device: 'iPhone 12', label: 'iOS (iPhone 12)' },
  { name: 'desktop-chrome', device: 'Desktop Chrome', label: 'Desktop (Chrome)' },
] as const

// ============================================
// Types
// ============================================

interface ProfileResult {
  scenario: string
  device: string
  timestamp: string
  durationMs: number
  metrics: {
    jsHeapUsedSize: number
    jsHeapTotalSize: number
    scriptDuration: number
    taskDuration: number
    layoutCount: number
    recalcStyleCount: number
  }
  profile: {
    startTime: number
    endTime: number
    totalSamples: number
    topFunctions: Array<{
      functionName: string
      url: string
      hitCount: number
      percentage: number
    }>
  }
  rawProfile?: unknown // Full profile for detailed analysis
}

interface ComparisonReport {
  timestamp: string
  device: string
  deviceLabel: string
  profileDurationMs: number
  baseUrl: string
  scenarios: ProfileResult[]
  analysis: {
    wasmCpuOverhead: number | null // % increase baseline→wasm-idle; null when baseline ≈ 0 (meaningless ratio, PROF-001-D4)
    wasmIdlePercentage: number // % of CPU samples in (idle) during wasm-idle — the real "is the thread idle" signal
    wasmIdleScriptSeconds: number // absolute scriptDuration during wasm-idle; a busy-loop regression pushes this to seconds
    cleanupEffectiveness: number | null // memory-based: % of WASM heap overhead released after navigating away; null when overhead is below the noise floor (PROF-4)
    memoryOverheadMB: number // additional memory used by WASM at idle
    verdict: 'PASS' | 'WARN' | 'FAIL'
    findings: string[]
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extract a metric value by name from CDP Performance.getMetrics response
 */
function getMetric(metrics: Array<{ name: string; value: number }>, name: string): number {
  const metric = metrics.find((m) => m.name === name)
  return metric?.value ?? 0
}

/**
 * Analyze profile nodes to find top CPU-consuming functions
 */
function analyzeProfileNodes(profile: {
  nodes?: Array<{
    id: number
    callFrame?: { functionName?: string; url?: string }
  }>
  samples?: number[]
}): ProfileResult['profile']['topFunctions'] {
  const nodes = profile.nodes || []
  const samples = profile.samples || []
  const totalSamples = samples.length

  if (totalSamples === 0) return []

  // Count samples per node
  const hitCounts = new Map<number, number>()
  for (const nodeId of samples) {
    hitCounts.set(nodeId, (hitCounts.get(nodeId) || 0) + 1)
  }

  // Map node IDs to function info
  const nodeMap = new Map<number, (typeof nodes)[0]>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  // Build top functions list
  const topFunctions: ProfileResult['profile']['topFunctions'] = []
  for (const [nodeId, hitCount] of hitCounts.entries()) {
    const node = nodeMap.get(nodeId)
    if (node && node.callFrame) {
      topFunctions.push({
        functionName: node.callFrame.functionName || '(anonymous)',
        url: node.callFrame.url || '',
        hitCount,
        percentage: (hitCount / totalSamples) * 100,
      })
    }
  }

  // Sort by hit count descending
  topFunctions.sort((a, b) => b.hitCount - a.hitCount)

  return topFunctions.slice(0, 20) // Top 20
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
  console.log(`  ⏳ Setting up ${scenarioName}...`)

  // Setup the scenario
  await setupFn()

  // Warmup period
  console.log(`  ⏳ Warmup (${WARMUP_MS / 1000}s)...`)
  await page.waitForTimeout(WARMUP_MS)

  // Get metrics before profiling
  const metricsBefore = await client.send('Performance.getMetrics')

  // Start CPU profiling
  console.log(`  ⏳ Profiling (${PROFILE_DURATION_MS / 1000}s)...`)
  await client.send('Profiler.start')

  // Wait for profile duration (this is the idle measurement period)
  await page.waitForTimeout(PROFILE_DURATION_MS)

  // Stop profiling
  const { profile } = await client.send('Profiler.stop')

  // Force GC before the final heap read so the measurement reflects true
  // retention rather than un-collected garbage. Without this the
  // cleanup-effectiveness ratio is at the mercy of GC timing on a small
  // (~2.5MB) denominator, which produced a persistent phantom WARN (PROF-4).
  // Mirrors memory-profile.spec.ts, which forces GC before every heap read.
  await client.send('HeapProfiler.collectGarbage').catch(() => {
    /* GC unavailable in this context — fall through to the live reading */
  })

  // Get metrics after profiling
  const metricsAfter = await client.send('Performance.getMetrics')

  // Analyze profile nodes to find top CPU consumers
  const topFunctions = analyzeProfileNodes(profile)

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
  }

  console.log(`  ✅ ${scenarioName} complete (${result.profile.totalSamples} samples)`)
  return result
}

/**
 * Generate comparison report with analysis.
 *
 * PROF-001-D4: the old overhead ratio exploded when the baseline scriptDuration
 * was ~0 (the common case for an idle homepage), forcing a false 100% overhead
 * and a bogus WARN. The ratio is now reported as null when the baseline is
 * near-zero, and the verdict is driven by absolute/idle/memory signals that
 * actually detect a regression (busy loop, leak, or non-idle WASM runtime).
 */
function generateComparisonReport(
  results: ProfileResult[],
  deviceName: string,
  deviceLabel: string,
): ComparisonReport {
  const baseline = results.find((r) => r.scenario === 'baseline')!
  const wasmIdle = results.find((r) => r.scenario === 'wasm-idle')!
  const postCleanup = results.find((r) => r.scenario === 'post-cleanup')!

  const baselineScript = baseline.metrics.scriptDuration
  const wasmIdleScript = wasmIdle.metrics.scriptDuration

  // Overhead ratio is meaningful ONLY when the baseline is non-trivial.
  // Otherwise report null (a near-zero/near-zero ratio is noise, not 100%).
  const wasmCpuOverhead =
    baselineScript > VERDICT_THRESHOLDS.NEAR_ZERO_BASELINE_S
      ? ((wasmIdleScript - baselineScript) / baselineScript) * 100
      : null

  // The real "is the thread idle" signal: share of CPU samples spent in (idle).
  const wasmIdlePercentage =
    wasmIdle.profile.topFunctions.find((f) => f.functionName === '(idle)')?.percentage ?? 0

  // Memory-based cleanup effectiveness (the scriptDuration-based one was
  // meaningless at near-zero). How much of the WASM heap overhead was released
  // after navigating away from the game.
  const baselineHeap = baseline.metrics.jsHeapUsedSize
  const wasmIdleHeap = wasmIdle.metrics.jsHeapUsedSize
  const postCleanupHeap = postCleanup.metrics.jsHeapUsedSize
  const memoryOverheadBytes = wasmIdleHeap - baselineHeap
  const memoryOverheadMB = memoryOverheadBytes / 1024 / 1024

  // Only compute the ratio when the overhead is non-trivial. Below the floor the
  // ratio is small-denominator noise, so report null and keep it out of the
  // verdict (mirrors NEAR_ZERO_BASELINE_S for the CPU overhead ratio). PROF-4.
  // The MB floor also guarantees a non-zero denominator, so no separate > 0 guard.
  const cleanupEffectiveness =
    memoryOverheadMB >= VERDICT_THRESHOLDS.CLEANUP_DENOMINATOR_FLOOR_MB
      ? ((wasmIdleHeap - postCleanupHeap) / memoryOverheadBytes) * 100
      : null

  const findings: string[] = []

  if (wasmCpuOverhead === null) {
    findings.push(
      `WASM idle CPU overhead: N/A (baseline scriptDuration ${baselineScript.toFixed(3)}s below noise floor; absolute idle% used instead)`,
    )
  } else if (wasmCpuOverhead > 50) {
    findings.push(`WASM idle CPU usage is ${wasmCpuOverhead.toFixed(0)}% higher than baseline`)
  } else if (wasmCpuOverhead > 20) {
    findings.push(
      `WASM idle CPU usage is ${wasmCpuOverhead.toFixed(0)}% higher than baseline (moderate)`,
    )
  } else {
    findings.push(`WASM idle CPU overhead is minimal (${wasmCpuOverhead.toFixed(0)}%)`)
  }

  findings.push(
    `WASM idle thread was idle ${wasmIdlePercentage.toFixed(2)}% of samples (${wasmIdleScript.toFixed(3)}s script over ${PROFILE_DURATION_MS / 1000}s)`,
  )

  if (memoryOverheadMB > 5) {
    findings.push(`WASM adds ${memoryOverheadMB.toFixed(1)}MB memory overhead`)
  }

  if (cleanupEffectiveness === null) {
    findings.push(
      `Cleanup effectiveness: N/A (overhead ${memoryOverheadMB.toFixed(1)}MB below the ${VERDICT_THRESHOLDS.CLEANUP_DENOMINATOR_FLOOR_MB}MB noise floor — ratio is small-denominator noise, PROF-4)`,
    )
  } else if (cleanupEffectiveness < VERDICT_THRESHOLDS.CLEANUP_EFFECTIVENESS_WARN) {
    findings.push(
      `Cleanup only ${cleanupEffectiveness.toFixed(0)}% effective — WASM memory may not be fully released`,
    )
  } else {
    findings.push(`Cleanup is ${cleanupEffectiveness.toFixed(0)}% effective`)
  }

  // Look for Go runtime specific functions in WASM idle
  const goFunctions = wasmIdle.profile.topFunctions.filter(
    (f) =>
      f.url.includes('wasm') ||
      f.url.includes('wasm_exec') ||
      f.functionName.toLowerCase().includes('go') ||
      f.functionName.includes('runtime'),
  )
  if (goFunctions.length > 0) {
    const totalGoPercentage = goFunctions.reduce((sum, f) => sum + f.percentage, 0)
    if (totalGoPercentage > 5) {
      findings.push(
        `Go/WASM functions consuming ${totalGoPercentage.toFixed(1)}% CPU when idle: ${goFunctions
          .slice(0, 3)
          .map((f) => f.functionName)
          .join(', ')}`,
      )
    }
  }

  // Determine verdict from absolute/idle/memory signals (not the near-zero ratio).
  let verdict: 'PASS' | 'WARN' | 'FAIL' = 'PASS'
  if (
    wasmIdleScript > VERDICT_THRESHOLDS.SCRIPT_SECONDS_FAIL ||
    wasmIdlePercentage < VERDICT_THRESHOLDS.IDLE_PCT_WARN ||
    memoryOverheadMB > VERDICT_THRESHOLDS.MEMORY_OVERHEAD_FAIL_MB
  ) {
    verdict = 'FAIL'
  } else if (
    wasmIdleScript > VERDICT_THRESHOLDS.SCRIPT_SECONDS_WARN ||
    wasmIdlePercentage < VERDICT_THRESHOLDS.IDLE_PCT_PASS ||
    memoryOverheadMB > VERDICT_THRESHOLDS.MEMORY_OVERHEAD_WARN_MB ||
    (cleanupEffectiveness !== null &&
      cleanupEffectiveness < VERDICT_THRESHOLDS.CLEANUP_EFFECTIVENESS_WARN)
  ) {
    verdict = 'WARN'
  }

  return {
    timestamp: new Date().toISOString(),
    device: deviceName,
    deviceLabel,
    profileDurationMs: PROFILE_DURATION_MS,
    baseUrl: BASE_URL,
    scenarios: results.map((r) => ({ ...r, rawProfile: undefined })),
    analysis: {
      wasmCpuOverhead,
      wasmIdlePercentage,
      wasmIdleScriptSeconds: wasmIdleScript,
      cleanupEffectiveness,
      memoryOverheadMB,
      verdict,
      findings,
    },
  }
}

/**
 * Save individual profile to JSON
 */
function saveProfile(result: ProfileResult, filename: string): void {
  const filepath = path.join(RESULTS_DIR, filename)
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2))
  console.log(`  📁 Saved: ${filename}`)
}

/**
 * Save comparison report to JSON
 */
function saveReport(report: ComparisonReport, filename: string): void {
  const filepath = path.join(RESULTS_DIR, filename)
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2))
  console.log(`  📁 Saved: ${filename}`)
}

/**
 * Print formatted report to console
 */
function printReport(results: ProfileResult[], report: ComparisonReport): void {
  const divider = '='.repeat(70)
  const subDivider = '-'.repeat(70)

  console.log('\n' + divider)
  console.log(`📊 WASM CPU PROFILING RESULTS - ${report.deviceLabel}`)
  console.log(`   Profile Duration: ${PROFILE_DURATION_MS / 1000}s per scenario`)
  console.log(`   Base URL: ${BASE_URL}`)
  console.log(divider)

  for (const r of results) {
    console.log(`\n📍 ${r.scenario.toUpperCase()}`)
    console.log(subDivider)
    console.log(`   JS Heap Used:     ${(r.metrics.jsHeapUsedSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   JS Heap Total:    ${(r.metrics.jsHeapTotalSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Script Duration:  ${r.metrics.scriptDuration.toFixed(4)}s`)
    console.log(`   Task Duration:    ${r.metrics.taskDuration.toFixed(4)}s`)
    console.log(`   Layout Count:     ${r.metrics.layoutCount}`)
    console.log(`   Style Recalcs:    ${r.metrics.recalcStyleCount}`)
    console.log(`   CPU Samples:      ${r.profile.totalSamples}`)

    if (r.profile.topFunctions.length > 0) {
      console.log(`\n   Top CPU Consumers:`)
      for (const fn of r.profile.topFunctions.slice(0, 5)) {
        const name = fn.functionName || '(anonymous)'
        const shortUrl = fn.url ? ` [${path.basename(fn.url)}]` : ''
        console.log(
          `     ${fn.percentage.toFixed(1).padStart(5)}% | ${fn.hitCount.toString().padStart(5)} samples | ${name}${shortUrl}`,
        )
      }
    }
  }

  console.log('\n' + divider)
  console.log('📈 ANALYSIS')
  console.log(divider)
  const a = report.analysis
  const overheadStr =
    a.wasmCpuOverhead === null
      ? 'N/A (baseline below noise floor)'
      : `${a.wasmCpuOverhead.toFixed(1)}%`
  console.log(`   WASM CPU Overhead:     ${overheadStr}`)
  console.log(`   WASM Idle %:           ${a.wasmIdlePercentage.toFixed(2)}% (higher is better)`)
  console.log(
    `   WASM Idle Script:      ${a.wasmIdleScriptSeconds.toFixed(3)}s over ${PROFILE_DURATION_MS / 1000}s`,
  )
  console.log(`   Memory Overhead:       ${a.memoryOverheadMB.toFixed(1)} MB`)
  console.log(
    `   Cleanup Effectiveness: ${a.cleanupEffectiveness === null ? 'N/A' : `${a.cleanupEffectiveness.toFixed(1)}%`}`,
  )
  console.log(`   Verdict:               ${a.verdict}`)
  console.log(`\n   Findings:`)
  for (const finding of a.findings) {
    console.log(`     • ${finding}`)
  }

  console.log('\n' + divider)
  console.log(`📁 Results saved to: ${RESULTS_DIR}`)
  console.log(divider + '\n')
}

/**
 * Run profiling for a specific device
 */
async function runDeviceProfiling(
  deviceConfig: (typeof DEVICE_CONFIGS)[number],
): Promise<ComparisonReport> {
  const { name: deviceName, device: deviceId, label: deviceLabel } = deviceConfig

  console.log(`\n${'#'.repeat(70)}`)
  console.log(`# 📱 PROFILING: ${deviceLabel}`)
  console.log(`${'#'.repeat(70)}\n`)

  // Launch browser with device emulation (Chromium for CDP support)
  const browser = await chromium.launch({
    headless: true,
  })

  const context = await browser.newContext({
    ...devices[deviceId],
  })

  // The profiling context must measure the app, not the PWA service worker.
  // Under ENABLE_PWA_IN_DEV the SW registers on the first (baseline) navigation
  // and then serves its offline fallback for the game-route navigation,
  // breaking scenario B. Stub registration so the context stays SW-free (PROF-4).
  await context.addInitScript(() => {
    if ('serviceWorker' in navigator && navigator.serviceWorker) {
      navigator.serviceWorker.register = () =>
        Promise.reject(new Error('SW disabled in profiling context'))
    }
  })

  const page = await context.newPage()

  // Skip onboarding
  await page.addInitScript(() => {
    localStorage.setItem('sudoku_onboarding_complete', 'true')
  })

  // Create CDP session for performance profiling
  const client = await context.newCDPSession(page)

  // Enable Performance and Profiler domains
  await client.send('Performance.enable')
  await client.send('Profiler.enable')
  await client.send('HeapProfiler.enable')
  await client.send('Profiler.setSamplingInterval', { interval: 100 }) // 100μs sampling

  const results: ProfileResult[] = []

  // === SCENARIO A: BASELINE (NO WASM) ===
  console.log('📊 Scenario A: Baseline (no WASM)')
  const baselineResult = await profileScenario(page, client, 'baseline', deviceName, async () => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 })
  })
  results.push(baselineResult)
  saveProfile(baselineResult, `${deviceName}-baseline-profile.json`)

  // === SCENARIO B: WASM LOADED BUT IDLE ===
  console.log('\n📊 Scenario B: WASM Idle')
  const wasmIdleResult = await profileScenario(page, client, 'wasm-idle', deviceName, async () => {
    await page.goto(`/Pcpuprof?d=easy`, { waitUntil: 'networkidle', timeout: 60000 })
    // Wait for the grid to appear (game loaded)
    await page.waitForSelector('[role="grid"]', { timeout: 30000 })

    // Wait for WASM to be fully ready by checking for hint button availability
    // The hint button requires WASM solver to be initialized
    await expect(async () => {
      const hintButton = page.getByRole('button', { name: 'Get a hint' })
      const hasHint = (await hintButton.count()) > 0
      expect(hasHint).toBe(true)
    }).toPass({ timeout: 5000 })

    // Additional wait for WASM to settle
    await page.waitForTimeout(1000)
  })
  results.push(wasmIdleResult)
  saveProfile(wasmIdleResult, `${deviceName}-wasm-idle-profile.json`)

  // === SCENARIO C: POST CLEANUP ===
  console.log('\n📊 Scenario C: Post-Cleanup')
  const postCleanupResult = await profileScenario(
    page,
    client,
    'post-cleanup',
    deviceName,
    async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 })

      // Wait for page to be fully ready after cleanup - detect stable state
      await page.waitForLoadState('domcontentloaded')
      await expect(page.locator('body')).toBeVisible() // Ensure page is responsive
    },
  )
  results.push(postCleanupResult)
  saveProfile(postCleanupResult, `${deviceName}-post-cleanup-profile.json`)

  // === GENERATE COMPARISON REPORT ===
  const report = generateComparisonReport(results, deviceName, deviceLabel)
  saveReport(report, `${deviceName}-comparison-report.json`)

  // Print formatted report to console
  printReport(results, report)

  // Cleanup
  await client.detach()
  await browser.close()

  return report
}

// ============================================
// Test Suite
// ============================================

// Serialized: CPU profile measurements must not contend with sibling workers (PROF-001-D9).
test.describe.serial('@profiling @slow WASM CPU Profiling', () => {
  test.beforeAll(async () => {
    // Ensure results directory exists
    if (!fs.existsSync(RESULTS_DIR)) {
      fs.mkdirSync(RESULTS_DIR, { recursive: true })
    }
  })

  test('profile WASM runtime CPU usage - Pixel 5 (Android)', async () => {
    // Increase test timeout for long profiling (3 scenarios × 30s + warmup + overhead)
    test.setTimeout(300_000) // 5 minutes

    console.log('\n🚀 Starting WASM CPU Profiling - Pixel 5 (Android)...\n')
    console.log(`   Base URL: ${BASE_URL}`)

    const report = await runDeviceProfiling(DEVICE_CONFIGS[0])

    // === ASSERTIONS (PROF-001-D4: the verdict is now ASSERTED, not just logged) ===
    expect(report.scenarios.length).toBe(3)
    expect(report.scenarios.every((r) => r.profile.totalSamples > 0)).toBe(true)
    // A FAIL verdict must break the test — that is what makes this a real guard.
    expect(
      report.analysis.verdict,
      `Pixel 5 verdict was ${report.analysis.verdict}: ${report.analysis.findings.join('; ')}`,
    ).not.toBe('FAIL')
    // The most robust regression signal: the WASM runtime must be (mostly) idle
    // when nothing is happening, otherwise it drains battery on mobile.
    expect(
      report.analysis.wasmIdlePercentage,
      'WASM idle thread must be mostly idle',
    ).toBeGreaterThanOrEqual(VERDICT_THRESHOLDS.IDLE_PCT_WARN)

    logVerdict(report)
  })

  test('profile WASM runtime CPU usage - iPhone 12 (iOS)', async () => {
    // Increase test timeout for long profiling (3 scenarios × 30s + warmup + overhead)
    test.setTimeout(300_000) // 5 minutes

    console.log('\n🚀 Starting WASM CPU Profiling - iPhone 12 (iOS)...\n')
    console.log(`   Base URL: ${BASE_URL}`)

    const report = await runDeviceProfiling(DEVICE_CONFIGS[1])

    // === ASSERTIONS (PROF-001-D4) ===
    expect(report.scenarios.length).toBe(3)
    expect(report.scenarios.every((r) => r.profile.totalSamples > 0)).toBe(true)
    expect(
      report.analysis.verdict,
      `iPhone 12 verdict was ${report.analysis.verdict}: ${report.analysis.findings.join('; ')}`,
    ).not.toBe('FAIL')
    expect(
      report.analysis.wasmIdlePercentage,
      'WASM idle thread must be mostly idle',
    ).toBeGreaterThanOrEqual(VERDICT_THRESHOLDS.IDLE_PCT_WARN)

    logVerdict(report)
  })

  // Desktop is profiled for visibility on the report portal, but it is NOT a
  // release gate: WASM CPU/memory pressure is a mobile concern (battery, thermal)
  // and desktop has ample headroom. This run records the verdict and metrics
  // without failing the build on the desktop result.
  test('profile WASM runtime CPU usage - Desktop (Chrome) [informational]', async () => {
    test.setTimeout(300_000) // 5 minutes

    console.log('\n🚀 Starting WASM CPU Profiling - Desktop (Chrome)...\n')
    console.log(`   Base URL: ${BASE_URL}`)

    const report = await runDeviceProfiling(DEVICE_CONFIGS[2])

    // Sanity only: the run must produce real samples. The verdict is recorded and
    // surfaced on the portal, but desktop does not gate the deploy.
    expect(report.scenarios.length).toBe(3)
    expect(report.scenarios.every((r) => r.profile.totalSamples > 0)).toBe(true)

    logVerdict(report)
  })
})

function logVerdict(report: ComparisonReport): void {
  if (report.analysis.verdict === 'FAIL') {
    console.warn(
      `⚠️  VERDICT [${report.deviceLabel}]: FAIL - Significant WASM CPU overhead detected!`,
    )
    console.warn('   Consider implementing lazy WASM loading or TinyGo migration.')
  } else if (report.analysis.verdict === 'WARN') {
    console.warn(`⚠️  VERDICT [${report.deviceLabel}]: WARN - Moderate WASM CPU overhead detected.`)
    console.warn('   Monitor for user-reported battery issues.')
  } else {
    console.log(
      `✅ VERDICT [${report.deviceLabel}]: PASS - No significant WASM CPU overhead detected.`,
    )
  }
}
