import { describe, it, expect } from 'vitest'
import {
  buildSavedState,
  loadSavedGameState,
  restoreHintCounters,
  type SavedGameState,
} from './savedGameState'
import { STORAGE_SCHEMA_VERSION } from './storageMigration'

const baseSaveInput = {
  board: Array(81).fill(0),
  candidates: Array(81).fill([]) as number[][],
  elapsedMs: 12345,
  history: [],
  autoFillUsed: false,
  difficulty: 'easy',
  isComplete: false,
  hintsUsed: 0,
  techniqueHintsUsed: 0,
}

describe('savedGameState - buildSavedState', () => {
  it('stamps the current schema version onto every built save', () => {
    const saved = buildSavedState(baseSaveInput)

    expect(saved.schemaVersion).toBe(STORAGE_SCHEMA_VERSION)
  })

  it('preserves the core game fields supplied by the caller', () => {
    const saved = buildSavedState({ ...baseSaveInput, difficulty: 'hard', elapsedMs: 5000 })

    expect(saved.difficulty).toBe('hard')
    expect(saved.elapsedMs).toBe(5000)
    expect(saved.board).toHaveLength(81)
  })
})

describe('savedGameState - loadSavedGameState schema versioning', () => {
  const legacyState: SavedGameState = {
    board: Array(81).fill(5),
    candidates: Array(81).fill([]),
    elapsedMs: 2000,
    history: [],
    autoFillUsed: true,
    savedAt: 1700000000000,
    difficulty: 'medium',
  }

  it('treats a legacy save without schemaVersion as version 0 and migrates it forward', () => {
    const loaded = loadSavedGameState(JSON.stringify(legacyState))

    expect(loaded).not.toBeNull()
    expect(loaded!.board).toHaveLength(81)
    expect(loaded!.difficulty).toBe('medium')
  })

  it('passes a current-version save through unchanged', () => {
    const current: SavedGameState = { ...legacyState, schemaVersion: STORAGE_SCHEMA_VERSION }

    const loaded = loadSavedGameState(JSON.stringify(current))

    expect(loaded).not.toBeNull()
    expect(loaded).toEqual(current)
  })

  it('migrates an older-version save forward and preserves the persisted fields', () => {
    const older: SavedGameState = { ...legacyState, schemaVersion: 0 }

    const loaded = loadSavedGameState(JSON.stringify(older))

    expect(loaded).not.toBeNull()
    expect(loaded!.board).toEqual(legacyState.board)
    expect(loaded!.elapsedMs).toBe(legacyState.elapsedMs)
  })

  it('returns null for invalid JSON', () => {
    expect(loadSavedGameState('{not json')).toBeNull()
  })

  it('returns null for non-object JSON payloads', () => {
    expect(loadSavedGameState('"a string"')).toBeNull()
    expect(loadSavedGameState('42')).toBeNull()
    expect(loadSavedGameState('null')).toBeNull()
  })
})

describe('savedGameState - restoreHintCounters', () => {
  it('defaults missing counters to 0 for legacy saves', () => {
    const saved = {
      board: [],
      candidates: [],
      elapsedMs: 0,
      history: [],
      autoFillUsed: false,
      savedAt: 0,
      difficulty: 'easy',
    } as SavedGameState

    expect(restoreHintCounters(saved)).toEqual({ hintsUsed: 0, techniqueHintsUsed: 0 })
  })

  it('returns the stored counters when present', () => {
    const saved = {
      board: [],
      candidates: [],
      elapsedMs: 0,
      history: [],
      autoFillUsed: false,
      savedAt: 0,
      difficulty: 'easy',
      hintsUsed: 3,
      techniqueHintsUsed: 2,
    } as SavedGameState

    expect(restoreHintCounters(saved)).toEqual({ hintsUsed: 3, techniqueHintsUsed: 2 })
  })
})
