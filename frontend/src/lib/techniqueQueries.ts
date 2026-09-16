// Query helpers over the TECHNIQUES dataset, split out of techniques.ts so the
// lookup logic is mutation-tested while the data tables stay excluded.
import { TECHNIQUES, type TechniqueInfo } from './techniques'

// Helper to find a technique by slug (also checks subsection slugs)
export function getTechniqueBySlug(slug: string): TechniqueInfo | undefined {
  // First try direct match
  const direct = TECHNIQUES.find((t) => t.slug === slug)
  if (direct) return direct

  // Then check subsections
  return TECHNIQUES.find((t) => t.subsections?.some((s) => s.slug === slug))
}

// Get display techniques (excludes Auto tier)
export function getDisplayTechniques(): TechniqueInfo[] {
  return TECHNIQUES.filter((t) => t.tier !== 'Auto')
}

// Get techniques by tier
export function getTechniquesByTier(
  tier: 'Simple' | 'Medium' | 'Hard' | 'NotImplemented',
): TechniqueInfo[] {
  return TECHNIQUES.filter((t) => t.tier === tier)
}

// Get navigable techniques (excludes Auto and NotImplemented)
export function getNavigableTechniques(): TechniqueInfo[] {
  return TECHNIQUES.filter((t) => t.tier !== 'Auto' && t.tier !== 'NotImplemented')
}

// Get previous technique in learning order (returns undefined if first)
export function getPreviousTechnique(slug: string): TechniqueInfo | undefined {
  const techniques = getNavigableTechniques()
  const index = techniques.findIndex((t) => t.slug === slug)
  if (index <= 0) return undefined
  return techniques[index - 1]
}

// Get next technique in learning order (returns undefined if last)
export function getNextTechnique(slug: string): TechniqueInfo | undefined {
  const techniques = getNavigableTechniques()
  const index = techniques.findIndex((t) => t.slug === slug)
  if (index === -1 || index >= techniques.length - 1) return undefined
  return techniques[index + 1]
}
