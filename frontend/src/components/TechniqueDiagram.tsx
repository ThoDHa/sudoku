import type { TechniqueDiagram } from '../lib/techniques'
import TechniqueBoardSvg from './TechniqueBoardSvg'

interface TechniqueDiagramViewProps {
  diagram: TechniqueDiagram
}

// Mini Sudoku diagram component for visualizing techniques
export default function TechniqueDiagramView({ diagram }: TechniqueDiagramViewProps) {
  return <TechniqueBoardSvg cells={diagram.cells} />
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
