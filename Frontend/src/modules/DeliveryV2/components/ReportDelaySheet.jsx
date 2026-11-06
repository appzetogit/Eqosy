import { useEffect, useState } from "react"
import { Loader2, TrafficCone, X } from "lucide-react"
import { toast } from "sonner"
import { deliveryPerformanceAPI } from "@food/api/performanceAPI"

const LABELS = {
  traffic_jam: "Traffic jam",
  heavy_rain: "Heavy rain",
  road_closure: "Road closure",
  customer_location_issue: "Customer location issue",
  customer_unreachable: "Customer not reachable",
}

/** Delivery partner: report a legitimate external delay so the delivery ETA can be adjusted (admin approves). */
export default function ReportDelaySheet({ orderId }) {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState(null)
  const [code, setCode] = useState("")
  const [minutes, setMinutes] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || cfg) return
    deliveryPerformanceAPI.config().then((r) => setCfg(r?.data?.data || null)).catch(() => {})
  }, [open, cfg])

  const submit = async () => {
    if (!code) return toast.error("Select a reason")
    if (!(Number(minutes) >= 1)) return toast.error("Enter the extra minutes")
    setBusy(true)
    try {
      await deliveryPerformanceAPI.reportDelay(orderId, { reasonCode: code, minutes: Number(minutes), note })
      toast.success("Delay reported. Admin will review it.")
      setOpen(false)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not report delay")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
        <TrafficCone className="h-4 w-4" /> Report delay
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Report a delay</h3>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-1 text-xs text-gray-500">Restaurant waiting time is never counted against you. Use this only for traffic, weather or customer issues.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(cfg?.externalDelayReasons || Object.keys(LABELS)).map((c) => (
                <button key={c} onClick={() => setCode(c)} className={`rounded-lg border p-2 text-xs font-semibold ${code === c ? "border-black bg-black text-white" : "border-gray-300"}`}>
                  {LABELS[c] || c.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <input type="number" min="1" max={cfg?.maxExternalDelayMinutes || 30} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder={`Extra minutes needed (max ${cfg?.maxExternalDelayMinutes || 30})`} className="mt-3 w-full rounded-lg border border-gray-300 p-2 text-sm" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="mt-2 w-full rounded-lg border border-gray-300 p-2 text-sm" />
            <button onClick={submit} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-black py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit
            </button>
          </div>
        </div>
      )}
    </>
  )
}
