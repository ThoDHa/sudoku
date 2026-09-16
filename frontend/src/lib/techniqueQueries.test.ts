import { describe, expect, it } from 'vitest'
import { TECHNIQUES } from './techniques'
import {
  getDisplayTechniques,
  getNavigableTechniques,
  getNextTechnique,
  getPreviousTechnique,
  getTechniqueBySlug,
  getTechniquesByTier,
} from './techniqueQueries'

describe('getTechniqueBySlug', () => {
  it('resolves a top-level technique by slug', () => {
    const technique = getTechniqueBySlug('naked-single')
    expect(technique?.title).toBe('Naked Single')
    expect(technique).toBe(TECHNIQUES.find((t) => t.slug === 'naked-single'))
  })

  it('resolves a subsection slug through the subsection fallback', () => {
    const technique = getTechniqueBySlug('avoidable-rectangle')
    expect(technique?.slug).toBe('unique-rectangle')
    expect(technique?.subsections?.some((s) => s.slug === 'avoidable-rectangle')).toBe(true)
  })

  it('returns undefined for an unknown slug', () => {
    expect(getTechniqueBySlug('no-such-technique')).toBeUndefined()
  })
})

describe('getDisplayTechniques', () => {
  it('returns all non-Auto techniques', () => {
    expect(getDisplayTechniques()).toHaveLength(56)
  })

  it('excludes every Auto tier entry', () => {
    const display = getDisplayTechniques()
    expect(display.every((t) => t.tier !== 'Auto')).toBe(true)
    expect(display.some((t) => t.slug === 'auto-fill')).toBe(false)
    expect(TECHNIQUES.some((t) => t.tier === 'Auto')).toBe(true)
  })

  it('includes Extreme tier entries', () => {
    expect(getDisplayTechniques().some((t) => t.slug === 'finned-x-wing')).toBe(true)
  })
})

describe('getTechniquesByTier', () => {
  it('returns exactly the Simple tier members', () => {
    const simple = getTechniquesByTier('Simple')
    expect(simple).toHaveLength(8)
    expect(simple.every((t) => t.tier === 'Simple')).toBe(true)
    expect(simple[0]?.slug).toBe('naked-single')
  })

  it('returns exactly the Medium tier members', () => {
    const medium = getTechniquesByTier('Medium')
    expect(medium).toHaveLength(9)
    expect(medium.every((t) => t.tier === 'Medium')).toBe(true)
    expect(medium[0]?.slug).toBe('naked-quad')
  })

  it('returns exactly the Hard tier members', () => {
    const hard = getTechniquesByTier('Hard')
    expect(hard).toHaveLength(8)
    expect(hard.every((t) => t.tier === 'Hard')).toBe(true)
    expect(hard[0]?.slug).toBe('jellyfish')
  })

  it('returns exactly the NotImplemented tier members', () => {
    const notImplemented = getTechniquesByTier('NotImplemented')
    expect(notImplemented).toHaveLength(20)
    expect(notImplemented.every((t) => t.tier === 'NotImplemented')).toBe(true)
    expect(notImplemented[0]?.slug).toBe('exocet')
  })
})

describe('getNavigableTechniques', () => {
  it('returns the 36 Simple, Medium, Hard and Extreme techniques', () => {
    expect(getNavigableTechniques()).toHaveLength(36)
  })

  it('excludes Auto and NotImplemented entries', () => {
    const navigable = getNavigableTechniques()
    expect(navigable.some((t) => t.tier === 'Auto')).toBe(false)
    expect(navigable.some((t) => t.tier === 'NotImplemented')).toBe(false)
    expect(navigable.every((t) => ['Simple', 'Medium', 'Hard', 'Extreme'].includes(t.tier))).toBe(
      true,
    )
  })

  it('starts at naked-single and ends at death-blossom', () => {
    const navigable = getNavigableTechniques()
    expect(navigable[0]?.slug).toBe('naked-single')
    expect(navigable.at(-1)?.slug).toBe('death-blossom')
  })
})

describe('getPreviousTechnique', () => {
  it('returns undefined for the first navigable technique', () => {
    expect(getPreviousTechnique('naked-single')).toBeUndefined()
  })

  it('returns undefined for an unknown slug', () => {
    expect(getPreviousTechnique('no-such-technique')).toBeUndefined()
  })

  it('returns the preceding navigable technique', () => {
    expect(getPreviousTechnique('hidden-single')?.slug).toBe('naked-single')
  })

  it('returns undefined for Auto and NotImplemented entries', () => {
    expect(getPreviousTechnique('auto-fill')).toBeUndefined()
    expect(getPreviousTechnique('exocet')).toBeUndefined()
  })
})

describe('getNextTechnique', () => {
  it('returns undefined for the last navigable technique', () => {
    expect(getNextTechnique('death-blossom')).toBeUndefined()
  })

  it('returns undefined for an unknown slug', () => {
    expect(getNextTechnique('no-such-technique')).toBeUndefined()
  })

  it('returns the following navigable technique', () => {
    expect(getNextTechnique('naked-single')?.slug).toBe('hidden-single')
  })

  it('returns undefined for Auto and NotImplemented entries', () => {
    expect(getNextTechnique('auto-fill')).toBeUndefined()
    expect(getNextTechnique('exocet')).toBeUndefined()
  })
})

describe('navigable order', () => {
  it('walks the full navigable order through previous and next', () => {
    const navigable = getNavigableTechniques()
    for (let i = 0; i < navigable.length; i++) {
      if (i === 0) {
        expect(getPreviousTechnique(navigable[i]!.slug)).toBeUndefined()
      } else {
        expect(getPreviousTechnique(navigable[i]!.slug)?.slug).toBe(navigable[i - 1]?.slug)
      }
      if (i === navigable.length - 1) {
        expect(getNextTechnique(navigable[i]!.slug)).toBeUndefined()
      } else {
        expect(getNextTechnique(navigable[i]!.slug)?.slug).toBe(navigable[i + 1]?.slug)
      }
    }
  })
})
