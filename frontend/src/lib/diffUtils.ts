/**
 * Memory-efficient diff utilities for board state changes
 * Used for compact history storage instead of storing full board states
 */

export interface CellChange {
  idx: number
  oldValue: number
  newValue: number
}

export interface CandidateChange {
  idx: number
  oldMask: number
  newMask: number
}

export interface StateDiff {
  /** Board cell changes (only cells that actually changed) */
  boardChanges: CellChange[]
  /** Candidate mask changes (only cells that actually changed) */
  candidateChanges: CandidateChange[]
}

/**
 * Create a diff between two board states
 */
export function createStateDiff(
  oldBoard: number[],
  newBoard: number[],
  oldCandidates: Uint16Array,
  newCandidates: Uint16Array
): StateDiff {
  const boardChanges: CellChange[] = []
  const candidateChanges: CandidateChange[] = []

  // Find board changes
  for (let idx = 0; idx < 81; idx++) {
    const oldValue = oldBoard[idx] || 0
    const newValue = newBoard[idx] || 0
    if (oldValue !== newValue) {
      boardChanges.push({ idx, oldValue, newValue })
    }
  }

  // Find candidate changes
  for (let idx = 0; idx < 81; idx++) {
    const oldMask = oldCandidates[idx] || 0
    const newMask = newCandidates[idx] || 0
    if (oldMask !== newMask) {
      candidateChanges.push({ idx, oldMask, newMask })
    }
  }

  return { boardChanges, candidateChanges }
}

/**
 * Apply a diff to board states to get the new state
 */
export function applyStateDiff(
  baseBoard: number[],
  baseCandidates: Uint16Array,
  diff: StateDiff
): { board: number[]; candidates: Uint16Array } {
  // Apply board changes
  const newBoard = [...baseBoard]
  for (const change of diff.boardChanges) {
    newBoard[change.idx] = change.newValue
  }

  // Apply candidate changes
  const newCandidates = new Uint16Array(baseCandidates)
  for (const change of diff.candidateChanges) {
    newCandidates[change.idx] = change.newMask
  }

  return { board: newBoard, candidates: newCandidates }
}

/**
 * Apply a diff in reverse to get the previous state
 */
export function unapplyStateDiff(
  currentBoard: number[],
  currentCandidates: Uint16Array,
  diff: StateDiff
): { board: number[]; candidates: Uint16Array } {
  // Reverse board changes
  const prevBoard = [...currentBoard]
  for (const change of diff.boardChanges) {
    prevBoard[change.idx] = change.oldValue
  }

  // Reverse candidate changes
  const prevCandidates = new Uint16Array(currentCandidates)
  for (const change of diff.candidateChanges) {
    prevCandidates[change.idx] = change.oldMask
  }

  return { board: prevBoard, candidates: prevCandidates }
}

/**
 * Calculate approximate memory usage of a diff
 */
export function getDiffMemorySize(diff: StateDiff): number {
  // Each CellChange: idx(4) + oldValue(4) + newValue(4) = 12 bytes
  // Each CandidateChange: idx(4) + oldMask(4) + newMask(4) = 12 bytes
  return diff.boardChanges.length * 12 + diff.candidateChanges.length * 12
}

/**
 * Get memory size of storing full board states (old approach)
 */
export function getFullStateMemorySize(): number {
  // board: 81 * 4 bytes + candidates: 81 * 2 bytes = 486 bytes per state
  return 81 * 4 + 81 * 2
}

/**
 * Serialize diff for storage (JSON-compatible)
 */
export function serializeDiff(diff: StateDiff): SerializedDiff {
  return {
    boardChanges: diff.boardChanges,
    candidateChanges: diff.candidateChanges
  }
}

interface SerializedDiff {
  boardChanges?: CellChange[]
  candidateChanges?: CandidateChange[]
}

/**
 * Deserialize diff from storage
 */
export function deserializeDiff(data: SerializedDiff): StateDiff {
  return {
    boardChanges: data.boardChanges ?? [],
    candidateChanges: data.candidateChanges ?? []
  }
}