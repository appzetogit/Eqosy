import { useState, useEffect } from "react"
import { Ban } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"

const REASONS = [
  "Restaurant not responding / not cancelling",
  "No delivery partner available",
  "Delivery partner not picking the order",
  "Customer request",
  "Other",
]

/** Admin force-cancel. Refund option shows only when the customer already paid online / by wallet. */
export default function CancelOrderModal({ isOpen, onOpenChange, order, onConfirm, isProcessing }) {
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState("")
  const [refund, setRefund] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setReason(REASONS[0])
      setNote("")
      setRefund(true)
    }
  }, [isOpen, order])

  if (!order) return null

  const method = String(order.payment?.method || order.paymentMethod || "").toLowerCase()
  const payStatus = String(order.payment?.status || "").toLowerCase()
  const isPaidOnline = ["razorpay", "razorpay_qr", "wallet", "online"].includes(method) && payStatus === "paid"

  const handleConfirm = () => {
    const finalReason = reason === "Other" ? (note.trim() || "Other") : note.trim() ? `${reason} - ${note.trim()}` : reason
    onConfirm({ reason: finalReason, refund: isPaidOnline ? refund : false })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !isProcessing && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Ban className="w-5 h-5 text-rose-600" />
            Cancel Order
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Order ID: <span className="font-semibold">{order.orderId}</span> · {order.restaurant}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isProcessing}
              className="w-full px-3 py-2.5 border-2 border-slate-300 rounded-lg bg-white focus:outline-none focus:border-rose-500"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isProcessing}
              rows={2}
              placeholder="Additional note (optional)"
              className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-rose-500 text-sm"
            />
          </div>

          {isPaidOnline ? (
            <label className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={refund}
                onChange={(e) => setRefund(e.target.checked)}
                disabled={isProcessing}
                className="mt-1"
              />
              <span className="text-sm text-sky-900">
                <span className="font-semibold">Refund ₹{Number(order.totalAmount || 0).toFixed(2)}</span> to the customer
                ({method === "wallet" ? "wallet" : "original payment method"}).
                <span className="block text-xs text-sky-700 mt-0.5">
                  Uncheck to cancel now and refund later from the Refund button.
                </span>
              </span>
            </label>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
              Cash on delivery order — nothing was paid online, so no refund is needed.
            </div>
          )}

          <p className="text-xs text-slate-500">
            The customer, restaurant and delivery partner (if assigned) will be notified immediately.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing} className="px-4 py-2">
            Keep Order
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white"
          >
            {isProcessing ? "Cancelling..." : isPaidOnline && refund ? "Cancel & Refund" : "Cancel Order"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
