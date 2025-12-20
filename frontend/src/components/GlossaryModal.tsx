import { useState, useMemo } from 'react'
import { getGlossarySorted, searchGlossary, type GlossaryTerm } from '../lib/techniques'
import { CloseIcon } from './ui'

interface GlossaryModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function GlossaryModal({ isOpen, onClose }: GlossaryModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null)
  
  const terms = useMemo(() => {
    if (searchQuery.trim()) {
      return searchGlossary(searchQuery.trim())
    }
    return getGlossarySorted()
  }, [searchQuery])
  
  // Group terms by first letter for alphabetical sections
  const groupedTerms = useMemo(() => {
    const groups: Record<string, GlossaryTerm[]> = {}
    terms.forEach(term => {
      const firstChar = term.term[0]
      if (!firstChar) return
      const letter = firstChar.toUpperCase()
      if (!groups[letter]) {
        groups[letter] = []
      }
      groups[letter]?.push(term)
    })
    return groups
  }, [terms])
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div 
        className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-[var(--bg)] shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-light)] p-4">
          <h2 className="text-xl font-bold text-[var(--text)]">Sudoku Glossary</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-[var(--btn-hover)] transition-colors"
            aria-label="Close glossary"
          >
            <CloseIcon className="h-5 w-5 text-[var(--text-muted)]" />
          </button>
        </div>
        
        {/* Search */}
        <div className="border-b border-[var(--border-light)] p-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search terms..."
              className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] px-4 py-2 pl-10 text-[var(--text)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
            <svg 
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {terms.length} term{terms.length !== 1 ? 's' : ''} {searchQuery ? 'found' : 'total'}
          </p>
        </div>
        
        {/* Terms list */}
        <div className="flex-1 overflow-y-auto p-4">
          {terms.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-muted)]">
              No terms found matching "{searchQuery}"
            </div>
          ) : searchQuery ? (
            // Flat list when searching
            <div className="space-y-2">
              {terms.map(term => (
                <GlossaryTermCard
                  key={term.term}
                  term={term}
                  isExpanded={expandedTerm === term.term}
                  onToggle={() => setExpandedTerm(expandedTerm === term.term ? null : term.term)}
                />
              ))}
            </div>
          ) : (
            // Grouped by letter when not searching
            <div className="space-y-6">
              {Object.keys(groupedTerms).sort().map(letter => {
                const termsForLetter = groupedTerms[letter]
                if (!termsForLetter) return null
                return (
                  <div key={letter}>
                    <h3 className="mb-2 text-lg font-bold text-[var(--accent)]">{letter}</h3>
                    <div className="space-y-2">
                      {termsForLetter.map(term => (
                        <GlossaryTermCard
                          key={term.term}
                          term={term}
                          isExpanded={expandedTerm === term.term}
                          onToggle={() => setExpandedTerm(expandedTerm === term.term ? null : term.term)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface GlossaryTermCardProps {
  term: GlossaryTerm
  isExpanded: boolean
  onToggle: () => void
}

function GlossaryTermCard({ term, isExpanded, onToggle }: GlossaryTermCardProps) {
  return (
    <div 
      className={`rounded-lg border transition-colors ${
        isExpanded 
          ? 'border-[var(--accent)] bg-[var(--accent-light)]' 
          : 'border-[var(--border-light)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]'
      }`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between p-3 text-left"
      >
        <div className="flex-1">
          <h4 className="font-semibold text-[var(--text)]">{term.term}</h4>
          {!isExpanded && (
            <p className="mt-1 text-sm text-[var(--text-muted)] line-clamp-2">
              {term.definition}
            </p>
          )}
        </div>
        <svg 
          className={`ml-2 h-5 w-5 flex-shrink-0 text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isExpanded && (
        <div className="border-t border-[var(--border-light)] p-3">
          <p className="text-[var(--text)]">{term.definition}</p>
          
          {term.example && (
            <div className="mt-3 rounded-lg bg-[var(--bg)] p-3">
              <p className="text-sm">
                <span className="font-medium text-[var(--accent)]">Example: </span>
                <span className="text-[var(--text-muted)]">{term.example}</span>
              </p>
            </div>
          )}
          
          {term.relatedTerms && term.relatedTerms.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-[var(--text-muted)]">
                <span className="font-medium">Related: </span>
                {term.relatedTerms.join(', ')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
