import { Link } from 'react-router-dom'

export default function About() {
  return (
    <div className="page-container">
      <div className="back-link">
        <Link to="/" className="text-accent hover:underline">
          &larr; Back to puzzles
        </Link>
      </div>

      <h1 className="page-title text-foreground">About Sudoku</h1>
      <p className="mb-8 text-foreground-muted" style={{ fontSize: 'var(--text-base)' }}>
        A free, educational Sudoku app designed to help you learn and improve.
      </p>

      {/* Hero Section */}
      <section className="mb-10">
        <div className="rounded-lg border-2 border-accent bg-accent-light p-6">
          <h2 className="mb-3 text-xl font-semibold text-accent">Learn, Don't Just Solve</h2>
          <p className="text-foreground" style={{ fontSize: 'var(--text-base)' }}>
            This isn't just another Sudoku app. It's built to teach you <em>how</em> to solve puzzles 
            using real techniques — the same methods expert solvers use. No guessing, no trial and error, 
            just logical deduction.
          </p>
        </div>
      </section>

      {/* Feature Cards */}
      <div className="content-grid sm:grid-cols-2 mb-10">
        {/* Technique Hints */}
        <div className="content-card rounded-lg border border-board-border-light bg-background-secondary p-5">
          <div className="mb-3 text-2xl">❓</div>
          <h3 className="mb-2 font-semibold text-foreground">Technique Hints</h3>
          <p className="text-sm text-foreground-muted">
            Stuck on a puzzle? Instead of just showing you the answer, we'll tell you which 
            technique to look for next. This helps you learn to recognize patterns yourself.
          </p>
        </div>

        {/* Step-by-Step Hints */}
        <div className="content-card rounded-lg border border-board-border-light bg-background-secondary p-5">
          <div className="mb-3 text-2xl">💡</div>
          <h3 className="mb-2 font-semibold text-foreground">Step-by-Step Hints</h3>
          <p className="text-sm text-foreground-muted">
            Still stuck after knowing the technique? Use the full hint to see exactly where 
            and how to apply it. Highlighted cells show you the pattern in action.
          </p>
        </div>

        {/* Learn Techniques */}
        <div className="content-card rounded-lg border border-board-border-light bg-background-secondary p-5">
          <div className="mb-3 text-2xl">📚</div>
          <h3 className="mb-2 font-semibold text-foreground">Technique Library</h3>
          <p className="text-sm text-foreground-muted">
            Browse our collection of solving techniques with explanations and interactive 
            diagrams. From basic singles to advanced chains — learn them all.
          </p>
          <Link to="/techniques" className="mt-3 inline-block text-sm text-accent hover:underline">
            Explore techniques &rarr;
          </Link>
        </div>

        {/* Difficulty Progression */}
        <div className="content-card rounded-lg border border-board-border-light bg-background-secondary p-5">
          <div className="mb-3 text-2xl">📈</div>
          <h3 className="mb-2 font-semibold text-foreground">Progressive Difficulty</h3>
          <p className="text-sm text-foreground-muted">
            Puzzles are graded by the techniques required to solve them. Start with Easy 
            puzzles using basic techniques, then work your way up as you master new skills.
          </p>
        </div>
      </div>

      {/* Solver Section */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-foreground">🤖 The Solver</h2>
        <div className="rounded-lg border border-board-border-light bg-background-secondary p-5">
          <p className="mb-4 text-foreground-muted" style={{ fontSize: 'var(--text-base)' }}>
            Our solver uses the same human-like techniques to solve puzzles step by step. 
            But it has a superpower: <strong className="text-foreground">it can fix your mistakes</strong>.
          </p>
          <p className="mb-4 text-foreground-muted" style={{ fontSize: 'var(--text-base)' }}>
            Made a wrong move somewhere? The auto-solve feature will attempt to solve the 
            puzzle from its current state — even if you've made errors. It backtracks, 
            corrects, and finds a path to the solution.
          </p>
          <p className="mb-4 text-foreground-muted" style={{ fontSize: 'var(--text-base)' }}>
            <strong className="text-foreground">Pause and step through:</strong> While the solver is paused, 
            use undo/redo to step backward and forward through the moves. Toast messages will 
            explain each step, helping you understand the technique being applied.
          </p>
          <p className="text-foreground-muted" style={{ fontSize: 'var(--text-base)' }}>
            This means you can experiment freely. Try a move, see where it leads, and if 
            you get stuck, let the solver guide you back on track.
          </p>
        </div>
      </section>

      {/* Custom Puzzles */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-foreground">🧩 Custom Puzzles</h2>
        <div className="rounded-lg border border-board-border-light bg-background-secondary p-5">
          <p className="mb-4 text-foreground-muted" style={{ fontSize: 'var(--text-base)' }}>
            Found a puzzle in a newspaper or book? Enter it into our custom puzzle mode 
            and use all the same hints and techniques to solve it. We'll validate that 
            your puzzle has exactly one solution before you start.
          </p>
          <Link to="/custom" className="inline-block text-accent hover:underline">
            Try custom puzzle &rarr;
          </Link>
        </div>
      </section>

      {/* Philosophy */}
      <section className="mb-10">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Our Philosophy</h2>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-shrink-0 text-xl">✨</div>
            <div>
              <h3 className="font-semibold text-foreground">Free & No Ads</h3>
              <p className="text-sm text-foreground-muted">
                Completely free to use. No ads, no premium tiers, no data collection.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 text-xl">🧠</div>
            <div>
              <h3 className="font-semibold text-foreground">Learn by Doing</h3>
              <p className="text-sm text-foreground-muted">
                The best way to learn techniques is to use them on real puzzles. 
                Our hints guide you without robbing you of the satisfaction of solving.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-shrink-0 text-xl">🎯</div>
            <div>
              <h3 className="font-semibold text-foreground">No Guessing Required</h3>
              <p className="text-sm text-foreground-muted">
                Every puzzle can be solved using logic alone. Our techniques prove 
                each step — no bifurcation or trial-and-error needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Open Source */}
      <section className="mb-6">
        <div className="rounded-lg border border-board-border-light bg-background-secondary p-5 text-center">
          <p className="text-foreground-muted" style={{ fontSize: 'var(--text-base)' }}>
            This project is open source. Found a bug or have a suggestion?
          </p>
          <a 
            href="https://github.com/ThoDHa/sudoku/issues" 
            target="_blank" 
            rel="noopener noreferrer"
            className="mt-2 inline-block text-accent hover:underline"
          >
            Report an issue on GitHub &rarr;
          </a>
        </div>
      </section>
    </div>
  )
}
