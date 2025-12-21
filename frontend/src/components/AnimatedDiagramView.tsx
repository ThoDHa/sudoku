import { useState, useEffect, useCallback } from 'react'
import { useBackgroundManager } from '../hooks/useBackgroundManager'
import type { AnimatedTechniqueDiagram, DiagramCell } from '../lib/techniques'

interface AnimatedDiagramViewProps {
  diagram: AnimatedTechniqueDiagram
}

// Animated Sudoku diagram that cycles through explanation steps
export default function AnimatedDiagramView({ diagram }: AnimatedDiagramViewProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)

  const stepCount = diagram.steps.length
  const currentStepData = diagram.steps[currentStep]

  // Use background manager to pause animation when hidden
  const backgroundManager = useBackgroundManager()

  const cellSize = 20
  const boardSize = cellSize * 9

  // Auto-advance when playing and not hidden - loops automatically (1→2→3→1→2→3→...)
  useEffect(() => {
    if (!isPlaying || backgroundManager.shouldPauseOperations) {
      return
    }

    const timer = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % stepCount)
    }, 2500) // 2.5 seconds per step

    return () => { clearInterval(timer) }
  }, [isPlaying, stepCount, backgroundManager.shouldPauseOperations])
  
  const handlePrevious = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep(prev => (prev - 1 + stepCount) % stepCount)
  }, [stepCount])
  
  const handleNext = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep(prev => (prev + 1) % stepCount)
  }, [stepCount])
  
  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])

  // Early return if no step data (shouldn't happen in practice but satisfies type checker)
  // Must be after all hooks
  if (!currentStepData) {
    return null
  }
  
  // Create a map for quick cell lookup
  const cellMap = new Map<string, DiagramCell>()
  currentStepData.cells.forEach((cell: DiagramCell) => {
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
    
    // Check if this cell is highlighted - affects text color for contrast
    const isHighlighted = cell.highlight === 'primary' || cell.highlight === 'secondary' || cell.highlight === 'elimination'
    
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
          fill={isHighlighted ? 'var(--text-given)' : 'var(--text-given)'}
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
        
        // Use contrasting color on highlighted cells, matching Board behavior
        // On highlighted cells: use text-on-highlight (contrasting with cell-primary/secondary)
        // On normal cells: use text-candidate (theme color)
        // Eliminated candidates use error-text to match Board
        const candidateFill = isEliminated 
          ? 'var(--error-text)' 
          : isHighlighted 
            ? 'var(--text-on-highlight)' 
            : 'var(--text-candidate)'
        
        return (
          <g key={`cand-${row}-${col}-${d}`}>
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              fontSize="5"
              fontWeight={isEliminated ? "700" : "400"}
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
    <div className="flex flex-col items-center">
      {/* SVG Diagram */}
      <svg 
        viewBox={`0 0 ${boardSize} ${boardSize}`} 
        className="w-full max-w-[280px] mx-auto rounded-lg overflow-hidden transition-colors duration-300"
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
              className="transition-colors duration-300"
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
      
      {/* Step description */}
      <div className="mt-3 min-h-[2.5rem] text-center">
        <p className="text-sm font-medium text-foreground">
          {currentStepData.description}
        </p>
      </div>
      
      {/* Controls */}
      <div className="mt-2 flex items-center gap-2">
        {/* Previous button */}
        <button
          onClick={handlePrevious}
          className="rounded-full p-1.5 hover:bg-btn-hover transition-colors"
          aria-label="Previous step"
        >
          <svg className="h-4 w-4 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          className="rounded-full p-1.5 hover:bg-btn-hover transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </button>
        
        {/* Next button */}
        <button
          onClick={handleNext}
          className="rounded-full p-1.5 hover:bg-btn-hover transition-colors"
          aria-label="Next step"
        >
          <svg className="h-4 w-4 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        
        {/* Step indicator */}
        <span className="ml-2 text-xs text-foreground-muted">
          {currentStep + 1} / {stepCount}
        </span>
      </div>
      
      {/* Step dots */}
      <div className="mt-2 flex gap-1">
        {diagram.steps.map((_, idx) => (
          <button
            key={idx}
            onClick={() => {
              setIsPlaying(false)
              setCurrentStep(idx)
            }}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              idx === currentStep 
                ? 'bg-accent' 
                : 'bg-board-border-light hover:bg-foreground-muted'
            }`}
            aria-label={`Go to step ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
