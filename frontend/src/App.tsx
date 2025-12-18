import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from './lib/ThemeContext'
import { GameProvider } from './lib/GameContext'
import { initializeSolver } from './lib/solver-service'
import Header from './components/Header'
import Daily from './pages/Daily'
import DifficultySelect from './pages/DifficultySelect'
import Result from './pages/Result'
import Game from './pages/Game'
import Technique from './pages/Technique'
import Custom from './pages/Custom'
import Leaderboard from './pages/Leaderboard'

function AppContent() {
  const location = useLocation()
  
  // Game pages need less padding (slim header)
  const isGamePage = location.pathname.startsWith('/p/') || 
                     location.pathname.startsWith('/game/') || 
                     location.pathname.startsWith('/c/')

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <Header />
      <main className={`flex-1 overflow-y-auto scrollbar-hide ${isGamePage ? '' : 'pt-14'}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/daily" replace />} />
          <Route path="/daily" element={<Daily />} />
          <Route path="/play" element={<DifficultySelect />} />
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
      </main>
    </div>
  )
}

function App() {
  // Initialize solver (WASM) on app startup
  useEffect(() => {
    initializeSolver().catch((err) => {
      console.error('Failed to initialize WASM solver:', err)
    })
  }, [])

  return (
    <ThemeProvider>
      <GameProvider>
        <AppContent />
      </GameProvider>
    </ThemeProvider>
  )
}

export default App
