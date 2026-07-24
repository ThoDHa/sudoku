import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { checkCacheVersion } from './lib/cache-version'
import { getOfflineModeEnabled } from './lib/gameSettings'
import { registerOfflineMode } from './lib/pwaRegistration'
import { logger } from './lib/logger'
import './index.css'

import log from 'loglevel'

// Type declaration for recovery script in index.html and global logger
declare global {
  interface Window {
    __markAppReady?: () => void
    logger?: typeof log
  }
}

// Attach logger globally for wasm_exec.js and other runtime code
window.logger = logger

// Get base path from Vite's BASE_URL (set during build)
// This handles GitHub Pages subpath (/sudoku/) vs root deployment (/)
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || ''

// Check cache version before app starts
void checkCacheVersion().then((cacheCleared) => {
  if (cacheCleared) {
    logger.warn('Cache was cleared due to version update - fresh content loaded')
  }
})

// Register the PWA service worker only when the user has opted into offline mode
// (default OFF). Default visitors get no service worker; toggling it on in the
// menu calls registerOfflineMode() directly, and toggling off unregisters the
// worker and wipes the caches (see pwaRegistration.ts).
if (getOfflineModeEnabled()) {
  registerOfflineMode()
}

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
