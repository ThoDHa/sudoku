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
  const isGamePage = location.pathname.startsWith('/p/') || 
                     location.pathname.startsWith('/game/') || 
                     location.pathname.startsWith('/c/')

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background text-foreground">
      <Header />
      <main className={`flex-1 overflow-y-auto scrollbar-hide ${isGamePage ? '' : 'pt-16'}`}>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Homepage />} />
            <Route path="/p/:seed" element={<Game />} />
            <Route path="/game/:seed" element={<Game />} />
            <Route path="/c/:encoded" element={<Game />} />
            <Route path="/r" element={<Result />} />
            <Route path="/techniques" element={<Technique />} />
            <Route path="/techniques/:slug" element={<Technique />} />
            <Route path="/technique/:slug" element={<Technique />} />
            <Route path="/custom" element={<Custom />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
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
