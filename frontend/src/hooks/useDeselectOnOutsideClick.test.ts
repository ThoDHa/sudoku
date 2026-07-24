import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRef } from 'react'
import type { RefObject } from 'react'
import { useDeselectOnOutsideClick } from './useDeselectOnOutsideClick'

interface SetupInput {
  selectedCell: number | null
  selectedCells: Set<number>
  deselectCell?: () => void
  clearMoveHighlight?: () => void
  setEraseMode?: (value: boolean) => void
}

interface SetupOptions {
  selectedCell: number | null
  selectedCells: Set<number>
  deselectCell: () => void
  clearMoveHighlight: () => void
  setEraseMode: (value: boolean) => void
}

function setupHook(input: SetupInput) {
  const deselectCell = input.deselectCell ?? vi.fn()
  const clearMoveHighlight = input.clearMoveHighlight ?? vi.fn()
  const setEraseMode = input.setEraseMode ?? vi.fn()
  const options: SetupOptions = {
    selectedCell: input.selectedCell,
    selectedCells: input.selectedCells,
    deselectCell,
    clearMoveHighlight,
    setEraseMode,
  }

  const renderResult = renderHook(
    ({
      selectedCell,
      selectedCells,
      deselectCell,
      clearMoveHighlight,
      setEraseMode,
    }: SetupOptions) => {
      const selectedCellRef = useRef<number | null>(selectedCell)
      const selectedCellsRef = useRef<Set<number>>(selectedCells)
      useDeselectOnOutsideClick({
        selectedCellRef: selectedCellRef as RefObject<number | null>,
        selectedCellsRef: selectedCellsRef as RefObject<Set<number>>,
        deselectCell,
        clearMoveHighlight,
        setEraseMode,
      })
    },
    {
      initialProps: options,
    },
  )
  return { ...renderResult, deselectCell, clearMoveHighlight, setEraseMode }
}

function dispatchClick(target: EventTarget, type: 'click' | 'touchstart' = 'click'): void {
  const EventClass = type === 'click' ? MouseEvent : Event
  const event = new EventClass(type, { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
}

function makeElement(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html.trim()
  const el = container.firstElementChild as HTMLElement
  document.body.appendChild(el)
  return el
}

describe('useDeselectOnOutsideClick', () => {
  let addedSpy: ReturnType<typeof vi.spyOn>
  let removedSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addedSpy = vi.spyOn(document, 'addEventListener')
    removedSpy = vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  describe('listener registration', () => {
    it('registers click and touchstart listeners in the capture phase', () => {
      setupHook({ selectedCell: 0, selectedCells: new Set() })
      expect(addedSpy).toHaveBeenCalledWith('click', expect.any(Function), { capture: true })
      expect(addedSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), {
        capture: true,
      })
    })

    it('removes both listeners on unmount using capture phase', () => {
      const { unmount } = setupHook({ selectedCell: 0, selectedCells: new Set() })
      unmount()
      expect(removedSpy).toHaveBeenCalledWith('click', expect.any(Function), true)
      expect(removedSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), true)
    })

    it('re-registers when any callback identity changes', () => {
      const { rerender } = setupHook({ selectedCell: 0, selectedCells: new Set() })
      addedSpy.mockClear()
      removedSpy.mockClear()
      const nextDeselect = vi.fn()
      rerender({
        selectedCell: 0,
        selectedCells: new Set(),
        deselectCell: nextDeselect,
        clearMoveHighlight: vi.fn(),
        setEraseMode: vi.fn(),
      })
      expect(removedSpy).toHaveBeenCalledWith('click', expect.any(Function), true)
      expect(addedSpy).toHaveBeenCalledWith('click', expect.any(Function), { capture: true })
    })
  })

  describe('no active selection', () => {
    it('does not deselect when no cell and no multi-select are active', () => {
      const deselectCell = vi.fn()
      setupHook({
        selectedCell: null,
        selectedCells: new Set(),
        deselectCell,
      })
      dispatchClick(document.body)
      expect(deselectCell).not.toHaveBeenCalled()
    })
  })

  describe('genuine empty-space clicks deselect', () => {
    it('deselects, clears erase mode, and clears move highlight on a body click', () => {
      const deselectCell = vi.fn()
      const clearMoveHighlight = vi.fn()
      const setEraseMode = vi.fn()
      setupHook({
        selectedCell: 5,
        selectedCells: new Set(),
        deselectCell,
        clearMoveHighlight,
        setEraseMode,
      })
      dispatchClick(document.body)
      expect(deselectCell).toHaveBeenCalledTimes(1)
      expect(setEraseMode).toHaveBeenCalledWith(false)
      expect(clearMoveHighlight).toHaveBeenCalledTimes(1)
    })

    it('also fires on touchstart for mobile compatibility', () => {
      const deselectCell = vi.fn()
      setupHook({ selectedCell: 5, selectedCells: new Set(), deselectCell })
      dispatchClick(document.body, 'touchstart')
      expect(deselectCell).toHaveBeenCalledTimes(1)
    })

    it('treats a multi-select-only state (no primary cell) as active', () => {
      const deselectCell = vi.fn()
      setupHook({
        selectedCell: null,
        selectedCells: new Set([1, 2]),
        deselectCell,
      })
      dispatchClick(document.body)
      expect(deselectCell).toHaveBeenCalledTimes(1)
    })
  })

  describe('protected targets do not deselect', () => {
    const protectedCases: Array<{ label: string; html: string }> = [
      { label: 'a sudoku cell', html: '<div class="sudoku-cell"></div>' },
      { label: 'the board', html: '<div class="sudoku-board"></div>' },
      { label: 'a digit button', html: '<div class="control-digit-btn"></div>' },
      { label: 'an action button', html: '<div class="control-action-btn-compact"></div>' },
      { label: 'a menu opener', html: '<div data-menu-button></div>' },
      { label: 'a history opener', html: '<div data-history-button></div>' },
      { label: 'a share opener', html: '<div data-share-button></div>' },
      { label: 'a role=dialog modal', html: '<div role="dialog"></div>' },
      { label: 'a .modal element', html: '<div class="modal"></div>' },
      { label: 'a data-modal panel', html: '<div data-modal></div>' },
      { label: 'a data-overlay-backdrop', html: '<div data-overlay-backdrop></div>' },
    ]

    protectedCases.forEach(({ label, html }) => {
      it(`does NOT deselect when clicking ${label}`, () => {
        const deselectCell = vi.fn()
        setupHook({ selectedCell: 3, selectedCells: new Set(), deselectCell })
        const el = makeElement(html)
        dispatchClick(el)
        expect(deselectCell).not.toHaveBeenCalled()
      })
    })

    it('does NOT deselect when clicking a child nested inside a protected container', () => {
      const deselectCell = vi.fn()
      setupHook({ selectedCell: 3, selectedCells: new Set(), deselectCell })
      const container = makeElement('<div class="modal"><button class="inner">x</button></div>')
      const child = container.querySelector('.inner') as HTMLElement
      dispatchClick(child)
      expect(deselectCell).not.toHaveBeenCalled()
    })
  })
})
