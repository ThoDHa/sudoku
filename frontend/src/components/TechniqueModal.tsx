import { getTechniqueBySlug } from '../lib/techniques'
import { TierBadge, CloseIcon } from './ui'
import { Dialog } from './Dialog'
import TechniqueDetailView from './TechniqueDetailView'

interface TechniqueModalProps {
  isOpen: boolean
  onClose: () => void
  technique: {
    title: string
    slug: string
  } | null
}

export default function TechniqueModal({ isOpen, onClose, technique }: TechniqueModalProps) {
  if (!isOpen || !technique) return null

  const info = getTechniqueBySlug(technique.slug)

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      titleId="technique-modal-title"
      panelClassName="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-background p-6 shadow-2xl"
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full p-1 text-foreground-muted hover:bg-btn-hover hover:text-foreground"
        aria-label="Close"
      >
        <CloseIcon />
      </button>

      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 id="technique-modal-title" className="text-xl font-bold text-foreground">
            {technique.title}
          </h2>
          {info && <TierBadge tier={info.tier} />}
        </div>
      </div>

      {info ? (
        <TechniqueDetailView technique={info} variant="modal" />
      ) : (
        <p className="text-sm text-foreground-muted">
          No detailed information available for this technique yet.
        </p>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="mt-6 w-full rounded-lg border border-board-border-light py-2 font-medium text-foreground transition-colors hover:bg-btn-hover"
      >
        Got it
      </button>
    </Dialog>
  )
}
