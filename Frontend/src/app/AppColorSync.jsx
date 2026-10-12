import { useEffect, useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { loadBusinessSettings } from '../modules/Food/utils/businessSettings.js'
import { applyAppColors } from '../shared/utils/appColors.js'

// Applies the admin-configured color combination of whichever app the current route belongs to.
export default function AppColorSync() {
  const { pathname } = useLocation()
  const [appColors, setAppColors] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('food_business_settings') || '{}')?.appColors || null
    } catch {
      return null
    }
  })

  useEffect(() => {
    let alive = true
    const refresh = () => {
      loadBusinessSettings()
        .then((settings) => { if (alive) setAppColors(settings?.appColors || {}) })
        .catch(() => { if (alive) setAppColors({}) })
    }
    refresh()
    window.addEventListener('businessSettingsUpdated', refresh)
    return () => {
      alive = false
      window.removeEventListener('businessSettingsUpdated', refresh)
    }
  }, [])

  useLayoutEffect(() => {
    applyAppColors(appColors || {}, pathname)
  }, [appColors, pathname])

  return null
}
