import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { MapPin, Crosshair } from "lucide-react"

/**
 * UserLocationGate — global popup for the USER side of the app.
 *
 * Whenever the user's device location is unavailable (GPS switched off, or the
 * browser permission is not granted / blocked) a "Turn on" popup is shown.
 * On "Turn on" we request the real position (this triggers the browser's
 * permission dialog when possible) and, on success, store it and notify the
 * rest of the app. It re-appears every time location goes off again:
 *   - re-checked on app focus / tab visible / permission change / every 10s
 *   - "No, thanks" only snoozes it for SNOOZE_MS, then it comes back if still off.
 */

const POLL_MS = 10000
const SNOOZE_MS = 60000

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
  if (p === "/" || p === "") return false
  if (/\/(login|otp|verify|signup|register)(\/|$)/.test(p)) return false
  return !EXCLUDED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
}

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

export default function UserLocationGate() {
  const { pathname } = useLocation()
  const active = isUserSurface(pathname)

  // 'ok' | 'off' | 'denied'
  const [status, setStatus] = useState("ok")
  const [snoozedUntil, setSnoozedUntil] = useState(0)
  const [requesting, setRequesting] = useState(false)
  const [, forceTick] = useState(0)
  const busyRef = useRef(false)

  const probe = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return
    if (busyRef.current || document.visibilityState === "hidden") return
    busyRef.current = true
    navigator.geolocation.getCurrentPosition(
      () => {
        busyRef.current = false
        setStatus("ok")
      },
      (err) => {
        busyRef.current = false
        if (err?.code === 1) setStatus("denied")
        else if (err?.code === 2) setStatus("off")
        // code 3 (timeout) is inconclusive: keep the previous state
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
    )
  }, [])

  // Initial check + re-check on focus / visibility / interval / permission change.
  useEffect(() => {
    if (!active) return undefined

    probe()
    const interval = setInterval(probe, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") probe()
    }
    window.addEventListener("focus", probe)
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
      window.removeEventListener("focus", probe)
      document.removeEventListener("visibilitychange", onVisible)
      if (permStatus) permStatus.onchange = null
    }
  }, [active, probe])

  // Wake up when a snooze expires so the popup returns without waiting for the next poll.
  useEffect(() => {
    if (!snoozedUntil) return undefined
    const wait = snoozedUntil - Date.now()
    if (wait <= 0) return undefined
    const t = setTimeout(() => forceTick((n) => n + 1), wait + 50)
    return () => clearTimeout(t)
  }, [snoozedUntil])

  const handleTurnOn = () => {
    if (!navigator.geolocation) return
    setRequesting(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRequesting(false)
        setStatus("ok")
        persistPosition(pos)
      },
      (err) => {
        setRequesting(false)
        if (err?.code === 1) setStatus("denied")
        else if (err?.code === 2) setStatus("off")
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const handleNoThanks = () => setSnoozedUntil(Date.now() + SNOOZE_MS)

  const visible = active && status !== "ok" && Date.now() >= snoozedUntil
  if (!visible) return null

  const isDenied = status === "denied"

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Turn on location"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#1c1c1c] p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 leading-snug">
          For a better experience, your device will need to use Location Accuracy
        </h2>

        <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">
          The following settings should be on:
        </p>

        <ul className="mt-3 space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <li className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-600" />
            <span>Device location</span>
          </li>
          <li className="flex items-start gap-3">
            <Crosshair className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-600" />
            <span>
              Location Accuracy, which provides more accurate location for rides, deliveries and
              nearby services.
            </span>
          </li>
        </ul>

        {isDenied && (
          <p className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
            Location is blocked for this app. Open the lock icon next to the address bar (or your
            phone's App settings → Permissions), set <b>Location</b> to <b>Allow</b>, then tap
            Turn on. This popup closes automatically once it works.
          </p>
        )}

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          You can change this at any time in your device location settings.
        </p>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleNoThanks}
            className="rounded-full border border-teal-700 px-5 py-2.5 text-sm font-semibold text-teal-800 dark:text-teal-300"
          >
            No, thanks
          </button>
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
