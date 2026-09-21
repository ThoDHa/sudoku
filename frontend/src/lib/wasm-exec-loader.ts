/**
 * Runtime loader for the Go WASM support script (wasm_exec.js).
 *
 * The only module that knows how wasm_exec.js is fetched. A module worker
 * cannot run the classic script-loading global, and evaluating a fetched
 * script string would need 'unsafe-eval' in script-src, which no deployment
 * surface grants.
 *
 * Production: a dynamic import of the asset at the given URL. @vite-ignore
 * keeps the bundler from resolving the runtime-computed URL at build time, so
 * the caller's BASE_URL-prefixed path (inlined as /sudoku/ on Pages) survives
 * into the built worker chunk, where it is plain script-src 'self'.
 *
 * Dev server: Vite's transform pipeline refuses module imports of public-dir
 * assets (the ?import request 500s with "should not be imported from source
 * code"), while a plain GET of the same asset serves it. So when the import
 * fails in a serve-mode module (import.meta.env.DEV), refetch the same URL
 * plainly and import it as a blob module. This fallback is dev-gated on
 * purpose: no CSP applies in dev (the meta is stripped in serve mode and no
 * header is sent), but a blob import is script-src-governed and would be
 * illegal on every hardened production surface, so it must never ship there.
 * @param url Absolute-path or absolute-URL location of wasm_exec.js.
 * @returns Resolves once the module has executed and defined `Go`.
 * @throws The underlying import or fetch failure when the module cannot load.
 */
export async function loadGoRuntime(url: string): Promise<void> {
  try {
    await import(/* @vite-ignore */ url)
  } catch (importError) {
    if (!import.meta.env.DEV) {
      throw importError
    }
    let response: Response
    try {
      response = await fetch(url)
    } catch (fetchError) {
      // The cause field is attached via a widened type: this repo's ES2020
      // lib predates both ErrorOptions and Error.cause.
      const wrapped: Error & { cause?: unknown } = new Error(
        `Failed to fetch wasm_exec.js: ${String(fetchError)}`,
      )
      wrapped.cause = fetchError
      throw wrapped
    }
    if (!response.ok) {
      // The cause field is attached via a widened type: this repo's ES2020
      // lib predates both ErrorOptions and Error.cause.
      const wrapped: Error & { cause?: unknown } = new Error(
        `Failed to fetch wasm_exec.js: ${response.status}`,
      )
      wrapped.cause = importError
      throw wrapped
    }
    const source = await response.text()
    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    try {
      await import(/* @vite-ignore */ blobUrl)
    } catch (blobImportError) {
      const wrapped: Error & { cause?: unknown } = new Error(
        `Failed to import wasm_exec.js as a blob module: ${String(blobImportError)}`,
      )
      wrapped.cause = blobImportError
      throw wrapped
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }
}
