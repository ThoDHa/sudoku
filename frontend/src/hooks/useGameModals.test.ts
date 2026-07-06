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

  it('openHistory/closeHistory toggle historyOpen and isAnyModalOpen', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.openHistory()
    })
    expect(result.current.historyOpen).toBe(true)
    expect(result.current.isAnyModalOpen).toBe(true)
    act(() => {
      result.current.closeHistory()
    })
    expect(result.current.historyOpen).toBe(false)
    expect(result.current.isAnyModalOpen).toBe(false)
  })

  it('openTechnique/closeTechnique toggle techniqueModal state', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.openTechnique({ title: 'Naked Single', slug: 'naked-single' })
    })
    expect(result.current.techniqueModal).toEqual({ title: 'Naked Single', slug: 'naked-single' })
    expect(result.current.isAnyModalOpen).toBe(true)
    act(() => {
      result.current.closeTechnique()
    })
    expect(result.current.techniqueModal).toBeNull()
    expect(result.current.isAnyModalOpen).toBe(false)
  })

  it('openTechniquesList/closeTechniquesList toggle the list flag', () => {
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

  it('openSolveConfirm/closeSolveConfirm toggle the flag', () => {
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

  it('openClearConfirm/closeClearConfirm toggle the flag', () => {
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

  it('openSolutionConfirm stores error info and opens the modal', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.openSolutionConfirm({ message: 'Cannot pinpoint', count: 4 })
    })
    expect(result.current.showSolutionConfirm).toBe(true)
    expect(result.current.unpinpointableErrorInfo).toEqual({ message: 'Cannot pinpoint', count: 4 })
    expect(result.current.isAnyModalOpen).toBe(true)
  })

  it('closeSolutionConfirm clears the flag but retains error info for exit animation', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.openSolutionConfirm({ message: 'm', count: 3 })
    })
    act(() => {
      result.current.closeSolutionConfirm()
    })
    expect(result.current.showSolutionConfirm).toBe(false)
    expect(result.current.unpinpointableErrorInfo).toEqual({ message: 'm', count: 3 })
  })

  it('isAnyModalOpen reflects the OR of every individual modal flag', () => {
    const { result } = renderHook(() => useGameModals())
    act(() => {
      result.current.openClearConfirm()
    })
    expect(result.current.isAnyModalOpen).toBe(true)
    act(() => {
      result.current.closeClearConfirm()
      result.current.openTechniquesList()
    })
    expect(result.current.isAnyModalOpen).toBe(true)
    act(() => {
      result.current.closeTechniquesList()
    })
    expect(result.current.isAnyModalOpen).toBe(false)
  })
})
