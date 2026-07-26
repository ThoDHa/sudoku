import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Tracks open dialogs so only the topmost one reacts to Tab/Escape. Nested
// dialogs (e.g. GlossaryModal inside TechniquesListModal) therefore keep focus
// inside themselves without the outer dialog stealing it.
const openDialogs: HTMLElement[] = []

function isTopmost(panel: HTMLElement): boolean {
  return openDialogs[openDialogs.length - 1] === panel
}

function getFocusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

interface UseDialogOptions {
  open: boolean
  onClose: () => void
  titleId?: string
  closeOnEscape?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
}

export interface DialogPanelProps {
  ref: RefObject<HTMLDivElement | null>
  role: 'dialog'
  'aria-modal': true
  'aria-labelledby'?: string
  tabIndex: number
}

// Provides dialog semantics (role/aria-modal/aria-labelledby), a focus trap,
// Escape-to-close, initial focus, and focus restore on close. Mounts nothing;
// spread the returned props onto the visible dialog panel element.
// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with Dialog for cohesion
export function useDialog({
  open,
  onClose,
  titleId,
  closeOnEscape = true,
  initialFocusRef,
}: UseDialogOptions): DialogPanelProps {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const closeOnEscapeRef = useRef(closeOnEscape)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Sync latest callbacks into refs after commit so the keyboard-handler
  // effect (which intentionally excludes them from deps to avoid re-arming
  // the listener) always reads current values at event time.
  useEffect(() => {
    onCloseRef.current = onClose
    closeOnEscapeRef.current = closeOnEscape
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null
    openDialogs.push(panel)

    const target =
      initialFocusRef?.current ?? panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? panel
    target.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTopmost(panel)) return

      if (e.key === 'Escape' && closeOnEscapeRef.current) {
        e.preventDefault()
        onCloseRef.current()
        return
      }

      if (e.key === 'Tab') {
        const focusable = getFocusable(panel)
        if (focusable.length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (!first || !last) return
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey) {
          if (active === first || !panel.contains(active)) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (active === last || !panel.contains(active)) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const idx = openDialogs.indexOf(panel)
      if (idx !== -1) openDialogs.splice(idx, 1)
      const prev = previouslyFocused.current
      if (prev && typeof prev.focus === 'function') {
        prev.focus()
      }
    }
    // Re-run only when the dialog opens or closes. Callbacks are read from refs
    // so callers can pass inline functions without re-arming the listener.
  }, [open, initialFocusRef])

  return {
    ref: panelRef,
    role: 'dialog',
    'aria-modal': true,
    tabIndex: -1,
    ...(titleId !== undefined ? { 'aria-labelledby': titleId } : {}),
  }
}

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
