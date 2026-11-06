import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { cancellationAPI } from "@food/api/cancellationAPI"
import { initRazorpayPayment } from "@food/utils/razorpay"

const inr = (v) => `₹${(Number(v) || 0).toFixed(2).replace(/\.00$/, "")}`
const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "")
const LINES = [
  ["foodPenalty", "Food cancellation charge"],
  ["riderCompensation", "Delivery partner compensation"],
  ["deliveryFee", "Delivery charges"],
  ["platformFee", "Platform fee"],
  ["cancellationFee", "Cancellation charge"],
  ["gst", "GST"],
]

export default function Penalties() {
  const navigate = useNavigate()
  const [out, setOut] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    try {
      const [o, h] = await Promise.all([cancellationAPI.outstanding(), cancellationAPI.history()])
      setOut(o?.data?.data || null)
      setHistory(h?.data?.data || [])
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not load your charges")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const pay = async () => {
    setPaying(true)
    try {
      const res = await cancellationAPI.payPenalty()
      const { razorpay, amount } = res?.data?.data || {}
      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount,
        currency: razorpay.currency || "INR",
        order_id: razorpay.orderId,
        name: "Eqosy",
        description: `Outstanding cancellation charges ${inr(amount)}`,
        handler: async (response) => {
          try {
            // Cash on Delivery is only re-enabled after the server verifies this payment.
            const v = await cancellationAPI.verifyPenalty({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })
            toast.success(v?.data?.data?.codBlocked === false ? "Paid. Cash on Delivery is available again." : "Payment received.")
          } catch (e) {
            toast.error(e?.response?.data?.message || "We could not confirm the payment yet. If money was deducted it will be updated shortly.")
          } finally {
            setPaying(false)
            load()
          }
        },
        onClose: () => setPaying(false),
        onError: (err) => { setPaying(false); toast.error(err?.description || "Payment failed. Cash on Delivery stays off until it succeeds.") },
      })
    } catch (e) {
      setPaying(false)
      toast.error(e?.response?.data?.message || e?.message || "Could not start the payment")
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-gray-50 pb-24 dark:bg-[#0a0a0a]">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 p-4 text-sm text-gray-600 dark:text-gray-300"><ArrowLeft className="h-4 w-4" /> Back</button>
      <div className="space-y-4 px-4">
        <h1 className="text-lg font-black">Outstanding cancellation charges</h1>
        {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
          <>
            {out?.total > 0 ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-2xl font-black">{inr(out.total)}</p>
                    <p className="mt-1 text-xs font-semibold">Cash on Delivery is off until this is paid. Online payment works as usual, and you can also add this to your next online order.</p>
                  </div>
                </div>
                <button onClick={pay} disabled={paying} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-bold text-white disabled:opacity-60">
                  {paying && <Loader2 className="h-4 w-4 animate-spin" />} Pay outstanding penalty
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" /> Nothing outstanding. Cash on Delivery is available.</div>
            )}

            <h2 className="pt-2 text-sm font-black">Charge history</h2>
            {history.length === 0 && <p className="rounded-xl bg-white p-4 text-center text-sm text-gray-500 dark:bg-zinc-900">No cancellation charges yet.</p>}
            {history.map((h) => (
              <div key={h.id} className="rounded-2xl border border-gray-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">Order #{String(h.orderId).slice(-8)}</p>
                    <p className="text-[11px] text-gray-500">{when(h.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black">{inr(h.amount)}</p>
                    <span className={`text-[11px] font-bold capitalize ${h.status === "paid" ? "text-emerald-600" : h.status === "waived" ? "text-gray-500" : "text-red-600"}`}>
                      {h.status === "pending" || h.status === "applied" ? "unpaid" : h.status}
                    </span>
                  </div>
                </div>
                {h.reason && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{h.reason}</p>}
                {h.breakdown && (
                  <ul className="mt-2 space-y-0.5 rounded-lg bg-gray-50 p-2 text-[11px] dark:bg-zinc-800">
                    {LINES.filter(([k]) => Number(h.breakdown[k]) > 0).map(([k, label]) => (
                      <li key={k} className="flex justify-between"><span>{label}</span><span className="font-bold">{inr(h.breakdown[k])}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
