/**
 * Helpers for reading regex capture groups in specs.
 *
 * Under noUncheckedIndexedAccess, match[N] is string | undefined; these
 * helpers turn a possibly-absent capture into the value the match presence
 * already implies at each call site.
 */

/**
 * Parse a regex capture group as an integer.
 * A group that did not participate yields NaN, matching parseInt's handling
 * of absent input.
 */
export function parseIntCapture(captured: string | undefined, radix?: number): number {
  return parseInt(captured ?? '', radix)
}
