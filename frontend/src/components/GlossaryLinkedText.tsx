import { useState, useMemo, Fragment } from 'react'
import { GLOSSARY, type GlossaryTerm } from '../lib/techniques'

interface GlossaryLinkedTextProps {
  text: string
  className?: string
}

interface GlossaryTooltipProps {
  term: GlossaryTerm
  children: React.ReactNode
  onClose: () => void
}

// Tooltip component for glossary terms
function GlossaryTooltip({ term, children, onClose }: GlossaryTooltipProps) {
  return (
    <span className="relative inline-block">
      {children}
      <div 
        className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-board-border-light bg-background p-3 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-accent">{term.term}</h4>
          <button 
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground"
            aria-label="Close tooltip"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">{term.definition}</p>
        {term.example && (
          <p className="mt-2 text-xs text-foreground-muted italic">
            Example: {term.example}
          </p>
        )}
        {/* Arrow pointing down */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-background" />
      </div>
    </span>
  )
}

// Build a map of glossary terms for quick lookup (case-insensitive)
const glossaryMap = new Map<string, GlossaryTerm>()
GLOSSARY.forEach(term => {
  glossaryMap.set(term.term.toLowerCase(), term)
})

// Terms to match - sorted by length (longest first) to avoid partial matches
const sortedTerms = [...GLOSSARY]
  .sort((a, b) => b.term.length - a.term.length)
  .map(t => t.term)

// Create a regex pattern that matches glossary terms as whole words
// Escape special regex characters in terms
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build the pattern - match terms case-insensitively as whole words
const termPattern = new RegExp(
  `\\b(${sortedTerms.map(escapeRegex).join('|')})\\b`,
  'gi'
)

interface TextSegment {
  type: 'text' | 'glossary'
  content: string
  term?: GlossaryTerm
}

// Parse text into segments (plain text and glossary terms)
function parseText(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let lastIndex = 0
  
  // Find all matches
  const matches: Array<{ index: number; length: number; text: string; term: GlossaryTerm }> = []
  
  let match: RegExpExecArray | null
  while ((match = termPattern.exec(text)) !== null) {
    const matchedTerm = match[1]
    const term = matchedTerm ? glossaryMap.get(matchedTerm.toLowerCase()) : undefined
    if (term) {
      matches.push({
        index: match.index,
        length: match[0].length,
        text: match[0],
        term
      })
    }
  }
  
  // Sort matches by index
  matches.sort((a, b) => a.index - b.index)
  
  // Build segments, avoiding overlapping matches
  let currentPos = 0
  for (const m of matches) {
    // Skip if this match overlaps with previous
    if (m.index < currentPos) continue
    
    // Add text before this match
    if (m.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, m.index)
      })
    }
    
    // Add the glossary term
    segments.push({
      type: 'glossary',
      content: m.text,
      term: m.term
    })
    
    lastIndex = m.index + m.length
    currentPos = lastIndex
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex)
    })
  }
  
  return segments
}

// Main component that renders text with glossary links
export default function GlossaryLinkedText({ text, className = '' }: GlossaryLinkedTextProps) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null)
  
  const segments = useMemo(() => parseText(text), [text])
  
  const handleTermClick = (termName: string) => {
    setActiveTooltip(activeTooltip === termName ? null : termName)
  }
  
  // Close tooltip when clicking outside
  const handleContainerClick = () => {
    if (activeTooltip) {
      setActiveTooltip(null)
    }
  }
  
  return (
    <span className={className} onClick={handleContainerClick}>
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
                  onClose={() => setActiveTooltip(null)}
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
