import { QueryClient } from '@tanstack/react-query'
import { get, set, del } from 'idb-keyval'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 1000 * 60 * 5, // 5 minutes fresh
      gcTime: 1000 * 60 * 60 * 24, // 24 hours in cache
      retry: (failureCount, error) => {
        // Do not retry on HTTP 401, 403, or 404
        const status = error?.response?.status
        if (status === 401 || status === 403 || status === 404) return false
        return failureCount < 1
      },
      refetchOnReconnect: 'always',
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
    mutations: {
      networkMode: 'online',
    },
  },
})

/**
 * IndexedDB storage persister for query cache survival across app restarts offline.
 */
export const idbPersister = {
  persistClient: async (client) => {
    try {
      await set('RAYDO_QUERY_CACHE', client)
    } catch (_) {}
  },
  restoreClient: async () => {
    try {
      return await get('RAYDO_QUERY_CACHE')
    } catch (_) {
      return undefined
    }
  },
  removeClient: async () => {
    try {
      await del('RAYDO_QUERY_CACHE')
    } catch (_) {}
  },
}
