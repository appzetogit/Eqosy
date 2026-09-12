import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Error Boundary caught:', error, errorInfo)
  }

  handleReload = () => {
    try {
      window.sessionStorage.removeItem('page-has-been-refreshed')
    } catch {
      // ignore
    }
    window.location.reload()
  }

  handleGoHome = () => {
    try {
      window.sessionStorage.removeItem('page-has-been-refreshed')
    } catch {
      // ignore
    }
    window.location.href = '/food/user'
  }

  render() {
    if (this.state.hasError) {
      const isModuleFetchError =
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Importing a module script failed') ||
        this.state.error?.name === 'TypeError'

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8">
          <div className="max-w-md w-full text-center bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {isModuleFetchError ? 'Connection or Update Issue' : 'Something went wrong'}
            </h2>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {isModuleFetchError
                ? 'Failed to load the required application module. The server may have updated or reconnected. Please refresh.'
                : 'An unexpected error occurred in the application view.'}
            </p>

            {this.state.error?.message && (
              <details className="mb-6 text-left bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-red-600 dark:text-red-400 overflow-x-auto max-h-32">
                <summary className="cursor-pointer font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  Technical details
                </summary>
                <p className="mt-2 font-mono break-all">{this.state.error.toString()}</p>
              </details>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl shadow-sm transition-colors duration-200 text-sm"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleGoHome}
                className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-xl transition-colors duration-200 text-sm"
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
