/**
 * Parses a numeric URL query parameter, falling back to 0.
 *
 * @param value - The raw parameter value, or null when the parameter is absent.
 * @returns The parsed base-10 integer, or 0 when the value is absent or not
 *   numeric; a leading numeric prefix parses truncated ('1200abc' parses as
 *   1200).
 */
export function parseNumericParam(value: string | null): number {
  const parsed = parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : 0
}
