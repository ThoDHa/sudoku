// Builds and reads the persisted game-state shape written to localStorage by
// the autosave and beforeunload save sites. Sharing the builder here keeps the
// persisted fields from drifting between those two callers, and the reader
// centralizes the legacy-save defaults (counters default to 0).

import type { Move } from '../hooks/useSudokuGame'
import {
  STORAGE_SCHEMA_VERSION,
  migrateVersionedRecord,
  type MigrationMap,
} from './storageMigration'

export interface SavedGameState {
  schemaVersion?: number
  board: number[]
  candidates: number[][] // Serialized from Set<number>[]
  elapsedMs: number
  history: Move[]
  autoFillUsed: boolean
  savedAt: number // timestamp
  difficulty: string // difficulty level for resume display
  isComplete?: boolean // Whether the game was completed
  // Optional on the persisted shape: older saves predate these fields and are
  // defaulted to 0 on restore (see restoreHintCounters).
  hintsUsed?: number
  techniqueHintsUsed?: number
}

const SAVED_GAME_MIGRATIONS: MigrationMap<SavedGameState> = {}

// Build the persisted shape from live game values. Shared by the autosave and
// beforeunload save sites so the persisted fields cannot drift between them.
export function buildSavedState(input: {
  board: number[]
  candidates: number[][]
  elapsedMs: number
  history: Move[]
  autoFillUsed: boolean
  difficulty: string
  isComplete?: boolean
  hintsUsed: number
  techniqueHintsUsed: number
}): SavedGameState {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    board: input.board,
    candidates: input.candidates,
    elapsedMs: input.elapsedMs,
    history: input.history,
    autoFillUsed: input.autoFillUsed,
    savedAt: Date.now(),
    difficulty: input.difficulty,
    isComplete: input.isComplete,
    hintsUsed: input.hintsUsed,
    techniqueHintsUsed: input.techniqueHintsUsed,
  }
}

// Read and migrate a raw localStorage JSON string into a SavedGameState. A
// legacy entry without a schemaVersion field is treated as version 0 and
// migrated forward to STORAGE_SCHEMA_VERSION. Returns null on a parse failure
// or non-object payload so callers can discard the entry.
export function loadSavedGameState(rawJson: string): SavedGameState | null {
  try {
    const parsed: unknown = JSON.parse(rawJson)
    return migrateVersionedRecord<SavedGameState>(
      parsed,
      SAVED_GAME_MIGRATIONS,
      STORAGE_SCHEMA_VERSION,
    )
  } catch {
    return null
  }
}

// Read hint counters back from a loaded save. Older saves predate these fields
// and default to 0 so a legacy localStorage entry loads without a crash.
export function restoreHintCounters(saved: SavedGameState): {
  hintsUsed: number
  techniqueHintsUsed: number
} {
  return {
    hintsUsed: saved.hintsUsed ?? 0,
    techniqueHintsUsed: saved.techniqueHintsUsed ?? 0,
  }
}
