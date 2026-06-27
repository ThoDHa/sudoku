import { describe, it, expect } from 'vitest'
import {
  buildSavedState,
  restoreHintCounters,
  type SavedGameState,
} from '../lib/savedGameState'

describe('SavedGameState hint-counter persistence', () => {
  const baseSaveInput = {
    board: Array(81).fill(0),
    candidates: Array(81).fill([]),
    elapsedMs: 12345,
    history: [],
    autoFillUsed: false,
    difficulty: 'easy',
    isComplete: false,
  }

  it('captures live hint counters on save and restores them so a score read sees the same values', () => {
    const saved = buildSavedState({
      ...baseSaveInput,
      hintsUsed: 3,
      techniqueHintsUsed: 2,
    })

    // Save site must persist the live counters
    expect(saved.hintsUsed).toBe(3)
    expect(saved.techniqueHintsUsed).toBe(2)

    // localStorage round-trips via JSON; the loaded object must carry the counters
    const loaded = JSON.parse(JSON.stringify(saved)) as SavedGameState

    // The load-apply path restores counters from the loaded state; the submit
    // Score builder then reads exactly these restored values
    const restored = restoreHintCounters(loaded)
    expect(restored.hintsUsed).toBe(3)
    expect(restored.techniqueHintsUsed).toBe(2)
  })

  it('restores hint counters as 0 for legacy saves that predate the fields', () => {
    const legacySave = {
      board: Array(81).fill(0),
      candidates: Array(81).fill([]),
      elapsedMs: 1000,
      history: [],
      autoFillUsed: false,
      savedAt: 1,
      difficulty: 'easy',
    } as SavedGameState

    const restored = restoreHintCounters(legacySave)

    expect(restored.hintsUsed).toBe(0)
    expect(restored.techniqueHintsUsed).toBe(0)
  })
})
