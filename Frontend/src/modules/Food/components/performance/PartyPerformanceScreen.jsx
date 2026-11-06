import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Loader2, Paperclip, ShieldAlert, X } from "lucide-react"
import { toast } from "sonner"
import { uploadEvidence } from "@food/api/performanceAPI"

export const inr = (v) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v) || 0)

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "-"

export const apiMsg = (e, fallback) => e?.response?.data?.message || fallback

export const VIOLATION_LABELS = {
  PREP_DELAY: "Preparation delay",
  DELIVERY_DELAY: "Delivery delay",
  ORDER_REJECTION: "Order rejection",
  ASSIGNMENT_REJECTION: "Assignment rejection",
  POST_ACCEPT_CANCELLATION: "Cancelled after accepting",
}

const STATUS_STYLE = {
  warning: "bg-amber-100 text-amber-800",
  pending: "bg-blue-100 text-blue-800",
  applied: "bg-red-100 text-red-800",
  disputed: "bg-purple-100 text-purple-800",
  waived: "bg-green-100 text-green-800",
  reversed: "bg-green-100 text-green-800",
  open: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
}

export function StatusPill({ status }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[status] || "bg-gray-100 text-gray-700"}`}>
      {String(status || "").replace(/_/g, " ")}
    </span>
  )
}

export function StatCard({ label, value, tone = "default" }) {
  const toneCls = tone === "bad" ? "text-red-600" : tone === "good" ? "text-green-600" : "text-gray-900"
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${toneCls}`}>{value}</p>
    </div>
  )
}

export function AppealModal({ row, role, onClose, onDone, api }) {
  const [reason, setReason] = useState("")
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!reason.trim()) return toast.error("Please explain why this penalty is wrong")
    setBusy(true)
    try {
      const urls = []
      for (const f of files) {
        const u = await uploadEvidence(f, role)
        if (u) urls.push(u)
      }
      await api.createAppeal({ ledgerId: row._id, reason: reason.trim(), evidence: urls })
      toast.success("Appeal submitted. No deduction happens while it is under review.")
      onDone()
    } catch (e) {
      toast.error(apiMsg(e, "Could not submit appeal"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">Appeal penalty</h3>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {VIOLATION_LABELS[row.violationType]} · Order {String(row.orderId).slice(-8)} · {inr(row.amount)}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Explain what happened"
          className="mt-3 w-full rounded-lg border border-gray-300 p-2 text-sm"
        />
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <Paperclip className="h-4 w-4" />
          <span>{files.length ? `${files.length} file(s) attached` : "Attach evidence (optional, up to 5)"}</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))} />
        </label>
        <button
          onClick={submit}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-black py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit appeal
        </button>
      </div>
    </div>
  )
}

function Rules({ cfg, party }) {
  if (!cfg) return null
  const delay = party === "delivery" ? cfg.deliveryDelaySlabs : cfg.restaurantDelaySlabs
  const rej = party === "delivery" ? cfg.deliveryRejectionSlabs : cfg.restaurantRejectionSlabs
  const slab = (s) => (s.action === "warning" ? "Warning" : `${inr(s.amount)}${s.strike ? ` + ${s.strike} strike` : ""}`)
  return (
    <details className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
      <summary className="cursor-pointer font-semibold">How penalties work</summary>
      <p className="mt-2 text-xs font-semibold text-gray-600">{party === "delivery" ? "Late delivery (after adjusted ETA)" : "Late preparation (after approved time)"}</p>
      <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
        {delay.map((s, i) => (
          <li key={i}>{s.fromMin}{s.toMin ? `–${s.toMin}` : "+"} min: {slab(s)}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs font-semibold text-gray-600">Rejections this month</p>
      <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
        {rej.map((s) => (
          <li key={s.occurrence}>#{s.occurrence}{s.occurrence === rej.length ? " and after" : ""}: {slab(s)}{s.adminReview ? " + admin review" : ""}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs font-semibold text-gray-600">Strikes (monthly)</p>
      <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
        {(cfg.strikeLadder || []).map((s) => (
          <li key={s.count}>Strike {s.count}: {s.action === "suspend" ? `${s.suspendHours}h suspension` : s.action === "notice" ? "Performance notice" : s.action === "review" ? "Admin review" : "Warning"}</li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Shared performance page for restaurant and delivery partner apps.
 * `stats` maps dashboard fields to labelled cards.
 */
export default function PartyPerformanceScreen({ api, role, party, title, stats }) {
  const [dash, setDash] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [ledger, setLedger] = useState([])
  const [appeals, setAppeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [appealRow, setAppealRow] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, c, l, a] = await Promise.all([api.dashboard(), api.config(), api.ledger({ limit: 50 }), api.appeals()])
      setDash(d?.data?.data || null)
      setCfg(c?.data?.data || null)
      setLedger(l?.data?.data?.items || [])
      setAppeals(a?.data?.data || [])
    } catch (e) {
      toast.error(apiMsg(e, "Could not load performance"))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const openAppeal = new Set(appeals.filter((a) => a.status === "open").map((a) => String(a.ledgerId)))
  const appealByLedger = new Map(appeals.map((a) => [String(a.ledgerId), a]))

  if (loading && !dash) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-500" /></div>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <h1 className="text-lg font-bold">{title}</h1>

      {dash?.suspension?.suspended && (
        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Account suspended</p>
            <p className="text-xs">Until {fmtDate(dash.suspension.until)}</p>
          </div>
        </div>
      )}
      {!dash?.suspension?.suspended && dash?.totalStrikes > 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>You have {dash.totalStrikes} strike(s) this month ({dash.month}).</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => {
          const raw = dash?.[s.key]
          const value = s.format ? s.format(raw) : raw ?? 0
          return <StatCard key={s.key} label={s.label} value={value} tone={s.tone?.(raw)} />
        })}
        <StatCard label="Strikes (month)" value={dash?.totalStrikes ?? 0} tone={dash?.totalStrikes ? "bad" : "default"} />
        <StatCard label="Penalties (month)" value={inr(dash?.totalPenalties)} tone={dash?.totalPenalties ? "bad" : "default"} />
      </div>

      <Rules cfg={cfg} party={party} />

      <section>
        <h2 className="mb-2 text-sm font-bold">Warnings & penalties</h2>
        {ledger.length === 0 && <p className="rounded-xl bg-white p-4 text-center text-sm text-gray-500">Nothing here. Keep it up!</p>}
        <div className="space-y-2">
          {ledger.map((r) => {
            const ap = appealByLedger.get(String(r._id))
            const canAppeal = r.stage === "penalty" && ["applied", "pending"].includes(r.status) && !r.settled && !openAppeal.has(String(r._id))
            return (
              <div key={r._id} className="rounded-xl border border-gray-200 bg-white p-3 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{VIOLATION_LABELS[r.violationType] || r.violationType}</p>
                    <p className="text-xs text-gray-500">Order {String(r.orderId).slice(-8)} · {fmtDate(r.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{r.amount ? inr(r.amount) : "-"}</p>
                    <StatusPill status={r.status} />
                  </div>
                </div>
                {r.delayMinutes > 0 && (
                  <p className="mt-1 text-xs text-gray-600">
                    {r.delayMinutes} min late · due {fmtDate(r.approvedEta)}{r.originalEta && String(r.originalEta) !== String(r.approvedEta) ? ` (originally ${fmtDate(r.originalEta)})` : ""} · done {fmtDate(r.actualAt)}
                  </p>
                )}
                {r.reason && <p className="mt-1 text-xs text-gray-600">Reason: {r.reason}</p>}
                {r.strikeCount > 0 && r.status === "applied" && <p className="mt-1 text-xs font-semibold text-red-600">+{r.strikeCount} strike</p>}
                {r.statusReason && <p className="mt-1 text-xs text-gray-500">Note: {r.statusReason}</p>}
                {ap && (
                  <p className="mt-1 text-xs">Appeal: <StatusPill status={ap.status} />{ap.adminNote ? ` · ${ap.adminNote}` : ""}</p>
                )}
                {canAppeal && (
                  <button onClick={() => setAppealRow(r)} className="mt-2 rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold">
                    Appeal this penalty
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {appealRow && (
        <AppealModal row={appealRow} role={role} api={api} onClose={() => setAppealRow(null)} onDone={() => { setAppealRow(null); load() }} />
      )}
    </div>
  )
}
