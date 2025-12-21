import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from './lib/ThemeContext'
import { GameProvider } from './lib/GameContext'
import Header from './components/Header'

// Lazy load all pages for code splitting
const Homepage = lazy(() => import('./pages/Homepage'))
const Result = lazy(() => import('./pages/Result'))
const Game = lazy(() => import('./pages/Game'))
const Technique = lazy(() => import('./pages/Technique'))
const Custom = lazy(() => import('./pages/Custom'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))

// Loading fallback component
const PageLoading = () => (
  <div className="flex items-center justify-center h-full">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
  </div>
)

function AppContent() {
  const location = useLocation()
  
  // Game pages need less padding (slim header)
  // Game routes: /c/* for custom, or /:seed for daily/practice (anything not a known route)
  const knownRoutes = ['/', '/r', '/techniques', '/technique', '/custom', '/leaderboard']
  const isKnownRoute = knownRoutes.some(route => 
    location.pathname === route || location.pathname.startsWith(route + '/')
  )
  const isGamePage = location.pathname.startsWith('/c/') ||
                     (!isKnownRoute && location.pathname !== '/')

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background text-foreground">
      <Header />
      <main className={`flex-1 overflow-y-auto scrollbar-hide ${isGamePage ? '' : 'pt-16'}`}>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Homepage />} />
            <Route path="/c/:encoded" element={<Game />} />
            <Route path="/r" element={<Result />} />
            <Route path="/techniques" element={<Technique />} />
            <Route path="/techniques/:slug" element={<Technique />} />
            <Route path="/technique/:slug" element={<Technique />} />
            <Route path="/custom" element={<Custom />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            {/* Catch-all for puzzles: /:seed (daily if YYYYMMDD format, otherwise practice) */}
            <Route path="/:seed" element={<Game />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

function App() {

  return (
    <ThemeProvider>
      <GameProvider>
        <AppContent />
      </GameProvider>
    </ThemeProvider>
  )
}

export default App
