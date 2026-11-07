import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { adminCancellationAPI as api } from "@food/api/cancellationAPI"

const inr = (v) => `₹${(Number(v) || 0).toFixed(2).replace(/\.00$/, "")}`
const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "-")
const msg = (e, f) => e?.response?.data?.message || f
const ask = (m) => { const v = window.prompt(m); return v == null ? null : v.trim() }

const TABS = [["cases", "Cancellation cases"], ["penalties", "Customer penalty ledger"], ["rescues", "Food Rescue"], ["rules", "Rules & messages"], ["audit", "Audit log"]]

const Pill = ({ children, tone = "gray" }) => {
  const t = { gray: "bg-gray-100 text-gray-700", red: "bg-red-100 text-red-700", green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-800", blue: "bg-blue-100 text-blue-700" }[tone]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${t}`}>{String(children).replace(/_/g, " ")}</span>
}
const Table = ({ head, children, empty }) => (
  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
    <table className="w-full min-w-[720px] text-left text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-100">{children}</tbody>
    </table>
    {empty && <p className="p-6 text-center text-sm text-gray-500">{empty}</p>}
  </div>
)

function useLoad(fn, deps) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    try { setData((await fn())?.data?.data ?? null) } catch (e) { toast.error(msg(e, "Failed to load")) } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { data, loading, reload }
}

/* ------------------------------- Cases ------------------------------- */
function Cases() {
  const [filters, setFilters] = useState({ stage: "", status: "" })
  const { data, loading, reload } = useLoad(() => api.cases(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))), [filters])
  const [open, setOpen] = useState(null)
  const detail = useLoad(() => (open ? api.caseDetail(open) : Promise.resolve(null)), [open])
  const retry = async (id) => { try { const r = await api.retrySettlements(id); toast.success(`Retried ${r?.data?.data?.retried || 0} settlement(s)`); detail.reload(); reload() } catch (e) { toast.error(msg(e, "Failed")) } }
  const sum = useLoad(() => api.summary(), [])
  const stageTone = { 1: "green", 2: "amber", 3: "red" }
  return (
    <div className="space-y-3">
      {sum.data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Outstanding (unpaid)", inr(sum.data.outstandingTotal)], ["Customers with dues", sum.data.usersWithOutstanding], ...(sum.data.byStage || []).map((s) => [`Stage ${s._id} cases`, `${s.count} · ${inr(s.charged)}`])].map(([l, v]) => (
            <div key={l} className="rounded-xl border border-gray-200 bg-white p-3"><p className="text-[11px] font-medium uppercase text-gray-500">{l}</p><p className="mt-1 text-lg font-bold">{v}</p></div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <select value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })} className="rounded-lg border border-gray-300 p-2 text-sm"><option value="">All stages</option><option value="1">Stage 1 (free)</option><option value="2">Stage 2 (preparing)</option><option value="3">Stage 3 (picked up)</option></select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="rounded-lg border border-gray-300 p-2 text-sm"><option value="">All statuses</option>{["cancelled", "rescue_active", "rescue_claimed", "rescue_expired"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <Table head={["When", "Order", "Stage", "Reason", "Food", "Rider (km)", "Total charged", "Status", ""]} empty={!(data?.items || []).length ? "No cases yet" : null}>
          {(data?.items || []).map((c) => (
            <tr key={c._id}>
              <td className="px-3 py-2 text-xs">{when(c.createdAt)}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(c.orderLabel || c.orderId).slice(-8)}</td>
              <td className="px-3 py-2"><Pill tone={stageTone[c.stage]}>Stage {c.stage}</Pill></td>
              <td className="px-3 py-2 text-xs">{c.reasonLabel || "-"}{c.chargeWaived ? <div className="text-green-700">waived: {c.chargeWaivedReason}</div> : null}</td>
              <td className="px-3 py-2">{inr(c.breakdown?.foodValue)}</td>
              <td className="px-3 py-2">{inr(c.breakdown?.riderPayable)} ({c.breakdown?.riderTrackedKm || 0})</td>
              <td className="px-3 py-2 font-bold">{inr(c.breakdown?.total)}</td>
              <td className="px-3 py-2"><Pill tone={c.status === "rescue_claimed" ? "green" : c.status === "rescue_active" ? "blue" : c.status === "rescue_expired" ? "red" : "gray"}>{c.status}</Pill></td>
              <td className="px-3 py-2"><button className="text-xs font-semibold text-blue-600" onClick={() => setOpen(c._id)}>Details</button></td>
            </tr>
          ))}
        </Table>
      )}
      {open && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <div className="mb-2 flex justify-between"><h3 className="font-bold">Case detail</h3><button className="text-xs text-gray-500" onClick={() => setOpen(null)}>Close</button></div>
          {detail.loading || !detail.data ? <Loader2 className="h-5 w-5 animate-spin" /> : (() => {
            const d = detail.data
            const b = d.breakdown || {}
            return (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase text-gray-500">Penalty calculation (frozen at cancellation)</p>
                  <ul className="space-y-1 rounded-lg bg-gray-50 p-3 text-xs">
                    <li className="flex justify-between"><span>Food value</span><span>{inr(b.foodValue)}</span></li>
                    <li className="flex justify-between"><span>Food charge ({b.foodPenaltyPercent}%)</span><span>{inr(b.foodPenalty)}</span></li>
                    <li className="flex justify-between"><span>Rider compensation ({b.riderTrackedKm} km GPS)</span><span>{inr(b.riderCompensation)}{b.riderPayable !== b.riderCompensation ? ` (Eqosy pays ${inr(b.riderPayable)})` : ""}</span></li>
                    <li className="flex justify-between"><span>Delivery charges</span><span>{inr(b.deliveryFee)}</span></li>
                    <li className="flex justify-between"><span>Platform fee</span><span>{inr(b.platformFee)}</span></li>
                    <li className="flex justify-between"><span>Cancellation charge</span><span>{inr(b.cancellationFee)}</span></li>
                    <li className="flex justify-between"><span>GST</span><span>{inr(b.gst)}</span></li>
                    <li className="flex justify-between border-t pt-1 font-bold"><span>Total</span><span>{inr(b.total)}</span></li>
                  </ul>
                  <p className="mt-2 text-xs text-gray-500">Cancelled from "{d.cancelledFromStatus}". Fault: {d.faultParty}. {d.penalty ? `Customer penalty: ${inr(d.penalty.amount)} (${d.penalty.paidAt ? "paid" : d.penalty.status}).` : "No customer penalty."}</p>
                  {d.override?.by && <p className="mt-1 text-xs text-blue-700">Admin override: {d.override.note} (was {inr(d.override.previousTotal)})</p>}
                  {d.listing && (
                    <div className="mt-3 rounded-lg bg-blue-50 p-3 text-xs">
                      <p className="font-bold">Food Rescue: {d.listing.status}</p>
                      <p>Rescue price {inr(d.listing.rescueFoodPrice)} (was {inr(d.listing.originalFoodValue)}), window until {when(d.listing.expiresAt)}, {d.listing.notifiedCount} customers notified.</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-1 flex items-center justify-between text-xs font-bold uppercase text-gray-500">Settlements {(d.settlements || []).some((s) => s.status === "failed") && <button className="text-xs normal-case text-red-600 underline" onClick={() => retry(d._id)}>Retry failed</button>}</p>
                  <ul className="space-y-1 text-xs">
                    {(d.settlements || []).length === 0 && <li className="text-gray-500">None yet</li>}
                    {(d.settlements || []).map((s) => (
                      <li key={s.key} className="flex justify-between rounded bg-gray-50 p-2"><span>{s.party.replace("_", " ")} · {s.kind.replace(/_/g, " ")}</span><span><b>{inr(s.amount)}</b> <Pill tone={s.status === "done" ? "green" : s.status === "failed" ? "red" : "gray"}>{s.status}</Pill></span></li>
                    ))}
                  </ul>
                  <p className="mb-1 mt-3 text-xs font-bold uppercase text-gray-500">Timeline</p>
                  <ul className="space-y-1 text-xs">{(d.timeline || []).map((t, i) => <li key={i}><span className="text-gray-400">{when(t.at)}</span> · {t.event.replace(/_/g, " ")} — {t.note}</li>)}</ul>
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

/* ------------------------------- Penalty ledger ------------------------------- */
function Penalties() {
  const [status, setStatus] = useState("outstanding")
  const [userId, setUserId] = useState("")
  const { data, loading, reload } = useLoad(() => api.penalties({ ...(status ? { status } : {}), ...(userId ? { userId } : {}) }), [status, userId])
  const act = async (p, action) => {
    const note = ask(action === "adjust" ? "Reason for changing the amount (required):" : action === "mark_paid" ? "How was it paid? (required):" : "Reason for waiving (required):")
    if (!note) return
    let amount
    if (action === "adjust") { const a = window.prompt("New amount in ₹ (0 = waive):", String(p.amount)); if (a == null) return; amount = Number(a) }
    try { await api.decidePenalty(p._id, { action, note, amount }); toast.success("Updated and audited"); reload() } catch (e) { toast.error(msg(e, "Failed")) }
  }
  const create = async () => {
    const uid = (userId || window.prompt("Customer ID (full):") || "").trim()
    if (!uid) return
    const a = window.prompt("Penalty amount in ₹:")
    if (a == null) return
    const note = ask("Reason (required, shown to the customer):")
    if (!note) return
    try { await api.createPenalty({ userId: uid, amount: Number(a), reason: note }); toast.success("Penalty created"); reload() } catch (e) { toast.error(msg(e, "Failed")) }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 p-2 text-sm"><option value="outstanding">Outstanding (COD blocked)</option><option value="">All</option>{["paid", "waived"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <input placeholder="Customer ID (full)" value={userId} onChange={(e) => setUserId(e.target.value.trim())} className="rounded-lg border border-gray-300 p-2 text-sm" />
        <button onClick={create} className="ml-auto rounded-lg bg-black px-3 text-sm font-semibold text-white">+ Create penalty</button>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <Table head={["When", "Customer", "Order", "Amount", "Reason", "Status", "Actions"]} empty={!(data?.items || []).length ? "No penalties" : null}>
          {(data?.items || []).map((p) => (
            <tr key={p._id} className="align-top">
              <td className="px-3 py-2 text-xs">{when(p.createdAt)}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(p.userId).slice(-8)}</td>
              <td className="px-3 py-2 font-mono text-xs">{String(p.orderId || "").slice(-8)}</td>
              <td className="px-3 py-2 font-bold">{inr(p.amount)}</td>
              <td className="max-w-xs px-3 py-2 text-xs">{p.reason}</td>
              <td className="px-3 py-2"><Pill tone={p.paidAt ? "green" : p.status === "waived" ? "gray" : "red"}>{p.paidAt ? `paid (${p.paidVia})` : p.status === "pending" || p.status === "applied" ? "unpaid" : p.status}</Pill></td>
              <td className="px-3 py-2 text-xs font-semibold">{!p.paidAt && p.status !== "waived" && (
                <div className="flex flex-wrap gap-2"><button className="text-amber-700" onClick={() => act(p, "waive")}>Waive</button><button className="text-blue-700" onClick={() => act(p, "adjust")}>Change amount</button><button className="text-green-700" onClick={() => act(p, "mark_paid")}>Mark paid</button></div>
              )}</td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-xs text-gray-500">Waiving or marking paid re-enables Cash on Delivery for that customer when nothing else is outstanding. Every change needs a reason and is written to the audit log.</p>
    </div>
  )
}

/* ------------------------------- Rescues ------------------------------- */
function Rescues() {
  const [status, setStatus] = useState("")
  const { data, loading, reload } = useLoad(() => api.rescues(status ? { status } : {}), [status])
  const close = async (r) => { const note = ask("Reason for closing this rescue early (required):"); if (!note) return; try { await api.closeRescue(r._id, note); toast.success("Closed"); reload() } catch (e) { toast.error(msg(e, "Failed")) } }
  return (
    <div className="space-y-3">
      <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 p-2 text-sm"><option value="">All</option>{["active", "held", "claimed", "expired", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <Table head={["Created", "Restaurant", "Items", "Original → rescue price", "Window ends", "Notified", "Claimed by", "Status", ""]} empty={!(data?.items || []).length ? "No rescue history" : null}>
          {(data?.items || []).map((r) => (
            <tr key={r._id}>
              <td className="px-3 py-2 text-xs">{when(r.createdAt)}</td>
              <td className="px-3 py-2 text-xs">{r.restaurantName || String(r.restaurantId).slice(-6)}</td>
              <td className="px-3 py-2 text-xs">{(r.items || []).map((i) => `${i.quantity}× ${i.name}`).join(", ")}</td>
              <td className="px-3 py-2">{inr(r.originalFoodValue)} → <b>{inr(r.rescueFoodPrice)}</b></td>
              <td className="px-3 py-2 text-xs">{when(r.expiresAt)}</td>
              <td className="px-3 py-2">{r.notifiedCount}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.claimedBy ? String(r.claimedBy).slice(-6) : "-"}</td>
              <td className="px-3 py-2"><Pill tone={r.status === "claimed" ? "green" : r.status === "expired" ? "red" : r.status === "cancelled" ? "gray" : "blue"}>{r.status}</Pill></td>
              <td className="px-3 py-2 text-xs font-semibold">{["active", "held"].includes(r.status) && <button className="text-red-700" onClick={() => close(r)}>Close</button>}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

/* ------------------------------- Rules ------------------------------- */
const Num = ({ label, value, onChange, step = 1, suffix = "" }) => (
  <label className="flex items-center justify-between gap-3 text-sm">{label}
    <span className="flex items-center gap-1"><input type="number" step={step} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className="w-24 rounded border border-gray-300 p-1 text-sm" />{suffix}</span>
  </label>
)
const Tog = ({ label, hint, value, onChange }) => (
  <label className="flex items-start justify-between gap-3 text-sm"><span>{label}{hint ? <span className="block text-xs text-gray-500">{hint}</span> : null}</span><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mt-1" /></label>
)
const MSG_LABELS = {
  s1_customer: "Stage 1 · Customer", s1_restaurant: "Stage 1 · Restaurant", s1_rider: "Stage 1 · Delivery partner",
  s2_customer: "Stage 2 · Customer", s2_restaurant: "Stage 2 · Restaurant", s2_rider: "Stage 2 · Delivery partner",
  s3_customer: "Stage 3 · Customer", s3_restaurant: "Stage 3 · Restaurant", s3_rider: "Stage 3 · Delivery partner",
  nofee_customer: "No-charge cancellation · Customer",
  rescue_claimed_rider: "Rescue claimed · Delivery partner", rescue_claimed_restaurant: "Rescue claimed · Restaurant",
  rescue_claimed_original_customer: "Rescue claimed · Original customer", rescue_new_customer: "Rescue claimed · New customer",
  rescue_expired_rider: "Rescue expired · Delivery partner", rescue_expired_restaurant: "Rescue expired · Restaurant",
  rescue_nearby_customer: "Rescue nearby · Customers", penalty_paid_customer: "Penalty paid · Customer", cod_disabled_customer: "COD disabled / reminder · Customer",
}

function Rules() {
  const { data, loading, reload } = useLoad(() => api.getConfig(), [])
  const [c, setC] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (data) setC(JSON.parse(JSON.stringify(data))) }, [data])
  if (loading || !c) return <Loader2 className="h-5 w-5 animate-spin" />
  const set = (k, v) => setC({ ...c, [k]: v })
  const setIn = (g, k, v) => setC({ ...c, [g]: { ...c[g], [k]: v } })
  const save = async () => {
    setSaving(true)
    try { await api.updateConfig(c); toast.success("Saved and logged"); reload() } catch (e) { toast.error(msg(e, "Could not save")) } finally { setSaving(false) }
  }
  const csv = (k, label) => (
    <label className="block text-sm"><span className="text-gray-700">{label} (comma separated)</span>
      <input value={(c[k] || []).join(", ")} onChange={(e) => set(k, e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" /></label>
  )
  const box = "space-y-2 rounded-xl border border-gray-200 bg-white p-4"
  return (
    <div className="space-y-4">
      <div className={box}>
        <h4 className="text-sm font-bold">General</h4>
        <Tog label="Stage-based cancellation policy enabled" hint="Off = the old rule (no cancelling once the restaurant accepts)" value={c.enabled} onChange={(v) => set("enabled", v)} />
        {csv("appliesToPaymentMethods", "Applies to payment methods (cash, razorpay, razorpay_qr, wallet)")}
        {csv("stage2Statuses", "Stage 2 order statuses (accepted / preparing)")}
        {csv("stage3Statuses", "Stage 3 order statuses (picked up / out for delivery)")}
        <Num label="GST on fees" value={c.gstPercent} onChange={(v) => set("gstPercent", v)} suffix="%" />
        <Tog label="Also charge GST on the food charge" value={c.gstOnFoodPenalty} onChange={(v) => set("gstOnFoodPenalty", v)} />
        <Num label="No charge if restaurant is late beyond its prep time by" value={c.restaurantLateGraceMinutes} onChange={(v) => set("restaurantLateGraceMinutes", v)} suffix="min" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={box}>
          <h4 className="text-sm font-bold">Stage 2 · preparing started</h4>
          <Num label="Food cancellation charge" value={c.stage2.foodPenaltyPercent} onChange={(v) => setIn("stage2", "foodPenaltyPercent", v)} suffix="% of food" />
          <Num label="Cancellation charge" value={c.stage2.cancellationFee} onChange={(v) => setIn("stage2", "cancellationFee", v)} suffix="₹" />
          <Tog label="Charge rider travel compensation" value={c.stage2.includeRiderCompensation} onChange={(v) => setIn("stage2", "includeRiderCompensation", v)} />
          <Tog label="Charge platform fee" value={c.stage2.includePlatformFee} onChange={(v) => setIn("stage2", "includePlatformFee", v)} />
        </div>
        <div className={box}>
          <h4 className="text-sm font-bold">Stage 3 · picked up / out for delivery</h4>
          <Num label="Food cancellation liability" value={c.stage3.foodPenaltyPercent} onChange={(v) => setIn("stage3", "foodPenaltyPercent", v)} suffix="% of food" />
          <Num label="Cancellation charge" value={c.stage3.cancellationFee} onChange={(v) => setIn("stage3", "cancellationFee", v)} suffix="₹" />
          <Tog label="Charge delivery fee" value={c.stage3.includeDeliveryFee} onChange={(v) => setIn("stage3", "includeDeliveryFee", v)} />
          <Tog label="Charge platform fee" value={c.stage3.includePlatformFee} onChange={(v) => setIn("stage3", "includePlatformFee", v)} />
        </div>
        <div className={box}>
          <h4 className="text-sm font-bold">Delivery partner compensation (GPS distance)</h4>
          <Num label="Base amount" value={c.riderCompensation.baseAmount} onChange={(v) => setIn("riderCompensation", "baseAmount", v)} suffix="₹" />
          <Num label="Per km travelled" value={c.riderCompensation.perKm} onChange={(v) => setIn("riderCompensation", "perKm", v)} suffix="₹/km" step={0.5} />
          <Num label="Minimum" value={c.riderCompensation.minAmount} onChange={(v) => setIn("riderCompensation", "minAmount", v)} suffix="₹" />
          <Num label="Maximum" value={c.riderCompensation.maxAmount} onChange={(v) => setIn("riderCompensation", "maxAmount", v)} suffix="₹" />
          <Num label="Minimum tracked distance to qualify" value={c.riderCompensation.minTrackedKm} onChange={(v) => setIn("riderCompensation", "minTrackedKm", v)} suffix="km" step={0.1} />
          <Tog label="Pay rider in Stage 3 as well" value={c.riderCompensation.paidInStage3} onChange={(v) => setIn("riderCompensation", "paidInStage3", v)} />
          <Tog label="Eqosy pays the rider when the customer is not charged" value={c.riderCompensation.payWhenWaived} onChange={(v) => setIn("riderCompensation", "payWhenWaived", v)} />
        </div>
        <div className={box}>
          <h4 className="text-sm font-bold">Food Rescue</h4>
          <Tog label="Food Rescue enabled" value={c.rescue.enabled} onChange={(v) => setIn("rescue", "enabled", v)} />
          <Tog label="Prepaid no-show: admin can send undelivered food to Food Rescue" value={c.rescue.noShowEnabled !== false} onChange={(v) => setIn("rescue", "noShowEnabled", v)} />
          <Num label="Prepaid no-show: default penalty (charged immediately from payment)" value={c.rescue.noShowPenaltyPercent ?? c.stage3.foodPenaltyPercent} onChange={(v) => setIn("rescue", "noShowPenaltyPercent", v)} suffix="% of food" />
          <Num label="COD no-show (returned to restaurant): default penalty (charged on next order)" value={c.rescue.noShowReturnPenaltyPercent ?? 20} onChange={(v) => setIn("rescue", "noShowReturnPenaltyPercent", v)} suffix="% of food" />
          <Num label="Radius" value={c.rescue.radiusKm} onChange={(v) => setIn("rescue", "radiusKm", v)} suffix="km" step={0.5} />
          <Num label="Timer" value={c.rescue.windowMinutes} onChange={(v) => setIn("rescue", "windowMinutes", v)} suffix="min" />
          <Num label="Discount on food price" value={c.rescue.discountPercent} onChange={(v) => setIn("rescue", "discountPercent", v)} suffix="%" />
          <Num label="Restaurant share of rescue price" value={c.rescue.restaurantSharePercent} onChange={(v) => setIn("rescue", "restaurantSharePercent", v)} suffix={`% (Eqosy ${100 - (Number(c.rescue.restaurantSharePercent) || 0)}%)`} />
          <Num label="Restaurant compensation if unsold" value={c.rescue.failedRestaurantCompPercent} onChange={(v) => setIn("rescue", "failedRestaurantCompPercent", v)} suffix="% of original food" />
          <Tog label="Rider may keep unsold food free" value={c.rescue.riderKeepsFoodOnExpiry} onChange={(v) => setIn("rescue", "riderKeepsFoodOnExpiry", v)} />
          <Num label="Payment hold per claim" value={c.rescue.claimHoldMinutes} onChange={(v) => setIn("rescue", "claimHoldMinutes", v)} suffix="min" />
          <Num label="Rescue order delivery fee" value={c.rescue.deliveryFee} onChange={(v) => setIn("rescue", "deliveryFee", v)} suffix="₹" />
          <Num label="Rescue order platform fee" value={c.rescue.platformFee} onChange={(v) => setIn("rescue", "platformFee", v)} suffix="₹" />
          <Num label="GST on rescued food" value={c.rescue.gstPercentOnFood} onChange={(v) => setIn("rescue", "gstPercentOnFood", v)} suffix="%" />
          <Num label="Max customers notified" value={c.rescue.maxNotifyUsers} onChange={(v) => setIn("rescue", "maxNotifyUsers", v)} />
        </div>
      </div>
      <div className={box}>
        <h4 className="text-sm font-bold">Outstanding penalty & COD</h4>
        <Tog label="Disable Cash on Delivery while a cancellation charge is unpaid" value={c.cod.blockWhileOutstanding} onChange={(v) => setIn("cod", "blockWhileOutstanding", v)} />
        <Num label="Reminder interval" value={c.cod.reminderIntervalHours} onChange={(v) => setIn("cod", "reminderIntervalHours", v)} suffix="hours" />
      </div>
      <div className={box}>
        <div className="flex items-center justify-between"><h4 className="text-sm font-bold">Cancellation reasons shown to customers</h4>
          <button onClick={() => set("cancelReasons", [...c.cancelReasons, { code: `reason_${c.cancelReasons.length + 1}`, label: "New reason", faultParty: "customer" }])} className="flex items-center gap-1 text-xs font-semibold text-blue-600"><Plus className="h-3 w-3" /> Add</button></div>
        {c.cancelReasons.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
            <input value={r.code} onChange={(e) => set("cancelReasons", c.cancelReasons.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} className="w-32 rounded border border-gray-300 p-1" />
            <input value={r.label} onChange={(e) => set("cancelReasons", c.cancelReasons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="min-w-[200px] flex-1 rounded border border-gray-300 p-1" />
            <select value={r.faultParty} onChange={(e) => set("cancelReasons", c.cancelReasons.map((x, j) => (j === i ? { ...x, faultParty: e.target.value } : x)))} className="rounded border border-gray-300 p-1"><option value="customer">Customer pays</option><option value="restaurant">Restaurant fault (free)</option><option value="rider">Rider fault (free)</option><option value="platform">Eqosy fault (free)</option></select>
            <button onClick={() => set("cancelReasons", c.cancelReasons.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4 text-red-600" /></button>
          </div>
        ))}
      </div>
      <div className={box}>
        <h4 className="text-sm font-bold">Notification messages</h4>
        <p className="text-xs text-gray-500">Placeholders: {"{orderId} {amount} {restaurant} {minutes} {price} {original} {discount} {percent} {share} {reason}"}. Sent automatically on real order events.</p>
        {Object.entries(MSG_LABELS).map(([k, label]) => (
          <label key={k} className="block text-xs"><span className="font-semibold text-gray-700">{label}</span>
            <textarea rows={2} value={c.messages?.[k] || ""} onChange={(e) => set("messages", { ...c.messages, [k]: e.target.value })} className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" /></label>
        ))}
      </div>
      <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</button>
      <p className="text-xs text-gray-500">Each case stores the exact rates used when it was created, so changing these never alters a past cancellation.</p>
    </div>
  )
}

function Audit() {
  const { data, loading } = useLoad(() => api.audit({ limit: 200 }), [])
  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />
  return (
    <Table head={["When", "Admin", "Action", "Target", "Note"]} empty={!(data || []).length ? "No changes yet" : null}>
      {(data || []).map((a) => (
        <tr key={a._id}><td className="px-3 py-2 text-xs">{when(a.createdAt)}</td><td className="px-3 py-2 font-mono text-xs">{a.actorId ? String(a.actorId).slice(-6) : "system"}</td><td className="px-3 py-2 text-xs font-semibold">{a.action}</td><td className="px-3 py-2 text-xs">{a.targetType} {String(a.targetId).slice(-8)}</td><td className="px-3 py-2 text-xs">{a.note}</td></tr>
      ))}
    </Table>
  )
}

export default function CancellationCenter() {
  const [tab, setTab] = useState("cases")
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Cancellation & Food Rescue</h1>
      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 text-sm font-semibold ${tab === id ? "border-b-2 border-black text-black" : "text-gray-500"}`}>{label}</button>
        ))}
      </div>
      {tab === "cases" && <Cases />}
      {tab === "penalties" && <Penalties />}
      {tab === "rescues" && <Rescues />}
      {tab === "rules" && <Rules />}
      {tab === "audit" && <Audit />}
    </div>
  )
}
