export function shouldIncrementHintCounter(
  currentSignature: string,
  lastShownSignature: string | null,
): boolean {
  return currentSignature !== lastShownSignature
}
