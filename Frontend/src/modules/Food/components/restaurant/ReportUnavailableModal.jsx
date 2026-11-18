import { useEffect, useMemo, useState } from "react"
import { Check, Loader2, PackageX, X } from "lucide-react"
import { toast } from "sonner"
import { restaurantFulfilmentAPI } from "@food/api/fulfilmentAPI"

/**
 * Store-side item availability check. The store marks each ordered line Available / Out of stock.
 * Reporting never cancels the order: the customer is asked once and decides (replace / continue without / cancel).
 * The store may suggest an alternative, but only the customer can choose and confirm a replacement.
 */
export default function ReportUnavailableModal({ order, onClose, onDone }) {
  const orderId = order?.orderMongoId || order?._id || order?.orderId
  const items = Array.isArray(order?.items) ? order.items : []
  const [out, setOut] = useState({}) // lineKey -> true
  const [suggest, setSuggest] = useState({}) // lineKey -> itemId
  const [alternatives, setAlternatives] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let live = true
    restaurantFulfilmentAPI.alternatives(orderId)
      .then((res) => { if (live) setAlternatives(res?.data?.data?.candidates || []) })
      .catch(() => {})
    return () => { live = false }
  }, [orderId])

  const marked = useMemo(() => Object.keys(out).filter((k) => out[k]), [out])
  const allOut = marked.length === items.length

  const submit = async () => {
    if (!marked.length) { toast.error("Mark at least one item as out of stock"); return }
    setSubmitting(true)
    try {
      await restaurantFulfilmentAPI.reportUnavailable(orderId, {
        items: marked.map((lineKey) => ({ lineKey, reason: "out_of_stock" })),
        suggestions: marked.filter((k) => suggest[k]).map((k) => ({ lineKey: k, itemId: suggest[k] })),
      })
      toast.success("Customer notified. We'll tell you as soon as they decide.")
      onDone?.()
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not send the availability update")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-gray-900"><PackageX className="h-5 w-5 text-rose-600" /> Check item availability</h3>
            <p className="mt-0.5 text-xs text-gray-500">Mark what you cannot fulfil. The order is not cancelled — the customer chooses a replacement, continues without, or cancels.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {items.map((item, index) => {
            const key = String(index)
            const isOut = Boolean(out[key])
            return (
              <div key={key} className={`rounded-xl border p-3 ${isOut ? "border-rose-200 bg-rose-50" : "border-gray-100"}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{item.quantity} × {item.name}</p>
                    {item.variantName && <p className="text-xs text-gray-500">{item.variantName}</p>}
                  </div>
                  <div className="flex overflow-hidden rounded-full border border-gray-200 text-xs font-semibold">
                    <button onClick={() => setOut((o) => ({ ...o, [key]: false }))} className={`flex items-center gap-1 px-3 py-1.5 ${!isOut ? "bg-emerald-600 text-white" : "bg-white text-gray-600"}`}>
                      {!isOut && <Check className="h-3 w-3" />} Available
                    </button>
                    <button onClick={() => setOut((o) => ({ ...o, [key]: true }))} className={`px-3 py-1.5 ${isOut ? "bg-rose-600 text-white" : "bg-white text-gray-600"}`}>Out of stock</button>
                  </div>
                </div>
                {isOut && alternatives.length > 0 && (
                  <select
                    value={suggest[key] || ""}
                    onChange={(e) => setSuggest((s) => ({ ...s, [key]: e.target.value }))}
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs"
                  >
                    <option value="">Suggest an alternative (optional)</option>
                    {alternatives.filter((a) => a.itemId !== String(item.itemId)).map((a) => (
                      <option key={a.itemId} value={a.itemId}>{a.name} — ₹{a.price}</option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
          {allOut && marked.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Every item is unavailable. The customer can still pick replacements or cancel the order.</p>
          )}
        </div>

        <div className="border-t border-gray-100 p-3">
          <button onClick={submit} disabled={submitting || !marked.length} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Notify customer ({marked.length} unavailable)
          </button>
        </div>
      </div>
    </div>
  )
}
