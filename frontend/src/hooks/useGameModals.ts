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
 * Hook for managing all modal states in the Game component.
 *
 * Owns the seven modal visibility states and exposes the raw setState setters
 * plus an `isAnyModalOpen` aggregate. Callers toggle modals directly through
 * the setters (e.g. `setHistoryOpen(true)`).
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

    // Raw setters
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
