/**
 * The message protocol between worker-client.ts and wasm.worker.ts.
 *
 * Declared once and imported by both sides, so neither end can hold its own
 * idea of what a message looks like.
 */

/** A request the client posts into the worker. */
export interface WorkerRequest {
  type: 'init' | 'findNextMove' | 'solveAll' | 'terminate'
  id: string
  payload?: unknown
}

/**
 * A response the worker posts back.
 *
 * A discriminated union rather than one shape with optional fields: `type` is
 * the sole success signal, so a response cannot omit a field the other side
 * requires, and adding an arm forces both ends to handle it.
 */
export type WorkerResponse =
  /** The worker script has evaluated. Sent once, before any request, with no id. */
  | { type: 'loaded' }
  /** WASM is initialized. The reply to `init`; carries no payload. */
  | { type: 'ready'; id: string }
  /** A request succeeded. `data` is the request's return value. */
  | { type: 'result'; id: string; data?: unknown }
  /** A request failed. This is the only failure signal. */
  | { type: 'error'; id: string; error: string }
