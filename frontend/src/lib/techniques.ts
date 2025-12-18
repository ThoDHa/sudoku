// Shared technique data used by TechniqueModal and TechniquesListModal

// Diagram data structure
export interface DiagramCell {
  row: number
  col: number
  value?: number
  candidates?: number[]
  highlight?: 'primary' | 'secondary' | 'elimination'
  eliminatedCandidates?: number[]
}

export interface TechniqueDiagram {
  cells: DiagramCell[]
  highlightRows?: number[]
  highlightCols?: number[]
}

// Animation step for animated diagrams
export interface DiagramAnimationStep {
  cells: DiagramCell[]
  description: string  // Brief text explaining this step
}

// Animated diagram with multiple steps
export interface AnimatedTechniqueDiagram {
  steps: DiagramAnimationStep[]
  highlightRows?: number[]
  highlightCols?: number[]
}

// Subsection for techniques with multiple variations (e.g., Unique Rectangle types)
export interface TechniqueSubsection {
  title: string
  slug: string  // Used for backend technique matching (e.g., 'unique-rectangle-type-2')
  description: string
  example: string
  diagram?: TechniqueDiagram
}

export interface TechniqueInfo {
  slug: string
  title: string
  tier: 'Simple' | 'Medium' | 'Hard' | 'Extreme' | 'Auto' | 'NotImplemented'
  description: string
  example: string
  diagram?: TechniqueDiagram
  animatedDiagram?: AnimatedTechniqueDiagram  // Optional animated version
  relatedTechniques?: string[]
  subsections?: TechniqueSubsection[]  // For techniques with multiple variations
  // Computed/alias properties for backward compatibility with Technique.tsx
  name?: string       // alias for title
  summary?: string    // alias for description  
  explanation?: string // alias for description (longer form)
}

export const TECHNIQUES: TechniqueInfo[] = [
  {
    title: 'Naked Single',
    slug: 'naked-single',
    tier: 'Simple',
    description: 'A cell has only one candidate remaining after eliminating all digits that appear in its row, column, and box.',
    example: 'If a cell can only contain 7 (all other digits 1-6, 8-9 are already in its row, column, or box), place 7 there.',
    diagram: {
      cells: [
        { row: 0, col: 0, value: 1 },
        { row: 0, col: 1, value: 2 },
        { row: 0, col: 2, value: 3 },
        { row: 0, col: 3, value: 4 },
        { row: 0, col: 4, candidates: [7], highlight: 'primary' },
        { row: 0, col: 5, value: 5 },
        { row: 0, col: 6, value: 6 },
        { row: 0, col: 7, value: 8 },
        { row: 0, col: 8, value: 9 },
      ]
    },
    animatedDiagram: {
      steps: [
        {
          description: 'Start with all candidates in the cell',
          cells: [
            { row: 0, col: 0, value: 1 },
            { row: 0, col: 1, value: 2 },
            { row: 0, col: 2, value: 3 },
            { row: 0, col: 3, value: 4 },
            { row: 0, col: 4, candidates: [1, 2, 3, 4, 5, 6, 7, 8, 9], highlight: 'primary' },
            { row: 0, col: 5, value: 5 },
            { row: 0, col: 6, value: 6 },
            { row: 0, col: 7, value: 8 },
            { row: 0, col: 8, value: 9 },
          ]
        },
        {
          description: 'Eliminate digits already in the row (1-6, 8-9)',
          cells: [
            { row: 0, col: 0, value: 1, highlight: 'secondary' },
            { row: 0, col: 1, value: 2, highlight: 'secondary' },
            { row: 0, col: 2, value: 3, highlight: 'secondary' },
            { row: 0, col: 3, value: 4, highlight: 'secondary' },
            { row: 0, col: 4, candidates: [1, 2, 3, 4, 5, 6, 7, 8, 9], eliminatedCandidates: [1, 2, 3, 4, 5, 6, 8, 9], highlight: 'primary' },
            { row: 0, col: 5, value: 5, highlight: 'secondary' },
            { row: 0, col: 6, value: 6, highlight: 'secondary' },
            { row: 0, col: 7, value: 8, highlight: 'secondary' },
            { row: 0, col: 8, value: 9, highlight: 'secondary' },
          ]
        },
        {
          description: 'Only 7 remains - place it!',
          cells: [
            { row: 0, col: 0, value: 1 },
            { row: 0, col: 1, value: 2 },
            { row: 0, col: 2, value: 3 },
            { row: 0, col: 3, value: 4 },
            { row: 0, col: 4, value: 7, highlight: 'primary' },
            { row: 0, col: 5, value: 5 },
            { row: 0, col: 6, value: 6 },
            { row: 0, col: 7, value: 8 },
            { row: 0, col: 8, value: 9 },
          ]
        }
      ]
    }
  },
  {
    title: 'Hidden Single',
    slug: 'hidden-single',
    tier: 'Simple',
    description: 'A digit can only go in one cell within a row, column, or box, even though that cell may have other candidates.',
    example: 'If 5 can only appear in one cell of row 3 (even if that cell also shows 3,5,7 as candidates), place 5 there.',
    diagram: {
      cells: [
        { row: 0, col: 0, candidates: [1, 2], highlight: 'secondary' },
        { row: 0, col: 1, candidates: [2, 3], highlight: 'secondary' },
        { row: 0, col: 2, candidates: [3, 5, 7], highlight: 'primary' },
        { row: 1, col: 0, value: 6 },
        { row: 1, col: 1, candidates: [1, 4], highlight: 'secondary' },
        { row: 1, col: 2, value: 8 },
        { row: 2, col: 0, value: 9 },
        { row: 2, col: 1, candidates: [1, 4, 7], highlight: 'secondary' },
        { row: 2, col: 2, candidates: [3, 7], highlight: 'secondary' },
      ]
    },
    animatedDiagram: {
      steps: [
        {
          description: 'Look at Box 1 - where can 5 go?',
          cells: [
            { row: 0, col: 0, candidates: [1, 2], highlight: 'secondary' },
            { row: 0, col: 1, candidates: [2, 3], highlight: 'secondary' },
            { row: 0, col: 2, candidates: [3, 5, 7], highlight: 'secondary' },
            { row: 1, col: 0, value: 6 },
            { row: 1, col: 1, candidates: [1, 4], highlight: 'secondary' },
            { row: 1, col: 2, value: 8 },
            { row: 2, col: 0, value: 9 },
            { row: 2, col: 1, candidates: [1, 4, 7], highlight: 'secondary' },
            { row: 2, col: 2, candidates: [3, 7], highlight: 'secondary' },
          ]
        },
        {
          description: 'Scan all cells in the box for candidate 5',
          cells: [
            { row: 0, col: 0, candidates: [1, 2] },
            { row: 0, col: 1, candidates: [2, 3] },
            { row: 0, col: 2, candidates: [3, 5, 7], highlight: 'primary' },
            { row: 1, col: 0, value: 6 },
            { row: 1, col: 1, candidates: [1, 4] },
            { row: 1, col: 2, value: 8 },
            { row: 2, col: 0, value: 9 },
            { row: 2, col: 1, candidates: [1, 4, 7] },
            { row: 2, col: 2, candidates: [3, 7] },
          ]
        },
        {
          description: '5 can only go in R1C3 - place it!',
          cells: [
            { row: 0, col: 0, candidates: [1, 2] },
            { row: 0, col: 1, candidates: [2, 3] },
            { row: 0, col: 2, value: 5, highlight: 'primary' },
            { row: 1, col: 0, value: 6 },
            { row: 1, col: 1, candidates: [1, 4] },
            { row: 1, col: 2, value: 8 },
            { row: 2, col: 0, value: 9 },
            { row: 2, col: 1, candidates: [1, 4, 7] },
            { row: 2, col: 2, candidates: [3, 7] },
          ]
        }
      ]
    }
  },
  {
    title: 'Pointing Pair',
    slug: 'pointing-pair',
    tier: 'Simple',
    description: 'When a candidate in a box is restricted to a single row or column, it can be eliminated from that row/column outside the box.',
    example: 'If 4 only appears in the top row of box 1, eliminate 4 from the rest of row 1 (outside box 1).',
    diagram: {
      cells: [
        { row: 0, col: 0, candidates: [1, 4], highlight: 'primary' },
        { row: 0, col: 1, candidates: [2, 4], highlight: 'primary' },
        { row: 0, col: 2, value: 3 },
        { row: 0, col: 3, candidates: [4, 5, 6], highlight: 'elimination', eliminatedCandidates: [4] },
        { row: 0, col: 4, value: 7 },
        { row: 0, col: 5, candidates: [4, 8], highlight: 'elimination', eliminatedCandidates: [4] },
        { row: 0, col: 6, value: 9 },
        { row: 1, col: 0, candidates: [1, 2] },
        { row: 1, col: 1, value: 5 },
        { row: 2, col: 0, value: 6 },
        { row: 2, col: 1, candidates: [2, 8] },
      ]
    }
  },
  {
    title: 'Box-Line Reduction',
    slug: 'box-line-reduction',
    tier: 'Simple',
    description: 'When a candidate in a row or column is restricted to a single box, it can be eliminated from the rest of that box.',
    example: 'If 6 in row 2 only appears within box 1, eliminate 6 from the rest of box 1 (cells not in row 2).',
    diagram: {
      cells: [
        { row: 2, col: 0, candidates: [1, 6], highlight: 'primary' },
        { row: 2, col: 1, candidates: [2, 6], highlight: 'primary' },
        { row: 2, col: 2, value: 3 },
        { row: 2, col: 3, value: 4 },
        { row: 2, col: 4, value: 5 },
        { row: 2, col: 5, candidates: [7, 8] },
        { row: 0, col: 0, candidates: [1, 6, 7], highlight: 'elimination', eliminatedCandidates: [6] },
        { row: 0, col: 1, value: 8 },
        { row: 0, col: 2, candidates: [6, 9], highlight: 'elimination', eliminatedCandidates: [6] },
        { row: 1, col: 0, value: 4 },
        { row: 1, col: 1, candidates: [5, 9] },
        { row: 1, col: 2, value: 2 },
      ]
    }
  },
  {
    title: 'Naked Pair',
    slug: 'naked-pair',
    tier: 'Simple',
    description: 'Two cells in the same unit (row, column, or box) that contain only the same two candidates. These digits can be eliminated from other cells in that unit.',
    example: 'If two cells in column 5 both have only {2,8}, eliminate 2 and 8 from all other cells in column 5.',
    relatedTechniques: ['naked-triple', 'naked-quad', 'hidden-pair'],
    diagram: {
      cells: [
        { row: 0, col: 4, candidates: [2, 8], highlight: 'primary' },
        { row: 1, col: 4, candidates: [1, 2, 5], highlight: 'elimination', eliminatedCandidates: [2] },
        { row: 2, col: 4, value: 3 },
        { row: 3, col: 4, candidates: [2, 8], highlight: 'primary' },
        { row: 4, col: 4, value: 4 },
        { row: 5, col: 4, candidates: [5, 8, 9], highlight: 'elimination', eliminatedCandidates: [8] },
        { row: 6, col: 4, value: 6 },
        { row: 7, col: 4, candidates: [1, 2, 8], highlight: 'elimination', eliminatedCandidates: [2, 8] },
        { row: 8, col: 4, value: 7 },
      ]
    }
  },
  {
    title: 'Hidden Pair',
    slug: 'hidden-pair',
    tier: 'Simple',
    description: 'Two candidates that only appear in two cells of a unit. All other candidates can be eliminated from those two cells.',
    example: 'If 3 and 7 only appear in cells R1C2 and R1C5 of row 1, remove all other candidates from those cells.',
    relatedTechniques: ['hidden-triple', 'naked-pair'],
    diagram: {
      cells: [
        { row: 0, col: 0, value: 1 },
        { row: 0, col: 1, candidates: [2, 3, 5, 7], highlight: 'primary', eliminatedCandidates: [2, 5] },
        { row: 0, col: 2, candidates: [2, 4] },
        { row: 0, col: 3, value: 6 },
        { row: 0, col: 4, candidates: [3, 4, 7, 9], highlight: 'primary', eliminatedCandidates: [4, 9] },
        { row: 0, col: 5, value: 8 },
        { row: 0, col: 6, candidates: [2, 4, 5] },
        { row: 0, col: 7, candidates: [2, 9] },
        { row: 0, col: 8, candidates: [4, 5, 9] },
      ]
    }
  },
  {
    title: 'Naked Triple',
    slug: 'naked-triple',
    tier: 'Medium',
    description: 'Three cells in the same unit containing only three candidates (in any combination). Those candidates can be eliminated from other cells in the unit.',
    example: 'Cells with {1,2}, {2,3}, and {1,3} form a naked triple. Eliminate 1, 2, 3 from other cells in that unit.',
    relatedTechniques: ['naked-pair', 'naked-quad', 'hidden-triple'],
    diagram: {
      cells: [
        { row: 0, col: 0, candidates: [1, 2], highlight: 'primary' },
        { row: 0, col: 1, candidates: [2, 3], highlight: 'primary' },
        { row: 0, col: 2, candidates: [1, 3], highlight: 'primary' },
        { row: 0, col: 3, candidates: [1, 4, 5], highlight: 'elimination', eliminatedCandidates: [1] },
        { row: 0, col: 4, value: 6 },
        { row: 0, col: 5, candidates: [2, 3, 7], highlight: 'elimination', eliminatedCandidates: [2, 3] },
        { row: 0, col: 6, value: 8 },
        { row: 0, col: 7, candidates: [1, 2, 9], highlight: 'elimination', eliminatedCandidates: [1, 2] },
        { row: 0, col: 8, value: 4 },
      ]
    }
  },
  {
    title: 'Hidden Triple',
    slug: 'hidden-triple',
    tier: 'Medium',
    description: 'Three candidates that only appear in three cells of a unit. All other candidates can be eliminated from those three cells.',
    example: 'If 2, 5, and 9 only appear in three specific cells of box 4, remove all other candidates from those cells.',
    relatedTechniques: ['hidden-pair', 'naked-triple'],
    diagram: {
      cells: [
        { row: 3, col: 0, candidates: [2, 4, 5], highlight: 'primary', eliminatedCandidates: [4] },
        { row: 3, col: 1, value: 1 },
        { row: 3, col: 2, candidates: [5, 7, 9], highlight: 'primary', eliminatedCandidates: [7] },
        { row: 4, col: 0, value: 3 },
        { row: 4, col: 1, candidates: [4, 6, 7] },
        { row: 4, col: 2, value: 8 },
        { row: 5, col: 0, candidates: [2, 6, 9], highlight: 'primary', eliminatedCandidates: [6] },
        { row: 5, col: 1, candidates: [4, 6] },
        { row: 5, col: 2, candidates: [4, 7] },
      ]
    }
  },
  {
    title: 'Naked Quad',
    slug: 'naked-quad',
    tier: 'Medium',
    description: 'Four cells in the same unit containing only four candidates. Those candidates can be eliminated from other cells in the unit.',
    example: 'Four cells with candidates from {1,2,5,7} form a naked quad. Eliminate 1, 2, 5, 7 from other cells in that unit.',
    relatedTechniques: ['naked-pair', 'naked-triple'],
    diagram: {
      cells: [
        { row: 0, col: 4, candidates: [1, 2], highlight: 'primary' },
        { row: 1, col: 4, candidates: [2, 5, 7], highlight: 'primary' },
        { row: 2, col: 4, value: 3 },
        { row: 3, col: 4, candidates: [1, 5], highlight: 'primary' },
        { row: 4, col: 4, candidates: [1, 7], highlight: 'primary' },
        { row: 5, col: 4, value: 4 },
        { row: 6, col: 4, candidates: [1, 6, 8], highlight: 'elimination', eliminatedCandidates: [1] },
        { row: 7, col: 4, value: 9 },
        { row: 8, col: 4, candidates: [2, 5, 6], highlight: 'elimination', eliminatedCandidates: [2, 5] },
      ]
    }
  },
  {
    title: 'Hidden Quad',
    slug: 'hidden-quad',
    tier: 'Medium',
    description: 'Four candidates that only appear in four cells of a unit. All other candidates can be eliminated from those four cells.',
    example: 'If 1, 4, 6, and 8 only appear in four specific cells of row 7, remove all other candidates from those cells.',
    relatedTechniques: ['hidden-triple'],
    diagram: {
      cells: [
        { row: 6, col: 0, candidates: [1, 3, 4], highlight: 'primary', eliminatedCandidates: [3] },
        { row: 6, col: 1, value: 2 },
        { row: 6, col: 2, candidates: [4, 5, 6], highlight: 'primary', eliminatedCandidates: [5] },
        { row: 6, col: 3, value: 7 },
        { row: 6, col: 4, candidates: [1, 6, 8], highlight: 'primary' },
        { row: 6, col: 5, value: 9 },
        { row: 6, col: 6, candidates: [3, 5] },
        { row: 6, col: 7, candidates: [4, 5, 8], highlight: 'primary', eliminatedCandidates: [5] },
        { row: 6, col: 8, candidates: [3, 5] },
      ]
    }
  },
  {
    title: 'X-Wing',
    slug: 'x-wing',
    tier: 'Medium',
    description: 'When a candidate appears in exactly two cells in each of two rows, and these cells are in the same two columns, the candidate can be eliminated from other cells in those columns.',
    example: 'If 3 appears only in columns 2 and 7 of both rows 1 and 5, eliminate 3 from columns 2 and 7 in other rows.',
    relatedTechniques: ['swordfish'],
    diagram: {
      cells: [
        { row: 1, col: 2, candidates: [1, 3], highlight: 'primary' },
        { row: 1, col: 7, candidates: [3, 5], highlight: 'primary' },
        { row: 5, col: 2, candidates: [3, 6], highlight: 'primary' },
        { row: 5, col: 7, candidates: [3, 9], highlight: 'primary' },
        { row: 0, col: 2, candidates: [2, 3, 4], highlight: 'elimination', eliminatedCandidates: [3] },
        { row: 3, col: 2, candidates: [3, 7], highlight: 'elimination', eliminatedCandidates: [3] },
        { row: 2, col: 7, candidates: [3, 8], highlight: 'elimination', eliminatedCandidates: [3] },
        { row: 7, col: 7, candidates: [1, 3], highlight: 'elimination', eliminatedCandidates: [3] },
      ]
    }
  },
  {
    title: 'XY-Wing',
    slug: 'xy-wing',
    tier: 'Medium',
    description: 'Three cells forming a "Y" pattern with bivalue cells. The pivot cell shares one candidate with each wing. Cells that see both wings can have the common candidate eliminated.',
    example: 'Pivot {2,5}, wings {2,8} and {5,8}. Cells seeing both wings can eliminate 8.',
    relatedTechniques: ['w-wing', 'xy-chain'],
    diagram: {
      cells: [
        { row: 4, col: 4, candidates: [2, 5], highlight: 'primary' },
        { row: 4, col: 0, candidates: [2, 8], highlight: 'secondary' },
        { row: 0, col: 4, candidates: [5, 8], highlight: 'secondary' },
        { row: 0, col: 0, candidates: [3, 8], highlight: 'elimination', eliminatedCandidates: [8] },
      ]
    }
  },
  {
    title: 'Simple Coloring',
    slug: 'simple-coloring',
    tier: 'Medium',
    description: 'Assign two colors to candidates in a chain of conjugate pairs for a single digit. If two cells of the same color see each other, that color is false.',
    example: 'Color cells with 4 in conjugate chains. If two "blue" cells see each other, all blue cells can eliminate 4.',
    relatedTechniques: ['x-chain'],
    diagram: {
      cells: [
        { row: 0, col: 0, candidates: [4], highlight: 'primary' },
        { row: 0, col: 5, candidates: [4], highlight: 'secondary' },
        { row: 3, col: 5, candidates: [4], highlight: 'primary' },
        { row: 3, col: 8, candidates: [4], highlight: 'secondary' },
        { row: 6, col: 8, candidates: [4], highlight: 'primary' },
        { row: 6, col: 0, candidates: [4], highlight: 'secondary' },
      ]
    }
  },
  {
    title: 'Swordfish',
    slug: 'swordfish',
    tier: 'Hard',
    description: 'An extension of X-Wing to three rows and three columns. When a candidate appears in 2-3 cells per row across three rows, and all positions fall in the same three columns.',
    example: 'If 7 in rows 2, 5, 8 only appears in columns 1, 4, 9, eliminate 7 from these columns in other rows.',
    relatedTechniques: ['x-wing', 'jellyfish'],
    diagram: {
      cells: [
        { row: 2, col: 1, candidates: [7], highlight: 'primary' },
        { row: 2, col: 4, candidates: [7], highlight: 'primary' },
        { row: 5, col: 4, candidates: [7], highlight: 'primary' },
        { row: 5, col: 8, candidates: [7], highlight: 'primary' },
        { row: 8, col: 1, candidates: [7], highlight: 'primary' },
        { row: 8, col: 8, candidates: [7], highlight: 'primary' },
        { row: 0, col: 1, candidates: [3, 7], highlight: 'elimination', eliminatedCandidates: [7] },
        { row: 6, col: 4, candidates: [2, 7], highlight: 'elimination', eliminatedCandidates: [7] },
        { row: 3, col: 8, candidates: [5, 7], highlight: 'elimination', eliminatedCandidates: [7] },
      ]
    }
  },
  {
    title: 'Jellyfish',
    slug: 'jellyfish',
    tier: 'Hard',
    description: 'Extension of Swordfish to four rows and four columns. When a candidate appears in 2-4 cells per row across four rows, and all positions fall in the same four columns.',
    example: 'If 6 in rows 1, 3, 6, 9 only appears in columns 2, 4, 5, 8, eliminate 6 from these columns in other rows.',
    relatedTechniques: ['swordfish'],
    diagram: {
      cells: [
        { row: 0, col: 1, candidates: [6], highlight: 'primary' },
        { row: 0, col: 4, candidates: [6], highlight: 'primary' },
        { row: 2, col: 3, candidates: [6], highlight: 'primary' },
        { row: 2, col: 7, candidates: [6], highlight: 'primary' },
        { row: 5, col: 1, candidates: [6], highlight: 'primary' },
        { row: 5, col: 3, candidates: [6], highlight: 'primary' },
        { row: 8, col: 4, candidates: [6], highlight: 'primary' },
        { row: 8, col: 7, candidates: [6], highlight: 'primary' },
        { row: 4, col: 1, candidates: [2, 6], highlight: 'elimination', eliminatedCandidates: [6] },
        { row: 6, col: 4, candidates: [6, 9], highlight: 'elimination', eliminatedCandidates: [6] },
      ]
    }
  },
  {
    title: 'Skyscraper',
    slug: 'skyscraper',
    tier: 'Hard',
    description: 'Two rows (or columns) each have a candidate in exactly two cells. One end of each "skyscraper" shares a column (or row), creating an elimination opportunity.',
    example: 'Two rows with 5 in two cells, sharing one column. Cells seeing both unshared ends can eliminate 5.',
    diagram: {
      cells: [
        { row: 1, col: 2, candidates: [5], highlight: 'primary' },
        { row: 1, col: 6, candidates: [5], highlight: 'secondary' },
        { row: 7, col: 2, candidates: [5], highlight: 'primary' },
        { row: 7, col: 8, candidates: [5], highlight: 'secondary' },
        { row: 1, col: 8, candidates: [2, 5], highlight: 'elimination', eliminatedCandidates: [5] },
        { row: 7, col: 6, candidates: [5, 9], highlight: 'elimination', eliminatedCandidates: [5] },
      ]
    }
  },
  {
    title: 'Finned X-Wing',
    slug: 'finned-x-wing',
    tier: 'Hard',
    description: 'An X-Wing pattern with extra candidates (fins) in one corner. The pattern still works for eliminations that also see the fin.',
    example: 'X-Wing on 4 with an extra 4 in one corner box. Eliminate 4 from cells that see both an X-Wing corner and the fin.',
    relatedTechniques: ['x-wing'],
    diagram: {
      cells: [
        { row: 1, col: 2, candidates: [4], highlight: 'primary' },
        { row: 1, col: 7, candidates: [4], highlight: 'primary' },
        { row: 5, col: 2, candidates: [4], highlight: 'primary' },
        { row: 5, col: 7, candidates: [4], highlight: 'primary' },
        { row: 5, col: 8, candidates: [4], highlight: 'secondary' },
        { row: 4, col: 7, candidates: [2, 4], highlight: 'elimination', eliminatedCandidates: [4] },
      ]
    }
  },
  {
    title: 'W-Wing',
    slug: 'w-wing',
    tier: 'Hard',
    description: 'Two cells with identical bivalue candidates connected by a strong link on one of those candidates. The other candidate can be eliminated from cells seeing both.',
    example: 'Two {3,7} cells connected by a strong link on 3. Cells seeing both can eliminate 7.',
    relatedTechniques: ['xy-wing'],
    diagram: {
      cells: [
        { row: 0, col: 0, candidates: [3, 7], highlight: 'primary' },
        { row: 0, col: 4, candidates: [3], highlight: 'secondary' },
        { row: 6, col: 4, candidates: [3], highlight: 'secondary' },
        { row: 6, col: 8, candidates: [3, 7], highlight: 'primary' },
        { row: 0, col: 8, candidates: [1, 7], highlight: 'elimination', eliminatedCandidates: [7] },
        { row: 6, col: 0, candidates: [4, 7], highlight: 'elimination', eliminatedCandidates: [7] },
      ]
    }
  },
  {
    title: 'X-Chain',
    slug: 'x-chain',
    tier: 'Hard',
    description: 'A chain of cells connected by conjugate pairs for a single digit. Cells that see both ends of an even-length chain can eliminate that digit.',
    example: 'Chain of 6s: A-B-C-D (4 cells, even). Any cell seeing both A and D can eliminate 6.',
    relatedTechniques: ['simple-coloring', 'xy-chain'],
    diagram: {
      cells: [
        { row: 0, col: 0, candidates: [6], highlight: 'primary' },
        { row: 0, col: 6, candidates: [6], highlight: 'secondary' },
        { row: 4, col: 6, candidates: [6], highlight: 'primary' },
        { row: 4, col: 2, candidates: [6], highlight: 'secondary' },
        { row: 4, col: 0, candidates: [2, 6], highlight: 'elimination', eliminatedCandidates: [6] },
      ]
    }
  },
  {
    title: 'XY-Chain',
    slug: 'xy-chain',
    tier: 'Hard',
    description: 'A chain of bivalue cells where each cell shares one candidate with its neighbors. The chain\'s endpoints determine what can be eliminated.',
    example: 'Chain: {2,5}-{5,8}-{8,3}-{3,2}. Cells seeing both ends can eliminate 2.',
    relatedTechniques: ['xy-wing', 'x-chain'],
    diagram: {
      cells: [
        { row: 0, col: 0, candidates: [2, 5], highlight: 'primary' },
        { row: 0, col: 4, candidates: [5, 8], highlight: 'secondary' },
        { row: 4, col: 4, candidates: [3, 8], highlight: 'secondary' },
        { row: 4, col: 8, candidates: [2, 3], highlight: 'primary' },
        { row: 0, col: 8, candidates: [1, 2], highlight: 'elimination', eliminatedCandidates: [2] },
        { row: 4, col: 0, candidates: [2, 7], highlight: 'elimination', eliminatedCandidates: [2] },
      ]
    }
  },
  {
    title: 'Unique Rectangle',
    slug: 'unique-rectangle',
    tier: 'Hard',
    description: 'Uses the assumption that valid Sudoku puzzles have unique solutions. If four cells would form a "deadly pattern" allowing two solutions, something must break it.',
    example: 'If cells form a rectangle with same two candidates, and one has extra candidates, those extras must be true.',
    diagram: {
      cells: [
        { row: 0, col: 0, candidates: [3, 7], highlight: 'secondary' },
        { row: 0, col: 4, candidates: [3, 7], highlight: 'secondary' },
        { row: 2, col: 0, candidates: [3, 7], highlight: 'secondary' },
        { row: 2, col: 4, candidates: [3, 5, 7], highlight: 'primary', eliminatedCandidates: [3, 7] },
      ]
    },
    relatedTechniques: ['bug', 'als-xz'],
    subsections: [
      {
        title: 'Type 1',
        slug: 'unique-rectangle',
        description: 'One corner has extra candidates beyond the UR pair. Those extra candidates must be true to avoid the deadly pattern.',
        example: 'Rectangle with {3,7} in three corners and {3,5,7} in one corner. The 5 must be true, so eliminate 3 and 7 from that cell.',
        diagram: {
          cells: [
            { row: 0, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 0, col: 4, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 4, candidates: [3, 5, 7], highlight: 'primary', eliminatedCandidates: [3, 7] },
          ]
        }
      },
      {
        title: 'Type 2',
        slug: 'unique-rectangle-type-2',
        description: 'Two corners (in the same row or column) have an extra candidate. That candidate can be eliminated from cells seeing both corners.',
        example: 'Rectangle with {3,7} and two corners with {3,7,9}. Eliminate 9 from cells seeing both extra corners.',
        diagram: {
          cells: [
            { row: 0, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 0, col: 4, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 0, candidates: [3, 7, 9], highlight: 'primary' },
            { row: 2, col: 4, candidates: [3, 7, 9], highlight: 'primary' },
            { row: 2, col: 2, candidates: [1, 9], highlight: 'elimination', eliminatedCandidates: [9] },
          ]
        }
      },
      {
        title: 'Type 3',
        slug: 'unique-rectangle-type-3',
        description: 'Extra candidates in two corners form a naked pair/triple with another cell in the same unit, enabling subset eliminations.',
        example: 'Rectangle with {3,7} base and extras {5} and {6} forming a naked pair with a cell having {5,6}. Apply naked pair logic.',
        diagram: {
          cells: [
            { row: 0, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 0, col: 4, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 0, candidates: [3, 5, 7], highlight: 'primary' },
            { row: 2, col: 4, candidates: [3, 6, 7], highlight: 'primary' },
            { row: 2, col: 2, candidates: [5, 6], highlight: 'primary' },
            { row: 2, col: 6, candidates: [1, 5, 6], highlight: 'elimination', eliminatedCandidates: [5, 6] },
          ]
        }
      },
      {
        title: 'Type 4',
        slug: 'unique-rectangle-type-4',
        description: 'One of the UR candidates is locked in the UR cells within a row or column. The other candidate can be eliminated from those cells.',
        example: 'Rectangle with {3,7}. If 3 only appears in UR cells in column 1, eliminate 7 from those UR cells.',
        diagram: {
          cells: [
            { row: 0, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 0, col: 4, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 0, candidates: [3, 5, 7], highlight: 'primary', eliminatedCandidates: [7] },
            { row: 2, col: 4, candidates: [3, 6, 7], highlight: 'primary', eliminatedCandidates: [7] },
          ]
        }
      },
      {
        title: 'Type 5 (Not Implemented)',
        slug: 'unique-rectangle-type-5',
        description: 'The extra candidate appears in exactly one diagonal pair of corners, allowing eliminations based on the UR rule.',
        example: 'Rectangle with {3,7} and corners R1C1,R2C4 having extra 9. If R1C1≠9 and R2C4≠9, deadly pattern forms, so one must be 9.',
        diagram: {
          cells: [
            { row: 0, col: 0, candidates: [3, 7, 9], highlight: 'primary' },
            { row: 0, col: 4, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 4, candidates: [3, 7, 9], highlight: 'primary' },
          ]
        }
      },
      {
        title: 'Type 6 (Not Implemented)',
        slug: 'unique-rectangle-type-6',
        description: 'Combines with X-Wing logic. The UR candidates form an X-Wing pattern allowing additional eliminations.',
        example: 'UR where one candidate forms X-Wing in the UR rows/columns. Apply X-Wing eliminations enhanced by UR logic.',
        diagram: {
          cells: [
            { row: 0, col: 0, candidates: [3, 7], highlight: 'primary' },
            { row: 0, col: 4, candidates: [3, 7], highlight: 'primary' },
            { row: 2, col: 0, candidates: [3, 5, 7], highlight: 'primary', eliminatedCandidates: [3] },
            { row: 2, col: 4, candidates: [3, 6, 7], highlight: 'primary', eliminatedCandidates: [3] },
          ]
        }
      },
      {
        title: 'Hidden (Not Implemented)',
        slug: 'hidden-unique-rectangle',
        description: 'A Unique Rectangle pattern hidden among other candidates. Requires finding the UR candidates among cells with many candidates.',
        example: 'Four cells with many candidates, but {4,9} appear in UR pattern. Apply UR logic despite other candidates.',
        diagram: {
          cells: [
            { row: 0, col: 0, candidates: [1, 4, 5, 9], highlight: 'secondary' },
            { row: 0, col: 4, candidates: [2, 4, 6, 9], highlight: 'secondary' },
            { row: 2, col: 0, candidates: [3, 4, 7, 9], highlight: 'secondary' },
            { row: 2, col: 4, candidates: [4, 8, 9], highlight: 'primary', eliminatedCandidates: [4, 9] },
          ]
        }
      },
      {
        title: 'Avoidable (Not Implemented)',
        slug: 'avoidable-rectangle',
        description: 'Similar to Unique Rectangle but involves given digits. If placing candidates would create an interchangeable rectangle with givens, it must be avoided.',
        example: 'Two givens and two cells that would form a deadly pattern. The cells must avoid creating the pattern.',
        diagram: {
          cells: [
            { row: 0, col: 0, value: 3, highlight: 'secondary' },
            { row: 0, col: 4, value: 7, highlight: 'secondary' },
            { row: 2, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 4, candidates: [3, 5, 7], highlight: 'primary', eliminatedCandidates: [3, 7] },
          ]
        }
      },
      {
        title: 'Extended (Not Implemented)',
        slug: 'extended-unique-rectangle',
        description: 'Unique Rectangle patterns extended to more than 4 cells, forming larger deadly patterns that must be avoided.',
        example: 'Six cells forming a double-rectangle pattern with shared candidates. Extended UR logic applies.',
        diagram: {
          cells: [
            { row: 0, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 0, col: 4, candidates: [3, 7], highlight: 'secondary' },
            { row: 0, col: 8, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 0, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 4, candidates: [3, 7], highlight: 'secondary' },
            { row: 2, col: 8, candidates: [3, 5, 7], highlight: 'primary', eliminatedCandidates: [3, 7] },
          ]
        }
      }
    ]
  },
  {
    title: 'BUG',
    slug: 'bug',
    tier: 'Hard',
    description: 'BUG (Bivalue Universal Grave) - When all unsolved cells have exactly 2 candidates except one with 3, that cell\'s unique candidate must be true.',
    example: 'All cells have 2 candidates except R5C5 with {2,5,7}. Only 7 appears 3 times in its row/col/box, so place 7.',
    diagram: {
      cells: [
        { row: 4, col: 4, candidates: [2, 5, 7], highlight: 'primary' },
        { row: 4, col: 0, candidates: [2, 5], highlight: 'secondary' },
        { row: 4, col: 8, candidates: [5, 7], highlight: 'secondary' },
        { row: 0, col: 4, candidates: [2, 7], highlight: 'secondary' },
        { row: 8, col: 4, candidates: [5, 7], highlight: 'secondary' },
      ]
    }
  },
  {
    title: 'Empty Rectangle',
    slug: 'empty-rectangle',
    tier: 'Hard',
    description: 'A box where a candidate forms an L-shape or plus pattern, with a strong link extending outside. This creates elimination opportunities.',
    example: 'Box has 5 in L-shape; strong link on 5 extends to another row. Cells at intersection can eliminate 5.',
    diagram: {
      cells: [
        { row: 3, col: 0, candidates: [5], highlight: 'primary' },
        { row: 3, col: 1, candidates: [5], highlight: 'primary' },
        { row: 4, col: 0, candidates: [5], highlight: 'primary' },
        { row: 3, col: 7, candidates: [5], highlight: 'secondary' },
        { row: 7, col: 7, candidates: [5], highlight: 'secondary' },
        { row: 7, col: 0, candidates: [2, 5], highlight: 'elimination', eliminatedCandidates: [5] },
      ]
    }
  },
  {
    title: 'XYZ-Wing',
    slug: 'xyz-wing',
    tier: 'Hard',
    description: 'A pivot cell with three candidates {X,Y,Z} connected to two wing cells with {X,Z} and {Y,Z}. Cells seeing all three can eliminate Z.',
    example: 'Pivot {1,5,9}, wings {1,9} and {5,9}. Cells seeing all three can eliminate 9.',
    relatedTechniques: ['xy-wing', 'wxyz-wing'],
  },
  {
    title: 'WXYZ-Wing',
    slug: 'wxyz-wing',
    tier: 'Hard',
    description: 'An extension of XYZ-Wing with four cells and four candidates. Similar elimination logic applies to the common candidate.',
    example: 'Four cells with candidates from {W,X,Y,Z} forming a wing pattern. The restricted common candidate can be eliminated.',
    relatedTechniques: ['xyz-wing', 'xy-wing'],
  },
  {
    title: 'Finned Swordfish',
    slug: 'finned-swordfish',
    tier: 'Hard',
    description: 'A Swordfish pattern with extra candidates (fins) in one corner. Eliminations are possible for cells that see both the pattern and the fin.',
    example: 'Swordfish on 7 with an extra 7 in one corner. Eliminate 7 from cells seeing both a pattern corner and the fin.',
    relatedTechniques: ['swordfish', 'finned-x-wing'],
  },
  {
    title: 'Remote Pairs',
    slug: 'remote-pairs',
    tier: 'Hard',
    description: 'A chain of cells all containing the same two candidates. Cells seeing both ends of an even-length chain can eliminate both candidates.',
    example: 'Chain of {3,7} cells: A-B-C-D (4 cells). Cells seeing both A and D can eliminate 3 and 7.',
    relatedTechniques: ['xy-chain'],
  },
  {
    title: 'ALS-XZ',
    slug: 'als-xz',
    tier: 'Hard',
    description: 'Two Almost Locked Sets (ALS) sharing a restricted common candidate (X). Another common candidate (Z) can be eliminated from cells seeing both ALSs.',
    example: 'ALS A and ALS B share candidate 5 (restricted). Candidate 3 appears in both. Eliminate 3 from cells seeing both.',
    relatedTechniques: ['als-xy-wing', 'als-xy-chain'],
  },
  // Extreme tier techniques - for "impossible" difficulty
  {
    title: 'Sue de Coq',
    slug: 'sue-de-coq',
    tier: 'Extreme',
    description: 'A complex technique involving a box-line intersection with specific candidate patterns that allow multiple eliminations.',
    example: 'Cells at box-line intersection with candidates that must contain certain digits. Eliminate those digits from related cells.',
    relatedTechniques: ['als-xz'],
  },
  {
    title: '3D Medusa',
    slug: 'medusa-3d',
    tier: 'Extreme',
    description: 'An extension of simple coloring that uses both strong links within digits and bivalue cells to create a multi-digit coloring network.',
    example: 'Color candidates across multiple digits using bivalue cells as bridges. Contradictions reveal eliminations.',
    relatedTechniques: ['simple-coloring'],
  },
  {
    title: 'Grouped X-Cycles',
    slug: 'grouped-x-cycles',
    tier: 'Extreme',
    description: 'X-Cycles extended to include grouped nodes (multiple cells in a box acting as one node). Enables more complex chain logic.',
    example: 'Chain on digit 4 with grouped nodes in boxes. Apply X-Cycle rules with groups as single nodes.',
    relatedTechniques: ['x-chain', 'simple-coloring'],
  },
  {
    title: 'AIC (Alternating Inference Chain)',
    slug: 'aic',
    tier: 'Extreme',
    description: 'A chain of strong and weak links across multiple digits and cells. The chain endpoints determine what can be eliminated.',
    example: 'Chain: A=5 → A=3 - B=3 → B=7. If A is 5, then B is 7. Cells seeing both endpoints can make eliminations.',
    relatedTechniques: ['x-chain', 'xy-chain'],
  },
  {
    title: 'ALS-XY-Wing',
    slug: 'als-xy-wing',
    tier: 'Extreme',
    description: 'Three Almost Locked Sets connected in a wing pattern. The restricted common candidates allow eliminations of another shared candidate.',
    example: 'Three ALSs forming a wing. The Z candidate appearing in wing tips can be eliminated from cells seeing both.',
    relatedTechniques: ['als-xz', 'xy-wing'],
  },
  {
    title: 'ALS-XY-Chain',
    slug: 'als-xy-chain',
    tier: 'Extreme',
    description: 'A chain of Almost Locked Sets where consecutive ALSs share restricted common candidates. Enables complex eliminations.',
    example: 'Chain of ALSs: A-B-C-D. Each pair shares a restricted common. Eliminate the endpoint common from cells seeing both.',
    relatedTechniques: ['als-xz', 'als-xy-wing', 'xy-chain'],
  },
  {
    title: 'Forcing Chain',
    slug: 'forcing-chain',
    tier: 'Extreme',
    description: 'Assume a candidate is true and follow all logical implications. If all paths lead to the same conclusion, that conclusion must be true.',
    example: 'If R1C1=5 leads to R5C5=7, and R1C1≠5 also leads to R5C5=7, then R5C5 must be 7.',
    relatedTechniques: ['aic', 'digit-forcing-chain'],
  },
  {
    title: 'Digit Forcing Chain',
    slug: 'digit-forcing-chain',
    tier: 'Extreme',
    description: 'Similar to forcing chain but starts with all candidates of a digit in a unit. If all lead to the same result, it must be true.',
    example: 'All positions for 6 in row 3, when assumed true, eliminate 4 from R3C5. So R3C5 cannot be 4.',
    relatedTechniques: ['forcing-chain'],
  },
  {
    title: 'Death Blossom',
    slug: 'death-blossom',
    tier: 'Extreme',
    description: 'A stem cell with N candidates connected to N Almost Locked Sets, each sharing one stem candidate. Common candidates in all ALSs can be eliminated.',
    example: 'Stem {2,5,7} connected to 3 ALSs. Candidate 9 appears in all ALSs. Eliminate 9 from cells seeing all ALSs.',
    relatedTechniques: ['als-xz', 'als-xy-wing'],
  },
  {
    title: 'Auto Fill',
    slug: 'auto-fill',
    tier: 'Auto',
    description: 'The solver automatically filled this cell using logical deduction.',
    example: 'This move was made by the solving algorithm.',
  },
  // ============================================================
  // NOT IMPLEMENTED - Known techniques not yet in the solver
  // ============================================================
  {
    title: 'Exocet',
    slug: 'exocet',
    tier: 'NotImplemented',
    description: 'A complex pattern involving a base pair of cells and target cells in specific geometric arrangements. The base candidates propagate to targets in constrained ways, allowing eliminations.',
    example: 'Base cells in one box with targets in other boxes. If base has {3,5,7}, targets are limited to subsets of these digits, enabling eliminations elsewhere.',
    relatedTechniques: ['death-blossom'],
  },
  {
    title: 'SK Loop',
    slug: 'sk-loop',
    tier: 'NotImplemented',
    description: 'Named after its discoverer, this involves a loop of cells around the grid center forming a closed chain with specific candidate patterns. Extremely rare but powerful.',
    example: 'Eight cells forming a loop around box 5, with alternating candidate pairs. The loop constraints force eliminations in all connected cells.',
    relatedTechniques: ['aic', 'grouped-x-cycles'],
  },
  {
    title: 'Pattern Overlay',
    slug: 'pattern-overlay',
    tier: 'NotImplemented',
    description: 'Enumerate all possible valid placements (templates) for a digit across the grid. Cells not covered by any valid template can have that digit eliminated.',
    example: 'For digit 5, find all 9-cell valid placement patterns. If cell R3C4 is never included in any valid pattern, eliminate 5 from R3C4.',
    relatedTechniques: [],
  },
  {
    title: 'Bowmans Bingo',
    slug: 'bowmans-bingo',
    tier: 'NotImplemented',
    description: 'A trial-and-error approach that makes an assumption and follows chains of singles until a contradiction is found or the puzzle is solved.',
    example: 'Assume R1C1=5. Follow naked singles until contradiction or solution. If contradiction, R1C1≠5.',
    relatedTechniques: ['forcing-chain'],
  },
  {
    title: 'Aligned Pair Exclusion',
    slug: 'aligned-pair-exclusion',
    tier: 'NotImplemented',
    description: 'Two cells aligned (same row/column) with overlapping candidates. By analyzing Almost Locked Sets they connect to, certain candidate combinations can be excluded.',
    example: 'Two cells in a row with {2,5} and {2,7}. If placing 2 in either creates ALS conflicts, 2 can be eliminated from both.',
    relatedTechniques: ['als-xz'],
  },
  {
    title: 'Aligned Triple Exclusion',
    slug: 'aligned-triple-exclusion',
    tier: 'NotImplemented',
    description: 'Extension of Aligned Pair Exclusion to three cells. More complex analysis of ALS interactions allows additional eliminations.',
    example: 'Three aligned cells with overlapping candidates. ALS analysis reveals impossible combinations.',
    relatedTechniques: ['aligned-pair-exclusion', 'als-xz'],
  },
  {
    title: 'Gurths Symmetrical Placement',
    slug: 'gurths-symmetrical-placement',
    tier: 'NotImplemented',
    description: 'Exploits 180-degree rotational symmetry in some puzzles. If a puzzle has this symmetry, placing a digit in one cell determines the digit in the opposite cell.',
    example: 'In a symmetric puzzle, if R1C1=3, then R9C9 must be the symmetric partner digit (e.g., 7 if 3↔7 in the symmetry mapping).',
    relatedTechniques: [],
  },
  {
    title: 'Multifish (Mutant Fish)',
    slug: 'multifish',
    tier: 'NotImplemented',
    description: 'Generalized fish patterns that span rows, columns, and boxes simultaneously. Extremely complex to identify but can solve otherwise intractable puzzles.',
    example: 'A "Frankenfish" using 2 rows and 1 box as base sets, with 3 columns as cover sets. Enables eliminations impossible with basic fish.',
    relatedTechniques: ['swordfish', 'jellyfish'],
  },
  {
    title: 'Kraken Fish',
    slug: 'kraken-fish',
    tier: 'NotImplemented',
    description: 'Combines fish patterns with forcing chains. A finned fish where the fin connects via chains to the elimination target, proving the elimination valid.',
    example: 'Finned X-Wing where the fin chains to the elimination cell. Even if fin is true, the elimination still holds.',
    relatedTechniques: ['finned-x-wing', 'forcing-chain'],
  },
  {
    title: 'Recursive ALS Chains',
    slug: 'recursive-als-chains',
    tier: 'NotImplemented',
    description: 'Extended ALS chains where ALSs contain other ALS patterns, creating deeply nested logical structures.',
    example: 'An ALS chain where one ALS itself contains an XY-Wing pattern, combining multiple techniques.',
    relatedTechniques: ['als-xy-chain', 'als-xz'],
  },
  {
    title: 'Brute Force / Backtracking',
    slug: 'brute-force',
    tier: 'NotImplemented',
    description: 'When all logical techniques fail, systematically try candidates and backtrack on contradiction. Not a "human" technique but guarantees a solution.',
    example: 'Try R1C1=1. If puzzle becomes unsolvable, backtrack and try R1C1=2. Continue until solved.',
    relatedTechniques: [],
  },
  {
    title: 'Grouped ALS-XZ',
    slug: 'grouped-als-xz',
    tier: 'NotImplemented',
    description: 'ALS-XZ where the Almost Locked Sets involve grouped cells (cells acting together through box constraints).',
    example: 'An ALS spanning box boundaries with grouped nodes. The restricted common logic still applies.',
    relatedTechniques: ['als-xz', 'grouped-x-cycles'],
  },
  {
    title: 'Discontinuous Nice Loop',
    slug: 'discontinuous-nice-loop',
    tier: 'NotImplemented',
    description: 'A chain that starts and ends at the same cell with the same candidate but with conflicting implications, proving that candidate false.',
    example: 'Chain from R1C1=5 eventually proves R1C1≠5. This contradiction means R1C1 cannot be 5.',
    relatedTechniques: ['aic', 'x-chain'],
  },
  {
    title: 'Continuous Nice Loop',
    slug: 'continuous-nice-loop',
    tier: 'NotImplemented',
    description: 'A chain that forms a complete loop with alternating strong and weak links. All weak link eliminations in the loop are valid.',
    example: 'Loop of 6 cells with alternating links. Every weak link position can eliminate that candidate from other cells in those units.',
    relatedTechniques: ['aic', 'x-chain'],
  },
  {
    title: 'Bivalue Oddagon',
    slug: 'bivalue-oddagon',
    tier: 'NotImplemented',
    description: 'An odd-length loop of bivalue cells sharing candidates. Such a loop cannot exist, so cells that would complete it can make eliminations.',
    example: 'Five bivalue cells would form a loop if R3C3 had candidate 5. Therefore R3C3≠5.',
    relatedTechniques: ['xy-chain', 'remote-pairs'],
  },
  {
    title: 'Dual Empty Rectangle',
    slug: 'dual-empty-rectangle',
    tier: 'NotImplemented',
    description: 'Two empty rectangles in different boxes working together. Their combined strong links create more elimination opportunities.',
    example: 'Empty rectangles in boxes 1 and 9 both affect the same row. Combined logic enables new eliminations.',
    relatedTechniques: ['empty-rectangle'],
  },
  {
    title: 'Broken Wing',
    slug: 'broken-wing',
    tier: 'NotImplemented',
    description: 'An X-Cycle with one discontinuity. The cell at the break point can have eliminations based on the partial cycle logic.',
    example: 'Almost-complete X-Cycle on digit 7. The break point reveals an elimination.',
    relatedTechniques: ['x-chain', 'grouped-x-cycles'],
  },
  {
    title: 'Double Exocet',
    slug: 'double-exocet',
    tier: 'NotImplemented',
    description: 'Two Exocet patterns sharing cells or candidates. Their interaction creates additional constraints and eliminations.',
    example: 'Two Exocets with overlapping target cells. Combined analysis reveals more eliminations.',
    relatedTechniques: ['exocet'],
  },
  {
    title: 'MSLS (Multi-Sector Locked Sets)',
    slug: 'msls',
    tier: 'NotImplemented',
    description: 'Multiple sectors (rows, columns, boxes) with locked sets that interact. Complex counting arguments prove eliminations.',
    example: 'Rows 1,2,3 and columns 4,5,6 have exactly 18 cells for 18 candidate slots. Overflow proves eliminations.',
    relatedTechniques: ['sue-de-coq', 'als-xz'],
  },
  {
    title: 'Subset Counting',
    slug: 'subset-counting',
    tier: 'NotImplemented',
    description: 'Advanced counting technique comparing the number of cells and candidates in overlapping regions to find eliminations.',
    example: 'If 3 rows and 3 boxes have exactly 27 candidate slots for 27 cells, any excess reveals eliminations.',
    relatedTechniques: ['msls'],
  },
]

// Helper to find a technique by slug (also checks subsection slugs)
export function getTechniqueBySlug(slug: string): TechniqueInfo | undefined {
  // First try direct match
  const direct = TECHNIQUES.find(t => t.slug === slug)
  if (direct) return direct
  
  // Then check subsections
  return TECHNIQUES.find(t => t.subsections?.some(s => s.slug === slug))
}

// Helper to find a subsection by slug (returns both parent and subsection)
export function getSubsectionBySlug(slug: string): { parent: TechniqueInfo; subsection: TechniqueSubsection } | undefined {
  for (const technique of TECHNIQUES) {
    if (technique.subsections) {
      const subsection = technique.subsections.find(s => s.slug === slug)
      if (subsection) {
        return { parent: technique, subsection }
      }
    }
  }
  return undefined
}

// Get display techniques (excludes Auto tier)
export function getDisplayTechniques(): TechniqueInfo[] {
  return TECHNIQUES.filter(t => t.tier !== 'Auto')
}

// Get techniques by tier
export function getTechniquesByTier(tier: 'Simple' | 'Medium' | 'Hard'): TechniqueInfo[] {
  return TECHNIQUES.filter(t => t.tier === tier)
}

// Convert backend technique key (snake_case) to display name
// Uses TECHNIQUES data when available, falls back to formatted key
export function getTechniqueDisplayName(backendKey: string): string {
  // Convert snake_case to slug format (kebab-case)
  const slug = backendKey.replace(/_/g, '-')
  
  // Try to find in TECHNIQUES
  const technique = getTechniqueBySlug(slug)
  if (technique) return technique.title
  
  // Check subsections
  const subsection = getSubsectionBySlug(slug)
  if (subsection) return subsection.subsection.title
  
  // Fallback: convert snake_case to Title Case
  return backendKey
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// ============================================================
// GLOSSARY - Common Sudoku terminology and jargon
// ============================================================

export interface GlossaryTerm {
  term: string
  definition: string
  relatedTerms?: string[]
  example?: string
}

export const GLOSSARY: GlossaryTerm[] = [
  // Basic concepts
  {
    term: 'Candidate',
    definition: 'A digit (1-9) that could potentially go in a cell based on current eliminations. Also called a "pencil mark" or "note".',
    relatedTerms: ['Elimination', 'Naked Single'],
    example: 'If a cell shows candidates 3, 5, 7, it means only those three digits are still possible for that cell.'
  },
  {
    term: 'Given',
    definition: 'A digit that is pre-filled in the puzzle at the start. Givens cannot be changed and form the basis for solving.',
    relatedTerms: ['Clue'],
    example: 'Most puzzles have 17-35 givens. The minimum for a unique solution is 17.'
  },
  {
    term: 'Clue',
    definition: 'Another term for a given digit. The starting numbers provided in the puzzle.',
    relatedTerms: ['Given']
  },
  {
    term: 'Cell',
    definition: 'One of the 81 squares in the Sudoku grid where a single digit (1-9) must be placed.',
    relatedTerms: ['Row', 'Column', 'Box']
  },
  {
    term: 'Unit',
    definition: 'A row, column, or 3x3 box - any group of 9 cells that must contain digits 1-9 exactly once.',
    relatedTerms: ['Row', 'Column', 'Box', 'House']
  },
  {
    term: 'House',
    definition: 'Another term for unit. Any row, column, or box containing 9 cells.',
    relatedTerms: ['Unit', 'Row', 'Column', 'Box']
  },
  {
    term: 'Row',
    definition: 'A horizontal line of 9 cells. Each row must contain digits 1-9 exactly once.',
    relatedTerms: ['Column', 'Box', 'Unit']
  },
  {
    term: 'Column',
    definition: 'A vertical line of 9 cells. Each column must contain digits 1-9 exactly once.',
    relatedTerms: ['Row', 'Box', 'Unit']
  },
  {
    term: 'Box',
    definition: 'One of the nine 3x3 regions in the grid. Also called a "block", "region", or "nonet". Each box must contain digits 1-9 exactly once.',
    relatedTerms: ['Row', 'Column', 'Unit', 'Block']
  },
  {
    term: 'Block',
    definition: 'Another term for a 3x3 box.',
    relatedTerms: ['Box']
  },
  {
    term: 'Peer',
    definition: 'Any cell that shares a unit (row, column, or box) with a given cell. Each cell has exactly 20 peers.',
    relatedTerms: ['Sees', 'Unit'],
    example: 'Cell R5C5 (center of the grid) has 20 peers: 8 in its row, 8 in its column, and 4 more in its box.'
  },
  {
    term: 'Sees',
    definition: 'Two cells "see" each other if they share a row, column, or box. Cells that see each other cannot contain the same digit.',
    relatedTerms: ['Peer', 'Buddy'],
    example: 'R1C1 sees R1C5 (same row), R5C1 (same column), and R2C2 (same box).'
  },
  {
    term: 'Buddy',
    definition: 'Another term for a peer - a cell that sees the given cell.',
    relatedTerms: ['Peer', 'Sees']
  },
  
  // Candidate notation
  {
    term: 'RxCy',
    definition: 'Standard notation for cell position. R = Row, C = Column. R1C1 is top-left, R9C9 is bottom-right.',
    example: 'R3C7 means the cell in row 3, column 7.'
  },
  {
    term: 'Pencil Marks',
    definition: 'Small numbers written in cells showing possible candidates. Can be entered manually or auto-filled.',
    relatedTerms: ['Candidate', 'Notes']
  },
  {
    term: 'Notes',
    definition: 'Another term for pencil marks or candidates.',
    relatedTerms: ['Pencil Marks', 'Candidate']
  },
  
  // Solving concepts
  {
    term: 'Elimination',
    definition: 'Removing a candidate from a cell because logic proves it cannot be the solution for that cell.',
    relatedTerms: ['Candidate'],
    example: 'If R1C1 contains 5, we can eliminate 5 from all other cells in row 1, column 1, and box 1.'
  },
  {
    term: 'Placement',
    definition: 'Determining the final digit for a cell. Also called "solving" or "filling" the cell.',
    relatedTerms: ['Naked Single', 'Hidden Single']
  },
  {
    term: 'Bivalue Cell',
    definition: 'A cell with exactly two candidates remaining. These are key for many advanced techniques.',
    relatedTerms: ['XY-Wing', 'XY-Chain', 'Remote Pairs'],
    example: 'A cell with only candidates {3, 7} is a bivalue cell.'
  },
  {
    term: 'Bilocation',
    definition: 'When a digit appears as a candidate in exactly two cells within a unit. Forms the basis for many chain techniques.',
    relatedTerms: ['Conjugate Pair', 'Strong Link'],
    example: 'If 5 only appears in R1C2 and R1C8 in row 1, those cells are a bilocation for 5.'
  },
  
  // Links and chains
  {
    term: 'Strong Link',
    definition: 'A relationship between two cells where if one is false, the other must be true. Occurs in bilocation situations.',
    relatedTerms: ['Weak Link', 'Conjugate Pair', 'Chain'],
    example: 'If digit 4 only appears in two cells of a row, there\'s a strong link: one MUST be 4.'
  },
  {
    term: 'Weak Link',
    definition: 'A relationship between two cells where if one is true, the other must be false (but not vice versa). Cells that see each other have weak links on shared candidates.',
    relatedTerms: ['Strong Link', 'Chain'],
    example: 'Two cells in the same row both having candidate 7 have a weak link: both cannot be 7, but both could be false.'
  },
  {
    term: 'Conjugate Pair',
    definition: 'Two cells that form a bilocation for a digit - the only two places that digit can go in a unit. They have a strong link.',
    relatedTerms: ['Strong Link', 'Bilocation', 'X-Wing']
  },
  {
    term: 'Chain',
    definition: 'A sequence of cells connected by links (strong and/or weak). Used in advanced solving techniques to make eliminations.',
    relatedTerms: ['Strong Link', 'Weak Link', 'X-Chain', 'XY-Chain', 'AIC']
  },
  {
    term: 'AIC',
    definition: 'Alternating Inference Chain. A chain that alternates between strong and weak links, possibly across multiple digits.',
    relatedTerms: ['Chain', 'X-Chain', 'XY-Chain']
  },
  {
    term: 'Loop',
    definition: 'A chain that connects back to its starting point. Continuous loops allow eliminations at every weak link.',
    relatedTerms: ['Chain', 'Nice Loop']
  },
  {
    term: 'Nice Loop',
    definition: 'A type of chain/loop with specific properties that enable eliminations. Can be continuous or discontinuous.',
    relatedTerms: ['Loop', 'Chain', 'AIC']
  },
  
  // Pattern terminology
  {
    term: 'Naked',
    definition: 'A pattern where cells contain ONLY the candidates of interest. In a naked pair, two cells contain only the same two candidates.',
    relatedTerms: ['Hidden', 'Naked Pair', 'Naked Triple'],
    example: 'Two cells with only {2, 5} form a naked pair.'
  },
  {
    term: 'Hidden',
    definition: 'A pattern where the candidates of interest appear ONLY in specific cells (but those cells may have other candidates too).',
    relatedTerms: ['Naked', 'Hidden Pair', 'Hidden Single'],
    example: 'If candidates 3 and 7 only appear in two cells of a row (even if those cells have other candidates), it\'s a hidden pair.'
  },
  {
    term: 'Locked Candidates',
    definition: 'When candidates for a digit are restricted to a single row/column within a box (or vice versa), allowing eliminations elsewhere.',
    relatedTerms: ['Pointing Pair', 'Box-Line Reduction']
  },
  {
    term: 'Pointing',
    definition: 'When a candidate in a box is restricted to one row or column, "pointing" to eliminations outside the box.',
    relatedTerms: ['Locked Candidates', 'Pointing Pair', 'Box-Line Reduction']
  },
  {
    term: 'Claiming',
    definition: 'When a candidate in a row/column is restricted to one box, "claiming" that candidate and allowing eliminations in the rest of the box.',
    relatedTerms: ['Locked Candidates', 'Box-Line Reduction']
  },
  
  // Fish terminology
  {
    term: 'Fish',
    definition: 'A family of techniques (X-Wing, Swordfish, Jellyfish) based on candidate positions forming a grid pattern across rows and columns.',
    relatedTerms: ['X-Wing', 'Swordfish', 'Jellyfish', 'Finned Fish']
  },
  {
    term: 'Base Set',
    definition: 'In fish patterns, the rows (or columns) that define the pattern. The base set contains the candidate positions.',
    relatedTerms: ['Cover Set', 'Fish']
  },
  {
    term: 'Cover Set',
    definition: 'In fish patterns, the columns (or rows) that cover all the base positions. Eliminations occur in the cover set outside the base.',
    relatedTerms: ['Base Set', 'Fish']
  },
  {
    term: 'Fin',
    definition: 'Extra candidates in a fish pattern that prevent it from being a pure fish. Finned fish still allow limited eliminations.',
    relatedTerms: ['Finned X-Wing', 'Finned Swordfish', 'Sashimi']
  },
  {
    term: 'Sashimi',
    definition: 'A finned fish where the fin is the only candidate in one of the defining positions. An extreme form of finned fish.',
    relatedTerms: ['Fin', 'Finned X-Wing']
  },
  
  // ALS terminology
  {
    term: 'ALS',
    definition: 'Almost Locked Set. A group of N cells containing N+1 candidates. If any candidate is eliminated, the remaining N candidates are locked.',
    relatedTerms: ['ALS-XZ', 'ALS-XY-Wing', 'Locked Set'],
    example: '3 cells with candidates {1,2,3,4} form an ALS. Remove any one candidate and you get a locked triple.'
  },
  {
    term: 'Locked Set',
    definition: 'A group of N cells containing exactly N candidates. Those candidates can be eliminated from all peers.',
    relatedTerms: ['ALS', 'Naked Pair', 'Naked Triple']
  },
  {
    term: 'Restricted Common',
    definition: 'In ALS techniques, a candidate shared between two ALSs where all instances of that candidate in both ALSs see each other.',
    relatedTerms: ['ALS', 'ALS-XZ']
  },
  
  // Uniqueness terminology
  {
    term: 'Deadly Pattern',
    definition: 'A configuration that would allow multiple solutions. Valid puzzles cannot have deadly patterns, enabling uniqueness-based eliminations.',
    relatedTerms: ['Unique Rectangle', 'BUG']
  },
  {
    term: 'UR',
    definition: 'Abbreviation for Unique Rectangle - a deadly pattern of four cells in two rows and two boxes with the same two candidates.',
    relatedTerms: ['Unique Rectangle', 'Deadly Pattern']
  },
  {
    term: 'BUG',
    definition: 'Bivalue Universal Grave. A state where all cells have exactly 2 candidates - this would create multiple solutions, so it must be avoided.',
    relatedTerms: ['Deadly Pattern', 'BUG+1']
  },
  {
    term: 'BUG+1',
    definition: 'A near-BUG state with one cell having 3 candidates. The extra candidate must be true to avoid the BUG.',
    relatedTerms: ['BUG', 'Deadly Pattern']
  },
  
  // Wing terminology
  {
    term: 'Wing',
    definition: 'A family of techniques using a pivot cell connected to wing cells, creating elimination opportunities.',
    relatedTerms: ['XY-Wing', 'XYZ-Wing', 'W-Wing']
  },
  {
    term: 'Pivot',
    definition: 'In wing techniques, the central cell that connects to the wing cells. The pivot shares one candidate with each wing.',
    relatedTerms: ['Wing', 'XY-Wing']
  },
  {
    term: 'Pincer',
    definition: 'Another term for the wing cells in wing patterns. The pincers "attack" cells that see both of them.',
    relatedTerms: ['Wing', 'XY-Wing']
  },
  
  // Coloring terminology
  {
    term: 'Coloring',
    definition: 'A technique that assigns two colors to candidates in conjugate chains. If two cells of the same color see each other, that color is false.',
    relatedTerms: ['Simple Coloring', '3D Medusa', 'Conjugate Pair']
  },
  {
    term: 'Cluster',
    definition: 'A group of cells connected by strong links in coloring. All cells of one color are either all true or all false.',
    relatedTerms: ['Coloring', 'Simple Coloring']
  },
  {
    term: 'Color Trap',
    definition: 'An elimination in coloring where a cell sees both colors of a cluster, so that candidate can be eliminated.',
    relatedTerms: ['Coloring', 'Color Wrap']
  },
  {
    term: 'Color Wrap',
    definition: 'In coloring, when two cells of the same color see each other, proving that entire color false.',
    relatedTerms: ['Coloring', 'Color Trap']
  },
  
  // Forcing terminology
  {
    term: 'Forcing Chain',
    definition: 'A technique where you assume a candidate is true (or false) and follow all implications. If all paths lead to the same result, it must be true.',
    relatedTerms: ['Digit Forcing Chain', 'Cell Forcing Chain']
  },
  {
    term: 'Implication',
    definition: 'A logical consequence of assuming a candidate is true or false. "If A=5, then B≠5" is an implication.',
    relatedTerms: ['Forcing Chain', 'Chain']
  },
  {
    term: 'Contradiction',
    definition: 'When following implications leads to an impossible state (like a cell with no candidates). This proves the initial assumption was wrong.',
    relatedTerms: ['Forcing Chain', 'Proof by Contradiction']
  },
  
  // Difficulty and solving
  {
    term: 'Backdoor',
    definition: 'A cell or small set of cells that, if solved correctly, allows the rest of the puzzle to be solved with simple techniques only.',
    example: 'Some hard puzzles have a single-cell backdoor: guess that cell correctly and the rest solves with singles.'
  },
  {
    term: 'Bifurcation',
    definition: 'Trial and error solving - guessing a candidate and seeing if it leads to a solution or contradiction. Generally avoided in "pure" solving.',
    relatedTerms: ['Forcing Chain', 'Backtracking']
  },
  {
    term: 'Backtracking',
    definition: 'A brute-force solving method that tries candidates and backtracks when contradictions are found. Not a human technique.',
    relatedTerms: ['Bifurcation']
  },
  {
    term: 'Singles',
    definition: 'The simplest solving techniques: Naked Single and Hidden Single. Most puzzles require at least some singles to solve.',
    relatedTerms: ['Naked Single', 'Hidden Single']
  },
  {
    term: 'Diabolical',
    definition: 'A difficulty rating for puzzles requiring advanced techniques beyond basic fish and subsets.',
    relatedTerms: ['Fiendish', 'Extreme']
  },
  {
    term: 'Minimal Puzzle',
    definition: 'A puzzle where removing any given would result in multiple solutions. Most published puzzles are minimal.',
    relatedTerms: ['Given']
  }
]

// Helper to get glossary term by name (case-insensitive)
export function getGlossaryTerm(term: string): GlossaryTerm | undefined {
  const lowerTerm = term.toLowerCase()
  return GLOSSARY.find(g => g.term.toLowerCase() === lowerTerm)
}

// Get all glossary terms sorted alphabetically
export function getGlossarySorted(): GlossaryTerm[] {
  return [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term))
}

// Search glossary by term or definition
export function searchGlossary(query: string): GlossaryTerm[] {
  const lowerQuery = query.toLowerCase()
  return GLOSSARY.filter(g => 
    g.term.toLowerCase().includes(lowerQuery) ||
    g.definition.toLowerCase().includes(lowerQuery)
  ).sort((a, b) => {
    // Prioritize term matches over definition matches
    const aTermMatch = a.term.toLowerCase().includes(lowerQuery)
    const bTermMatch = b.term.toLowerCase().includes(lowerQuery)
    if (aTermMatch && !bTermMatch) return -1
    if (!aTermMatch && bTermMatch) return 1
    return a.term.localeCompare(b.term)
  })
}
