import React, { useEffect, useMemo, useRef, useState } from 'react'
import { TOTAL_CELLS } from '../lib/constants'
import { calculatePathCells } from '../lib/pathUtils'

// DOM attribute tagging each cell element. Pointer-move resolution maps a
// hit-tested element back to its cell index via elementFromPoint + closest().
const DATA_CELL_IDX = 'data-cell-idx'
const CELL_SELECTOR = `[${DATA_CELL_IDX}]`

// Trim a drag trail back to a revisited cell, dropping everything after it.
const backtrackTrail = (trail: number[], trailSet: Set<number>, idx: number): void => {
  const backtrackIdx = trail.indexOf(idx)
  const removed = trail.splice(backtrackIdx + 1)
  for (const r of removed) trailSet.delete(r)
}

// Extend a drag trail forward from its tip to `idx`, bridging any cells the
// pointer skipped between events. Skips givens/filled/already-tracked cells.
const extendTrailForward = (
  trail: number[],
  trailSet: Set<number>,
  idx: number,
  initialBoard: number[],
  board: number[],
): void => {
  // The tip always exists: a drag seeds the trail with its start cell and
  // backtrackTrail never trims below that first element, so the trail is
  // non-empty for as long as a drag is in progress. The assertion is needed
  // only because noUncheckedIndexedAccess widens every index read.
  const prevCell = trail[trail.length - 1] as number
  for (const cellIdx of calculatePathCells(prevCell, idx)) {
    if (initialBoard[cellIdx] === 0 && board[cellIdx] === 0 && !trailSet.has(cellIdx)) {
      trail.push(cellIdx)
      trailSet.add(cellIdx)
    }
  }
}

export interface UseBoardInteractionParams {
  selectedCell: number | null
  initialBoard: number[]
  board: number[]
  onCellClick: (idx: number) => void
  onCellChange?: (idx: number, value: number) => void
  onCellSelectMultiple?: (cells: number[]) => void
  onDragEnd?: (cells: number[]) => void
}

export interface UseBoardInteractionReturn {
  /** Currently focused cell index, or null when focus leaves the grid. Drives the focus indicator. */
  focusedCell: number | null
  /** Cell index that owns tabIndex=0 (roving tabindex). All other cells get -1. */
  tabStopCell: number
  /** Stable per-cell ref callbacks (index 0-80) for wiring cell DOM elements. */
  cellRefCallbacks: ((el: HTMLDivElement | null) => void)[]
  /** Click handler with post-drag synthetic-click suppression. */
  handleCellClick: (idx: number) => void
  /** Keyboard handler: arrow navigation (skipping givens), digit entry, clear, activate. */
  handleCellKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => void
  /** Pointer-down handler initiating a multi-select drag (no-op on given/filled cells). */
  handleDragStart: (idx: number) => void
  /** Board-level pointer-move: resolves the hovered cell and extends/backtracks the drag trail. */
  handleBoardPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  /** Board-level pointer-up: finalizes the drag and notifies onDragEnd. */
  handleBoardPointerUp: () => void
  /** Tracks focus entering a cell (updates focusedCell for the indicator). */
  handleGridFocus: (e: React.FocusEvent<HTMLDivElement>) => void
  /** Clears focusedCell when focus leaves the grid entirely. */
  handleGridBlur: (e: React.FocusEvent<HTMLDivElement>) => void
}

export function useBoardInteraction({
  selectedCell,
  initialBoard,
  board,
  onCellClick,
  onCellChange,
  onCellSelectMultiple,
  onDragEnd: onDragEndProp,
}: UseBoardInteractionParams): UseBoardInteractionReturn {
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])

  const [focusedCell, setFocusedCell] = useState<number | null>(null)

  const tabStopCell = useMemo(() => {
    if (selectedCell !== null) return selectedCell
    for (let i = 0; i < TOTAL_CELLS; i++) {
      if (initialBoard[i] === 0) return i
    }
    return 0
  }, [selectedCell, initialBoard])

  // Drag state for multi-select feature.
  // Refs updated synchronously so drag callbacks always read the latest value
  // (setState is asynchronous, so handleDragEnter would see a stale value).
  //
  // Ordered trail of cells the pointer has swept through. The trail doubles as
  // the drag flag: handleDragStart seeds it with the start cell and
  // handleDragEnd empties it, so a non-empty trail means a drag is in progress.
  // When the pointer revisits a cell already in the trail, we trim back to that
  // point (backtracking removes cells). Uses an array for order + a set for
  // O(1) lookup.
  const dragTrailRef = useRef<number[]>([])
  const dragTrailSetRef = useRef<Set<number>>(new Set())
  // Tracks whether a multi-select drag occurred, so the subsequent click event
  // (synthesized by the browser after pointerup) can be suppressed to avoid
  // overwriting the multi-select state with a single-cell selection.
  const suppressNextClickRef = useRef(false)
  // Tracks the last cell the pointer entered to avoid redundant handleDragEnter calls.
  const lastEnteredCellRef = useRef<number | null>(null)

  // Ref for initialBoard to allow stable callbacks that always read the latest value.
  // Synchronous render-time write is required: keyboard/interaction callbacks read this
  // ref before useEffect would run, and a stale read causes cell-selection regressions.
  const initialBoardRef = useRef(initialBoard)
  // eslint-disable-next-line react-hooks/refs -- synchronous write required for stale-read safety; see comment above
  initialBoardRef.current = initialBoard

  // Focus the selected cell when it changes, blur when deselected
  // Guard against rapid state changes that cause race conditions with DOM updates
  useEffect(() => {
    const isComponentMounted = { current: true }

    if (selectedCell === null) {
      // When cell is deselected, blur any focused cell
      const activeElement = document.activeElement
      if (activeElement && 'blur' in activeElement) {
        const animationFrameId = requestAnimationFrame(() => {
          if (isComponentMounted.current) {
            ;(activeElement as HTMLElement).blur()
          }
        })

        return () => {
          cancelAnimationFrame(animationFrameId)
          isComponentMounted.current = false
        }
      }
      // Nothing focusable to blur, so no frame was scheduled.
      return undefined
    }

    if (cellRefs.current[selectedCell]) {
      // Use requestAnimationFrame to ensure DOM has updated before focusing
      const animationFrameId = requestAnimationFrame(() => {
        if (isComponentMounted.current) {
          // Re-read the ref: the cell can be detached between this effect and
          // the frame, in which case there is nothing left to focus.
          cellRefs.current[selectedCell]?.focus()
        }
      })

      return () => {
        cancelAnimationFrame(animationFrameId)
        isComponentMounted.current = false
      }
    }

    // The selected cell has no element yet, so no frame was scheduled.
    return undefined
  }, [selectedCell])

  // Find next non-given cell in a direction, returns null if none found
  // Reads from initialBoardRef to get latest value without stale closures
  const findNextNonGivenCell = (
    startIdx: number,
    direction: 'up' | 'down' | 'left' | 'right',
  ): number | null => {
    const currentInitialBoard = initialBoardRef.current
    let row = Math.floor(startIdx / 9)
    let col = startIdx % 9

    const move = () => {
      switch (direction) {
        case 'up':
          row--
          break
        case 'down':
          row++
          break
        case 'left':
          col--
          break
        case 'right':
          col++
          break
      }
    }

    const isValid = () => row >= 0 && row < 9 && col >= 0 && col < 9

    move()
    while (isValid()) {
      const idx = row * 9 + col
      if (currentInitialBoard[idx] === 0) {
        return idx
      }
      move()
    }
    return null
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
    const currentInitialBoard = initialBoardRef.current
    const isGiven = currentInitialBoard[idx] !== 0

    // Arrow navigation: find the next non-given cell in the direction,
    // select it, and move focus synchronously (the selectedCell RAF effect
    // is too slow for rapid/directed arrows and lets the origin re-fire).
    const moveSelection = (direction: 'up' | 'down' | 'left' | 'right') => {
      e.preventDefault()
      const nextCell = findNextNonGivenCell(idx, direction)
      if (nextCell !== null) {
        onCellClick(nextCell)
        cellRefs.current[nextCell]?.focus()
      }
    }

    // Arrow key navigation - skip over givens
    switch (e.key) {
      case 'ArrowUp':
        moveSelection('up')
        break
      case 'ArrowDown':
        moveSelection('down')
        break
      case 'ArrowLeft':
        moveSelection('left')
        break
      case 'ArrowRight':
        moveSelection('right')
        break
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        e.preventDefault()
        if (!isGiven && onCellChange) {
          onCellChange(idx, parseInt(e.key, 10))
        }
        break
      case 'Backspace':
      case 'Delete': {
        e.preventDefault()
        if (!isGiven && onCellChange) {
          onCellChange(idx, 0)
        }
        break
      }
      case 'Enter':
      case ' ':
        e.preventDefault()
        onCellClick(idx)
        break
    }
  }

  // Stable callback for cell clicks - doesn't change between renders
  const handleCellClick = (idx: number) => {
    // After a multi-cell drag, the browser synthesizes a click event.
    // Suppress it so the multi-select state is not overwritten.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    onCellClick(idx)
  }

  // Stable callback for keyboard events
  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, idx: number) => {
    handleKeyDown(e, idx)
  }

  // Drag handlers for multi-select feature
  const handleDragStart = (idx: number) => {
    // Skip starting drag on given or filled cells
    if (initialBoard[idx] !== 0 || board[idx] !== 0) {
      return
    }
    // Initialize ordered trail with the start cell, which also marks the drag
    // as in progress
    dragTrailRef.current = [idx]
    dragTrailSetRef.current = new Set([idx])
    // Record the start cell so handleBoardPointerMove skips redundant
    // handleDragEnter calls when the pointer stays on the same cell
    // (prevents selectMultipleCells from firing on a simple tap)
    lastEnteredCellRef.current = idx
  }

  const handleDragEnter = (idx: number) => {
    // Reaching here means the pointer resolved to a cell other than the one it
    // was last over, so a real multi-cell drag is underway: suppress the click
    // the browser synthesizes after pointerup, which would otherwise overwrite
    // the multi-select state with a single-cell selection.
    suppressNextClickRef.current = true

    const trail = dragTrailRef.current
    const trailSet = dragTrailSetRef.current

    if (trailSet.has(idx)) {
      backtrackTrail(trail, trailSet, idx)
    } else {
      extendTrailForward(trail, trailSet, idx, initialBoard, board)
    }

    // Update selection from the current trail
    if (onCellSelectMultiple) {
      onCellSelectMultiple([...trail])
    }
  }

  const handleDragEnd = () => {
    // Notify parent with the final set of selected cells before clearing trail
    if (onDragEndProp && dragTrailRef.current.length > 1) {
      onDragEndProp([...dragTrailRef.current])
    }
    lastEnteredCellRef.current = null
    dragTrailRef.current = []
    dragTrailSetRef.current = new Set()
    // Safety net: clear the suppress flag after the current event cycle so that
    // a stale flag cannot block future clicks (e.g., if pointercancel fires instead
    // of a click). The click event fires synchronously after pointerup in the same
    // task, so it sees the flag before this timeout clears it.
    if (suppressNextClickRef.current) {
      setTimeout(() => {
        suppressNextClickRef.current = false
      }, 0)
    }
  }

  // Board-level pointer move handler: resolves which cell the pointer is over
  // using elementFromPoint. Works for both mouse and touch (pointer events unify both).
  const handleBoardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // An empty trail means no drag is in progress.
    if (dragTrailRef.current.length === 0) return

    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el) return

    // Walk up to find the cell element with data-cell-idx
    const cellEl = (el as HTMLElement).closest(CELL_SELECTOR)
    if (!cellEl) return

    const idx = Number(cellEl.getAttribute(DATA_CELL_IDX))
    if (Number.isNaN(idx) || idx === lastEnteredCellRef.current) return

    // handleDragEnter reads lastEnteredCellRef to bridge from the previous
    // cell, so call it BEFORE updating the ref to the new cell.
    handleDragEnter(idx)
    lastEnteredCellRef.current = idx
  }

  // Board-level pointer up handler
  const handleBoardPointerUp = () => {
    handleDragEnd()
  }

  const handleGridFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.hasAttribute(DATA_CELL_IDX)) {
      const idx = Number(target.getAttribute(DATA_CELL_IDX))
      if (!Number.isNaN(idx)) setFocusedCell(idx)
    }
  }

  const handleGridBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as HTMLElement | null
    if (!related || !related.hasAttribute(DATA_CELL_IDX)) {
      setFocusedCell(null)
    }
  }

  // Stable ref callback factory - returns the same function for each cell index.
  // React invokes ref callbacks during commit (not render), but the rule's
  // static analysis cannot distinguish them from render-time mutations.
  const cellRefCallbacks = useMemo(
    () => {
      const callbacks: ((el: HTMLDivElement | null) => void)[] = []
      for (let i = 0; i < TOTAL_CELLS; i++) {
        // eslint-disable-next-line react-hooks/refs -- ref callback: React calls this during commit, not render
        callbacks.push((el: HTMLDivElement | null) => {
          cellRefs.current[i] = el
        })
      }
      return callbacks
    },
    // Stryker disable next-line ArrayDeclaration: React compares dependency arrays element-wise with Object.is, so a one-element array holding the same constant on every render is exactly as unchanging as an empty one. The memo body runs once under either array, so no program behaviour differs and no test can observe the substitution.
    [],
  )

  return useMemo(
    () => ({
      focusedCell,
      tabStopCell,
      cellRefCallbacks,
      handleCellClick,
      handleCellKeyDown,
      handleDragStart,
      handleBoardPointerMove,
      handleBoardPointerUp,
      handleGridFocus,
      handleGridBlur,
    }),
    [
      focusedCell,
      tabStopCell,
      cellRefCallbacks,
      handleCellClick,
      handleCellKeyDown,
      handleDragStart,
      handleBoardPointerMove,
      handleBoardPointerUp,
      handleGridFocus,
      handleGridBlur,
    ],
  )
}
