import { useState, useMemo } from 'react'

/**
 * Technique modal state
 */
export interface TechniqueModalState {
  title: string
  slug: string
}

/**
 * Unpinpointable error info for solution confirm modal
 */
export interface UnpinpointableErrorInfo {
  message: string
  count: number
}

/**
 * All modal states managed by this hook
 */
export interface GameModalsState {
  historyOpen: boolean
  techniqueModal: TechniqueModalState | null
  techniquesListOpen: boolean
  solveConfirmOpen: boolean
  showClearConfirm: boolean
  showSolutionConfirm: boolean
  unpinpointableErrorInfo: UnpinpointableErrorInfo | null
}

/**
 * Hook for managing all modal states in the Game component
 *
 * Consolidates 7 modal-related state variables into a single hook
 * with clear, semantic action methods.
 */
export function useGameModals() {
  // Modal visibility states
  const [historyOpen, setHistoryOpen] = useState(false)
  const [techniqueModal, setTechniqueModal] = useState<TechniqueModalState | null>(null)
  const [techniquesListOpen, setTechniquesListOpen] = useState(false)
  const [solveConfirmOpen, setSolveConfirmOpen] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showSolutionConfirm, setShowSolutionConfirm] = useState(false)
  const [unpinpointableErrorInfo, setUnpinpointableErrorInfo] =
    useState<UnpinpointableErrorInfo | null>(null)

  // History modal actions
  const openHistory = () => {
    setHistoryOpen(true)
  }
  const closeHistory = () => {
    setHistoryOpen(false)
  }

  // Technique modal actions
  const openTechnique = (technique: TechniqueModalState) => {
    setTechniqueModal(technique)
  }
  const closeTechnique = () => {
    setTechniqueModal(null)
  }

  // Techniques list modal actions
  const openTechniquesList = () => {
    setTechniquesListOpen(true)
  }
  const closeTechniquesList = () => {
    setTechniquesListOpen(false)
  }

  // Solve confirm modal actions
  const openSolveConfirm = () => {
    setSolveConfirmOpen(true)
  }
  const closeSolveConfirm = () => {
    setSolveConfirmOpen(false)
  }

  // Clear confirm modal actions
  const openClearConfirm = () => {
    setShowClearConfirm(true)
  }
  const closeClearConfirm = () => {
    setShowClearConfirm(false)
  }

  // Solution confirm modal actions (for unpinpointable errors)
  const openSolutionConfirm = (errorInfo: UnpinpointableErrorInfo) => {
    setUnpinpointableErrorInfo(errorInfo)
    setShowSolutionConfirm(true)
  }
  const closeSolutionConfirm = () => {
    setShowSolutionConfirm(false)
    // Don't clear error info immediately - modal may need it for exit animation
  }

  // Check if any modal is open (useful for disabling keyboard shortcuts)
  const isAnyModalOpen = useMemo(() => {
    return (
      historyOpen ||
      techniqueModal !== null ||
      techniquesListOpen ||
      solveConfirmOpen ||
      showClearConfirm ||
      showSolutionConfirm
    )
  }, [
    historyOpen,
    techniqueModal,
    techniquesListOpen,
    solveConfirmOpen,
    showClearConfirm,
    showSolutionConfirm,
  ])

  return {
    // State values
    historyOpen,
    techniqueModal,
    techniquesListOpen,
    solveConfirmOpen,
    showClearConfirm,
    showSolutionConfirm,
    unpinpointableErrorInfo,
    isAnyModalOpen,

    // History modal
    openHistory,
    closeHistory,

    // Technique modal
    openTechnique,
    closeTechnique,

    // Techniques list modal
    openTechniquesList,
    closeTechniquesList,

    // Solve confirm modal
    openSolveConfirm,
    closeSolveConfirm,

    // Clear confirm modal
    openClearConfirm,
    closeClearConfirm,

    // Solution confirm modal
    openSolutionConfirm,
    closeSolutionConfirm,

    // Raw setters for backwards compatibility and edge cases
    setHistoryOpen,
    setTechniqueModal,
    setTechniquesListOpen,
    setSolveConfirmOpen,
    setShowClearConfirm,
    setShowSolutionConfirm,
    setUnpinpointableErrorInfo,
  }
}

export type UseGameModalsReturn = ReturnType<typeof useGameModals>
