import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { MapPin, Crosshair, Settings } from "lucide-react"

/**
 * UserLocationGate — global popup for the USER side of the app.
 *
 * Whenever the user's device location is unavailable (GPS switched off, or the permission is not granted /
 * blocked) a "Turn on" popup is shown straight away:
 *   - checked when the screen changes, on app focus / tab visible / permission change and every 30 s
 *   - ANY screen whose geolocation call fails (permission denied / position unavailable) triggers an
 *     immediate re-check, so the popup appears the moment a feature cannot get the location
 *   - while the popup is open it re-checks every few seconds, so it closes BY ITSELF as soon as the user
 *     allows the permission or switches the phone's location on (no need to press anything again)
 *   - "Turn on" asks the Flutter app (native permission dialog / location settings) when it is available,
 *     otherwise the browser's own permission dialog
 *   - "No, thanks" only snoozes it; a failing screen brings it back immediately
 *
 * Note: a web page can never flip the phone's GPS switch by itself. Inside the Flutter app that is done by the
 * native handlers listed in NATIVE_HANDLERS below; in a browser the user does it from the phone settings and
 * the popup then closes automatically.
 */

const POLL_MS = 30000
const POLL_WHILE_OFF_MS = 4000
const QUICK_RECHECK_MS = 2500
const SNOOZE_MS = 3 * 60000

/** Names the Flutter app can register with `addJavaScriptHandler`. Every one is optional. */
const NATIVE_HANDLERS = {
  permission: ["requestLocationPermission", "enableLocation", "requestLocation"],
  settings: ["openLocationSettings", "openAppSettings"],
}

// Non-user surfaces (admin / driver / owner / restaurant / delivery partner / auth / landing).
const EXCLUDED_PREFIXES = [
  "/admin",
  "/taxi/admin",
  "/driver",
  "/taxi/driver",
  "/owner",
  "/taxi/owner",
  "/delivery",
  "/food/delivery",
  "/restaurant",
  "/food/restaurant",
  "/login",
  "/auth",
  "/taxi/user/login",
  "/taxi/user/verify",
  "/user-import",
  "/driver-import",
  "/taxi/user-import",
  "/taxi/driver-import",
]

function isUserSurface(pathname) {
  const p = (pathname || "/").toLowerCase()
  if (/\/(login|otp|verify|signup|register)(\/|$)/.test(p)) return false
  return !EXCLUDED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
}

/** Calls the first native handler that actually answers. Unknown handlers resolve with null, so skip those. */
async function callNative(names, payload = {}) {
  const bridge = typeof window !== "undefined" ? window.flutter_inappwebview : null
  if (!bridge || typeof bridge.callHandler !== "function") return { handled: false }
  for (const name of names) {
    try {
      const result = await bridge.callHandler(name, payload)
      if (result !== null && result !== undefined && result !== false) return { handled: true, result, name }
    } catch {
      /* try the next handler name */
    }
  }
  return { handled: false }
}

const hasNativeBridge = () =>
  typeof window !== "undefined" && typeof window.flutter_inappwebview?.callHandler === "function"

function persistPosition(pos) {
  try {
    const { latitude, longitude, accuracy } = pos.coords
    let previousAddress = ""
    try {
      previousAddress = JSON.parse(localStorage.getItem("eqosy:lastLocation") || "{}")?.address || ""
    } catch {
      /* ignore */
    }
    // Do not override an address the user picked manually.
    const mode = localStorage.getItem("deliveryAddressMode")
    if (mode !== "saved") {
      localStorage.setItem(
        "eqosy:lastLocation",
        JSON.stringify({
          address: previousAddress,
          lat: Number(latitude),
          lon: Number(longitude),
          accuracy,
          updatedAt: Date.now(),
        })
      )
    }
    window.dispatchEvent(new Event("eqosy:location-updated"))
    window.dispatchEvent(
      new CustomEvent("eqosy:device-location-enabled", {
        detail: { latitude, longitude, accuracy },
      })
    )
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * Lets the gate hear about location failures from ANY screen, without changing how those screens behave:
 * their success/error callbacks run exactly as before, we only emit an event when permission is denied (1)
 * or the position is unavailable (2). The gate's own calls are tagged so they never trigger themselves.
 */
function installGeolocationErrorSignal() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return
  const geo = navigator.geolocation
  if (geo.__eqosySignal) return
  const origGet = geo.getCurrentPosition.bind(geo)
  const origWatch = geo.watchPosition.bind(geo)
  const wrap = (onError, options) => {
    if (options && options.__eqosyInternal) return onError
    return (err) => {
      try {
        if (err && (err.code === 1 || err.code === 2)) {
          window.dispatchEvent(new CustomEvent("eqosy:geo-error", { detail: { code: err.code } }))
        }
      } catch {
        /* never let the signal break the caller */
      }
      if (typeof onError === "function") onError(err)
    }
  }
  try {
    geo.getCurrentPosition = (ok, err, opts) => origGet(ok, wrap(err, opts), opts)
    geo.watchPosition = (ok, err, opts) => origWatch(ok, wrap(err, opts), opts)
    geo.__eqosySignal = true
  } catch {
    /* read-only geolocation object: the polling checks still work */
  }
}

export default function UserLocationGate() {
  const { pathname } = useLocation()
  const active = isUserSurface(pathname)

  // 'ok' | 'off' (GPS / location services off) | 'denied' (permission blocked)
  const [status, setStatus] = useState("ok")
  const [snoozedUntil, setSnoozedUntil] = useState(0)
  const [requesting, setRequesting] = useState(false)
  const [, forceTick] = useState(0)
  const busyRef = useRef(false)
  const failuresRef = useRef(0)
  const busyTimerRef = useRef(null)
  const quickTimerRef = useRef(null)
  const statusRef = useRef("ok")
  statusRef.current = status

  const releaseBusy = () => {
    busyRef.current = false
    if (busyTimerRef.current) {
      clearTimeout(busyTimerRef.current)
      busyTimerRef.current = null
    }
  }

  const probe = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("off")
      return
    }
    if (busyRef.current || document.visibilityState === "hidden") return
    busyRef.current = true
    busyTimerRef.current = setTimeout(() => {
      busyRef.current = false
      busyTimerRef.current = null
    }, 12000)

    // The Permissions API tells us "denied" instantly (not available in every WebView, then we just try).
    try {
      const perm = await navigator.permissions?.query?.({ name: "geolocation" })
      if (perm?.state === "denied") {
        releaseBusy()
        failuresRef.current = 0
        setStatus("denied")
        return
      }
      if (perm?.state === "prompt") {
        releaseBusy()
        setStatus("off")
        return
      }
    } catch {
      /* Permissions API unsupported — fall through to getCurrentPosition */
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        releaseBusy()
        failuresRef.current = 0
        // Any successful fix means location is ON (coarse accuracy is still valid).
        setStatus("ok")
        persistPosition(pos)
      },
      (err) => {
        releaseBusy()
        if (err?.code === 1) {
          failuresRef.current = 0
          setStatus("denied")
          return
        }
        // Position unavailable (2) or timed out (3) usually means the phone's location is switched off.
        // Confirm once more quickly instead of waiting for the next 30 s poll.
        failuresRef.current += 1
        if (failuresRef.current >= 2) {
          setStatus("off")
        } else {
          clearTimeout(quickTimerRef.current)
          quickTimerRef.current = setTimeout(probe, QUICK_RECHECK_MS)
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000, __eqosyInternal: true }
    )
  }, [])

  // Check on every screen change, on focus / visibility / permission change, and on a slow interval.
  useEffect(() => {
    if (!active) return undefined
    installGeolocationErrorSignal()
    probe()
    const interval = setInterval(probe, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") probe()
    }
    // A screen that needs the location just failed to get it: show the popup now, ignoring any snooze.
    const onGeoError = () => {
      setSnoozedUntil(0)
      failuresRef.current = Math.max(failuresRef.current, 1)
      probe()
    }
    window.addEventListener("focus", probe)
    window.addEventListener("pageshow", probe)
    window.addEventListener("online", probe)
    window.addEventListener("eqosy:geo-error", onGeoError)
    window.addEventListener("eqosy:require-location", onGeoError)
    document.addEventListener("visibilitychange", onVisible)

    let permStatus = null
    let cancelled = false
    navigator.permissions
      ?.query?.({ name: "geolocation" })
      .then((s) => {
        if (cancelled) return
        permStatus = s
        s.onchange = probe
      })
      .catch(() => {})

    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimeout(quickTimerRef.current)
      window.removeEventListener("focus", probe)
      window.removeEventListener("pageshow", probe)
      window.removeEventListener("online", probe)
      window.removeEventListener("eqosy:geo-error", onGeoError)
      window.removeEventListener("eqosy:require-location", onGeoError)
      document.removeEventListener("visibilitychange", onVisible)
      if (permStatus) permStatus.onchange = null
    }
  }, [active, probe])

  // While the popup is showing, keep checking so it closes by itself once location is allowed / switched on.
  useEffect(() => {
    if (!active || status === "ok") return undefined
    const id = setInterval(probe, POLL_WHILE_OFF_MS)
    return () => clearInterval(id)
  }, [active, status, probe])

  // Wake up when a snooze expires so the popup returns without waiting for the next poll.
  useEffect(() => {
    if (!snoozedUntil) return undefined
    const wait = snoozedUntil - Date.now()
    if (wait <= 0) return undefined
    const t = setTimeout(() => forceTick((n) => n + 1), wait + 50)
    return () => clearTimeout(t)
  }, [snoozedUntil])

  const handleTurnOn = async () => {
    if (!navigator.geolocation) return
    setRequesting(true)
    // Inside the Flutter app: native permission dialog / location-services dialog first.
    if (hasNativeBridge()) {
      await callNative(NATIVE_HANDLERS.permission, { source: "location_gate", status })
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequesting(false)
        failuresRef.current = 0
        setStatus("ok")
        persistPosition(pos)
      },
      (err) => {
        setRequesting(false)
        if (err?.code === 1) setStatus("denied")
        else setStatus("off")
        // Keep polling: the popup closes on its own once the user fixes it in settings.
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 0, __eqosyInternal: true }
    )
  }

  const handleOpenSettings = async () => {
    await callNative(NATIVE_HANDLERS.settings, { source: "location_gate", status })
  }

  const handleNoThanks = () => setSnoozedUntil(Date.now() + SNOOZE_MS)

  const visible = active && status !== "ok" && Date.now() >= snoozedUntil
  if (!visible) return null

  const isDenied = status === "denied"
  const native = hasNativeBridge()

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Turn on location"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1c1c1c] p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 leading-snug">
          {isDenied ? "Allow location access" : "Turn on your location"}
        </h2>

        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          We need your location to show nearby restaurants, set your delivery address and book rides. Tap <b>Turn on</b>
          {" "}and choose <b>Allow</b>.
        </p>

        <ul className="mt-3 space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <li className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-600" />
            <span>Device location (GPS) switched on</span>
          </li>
          <li className="flex items-start gap-3">
            <Crosshair className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-600" />
            <span>Location permission allowed for this app, for accurate rides and deliveries.</span>
          </li>
        </ul>

        {isDenied ? (
          <p className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
            Location is blocked for this app. {native ? "Tap Open settings, " : "Open your phone's App settings → Permissions (or the lock icon next to the address bar), "}
            set <b>Location</b> to <b>Allow</b> and come back. This popup closes by itself once it works.
          </p>
        ) : (
          <p className="mt-4 rounded-xl bg-sky-50 dark:bg-sky-950/40 p-3 text-xs text-sky-800 dark:text-sky-200">
            If your phone's location is switched off, turn it on from the quick-settings bar (swipe down from the top).
            This popup closes by itself once your location is on.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleNoThanks}
            className="rounded-full border border-teal-700 px-5 py-2.5 text-sm font-semibold text-teal-800 dark:text-teal-300"
          >
            Not now
          </button>
          {native && (
            <button
              type="button"
              onClick={handleOpenSettings}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200"
            >
              <Settings className="h-4 w-4" /> Open settings
            </button>
          )}
          <button
            type="button"
            onClick={handleTurnOn}
            disabled={requesting}
            className="rounded-full bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {requesting ? "Turning on…" : "Turn on"}
          </button>
        </div>
      </div>
    </div>
  )
}

// Exported for tests only.
export { installGeolocationErrorSignal, callNative, isUserSurface }
