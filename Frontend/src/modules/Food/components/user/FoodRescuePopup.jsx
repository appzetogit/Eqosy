import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Clock, Leaf, MapPin, X } from "lucide-react"
import { cancellationAPI } from "@food/api/cancellationAPI"
import { getSocket } from "@food/hooks/useUserNotifications"
import { useProfile } from "@food/context/ProfileContext"

const SEEN_KEY = "eqosy_rescue_popup_seen"
const POLL_MS = 30000
const inr = (v) => `₹${(Number(v) || 0).toFixed(2).replace(/\.00$/, "")}`

const readSeen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")) } catch { return new Set() }
}
const writeSeen = (set) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-50))) } catch { /* storage is optional */ }
}

function Countdown({ to, onDone }) {
  const calc = () => Math.max(0, Math.round((new Date(to).getTime() - Date.now()) / 1000))
  const [left, setLeft] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => {
      const next = calc()
      setLeft(next)
      if (next === 0) onDone?.()
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to])
  return <span className="notranslate font-mono font-bold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
}

/**
 * Customer app: when food from an undelivered / cancelled order is put on Food Rescue near the customer,
 * show a popup while they browse. Text is plain DOM text, so the app's Google Translate language (the one the
 * customer picked) translates it like the rest of the screen. Each listing is shown once.
 */
export default function FoodRescuePopup() {
  const navigate = useNavigate()
  const { getDefaultAddress } = useProfile()
  const [listing, setListing] = useState(null)
  const seen = useRef(readSeen())
  const busy = useRef(false)

  const check = useCallback(async () => {
    if (busy.current || document.visibilityState === "hidden") return
    const c = getDefaultAddress?.()?.location?.coordinates
    if (!Array.isArray(c) || c.length !== 2) return
    busy.current = true
    try {
      const res = await cancellationAPI.nearbyRescues(c[1], c[0])
      const next = (res?.data?.data || []).find((l) => l.status === "active" && !seen.current.has(String(l.id)))
      if (next) setListing((cur) => cur || next)
    } catch {
      /* not signed in or offline: stay quiet */
    } finally {
      busy.current = false
    }
  }, [getDefaultAddress])

  useEffect(() => {
    const first = setTimeout(check, 4000)
    const id = setInterval(check, POLL_MS)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [check])

  // Instant: server pushes this to every customer within the rescue radius.
  useEffect(() => {
    let attached = null
    const tryAttach = () => {
      const s = getSocket()
      if (!s || attached === s) return
      attached?.off("food_rescue_available", check)
      s.on("food_rescue_available", check)
      attached = s
    }
    tryAttach()
    const id = setInterval(tryAttach, 3000)
    return () => { clearInterval(id); attached?.off("food_rescue_available", check) }
  }, [check])

  const close = () => {
    if (listing) {
      seen.current.add(String(listing.id))
      writeSeen(seen.current)
    }
    setListing(null)
  }

  if (!listing) return null

  const items = Array.isArray(listing.items) ? listing.items : []
  const open = () => {
    close()
    navigate("/user/food-rescue")
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" onClick={close}>
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-[#1a1a1a] dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-emerald-500 via-green-500 to-lime-400 px-5 pb-6 pt-5 text-white">
          <button onClick={close} aria-label="Close" className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 active:scale-90">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em]">
            <Leaf className="h-4 w-4" /> Eqosy Food Rescue
          </div>
          <h3 className="mt-2 text-2xl font-black leading-tight">Fresh food, now at a lower price!</h3>
          <p className="mt-1 text-sm font-semibold text-white/90">
            Freshly prepared food is available near you. Grab it before someone else does.
          </p>
          <span className="notranslate absolute -bottom-4 right-5 rounded-2xl bg-white px-3 py-2 text-lg font-black text-emerald-600 shadow-lg">
            {listing.discountPercent}% OFF
          </span>
        </div>

        <div className="space-y-3 px-5 pb-5 pt-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-black">{listing.restaurantName || "Restaurant"}</p>
              {listing.distanceKm != null ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3 w-3" /> <span className="notranslate">{listing.distanceKm} km</span>
                </p>
              ) : null}
            </div>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600">
              <Clock className="h-3 w-3" /> <Countdown to={listing.expiresAt} onDone={close} />
            </span>
          </div>

          {items.length ? (
            <ul className="space-y-0.5 rounded-2xl bg-gray-50 p-3 text-sm text-gray-700 dark:bg-zinc-800 dark:text-gray-200">
              {items.slice(0, 4).map((i, idx) => <li key={idx}>{i.quantity} × {i.name}</li>)}
              {items.length > 4 ? <li className="text-xs text-gray-400">+{items.length - 4} more</li> : null}
            </ul>
          ) : null}

          <div className="flex items-end gap-2">
            <span className="notranslate text-3xl font-black text-emerald-600">{inr(listing.rescuePrice)}</span>
            <span className="notranslate pb-1 text-sm text-gray-400 line-through">{inr(listing.originalPrice)}</span>
          </div>
          <p className="text-[11px] text-gray-400">Food price. Delivery fee and taxes are added at checkout. First to pay gets it.</p>

          <button onClick={open} className="w-full rounded-2xl bg-black py-3.5 text-sm font-black uppercase tracking-wider text-white active:scale-95 dark:bg-white dark:text-black">
            Get it now
          </button>
          <button onClick={close} className="w-full py-1 text-xs font-semibold text-gray-500">Maybe later</button>
        </div>
      </div>
    </div>
  )
}
