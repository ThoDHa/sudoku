import { useEffect, useRef, type RefObject } from 'react'

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
// Stryker disable next-line ArrayDeclaration: the only generated replacement is ["Stryker was here"], a constant; openDialogs is read only through isTopmost's last-element comparison and per-panel indexOf/splice, so a sentinel first element is never observed
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
        // Non-empty past the early return above, so the two indexed reads are
        // always defined elements. The assertions keep the index arithmetic
        // (whose mutants this file is measured by) alive: an `as` cast would
        // suppress mutant generation across the indexed expression.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const first = focusable[0]!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const last = focusable[focusable.length - 1]!
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
      // Every effect run pushes the panel before returning this cleanup, so the
      // panel is always present here; splice's -1 shorthand cannot misfire.
      openDialogs.splice(openDialogs.indexOf(panel), 1)
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
