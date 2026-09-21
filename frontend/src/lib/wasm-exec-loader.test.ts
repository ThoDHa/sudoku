import { describe, it, expect, afterEach } from 'vitest'
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
  })

  it('executes the ES module at the given URL', async () => {
    await loadGoRuntime(dataModuleUrl)

    expect(globalThis[FIXTURE_MARKER as keyof typeof globalThis]).toBe(true)
  })

  it('rejects when the module at the URL fails to load', async () => {
    await expect(loadGoRuntime(rejectingModuleUrl)).rejects.toThrow('boot failed')
  })
})
