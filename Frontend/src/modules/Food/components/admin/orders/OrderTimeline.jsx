import { useEffect, useState } from "react"
import { Loader2, Store, Bike, Timer, CheckCircle2, AlertTriangle } from "lucide-react"
import { adminPerformanceAPI } from "@food/api/performanceAPI"

const clock = (d) =>
  d ? new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }) : "-"
const mins = (v) => (v == null ? "-" : `${v} min`)

const TONE = {
  on_time: "bg-emerald-50 text-emerald-700 border-emerald-200",
  late: "bg-red-50 text-red-700 border-red-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  going_to_restaurant: "bg-blue-50 text-blue-700 border-blue-200",
  not_accepted: "bg-slate-50 text-slate-600 border-slate-200",
  not_assigned: "bg-slate-50 text-slate-600 border-slate-200",
}
const STATUS_TEXT = {
  on_time: "On time", late: "Late", in_progress: "In progress", going_to_restaurant: "Going to restaurant",
  not_accepted: "Not accepted yet", not_assigned: "No delivery partner yet",
}

const Row = ({ label, value, bad }) => (
  <div className="flex items-center justify-between gap-3 text-xs">
    <span className="text-slate-500">{label}</span>
    <span className={`font-bold ${bad ? "text-red-600" : "text-slate-900"}`}>{value}</span>
  </div>
)

function Card({ icon: Icon, title, name, status, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-slate-100 p-1.5"><Icon className="h-4 w-4 text-slate-700" /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
            {name ? <p className="text-sm font-bold text-slate-900">{name}</p> : null}
          </div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${TONE[status] || TONE.not_assigned}`}>{STATUS_TEXT[status] || status}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

/** Admin: who took how long on this order (restaurant time, delivery partner time, total) plus the full timeline. */
export default function OrderTimeline({ orderId }) {
  const [t, setT] = useState(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!orderId) return undefined
    let alive = true
    adminPerformanceAPI.orderTimeline(orderId)
      .then((res) => { if (alive) setT(res?.data?.data || null) })
      .catch((e) => { if (alive) setErr(e?.response?.data?.message || "Could not load order timing") })
    return () => { alive = false }
  }, [orderId])

  if (err) return <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{err}</p>
  if (!t) return <div className="flex items-center gap-2 p-3 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading order timing…</div>

  const r = t.restaurant
  const d = t.deliveryPartner
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><Timer className="h-4 w-4" /> Order timing</p>
        {t.totals.totalMin != null && <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">Total {mins(t.totals.totalMin)}</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card icon={Store} title="Restaurant time" name={r.name} status={r.status}>
          <Row label="Accepted after" value={mins(r.acceptedAfterMin)} />
          <Row label={r.extended ? "Promised prep (extended)" : "Promised prep time"} value={mins(r.promisedPrepMin)} />
          <Row label="Actual prep time" value={mins(r.actualPrepMin)} bad={r.lateByMin > 0} />
          {r.lateByMin > 0 && <Row label="Late by" value={mins(r.lateByMin)} bad />}
          {r.extended && <Row label="Original ready time" value={clock(r.originalEta)} />}
          <Row label="Ready deadline" value={clock(r.approvedEta)} />
        </Card>

        <Card icon={Bike} title="Delivery partner time" name={d.name ? `${d.name}${d.phone ? ` · ${d.phone}` : ""}` : ""} status={d.status}>
          <Row label="Took to accept" value={mins(d.assignToAcceptMin)} />
          <Row label="Travel to restaurant" value={mins(d.travelToRestaurantMin)} />
          <Row label="Waited at restaurant" value={mins(d.waitedAtRestaurantMin)} />
          <Row label="Delivery time (pickup → drop)" value={mins(d.deliveryTimeMin)} bad={d.lateByMin > 0} />
          <Row label="Expected delivery time" value={d.estimatedDeliveryMin ? `${d.estimatedDeliveryMin} min${d.externalDelayMin ? ` (+${d.externalDelayMin} approved delay)` : ""}` : "-"} />
          {d.lateByMin > 0 && <Row label="Late by" value={mins(d.lateByMin)} bad />}
        </Card>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Timeline</p>
        <ol className="relative space-y-2 border-l-2 border-slate-200 pl-4">
          {t.events.map((e, i) => {
            const prev = t.events[i - 1]
            const gap = prev ? Math.round(((new Date(e.at) - new Date(prev.at)) / 60000) * 10) / 10 : null
            return (
              <li key={e.key} className="relative text-xs">
                <span className="absolute -left-[22px] top-0.5 h-3 w-3 rounded-full border-2 border-white bg-slate-700" />
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">{e.label}</span>
                  <span className="font-mono text-slate-600">{clock(e.at)}{gap != null ? <span className="ml-2 text-slate-400">+{gap}m</span> : null}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      {(t.penalties?.length > 0 || t.cancellation) && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-center gap-1.5 font-black"><AlertTriangle className="h-4 w-4" /> Penalties & cancellation on this order</p>
          {t.penalties.map((p, i) => (
            <p key={i}>{p.partyType === "RESTAURANT" ? "Restaurant" : "Delivery partner"}: {String(p.violationType).replace(/_/g, " ").toLowerCase()}{p.delayMinutes ? ` (${p.delayMinutes} min late)` : ""} → {p.stage === "warning" ? "warning" : `₹${p.amount}`} ({p.status})</p>
          ))}
          {t.cancellation && <p>Customer cancellation: stage {t.cancellation.stage}, charge ₹{t.cancellation.breakdown?.total || 0} ({t.cancellation.payMode === "refund_deduction" ? "cut from refund" : "added to dues"}), {String(t.cancellation.status).replace(/_/g, " ")}</p>}
        </div>
      )}
      {t.orderStatus === "delivered" && t.penalties?.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> No penalties on this order</p>
      )}
    </div>
  )
}
