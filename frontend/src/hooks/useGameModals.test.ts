import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useGameModals, TechniqueModalState, UnpinpointableErrorInfo } from './useGameModals'

// =============================================================================
// TESTS
// =============================================================================

describe('useGameModals', () => {
  // ===========================================================================
  // INITIAL STATE
  // ===========================================================================
  describe('Initial State', () => {
    it('starts with historyOpen=false', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.historyOpen).toBe(false)
    })

    it('starts with techniqueModal=null', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.techniqueModal).toBeNull()
    })

    it('starts with techniquesListOpen=false', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.techniquesListOpen).toBe(false)
    })

    it('starts with solveConfirmOpen=false', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.solveConfirmOpen).toBe(false)
    })

    it('starts with showClearConfirm=false', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.showClearConfirm).toBe(false)
    })

    it('starts with showSolutionConfirm=false', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.showSolutionConfirm).toBe(false)
    })

    it('starts with unpinpointableErrorInfo=null', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.unpinpointableErrorInfo).toBeNull()
    })

    it('starts with isAnyModalOpen=false', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.isAnyModalOpen).toBe(false)
    })
  })

  // ===========================================================================
  // HISTORY MODAL
  // ===========================================================================
  describe('History Modal', () => {
    it('openHistory sets historyOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openHistory()
      })

      expect(result.current.historyOpen).toBe(true)
    })

    it('closeHistory sets historyOpen=false', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openHistory()
      })

      expect(result.current.historyOpen).toBe(true)

      act(() => {
        result.current.closeHistory()
      })

      expect(result.current.historyOpen).toBe(false)
    })

    it('opening history sets isAnyModalOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openHistory()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('setHistoryOpen raw setter works', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.setHistoryOpen(true)
      })

      expect(result.current.historyOpen).toBe(true)

      act(() => {
        result.current.setHistoryOpen(false)
      })

      expect(result.current.historyOpen).toBe(false)
    })
  })

  // ===========================================================================
  // TECHNIQUE MODAL
  // ===========================================================================
  describe('Technique Modal', () => {
    const testTechnique: TechniqueModalState = {
      title: 'Naked Single',
      slug: 'naked-single',
    }

    it('openTechnique sets techniqueModal to provided state', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openTechnique(testTechnique)
      })

      expect(result.current.techniqueModal).toEqual(testTechnique)
    })

    it('closeTechnique sets techniqueModal=null', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openTechnique(testTechnique)
      })

      expect(result.current.techniqueModal).not.toBeNull()

      act(() => {
        result.current.closeTechnique()
      })

      expect(result.current.techniqueModal).toBeNull()
    })

    it('opening technique modal sets isAnyModalOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openTechnique(testTechnique)
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('setTechniqueModal raw setter works', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.setTechniqueModal(testTechnique)
      })

      expect(result.current.techniqueModal).toEqual(testTechnique)

      act(() => {
        result.current.setTechniqueModal(null)
      })

      expect(result.current.techniqueModal).toBeNull()
    })

    it('openTechnique can be called with different technique states', () => {
      const { result } = renderHook(() => useGameModals())

      const technique1: TechniqueModalState = { title: 'Hidden Pair', slug: 'hidden-pair' }
      const technique2: TechniqueModalState = { title: 'X-Wing', slug: 'x-wing' }

      act(() => {
        result.current.openTechnique(technique1)
      })

      expect(result.current.techniqueModal).toEqual(technique1)

      act(() => {
        result.current.openTechnique(technique2)
      })

      expect(result.current.techniqueModal).toEqual(technique2)
    })
  })

  // ===========================================================================
  // TECHNIQUES LIST MODAL
  // ===========================================================================
  describe('Techniques List Modal', () => {
    it('openTechniquesList sets techniquesListOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openTechniquesList()
      })

      expect(result.current.techniquesListOpen).toBe(true)
    })

    it('closeTechniquesList sets techniquesListOpen=false', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openTechniquesList()
      })

      expect(result.current.techniquesListOpen).toBe(true)

      act(() => {
        result.current.closeTechniquesList()
      })

      expect(result.current.techniquesListOpen).toBe(false)
    })

    it('opening techniques list sets isAnyModalOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openTechniquesList()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('setTechniquesListOpen raw setter works', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.setTechniquesListOpen(true)
      })

      expect(result.current.techniquesListOpen).toBe(true)

      act(() => {
        result.current.setTechniquesListOpen(false)
      })

      expect(result.current.techniquesListOpen).toBe(false)
    })
  })

  // ===========================================================================
  // SOLVE CONFIRM MODAL
  // ===========================================================================
  describe('Solve Confirm Modal', () => {
    it('openSolveConfirm sets solveConfirmOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolveConfirm()
      })

      expect(result.current.solveConfirmOpen).toBe(true)
    })

    it('closeSolveConfirm sets solveConfirmOpen=false', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolveConfirm()
      })

      expect(result.current.solveConfirmOpen).toBe(true)

      act(() => {
        result.current.closeSolveConfirm()
      })

      expect(result.current.solveConfirmOpen).toBe(false)
    })

    it('opening solve confirm sets isAnyModalOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolveConfirm()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('setSolveConfirmOpen raw setter works', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.setSolveConfirmOpen(true)
      })

      expect(result.current.solveConfirmOpen).toBe(true)

      act(() => {
        result.current.setSolveConfirmOpen(false)
      })

      expect(result.current.solveConfirmOpen).toBe(false)
    })
  })

  // ===========================================================================
  // CLEAR CONFIRM MODAL
  // ===========================================================================
  describe('Clear Confirm Modal', () => {
    it('openClearConfirm sets showClearConfirm=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openClearConfirm()
      })

      expect(result.current.showClearConfirm).toBe(true)
    })

    it('closeClearConfirm sets showClearConfirm=false', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openClearConfirm()
      })

      expect(result.current.showClearConfirm).toBe(true)

      act(() => {
        result.current.closeClearConfirm()
      })

      expect(result.current.showClearConfirm).toBe(false)
    })

    it('opening clear confirm sets isAnyModalOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openClearConfirm()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('setShowClearConfirm raw setter works', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.setShowClearConfirm(true)
      })

      expect(result.current.showClearConfirm).toBe(true)

      act(() => {
        result.current.setShowClearConfirm(false)
      })

      expect(result.current.showClearConfirm).toBe(false)
    })
  })

  // ===========================================================================
  // SOLUTION CONFIRM MODAL (with unpinpointable error info)
  // ===========================================================================
  describe('Solution Confirm Modal', () => {
    const testErrorInfo: UnpinpointableErrorInfo = {
      message: 'Multiple errors detected',
      count: 3,
    }

    it('openSolutionConfirm sets showSolutionConfirm=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolutionConfirm(testErrorInfo)
      })

      expect(result.current.showSolutionConfirm).toBe(true)
    })

    it('openSolutionConfirm stores unpinpointableErrorInfo', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolutionConfirm(testErrorInfo)
      })

      expect(result.current.unpinpointableErrorInfo).toEqual(testErrorInfo)
    })

    it('closeSolutionConfirm sets showSolutionConfirm=false', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolutionConfirm(testErrorInfo)
      })

      expect(result.current.showSolutionConfirm).toBe(true)

      act(() => {
        result.current.closeSolutionConfirm()
      })

      expect(result.current.showSolutionConfirm).toBe(false)
    })

    it('closeSolutionConfirm preserves unpinpointableErrorInfo for exit animation', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolutionConfirm(testErrorInfo)
      })

      act(() => {
        result.current.closeSolutionConfirm()
      })

      // Error info should be preserved for modal exit animation
      expect(result.current.unpinpointableErrorInfo).toEqual(testErrorInfo)
    })

    it('opening solution confirm sets isAnyModalOpen=true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolutionConfirm(testErrorInfo)
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('setShowSolutionConfirm raw setter works', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.setShowSolutionConfirm(true)
      })

      expect(result.current.showSolutionConfirm).toBe(true)

      act(() => {
        result.current.setShowSolutionConfirm(false)
      })

      expect(result.current.showSolutionConfirm).toBe(false)
    })

    it('setUnpinpointableErrorInfo raw setter works', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.setUnpinpointableErrorInfo(testErrorInfo)
      })

      expect(result.current.unpinpointableErrorInfo).toEqual(testErrorInfo)

      act(() => {
        result.current.setUnpinpointableErrorInfo(null)
      })

      expect(result.current.unpinpointableErrorInfo).toBeNull()
    })

    it('can open solution confirm with different error info', () => {
      const { result } = renderHook(() => useGameModals())

      const errorInfo1: UnpinpointableErrorInfo = { message: 'Error 1', count: 1 }
      const errorInfo2: UnpinpointableErrorInfo = { message: 'Error 2', count: 5 }

      act(() => {
        result.current.openSolutionConfirm(errorInfo1)
      })

      expect(result.current.unpinpointableErrorInfo).toEqual(errorInfo1)

      act(() => {
        result.current.openSolutionConfirm(errorInfo2)
      })

      expect(result.current.unpinpointableErrorInfo).toEqual(errorInfo2)
    })
  })

  // ===========================================================================
  // isAnyModalOpen COMPUTED VALUE
  // ===========================================================================
  describe('isAnyModalOpen', () => {
    it('returns false when all modals are closed', () => {
      const { result } = renderHook(() => useGameModals())
      expect(result.current.isAnyModalOpen).toBe(false)
    })

    it('returns true when historyOpen is true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openHistory()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('returns true when techniqueModal is set', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openTechnique({ title: 'Test', slug: 'test' })
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('returns true when techniquesListOpen is true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openTechniquesList()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('returns true when solveConfirmOpen is true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolveConfirm()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('returns true when showClearConfirm is true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openClearConfirm()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('returns true when showSolutionConfirm is true', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openSolutionConfirm({ message: 'Error', count: 1 })
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('returns false after closing a modal', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openHistory()
      })

      expect(result.current.isAnyModalOpen).toBe(true)

      act(() => {
        result.current.closeHistory()
      })

      expect(result.current.isAnyModalOpen).toBe(false)
    })

    it('returns true when multiple modals are open', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openHistory()
        result.current.openTechniquesList()
      })

      expect(result.current.isAnyModalOpen).toBe(true)
    })

    it('returns true if at least one modal remains open after closing another', () => {
      const { result } = renderHook(() => useGameModals())

      act(() => {
        result.current.openHistory()
        result.current.openSolveConfirm()
      })

      act(() => {
        result.current.closeHistory()
      })

      expect(result.current.isAnyModalOpen).toBe(true)

      act(() => {
        result.current.closeSolveConfirm()
      })

      expect(result.current.isAnyModalOpen).toBe(false)
    })
  })

  // ===========================================================================
  // FUNCTION STABILITY
  // ===========================================================================
  describe('Function Stability', () => {
    it('provides stable function references across rerenders', () => {
      const { result, rerender } = renderHook(() => useGameModals())

      const openHistory1 = result.current.openHistory
      const closeHistory1 = result.current.closeHistory
      const openTechnique1 = result.current.openTechnique
      const closeTechnique1 = result.current.closeTechnique
      const openTechniquesList1 = result.current.openTechniquesList
      const closeTechniquesList1 = result.current.closeTechniquesList
      const openSolveConfirm1 = result.current.openSolveConfirm
      const closeSolveConfirm1 = result.current.closeSolveConfirm
      const openClearConfirm1 = result.current.openClearConfirm
      const closeClearConfirm1 = result.current.closeClearConfirm
      const openSolutionConfirm1 = result.current.openSolutionConfirm
      const closeSolutionConfirm1 = result.current.closeSolutionConfirm

      rerender()

      // All action functions should be stable due to useCallback
      expect(result.current.openHistory).toBe(openHistory1)
      expect(result.current.closeHistory).toBe(closeHistory1)
      expect(result.current.openTechnique).toBe(openTechnique1)
      expect(result.current.closeTechnique).toBe(closeTechnique1)
      expect(result.current.openTechniquesList).toBe(openTechniquesList1)
      expect(result.current.closeTechniquesList).toBe(closeTechniquesList1)
      expect(result.current.openSolveConfirm).toBe(openSolveConfirm1)
      expect(result.current.closeSolveConfirm).toBe(closeSolveConfirm1)
      expect(result.current.openClearConfirm).toBe(openClearConfirm1)
      expect(result.current.closeClearConfirm).toBe(closeClearConfirm1)
      expect(result.current.openSolutionConfirm).toBe(openSolutionConfirm1)
      expect(result.current.closeSolutionConfirm).toBe(closeSolutionConfirm1)
    })
  })

  // ===========================================================================
  // RETURN VALUE COMPLETENESS
  // ===========================================================================
  describe('Return Value', () => {
    it('returns all expected state properties', () => {
      const { result } = renderHook(() => useGameModals())

      expect(result.current).toHaveProperty('historyOpen')
      expect(result.current).toHaveProperty('techniqueModal')
      expect(result.current).toHaveProperty('techniquesListOpen')
      expect(result.current).toHaveProperty('solveConfirmOpen')
      expect(result.current).toHaveProperty('showClearConfirm')
      expect(result.current).toHaveProperty('showSolutionConfirm')
      expect(result.current).toHaveProperty('unpinpointableErrorInfo')
      expect(result.current).toHaveProperty('isAnyModalOpen')
    })

    it('returns all expected action functions', () => {
      const { result } = renderHook(() => useGameModals())

      expect(typeof result.current.openHistory).toBe('function')
      expect(typeof result.current.closeHistory).toBe('function')
      expect(typeof result.current.openTechnique).toBe('function')
      expect(typeof result.current.closeTechnique).toBe('function')
      expect(typeof result.current.openTechniquesList).toBe('function')
      expect(typeof result.current.closeTechniquesList).toBe('function')
      expect(typeof result.current.openSolveConfirm).toBe('function')
      expect(typeof result.current.closeSolveConfirm).toBe('function')
      expect(typeof result.current.openClearConfirm).toBe('function')
      expect(typeof result.current.closeClearConfirm).toBe('function')
      expect(typeof result.current.openSolutionConfirm).toBe('function')
      expect(typeof result.current.closeSolutionConfirm).toBe('function')
    })

    it('returns all expected raw setters for backwards compatibility', () => {
      const { result } = renderHook(() => useGameModals())

      expect(typeof result.current.setHistoryOpen).toBe('function')
      expect(typeof result.current.setTechniqueModal).toBe('function')
      expect(typeof result.current.setTechniquesListOpen).toBe('function')
      expect(typeof result.current.setSolveConfirmOpen).toBe('function')
      expect(typeof result.current.setShowClearConfirm).toBe('function')
      expect(typeof result.current.setShowSolutionConfirm).toBe('function')
      expect(typeof result.current.setUnpinpointableErrorInfo).toBe('function')
    })
  })
})
