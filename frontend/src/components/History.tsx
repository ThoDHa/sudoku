import { useEffect, useRef } from 'react'
import { getTechniqueColor, HISTORY_SCROLL_DELAY } from '../lib/constants'
import { CloseIcon } from './ui'
import { Dialog } from './Dialog'

// Module-level variable for session-only scroll persistence
let savedScrollPosition = 0

interface Move {
  step_index: number
  technique: string
  action: string
  digit: number
  targets: { row: number; col: number }[]
  eliminations?: { row: number; col: number; digit: number }[]
  explanation: string
  refs: { title: string; slug: string; url: string }
  highlights: {
    primary: { row: number; col: number }[]
    secondary?: { row: number; col: number }[]
  }
  isUserMove?: boolean
}

const formatCell = (row: number, col: number): string => `R${row + 1}C${col + 1}`
const formatCells = (cells: { row: number; col: number }[]): string =>
  cells.map((t) => formatCell(t.row, t.col)).join(', ')

// Render the human-readable description of a single move's action.
function MoveActionText({ move }: { move: Move }) {
  const targetCells = formatCells(move.targets)
  if (move.action === 'place' || move.action === 'assign') {
    return (
      <>
        {move.isUserMove ? 'Placed' : 'Place'}{' '}
        <span className="font-bold text-accent">{move.digit}</span> at {targetCells}
      </>
    )
  }
  if (move.action === 'note' || move.action === 'candidate') {
    return (
      <>
        {move.isUserMove ? 'Added' : 'Add'} candidate{' '}
        <span className="font-bold text-accent">{move.digit}</span> {move.isUserMove ? 'to' : 'at'}{' '}
        {targetCells}
      </>
    )
  }
  if (move.action === 'erase') {
    return <>Cleared {targetCells}</>
  }
  if (move.action === 'clear-candidates') {
    return <>Cleared all candidates from {targetCells}</>
  }
  return (
    <>
      Eliminate{' '}
      {move.eliminations?.map((e) => `${e.digit} from ${formatCell(e.row, e.col)}`).join(', ')}
    </>
  )
}

interface HistoryProps {
  moves: Move[]
  isOpen: boolean
  onClose: () => void
  onMoveClick: (move: Move, index: number) => void
  onTechniqueClick: (technique: { title: string; slug: string }) => void
  selectedMoveIndex: number | null
  autoSolveStepsUsed?: number
  autoSolveErrorsFixed?: number
  isComplete?: boolean
  autoFillUsed?: boolean
}

export default function History({
  moves,
  isOpen,
  onClose,
  onMoveClick,
  onTechniqueClick,
  selectedMoveIndex,
  autoSolveStepsUsed,
  autoSolveErrorsFixed,
  isComplete,
  autoFillUsed,
}: HistoryProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Scroll to selected move when modal opens
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    if (isOpen && selectedMoveIndex !== null && itemRefs.current[selectedMoveIndex]) {
      // Small delay to ensure modal is rendered
      timeout = setTimeout(() => {
        itemRefs.current[selectedMoveIndex]?.scrollIntoView({
          behavior: 'instant',
          block: 'center',
        })
      }, HISTORY_SCROLL_DELAY)
    }
    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [isOpen, selectedMoveIndex])

  // Restore scroll position when modal opens
  useEffect(() => {
    if (isOpen && scrollContainerRef.current && savedScrollPosition > 0) {
      scrollContainerRef.current.scrollTop = savedScrollPosition
    }
  }, [isOpen])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    savedScrollPosition = e.currentTarget.scrollTop
  }

  if (!isOpen) return null

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      titleId="history-modal-title"
      panelClassName="relative max-h-[80vh] w-full max-w-md overflow-hidden rounded-lg bg-background shadow-xl"
      backdropClassName="bg-black/50"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-board-border-light bg-background-secondary p-4">
        <h2 id="history-modal-title" className="text-lg font-semibold text-foreground">
          Move History
        </h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-foreground-muted hover:bg-btn-hover"
          aria-label="Close history"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="max-h-[calc(80vh-4rem)] overflow-y-auto p-4"
      >
        {moves.length === 0 ? (
          <p className="text-center text-sm text-foreground-muted">
            No moves yet. Use Hint or Next Step to see technique explanations.
          </p>
        ) : (
          <ul className="space-y-3" ref={listRef}>
            {/* Auto-fill and Auto-solve summaries (shown first since newest is first) */}
            {autoFillUsed && (
              <li className="rounded-lg border border-board-border-light bg-background-secondary p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📝</span>
                  <span className="text-sm text-foreground">
                    {(() => {
                      // Find the auto-fill move to get the cell count
                      const autoFillMove = moves.find(
                        (move) => move.technique === 'Fill Candidates',
                      )
                      if (autoFillMove) {
                        // Extract cell count from explanation: "Filled all candidates for X cells"
                        const match = autoFillMove.explanation?.match(/(\d+) cells/)
                        const cellCount = match && match[1] ? parseInt(match[1], 10) : 0
                        return `Auto-filled candidates for ${cellCount} cell${cellCount !== 1 ? 's' : ''}`
                      }
                      return 'Auto-filled candidates'
                    })()}
                  </span>
                </div>
              </li>
            )}
            {autoSolveStepsUsed && autoSolveStepsUsed > 0 && (
              <li className="rounded-lg border border-board-border-light bg-background-secondary p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{isComplete ? '🏁' : '🤖'}</span>
                  <span className="text-sm text-foreground">
                    {isComplete ? 'Puzzle solved! ' : ''}
                    The autosolver performed {autoSolveStepsUsed} move
                    {autoSolveStepsUsed !== 1 ? 's' : ''}
                    {autoSolveErrorsFixed && autoSolveErrorsFixed > 0
                      ? `, fixed ${autoSolveErrorsFixed} error${autoSolveErrorsFixed !== 1 ? 's' : ''}`
                      : ''}
                  </span>
                </div>
              </li>
            )}
            {[...moves].reverse().map((move, reverseIdx) => {
              const originalIdx = moves.length - 1 - reverseIdx
              const displayNumber = originalIdx + 1
              return (
                <li
                  key={originalIdx}
                  ref={(el) => {
                    itemRefs.current[originalIdx] = el
                  }}
                  className={`rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md ${
                    move.isUserMove ? 'opacity-75' : ''
                  } ${
                    selectedMoveIndex === originalIdx
                      ? 'border-accent bg-accent/10'
                      : 'border-board-border-light bg-background-secondary'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <span className="text-xs text-foreground-muted">#{displayNumber}</span>
                    {move.isUserMove ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        You
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${getTechniqueColor(move.technique)}`}
                      >
                        {move.technique}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onMoveClick(move, originalIdx)
                      onClose()
                    }}
                    className="mb-2 block w-full text-left text-sm text-foreground hover:text-accent"
                  >
                    <MoveActionText move={move} />
                  </button>

                  {!move.isUserMove && (
                    <p className="text-xs text-foreground-muted">{move.explanation}</p>
                  )}

                  {!move.isUserMove && move.refs && move.refs.slug && (
                    <button
                      onClick={() => {
                        onTechniqueClick({ title: move.refs.title, slug: move.refs.slug })
                      }}
                      className="mt-2 inline-block text-xs text-accent hover:underline"
                    >
                      Learn more: {move.refs.title}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
