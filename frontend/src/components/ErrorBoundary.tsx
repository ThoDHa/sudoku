import { Component, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

// Check if we're in development mode (Vite-compatible)
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="text-6xl mb-4">😵</div>
            <h1 className="text-2xl font-bold text-[var(--text)] mb-2">
              Something went wrong
            </h1>
            <p className="text-[var(--text-muted)] mb-6">
              We're sorry, but something unexpected happened. Please try reloading the page.
            </p>
            <button
              onClick={this.handleReload}
              className="px-6 py-3 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Reload
            </button>
            {isDev && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-[var(--text-muted)] text-sm">
                  Error details
                </summary>
                <pre className="mt-2 p-3 bg-[var(--btn-bg)] rounded text-xs text-[var(--text)] overflow-auto">
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
