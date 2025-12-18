import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getTechniqueBySlug, type TechniqueInfo, type TechniqueSubsection } from '../lib/techniques'
import { ChevronRightIcon } from './ui'
import TechniqueDiagramView, { TechniqueDiagramLegend } from './TechniqueDiagram'
import { fetchPracticePuzzle } from '../lib/api'

interface TechniqueDetailViewProps {
  technique: TechniqueInfo
  // For modal: clicking related technique updates view state
  onRelatedClick?: (technique: TechniqueInfo) => void
  // For page: show as page layout (larger headings, subsections, etc.)
  variant?: 'modal' | 'page'
  // Show tips section (only in modal list view)
  showTips?: boolean
}

interface SubsectionViewProps {
  subsection: TechniqueSubsection
  index: number
}

function SubsectionView({ subsection, index }: SubsectionViewProps) {
  const isNotImplemented = subsection.title.includes('Not Implemented')
  
  return (
    <div 
      id={`subsection-${index}`}
      className={`rounded-lg border p-4 ${isNotImplemented ? 'border-[var(--border-light)] bg-[var(--bg-secondary)] opacity-60' : 'border-[var(--accent)] bg-[var(--bg-secondary)]'}`}
    >
      <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">
        {subsection.title}
      </h3>
      <p className="mb-3 text-[var(--text-muted)]">{subsection.description}</p>
      
      {subsection.diagram && (
        <div className="mb-3">
          <TechniqueDiagramView diagram={subsection.diagram} />
        </div>
      )}
      
      <div className="rounded border border-[var(--border-light)] bg-[var(--cell-bg)] p-3">
        <p className="text-sm text-[var(--text)]">
          <span className="font-medium">Example:</span> {subsection.example}
        </p>
      </div>
    </div>
  )
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
              className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-sm text-[var(--accent)] hover:bg-[var(--btn-hover)]"
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
            className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-sm text-[var(--accent)] hover:bg-[var(--btn-hover)]"
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
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [practiceError, setPracticeError] = useState<string | null>(null)
  
  const isPage = variant === 'page'
  const headingClass = isPage ? 'text-xl font-semibold' : 'text-sm font-semibold'
  const sectionClass = isPage ? 'mb-8' : 'space-y-4'
  
  // Only show practice for implemented techniques (not 'NotImplemented' tier)
  const canPractice = technique.tier !== 'NotImplemented' && technique.tier !== 'Auto'
  
  const handlePractice = async () => {
    setPracticeLoading(true)
    setPracticeError(null)
    try {
      const response = await fetchPracticePuzzle(technique.slug)
      // Navigate to the puzzle using encoded format for custom-like puzzles
      // or use the seed directly if provided
      if (response.givens && response.difficulty) {
        // Use the practice seed format
        navigate(`/play/${response.seed}?d=${response.difficulty}`)
      }
    } catch (err) {
      setPracticeError(err instanceof Error ? err.message : 'Failed to find practice puzzle')
    } finally {
      setPracticeLoading(false)
    }
  }

  return (
    <div className={sectionClass}>
      {/* Diagram */}
      {technique.diagram && (
        <div className={isPage ? 'mb-8' : ''}>
          {isPage && <h2 className={`mb-4 ${headingClass} text-[var(--text)]`}>📊 Diagram</h2>}
          <div className="rounded-lg bg-[var(--bg-secondary)] p-4">
            {!isPage && <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Diagram</h3>}
            <TechniqueDiagramView diagram={technique.diagram} />
            <TechniqueDiagramLegend />
          </div>
        </div>
      )}

      {/* Description / How it works */}
      <div className={isPage ? 'mb-8' : ''}>
        <h2 className={`${isPage ? 'mb-4' : 'mb-2'} ${headingClass} text-[var(--text)]`}>
          {isPage ? '⚙️ How it works' : 'How it works'}
        </h2>
        <p className={`${isPage ? '' : 'text-sm'} leading-relaxed text-[var(--text-muted)]`}>
          {technique.description}
        </p>
      </div>

      {/* Example */}
      <div className={isPage ? 'mb-8' : ''}>
        <h2 className={`${isPage ? 'mb-4' : 'mb-2'} ${headingClass} text-[var(--text)]`}>
          {isPage ? '💡 Example' : 'Example'}
        </h2>
        <div className={`rounded-lg p-4 ${isPage ? 'border border-[var(--accent)] bg-[var(--accent-light)]' : 'bg-[var(--bg-secondary)]'}`}>
          <p className={`${isPage ? '' : 'text-sm'} leading-relaxed text-[var(--text${isPage ? '' : '-muted'})]`}>
            {technique.example}
          </p>
        </div>
      </div>

      {/* Subsections / Variations (page only) */}
      {isPage && technique.subsections && technique.subsections.length > 0 && (
        <div className="mb-8">
          <h2 className={`mb-4 ${headingClass} text-[var(--text)]`}>📋 Variations</h2>
          
          {/* Quick navigation */}
          <div className="mb-4 flex flex-wrap gap-2">
            {technique.subsections.map((sub, idx) => (
              <a
                key={sub.slug}
                href={`#subsection-${idx}`}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  sub.title.includes('Not Implemented')
                    ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                    : 'bg-[var(--accent-light)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'
                }`}
              >
                {sub.title.replace(' (Not Implemented)', '')}
              </a>
            ))}
          </div>
          
          <div className="space-y-4">
            {technique.subsections.map((subsection, index) => (
              <SubsectionView key={subsection.slug} subsection={subsection} index={index} />
            ))}
          </div>
        </div>
      )}

      {/* Related Techniques */}
      {technique.relatedTechniques && technique.relatedTechniques.length > 0 && (
        <div className={isPage ? 'mb-8' : ''}>
          <h2 className={`${isPage ? 'mb-4' : 'mb-2'} ${headingClass} text-[var(--text)]`}>
            {isPage ? '🔗 Related Techniques' : 'Related Techniques'}
          </h2>
          <RelatedTechniques 
            slugs={technique.relatedTechniques} 
            onRelatedClick={onRelatedClick}
            variant={variant}
          />
        </div>
      )}

      {/* Tips (modal only) */}
      {showTips && (
        <div className="rounded-lg border border-[var(--border-light)] p-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Tips</h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--text-muted)]">
            <li>Use "Auto-fill notes" from the menu to see all candidates</li>
            <li>Click "Hint" to get a suggestion and apply it automatically</li>
            <li>Look for patterns matching this technique in your puzzle</li>
          </ul>
        </div>
      )}
      
      {/* Practice button */}
      {canPractice && (
        <div className={isPage ? 'mb-8' : 'mt-4'}>
          <button
            onClick={handlePractice}
            disabled={practiceLoading}
            className="w-full rounded-lg bg-[var(--accent)] py-3 font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {practiceLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Finding puzzle...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Practice This Technique
              </span>
            )}
          </button>
          {practiceError && (
            <p className="mt-2 text-center text-sm text-red-500">{practiceError}</p>
          )}
        </div>
      )}
    </div>
  )
}
