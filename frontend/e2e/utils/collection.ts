/**
 * Indexed access under noUncheckedIndexedAccess.
 */

/**
 * Return the element at index, throwing when absent.
 * Call sites use this where the index is runtime-guaranteed in range
 * (e.g. modulo over the collection length) and undefined would be a bug.
 */
export function itemAt<T>(items: T[], index: number): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`itemAt: index ${index} out of range for length ${items.length}`)
  }
  return item
}
