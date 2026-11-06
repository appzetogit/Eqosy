import { useEffect, useState } from "react"
import { AlertTriangle, Info, ShieldAlert } from "lucide-react"
import { reasonCodeFromLabel } from "@food/api/performanceAPI"

/**
 * Shown BEFORE a restaurant rejects/cancels an order or a delivery partner passes/cancels a delivery:
 * says whether this will be a warning, a penalty or a strike, using the same rules the server applies.
 * Advisory only; it never blocks the action.
 */
export default function PenaltyWarning({ api, violationType, reason = "", reasonCode = "", className = "" }) {
  const [pv, setPv] = useState(null)
  const code = reasonCode || reasonCodeFromLabel(reason)

  useEffect(() => {
    let alive = true
    setPv(null)
    api.preview(violationType, code)
      .then((res) => { if (alive) setPv(res?.data?.data || null) })
      .catch(() => { if (alive) setPv(null) })
    return () => { alive = false }
  }, [api, violationType, code])

  if (!pv?.applies) return null
  const tone =
    pv.severity === "penalty" ? "border-red-300 bg-red-50 text-red-900"
      : pv.severity === "info" ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-amber-300 bg-amber-50 text-amber-900"
  const Icon = pv.severity === "penalty" ? ShieldAlert : pv.severity === "info" ? Info : AlertTriangle
  return (
    <div role="alert" className={`mx-4 mb-3 flex items-start gap-2 rounded-xl border p-3 text-xs ${tone} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-black">
          {pv.severity === "penalty" ? `Penalty: Rs ${pv.amount}${pv.strike ? " + strike" : ""}` : pv.severity === "info" ? "No penalty" : "Warning"}
        </p>
        <p className="mt-0.5 font-medium leading-relaxed">{pv.message}</p>
        {pv.adminReview && <p className="mt-0.5 font-bold">Repeated rejections go to admin review and can lead to suspension.</p>}
      </div>
    </div>
  )
}
