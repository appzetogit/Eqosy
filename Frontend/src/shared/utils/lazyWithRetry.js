import { lazy } from 'react'

/**
 * Enhanced React.lazy wrapper that automatically handles failed dynamic module imports
 * caused by Vite dev server restarts, network blips, or HMR cache invalidations.
 *
 * @param {Function} componentImport - Dynamic import function, e.g., () => import('./MyModule')
 * @returns {React.Component} Lazy-loaded component with retry capability
 */
export function lazyWithRetry(componentImport, maxRetries = 3, delayMs = 500) {
  return lazy(async () => {
    const pageHasBeenRefreshed = Boolean(
      typeof window !== 'undefined' &&
        window.sessionStorage.getItem('page-has-been-refreshed') === 'true'
    )

    let attempts = 0
    while (attempts <= maxRetries) {
      try {
        const component = await componentImport()
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('page-has-been-refreshed', 'false')
        }
        return component
      } catch (error) {
        attempts++
        if (attempts <= maxRetries) {
          console.warn(`Dynamic import failed (attempt ${attempts}/${maxRetries}), retrying in ${delayMs * attempts}ms...`, error?.message || error)
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempts))
        } else {
          console.warn('Dynamic import failed after all retries:', error?.message || error)

          // Automatically reload page once to fetch updated chunk URLs if not already refreshed
          if (typeof window !== 'undefined' && !pageHasBeenRefreshed) {
            window.sessionStorage.setItem('page-has-been-refreshed', 'true')
            window.location.reload()
          }

          throw error
        }
      }
    }
  })
}

export default lazyWithRetry

