import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Get base path from Vite's BASE_URL (set during build)
// This handles GitHub Pages subpath (/sudoku/) vs root deployment (/)
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
