/**
 * Chrome DevTools Protocol helpers shared by the profiling specs.
 *
 * Centralizes the CDP session lifecycle and memory-metric extraction so the
 * profiling specs measure the application instead of re-implementing plumbing.
 * Extracted from memory-profile.spec.ts (PROF-001-D2).
 */

import { type Page, type CDPSession } from '@playwright/test'

export interface MemoryMetrics {
  jsHeapUsedSize: number
  jsHeapTotalSize: number
  documents: number
  frames: number
  jsEventListeners: number
  nodes: number
  layoutCount: number
  recalcStyleCount: number
  timestamp: number
}

export interface PerformanceMemory {
  jsHeapSizeLimit: number
  totalJSHeapSize: number
  usedJSHeapSize: number
}

const EMPTY_METRICS: MemoryMetrics = {
  jsHeapUsedSize: 0,
  jsHeapTotalSize: 0,
  documents: 0,
  frames: 0,
  jsEventListeners: 0,
  nodes: 0,
  layoutCount: 0,
  recalcStyleCount: 0,
  timestamp: 0,
}

/**
 * Reuses a single CDP session across measurements to avoid the resource
 * exhaustion that comes from opening a session per sample.
 */
export class CDPManager {
  private client: CDPSession | null = null
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async getSession(): Promise<CDPSession> {
    if (!this.client) {
      this.client = await this.page.context().newCDPSession(this.page)
      await this.client.send('Performance.enable')
      await this.client.send('HeapProfiler.enable')
    }
    return this.client
  }

  async getMemoryMetrics(): Promise<MemoryMetrics> {
    try {
      const client = await this.getSession()
      const { metrics } = await client.send('Performance.getMetrics')
      const map: Record<string, number> = {}
      for (const m of metrics) map[m.name] = m.value
      return {
        jsHeapUsedSize: map['JSHeapUsedSize'] ?? 0,
        jsHeapTotalSize: map['JSHeapTotalSize'] ?? 0,
        documents: map['Documents'] ?? 0,
        frames: map['Frames'] ?? 0,
        jsEventListeners: map['JSEventListeners'] ?? 0,
        nodes: map['Nodes'] ?? 0,
        layoutCount: map['LayoutCount'] ?? 0,
        recalcStyleCount: map['RecalcStyleCount'] ?? 0,
        timestamp: Date.now(),
      }
    } catch {
      return { ...EMPTY_METRICS, timestamp: Date.now() }
    }
  }

  async forceGC(): Promise<void> {
    try {
      const client = await this.getSession()
      await client.send('HeapProfiler.collectGarbage')
      await this.page.waitForTimeout(50)
    } catch {
      // GC not available in this context
    }
  }

  async detach(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.detach()
    } catch {
      // Already detached
    }
    this.client = null
  }
}

/**
 * Chrome-only `performance.memory` snapshot (returns null elsewhere).
 */
export async function getPerformanceMemory(page: Page): Promise<PerformanceMemory | null> {
  try {
    return await page.evaluate(() => {
      const perf = performance as Performance & { memory?: PerformanceMemory }
      if (!perf.memory) return null
      return {
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        usedJSHeapSize: perf.memory.usedJSHeapSize,
      } as PerformanceMemory
    })
  } catch {
    return null
  }
}

export function calculateGrowthMB(initial: number, final: number): number {
  return (final - initial) / (1024 * 1024)
}

export function calculateVariancePct(baseline: number, current: number): number {
  if (baseline === 0) return current > 0 ? 100 : 0
  return ((current - baseline) / baseline) * 100
}
