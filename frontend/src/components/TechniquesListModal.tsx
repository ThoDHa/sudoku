import { useState } from 'react'
import { getDisplayTechniques, type TechniqueInfo } from '../lib/techniques'
import { TIERS } from '../lib/constants'
import { TierBadge, HowToPlayContent, CloseIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon } from './ui'
import TechniqueDetailView from './TechniqueDetailView'

interface TechniquesListModalProps {
  isOpen: boolean
  onClose: () => void
}

type ViewState = 'list' | 'overview' | TechniqueInfo

const displayTechniques = getDisplayTechniques()

export default function TechniquesListModal({ isOpen, onClose }: TechniquesListModalProps) {
  const [view, setView] = useState<ViewState>('list')
  const [filterTier, setFilterTier] = useState<string | null>(null)

  if (!isOpen) return null

  const filteredTechniques = filterTier
    ? displayTechniques.filter((t) => t.tier === filterTier)
    : displayTechniques

  const selectedTechnique = typeof view === 'object' ? view : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-[var(--bg)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-light)] p-4">
          <div className="flex items-center gap-3">
            {view !== 'list' ? (
              <button
                onClick={() => setView('list')}
                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--btn-hover)]"
              >
                <ChevronLeftIcon />
              </button>
            ) : null}
            <h2 className="text-lg font-bold text-[var(--text)]">
              {view === 'overview' ? 'How to Play Sudoku' : selectedTechnique ? selectedTechnique.title : 'Techniques'}
            </h2>
            {selectedTechnique && (
              <TierBadge tier={selectedTechnique.tier} />
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--btn-hover)]"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === 'overview' ? (
            <HowToPlayContent />
          ) : selectedTechnique ? (
            <TechniqueDetailView 
              technique={selectedTechnique} 
              variant="modal"
              onRelatedClick={(t) => setView(t)}
              showTips
            />
          ) : (
            // Techniques list view
            <>
              {/* How to Play button */}
              <button
                onClick={() => setView('overview')}
                className="mb-4 flex w-full items-center justify-between rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-light)] p-3 text-left transition-colors hover:opacity-90"
              >
                <div className="flex items-center gap-3">
                  <InfoIcon className="h-5 w-5 text-[var(--accent)]" />
                  <span className="font-medium text-[var(--accent)]">How to Play Sudoku</span>
                </div>
                <ChevronRightIcon className="h-4 w-4 text-[var(--accent)]" />
              </button>

              {/* Filter tabs */}
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setFilterTier(null)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    filterTier === null
                      ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                  }`}
                >
                  All
                </button>
                {TIERS.map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setFilterTier(tier)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      filterTier === tier
                        ? 'bg-[var(--accent)] text-[var(--btn-active-text)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text)] hover:bg-[var(--btn-hover)]'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>

              {/* Techniques grid */}
              <div className="grid gap-2">
                {filteredTechniques.map((technique) => (
                  <button
                    key={technique.slug}
                    onClick={() => setView(technique)}
                    className="flex items-center justify-between rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 text-left transition-colors hover:bg-[var(--btn-hover)]"
                  >
                    <div className="flex items-center gap-3">
                      <TierBadge tier={technique.tier} />
                      <span className="font-medium text-[var(--text)]">{technique.title}</span>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 text-[var(--text-muted)]" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-light)] p-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-[var(--border-light)] py-2 font-medium text-[var(--text)] transition-colors hover:bg-[var(--btn-hover)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
