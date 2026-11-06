import { useCallback, useEffect, useRef, useState } from "react"
import { Clock, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { userPerformanceAPI } from "@food/api/performanceAPI"
import { getSocket } from "@food/hooks/useUserNotifications"
import alertSound from "@food/assets/audio/zomato_sms.mp3"

const POLL_MS = 15000
const time = (d) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })

/**
 * Customer: the restaurant asked for more preparation time. Accept or reject; the request expires on its own.
 * Polls while the tab is visible (works without socket setup) and refreshes immediately on focus.
 */
export default function PrepExtensionPrompt() {
  const [req, setReq] = useState(null)
  const [busy, setBusy] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const dismissed = useRef(new Set())
  const rung = useRef(new Set())

  const check = useCallback(async () => {
    if (document.visibilityState === "hidden") return
    try {
      const res = await userPerformanceAPI.pendingExtensions()
      const list = res?.data?.data || []
      const next = list.find((x) => !dismissed.current.has(String(x._id)))
      if (next && !rung.current.has(String(next._id))) {
        rung.current.add(String(next._id))
        try { new Audio(alertSound).play().catch(() => {}) } catch (e) { /* sound is best-effort */ }
      }
      setReq(next || null)
    } catch {
      /* not logged in or offline: stay quiet */
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(check, 2500)
    const id = setInterval(check, POLL_MS)
    window.addEventListener("focus", check)
    return () => { clearTimeout(first); clearInterval(id); window.removeEventListener("focus", check) }
  }, [check])

  // Instant delivery via the shared user socket (polling above stays as a fallback).
  useEffect(() => {
    let attached = null
    const tryAttach = () => {
      const s = getSocket()
      if (!s || attached === s) return
      attached?.off("prep_extension_request", check)
      s.on("prep_extension_request", check)
      attached = s
    }
    tryAttach()
    const id = setInterval(tryAttach, 3000)
    return () => { clearInterval(id); attached?.off("prep_extension_request", check) }
  }, [check])

  useEffect(() => {
    if (!req?.expiresAt) return undefined
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(req.expiresAt).getTime() - Date.now()) / 1000))
      setSecondsLeft(left)
      if (left === 0) setReq(null)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [req])

  if (!req) return null

  const respond = async (accept) => {
    setBusy(true)
    try {
      await userPerformanceAPI.respondExtension(req._id, accept)
      toast.success(accept ? "Thanks! Your order time has been updated." : "Okay, the original time stays.")
      dismissed.current.add(String(req._id))
      setReq(null)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not send your response")
      dismissed.current.add(String(req._id))
      setReq(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl dark:bg-[#1a1a1a] dark:text-white">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" />
          <h3 className="text-base font-bold">The restaurant needs a little more time</h3>
        </div>
        <p className="mt-2 text-sm">
          Your order needs <b>{req.extraMinutes} more minutes</b>. New ready time: <b>{time(req.requestedEta)}</b> (was {time(req.originalEta)}).
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Reason: {req.reason}</p>
        <p className="mt-1 text-xs text-gray-500">Please respond within {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => respond(false)} className="rounded-lg border border-gray-300 py-2.5 text-sm font-semibold disabled:opacity-60">Decline</button>
          <button disabled={busy} onClick={() => respond(true)} className="flex items-center justify-center gap-2 rounded-lg bg-black py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Accept
          </button>
        </div>
      </div>
    </div>
  )
}
