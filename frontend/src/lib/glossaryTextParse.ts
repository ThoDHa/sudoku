// Parses text into plain-text and glossary-term segments, split out of
// GlossaryLinkedText.tsx so the parser is mutation-tested while the component
// keeps only rendering.
import { GLOSSARY, type GlossaryTerm } from './techniques'

// Escape special regex characters in terms
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Terms to match - sorted by length (longest first) to avoid partial matches
function longestTermFirst(a: GlossaryTerm, b: GlossaryTerm): number {
  return b.term.length - a.term.length
}

export interface TextSegment {
  type: 'text' | 'glossary'
  content: string
  term?: GlossaryTerm
}

interface GlossaryParseIndex {
  glossaryMap: Map<string, GlossaryTerm>
  termPattern: RegExp
}

// The GLOSSARY derivations are memoised on first use instead of being built at
// module scope: import-time computation would land as static mutants outside
// the reach of the test suite.
let cachedIndex: GlossaryParseIndex | undefined

export function getGlossaryParseIndex(): GlossaryParseIndex {
  if (!cachedIndex) {
    // Build a map of glossary terms for quick lookup (case-insensitive)
    const glossaryMap = new Map<string, GlossaryTerm>()
    GLOSSARY.forEach((term) => {
      glossaryMap.set(term.term.toLowerCase(), term)
    })

    // Build the pattern - match terms case-insensitively as whole words
    const sortedTerms = [...GLOSSARY].sort(longestTermFirst).map((t) => t.term)
    const termPattern = new RegExp(`\\b(${sortedTerms.map(escapeRegex).join('|')})\\b`, 'gi')
    cachedIndex = { glossaryMap, termPattern }
  }
  return cachedIndex
}

// Parse text into segments (plain text and glossary terms)
export function parseText(text: string): TextSegment[] {
  const { glossaryMap, termPattern } = getGlossaryParseIndex()
  const segments: TextSegment[] = []
  let lastIndex = 0

  // Find all matches
  const matches: Array<{ index: number; length: number; text: string; term: GlossaryTerm }> = []

  let match: RegExpExecArray | null
  while ((match = termPattern.exec(text)) !== null) {
    // Group 1 is the pattern's only alternation group and the pattern is built
    // from exactly the glossaryMap keys, so the lookup always resolves and the
    // emitted segment is keyed on the same captured term. The assertions are
    // provably safe for that reason; an `as` cast here would suppress mutant
    // generation across the lookup.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const term = glossaryMap.get(match[1]!.toLowerCase())!
    matches.push({
      index: match.index,
      length: match[0].length,
      text: match[0],
      term,
    })
  }

  // exec with the g flag yields matches in index order and never overlapping,
  // so the segments can be built straight from the match list.
  for (const matched of matches) {
    // Add text before this match
    if (matched.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, matched.index),
      })
    }

    // Add the glossary term
    segments.push({
      type: 'glossary',
      content: matched.text,
      term: matched.term,
    })

    lastIndex = matched.index + matched.length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return segments
}
