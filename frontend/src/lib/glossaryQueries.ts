// Query helpers over the GLOSSARY dataset, split out of techniques.ts so the
// lookup logic is mutation-tested while the data tables stay excluded.
import { GLOSSARY, type GlossaryTerm } from './techniques'

// Get all glossary terms sorted alphabetically
export function getGlossarySorted(): GlossaryTerm[] {
  return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term))
}

// Search glossary by term or definition
export function searchGlossary(query: string): GlossaryTerm[] {
  const lowerQuery = query.toLowerCase()
  return GLOSSARY.filter(
    (g) =>
      g.term.toLowerCase().includes(lowerQuery) || g.definition.toLowerCase().includes(lowerQuery),
  ).sort((a, b) => {
    // Prioritize term matches over definition matches
    const aTermMatch = a.term.toLowerCase().includes(lowerQuery)
    const bTermMatch = b.term.toLowerCase().includes(lowerQuery)
    if (aTermMatch && !bTermMatch) return -1
    if (!aTermMatch && bTermMatch) return 1
    return a.term.localeCompare(b.term)
  })
}
