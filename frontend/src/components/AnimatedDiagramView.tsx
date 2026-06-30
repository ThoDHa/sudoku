import { useState, useEffect, useCallback } from 'react'
import { useBackgroundManagerContext } from '../lib/BackgroundManagerContext'
import type { AnimatedTechniqueDiagram } from '../lib/techniques'
import { ANIMATION_STEP_INTERVAL } from '../lib/constants'
import TechniqueBoardSvg from './TechniqueBoardSvg'

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
  const backgroundManager = useBackgroundManagerContext()

  // Auto-advance when playing and not hidden - loops automatically (1→2→3→1→2→3→...)
  useEffect(() => {
    if (!isPlaying || backgroundManager.shouldPauseOperations) {
      return
    }

    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % stepCount)
    }, ANIMATION_STEP_INTERVAL)

    return () => {
      clearInterval(timer)
    }
  }, [isPlaying, stepCount, backgroundManager.shouldPauseOperations])

  const handlePrevious = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep((prev) => (prev - 1 + stepCount) % stepCount)
  }, [stepCount])

  const handleNext = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep((prev) => (prev + 1) % stepCount)
  }, [stepCount])

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev)
  }, [])

  // Early return if no step data (shouldn't happen in practice but satisfies type checker)
  if (!currentStepData) {
    return null
  }

  return (
    <div className="flex flex-col items-center">
      {/* SVG Diagram */}
      <TechniqueBoardSvg
        cells={currentStepData.cells}
        highlightElimination
        className="transition-colors duration-300"
      />

      {/* Step description */}
      <div className="mt-3 min-h-[2.5rem] text-center">
        <p className="text-sm font-medium text-foreground">{currentStepData.description}</p>
      </div>

      {/* Controls */}
      <div className="mt-2 flex items-center gap-2">
        {/* Previous button */}
        <button
          onClick={handlePrevious}
          className="rounded-full p-1.5 hover:bg-btn-hover transition-colors"
          aria-label="Previous step"
        >
          <svg
            className="h-4 w-4 text-foreground-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          className="rounded-full p-1.5 hover:bg-btn-hover transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg
              className="h-4 w-4 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="h-4 w-4 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </button>

        {/* Next button */}
        <button
          onClick={handleNext}
          className="rounded-full p-1.5 hover:bg-btn-hover transition-colors"
          aria-label="Next step"
        >
          <svg
            className="h-4 w-4 text-foreground-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
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
              idx === currentStep ? 'bg-accent' : 'bg-board-border-light hover:bg-foreground-muted'
            }`}
            aria-label={`Go to step ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
