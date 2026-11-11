import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { adminCancellationAPI as api } from "@food/api/cancellationAPI"

const inr = (v) => `₹${(Number(v) || 0).toFixed(2).replace(/\.00$/, "")}`

/** Only the settings the calculation depends on are sent, so editing a message never triggers a recalculation. */
const pickDraft = (c) => {
  if (!c) return null
  const g = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k]]))
  return {
    gstPercent: c.gstPercent,
    gstOnFoodPenalty: c.gstOnFoodPenalty,
    stage2: g(c.stage2, ["foodPenaltyPercent", "includeRiderCompensation", "includePlatformFee", "cancellationFee", "restaurantSharePercent"]),
    stage3: g(c.stage3, ["foodPenaltyPercent", "includeDeliveryFee", "includePlatformFee", "cancellationFee", "restaurantSharePercent", "riderReturnPay"]),
    riderCompensation: g(c.riderCompensation, ["baseAmount", "perKm", "minAmount", "maxAmount", "minTrackedKm"]),
    rescue: g(c.rescue, ["enabled", "successPenaltyPercent", "discountPercent", "restaurantSharePercent", "failedRestaurantCompPercent"]),
    cod: g(c.cod, ["blockWhileOutstanding"]),
  }
}

const Field = ({ label, value, onChange, disabled, step = 1 }) => (
  <label className="block text-[11px] font-semibold text-gray-600">
    {label}
    <input type="number" min="0" step={step} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 p-1 text-sm disabled:bg-gray-100" />
  </label>
)

/**
 * Live penalty calculator. It asks the server to run the real cancellation maths on an example order with the CURRENT
 * (even unsaved) settings, so the admin sees exactly who pays/gets what, for COD and prepaid, before saving.
 *  - draft: the settings being edited (unsaved values win over the saved config)
 *  - initial: starting example values (stage, paymentMethod, foodValue, deliveryFee, platformFee, trackedKm, orderTotal)
 *  - lockedInputs: use the real order's numbers and hide the example inputs
 */
export default function CancellationCalculator({ draft, initial = {}, lockedInputs = false, fixedStage = null, fixedPayment = null, title = "Live calculator", onResult = null }) {
  const [input, setInput] = useState({ paymentMethod: "cash", stage: 2, foodValue: 500, deliveryFee: 30, platformFee: 5, trackedKm: 2, orderTotal: "", faultParty: "customer", ...initial })
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const seq = useRef(0)
  const eff = { ...input, ...(fixedStage ? { stage: fixedStage } : {}), ...(fixedPayment ? { paymentMethod: fixedPayment } : {}) }
  const key = JSON.stringify([eff, pickDraft(draft)])

  useEffect(() => {
    const mine = ++seq.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const res = await api.simulate(eff, pickDraft(draft))
        if (mine !== seq.current) return // a newer edit already replaced this request
        const data = res?.data?.data || null
        setOut(data)
        setError("")
        if (onResult && data) onResult(data)
      } catch (e) {
        if (mine === seq.current) setError(e?.response?.data?.message || "Could not calculate")
      } finally {
        if (mine === seq.current) setBusy(false)
      }
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const set = (k, v) => setInput((p) => ({ ...p, [k]: v }))
  const b = out?.breakdown
  const rows = b ? [
    [`Food penalty (${b.foodPenaltyPercent}% of ${inr(b.foodValue)})`, b.foodPenalty],
    [`Rider travel compensation (${b.riderTrackedKm} km)`, b.riderCompensation],
    ["Delivery charge", b.deliveryFee],
    ["Platform fee", b.platformFee],
    ["Cancellation fee", b.cancellationFee],
    ["GST", b.gst],
  ].filter(([, v]) => Number(v) > 0) : []

  return (
    <div className="space-y-3 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-indigo-900">{title}</h4>
        <span className="flex items-center gap-1 text-[11px] text-indigo-700">{busy ? <><Loader2 className="h-3 w-3 animate-spin" /> updating…</> : "live · uses unsaved values"}</span>
      </div>

      {!lockedInputs && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {!fixedPayment && (
            <label className="block text-[11px] font-semibold text-gray-600">Payment
              <select value={input.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 p-1 text-sm"><option value="cash">COD</option><option value="online">Prepaid</option></select>
            </label>
          )}
          {!fixedStage && (
            <label className="block text-[11px] font-semibold text-gray-600">Cancelled when
              <select value={input.stage} onChange={(e) => set("stage", Number(e.target.value))} className="mt-0.5 w-full rounded border border-gray-300 p-1 text-sm"><option value={2}>Accepted, not picked up</option><option value={3}>Picked up</option></select>
            </label>
          )}
          <Field label="Food total (₹)" value={input.foodValue} onChange={(v) => set("foodValue", v)} />
          <Field label="Delivery charge (₹)" value={input.deliveryFee} onChange={(v) => set("deliveryFee", v)} />
          <Field label="Platform fee (₹)" value={input.platformFee} onChange={(v) => set("platformFee", v)} />
          <Field label="Rider GPS distance (km)" value={input.trackedKm} onChange={(v) => set("trackedKm", v)} step={0.1} />
          <Field label="Amount customer paid (₹)" value={input.orderTotal} onChange={(v) => set("orderTotal", v)} />
          <label className="block text-[11px] font-semibold text-gray-600">Whose fault
            <select value={input.faultParty} onChange={(e) => set("faultParty", e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 p-1 text-sm"><option value="customer">Customer</option><option value="restaurant">Restaurant (free)</option><option value="rider">Rider (free)</option><option value="platform">Eqosy (free)</option></select>
          </label>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {out && b && (
        <>
          <ul className="space-y-1 rounded-lg bg-white p-3 text-xs">
            {out.waived ? <li className="text-green-700">Customer is not charged (cancellation is not the customer's fault).</li> : rows.map(([l, v]) => (
              <li key={l} className="flex justify-between"><span>{l}</span><span>{inr(v)}</span></li>
            ))}
            <li className="flex justify-between border-t pt-1 text-sm font-bold"><span>{out.refundHeldForRescue ? "Customer penalty if food is rescued" : "Customer penalty"}</span><span>{inr(b.total)}</span></li>
          </ul>
          <div className="grid gap-2 md:grid-cols-2">
            {out.scenarios.map((s) => (
              <div key={s.key} className="space-y-1 rounded-lg border border-indigo-100 bg-white p-3 text-xs">
                <p className="font-bold text-gray-900">{s.title}</p>
                <p className="text-[11px] text-gray-500">{s.when}</p>
                <p><span className="font-semibold">Customer:</span>{" "}
                  {s.customer.mode === "cut_from_payment"
                    ? <>{inr(s.customer.charge)} cut from the {inr(s.customer.paid)} paid · <b>{inr(s.customer.refund)} refunded</b>{s.customer.outstanding > 0 ? ` · ${inr(s.customer.outstanding)} still owed` : ""}</>
                    : <>{inr(s.customer.outstanding)} added to dues{s.customer.codBlocked ? " · next COD order disabled until paid" : ""}</>}
                </p>
                <p><span className="font-semibold">Restaurant gets:</span> <b>{inr(s.restaurant.amount)}</b> <span className="text-gray-500">({s.restaurant.note})</span></p>
                <p><span className="font-semibold">Delivery partner gets:</span> <b>{inr(s.rider.amount)}</b> <span className="text-gray-500">({s.rider.note})</span></p>
              </div>
            ))}
          </div>
          {(out.warnings || []).map((w) => <p key={w} className="text-xs font-semibold text-amber-700">⚠ {w}</p>)}
        </>
      )}
    </div>
  )
}
