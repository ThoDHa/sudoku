import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { parseText } from '../lib/glossaryTextParse'
import { type GlossaryTerm } from '../lib/techniques'

interface GlossaryLinkedTextProps {
  text: string
  className?: string
}

interface GlossaryTooltipProps {
  term: GlossaryTerm
  children: React.ReactNode
  onClose: () => void
  tooltipRef: React.RefObject<HTMLDivElement | null>
}

// Tooltip component for glossary terms
function GlossaryTooltip({ term, children, onClose, tooltipRef }: GlossaryTooltipProps) {
  return (
    <span className="relative inline-block">
      {children}
      <div
        ref={tooltipRef}
        className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-board-border-light bg-background p-3 shadow-lg"
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-accent">{term.term}</h4>
          <button
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground"
            aria-label="Close tooltip"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">{term.definition}</p>
        {term.example && (
          <p className="mt-2 text-xs text-foreground-muted italic">Example: {term.example}</p>
        )}
        {/* Arrow pointing down */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-background" />
      </div>
    </span>
  )
}

// Main component that renders text with glossary links
export default function GlossaryLinkedText({ text, className = '' }: GlossaryLinkedTextProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const segments = useMemo(() => parseText(text), [text])

  const handleTermClick = (termName: string) => {
    setActiveTooltip(activeTooltip === termName ? null : termName)
  }

  // Close tooltip when clicking outside it (document-level listener avoids
  // the need for a click handler on the container span, which would violate
  // jsx-a11y/no-static-element-interactions).
  useEffect(() => {
    if (!activeTooltip) return
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setActiveTooltip(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [activeTooltip])

  return (
    <span className={className}>
      {segments.map((segment, idx) => {
        if (segment.type === 'text') {
          return <Fragment key={idx}>{segment.content}</Fragment>
        }

        if (segment.type === 'glossary' && segment.term) {
          const isActive = activeTooltip === segment.term.term

          return (
            <Fragment key={idx}>
              {isActive ? (
                <GlossaryTooltip
                  term={segment.term}
                  onClose={() => {
                    setActiveTooltip(null)
                  }}
                  tooltipRef={tooltipRef}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (segment.term) handleTermClick(segment.term.term)
                    }}
                    className="inline border-b border-dashed border-accent text-accent hover:border-solid focus:outline-none"
                  >
                    {segment.content}
                  </button>
                </GlossaryTooltip>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (segment.term) handleTermClick(segment.term.term)
                  }}
                  className="inline border-b border-dashed border-accent text-accent hover:border-solid focus:outline-none"
                >
                  {segment.content}
                </button>
              )}
            </Fragment>
          )
        }

        return null
      })}
    </span>
  )
}

// Export a simpler version for use in places where interactivity isn't needed
// eslint-disable-next-line react-refresh/only-export-components -- Utility function shared between components
export function highlightGlossaryTerms(text: string): React.ReactNode {
  const segments = parseText(text)

  return segments.map((segment, idx) => {
    if (segment.type === 'text') {
      return <Fragment key={idx}>{segment.content}</Fragment>
    }

    if (segment.type === 'glossary') {
      return (
        <span key={idx} className="font-medium text-accent" title={segment.term?.definition}>
          {segment.content}
        </span>
      )
    }

    return null
  })
}
