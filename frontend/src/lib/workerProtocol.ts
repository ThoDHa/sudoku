/**
 * The message protocol between worker-client.ts and wasm.worker.ts.
 *
 * Declared once and imported by both sides, so neither end can hold its own
 * idea of what a message looks like.
 */

/**
 * The board snapshot a solver request carries. Both solver requests send the
 * full current state (cells, candidates, givens) for the solver to operate
 * on, so one shape serves them both; if they ever diverge, the owning
 * `WorkerRequest` arm is the place to declare a distinct payload type.
 */
export interface SolverBoardPayload {
  cells: number[]
  candidates: number[][]
  givens: number[]
}

/**
 * A request the client posts into the worker.
 *
 * A discriminated union on `type`, matching `WorkerResponse` below: each arm
 * declares exactly the payload that request takes, so the client cannot post
 * a payload the worker does not expect and the worker reads it without a
 * cast. `init` and `terminate` take no payload, so their arms omit it.
 */
export type WorkerRequest =
  /** Initialize WASM inside the worker. Answered with `ready`. */
  | { type: 'init'; id: string }
  /** Compute the next move for the given board state. */
  | { type: 'findNextMove'; id: string; payload: SolverBoardPayload }
  /** Solve to completion from the given board state. */
  | { type: 'solveAll'; id: string; payload: SolverBoardPayload }
  /** Release WASM state and close the worker. */
  | { type: 'terminate'; id: string }

/** Distributes over a union so each arm drops `K` independently. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * A request before the client attaches its correlation id: the shape callers
 * of `sendRequest` build. Each arm keeps its own payload requirement.
 */
export type WorkerRequestBody = DistributiveOmit<WorkerRequest, 'id'>

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
  | { type: 'ready'; id: string; data?: undefined }
  /** A request succeeded. `data` is the request's return value. */
  | { type: 'result'; id: string; data?: unknown }
  /** A request failed. This is the only failure signal. */
  | { type: 'error'; id: string; error: string }
