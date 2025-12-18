import { getTechniqueBySlug } from '../lib/techniques'
import { TierBadge, CloseIcon } from './ui'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--bg)] p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--btn-hover)] hover:text-[var(--text)]"
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-[var(--text)]">{technique.title}</h2>
            {info && <TierBadge tier={info.tier} />}
          </div>
        </div>

        {info ? (
          <TechniqueDetailView technique={info} variant="modal" />
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            No detailed information available for this technique yet.
          </p>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg border border-[var(--border-light)] py-2 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
