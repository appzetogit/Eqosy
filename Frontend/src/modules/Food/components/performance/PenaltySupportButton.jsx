import { useState } from "react"
import { Headset, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { restaurantAPI, deliveryAPI } from "@food/api"

/**
 * "Contact support" for restaurants and delivery partners, used next to warnings, penalties and orders.
 * Creates a normal support ticket (shows up in Admin > Support Tickets) with the penalty / order attached.
 *
 * role: "restaurant" | "delivery"
 * context: { orderId, ledgerId, summary } - optional, added to the ticket so admin sees what it is about.
 */
export default function PenaltySupportButton({ role, context = {}, label = "Contact support", variant = "outline", className = "" }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const text = message.trim()
    if (text.length < 10) return toast.error("Please describe your problem (at least 10 characters)")
    const ref = [
      context.orderId ? `Order: ${context.orderId}` : "",
      context.ledgerId ? `Penalty ref: ${context.ledgerId}` : "",
      context.summary || "",
    ].filter(Boolean).join(" | ")
    const description = ref ? `${text}\n\n[${ref}]` : text

    setBusy(true)
    try {
      if (role === "delivery") {
        await deliveryAPI.createSupportTicket({
          subject: context.ledgerId ? "Penalty / warning help" : "Order help",
          description,
          category: context.orderId ? "order" : "other",
          priority: context.ledgerId ? "high" : "medium",
        })
      } else {
        await restaurantAPI.createSupportTicket({
          category: context.orderId ? "orders" : "other",
          issueType: context.ledgerId ? "Penalty / warning" : "Order help",
          subject: context.ledgerId ? "Penalty / warning help" : "Order help",
          description,
          orderRef: context.orderId ? String(context.orderId) : "",
          priority: context.ledgerId ? "high" : "medium",
        })
      }
      toast.success("Sent to support. Our team will get back to you.")
      setMessage("")
      setOpen(false)
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not send your message. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  const base = variant === "solid"
    ? "bg-black text-white"
    : "border border-gray-300 bg-white text-gray-800"
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${base} ${className}`}
      >
        <Headset className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Contact support</h3>
              <button onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {(context.orderId || context.ledgerId) && (
              <p className="mt-1 text-xs text-gray-500">
                {context.orderId ? `Order ${String(context.orderId).slice(-8)}` : ""}{context.orderId && context.ledgerId ? " · " : ""}{context.ledgerId ? `Penalty ${String(context.ledgerId).slice(-8)}` : ""}
              </p>
            )}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={1500}
              placeholder="Tell us what went wrong"
              className="mt-3 w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
            <button
              onClick={submit}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-black py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send to support
            </button>
          </div>
        </div>
      )}
    </>
  )
}
