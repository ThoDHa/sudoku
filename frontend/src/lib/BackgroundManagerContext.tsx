import { createContext, useContext, ReactNode } from 'react'
import { useBackgroundManager } from '../hooks/useBackgroundManager'

// The return type of useBackgroundManager
type BackgroundManagerReturn = ReturnType<typeof useBackgroundManager>

// Create context with undefined default - will be provided by the provider
const BackgroundManagerContext = createContext<BackgroundManagerReturn | undefined>(undefined)

/**
 * Provider that creates a single BackgroundManager instance to be shared
 * across the entire app. This reduces event listener count from 32+ to just 8.
 */
export function BackgroundManagerProvider({ children }: { children: ReactNode }) {
  const backgroundManager = useBackgroundManager()

  return (
    <BackgroundManagerContext.Provider value={backgroundManager}>
      {children}
    </BackgroundManagerContext.Provider>
  )
}

/**
 * Hook to access the shared BackgroundManager instance.
 * Must be used within a BackgroundManagerProvider.
 */
export function useBackgroundManagerContext(): BackgroundManagerReturn {
  const context = useContext(BackgroundManagerContext)
  
  if (context === undefined) {
    throw new Error('useBackgroundManagerContext must be used within a BackgroundManagerProvider')
  }
  
  return context
}
