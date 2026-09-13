import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import { GameProvider, useGameContext } from './GameContext'

describe('GameContext default value', () => {
  it('exposes a null gameState and a callable no-op setGameState outside a provider', () => {
    let context: ReturnType<typeof useGameContext> | undefined
    const Consumer = () => {
      context = useGameContext()
      return null
    }

    render(<Consumer />)

    expect(context).toBeDefined()
    expect(context!.gameState).toBeNull()
    expect(typeof context!.setGameState).toBe('function')
    expect(() => context!.setGameState(null)).not.toThrow()
  })
})

describe('GameProvider', () => {
  it('publishes gameState updates to consumers when setGameState is called', () => {
    let context: ReturnType<typeof useGameContext> | undefined
    const Consumer = () => {
      context = useGameContext()
      return <div data-testid="game-state">{context!.gameState?.difficulty ?? 'none'}</div>
    }

    const { getByTestId } = render(
      <GameProvider>
        <Consumer />
      </GameProvider>,
    )
    expect(getByTestId('game-state').textContent).toBe('none')

    act(() => {
      context!.setGameState({
        isPlaying: true,
        difficulty: 'medium',
        elapsedMs: 5000,
        historyCount: 2,
        isComplete: false,
        onHint: null,
        onHistory: null,
        onAutoFillNotes: null,
      })
    })

    expect(context!.gameState).not.toBeNull()
    expect(context!.gameState!.difficulty).toBe('medium')
    expect(context!.gameState!.elapsedMs).toBe(5000)
    expect(context!.gameState!.historyCount).toBe(2)
    expect(context!.gameState!.isComplete).toBe(false)
    expect(getByTestId('game-state').textContent).toBe('medium')

    act(() => {
      context!.setGameState(null)
    })
    expect(context!.gameState).toBeNull()
    expect(getByTestId('game-state').textContent).toBe('none')
  })
})
