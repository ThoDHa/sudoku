import { describe, it, expect } from 'vitest'
import {
  createStateDiff,
  applyStateDiff,
  unapplyStateDiff,
  getDiffMemorySize,
  getFullStateMemorySize,
  serializeDiff,
  deserializeDiff,
  type StateDiff
} from './diffUtils'

describe('diffUtils', () => {
  describe('createStateDiff', () => {
    it('detects board changes', () => {
      const oldBoard = Array(81).fill(0)
      const newBoard = Array(81).fill(0)
      newBoard[0] = 5
      newBoard[10] = 3
      
      const oldCandidates = new Uint16Array(81)
      const newCandidates = new Uint16Array(81)
      
      const diff = createStateDiff(oldBoard, newBoard, oldCandidates, newCandidates)
      
      expect(diff.boardChanges).toHaveLength(2)
      expect(diff.boardChanges).toContainEqual({ idx: 0, oldValue: 0, newValue: 5 })
      expect(diff.boardChanges).toContainEqual({ idx: 10, oldValue: 0, newValue: 3 })
      expect(diff.candidateChanges).toHaveLength(0)
    })

    it('detects candidate changes', () => {
      const oldBoard = Array(81).fill(0)
      const newBoard = Array(81).fill(0)
      
      const oldCandidates = new Uint16Array(81)
      const newCandidates = new Uint16Array(81)
      newCandidates[5] = 0b1010 // bits 1 and 3 set
      newCandidates[20] = 0b1100 // bits 2 and 3 set
      
      const diff = createStateDiff(oldBoard, newBoard, oldCandidates, newCandidates)
      
      expect(diff.boardChanges).toHaveLength(0)
      expect(diff.candidateChanges).toHaveLength(2)
      expect(diff.candidateChanges).toContainEqual({ idx: 5, oldMask: 0, newMask: 0b1010 })
      expect(diff.candidateChanges).toContainEqual({ idx: 20, oldMask: 0, newMask: 0b1100 })
    })

    it('detects both board and candidate changes', () => {
      const oldBoard = Array(81).fill(0)
      const newBoard = Array(81).fill(0)
      newBoard[15] = 7
      
      const oldCandidates = new Uint16Array(81)
      oldCandidates[30] = 0b1111 // all first 4 bits set
      const newCandidates = new Uint16Array(81)
      newCandidates[30] = 0b1000 // only bit 3 set
      
      const diff = createStateDiff(oldBoard, newBoard, oldCandidates, newCandidates)
      
      expect(diff.boardChanges).toHaveLength(1)
      expect(diff.candidateChanges).toHaveLength(1)
      expect(diff.boardChanges[0]).toEqual({ idx: 15, oldValue: 0, newValue: 7 })
      expect(diff.candidateChanges[0]).toEqual({ idx: 30, oldMask: 0b1111, newMask: 0b1000 })
    })

    it('creates empty diff when states are identical', () => {
      const board = Array(81).fill(0)
      board[0] = 5
      board[10] = 3
      
      const candidates = new Uint16Array(81)
      candidates[20] = 0b1010
      
      const diff = createStateDiff(board, board, candidates, candidates)
      
      expect(diff.boardChanges).toHaveLength(0)
      expect(diff.candidateChanges).toHaveLength(0)
    })
  })

  describe('applyStateDiff', () => {
    it('applies board changes correctly', () => {
      const baseBoard = Array(81).fill(0)
      baseBoard[5] = 2
      const baseCandidates = new Uint16Array(81)
      
      const diff: StateDiff = {
        boardChanges: [
          { idx: 0, oldValue: 0, newValue: 5 },
          { idx: 5, oldValue: 2, newValue: 7 }
        ],
        candidateChanges: []
      }
      
      const { board, candidates } = applyStateDiff(baseBoard, baseCandidates, diff)
      
      expect(board[0]).toBe(5)
      expect(board[5]).toBe(7)
      expect(candidates).toEqual(baseCandidates)
    })

    it('applies candidate changes correctly', () => {
      const baseBoard = Array(81).fill(0)
      const baseCandidates = new Uint16Array(81)
      baseCandidates[10] = 0b0100
      
      const diff: StateDiff = {
        boardChanges: [],
        candidateChanges: [
          { idx: 5, oldMask: 0, newMask: 0b1010 },
          { idx: 10, oldMask: 0b0100, newMask: 0b1100 }
        ]
      }
      
      const { board, candidates } = applyStateDiff(baseBoard, baseCandidates, diff)
      
      expect(board).toEqual(baseBoard)
      expect(candidates[5]).toBe(0b1010)
      expect(candidates[10]).toBe(0b1100)
    })
  })

  describe('unapplyStateDiff', () => {
    it('reverses board changes correctly', () => {
      const currentBoard = Array(81).fill(0)
      currentBoard[0] = 5
      currentBoard[5] = 7
      const currentCandidates = new Uint16Array(81)
      
      const diff: StateDiff = {
        boardChanges: [
          { idx: 0, oldValue: 0, newValue: 5 },
          { idx: 5, oldValue: 2, newValue: 7 }
        ],
        candidateChanges: []
      }
      
      const { board, candidates } = unapplyStateDiff(currentBoard, currentCandidates, diff)
      
      expect(board[0]).toBe(0)
      expect(board[5]).toBe(2)
      expect(candidates).toEqual(currentCandidates)
    })

    it('reverses candidate changes correctly', () => {
      const currentBoard = Array(81).fill(0)
      const currentCandidates = new Uint16Array(81)
      currentCandidates[5] = 0b1010
      currentCandidates[10] = 0b1100
      
      const diff: StateDiff = {
        boardChanges: [],
        candidateChanges: [
          { idx: 5, oldMask: 0, newMask: 0b1010 },
          { idx: 10, oldMask: 0b0100, newMask: 0b1100 }
        ]
      }
      
      const { board, candidates } = unapplyStateDiff(currentBoard, currentCandidates, diff)
      
      expect(board).toEqual(currentBoard)
      expect(candidates[5]).toBe(0)
      expect(candidates[10]).toBe(0b0100)
    })
  })

  describe('roundtrip consistency', () => {
    it('apply then unapply returns to original state', () => {
      const originalBoard = Array(81).fill(0)
      originalBoard[10] = 3
      originalBoard[25] = 8
      
      const originalCandidates = new Uint16Array(81)
      originalCandidates[15] = 0b1111
      originalCandidates[40] = 0b10101
      
      const newBoard = [...originalBoard]
      newBoard[10] = 9
      newBoard[50] = 2
      
      const newCandidates = new Uint16Array(originalCandidates)
      newCandidates[15] = 0b1000
      newCandidates[60] = 0b11
      
      // Create diff
      const diff = createStateDiff(originalBoard, newBoard, originalCandidates, newCandidates)
      
      // Apply diff
      const { board: appliedBoard, candidates: appliedCandidates } = 
        applyStateDiff(originalBoard, originalCandidates, diff)
      
      // Verify applied state matches new state
      expect(appliedBoard).toEqual(newBoard)
      expect(appliedCandidates).toEqual(newCandidates)
      
      // Unapply diff
      const { board: restoredBoard, candidates: restoredCandidates } = 
        unapplyStateDiff(appliedBoard, appliedCandidates, diff)
      
      // Verify we're back to original state
      expect(restoredBoard).toEqual(originalBoard)
      expect(restoredCandidates).toEqual(originalCandidates)
    })
  })

  describe('memory calculations', () => {
    it('calculates diff memory size correctly', () => {
      const diff: StateDiff = {
        boardChanges: [
          { idx: 0, oldValue: 0, newValue: 5 },
          { idx: 10, oldValue: 2, newValue: 7 }
        ],
        candidateChanges: [
          { idx: 5, oldMask: 0, newMask: 0b1010 }
        ]
      }
      
      // 2 board changes * 12 bytes + 1 candidate change * 12 bytes = 36 bytes
      expect(getDiffMemorySize(diff)).toBe(36)
    })

    it('full state memory size is correct', () => {
      // 81 * 4 (board) + 81 * 2 (candidates) = 486 bytes
      expect(getFullStateMemorySize()).toBe(486)
    })
  })

  describe('serialization', () => {
    it('serializes and deserializes diff correctly', () => {
      const originalDiff: StateDiff = {
        boardChanges: [
          { idx: 0, oldValue: 0, newValue: 5 },
          { idx: 10, oldValue: 2, newValue: 7 }
        ],
        candidateChanges: [
          { idx: 5, oldMask: 0, newMask: 0b1010 },
          { idx: 20, oldMask: 0b1111, newMask: 0b1000 }
        ]
      }
      
      const serialized = serializeDiff(originalDiff)
      const deserialized = deserializeDiff(serialized)
      
      expect(deserialized).toEqual(originalDiff)
    })

    it('handles missing properties in deserialization', () => {
      const data = {}
      const diff = deserializeDiff(data)
      
      expect(diff.boardChanges).toEqual([])
      expect(diff.candidateChanges).toEqual([])
    })
  })
})