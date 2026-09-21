/**
 * Runtime loader for the Go WASM support script (wasm_exec.js).
 *
 * The only module that knows how wasm_exec.js is fetched: a dynamic import of
 * the public asset at the given URL. A module worker cannot run the classic
 * script-loading global, and evaluating a fetched script string would need
 * 'unsafe-eval' in script-src, which no deployment surface grants; a dynamic
 * import is script-src 'self' legal on every surface. @vite-ignore keeps the
 * bundler from resolving the runtime-computed URL at build time, so the
 * caller's BASE_URL-prefixed path (inlined as /sudoku/ on Pages) survives
 * into the built worker chunk.
 * @param url Absolute-path or absolute-URL location of wasm_exec.js.
 * @returns Resolves once the module has executed and defined `Go`.
 * @throws The underlying import failure when the module cannot be fetched.
 */
export async function loadGoRuntime(url: string): Promise<void> {
  await import(/* @vite-ignore */ url)
}
