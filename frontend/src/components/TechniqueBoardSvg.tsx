import type { DiagramCell } from '../lib/techniques'
import {
  buildCellMap,
  candidateSubgridPlacement,
  cellKey,
  getCellFill,
  isCellHighlighted,
} from '../lib/techniqueDiagramGeometry'

interface TechniqueBoardSvgProps {
  cells: DiagramCell[]
  /**
   * Whether cells with an `elimination` highlight should render their candidates
   * with the on-highlight contrast color. The animated diagram enables this so
   * elimination cells read as part of the highlight set; the static diagram does
   * not, matching each view's existing visual behavior.
   */
  highlightElimination?: boolean
  /** Extra class on the root <svg> (e.g. transition classes). */
  className?: string
}

const CELL_SIZE = 20
const BOARD_SIZE = CELL_SIZE * 9

// Shared mini-Sudoku SVG board used by both the static TechniqueDiagram and the
// animated AnimatedDiagramView so the two render cells/grid/content identically.
export default function TechniqueBoardSvg({
  cells,
  highlightElimination = false,
  className,
}: TechniqueBoardSvgProps) {
  const cellMap = buildCellMap(cells)

  const renderCellContent = (row: number, col: number) => {
    const cell = cellMap.get(cellKey(row, col))
    if (!cell) return null

    const x = col * CELL_SIZE
    const y = row * CELL_SIZE

    if (cell.value) {
      return (
        <text
          key={`val-${row}-${col}`}
          x={x + CELL_SIZE / 2}
          y={y + CELL_SIZE / 2 + 4}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill="var(--text-given)"
        >
          {cell.value}
        </text>
      )
    }

    if (cell.candidates && cell.candidates.length > 0) {
      const candidateSize = CELL_SIZE / 3
      const highlighted = isCellHighlighted(cell, highlightElimination)

      return cell.candidates.map((d: number) => {
        const { cRow, cCol } = candidateSubgridPlacement(d)
        const cx = x + cCol * candidateSize + candidateSize / 2
        const cy = y + cRow * candidateSize + candidateSize / 2 + 1.5
        const isEliminated = cell.eliminatedCandidates?.includes(d)

        const candidateFill = isEliminated
          ? 'var(--error-text)'
          : highlighted
            ? 'var(--text-on-highlight)'
            : 'var(--text-candidate)'

        return (
          <g key={`cand-${row}-${col}-${d}`}>
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              fontSize="5"
              fontWeight={isEliminated ? '700' : '400'}
              fill={candidateFill}
              style={isEliminated ? { textDecoration: 'line-through' } : {}}
            >
              {d}
            </text>
          </g>
        )
      })
    }

    return null
  }

  return (
    <svg
      viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
      className={`w-full max-w-[280px] mx-auto rounded-lg overflow-hidden ${className ?? ''}`}
      style={{ background: 'var(--board-bg)' }}
    >
      {/* Cells */}
      {Array.from({ length: 81 }, (_, idx) => {
        const row = Math.floor(idx / 9)
        const col = idx % 9
        return (
          <rect
            key={`cell-${row}-${col}`}
            x={col * CELL_SIZE}
            y={row * CELL_SIZE}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={getCellFill(cellMap, row, col)}
          />
        )
      })}

      {/* Grid lines */}
      {Array.from({ length: 10 }, (_, i) => (
        <g key={`lines-${i}`}>
          <line
            x1={i * CELL_SIZE}
            y1={0}
            x2={i * CELL_SIZE}
            y2={BOARD_SIZE}
            stroke="var(--border-light)"
            strokeWidth={i % 3 === 0 ? 2 : 0.5}
          />
          <line
            x1={0}
            y1={i * CELL_SIZE}
            x2={BOARD_SIZE}
            y2={i * CELL_SIZE}
            stroke="var(--border-light)"
            strokeWidth={i % 3 === 0 ? 2 : 0.5}
          />
        </g>
      ))}

      {/* Cell content */}
      {Array.from({ length: 81 }, (_, idx) => {
        const row = Math.floor(idx / 9)
        const col = idx % 9
        return renderCellContent(row, col)
      })}

      {/* Border */}
      <rect
        x={0}
        y={0}
        width={BOARD_SIZE}
        height={BOARD_SIZE}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={2}
      />
    </svg>
  )
}
