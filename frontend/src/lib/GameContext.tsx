import { createContext, useContext, useState, useMemo, ReactNode } from 'react'

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

  const contextValue = useMemo(() => ({ gameState, setGameState }), [gameState])

  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- Hook is co-located with context provider for better organization
export function useGameContext() {
  return useContext(GameContext)
}
