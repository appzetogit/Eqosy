import { AlertTriangle, ShieldCheck } from "lucide-react"

const inr = (v) => `₹${(Number(v) || 0).toFixed(2).replace(/\.00$/, "")}`

const LINES = [
  ["foodPenalty", (b) => `Food cancellation charge (${b.foodPenaltyPercent}% of ₹${b.foodValue})`],
  ["riderCompensation", (b) => `Delivery partner travel compensation (${b.riderTrackedKm} km)`],
  ["deliveryFee", () => "Delivery charges"],
  ["platformFee", () => "Platform fee"],
  ["cancellationFee", () => "Cancellation charge"],
  ["gst", () => "GST on fees"],
]

/** Shows exactly what the customer will owe before they confirm a stage 2 / stage 3 cancellation. */
export default function CancellationChargeCard({ preview, accepted, onAcceptedChange, disabled }) {
  if (!preview?.applies || preview.stage < 2) return null
  const b = preview.breakdown || {}
  const free = preview.waived || preview.charge === 0
  return (
    <div className={`rounded-2xl border p-3 text-xs ${free ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
      <div className="mb-2 flex items-start gap-2">
        {free ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <p className="font-semibold leading-relaxed">
          {free ? `No cancellation charge. ${preview.waivedReason || ""}` : preview.message}
        </p>
      </div>
      {!free && (
        <>
          <ul className="space-y-1 rounded-xl bg-white/70 p-2">
            {LINES.filter(([k]) => Number(b[k]) > 0).map(([k, label]) => (
              <li key={k} className="flex justify-between gap-3">
                <span>{label(b)}</span>
                <span className="font-bold">{inr(b[k])}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-amber-200 pt-1 text-sm font-black">
              <span>{preview.settlement === "refund_deduction" ? "Total charges" : "Total added to outstanding"}</span>
              <span>{inr(preview.charge)}</span>
            </li>
          </ul>
          {preview.settlement === "refund_deduction" ? (
            <p className="mt-2 rounded-lg bg-white/70 p-2 text-[12px] font-bold leading-relaxed">
              You paid {inr(preview.paid)}. {inr(preview.deducted)} is kept as cancellation charges and <span className="text-emerald-700">{inr(preview.refundAmount)}</span> is refunded to your original payment method.
              {preview.shortfall > 0 ? ` The remaining ${inr(preview.shortfall)} is added to your outstanding balance.` : ""}
            </p>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed">
              Cash on Delivery stays off until this is paid. You can pay it from Account → Outstanding charges, or add it to your next online order.
            </p>
          )}
          <label className="mt-2 flex items-start gap-2 font-bold">
            <input type="checkbox" checked={accepted} disabled={disabled} onChange={(e) => onAcceptedChange(e.target.checked)} className="mt-0.5" />
            <span>I understand and accept these charges</span>
          </label>
        </>
      )}
    </div>
  )
}
