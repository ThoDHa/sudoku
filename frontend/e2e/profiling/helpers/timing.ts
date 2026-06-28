/**
 * Timing helpers shared by the profiling specs.
 *
 * `measureTime` wraps an async operation with high-resolution timing without
 * coupling the measurement to Playwright's assertion-pollling latency (the old
 * selection-performance spec measured both the app AND Playwright's own polling
 * when it timed `expect(...).toHaveClass(...)`). Extracted per PROF-001-D2.
 */

export interface TimingStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  p95: number;
}

export interface TimedResult<T> {
  result: T;
  duration: number;
}

/** High-resolution timing of a single async operation, in milliseconds. */
export async function measureTime<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now();
  const result = await operation();
  return { result, duration: performance.now() - start };
}

export interface MedianResult {
  median: number;
  timings: number[];
  stats: TimingStats;
}

/**
 * Measure an operation N times and return the median duration (ms). The median
 * absorbs one-off environment spikes (GC pauses, CPU scheduling, WASM compile
 * hiccups) that flake a single-sample timing assertion on noisy mobile
 * hardware, while still catching a sustained regression (which lifts the whole
 * distribution, median included). Use for absolute-ms timing guards on the
 * mobile projects where single-sample expect(ms).toBeLessThan(T) is flake-prone.
 *
 * The operation is invoked with no per-iteration setup; callers that need to
 * re-select / re-arm between samples should collect timings via measureTime in
 * their own loop and call summarize(timings).median directly.
 */
export async function measureMedian(
  operation: () => Promise<unknown>,
  samples: number,
): Promise<MedianResult> {
  const timings: number[] = [];
  for (let i = 0; i < samples; i++) {
    timings.push((await measureTime(operation)).duration);
  }
  const stats = summarize(timings);
  return { median: stats.median, timings, stats };
}

/** Reduce a list of timings (ms) to min/max/avg/median/p95 statistics. */
export function summarize(timings: number[]): TimingStats {
  const count = timings.length;
  if (count === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, median: 0, p95: 0 };
  }
  const sorted = [...timings].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const idx = (rank: number) => sorted[Math.min(count - 1, Math.floor(rank))];
  return {
    count,
    min: sorted[0],
    max: sorted[count - 1],
    avg: sum / count,
    median: idx(count / 2),
    p95: idx(count * 0.95),
  };
}
