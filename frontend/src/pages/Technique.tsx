import { Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import { getTechniqueBySlug, getTechniquesByTier, TechniqueInfo } from '../lib/techniques'
import { TIERS } from '../lib/constants'
import { TierBadge, HowToPlayContent, ChevronRightIcon } from '../components/ui'
import TechniqueDetailView from '../components/TechniqueDetailView'

function TechniqueCard({ technique }: { technique: TechniqueInfo }) {
  return (
    <Link
      to={`/technique/${technique.slug}`}
      className="block rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4 transition-shadow hover:shadow-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text)]">{technique.title}</h3>
        <TierBadge tier={technique.tier} />
      </div>
      <p className="text-sm text-[var(--text-muted)] line-clamp-2">{technique.description}</p>
    </Link>
  )
}

export default function Technique() {
  const { slug } = useParams<{ slug: string }>()

  // If no slug, show technique index with How to Play at the top
  if (!slug) {
    const simpleTechniques = getTechniquesByTier('Simple')
    const mediumTechniques = getTechniquesByTier('Medium')
    const hardTechniques = getTechniquesByTier('Hard')
    const notImplementedTechniques = getTechniquesByTier('NotImplemented')

    return (
      <div className="mx-auto max-w-4xl p-6 bg-[var(--bg)] h-full">
        <div className="mb-8">
          <Link to="/" className="text-sm text-[var(--accent)] hover:underline">
            &larr; Back to puzzles
          </Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold text-[var(--text)]">📚 Learn Sudoku</h1>
        <p className="mb-8 text-[var(--text-muted)]">
          Master the techniques used to solve Sudoku puzzles without guessing.
        </p>

        {/* How to Play Section */}
        <section className="mb-10">
          <Link
            to="/techniques/how-to-play"
            className="mb-4 flex w-full items-center justify-between rounded-lg border-2 border-[var(--accent)] bg-[var(--accent-light)] p-4 text-left transition-colors hover:opacity-90"
          >
            <div>
              <h2 className="text-lg font-semibold text-[var(--accent)]">🎮 How to Play Sudoku</h2>
              <p className="text-sm text-[var(--accent)]/80">New to Sudoku? Start here to learn the basics.</p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-[var(--accent)]" />
          </Link>
        </section>

        {/* Techniques by Tier */}
        {TIERS.filter(tier => tier !== 'NotImplemented').map((tier) => {
          const techniques = tier === 'Simple' ? simpleTechniques 
            : tier === 'Medium' ? mediumTechniques 
            : hardTechniques
          
          const tierColors = {
            Simple: 'text-green-700 dark:text-green-400',
            Medium: 'text-yellow-700 dark:text-yellow-400',
            Hard: 'text-red-700 dark:text-red-400',
          }
          
          const tierEmojis = {
            Simple: '🌱',
            Medium: '🌿',
            Hard: '🌳',
          }
          
          const tierDescriptions = {
            Simple: 'These are the foundational techniques. Most easy and medium puzzles can be solved using only these.',
            Medium: 'These techniques handle harder patterns. Required for hard difficulty puzzles.',
            Hard: 'Advanced techniques for expert-level puzzles. These require careful chain reasoning.',
          }
          
          return (
            <section key={tier} className="mb-8">
              <h2 className={`mb-4 text-xl font-semibold ${tierColors[tier]}`}>{tierEmojis[tier]} {tier} Techniques</h2>
              <p className="mb-4 text-sm text-[var(--text-muted)]">
                {tierDescriptions[tier]}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {techniques.map((t) => (
                  <TechniqueCard key={t.slug} technique={t} />
                ))}
              </div>
            </section>
          )
        })}

        {/* Not Implemented / Coming Soon Section */}
        {notImplementedTechniques.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-slate-600 dark:text-slate-400">🔬 Advanced (Coming Soon)</h2>
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              These advanced techniques are documented but not yet implemented in the solver. They represent the cutting edge of human solving methods.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {notImplementedTechniques.map((t) => (
                <TechniqueCard key={t.slug} technique={t} />
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  // Special case: How to Play page
  if (slug === 'how-to-play') {
    return (
      <div className="mx-auto max-w-3xl p-6 bg-[var(--bg)] h-full">
        <div className="mb-8">
          <Link to="/techniques" className="text-sm text-[var(--accent)] hover:underline">
            &larr; All techniques
          </Link>
        </div>

        <h1 className="mb-6 text-3xl font-bold text-[var(--text)]">How to Play Sudoku</h1>
        
        <HowToPlayContent />

        <div className="mt-8 border-t border-[var(--border-light)] pt-6">
          <p className="mb-4 text-sm text-[var(--text-muted)]">Ready to learn specific techniques?</p>
          <div className="flex flex-wrap gap-3">
            <Link 
              to="/technique/naked-single" 
              className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-secondary)] px-4 py-2 text-sm text-[var(--accent)] hover:bg-[var(--btn-hover)]"
            >
              Start with Naked Single
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
            <Link 
              to="/" 
              className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-[var(--btn-active-text)] hover:opacity-90"
            >
              Try a puzzle
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Show specific technique
  const technique = getTechniqueBySlug(slug)

  if (!technique) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--bg)]">
        <h1 className="mb-4 text-2xl font-bold text-[var(--text)]">Technique not found</h1>
        <Link to="/techniques" className="text-[var(--accent)] hover:underline">
          View all techniques
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6 bg-[var(--bg)] h-full">
      <div className="mb-8">
        <Link to="/techniques" className="text-sm text-[var(--accent)] hover:underline">
          &larr; All techniques
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-3xl font-bold text-[var(--text)]">{technique.title}</h1>
        <TierBadge tier={technique.tier} size="md" />
      </div>

      <div className="mb-8 rounded-lg bg-[var(--bg-secondary)] p-4">
        <p className="text-lg text-[var(--text)]">{technique.description}</p>
      </div>

      <TechniqueDetailView technique={technique} variant="page" />

      <div className="border-t border-[var(--border-light)] pt-6">
        <Link to="/" className="text-[var(--accent)] hover:underline">
          Try a puzzle &rarr;
        </Link>
      </div>
    </div>
  )
}
