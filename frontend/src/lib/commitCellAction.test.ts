import { describe, it, expect, vi } from 'vitest'
import { commitCellAction } from './commitCellAction'
import type { CommitCellActionOptions } from './commitCellAction'

function makeGame() {
  return {
    eraseCell: vi.fn(),
    clearAll: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  }
}

function makeCallbacks() {
  return {
    clearAfterErase: vi.fn(),
    clearAfterUserCandidateOp: vi.fn(),
    clearAfterDigitPlacement: vi.fn(),
    clearAllAndDeselect: vi.fn(),
    clearMoveHighlight: vi.fn(),
    deselectCell: vi.fn(),
    setEraseMode: vi.fn(),
    setNotesMode: vi.fn(),
    setAutoSolveStepsUsed: vi.fn(),
    setAutoSolveErrorsFixed: vi.fn(),
  }
}

describe('commitCellAction erase', () => {
  it('erases the cell at the given index and resets erase UI state', () => {
    const game = makeGame()
    const cb = makeCallbacks()
    commitCellAction('erase', { idx: 7, game: game as never, ...cb })

    expect(game.eraseCell).toHaveBeenCalledWith(7)
    expect(cb.clearAfterErase).toHaveBeenCalledOnce()
    expect(cb.deselectCell).toHaveBeenCalledOnce()
    expect(cb.setEraseMode).toHaveBeenCalledWith(false)
  })

  it('skips eraseCell but still clears selection when no index is supplied', () => {
    const game = makeGame()
    const cb = makeCallbacks()
    commitCellAction('erase', { game: game as never, ...cb })

    expect(game.eraseCell).not.toHaveBeenCalled()
    expect(cb.deselectCell).toHaveBeenCalledOnce()
    expect(cb.setEraseMode).toHaveBeenCalledWith(false)
  })
})

describe('commitCellAction clearAll', () => {
  it('clears the board, deselects, and leaves notes mode', () => {
    const game = makeGame()
    const cb = makeCallbacks()
    commitCellAction('clearAll', { game: game as never, ...cb })

    expect(game.clearAll).toHaveBeenCalledOnce()
    expect(cb.clearAllAndDeselect).toHaveBeenCalledOnce()
    expect(cb.setNotesMode).toHaveBeenCalledWith(false)
  })
})

describe('commitCellAction undo', () => {
  it('undoes and clears selection plus move highlight', () => {
    const game = makeGame()
    const cb = makeCallbacks()
    commitCellAction('undo', { game: game as never, ...cb })

    expect(game.undo).toHaveBeenCalledOnce()
    expect(cb.deselectCell).toHaveBeenCalledOnce()
    expect(cb.clearMoveHighlight).toHaveBeenCalledOnce()
  })
})

describe('commitCellAction redo', () => {
  it('redoes and triggers the clear-and-deselect side effect', () => {
    const game = makeGame()
    const cb = makeCallbacks()
    commitCellAction('redo', { game: game as never, ...cb })

    expect(game.redo).toHaveBeenCalledOnce()
    expect(cb.clearAllAndDeselect).toHaveBeenCalledOnce()
  })
})

describe('commitCellAction unknown action', () => {
  it('throws an error naming the unknown action type', () => {
    const game = makeGame()
    expect(() => commitCellAction('bogus' as never, { game: game as never })).toThrowError(
      /Unknown actionType: bogus/,
    )
  })
})
