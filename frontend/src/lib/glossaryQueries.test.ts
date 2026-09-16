import { describe, expect, it } from 'vitest'
import { GLOSSARY } from './techniques'
import { getGlossarySorted, searchGlossary } from './glossaryQueries'

describe('getGlossarySorted', () => {
  it('returns all 60 terms in localeCompare order', () => {
    const sorted = getGlossarySorted()
    expect(sorted).toHaveLength(60)
    expect(sorted.slice(0, 5).map((g) => g.term)).toEqual([
      'AIC',
      'ALS',
      'Backdoor',
      'Backtracking',
      'Base Set',
    ])
    expect(sorted.slice(-5).map((g) => g.term)).toEqual([
      'Strong Link',
      'Unit',
      'UR',
      'Weak Link',
      'Wing',
    ])
  })

  it('does not mutate GLOSSARY in place', () => {
    expect(GLOSSARY[0]?.term).toBe('Candidate')
    getGlossarySorted()
    expect(GLOSSARY[0]?.term).toBe('Candidate')
    expect(GLOSSARY[24]?.term).toBe('AIC')
  })

  it('returns a fresh array that can be reordered without affecting GLOSSARY', () => {
    const sorted = getGlossarySorted()
    sorted.reverse()
    expect(GLOSSARY[0]?.term).toBe('Candidate')
    expect(getGlossarySorted()[0]?.term).toBe('AIC')
  })
})

describe('searchGlossary', () => {
  it('matches on term', () => {
    expect(searchGlossary('Backdoor').map((g) => g.term)).toEqual(['Backdoor'])
    expect(searchGlossary('Conjugate Pair').map((g) => g.term)).toEqual(['Conjugate Pair'])
  })

  it('matches on definition', () => {
    // 'naked single' appears in the Singles definition, not in its term
    expect(searchGlossary('naked single').map((g) => g.term)).toEqual(['Singles'])
  })

  it('ranks a term match above a definition match', () => {
    // 'Chain' and 'Forcing Chain' match on term; the rest only on definition
    expect(searchGlossary('chain').map((g) => g.term)).toEqual([
      'Chain',
      'Forcing Chain',
      'AIC',
      'Bilocation',
      'Coloring',
      'Loop',
      'Nice Loop',
    ])
  })

  it('falls back to alphabetical order within each match class', () => {
    expect(searchGlossary('candidate').map((g) => g.term)).toEqual([
      'Candidate',
      'Locked Candidates',
      'ALS',
      'Backtracking',
      'Base Set',
      'Bifurcation',
      'Bilocation',
      'Bivalue Cell',
      'BUG',
      'BUG+1',
      'Claiming',
      'Color Trap',
      'Coloring',
      'Contradiction',
      'Elimination',
      'Fin',
      'Fish',
      'Forcing Chain',
      'Hidden',
      'Implication',
      'Locked Set',
      'Naked',
      'Notes',
      'Pencil Marks',
      'Pivot',
      'Pointing',
      'Restricted Common',
      'Sashimi',
      'UR',
      'Weak Link',
    ])
    expect(searchGlossary('pair').map((g) => g.term)).toEqual(['Conjugate Pair', 'Naked'])
  })

  it('matches case-insensitively', () => {
    expect(searchGlossary('PAIR').map((g) => g.term)).toEqual(
      searchGlossary('pair').map((g) => g.term),
    )
  })

  it('returns an empty array when nothing matches', () => {
    expect(searchGlossary('xyzzy-nothing')).toEqual([])
  })
})
