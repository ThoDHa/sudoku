import { describe, expect, it } from 'vitest'
import { GLOSSARY, TECHNIQUES, type GlossaryTerm, type TechniqueInfo } from './techniques'
import {
  assertAnimationStepsValid,
  assertDiagramCellsValid,
  assertGlossaryCollectionSize,
  assertGlossaryDefinitionsPresent,
  assertGlossaryRelatedTermsWellFormed,
  assertGlossaryTermsUnique,
  assertRelatedTechniquesResolve,
  assertSlugsUnique,
  assertStepsDoNotShareCells,
  assertTechniqueCollectionSizes,
  assertTechniqueFieldsPresent,
  assertTiersValid,
  validateGlossary,
  validateTechniqueSchema,
  validateTechniques,
} from './techniqueSchema'

const corruptTechniques = (mutate: (techniques: TechniqueInfo[]) => void): TechniqueInfo[] => {
  const copy = structuredClone(TECHNIQUES)
  mutate(copy)
  return copy
}

const corruptGlossary = (mutate: (glossary: GlossaryTerm[]) => void): GlossaryTerm[] => {
  const copy = structuredClone(GLOSSARY)
  mutate(copy)
  return copy
}

const uniqueRectangle = (techniques: TechniqueInfo[]): TechniqueInfo =>
  techniques.find((t) => t.slug === 'unique-rectangle')!

describe('the real data', () => {
  it('passes the full technique and glossary schema', () => {
    expect(() => validateTechniqueSchema(TECHNIQUES, GLOSSARY)).not.toThrow()
  })

  it('passes the technique validators', () => {
    expect(() => validateTechniques(TECHNIQUES)).not.toThrow()
  })

  it('passes the glossary validators', () => {
    expect(() => validateGlossary(GLOSSARY)).not.toThrow()
  })
})

describe('assertTechniqueCollectionSizes', () => {
  it('rejects a technique count below 57', () => {
    const copy = corruptTechniques((ts) => {
      ts.splice(0, 1)
    })
    expect(() => validateTechniques(copy)).toThrow('Expected 57 techniques, found 56')
  })

  it('rejects a subsection count below 9', () => {
    const copy = corruptTechniques((ts) => {
      uniqueRectangle(ts).subsections?.splice(0, 1)
    })
    expect(() => validateTechniques(copy)).toThrow('Expected 9 subsection slugs, found 8')
  })

  it('rejects an empty techniques array', () => {
    expect(() => assertTechniqueCollectionSizes([])).toThrow('Expected 57 techniques, found 0')
  })
})

describe('the flattened slug identifiers', () => {
  // The plan's "66 unique identifiers" does not hold verbatim: the
  // unique-rectangle family's base subsection reuses its parent's slug, so the
  // 66 flattened identifiers have 65 distinct values. The uniqueness invariants
  // that actually hold are asserted by assertSlugsUnique.
  it('flattens to 66 identifiers of which 65 are distinct', () => {
    const identifiers = [
      ...TECHNIQUES.map((t) => t.slug),
      ...TECHNIQUES.flatMap((t) => (t.subsections ?? []).map((s) => s.slug)),
    ]
    expect(identifiers).toHaveLength(66)
    expect(new Set(identifiers)).toHaveLength(65)
  })
})

describe('assertTechniqueFieldsPresent', () => {
  it('rejects an empty technique description', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.description = '   '
    })
    expect(() => validateTechniques(copy)).toThrow(
      "Technique 'naked-single' has an empty description",
    )
  })

  it('rejects an empty subsection example', () => {
    const copy = corruptTechniques((ts) => {
      const subsections = uniqueRectangle(ts).subsections!
      subsections[0]!.example = ''
    })
    expect(() => validateTechniques(copy)).toThrow(
      "Subsection 'unique-rectangle' of 'unique-rectangle' has an empty example",
    )
  })

  it('rejects an empty techniques array', () => {
    expect(() => assertTechniqueFieldsPresent([])).toThrow('Expected a non-empty techniques array')
  })
})

describe('assertSlugsUnique', () => {
  it('rejects two techniques sharing a slug', () => {
    const copy = corruptTechniques((ts) => {
      ts[1]!.slug = ts[0]!.slug
    })
    expect(() => validateTechniques(copy)).toThrow("Duplicate technique slug 'naked-single'")
  })

  it('rejects two subsections sharing a slug', () => {
    const copy = corruptTechniques((ts) => {
      const subsections = uniqueRectangle(ts).subsections!
      subsections[1]!.slug = subsections[0]!.slug
    })
    expect(() => validateTechniques(copy)).toThrow("Duplicate subsection slug 'unique-rectangle'")
  })

  it('rejects a subsection slug colliding with another technique slug', () => {
    const copy = corruptTechniques((ts) => {
      const subsections = uniqueRectangle(ts).subsections!
      subsections[0]!.slug = 'naked-single'
    })
    expect(() => validateTechniques(copy)).toThrow(
      "Subsection slug 'naked-single' of 'unique-rectangle' collides with technique slug 'naked-single'",
    )
  })

  it('rejects an empty techniques array', () => {
    expect(() => assertSlugsUnique([])).toThrow('Expected a non-empty techniques array')
  })
})

describe('assertTiersValid', () => {
  it('rejects a tier outside the declared union', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.tier = 'Impossible' as TechniqueInfo['tier']
    })
    expect(() => validateTechniques(copy)).toThrow(
      "Technique 'naked-single' has unknown tier 'Impossible'",
    )
  })

  it('rejects an empty techniques array', () => {
    expect(() => assertTiersValid([])).toThrow('Expected a non-empty techniques array')
  })
})

describe('assertRelatedTechniquesResolve', () => {
  it('rejects a relatedTechniques entry that resolves to no slug', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.relatedTechniques = ['does-not-exist']
    })
    expect(() => validateTechniques(copy)).toThrow(
      "Technique 'naked-single' references unknown related technique 'does-not-exist'",
    )
  })

  it('rejects an empty techniques array', () => {
    expect(() => assertRelatedTechniquesResolve([])).toThrow(
      'Expected a non-empty techniques array',
    )
  })
})

describe('assertDiagramCellsValid', () => {
  it('rejects a row above 8', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.diagram = { cells: [{ row: 9, col: 0, value: 1 }] }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' has a cell with row 9 outside 0-8",
    )
  })

  it('rejects a negative row', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.diagram = { cells: [{ row: -1, col: 0, value: 1 }] }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' has a cell with row -1 outside 0-8",
    )
  })

  it('rejects a col above 8', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.diagram = { cells: [{ row: 0, col: 9, value: 1 }] }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' has a cell with col 9 outside 0-8",
    )
  })

  it('rejects a value below 1', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.diagram = { cells: [{ row: 0, col: 0, value: 0 }] }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' has a cell with value 0 outside 1-9",
    )
  })

  it('rejects a value above 9', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.diagram = { cells: [{ row: 0, col: 0, value: 10 }] }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' has a cell with value 10 outside 1-9",
    )
  })

  it('rejects a candidates digit outside 1-9', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.diagram = { cells: [{ row: 0, col: 0, candidates: [2, 10] }] }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' has a cell with candidates digit 10 outside 1-9",
    )
  })

  it('rejects an eliminatedCandidates digit outside 1-9', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.diagram = { cells: [{ row: 0, col: 0, candidates: [2], eliminatedCandidates: [0] }] }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' has a cell with eliminatedCandidates digit 0 outside 1-9",
    )
  })

  it('rejects a diagram with an empty cells array', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.diagram = { cells: [] }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' has an empty cells array",
    )
  })

  it('rejects an animated step with an empty cells array', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.animatedDiagram = {
        steps: [
          { description: 'a', cells: [] },
          { description: 'b', cells: [{ row: 0, col: 0, value: 1 }] },
        ],
      }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "technique 'naked-single' step 0 has an empty cells array",
    )
  })

  it('rejects an empty techniques array', () => {
    expect(() => assertDiagramCellsValid([])).toThrow('Expected a non-empty techniques array')
  })

  it('accepts cells at every boundary', () => {
    expect(() =>
      assertDiagramCellsValid([
        {
          slug: 'boundary',
          title: 'boundary',
          tier: 'Simple',
          description: 'boundary',
          example: 'boundary',
          diagram: {
            cells: [
              { row: 0, col: 0, value: 1, candidates: [1], eliminatedCandidates: [9] },
              { row: 8, col: 8, value: 9, candidates: [9] },
            ],
          },
        },
      ]),
    ).not.toThrow()
  })
})

describe('assertAnimationStepsValid', () => {
  it('rejects an animated diagram with fewer than two steps', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.animatedDiagram = {
        steps: [{ description: 'only step', cells: [{ row: 0, col: 0, value: 1 }] }],
      }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "Animated diagram for 'naked-single' has 1 steps, expected at least 2",
    )
  })

  it('rejects an animated step with an empty description', () => {
    const copy = corruptTechniques((ts) => {
      ts[0]!.animatedDiagram = {
        steps: [
          { description: 'a', cells: [{ row: 0, col: 0, value: 1 }] },
          { description: '   ', cells: [{ row: 0, col: 1, value: 2 }] },
        ],
      }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "Animated diagram for 'naked-single' step 1 has an empty description",
    )
  })

  it('rejects an empty techniques array', () => {
    expect(() => assertAnimationStepsValid([])).toThrow('Expected a non-empty techniques array')
  })

  it('accepts an animated diagram with exactly two steps', () => {
    expect(() =>
      assertAnimationStepsValid([
        {
          slug: 'minimal',
          title: 'minimal',
          tier: 'Simple',
          description: 'minimal',
          example: 'minimal',
          animatedDiagram: {
            steps: [
              { description: 'a', cells: [{ row: 0, col: 0, value: 1 }] },
              { description: 'b', cells: [{ row: 0, col: 1, value: 2 }] },
            ],
          },
        },
      ]),
    ).not.toThrow()
  })
})

describe('assertStepsDoNotShareCells', () => {
  it('rejects two steps sharing one cell object', () => {
    const copy = corruptTechniques((ts) => {
      const shared = { row: 0, col: 0, value: 1 }
      ts[0]!.animatedDiagram = {
        steps: [
          { description: 'a', cells: [shared] },
          { description: 'b', cells: [shared] },
        ],
      }
    })
    expect(() => validateTechniques(copy)).toThrow(
      "Animated diagram for 'naked-single' shares 1 cell object(s) between steps",
    )
  })

  it('rejects an empty techniques array', () => {
    expect(() => assertStepsDoNotShareCells([])).toThrow('Expected a non-empty techniques array')
  })

  it('accepts steps built from fresh cell objects', () => {
    expect(() =>
      assertStepsDoNotShareCells([
        {
          slug: 'fresh',
          title: 'fresh',
          tier: 'Simple',
          description: 'fresh',
          example: 'fresh',
          animatedDiagram: {
            steps: [
              { description: 'a', cells: [{ row: 0, col: 0, value: 1 }] },
              { description: 'b', cells: [{ row: 0, col: 0, value: 1 }] },
            ],
          },
        },
      ]),
    ).not.toThrow()
  })
})

describe('assertGlossaryCollectionSize', () => {
  it('rejects a glossary count below 60', () => {
    const copy = corruptGlossary((g) => {
      g.splice(0, 1)
    })
    expect(() => validateGlossary(copy)).toThrow('Expected 60 glossary terms, found 59')
  })

  it('rejects an empty glossary array', () => {
    expect(() => assertGlossaryCollectionSize([])).toThrow('Expected 60 glossary terms, found 0')
  })
})

describe('assertGlossaryDefinitionsPresent', () => {
  it('rejects an empty definition', () => {
    const copy = corruptGlossary((g) => {
      g[0]!.definition = ''
    })
    expect(() => validateGlossary(copy)).toThrow(
      "Glossary term 'Candidate' has an empty definition",
    )
  })

  it('rejects an empty glossary array', () => {
    expect(() => assertGlossaryDefinitionsPresent([])).toThrow(
      'Expected a non-empty glossary array',
    )
  })
})

describe('assertGlossaryTermsUnique', () => {
  it('rejects two terms colliding case-insensitively', () => {
    const copy = corruptGlossary((g) => {
      g[1]!.term = 'candidate'
    })
    expect(() => validateGlossary(copy)).toThrow(
      "Glossary terms 'Candidate' and 'candidate' collide case-insensitively",
    )
  })

  it('rejects an empty glossary array', () => {
    expect(() => assertGlossaryTermsUnique([])).toThrow('Expected a non-empty glossary array')
  })
})

describe('assertGlossaryRelatedTermsWellFormed', () => {
  it('rejects an empty relatedTerms entry', () => {
    const copy = corruptGlossary((g) => {
      g[0]!.relatedTerms = ['Candidate', '   ']
    })
    expect(() => validateGlossary(copy)).toThrow(
      "Glossary term 'Candidate' has an empty relatedTerms entry",
    )
  })

  it('rejects an empty glossary array', () => {
    expect(() => assertGlossaryRelatedTermsWellFormed([])).toThrow(
      'Expected a non-empty glossary array',
    )
  })
})

describe('validateTechniqueSchema', () => {
  it('rejects empty datasets', () => {
    expect(() => validateTechniqueSchema([], [])).toThrow('Expected 57 techniques, found 0')
  })
})
