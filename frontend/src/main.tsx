import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { checkCacheVersion } from './lib/cache-version'
import './index.css'

// Get base path from Vite's BASE_URL (set during build)
// This handles GitHub Pages subpath (/sudoku/) vs root deployment (/)
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || ''

// Check cache version before app starts
checkCacheVersion().then(cacheCleared => {
  if (cacheCleared) {
    console.log('Cache was cleared due to version update - fresh content loaded')
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
