import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { checkCacheVersion } from './lib/cache-version'
import { logger } from './lib/logger'
import './index.css'

// Type declaration for recovery script in index.html
declare global {
  interface Window {
    __markAppReady?: () => void;
  }
}

// Get base path from Vite's BASE_URL (set during build)
// This handles GitHub Pages subpath (/sudoku/) vs root deployment (/)
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || ''

// Check cache version before app starts
checkCacheVersion().then(cacheCleared => {
  if (cacheCleared) {
    logger.warn('Cache was cleared due to version update - fresh content loaded')
  }
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)

// Signal that the app has booted successfully (for BFCache recovery script in index.html)
// This prevents the recovery script from reloading the page unnecessarily
window.__markAppReady?.()
