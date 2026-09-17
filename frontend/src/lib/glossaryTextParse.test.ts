import { describe, it, expect } from 'vitest'
import { parseText, getGlossaryParseIndex } from './glossaryTextParse'
import { GLOSSARY } from './techniques'

function glossarySegments(text: string) {
  return parseText(text).filter((segment) => segment.type === 'glossary')
}

describe('parseText term preference', () => {
  it('prefers the longest term when one term is a prefix of another', () => {
    expect(parseText('BUG+1 avoids the BUG state')).toEqual([
      { type: 'glossary', content: 'BUG+1', term: GLOSSARY.find((t) => t.term === 'BUG+1') },
      { type: 'text', content: ' avoids the ' },
      { type: 'glossary', content: 'BUG', term: GLOSSARY.find((t) => t.term === 'BUG') },
      { type: 'text', content: ' state' },
    ])
  })

  it('matches a term that follows a non-word separator inside a larger token', () => {
    expect(parseText('XY-Chain')).toEqual([
      { type: 'text', content: 'XY-' },
      { type: 'glossary', content: 'Chain', term: GLOSSARY.find((t) => t.term === 'Chain') },
    ])
  })
})

describe('parseText segment integrity', () => {
  it('accepts adjacent terms separated only by a word boundary', () => {
    expect(parseText('Chain-Loop')).toEqual([
      { type: 'glossary', content: 'Chain', term: GLOSSARY.find((t) => t.term === 'Chain') },
      { type: 'text', content: '-' },
      { type: 'glossary', content: 'Loop', term: GLOSSARY.find((t) => t.term === 'Loop') },
    ])
  })

  it('never drops or duplicates characters across many parsed strings', () => {
    const samples = [
      'BUG+1 avoids the BUG state',
      'a Chain, a Loop, and a House',
      'Chain-Loop',
      'BUG+1BUG',
      'every CANDIDATE and candidate',
    ]
    for (const text of samples) {
      const segments = parseText(text)
      expect(segments.map((segment) => segment.content).join('')).toBe(text)
      expect(segments.every((segment) => segment.content.length > 0)).toBe(true)
    }
  })

  it('links a term at the very start of the text', () => {
    expect(parseText('Chain reactions start here')[0]).toEqual({
      type: 'glossary',
      content: 'Chain',
      term: GLOSSARY.find((t) => t.term === 'Chain'),
    })
  })
})

describe('parseText case handling', () => {
  it('matches terms case-insensitively and preserves the matched casing', () => {
    expect(parseText('every CANDIDATE and candidate')).toEqual([
      { type: 'text', content: 'every ' },
      {
        type: 'glossary',
        content: 'CANDIDATE',
        term: GLOSSARY.find((t) => t.term === 'Candidate'),
      },
      { type: 'text', content: ' and ' },
      {
        type: 'glossary',
        content: 'candidate',
        term: GLOSSARY.find((t) => t.term === 'Candidate'),
      },
    ])
  })

  it('attaches the actual GLOSSARY entry to each matched segment', () => {
    const candidate = GLOSSARY.find((t) => t.term === 'Candidate')
    const segments = glossarySegments('a Candidate')
    expect(segments).toHaveLength(1)
    expect(segments[0]?.term).toBe(candidate)
  })
})

describe('parseText regex metacharacters', () => {
  it('matches a term containing a regex metacharacter literally', () => {
    expect(parseText('the + character alone is plain, but BUG+1 is linked')).toEqual([
      { type: 'text', content: 'the + character alone is plain, but ' },
      { type: 'glossary', content: 'BUG+1', term: GLOSSARY.find((t) => t.term === 'BUG+1') },
      { type: 'text', content: ' is linked' },
    ])
  })

  it('does not match metacharacter-quantifier lookalikes', () => {
    expect(glossarySegments('BUGG1 and BUG1 are not terms')).toEqual([])
  })
})

describe('parseText state independence', () => {
  it('parses two consecutive different strings without lastIndex leakage', () => {
    const second = parseText('Candidate')
    expect(parseText('BUG+1 state')[0]?.content).toBe('BUG+1')
    expect(second).toEqual([
      {
        type: 'glossary',
        content: 'Candidate',
        term: GLOSSARY.find((t) => t.term === 'Candidate'),
      },
    ])
  })

  it('returns identical segmentations when the same text is reparsed later', () => {
    const first = parseText('a Chain, a Loop')
    parseText('BUG+1 avoids the BUG state')
    parseText('Candidate')
    expect(parseText('a Chain, a Loop')).toEqual(first)
  })
})

describe('parseText plain text', () => {
  it('returns a single text segment when no term matches', () => {
    expect(parseText('nothing special here')).toEqual([
      { type: 'text', content: 'nothing special here' },
    ])
  })

  it('returns an empty segment list for empty input', () => {
    expect(parseText('')).toEqual([])
  })
})

describe('getGlossaryParseIndex memoisation', () => {
  it('builds the glossary index once and reuses the same instance across parses', () => {
    const first = getGlossaryParseIndex()
    expect(first.termPattern).toBeInstanceOf(RegExp)
    parseText('a Candidate')
    parseText('BUG+1 state')
    expect(getGlossaryParseIndex()).toBe(first)
  })
})
