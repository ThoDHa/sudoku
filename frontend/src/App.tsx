import { Routes, Route, useLocation } from 'react-router-dom'
import { ThemeProvider } from './lib/ThemeContext'
import { GameProvider } from './lib/GameContext'
import Header from './components/Header'
import Homepage from './pages/Homepage'
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
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Header />
      <main className={isGamePage ? '' : 'pt-14'}>
        <Routes>
          <Route path="/" element={<Homepage />} />
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
  return (
    <ThemeProvider>
      <GameProvider>
        <AppContent />
      </GameProvider>
    </ThemeProvider>
  )
}

export default App
