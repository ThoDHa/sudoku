import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getTechniqueBySlug, type TechniqueInfo } from '../lib/techniques'
import { ChevronRightIcon } from './ui'
import TechniqueDiagramView, { TechniqueDiagramLegend } from './TechniqueDiagram'
import AnimatedDiagramView from './AnimatedDiagramView'
import GlossaryLinkedText from './GlossaryLinkedText'
import { getPracticePuzzle } from '../lib/puzzles-data'
import { STORAGE_KEYS } from '../lib/constants'

interface TechniqueDetailViewProps {
  technique: TechniqueInfo
  // For modal: clicking related technique updates view state
  onRelatedClick?: (technique: TechniqueInfo) => void
  // For page: show as page layout (larger headings, subsections, etc.)
  variant?: 'modal' | 'page'
  // Show tips section (only in modal list view)
  showTips?: boolean
}

interface RelatedTechniquesProps {
  slugs: string[]
  onRelatedClick?: (technique: TechniqueInfo) => void
  variant: 'modal' | 'page'
}

function RelatedTechniques({ slugs, onRelatedClick, variant }: RelatedTechniquesProps) {
  if (!slugs.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {slugs.map(slug => {
        const related = getTechniqueBySlug(slug)
        if (!related) return null
        
        if (variant === 'modal' && onRelatedClick) {
          return (
            <button
              key={slug}
              onClick={() => onRelatedClick(related)}
              className="inline-flex items-center gap-1 rounded-full bg-background-secondary px-3 py-1 text-sm text-accent hover:bg-btn-hover"
            >
              {related.title}
              <ChevronRightIcon className="h-3 w-3" />
            </button>
          )
        }
        
        return (
          <Link
            key={slug}
            to={`/technique/${slug}`}
            className="inline-flex items-center gap-1 rounded-full bg-background-secondary px-3 py-1 text-sm text-accent hover:bg-btn-hover"
          >
            {related.title}
            <ChevronRightIcon className="h-3 w-3" />
          </Link>
        )
      })}
    </div>
  )
}

export default function TechniqueDetailView({ 
  technique, 
  onRelatedClick, 
  variant = 'modal',
  showTips = false 
}: TechniqueDetailViewProps) {
  const navigate = useNavigate()
  const [practiceError, setPracticeError] = useState<string | null>(null)
  
  const isPage = variant === 'page'
  const headingClass = isPage ? 'text-base font-semibold' : 'text-sm font-semibold'
  const sectionClass = isPage ? 'space-y-4' : 'space-y-4'
  
  // Only show practice for implemented techniques (not 'NotImplemented' tier)
  const canPractice = technique.tier !== 'NotImplemented' && technique.tier !== 'Auto'
  
  const handlePractice = () => {
    setPracticeError(null)
    
    // Get a practice puzzle that uses this technique
    const puzzle = getPracticePuzzle(technique.slug)
    if (!puzzle) {
      setPracticeError('No practice puzzle available for this technique')
      return
    }
    
    // Create a unique seed for this practice puzzle
    const seed = `practice-${technique.slug}-${puzzle.puzzleIndex}`
    
    // Store givens in localStorage so Game.tsx can load them
    const storageKey = `${STORAGE_KEYS.CUSTOM_PUZZLE_PREFIX}${seed}`
    localStorage.setItem(storageKey, JSON.stringify(puzzle.givens))
    
    // Navigate to the puzzle
    navigate(`/game/${seed}?d=${puzzle.difficulty}`)
  }

  return (
    <div className={sectionClass}>
      {/* Diagram - prefer animated if available */}
      {(technique.animatedDiagram || technique.diagram) && (
        <div>
          {isPage && <h2 className={`mb-2 ${headingClass} text-foreground`}>Diagram</h2>}
          <div className="rounded-lg bg-background-secondary p-3">
            {!isPage && <h3 className="mb-2 text-sm font-semibold text-foreground">Diagram</h3>}
            {technique.animatedDiagram ? (
              <AnimatedDiagramView diagram={technique.animatedDiagram} />
            ) : technique.diagram ? (
              <>
                <TechniqueDiagramView diagram={technique.diagram} />
                <TechniqueDiagramLegend />
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Example */}
      <div>
        <h2 className={`mb-2 ${headingClass} text-foreground`}>
          {isPage ? 'Example' : 'Example'}
        </h2>
        <div className={`rounded-lg p-3 ${isPage ? 'border border-accent bg-accent-light' : 'bg-background-secondary'}`}>
          <p className="text-sm leading-relaxed text-foreground">
            <GlossaryLinkedText text={technique.example} />
          </p>
        </div>
      </div>

      {/* Subsections / Variations (page only) - collapsed for space */}
      {isPage && technique.subsections && technique.subsections.length > 0 && (
        <div>
          <h2 className={`mb-2 ${headingClass} text-foreground`}>Variations</h2>
          <div className="flex flex-wrap gap-2">
            {technique.subsections.map((sub, idx) => (
              <a
                key={sub.slug}
                href={`#subsection-${idx}`}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  sub.title.includes('Not Implemented')
                    ? 'bg-background-secondary text-foreground-muted'
                    : 'bg-accent-light text-accent hover:bg-accent hover:text-white'
                }`}
              >
                {sub.title.replace(' (Not Implemented)', '')}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Related Techniques */}
      {technique.relatedTechniques && technique.relatedTechniques.length > 0 && (
        <div>
          <h2 className={`mb-2 ${headingClass} text-foreground`}>
            {isPage ? 'Related' : 'Related Techniques'}
          </h2>
          <RelatedTechniques 
            slugs={technique.relatedTechniques} 
            variant={variant}
            {...(onRelatedClick ? { onRelatedClick } : {})}
          />
        </div>
      )}

      {/* Tips (modal only) */}
      {showTips && (
        <div className="rounded-lg border border-board-border-light p-3">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Tips</h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-foreground-muted">
            <li>Use "Auto-fill notes" from the menu to see all candidates</li>
            <li>Click "Hint" to get a suggestion and apply it automatically</li>
            <li>Look for patterns matching this technique in your puzzle</li>
          </ul>
        </div>
      )}
      
      {/* Practice button */}
      {canPractice && (
        <div>
          <button
            onClick={handlePractice}
            className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Practice This Technique
            </span>
          </button>
          {practiceError && (
            <p className="mt-1 text-center text-xs text-error-text">{practiceError}</p>
          )}
        </div>
      )}
    </div>
  )
}
