import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadGoRuntime } from './wasm-exec-loader'

// Node/vitest's ESM loader imports file: and data: URLs only, and vitest
// rewrites import.meta.url-based file paths to http: URLs the loader then
// refuses. A data: module exercises the same runtime-import machinery the
// production callers rely on (import of a URL string computed at runtime).
const FIXTURE_MARKER = '__wasmExecLoaderFixtureLoaded'
const dataModuleUrl = `data:text/javascript,globalThis.${FIXTURE_MARKER} = true`
const rejectingModuleUrl = 'data:text/javascript,await Promise.reject(new Error("boot failed"))'

describe('loadGoRuntime', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, FIXTURE_MARKER, {
      value: undefined,
      configurable: true,
    })
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('executes the ES module at the given URL', async () => {
    await loadGoRuntime(dataModuleUrl)

    expect(globalThis[FIXTURE_MARKER as keyof typeof globalThis]).toBe(true)
  })

  it('rejects when the module at the URL fails to load outside dev', async () => {
    vi.stubEnv('DEV', false)

    await expect(loadGoRuntime(rejectingModuleUrl)).rejects.toThrow('boot failed')
  })

  it('falls back to a plainly fetched copy in dev when the import fails', async () => {
    vi.stubEnv('DEV', true)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`globalThis.${FIXTURE_MARKER} = true`, {
        status: 200,
        headers: { 'Content-Type': 'text/javascript' },
      }),
    )

    // Node's ESM loader cannot import the http: URL (nor a blob: URL, which
    // only browsers resolve), so both import attempts fail here; the assertable
    // contract is that the fallback fetched the same URL, which is the step
    // the browser then blob-imports.
    await expect(loadGoRuntime('http://localhost:5173/wasm_exec.js')).rejects.toThrow()

    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:5173/wasm_exec.js')
    expect(globalThis[FIXTURE_MARKER as keyof typeof globalThis]).toBeUndefined()
  })

  it('surfaces a failed dev fetch instead of masking it', async () => {
    vi.stubEnv('DEV', true)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 404 }))

    await expect(loadGoRuntime('http://localhost:5173/wasm_exec.js')).rejects.toThrow(
      'Failed to fetch wasm_exec.js: 404',
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('wraps a dev fetch network rejection with the fetch error as cause', async () => {
    vi.stubEnv('DEV', true)
    const networkError = new TypeError('fetch failed')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(networkError)

    const caught: Error & { cause?: unknown } = await loadGoRuntime(
      'http://localhost:5173/wasm_exec.js',
    ).then(
      () => {
        throw new Error('expected rejection')
      },
      (e: Error & { cause?: unknown }) => e,
    )

    expect(caught.message).toContain('Failed to fetch wasm_exec.js')
    expect(caught.cause).toBe(networkError)
  })

  it('wraps a dev blob-import rejection with that error as cause', async () => {
    vi.stubEnv('DEV', true)
    // A top-level throw inside the fetched module: the blob import (which
    // browsers resolve but Node's loader does not) fails on this content.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('throw new Error("module boot failed")', {
        status: 200,
        headers: { 'Content-Type': 'text/javascript' },
      }),
    )

    const caught: Error & { cause?: unknown } = await loadGoRuntime(
      'http://localhost:5173/wasm_exec.js',
    ).then(
      () => {
        throw new Error('expected rejection')
      },
      (e: Error & { cause?: unknown }) => e,
    )

    expect(caught.message).toContain('Failed to import wasm_exec.js as a blob module')
  })
})
