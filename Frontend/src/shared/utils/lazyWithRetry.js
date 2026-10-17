import { lazy } from 'react'

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

/**
 * Enhanced React.lazy wrapper that automatically handles failed dynamic module imports
 * caused by Vite dev server restarts, network blips, or HMR cache invalidations.
 *
 * @param {Function} componentImport - Dynamic import function, e.g., () => import('./MyModule')
 * @returns {React.Component} Lazy-loaded component with retry capability
 */
export function lazyWithRetry(componentImport, maxRetries = 3, delayMs = 400) {
  return lazy(async () => {
    let attempts = 0
    while (attempts <= maxRetries) {
      try {
        const component = await componentImport()
        return component
      } catch (error) {
        attempts++
        const isModuleErr = isModuleChunkError(error)

        if (attempts <= maxRetries) {
          console.warn(`[lazyWithRetry] Dynamic import failed (attempt ${attempts}/${maxRetries}), retrying...`, error?.message || error)
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempts))
        } else {
          console.warn('[lazyWithRetry] Dynamic import failed after all retries:', error?.message || error)

          // If dynamic module failed due to HMR/chunk hash change, auto-reload page once cleanly
          if (typeof window !== 'undefined' && isModuleErr) {
            try {
              const lastReload = Number(sessionStorage.getItem('chunk-auto-reload-ts') || 0)
              const count = Number(sessionStorage.getItem('chunk-auto-reload-count') || 0)
              const now = Date.now()

              // Allow a reload only if the last one was long ago, or we have not hit the 2-in-a-minute cap.
              const withinWindow = now - lastReload < 60000
              if (!withinWindow || count < 2) {
                const nextCount = withinWindow ? count + 1 : 1
                sessionStorage.setItem('chunk-auto-reload-ts', String(now))
                sessionStorage.setItem('chunk-auto-reload-count', String(nextCount))
                window.location.reload()
                // Return non-resolving promise so React stays on Suspense fallback while reloading
                return new Promise(() => {})
              }
            } catch {
              window.location.reload()
              return new Promise(() => {})
            }
          }

          throw error
        }
      }
    }
  })
}

export default lazyWithRetry

