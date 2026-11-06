import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminPerformanceAPI as api } from "@food/api/performanceAPI"
import { StatusPill, StatCard, inr, fmtDate, apiMsg, VIOLATION_LABELS } from "@food/components/performance/PartyPerformanceScreen"

const TABS = [
  ["restaurants", "Restaurants"],
  ["delivery", "Delivery partners"],
  ["ledger", "Penalty ledger"],
  ["appeals", "Appeals"],
  ["extensions", "Prep extensions"],
  ["eta", "Delivery ETA"],
  ["strikes", "Strikes"],
  ["rules", "Rules & settings"],
  ["audit", "Audit log"],
]

const thisMonth = () => {
  const d = new Date(Date.now() + 330 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

const Table = ({ head, children, empty }) => (
  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
        <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-gray-100">{children}</tbody>
    </table>
    {empty && <p className="p-6 text-center text-sm text-gray-500">{empty}</p>}
  </div>
)

const useLoad = (fn, deps) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fn()
      setData(res?.data?.data ?? null)
    } catch (e) {
      toast.error(apiMsg(e, "Failed to load"))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { data, loading, reload }
}

const askNote = (msg) => {
  const v = window.prompt(msg)
  return v == null ? null : v.trim()
}

/* ----------------------------- Overview ----------------------------- */
function Overview({ kind }) {
  const [month, setMonth] = useState(thisMonth())
  const [open, setOpen] = useState(null)
  const { data, loading } = useLoad(() => api.overview(kind, month), [kind, month])
  const detail = useLoad(() => (open ? api.detail(kind, open, month) : Promise.resolve(null)), [open, kind, month])
  const isR = kind === "restaurants"
  return (
    <div className="space-y-3">
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 p-2 text-sm" />
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <Table head={["Partner ID", "Violations", isR ? "Prep delays" : "Delivery delays", "Rejections", "Cancels after accept", "Warnings", "Strikes", "Penalties", "Outstanding", "Status", ""]} empty={!(data || []).length ? "No violations this month" : null}>
          {(data || []).map((r) => (
            <tr key={r.partyId}>
              <td className="px-3 py-2 font-mono text-xs">{String(r.partyId).slice(-8)}</td>
              <td className="px-3 py-2">{r.violations}</td>
              <td className="px-3 py-2">{r.delays}</td>
              <td className="px-3 py-2">{r.rejections}</td>
              <td className="px-3 py-2">{r.cancellations}</td>
              <td className="px-3 py-2">{r.warnings}</td>
              <td className="px-3 py-2 font-semibold">{r.strikes}</td>
              <td className="px-3 py-2">{inr(r.penalties)}</td>
              <td className="px-3 py-2">{inr(r.outstanding)}</td>
              <td className="px-3 py-2">{r.suspendedUntil ? <span className="text-xs font-semibold text-red-600">Suspended till {fmtDate(r.suspendedUntil)}</span> : "OK"}</td>
              <td className="px-3 py-2"><button className="text-xs font-semibold text-blue-600" onClick={() => setOpen(r.partyId)}>Dashboard</button></td>
            </tr>
          ))}
        </Table>
      )}
      {open && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">{isR ? "Restaurant" : "Delivery partner"} {String(open).slice(-8)} · {month}</h3>
            <button className="text-xs text-gray-500" onClick={() => setOpen(null)}>Close</button>
          </div>
          {detail.loading || !detail.data ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(isR ? [
                ["Total orders", detail.data.totalOrders], ["Accepted", detail.data.acceptedOrders], ["Rejected", detail.data.rejectedOrders], ["Prep delays", detail.data.prepDelayCount],
                ["On-time prep", `${detail.data.onTimePrepPercent}%`], ["Avg prep (min)", detail.data.avgPrepMinutes], ["Bulk orders", detail.data.bulkOrders],
              ] : [
                ["Assigned", detail.data.totalAssigned], ["Accepted", detail.data.acceptedAssignments], ["Rejected", detail.data.rejectedAssignments], ["Completed", detail.data.completedDeliveries],
                ["Delivery delays", detail.data.deliveryDelayCount], ["On-time delivery", `${detail.data.onTimeDeliveryPercent}%`], ["Avg delivery (min)", detail.data.avgDeliveryMinutes],
              ]).map(([l, v]) => <StatCard key={l} label={l} value={v ?? 0} />)}
              <StatCard label="Total strikes" value={detail.data.totalStrikes} tone={detail.data.totalStrikes ? "bad" : "default"} />
              <StatCard label="Total penalties" value={inr(detail.data.totalPenalties)} />
              <StatCard label="Outstanding" value={inr(detail.data.outstandingPenalties)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ----------------------------- Ledger ----------------------------- */
function Ledger() {
  const [filters, setFilters] = useState({ status: "", partyType: "", violationType: "", partyId: "", orderId: "" })
  const { data, loading, reload } = useLoad(() => api.ledger(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))), [filters])
  const act = async (row, action) => {
    let note = ""
    if (action !== "approve" && action !== "settle") {
      note = askNote(`Reason to ${action} this penalty (required):`)
      if (!note) return
    }
    try {
      await api.decideLedger(row._id, action, note)
      toast.success("Updated")
      reload()
    } catch (e) {
      toast.error(apiMsg(e, "Failed"))
    }
  }
  const sel = (k, opts) => (
    <select value={filters[k]} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} className="rounded-lg border border-gray-300 p-2 text-sm">
      <option value="">All {k}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {sel("status", ["warning", "pending", "applied", "disputed", "waived", "reversed"].map((x) => [x, x]))}
        {sel("partyType", [["RESTAURANT", "Restaurant"], ["DELIVERY_PARTNER", "Delivery partner"]])}
        {sel("violationType", Object.entries(VIOLATION_LABELS))}
        <input placeholder="Party ID (full)" value={filters.partyId} onChange={(e) => setFilters({ ...filters, partyId: e.target.value.trim() })} className="rounded-lg border border-gray-300 p-2 text-sm" />
        <input placeholder="Order ID (full)" value={filters.orderId} onChange={(e) => setFilters({ ...filters, orderId: e.target.value.trim() })} className="rounded-lg border border-gray-300 p-2 text-sm" />
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <Table head={["When", "Order", "Party", "Violation", "Original ETA", "Approved ETA", "Actual", "Delay", "Amount", "Strike", "Status", "Actions"]} empty={!(data?.items || []).length ? "No entries" : null}>
          {(data?.items || []).map((r) => (
            <tr key={r._id} className="align-top">
              <td className="px-3 py-2 text-xs">{fmtDate(r.createdAt)}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(r.orderId).slice(-8)}</td>
              <td className="px-3 py-2 text-xs">{r.partyType === "RESTAURANT" ? "Rest." : "Rider"} {String(r.partyId).slice(-6)}</td>
              <td className="px-3 py-2 text-xs">{VIOLATION_LABELS[r.violationType]}{r.occurrenceInMonth ? ` #${r.occurrenceInMonth}` : ""}{r.reason ? <div className="text-gray-500">{r.reason}</div> : null}</td>
              <td className="px-3 py-2 text-xs">{fmtDate(r.originalEta)}</td>
              <td className="px-3 py-2 text-xs">{fmtDate(r.approvedEta)}</td>
              <td className="px-3 py-2 text-xs">{fmtDate(r.actualAt)}</td>
              <td className="px-3 py-2">{r.delayMinutes ? `${r.delayMinutes}m` : "-"}</td>
              <td className="px-3 py-2">{inr(r.amount)}{r.settled ? <div className="text-[10px] text-green-700">settled</div> : null}</td>
              <td className="px-3 py-2">{r.strikeCount || "-"}</td>
              <td className="px-3 py-2"><StatusPill status={r.status} />{r.reviewHold ? <div className="text-[10px] text-blue-700">needs review</div> : null}{r.adminReview ? <div className="text-[10px] text-red-700">admin review</div> : null}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1 text-xs font-semibold">
                  {r.status === "pending" && <button className="text-green-700" onClick={() => act(r, "approve")}>Approve</button>}
                  {["pending", "applied", "disputed", "warning"].includes(r.status) && <button className="text-amber-700" onClick={() => act(r, "waive")}>Waive</button>}
                  {["applied", "disputed"].includes(r.status) && <button className="text-red-700" onClick={() => act(r, "reverse")}>Reverse</button>}
                  {r.status === "applied" && r.stage === "penalty" && r.amount > 0 && !r.settled && <button className="text-blue-700" onClick={() => act(r, "settle")}>Mark settled</button>}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-xs text-gray-500">Settling only records that finance deducted the amount from the payout; this module never moves wallet money by itself. A disputed penalty cannot be settled.</p>
    </div>
  )
}

/* ----------------------------- Appeals ----------------------------- */
function Appeals() {
  const [status, setStatus] = useState("open")
  const { data, loading, reload } = useLoad(() => api.appeals(status ? { status } : {}), [status])
  const decide = async (a, approve) => {
    const note = askNote(approve ? "Note (optional):" : "Reason for rejecting (required):")
    if (note === null || (!approve && !note)) return
    try {
      await api.decideAppeal(a._id, approve, note)
      toast.success(approve ? "Appeal approved, penalty reversed" : "Appeal rejected")
      reload()
    } catch (e) {
      toast.error(apiMsg(e, "Failed"))
    }
  }
  return (
    <div className="space-y-3">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 p-2 text-sm">
        <option value="">All</option><option value="open">Open</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
      </select>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <Table head={["When", "Party", "Penalty", "Reason", "Evidence", "Status", ""]} empty={!(data || []).length ? "No appeals" : null}>
          {(data || []).map((a) => (
            <tr key={a._id} className="align-top">
              <td className="px-3 py-2 text-xs">{fmtDate(a.createdAt)}</td>
              <td className="px-3 py-2 text-xs">{a.partyType === "RESTAURANT" ? "Rest." : "Rider"} {String(a.partyId).slice(-6)}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(a.ledgerId).slice(-8)}</td>
              <td className="max-w-xs px-3 py-2 text-xs">{a.reason}{a.adminNote ? <div className="text-gray-500">Admin: {a.adminNote}</div> : null}</td>
              <td className="px-3 py-2 text-xs">{(a.evidence || []).map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" className="mr-1 text-blue-600 underline">file {i + 1}</a>)}</td>
              <td className="px-3 py-2"><StatusPill status={a.status} /></td>
              <td className="px-3 py-2 text-xs font-semibold">
                {a.status === "open" && <div className="flex gap-2"><button className="text-green-700" onClick={() => decide(a, true)}>Approve</button><button className="text-red-700" onClick={() => decide(a, false)}>Reject</button></div>}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

/* ----------------------------- Extensions ----------------------------- */
function Extensions() {
  const [status, setStatus] = useState("pending_admin")
  const { data, loading, reload } = useLoad(() => api.extensions(status ? { status } : {}), [status])
  const decide = async (e, approve, skipCustomer) => {
    try {
      await api.decideExtension(e._id, approve, skipCustomer)
      toast.success("Updated")
      reload()
    } catch (err) {
      toast.error(apiMsg(err, "Failed"))
    }
  }
  return (
    <div className="space-y-3">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 p-2 text-sm">
        <option value="">All</option>
        {["pending_admin", "pending_customer", "approved", "rejected", "expired"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </select>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <Table head={["When", "Order", "Items", "Original → requested ETA", "Extra", "Reason", "Status", ""]} empty={!(data || []).length ? "Nothing here" : null}>
          {(data || []).map((e) => (
            <tr key={e._id} className="align-top">
              <td className="px-3 py-2 text-xs">{fmtDate(e.createdAt)}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(e.orderId).slice(-8)}</td>
              <td className="px-3 py-2 text-xs">{e.itemCount} ({e.tierKey})</td>
              <td className="px-3 py-2 text-xs">{fmtDate(e.originalEta)} → {fmtDate(e.requestedEta)}</td>
              <td className="px-3 py-2">{e.extraMinutes}m</td>
              <td className="max-w-xs px-3 py-2 text-xs">{e.reason}</td>
              <td className="px-3 py-2"><StatusPill status={e.status} /></td>
              <td className="px-3 py-2 text-xs font-semibold">
                {e.status === "pending_admin" && (
                  <div className="flex flex-wrap gap-2">
                    <button className="text-green-700" onClick={() => decide(e, true, false)}>Approve (ask customer)</button>
                    <button className="text-blue-700" onClick={() => decide(e, true, true)}>Approve (final)</button>
                    <button className="text-red-700" onClick={() => decide(e, false, false)}>Reject</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

/* ----------------------------- Delivery ETA ----------------------------- */
function EtaTool() {
  const [orderId, setOrderId] = useState("")
  const [timing, setTiming] = useState(null)
  const [minutes, setMinutes] = useState("")
  const [note, setNote] = useState("")
  const look = async () => {
    try {
      const res = await api.orderTiming(orderId.trim())
      setTiming(res?.data?.data)
    } catch (e) {
      toast.error(apiMsg(e, "Order not found"))
    }
  }
  const adjust = async (adjustmentId, approve) => {
    try {
      await api.adjustDelivery(orderId.trim(), adjustmentId ? { adjustmentId, approve } : { minutes: Number(minutes), note, reasonCode: "admin_adjustment" })
      toast.success("ETA updated")
      look()
    } catch (e) {
      toast.error(apiMsg(e, "Failed"))
    }
  }
  const d = timing?.delivery
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order ID" className="w-full max-w-sm rounded-lg border border-gray-300 p-2 text-sm" />
        <button onClick={look} className="rounded-lg bg-black px-4 text-sm font-semibold text-white">Load</button>
      </div>
      {timing && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <p><b>Status:</b> {timing.orderStatus} · server time {fmtDate(timing.serverNow)}</p>
          <p><b>Preparation:</b> original {fmtDate(timing.prep?.originalEta)} · approved {fmtDate(timing.prep?.approvedEta)} {timing.prep?.extended ? "(extended)" : ""}</p>
          <p><b>Delivery:</b> picked up {fmtDate(d?.pickedUpAt)} · est. {d?.estimatedMinutes || 0} min · original {fmtDate(d?.originalEta)} · adjusted {fmtDate(d?.adjustedEta)}</p>
          {(d?.adjustments || []).map((a) => (
            <div key={a._id} className="flex items-center justify-between rounded-lg bg-gray-50 p-2 text-xs">
              <span>+{a.minutes} min · {a.reasonCode} · {a.requestedBy} {a.note ? `· ${a.note}` : ""}</span>
              {a.status === "pending" ? (
                <span className="flex gap-2 font-semibold"><button className="text-green-700" onClick={() => adjust(a._id, true)}>Approve</button><button className="text-red-700" onClick={() => adjust(a._id, false)}>Reject</button></span>
              ) : <StatusPill status={a.status} />}
            </div>
          ))}
          {d?.originalEta && (
            <div className="flex flex-wrap gap-2">
              <input type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Add minutes" className="w-32 rounded-lg border border-gray-300 p-2 text-sm" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason" className="rounded-lg border border-gray-300 p-2 text-sm" />
              <button onClick={() => adjust(null, true)} className="rounded-lg border border-gray-300 px-3 text-sm font-semibold">Add external delay</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ----------------------------- Strikes ----------------------------- */
function Strikes() {
  const [month, setMonth] = useState(thisMonth())
  const { data, loading, reload } = useLoad(() => api.strikes({ month }), [month])
  const revoke = async (s) => {
    const note = askNote("Reason for removing this strike (required):")
    if (!note) return
    try {
      await api.revokeStrike(s._id, note)
      toast.success("Strike removed")
      reload()
    } catch (e) {
      toast.error(apiMsg(e, "Failed"))
    }
  }
  return (
    <div className="space-y-3">
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 p-2 text-sm" />
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <Table head={["When", "Party", "Order", "Monthly #", "Action", "Suspended until", "Status", ""]} empty={!(data || []).length ? "No strikes" : null}>
          {(data || []).map((s) => (
            <tr key={s._id}>
              <td className="px-3 py-2 text-xs">{fmtDate(s.createdAt)}</td>
              <td className="px-3 py-2 text-xs">{s.partyType === "RESTAURANT" ? "Rest." : "Rider"} {String(s.partyId).slice(-6)}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(s.orderId || "").slice(-8)}</td>
              <td className="px-3 py-2">{s.monthlyCount}</td>
              <td className="px-3 py-2 capitalize">{s.action}</td>
              <td className="px-3 py-2 text-xs">{fmtDate(s.suspendedUntil)}</td>
              <td className="px-3 py-2">{s.revoked ? "Removed" : "Active"}</td>
              <td className="px-3 py-2 text-xs font-semibold">{!s.revoked && <button className="text-red-700" onClick={() => revoke(s)}>Remove</button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

/* ----------------------------- Rules ----------------------------- */
const numInput = (v, on, props = {}) => (
  <input type="number" value={v ?? ""} onChange={(e) => on(e.target.value === "" ? "" : Number(e.target.value))} className="w-24 rounded border border-gray-300 p-1 text-sm" {...props} />
)

function ListEditor({ title, rows, setRows, columns, blank }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-bold">{title}</h4>
        <button onClick={() => setRows([...rows, { ...blank }])} className="flex items-center gap-1 text-xs font-semibold text-blue-600"><Plus className="h-3 w-3" /> Add</button>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            {columns.map((c) => (
              <label key={c.key} className="flex items-center gap-1 text-xs text-gray-600">
                {c.label}
                {c.type === "select" ? (
                  <select value={r[c.key] ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [c.key]: e.target.value } : x)))} className="rounded border border-gray-300 p-1 text-sm">
                    {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : c.type === "bool" ? (
                  <input type="checkbox" checked={!!r[c.key]} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [c.key]: e.target.checked } : x)))} />
                ) : c.type === "text" ? (
                  <input value={r[c.key] ?? ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [c.key]: e.target.value } : x)))} className="w-32 rounded border border-gray-300 p-1 text-sm" />
                ) : (
                  numInput(r[c.key], (v) => setRows(rows.map((x, j) => (j === i ? { ...x, [c.key]: c.nullable && v === "" ? null : v } : x))))
                )}
              </label>
            ))}
            <button onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove row"><Trash2 className="h-4 w-4 text-red-600" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

const DELAY_COLS = [
  { key: "fromMin", label: "From min" },
  { key: "toMin", label: "To min (blank = open)", nullable: true },
  { key: "action", label: "Action", type: "select", options: ["warning", "penalty"] },
  { key: "amount", label: "₹" },
  { key: "strike", label: "Strikes" },
]
const REJ_COLS = [
  { key: "occurrence", label: "Nth rejection" },
  { key: "action", label: "Action", type: "select", options: ["warning", "penalty"] },
  { key: "amount", label: "₹" },
  { key: "strike", label: "Strikes" },
  { key: "adminReview", label: "Admin review", type: "bool" },
]

function Rules() {
  const { data, loading, reload } = useLoad(() => api.getConfig(), [])
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (data) setCfg(JSON.parse(JSON.stringify(data))) }, [data])
  if (loading || !cfg) return <Loader2 className="h-5 w-5 animate-spin" />
  const set = (k, v) => setCfg({ ...cfg, [k]: v })
  const field = (label, k, props) => (
    <label className="flex items-center justify-between gap-3 text-sm">{label}{numInput(cfg[k], (v) => set(k, v), props)}</label>
  )
  const toggle = (label, k, hint) => (
    <label className="flex items-start justify-between gap-3 text-sm">
      <span>{label}{hint ? <span className="block text-xs text-gray-500">{hint}</span> : null}</span>
      <input type="checkbox" checked={!!cfg[k]} onChange={(e) => set(k, e.target.checked)} className="mt-1" />
    </label>
  )
  const save = async () => {
    setSaving(true)
    try {
      await api.updateConfig(cfg)
      toast.success("Settings saved and logged")
      reload()
    } catch (e) {
      toast.error(apiMsg(e, "Could not save"))
    } finally {
      setSaving(false)
    }
  }
  const csv = (k) => (
    <label className="block text-sm">
      <span className="text-gray-700">{k === "validRejectionReasons" ? "Valid rejection reason codes" : "External delay reason codes"} (comma separated)</span>
      <input value={(cfg[k] || []).join(", ")} onChange={(e) => set(k, e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" />
    </label>
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-sm font-bold">General</h4>
          {toggle("System enabled", "enabled", "Off = no new violations are recorded")}
          {field("Default prep time (min)", "defaultPrepMinutes")}
          {field("Max prep time a restaurant can set (min)", "maxPrepMinutes")}
          {field("Warn restaurant / rider this many minutes BEFORE the deadline (0 = off)", "preWarnMinutes")}
          {field("Grace before a delay counts (sec)", "graceSeconds")}
          <label className="flex items-center justify-between gap-3 text-sm">Partial minutes
            <select value={cfg.delayRounding} onChange={(e) => set("delayRounding", e.target.value)} className="rounded border border-gray-300 p-1 text-sm"><option value="floor">Round down (5m59s = 5)</option><option value="ceil">Round up (5m01s = 6)</option></select>
          </label>
          {field("Timezone offset from UTC (min, IST = 330)", "timezoneOffsetMin")}
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-bold">Delivery timer, extensions & enforcement</h4>
          {field("Delivery base time (min)", "deliveryBaseMinutes")}
          {field("Extra minutes per km", "deliveryMinutesPerKm")}
          {field("Delivery buffer (min)", "deliveryBufferMinutes")}
          {field("Max external delay a rider can report (min)", "maxExternalDelayMinutes")}
          {field("Customer response window (min)", "extensionResponseWindowMin")}
          {field("Allow extension request after deadline (min)", "extensionCutoffMin")}
          {toggle("Auto-waive valid reasons", "autoWaiveValidReasons", "Off = penalty waits for admin review when a valid reason is chosen")}
          {toggle("Penalties need admin approval", "requireAdminApproval")}
          {toggle("Block suspended accounts", "autoEnforceSuspension", "Suspended restaurants cannot accept orders; suspended riders cannot accept deliveries")}
        </div>
      </div>
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">{csv("validRejectionReasons")}{csv("externalDelayReasons")}</div>
      <ListEditor title="Restaurant preparation-delay slabs" rows={cfg.restaurantDelaySlabs} setRows={(v) => set("restaurantDelaySlabs", v)} columns={DELAY_COLS} blank={{ fromMin: 1, toMin: null, action: "penalty", amount: 0, strike: 0 }} />
      <ListEditor title="Delivery-delay slabs" rows={cfg.deliveryDelaySlabs} setRows={(v) => set("deliveryDelaySlabs", v)} columns={DELAY_COLS} blank={{ fromMin: 1, toMin: null, action: "penalty", amount: 0, strike: 0 }} />
      <ListEditor title="Restaurant rejection slabs (per month)" rows={cfg.restaurantRejectionSlabs} setRows={(v) => set("restaurantRejectionSlabs", v)} columns={REJ_COLS} blank={{ occurrence: cfg.restaurantRejectionSlabs.length + 1, action: "penalty", amount: 0, strike: 0, adminReview: false }} />
      <ListEditor title="Delivery rejection slabs (per month)" rows={cfg.deliveryRejectionSlabs} setRows={(v) => set("deliveryRejectionSlabs", v)} columns={REJ_COLS} blank={{ occurrence: cfg.deliveryRejectionSlabs.length + 1, action: "penalty", amount: 0, strike: 0, adminReview: false }} />
      <ListEditor title="Strike ladder (per month)" rows={cfg.strikeLadder} setRows={(v) => set("strikeLadder", v)} columns={[{ key: "count", label: "Strike #" }, { key: "action", label: "Action", type: "select", options: ["warning", "notice", "suspend", "review"] }, { key: "suspendHours", label: "Suspend hours" }]} blank={{ count: cfg.strikeLadder.length + 1, action: "warning", suspendHours: 0 }} />
      <ListEditor title="Order size tiers & extra-time rules" rows={cfg.orderTiers} setRows={(v) => set("orderTiers", v)}
        columns={[{ key: "key", label: "Key", type: "text" }, { key: "label", label: "Name", type: "text" }, { key: "minItems", label: "From items" }, { key: "maxItems", label: "To items (blank = open)", nullable: true }, { key: "maxExtraMinutes", label: "Max extra min (0 = none)" }, { key: "needsCustomerApproval", label: "Customer approves", type: "bool" }, { key: "needsAdminApproval", label: "Admin approves", type: "bool" }, { key: "countsAsBulk", label: "Counts as bulk", type: "bool" }]}
        blank={{ key: `tier${cfg.orderTiers.length + 1}`, label: "New tier", minItems: 1, maxItems: null, extraMinutes: 0, maxExtraMinutes: 0, needsCustomerApproval: true, needsAdminApproval: false, countsAsBulk: false }} />
      <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
      </button>
      <p className="text-xs text-gray-500">Slabs must be continuous (no gaps/overlaps), the last slab open-ended, and tiers must cover every item count. The server rejects invalid rules.</p>
    </div>
  )
}

/* ----------------------------- Audit ----------------------------- */
function Audit() {
  const { data, loading } = useLoad(() => api.audit({ limit: 200 }), [])
  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />
  return (
    <Table head={["When", "Admin", "Action", "Target", "Note"]} empty={!(data || []).length ? "No changes yet" : null}>
      {(data || []).map((a) => (
        <tr key={a._id}>
          <td className="px-3 py-2 text-xs">{fmtDate(a.createdAt)}</td>
          <td className="px-3 py-2 font-mono text-xs">{a.actorId ? String(a.actorId).slice(-6) : "system"}</td>
          <td className="px-3 py-2 text-xs font-semibold">{a.action}</td>
          <td className="px-3 py-2 text-xs">{a.targetType} {String(a.targetId).slice(-8)}</td>
          <td className="px-3 py-2 text-xs">{a.note}</td>
        </tr>
      ))}
    </Table>
  )
}

export default function PerformanceCenter() {
  const [tab, setTab] = useState("restaurants")
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Penalties & Performance</h1>
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 text-sm font-semibold ${tab === id ? "border-b-2 border-black text-black" : "text-gray-500"}`}>{label}</button>
        ))}
      </div>
      {tab === "restaurants" && <Overview kind="restaurants" />}
      {tab === "delivery" && <Overview kind="delivery" />}
      {tab === "ledger" && <Ledger />}
      {tab === "appeals" && <Appeals />}
      {tab === "extensions" && <Extensions />}
      {tab === "eta" && <EtaTool />}
      {tab === "strikes" && <Strikes />}
      {tab === "rules" && <Rules />}
      {tab === "audit" && <Audit />}
    </div>
  )
}
