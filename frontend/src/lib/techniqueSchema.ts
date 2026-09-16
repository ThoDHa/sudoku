// Executable schema for the declarative tables in techniques.ts. Every rule is
// a validator that takes the dataset as a parameter and throws a message naming
// the offending entry, so the data rules are falsified by negative fixtures and
// mutation-scored here instead of trusted as inert literals.
import type { DiagramCell, GlossaryTerm, TechniqueInfo } from './techniques'

const EXPECTED_TECHNIQUE_COUNT = 57
const EXPECTED_SUBSECTION_COUNT = 9
const EXPECTED_GLOSSARY_COUNT = 60
const MIN_ANIMATION_STEPS = 2
const ROW_COL_MAX = 8
const DIGIT_MIN = 1
const DIGIT_MAX = 9
const TECHNIQUE_TIERS = ['Simple', 'Medium', 'Hard', 'Extreme', 'Auto', 'NotImplemented'] as const

function isDigitInRange(digit: number): boolean {
  return digit >= DIGIT_MIN && digit <= DIGIT_MAX
}

function assertNonEmpty(items: readonly unknown[], label: string): void {
  if (items.length === 0) {
    throw new Error(`Expected a non-empty ${label} array`)
  }
}

function assertNoDuplicates(values: string[], message: (duplicate: string) => string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(message(value))
    }
    seen.add(value)
  }
}

function forEachDefined<T>(items: readonly T[] | undefined, visit: (item: T) => void): void {
  if (items === undefined) {
    return
  }
  for (const item of items) {
    visit(item)
  }
}

export function assertTechniqueCollectionSizes(techniques: TechniqueInfo[]): void {
  if (techniques.length !== EXPECTED_TECHNIQUE_COUNT) {
    throw new Error(`Expected ${EXPECTED_TECHNIQUE_COUNT} techniques, found ${techniques.length}`)
  }
  let subsectionCount = 0
  for (const technique of techniques) {
    subsectionCount += technique.subsections?.length ?? 0
  }
  if (subsectionCount !== EXPECTED_SUBSECTION_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_SUBSECTION_COUNT} subsection slugs, found ${subsectionCount}`,
    )
  }
}

export function assertTechniqueFieldsPresent(techniques: TechniqueInfo[]): void {
  assertNonEmpty(techniques, 'techniques')
  for (const technique of techniques) {
    for (const field of ['slug', 'title', 'description', 'example'] as const) {
      if (!technique[field].trim()) {
        throw new Error(`Technique '${technique.slug}' has an empty ${field}`)
      }
    }
    for (const subsection of technique.subsections ?? []) {
      for (const field of ['slug', 'title', 'description', 'example'] as const) {
        if (!subsection[field].trim()) {
          throw new Error(
            `Subsection '${subsection.slug}' of '${technique.slug}' has an empty ${field}`,
          )
        }
      }
    }
  }
}

export function assertSlugsUnique(techniques: TechniqueInfo[]): void {
  assertNonEmpty(techniques, 'techniques')
  const techniqueSlugs = techniques.map((technique) => technique.slug)
  assertNoDuplicates(techniqueSlugs, (duplicate) => `Duplicate technique slug '${duplicate}'`)
  const subsectionSlugs: string[] = []
  for (const technique of techniques) {
    forEachDefined(technique.subsections, (subsection) => {
      subsectionSlugs.push(subsection.slug)
    })
  }
  assertNonEmpty(subsectionSlugs, 'subsection slug')
  assertNoDuplicates(subsectionSlugs, (duplicate) => `Duplicate subsection slug '${duplicate}'`)
  // A subsection may reuse its own parent's slug (the base-section pattern);
  // any other collision would make slug lookups ambiguous.
  const techniqueSlugSet = new Set(techniqueSlugs)
  for (const technique of techniques) {
    forEachDefined(technique.subsections, (subsection) => {
      if (subsection.slug !== technique.slug && techniqueSlugSet.has(subsection.slug)) {
        throw new Error(
          `Subsection slug '${subsection.slug}' of '${technique.slug}' collides with technique slug '${subsection.slug}'`,
        )
      }
    })
  }
}

export function assertTiersValid(techniques: TechniqueInfo[]): void {
  assertNonEmpty(techniques, 'techniques')
  for (const technique of techniques) {
    if (!TECHNIQUE_TIERS.includes(technique.tier)) {
      throw new Error(`Technique '${technique.slug}' has unknown tier '${technique.tier}'`)
    }
  }
}

export function assertRelatedTechniquesResolve(techniques: TechniqueInfo[]): void {
  assertNonEmpty(techniques, 'techniques')
  const knownSlugs = new Set<string>()
  for (const technique of techniques) {
    knownSlugs.add(technique.slug)
    forEachDefined(technique.subsections, (subsection) => {
      knownSlugs.add(subsection.slug)
    })
  }
  for (const technique of techniques) {
    for (const related of technique.relatedTechniques ?? []) {
      if (!knownSlugs.has(related)) {
        throw new Error(
          `Technique '${technique.slug}' references unknown related technique '${related}'`,
        )
      }
    }
  }
}

function assertCellsValid(cells: DiagramCell[], owner: string): void {
  if (cells.length === 0) {
    throw new Error(`${owner} has an empty cells array`)
  }
  for (const cell of cells) {
    if (cell.row < 0 || cell.row > ROW_COL_MAX) {
      throw new Error(`${owner} has a cell with row ${cell.row} outside 0-${ROW_COL_MAX}`)
    }
    if (cell.col < 0 || cell.col > ROW_COL_MAX) {
      throw new Error(`${owner} has a cell with col ${cell.col} outside 0-${ROW_COL_MAX}`)
    }
    if (cell.value !== undefined && !isDigitInRange(cell.value)) {
      throw new Error(
        `${owner} has a cell with value ${cell.value} outside ${DIGIT_MIN}-${DIGIT_MAX}`,
      )
    }
    assertDigitsValid(cell.candidates, 'candidates', owner)
    assertDigitsValid(cell.eliminatedCandidates, 'eliminatedCandidates', owner)
  }
}

function assertDigitsValid(digits: number[] | undefined, field: string, owner: string): void {
  if (digits === undefined) {
    return
  }
  for (const digit of digits) {
    if (!isDigitInRange(digit)) {
      throw new Error(
        `${owner} has a cell with ${field} digit ${digit} outside ${DIGIT_MIN}-${DIGIT_MAX}`,
      )
    }
  }
}

export function assertDiagramCellsValid(techniques: TechniqueInfo[]): void {
  assertNonEmpty(techniques, 'techniques')
  for (const technique of techniques) {
    if (technique.diagram) {
      assertCellsValid(technique.diagram.cells, `technique '${technique.slug}'`)
    }
    forEachDefined(technique.subsections, (subsection) => {
      if (subsection.diagram) {
        assertCellsValid(subsection.diagram.cells, `subsection '${subsection.slug}'`)
      }
    })
    if (technique.animatedDiagram) {
      for (const [index, animationStep] of technique.animatedDiagram.steps.entries()) {
        assertCellsValid(animationStep.cells, `technique '${technique.slug}' step ${index}`)
      }
    }
  }
}

export function assertAnimationStepsValid(techniques: TechniqueInfo[]): void {
  assertNonEmpty(techniques, 'techniques')
  for (const technique of techniques) {
    const animated = technique.animatedDiagram
    if (!animated) {
      continue
    }
    if (animated.steps.length < MIN_ANIMATION_STEPS) {
      throw new Error(
        `Animated diagram for '${technique.slug}' has ${animated.steps.length} steps, expected at least ${MIN_ANIMATION_STEPS}`,
      )
    }
    for (const [index, animationStep] of animated.steps.entries()) {
      if (!animationStep.description.trim()) {
        throw new Error(
          `Animated diagram for '${technique.slug}' step ${index} has an empty description`,
        )
      }
    }
  }
}

export function assertStepsDoNotShareCells(techniques: TechniqueInfo[]): void {
  assertNonEmpty(techniques, 'techniques')
  for (const technique of techniques) {
    const animated = technique.animatedDiagram
    if (!animated) {
      continue
    }
    const uniqueCells = new Set<DiagramCell>()
    let totalCells = 0
    for (const step of animated.steps) {
      for (const cell of step.cells) {
        uniqueCells.add(cell)
        totalCells += 1
      }
    }
    if (uniqueCells.size !== totalCells) {
      throw new Error(
        `Animated diagram for '${technique.slug}' shares ${totalCells - uniqueCells.size} cell object(s) between steps`,
      )
    }
  }
}

export function assertGlossaryCollectionSize(glossary: GlossaryTerm[]): void {
  if (glossary.length !== EXPECTED_GLOSSARY_COUNT) {
    throw new Error(`Expected ${EXPECTED_GLOSSARY_COUNT} glossary terms, found ${glossary.length}`)
  }
}

export function assertGlossaryDefinitionsPresent(glossary: GlossaryTerm[]): void {
  assertNonEmpty(glossary, 'glossary')
  for (const entry of glossary) {
    if (!entry.definition.trim()) {
      throw new Error(`Glossary term '${entry.term}' has an empty definition`)
    }
  }
}

export function assertGlossaryTermsUnique(glossary: GlossaryTerm[]): void {
  assertNonEmpty(glossary, 'glossary')
  const seen = new Map<string, string>()
  for (const entry of glossary) {
    const key = entry.term.toLowerCase()
    const existing = seen.get(key)
    if (existing !== undefined) {
      throw new Error(`Glossary terms '${existing}' and '${entry.term}' collide case-insensitively`)
    }
    seen.set(key, entry.term)
  }
}

export function assertGlossaryRelatedTermsWellFormed(glossary: GlossaryTerm[]): void {
  assertNonEmpty(glossary, 'glossary')
  for (const entry of glossary) {
    forEachDefined(entry.relatedTerms, (related) => {
      if (!related.trim()) {
        throw new Error(`Glossary term '${entry.term}' has an empty relatedTerms entry`)
      }
    })
  }
}

export function validateTechniques(techniques: TechniqueInfo[]): void {
  assertTechniqueCollectionSizes(techniques)
  assertTechniqueFieldsPresent(techniques)
  assertSlugsUnique(techniques)
  assertTiersValid(techniques)
  assertRelatedTechniquesResolve(techniques)
  assertDiagramCellsValid(techniques)
  assertAnimationStepsValid(techniques)
  assertStepsDoNotShareCells(techniques)
}

export function validateGlossary(glossary: GlossaryTerm[]): void {
  assertGlossaryCollectionSize(glossary)
  assertGlossaryDefinitionsPresent(glossary)
  assertGlossaryTermsUnique(glossary)
  assertGlossaryRelatedTermsWellFormed(glossary)
}

export function validateTechniqueSchema(
  techniques: TechniqueInfo[],
  glossary: GlossaryTerm[],
): void {
  validateTechniques(techniques)
  validateGlossary(glossary)
}
