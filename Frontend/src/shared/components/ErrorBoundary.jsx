import React from 'react'
import { resolveCurrentAppHomeRoute } from '../utils/activeModule.js'

const isModuleChunkError = (error) => {
  if (!error) return false
  const msg = String(error?.message || error?.toString() || '').toLowerCase()
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror')
  )
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  componentDidMount() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
    }
  }

  componentWillUnmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
    }
  }

  handleOnline = () => {
    if (this.state.hasError) {
      this.setState({ hasError: false, error: null })
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Error Boundary caught:', error, errorInfo)

    // Automatically recover from module fetch / dev HMR update errors
    if (isModuleChunkError(error)) {
      this.triggerAutoRecovery()
    }
  }

  triggerAutoRecovery = () => {
    try {
      const lastReload = Number(sessionStorage.getItem('chunk-auto-reload-ts') || 0)
      const count = Number(sessionStorage.getItem('chunk-auto-reload-count') || 0)
      const now = Date.now()

      // Avoid rapid reload loop if server is unreachable (tried > 2 times within 6 seconds)
      if (now - lastReload < 6000 && count >= 2) {
        console.warn('[ErrorBoundary] Module reload limit reached, showing manual fallback.')
        return
      }

      const nextCount = now - lastReload < 15000 ? count + 1 : 1
      sessionStorage.setItem('chunk-auto-reload-ts', String(now))
      sessionStorage.setItem('chunk-auto-reload-count', String(nextCount))

      // Silent clean reload to fetch updated bundle
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }

  handleReload = () => {
    try {
      window.sessionStorage.removeItem('chunk-auto-reload-ts')
      window.sessionStorage.removeItem('chunk-auto-reload-count')
      window.sessionStorage.removeItem('page-has-been-refreshed')
    } catch {
      // ignore
    }
    const rawPath = String(window.location?.pathname || '').replace(/\/index\.html$/i, '') || '/'
    const hash = String(window.location?.hash || '')
    // If stuck at root in WebView or blank path, ensure reload navigates to the active app home
    if ((rawPath === '/' || rawPath === '') && (!hash || hash === '#/' || hash === '#')) {
      const home = resolveCurrentAppHomeRoute()
      if (home && home !== '/') {
        if (hash.startsWith('#/')) {
          window.location.hash = `#${home}`
          window.location.reload()
        } else {
          window.location.href = home
        }
        return
      }
    }
    window.location.reload()
  }

  handleGoHome = () => {
    try {
      window.sessionStorage.removeItem('chunk-auto-reload-ts')
      window.sessionStorage.removeItem('chunk-auto-reload-count')
      window.sessionStorage.removeItem('page-has-been-refreshed')
    } catch {
      // ignore
    }
    const homeRoute = resolveCurrentAppHomeRoute()
    if (window.location?.hash?.startsWith('#/')) {
      window.location.hash = `#${homeRoute}`
      window.location.reload()
    } else {
      window.location.href = homeRoute
    }
  }

  render() {
    if (this.state.hasError) {
      const isModuleErr = isModuleChunkError(this.state.error)

      // When module fetch error happens, automatically reload in the background.
      // While reloading, show a smooth update spinner instead of the disruptive error box!
      if (isModuleErr) {
        let reloadCount = 0
        try {
          reloadCount = Number(sessionStorage.getItem('chunk-auto-reload-count') || 0)
        } catch { /* ignore */ }

        if (reloadCount <= 2) {
          return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
              <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">Updating application...</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Applying latest changes</p>
            </div>
          )
        }
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8">
          <div className="max-w-md w-full text-center bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {isModuleErr ? 'Connection or Update Issue' : 'Something went wrong'}
            </h2>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {isModuleErr
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
