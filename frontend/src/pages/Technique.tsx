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
      className="block rounded-lg border border-board-border-light bg-background-secondary p-4 transition-shadow hover:shadow-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{technique.title}</h3>
        <TierBadge tier={technique.tier} />
      </div>
      <p className="text-sm text-foreground-muted line-clamp-2">{technique.description}</p>
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
      <div className="page-container">
        <div className="back-link">
          <Link to="/" className="text-accent hover:underline">
            &larr; Back to puzzles
          </Link>
        </div>

        <h1 className="page-title text-foreground">📚 Learn Sudoku</h1>
        <p className="mb-8 text-foreground-muted" style={{ fontSize: 'var(--text-base)' }}>
          Master the techniques used to solve Sudoku puzzles without guessing.
        </p>

        {/* How to Play Section */}
        <section className="mb-10">
          <Link
            to="/techniques/how-to-play"
            className="mb-4 flex w-full items-center justify-between rounded-lg border-2 border-accent bg-accent-light p-4 text-left transition-colors hover:opacity-90"
          >
            <div>
              <h2 className="text-lg font-semibold text-accent">🎮 How to Play Sudoku</h2>
              <p className="text-sm text-accent/80">New to Sudoku? Start here to learn the basics.</p>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-accent" />
          </Link>
        </section>

        {/* Techniques by Tier */}
        {TIERS.filter(tier => tier !== 'NotImplemented').map((tier) => {
          const techniques = tier === 'Simple' ? simpleTechniques 
            : tier === 'Medium' ? mediumTechniques 
            : hardTechniques
          
          const tierColors = {
            Simple: 'text-diff-easy',
            Medium: 'text-diff-medium',
            Hard: 'text-diff-extreme',
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
              <p className="mb-4 text-sm text-foreground-muted">
                {tierDescriptions[tier]}
              </p>
              <div className="content-grid sm:grid-cols-2">
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
            <h2 className="mb-4 text-xl font-semibold text-foreground-muted">🔬 Advanced (Coming Soon)</h2>
            <p className="mb-4 text-sm text-foreground-muted">
              These advanced techniques are documented but not yet implemented in the solver. They represent the cutting edge of human solving methods.
            </p>
            <div className="content-grid sm:grid-cols-2">
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
      <div className="page-container max-w-3xl">
        <div className="mb-8">
          <Link to="/techniques" className="text-sm text-accent hover:underline">
            &larr; All techniques
          </Link>
        </div>

        <h1 className="mb-6 text-3xl font-bold text-foreground">How to Play Sudoku</h1>
        
        <HowToPlayContent />

        <div className="mt-8 border-t border-board-border-light pt-6">
          <p className="mb-4 text-sm text-foreground-muted">Ready to learn specific techniques?</p>
          <div className="flex flex-wrap gap-3">
            <Link 
              to="/technique/naked-single" 
              className="inline-flex items-center gap-1 rounded-full bg-background-secondary px-4 py-2 text-sm text-accent hover:bg-btn-hover"
            >
              Start with Naked Single
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
            <Link 
              to="/" 
              className="inline-flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-sm text-btn-active-text hover:opacity-90"
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
      <div className="flex h-full flex-col items-center justify-center bg-background">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Technique not found</h1>
        <Link to="/techniques" className="text-accent hover:underline">
          View all techniques
        </Link>
      </div>
    )
  }

  return (
    <div className="page-container max-w-3xl">
      <div className="mb-8">
        <Link to="/techniques" className="text-sm text-accent hover:underline">
          &larr; All techniques
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-3xl font-bold text-foreground">{technique.title}</h1>
        <TierBadge tier={technique.tier} size="md" />
      </div>

      <div className="mb-8 rounded-lg bg-background-secondary p-4">
        <p className="text-lg text-foreground">{technique.description}</p>
      </div>

      <TechniqueDetailView technique={technique} variant="page" />

      <div className="border-t border-board-border-light pt-6">
        <Link to="/" className="text-accent hover:underline">
          Try a puzzle &rarr;
        </Link>
      </div>
    </div>
  )
}
