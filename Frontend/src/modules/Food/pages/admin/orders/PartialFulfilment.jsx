import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, X, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { adminFulfilmentAPI as api } from "@food/api/fulfilmentAPI"

const inr = (v) => `₹${(Number(v) || 0).toFixed(2).replace(/\.00$/, "")}`
const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "-")
const msg = (e, f) => e?.response?.data?.message || f

const STATE_LABEL = {
  awaiting_customer: ["Awaiting customer", "amber"],
  awaiting_payment: ["Payment adjustment", "blue"],
  applying: ["Processing", "blue"],
  resolved: ["Customer decided", "green"],
  cancelled: ["Cancelled", "red"],
}
const Pill = ({ children, tone = "gray" }) => {
  const t = { gray: "bg-gray-100 text-gray-700", red: "bg-red-100 text-red-700", green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-800", blue: "bg-blue-100 text-blue-700" }[tone]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>
}
const Card = ({ title, children, right }) => (
  <section className="rounded-2xl border border-gray-200 bg-white p-4">
    <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-gray-900">{title}</h2>{right}</div>
    {children}
  </section>
)

/* ----------------------------- Settings ----------------------------- */
function Settings() {
  const [s, setS] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { api.getSettings().then((r) => setS(r?.data?.data)).catch((e) => toast.error(msg(e, "Failed to load settings"))) }, [])
  if (!s) return <Card title="Settings"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></Card>

  const save = async () => {
    setSaving(true)
    try {
      const r = await api.updateSettings({
        enabled: s.enabled, replacementEnabled: s.replacementEnabled,
        responseWindowSec: Math.round(Number(s.responseMinutes ?? s.responseWindowSec / 60) * 60), defaultPreference: s.defaultPreference,
      })
      setS(r?.data?.data); toast.success("Saved")
    } catch (e) { toast.error(msg(e, "Could not save")) } finally { setSaving(false) }
  }
  const minutes = s.responseMinutes ?? Math.round((s.responseWindowSec / 60) * 100) / 100

  return (
    <Card title="Partial order fulfilment settings">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
          <input type="checkbox" checked={!!s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="mt-1" />
          <span><b className="text-sm">Partial order fulfilment</b><span className="block text-xs text-gray-500">Stores can report unavailable items and the customer decides, instead of the whole order being rejected.</span></span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
          <input type="checkbox" checked={!!s.replacementEnabled} onChange={(e) => setS({ ...s, replacementEnabled: e.target.checked })} className="mt-1" />
          <span><b className="text-sm">Item replacement</b><span className="block text-xs text-gray-500">Customers may pick replacements from the same store. When off, they can only continue without the items or cancel.</span></span>
        </label>
        <label className="block rounded-xl border border-gray-100 p-3">
          <b className="text-sm">Customer response time (minutes)</b>
          <input type="number" min="0.5" step="0.5" value={minutes} onChange={(e) => setS({ ...s, responseMinutes: e.target.value })} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
          <span className="mt-1 block text-xs text-gray-500">Default 5. On timeout the order is never cancelled — the store and admin are notified for follow-up.</span>
        </label>
        <label className="block rounded-xl border border-gray-100 p-3">
          <b className="text-sm">Default when the customer does not respond</b>
          <select value={s.defaultPreference} onChange={(e) => setS({ ...s, defaultPreference: e.target.value })} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value="ask">Wait — notify store &amp; admin only (recommended)</option>
            <option value="remove">Continue without unavailable items (only if the bill does not go up)</option>
          </select>
          <span className="mt-1 block text-xs text-gray-500">Customers can also set their own preference. An order is never auto-cancelled and no extra amount is ever auto-charged.</span>
        </label>
      </div>
      <button onClick={save} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
      </button>
    </Card>
  )
}

/* ----------------------------- Detail drawer ----------------------------- */
function BillCols({ before, after }) {
  const rows = [["Items", "subtotal"], ["Discount", "discount"], ["Delivery fee", "deliveryFee"], ["Platform fee", "platformFee"], ["Other charges", "additionalChargesTotal"], ["GST", "tax"], ["Total", "total"]]
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-1"></th><th>Original</th><th>Updated</th></tr></thead>
      <tbody>
        {rows.map(([label, k]) => {
          const changed = Math.abs((before?.[k] || 0) - (after?.[k] || 0)) > 0.004
          return (
            <tr key={k} className={k === "total" ? "border-t font-bold" : ""}>
              <td className="py-1 text-gray-600">{label}</td><td>{inr(before?.[k])}</td><td className={changed ? "font-semibold text-blue-700" : ""}>{inr(after?.[k])}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Detail({ id, onClose, onChanged }) {
  const [d, setD] = useState(null)
  const load = useCallback(async () => {
    try { setD((await api.order(id))?.data?.data) } catch (e) { toast.error(msg(e, "Failed to load order")) }
  }, [id])
  useEffect(() => { load() }, [load])

  const f = d?.fulfilment
  const originalBill = f?.original?.pricing ? {
    subtotal: f.original.pricing.subtotal, discount: f.original.pricing.discount, deliveryFee: f.original.pricing.deliveryFee, platformFee: f.original.pricing.platformFee,
    additionalChargesTotal: f.original.pricing.additionalChargesTotal, tax: f.original.pricing.tax, total: f.original.pricing.total,
  } : null

  const extend = async () => {
    const m = window.prompt("Give the customer how many more minutes?", "5")
    if (!m) return
    try { await api.extend(id, Number(m)); toast.success("Response time extended"); load(); onChanged() } catch (e) { toast.error(msg(e, "Failed")) }
  }
  const retry = async (key) => {
    try { await api.retryRefund(id, key); toast.success("Refund retried"); load(); onChanged() } catch (e) { toast.error(msg(e, "Retry failed")) }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-2xl space-y-4 overflow-y-auto bg-gray-50 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Order #{d?.order_id || "…"}</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-200"><X className="h-5 w-5" /></button>
        </div>
        {!d ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Pill tone={(STATE_LABEL[f.state] || [])[1]}>{(STATE_LABEL[f.state] || [f.state])[0]}</Pill>
              <span className="text-gray-600">{d.userId?.name || "Customer"} · {d.userId?.phone || ""}</span>
              <span className="text-gray-600">· {d.restaurantId?.restaurantName}</span>
              <span className="text-gray-600">· {d.payment?.method} / {d.payment?.status}</span>
            </div>
            {["awaiting_customer", "awaiting_payment"].includes(f.state) && (
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <span>Customer must decide by <b>{when(f.deadlineAt)}</b>{f.timeoutNotifiedAt ? " — response time is over (manual follow-up)" : ""}</span>
                <button onClick={extend} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">Extend time</button>
              </div>
            )}

            <Card title="Unavailable items">
              <ul className="space-y-1 text-sm">
                {(f.unavailableItems || []).map((u) => <li key={u.lineKey}>{u.quantity} × {u.name} <span className="text-gray-400">({inr(u.price * u.quantity)}) · reported {when(u.reportedAt)}</span></li>)}
              </ul>
            </Card>

            {(f.modifications || []).map((m) => (
              <Card key={m.version} title={`Change #${m.version} · ${m.action} · by ${m.by}`} right={<span className="text-xs text-gray-500">{when(m.at)}</span>}>
                <ul className="mb-3 space-y-1 text-sm">
                  {m.lines.map((l) => (
                    <li key={l.lineKey}>{l.action === "replace" ? `${l.name} → ${l.replacement.quantity} × ${l.replacement.name} (${inr(l.replacement.addedAmount)})` : `${l.name} removed (-${inr(l.removedAmount)})`}</li>
                  ))}
                </ul>
                <BillCols before={m.billBefore} after={m.billAfter} />
                <p className="mt-2 text-xs text-gray-600">Settlement: <b>{m.settlement.type.replace(/_/g, " ")}</b> {m.settlement.refundAmount ? `· refund ${inr(m.settlement.refundAmount)}` : ""} {m.settlement.extraAmount ? `· extra ${inr(m.settlement.extraAmount)}` : ""} · {m.settlement.method}</p>
              </Card>
            ))}

            {originalBill && !(f.modifications || []).length && (
              <Card title="Original bill"><p className="text-sm">{inr(originalBill.total)} · no change applied yet</p></Card>
            )}
            {originalBill && (f.modifications || []).length > 0 && (
              <Card title="Original → current"><BillCols before={originalBill} after={d.currentBill} /></Card>
            )}

            <Card title="Refunds">
              {(f.refunds || []).length === 0 ? <p className="text-sm text-gray-500">None</p> : (
                <ul className="space-y-2 text-sm">
                  {f.refunds.map((r) => (
                    <li key={r.key} className="flex items-center justify-between rounded-lg border border-gray-100 p-2">
                      <span>{inr(r.amount)} · {r.method} · {r.reason} <Pill tone={r.status === "processed" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Pill> {r.error ? <span className="text-xs text-red-600">{r.error}</span> : null}</span>
                      {r.status !== "processed" && <button onClick={() => retry(r.key)} className="rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white">Retry</button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Additional payments">
              {(f.additionalPayments || []).length === 0 ? <p className="text-sm text-gray-500">None</p> : (
                <ul className="space-y-1 text-sm">{f.additionalPayments.map((p) => <li key={p.key}>{inr(p.amount)} · {p.method} · <Pill tone={p.status === "paid" ? "green" : "amber"}>{p.status}</Pill> · {when(p.at)}</li>)}</ul>
              )}
            </Card>

            <Card title="Order modification history">
              <ol className="space-y-2 border-l border-gray-200 pl-4 text-sm">
                {(f.history || []).map((h, i) => (
                  <li key={i}><span className="text-xs text-gray-400">{when(h.at)} · {h.byRole}</span><div><b>{String(h.action).replace(/_/g, " ")}</b> {h.note ? <span className="text-gray-600">— {h.note}</span> : null}</div></li>
                ))}
              </ol>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

/* ----------------------------- Page ----------------------------- */
export default function PartialFulfilment() {
  const [summary, setSummary] = useState(null)
  const [rows, setRows] = useState({ items: [], total: 0 })
  const [filter, setFilter] = useState({ state: "all", search: "", timedOut: "" })
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, o] = await Promise.all([api.summary(), api.orders(Object.fromEntries(Object.entries(filter).filter(([, v]) => v)))])
      setSummary(s?.data?.data); setRows(o?.data?.data || { items: [], total: 0 })
    } catch (e) { toast.error(msg(e, "Failed to load")) } finally { setLoading(false) }
  }, [filter])
  useEffect(() => { load() }, [load])

  const sumBy = (arr, status) => (arr || []).filter((r) => (status ? r._id === status : true)).reduce((a, r) => a + (r.amount || 0), 0)

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">Partial Fulfilment &amp; Replacements</h1>
          <p className="text-sm text-gray-500">Unavailable items, customer decisions, bill changes, refunds and extra payments.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-gray-200 bg-white p-2"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>

      <Settings />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Awaiting customer", summary?.byState?.awaiting_customer || 0],
          ["Payment pending", summary?.byState?.awaiting_payment || 0],
          ["Timed out (follow up)", summary?.awaitingTimedOut || 0],
          ["Refunded", inr(sumBy(summary?.refunds, "processed"))],
          ["Extra collected", inr(sumBy(summary?.additionalPayments, "paid"))],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-gray-200 bg-white p-3"><p className="text-xs text-gray-500">{l}</p><p className="text-lg font-black">{v}</p></div>
        ))}
      </div>
      {(sumBy(summary?.refunds, "failed") > 0 || sumBy(summary?.refunds, "pending") > 0) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Some refunds need attention (failed {inr(sumBy(summary?.refunds, "failed"))}, pending {inr(sumBy(summary?.refunds, "pending"))}). Open the order to retry.</div>
      )}

      <Card title="Orders with unavailable items">
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={filter.state} onChange={(e) => setFilter({ ...filter, state: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value="all">All states</option>
            {Object.entries(STATE_LABEL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filter.timedOut === "true"} onChange={(e) => setFilter({ ...filter, timedOut: e.target.checked ? "true" : "" })} /> Timed out only</label>
          <input value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} placeholder="Order id" className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{["Order", "Customer", "Store", "Unavailable", "Total", "Payment", "State", "Updated"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.items.map((o) => {
                const st = STATE_LABEL[o.fulfilment?.state] || [o.fulfilment?.state, "gray"]
                return (
                  <tr key={o._id} onClick={() => setOpen(o._id)} className="cursor-pointer hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold">#{o.order_id}</td>
                    <td className="px-3 py-2">{o.userId?.name || "-"}</td>
                    <td className="px-3 py-2">{o.restaurantId?.restaurantName || "-"}</td>
                    <td className="px-3 py-2">{(o.fulfilment?.unavailableItems || []).map((u) => u.name).join(", ")}</td>
                    <td className="px-3 py-2">{inr(o.pricing?.total)}{o.fulfilment?.original?.paymentTotal != null && Math.abs(o.fulfilment.original.paymentTotal - (o.pricing?.total || 0)) > 0.004 ? <span className="block text-[11px] text-gray-400 line-through">{inr(o.fulfilment.original.paymentTotal)}</span> : null}</td>
                    <td className="px-3 py-2">{o.payment?.method}</td>
                    <td className="px-3 py-2"><Pill tone={st[1]}>{st[0]}</Pill>{o.fulfilment?.timeoutNotifiedAt ? <Pill tone="red">timeout</Pill> : null}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{when(o.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!loading && rows.items.length === 0 && <p className="p-6 text-center text-sm text-gray-500">No orders yet.</p>}
        </div>
      </Card>

      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}
