import { createContext, useContext, useState, ReactNode } from 'react'

interface GameState {
  isPlaying: boolean
  difficulty: string
  elapsedMs: number
  historyCount: number
  isComplete: boolean
  onHint: (() => void) | null
  onHistory: (() => void) | null
  onAutoFillNotes: (() => void) | null
}

interface GameContextType {
  gameState: GameState | null
  setGameState: (state: GameState | null) => void
}

const GameContext = createContext<GameContextType>({
  gameState: null,
  setGameState: () => {},
})

export function GameProvider({ children }: { children: ReactNode }) {
  const [gameState, setGameState] = useState<GameState | null>(null)

  return (
    <GameContext.Provider value={{ gameState, setGameState }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGameContext() {
  return useContext(GameContext)
}
