import { describe, it, expect } from 'vitest'
import {
  COLOR_THEMES,
  SPEED_OPTIONS,
  TECHNIQUE_COLORS,
  TIER_COLORS,
  createGameRoute,
  generatePuzzleSeed,
  getTechniqueColor,
  getTierColor,
} from './constants'

describe('SPEED_OPTIONS', () => {
  it('lists every auto-solve speed with its exact icon paths, label and skip rect', () => {
    expect(SPEED_OPTIONS).toEqual([
      { speed: 'step', iconPaths: ['M6 4h4v16H6zM14 4h4v16h-4z'], label: 'Step' },
      { speed: 'slow', iconPaths: ['M8 5v14l11-7z'], label: '1x' },
      { speed: 'normal', iconPaths: ['M4 5v14l8-7z', 'M12 5v14l8-7z'], label: '2x' },
      { speed: 'fast', iconPaths: ['M2 5v14l6-7z', 'M9 5v14l6-7z', 'M16 5v14l6-7z'], label: '3x' },
      {
        speed: 'instant',
        iconPaths: ['M2 5v14l5-7z', 'M8 5v14l5-7z', 'M14 5v14l5-7z'],
        hasRect: true,
        label: 'Skip',
      },
    ])
  })
})

describe('COLOR_THEMES', () => {
  it('lists every community theme with its exact key, swatch color and label', () => {
    expect(COLOR_THEMES).toEqual([
      { key: 'tokyonight', color: 'bg-[#7aa2f7]', label: 'Tokyo Night' },
      { key: 'dracula', color: 'bg-[#bd93f9]', label: 'Dracula' },
      { key: 'nord', color: 'bg-[#88c0d0]', label: 'Nord' },
      { key: 'catppuccin', color: 'bg-[#cba6f7]', label: 'Catppuccin' },
      { key: 'gruvbox', color: 'bg-[#fabd2f]', label: 'Gruvbox' },
      { key: 'rosepine', color: 'bg-[#ebbcba]', label: 'Rosé Pine' },
      { key: 'solarized', color: 'bg-[#2aa198]', label: 'Solarized' },
      { key: 'onedark', color: 'bg-[#61afef]', label: 'One Dark' },
    ])
  })
})

describe('TECHNIQUE_COLORS', () => {
  it('assigns an exact badge class to every technique, including keys the function tests never name', () => {
    expect(TECHNIQUE_COLORS).toEqual({
      'Naked Single': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'Hidden Single': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'Pointing Pair': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'Box-Line Reduction': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'Naked Pair': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'Hidden Pair': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'Naked Triple': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'Hidden Triple': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'Naked Quad': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'Hidden Quad': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      'X-Wing': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      Swordfish: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      Jellyfish: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'XY-Wing': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      'W-Wing': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      'Simple Coloring': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      Skyscraper: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      'X-Chain': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      'XY-Chain': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      'Unique Rectangle': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      BUG: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'Finned X-Wing': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'Empty Rectangle': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
    })
  })
})

describe('getTierColor', () => {
  it('maps each known tier to its exact badge classes, case-insensitively', () => {
    expect(getTierColor('Simple')).toBe(
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    )
    expect(getTierColor('simple')).toBe(
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    )
    expect(getTierColor('Medium')).toBe(
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    )
    expect(getTierColor('Hard')).toBe('bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200')
    expect(getTierColor('NotImplemented')).toBe(
      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    )
  })

  it('falls back to the auto badge for an unknown tier', () => {
    expect(getTierColor('Nonsense')).toBe(
      'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    )
  })

  it('returns an empty string when neither the tier nor the auto badge resolves', () => {
    const autoBadge = TIER_COLORS['auto']
    delete TIER_COLORS['auto']
    try {
      expect(getTierColor('Nonsense')).toBe('')
    } finally {
      if (autoBadge !== undefined) {
        TIER_COLORS['auto'] = autoBadge
      }
    }
  })
})

describe('getTechniqueColor', () => {
  it('maps known techniques to their exact badge classes', () => {
    expect(getTechniqueColor('Naked Single')).toBe(
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    )
    expect(getTechniqueColor('Hidden Single')).toBe(
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    )
    expect(getTechniqueColor('Pointing Pair')).toBe(
      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    )
    expect(getTechniqueColor('Box-Line Reduction')).toBe(
      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    )
    expect(getTechniqueColor('X-Wing')).toBe(
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    )
    expect(getTechniqueColor('Unique Rectangle')).toBe(
      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    )
  })

  it('falls back to the neutral gray badge for an unknown technique', () => {
    expect(getTechniqueColor('Mystery Technique')).toBe(
      'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    )
  })
})

describe('generatePuzzleSeed', () => {
  it('produces a P-prefixed numeric seed', () => {
    expect(generatePuzzleSeed()).toMatch(/^P\d+$/)
  })
})

describe('createGameRoute', () => {
  it('builds a seeded game route carrying the difficulty as a query parameter', () => {
    expect(createGameRoute('easy')).toMatch(/^\/P\d+\?d=easy$/)
    expect(createGameRoute('extreme')).toMatch(/^\/P\d+\?d=extreme$/)
  })
})
