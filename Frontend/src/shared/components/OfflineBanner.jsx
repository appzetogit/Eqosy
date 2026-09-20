import React from 'react'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { WifiOff, Wifi, RefreshCw } from 'lucide-react'

export default function OfflineBanner() {
  const { isOnline, wasOffline } = useNetworkStatus()

  if (isOnline && !wasOffline) {
    return null
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none px-4 w-full max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
      {!isOnline && (
        <div className="pointer-events-auto flex items-center justify-between gap-3 bg-amber-500/95 dark:bg-amber-600/95 backdrop-blur-md text-white px-4 py-2.5 rounded-full shadow-lg border border-amber-400/30 text-xs font-semibold tracking-wide">
          <div className="flex items-center gap-2 truncate">
            <WifiOff className="w-4 h-4 shrink-0 text-amber-100 animate-pulse" />
            <span className="truncate">You are offline. Showing saved data.</span>
          </div>
          <span className="bg-amber-700/60 dark:bg-amber-800/60 text-amber-100 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
            Offline
          </span>
        </div>
      )}

      {isOnline && wasOffline && (
        <div className="pointer-events-auto flex items-center justify-between gap-3 bg-emerald-600/95 dark:bg-emerald-700/95 backdrop-blur-md text-white px-4 py-2.5 rounded-full shadow-lg border border-emerald-400/30 text-xs font-semibold tracking-wide animate-in fade-in duration-300">
          <div className="flex items-center gap-2 truncate">
            <Wifi className="w-4 h-4 shrink-0 text-emerald-100" />
            <span className="truncate">Back online. Updating...</span>
          </div>
          <RefreshCw className="w-3.5 h-3.5 shrink-0 text-emerald-100 animate-spin" />
        </div>
      )}
    </div>
  )
}
