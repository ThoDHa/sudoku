import type { TechniqueDiagram, DiagramCell } from '../lib/techniques'

interface TechniqueDiagramViewProps {
  diagram: TechniqueDiagram
}

// Mini Sudoku diagram component for visualizing techniques
export default function TechniqueDiagramView({ diagram }: TechniqueDiagramViewProps) {
  const cellSize = 20
  const boardSize = cellSize * 9
  
  // Create a map for quick cell lookup
  const cellMap = new Map<string, DiagramCell>()
  diagram.cells.forEach((cell: DiagramCell) => {
    cellMap.set(`${cell.row}-${cell.col}`, cell)
  })
  
  const getCellFill = (row: number, col: number) => {
    const cell = cellMap.get(`${row}-${col}`)
    if (cell?.highlight === 'primary') return 'var(--cell-primary)'
    if (cell?.highlight === 'secondary') return 'var(--cell-secondary)'
    if (cell?.highlight === 'elimination') return 'var(--accent-light)'
    return 'var(--cell-bg)'
  }
  
  const renderCellContent = (row: number, col: number) => {
    const cell = cellMap.get(`${row}-${col}`)
    if (!cell) return null
    
    const x = col * cellSize
    const y = row * cellSize
    
    if (cell.value) {
      // Filled cell
      return (
        <text
          key={`val-${row}-${col}`}
          x={x + cellSize / 2}
          y={y + cellSize / 2 + 4}
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
      // Candidates - show in 3x3 mini grid
      const candidateSize = cellSize / 3
      return cell.candidates.map((d: number) => {
        const cRow = Math.floor((d - 1) / 3)
        const cCol = (d - 1) % 3
        const cx = x + cCol * candidateSize + candidateSize / 2
        const cy = y + cRow * candidateSize + candidateSize / 2 + 1.5
        const isEliminated = cell.eliminatedCandidates?.includes(d)
        
        return (
          <g key={`cand-${row}-${col}-${d}`}>
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              fontSize="5"
              fontWeight={isEliminated ? "700" : "400"}
              fill={isEliminated ? 'var(--elimination-text-light)' : 'var(--text-candidate)'}
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
      viewBox={`0 0 ${boardSize} ${boardSize}`} 
      className="w-full max-w-[200px] mx-auto rounded-lg overflow-hidden"
      style={{ background: 'var(--board-bg)' }}
    >
      {/* Cells */}
      {Array.from({ length: 81 }, (_, idx) => {
        const row = Math.floor(idx / 9)
        const col = idx % 9
        return (
          <rect
            key={`cell-${row}-${col}`}
            x={col * cellSize}
            y={row * cellSize}
            width={cellSize}
            height={cellSize}
            fill={getCellFill(row, col)}
          />
        )
      })}
      
      {/* Grid lines */}
      {Array.from({ length: 10 }, (_, i) => (
        <g key={`lines-${i}`}>
          <line
            x1={i * cellSize}
            y1={0}
            x2={i * cellSize}
            y2={boardSize}
            stroke="var(--border-light)"
            strokeWidth={i % 3 === 0 ? 2 : 0.5}
          />
          <line
            x1={0}
            y1={i * cellSize}
            x2={boardSize}
            y2={i * cellSize}
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
        width={boardSize}
        height={boardSize}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={2}
      />
    </svg>
  )
}

// Legend component for diagram colors
export function TechniqueDiagramLegend() {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-foreground-muted">
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-cell-primary"></span>
        Primary
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-cell-secondary"></span>
        Secondary
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded bg-accent-light"></span>
        Elimination
      </span>
    </div>
  )
}
