import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useGameModals } from './useGameModals'

describe('useGameModals', () => {
  it('starts with every modal closed and isAnyModalOpen=false', () => {
    const { result } = renderHook(() => useGameModals())
    expect(result.current.historyOpen).toBe(false)
    expect(result.current.techniqueModal).toBeNull()
    expect(result.current.techniquesListOpen).toBe(false)
    expect(result.current.solveConfirmOpen).toBe(false)
    expect(result.current.showClearConfirm).toBe(false)
    expect(result.current.showSolutionConfirm).toBe(false)
    expect(result.current.unpinpointableErrorInfo).toBeNull()
    expect(result.current.isAnyModalOpen).toBe(false)
  })

  it('setHistoryOpen toggles historyOpen and isAnyModalOpen', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.setHistoryOpen(true)
    })
    expect(result.current.historyOpen).toBe(true)
    expect(result.current.isAnyModalOpen).toBe(true)
    act(() => {
      result.current.setHistoryOpen(false)
    })
    expect(result.current.historyOpen).toBe(false)
    expect(result.current.isAnyModalOpen).toBe(false)
  })

  it('setTechniqueModal toggles techniqueModal state', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.setTechniqueModal({ title: 'Naked Single', slug: 'naked-single' })
    })
    expect(result.current.techniqueModal).toEqual({ title: 'Naked Single', slug: 'naked-single' })
    expect(result.current.isAnyModalOpen).toBe(true)
    act(() => {
      result.current.setTechniqueModal(null)
    })
    expect(result.current.techniqueModal).toBeNull()
    expect(result.current.isAnyModalOpen).toBe(false)
  })

  it('setTechniquesListOpen toggles the list flag', () => {
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

  it('setSolveConfirmOpen toggles the flag', () => {
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

  it('setShowClearConfirm toggles the flag', () => {
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

  it('setShowSolutionConfirm and setUnpinpointableErrorInfo manage the error modal', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.setUnpinpointableErrorInfo({ message: 'Cannot pinpoint', count: 4 })
      result.current.setShowSolutionConfirm(true)
    })
    expect(result.current.showSolutionConfirm).toBe(true)
    expect(result.current.unpinpointableErrorInfo).toEqual({ message: 'Cannot pinpoint', count: 4 })
    expect(result.current.isAnyModalOpen).toBe(true)
  })

  it('isAnyModalOpen reflects the OR of every individual modal flag', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.setShowClearConfirm(true)
    })
    expect(result.current.isAnyModalOpen).toBe(true)
    act(() => {
      result.current.setShowClearConfirm(false)
      result.current.setTechniquesListOpen(true)
    })
    expect(result.current.isAnyModalOpen).toBe(true)
    act(() => {
      result.current.setTechniquesListOpen(false)
    })
    expect(result.current.isAnyModalOpen).toBe(false)
  })
})
