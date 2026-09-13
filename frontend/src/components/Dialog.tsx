import { type ReactNode, type RefObject } from 'react'
import { useDialog } from '../hooks/useDialog'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  titleId?: string
  children: ReactNode
  panelClassName?: string
  overlayClassName?: string
  backdropClassName?: string
  closeOnBackdropClick?: boolean
  closeOnEscape?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  // Adds data-share-button so Game.tsx's cell-deselect guard ignores clicks
  // inside this dialog (used by ShareModal).
  shareGuard?: boolean
}

export function Dialog({
  isOpen,
  onClose,
  titleId,
  children,
  panelClassName = '',
  overlayClassName = '',
  backdropClassName = 'bg-black/50 backdrop-blur-sm',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  initialFocusRef,
  shareGuard = false,
}: DialogProps) {
  const panel = useDialog({
    open: isOpen,
    onClose,
    closeOnEscape,
    ...(initialFocusRef !== undefined ? { initialFocusRef } : {}),
    ...(titleId !== undefined ? { titleId } : {}),
  })

  if (!isOpen) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${overlayClassName}`}
      data-modal
    >
      <div
        className={`absolute inset-0 ${backdropClassName}`}
        {...(closeOnBackdropClick ? { onClick: onClose } : {})}
        data-overlay-backdrop
        {...(shareGuard ? { 'data-share-button': true } : {})}
      />
      <div {...panel} className={`relative z-10 ${panelClassName}`}>
        {children}
      </div>
    </div>
  )
}
