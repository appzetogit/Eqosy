import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Check, ChevronRight, Timer, X } from "lucide-react"
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
  const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`
  return <span className="notranslate font-bold tabular-nums">{label}</span>
}

/** Animated "Food Rescue" paper bag that drops in and then floats. */
function RescueBag() {
  return (
    <motion.div
      className="relative z-10 mx-auto -mb-10 flex w-40 flex-col items-center"
      initial={{ y: -260, rotate: -12, opacity: 0 }}
      animate={{ y: 0, rotate: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 110, damping: 11, delay: 0.1 }}
    >
      <motion.div
        animate={{ y: [0, -7, 0], rotate: [-1.5, 1.5, -1.5] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <div className="absolute -top-5 left-1/2 flex -translate-x-1/2 gap-10">
          <span className="h-7 w-3 rounded-full border-[3px] border-red-600" />
          <span className="h-7 w-3 rounded-full border-[3px] border-red-600" />
        </div>
        <div className="relative h-28 w-32 overflow-hidden rounded-b-xl rounded-t-md bg-gradient-to-b from-[#c9a27a] to-[#a9794e] shadow-[0_14px_24px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-x-0 top-0 h-3 bg-black/10" />
          <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-sm bg-white/95 px-2 py-1 text-center shadow">
            <p className="text-[10px] font-black leading-none tracking-[0.12em] text-[#7a4a22]">FOOD</p>
            <p className="text-[12px] font-black leading-tight tracking-[0.1em] text-[#7a4a22]">RESCUE</p>
          </div>
          <motion.div
            className="absolute inset-y-0 -left-10 w-8 -skew-x-12 bg-white/25"
            animate={{ x: [0, 190] }}
            transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }}
          />
        </div>
        <div className="mx-auto mt-1 h-3 w-24 rounded-full bg-black/25 blur-sm" />
      </motion.div>
    </motion.div>
  )
}

/**
 * Customer app: when food from an undelivered / cancelled order is put on Food Rescue near the customer,
 * show an animated popup while they browse. Text is plain DOM text, so the app's Google Translate language
 * translates it like the rest of the screen. Each listing is shown once.
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

  const items = Array.isArray(listing?.items) ? listing.items : []
  const open = () => {
    close()
    navigate("/user/food-rescue")
  }
  const first = items[0] || {}
  const image = first.image || first.imageUrl || (Array.isArray(first.images) ? first.images[0] : "") || ""
  const title = items.length > 1 ? `${first.name || "Food"} + ${items.length - 1} more` : first.name || listing?.restaurantName || "Fresh food"
  const minsLeft = listing ? Math.max(1, Math.round((new Date(listing.expiresAt).getTime() - Date.now()) / 60000)) : 0

  return (
    <AnimatePresence>
      {listing ? (
        <motion.div
          key={listing.id}
          className="fixed inset-0 z-[90] flex flex-col items-center justify-end bg-gradient-to-b from-[#f0556a]/90 to-[#d7263d]/95 p-4 backdrop-blur-sm sm:justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.span
              key={i}
              className="pointer-events-none absolute h-2 w-2 rounded-full bg-white/70"
              style={{ left: `${12 + i * 15}%`, top: `${20 + (i % 3) * 12}%` }}
              animate={{ y: [0, -18, 0], opacity: [0.2, 0.9, 0.2], scale: [0.8, 1.3, 0.8] }}
              transition={{ duration: 2.4 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: i * 0.25 }}
            />
          ))}

          <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <RescueBag />

            <motion.div
              className="relative overflow-hidden rounded-[28px] bg-[#f1f3f6] pt-12 shadow-2xl dark:bg-[#1a1a1a] dark:text-white"
              initial={{ y: 120, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.15 }}
            >
              <button onClick={close} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-gray-500 active:scale-90">
                <X className="h-5 w-5" />
              </button>

              <div className="px-4 pb-4 pt-2">
                <motion.div
                  className="rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-800"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                >
                  <div className="flex items-start gap-3">
                    <motion.div
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-orange-50"
                      initial={{ scale: 0.6, rotate: -8 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.55 }}
                    >
                      {image ? (
                        <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl">🍔</div>
                      )}
                    </motion.div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-extrabold leading-snug text-gray-900 dark:text-white">An order was just cancelled.</p>
                      <p className="mt-0.5 text-[15px] font-extrabold leading-snug text-gray-900 dark:text-white">
                        Claim at just{" "}
                        <span className="notranslate font-semibold text-gray-400 line-through">{inr(listing.originalPrice)}</span>{" "}
                        <motion.span
                          className="notranslate inline-block text-[#e23744]"
                          initial={{ scale: 0.5 }}
                          animate={{ scale: [0.5, 1.25, 1] }}
                          transition={{ delay: 0.8, duration: 0.5 }}
                        >
                          {inr(listing.rescuePrice)}
                        </motion.span>
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-gray-500">{title} · {listing.restaurantName || "Restaurant"}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-emerald-700">
                    <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Freshly prepared</span>
                    <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Safely sealed</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 dark:text-gray-300">
                      <Timer className="h-5 w-5" />
                      <span className="notranslate">{listing.distanceKm != null ? `${listing.distanceKm} km` : `${minsLeft} mins`}</span>
                    </span>
                    <motion.button
                      onClick={open}
                      whileTap={{ scale: 0.95 }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ scale: { duration: 1.6, repeat: Infinity, ease: "easeInOut" } }}
                      className="relative flex items-center gap-1 overflow-hidden rounded-xl bg-[#ef4f5f] px-7 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-red-300/50"
                    >
                      <span className="relative z-10">View</span>
                      <ChevronRight className="relative z-10 h-4 w-4" />
                      <motion.span
                        className="absolute inset-y-0 -left-8 w-6 -skew-x-12 bg-white/35"
                        animate={{ x: [0, 160] }}
                        transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
                      />
                    </motion.button>
                  </div>
                </motion.div>
              </div>

              <div className="bg-[#1c1c1e] px-4 py-3 text-center text-[13px] font-semibold text-white">
                Claim in <span className="text-[#ff4d5e]"><Countdown to={listing.expiresAt} onDone={close} /> mins</span> and reduce food wastage
              </div>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
