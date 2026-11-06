import { useEffect, useState } from "react"
import { Clock, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { restaurantPerformanceAPI } from "@food/api/performanceAPI"

/** Restaurant: ask the customer for extra preparation time on a large order. Limits come from admin config. */
export default function RequestMoreTime({ orderId, className = "" }) {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState(null)
  const [minutes, setMinutes] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || cfg) return
    restaurantPerformanceAPI.config().then((r) => setCfg(r?.data?.data || null)).catch(() => {})
  }, [open, cfg])

  const tiers = (cfg?.orderTiers || []).filter((t) => t.maxExtraMinutes > 0)

  const submit = async () => {
    if (!(Number(minutes) >= 1)) return toast.error("Enter the extra minutes needed")
    if (!reason.trim()) return toast.error("Please give a reason")
    setBusy(true)
    try {
      const res = await restaurantPerformanceAPI.requestExtension(orderId, { extraMinutes: Number(minutes), reason: reason.trim() })
      const st = res?.data?.data?.status
      toast.success(st === "pending_admin" ? "Sent to admin for approval" : st === "approved" ? "Extra time approved" : "Customer has been asked to approve")
      setOpen(false)
      setMinutes("")
      setReason("")
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not request extra time")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={`flex h-8 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 text-[11px] font-bold text-amber-800 ${className}`}
      >
        <Clock className="h-3.5 w-3.5" /> More time
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Request extra preparation time</h3>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-1 text-xs text-gray-500">The customer must accept. No delay penalty applies inside an approved time. Ask before the current deadline passes.</p>
            {tiers.length > 0 && (
              <ul className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
                {tiers.map((t) => (
                  <li key={t.key}>{t.label} ({t.minItems}{t.maxItems ? `–${t.maxItems}` : "+"} items): up to {t.maxExtraMinutes} min{t.needsAdminApproval ? " (admin approval)" : ""}</li>
                ))}
              </ul>
            )}
            <input
              type="number"
              min="1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Extra minutes"
              className="mt-3 w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason shown to the customer"
              className="mt-2 w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
            <button
              onClick={submit}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-black py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send request
            </button>
          </div>
        </div>
      )}
    </>
  )
}
