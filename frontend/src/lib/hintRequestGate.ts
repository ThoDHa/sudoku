// Guards hint requests against re-entry. A hint awaits the WASM solver, so
// spamming the button can start a second solver call before the first settles.
// begin() must run synchronously before any await and end() in a finally block,
// so a duplicate request made while one is in flight is rejected and the gate
// always releases, even when the request throws.
//
//   if (!gate.canStart()) return
//   gate.begin()
//   try { return await solver() }
//   finally { gate.end() }

export interface HintRequestGate {
  /** True when no hint request is currently in flight. */
  canStart(): boolean
  /** Mark a request as in-progress. Call synchronously, before any await. */
  begin(): void
  /** Clear the in-progress flag. Call in a finally block so it always runs. */
  end(): void
  /** Whether a request is currently in flight. */
  isInProgress(): boolean
}

export function createHintRequestGate(): HintRequestGate {
  let inProgress = false
  return {
    canStart: () => !inProgress,
    begin: () => {
      inProgress = true
    },
    end: () => {
      inProgress = false
    },
    isInProgress: () => inProgress,
  }
}
