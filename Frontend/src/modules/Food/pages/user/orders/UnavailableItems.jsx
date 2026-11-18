import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AlertTriangle, ArrowLeft, Ban, Check, Clock, Loader2, Minus, Plus, RefreshCw, Search, Store, X } from "lucide-react"
import { toast } from "sonner"
import { fulfilmentAPI } from "@food/api/fulfilmentAPI"
import { initRazorpayPayment } from "@food/utils/razorpay"

const inr = (v) => `₹${(Number(v) || 0).toFixed(2).replace(/\.00$/, "")}`
const errMsg = (e, fallback) => e?.response?.data?.message || e?.message || fallback

function useCountdown(deadlineAt, serverNow) {
  const offset = useMemo(() => (serverNow ? Date.now() - new Date(serverNow).getTime() : 0), [serverNow])
  const [left, setLeft] = useState(null)
  useEffect(() => {
    if (!deadlineAt) { setLeft(null); return undefined }
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(deadlineAt).getTime() + offset - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [deadlineAt, offset])
  return left
}
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

/* ------------------------------ Replacement picker ------------------------------ */
function ReplacementPicker({ unavailable, candidates, onPick, onClose }) {
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState(null)
  const [variantId, setVariantId] = useState("")
  const [qty, setQty] = useState(unavailable.quantity || 1)

  const suggestedIds = useMemo(() => new Set((unavailable.suggestions || []).map((s) => s.itemId)), [unavailable])
  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    const filtered = candidates.filter((c) => !term || c.name.toLowerCase().includes(term))
    return [...filtered].sort((a, b) => Number(suggestedIds.has(b.itemId)) - Number(suggestedIds.has(a.itemId)))
  }, [candidates, q, suggestedIds])

  const choose = (c) => {
    setSelected(c)
    setVariantId(c.variants?.[0]?.variantId || "")
    setQty(Math.min(unavailable.quantity || 1, c.maxQuantity || 1) || 1)
  }
  const price = selected ? (selected.variants?.find((v) => v.variantId === variantId)?.price ?? selected.price) : 0

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-white dark:bg-[#161616] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <div>
            <p className="text-xs text-gray-500">Replace</p>
            <h3 className="text-base font-bold dark:text-white">{unavailable.name}</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 dark:bg-white/10">
            <Search className="h-4 w-4 text-gray-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this store" className="w-full bg-transparent text-sm outline-none dark:text-white" />
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {list.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No other items are available from this store right now.</p>}
          {list.map((c) => {
            const active = selected?.itemId === c.itemId
            return (
              <button key={c.itemId} onClick={() => choose(c)} className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition ${active ? "border-[color:var(--app-primary,#EB590E)] bg-orange-50 dark:bg-orange-500/10" : "border-gray-100 dark:border-white/10"}`}>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-white/10">
                  {c.image ? <img src={c.image} alt={c.name} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold dark:text-white">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {c.variants?.length ? `From ${inr(Math.min(...c.variants.map((v) => v.price)))}` : inr(c.price)}
                    {" · "}{c.stockQuantity == null ? "In stock" : `${c.stockQuantity} available`}
                  </p>
                  {suggestedIds.has(c.itemId) && <span className="mt-0.5 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Suggested by store</span>}
                </div>
                {active && <Check className="h-5 w-5 text-[color:var(--app-primary,#EB590E)]" />}
              </button>
            )
          })}
        </div>
        {selected && (
          <div className="border-t border-gray-100 px-4 py-3 dark:border-white/10">
            {selected.variants?.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {selected.variants.map((v) => (
                  <button key={v.variantId} onClick={() => setVariantId(v.variantId)} className={`rounded-full border px-3 py-1 text-xs font-medium ${variantId === v.variantId ? "border-[color:var(--app-primary,#EB590E)] bg-orange-50 text-[color:var(--app-primary,#EB590E)]" : "border-gray-200 text-gray-600 dark:border-white/20 dark:text-gray-300"}`}>
                    {v.name} · {inr(v.price)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 rounded-full border border-gray-200 px-2 py-1 dark:border-white/20">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="p-1" aria-label="Decrease"><Minus className="h-4 w-4" /></button>
                <span className="min-w-[1.5rem] text-center text-sm font-semibold dark:text-white">{qty}</span>
                <button onClick={() => setQty(Math.min(selected.maxQuantity || 1, qty + 1))} disabled={qty >= (selected.maxQuantity || 1)} className="p-1 disabled:opacity-40" aria-label="Increase"><Plus className="h-4 w-4" /></button>
              </div>
              <button
                onClick={() => onPick({ action: "replace", itemId: selected.itemId, variantId: variantId || undefined, quantity: qty, name: selected.name, price, image: selected.image })}
                className="rounded-full bg-[color:var(--app-primary,#EB590E)] px-5 py-2.5 text-sm font-bold text-white"
              >
                Use this · {inr(price * qty)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ Page ------------------------------ */
export default function UnavailableItems() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState("replace") // replace | remove | cancel
  const [choices, setChoices] = useState({}) // lineKey -> { action, ... }
  const [picker, setPicker] = useState(null) // unavailable line being replaced
  const [proposal, setProposal] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [remember, setRemember] = useState(false)
  const previewSeq = useRef(0)

  const load = useCallback(async (silent = false) => {
    try {
      const res = await fulfilmentAPI.getDecision(orderId)
      const data = res?.data?.data
      setView(data)
      setRemember(data?.preference === "remove")
    } catch (e) {
      if (!silent) toast.error(errMsg(e, "Could not load this order"))
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => load(true), 15000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => { if (view && !view.replacementEnabled) setMode((m) => (m === "replace" ? "remove" : m)) }, [view])

  const left = useCountdown(view?.open ? view.deadlineAt : null, view?.serverNow)
  const unavailable = view?.unavailableItems || []
  const allRemoved = view && view.availableItems.length === 0

  // Option B: continue without = every unavailable line removed.
  useEffect(() => {
    if (mode === "remove") setChoices(Object.fromEntries(unavailable.map((u) => [u.lineKey, { action: "remove" }])))
    if (mode === "replace") setChoices((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v.action !== "remove" || false)))
    setProposal(null)
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const decided = unavailable.length > 0 && unavailable.every((u) => choices[u.lineKey])
  const buildLines = useCallback(() => unavailable.map((u) => {
    const c = choices[u.lineKey]
    return c.action === "remove"
      ? { lineKey: u.lineKey, action: "remove" }
      : { lineKey: u.lineKey, action: "replace", replacement: { itemId: c.itemId, variantId: c.variantId, quantity: c.quantity } }
  }), [choices, unavailable])

  // Live bill: recalculated by the server whenever the selection changes.
  useEffect(() => {
    if (!view?.open || mode === "cancel" || !decided) { setProposal(null); return undefined }
    const seq = ++previewSeq.current
    setPreviewing(true)
    const t = setTimeout(async () => {
      try {
        const res = await fulfilmentAPI.preview(orderId, { lines: buildLines() })
        if (seq === previewSeq.current) setProposal(res?.data?.data || null)
      } catch (e) {
        if (seq === previewSeq.current) { setProposal(null); toast.error(errMsg(e, "Could not update your bill")) }
      } finally {
        if (seq === previewSeq.current) setPreviewing(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [choices, decided, mode, orderId, view?.open, buildLines])

  const setChoice = (lineKey, value) => setChoices((c) => ({ ...c, [lineKey]: value }))
  const clearChoice = (lineKey) => setChoices((c) => { const n = { ...c }; delete n[lineKey]; return n })

  const finish = (message) => {
    toast.success(message)
    navigate(`/food/user/orders/${view?.orderMongoId || orderId}`, { replace: true })
  }

  const savePreference = async () => {
    if ((view?.preference === "remove") === remember) return
    try { await fulfilmentAPI.setPreference(remember ? "remove" : "ask") } catch { /* preference is optional */ }
  }

  const confirmCancel = async () => {
    if (!window.confirm("Cancel the entire order? Any online payment is refunded as per the cancellation policy.")) return
    setBusy(true)
    try {
      await fulfilmentAPI.decide(orderId, { action: "cancel" })
      finish("Order cancelled")
    } catch (e) {
      toast.error(errMsg(e, "Could not cancel the order"))
    } finally { setBusy(false) }
  }

  const confirmApply = async () => {
    if (!proposal) return
    setBusy(true)
    try {
      await savePreference()
      const res = await fulfilmentAPI.decide(orderId, { action: "apply", lines: buildLines(), expectedTotal: proposal.after.total })
      const data = res?.data?.data
      if (data?.requiresPayment && data?.razorpay) {
        const rp = data.razorpay
        await initRazorpayPayment({
          key: rp.key, amount: rp.amount, currency: rp.currency || "INR", order_id: rp.orderId, name: "Eqosy",
          description: `Additional amount for order ${view?.orderId}`,
          handler: async (response) => {
            try {
              await fulfilmentAPI.verifyPayment(orderId, {
                razorpayOrderId: response.razorpay_order_id, razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature,
              })
              finish("Payment received. Your order is updated.")
            } catch (e) {
              toast.error(errMsg(e, "We could not confirm the payment yet. If money was deducted it will be updated or refunded shortly."))
              load()
            } finally { setBusy(false) }
          },
          onClose: () => { setBusy(false); load() },
          onError: (err) => { setBusy(false); toast.error(err?.description || "Payment failed. Nothing was charged for the change.") },
        })
        return
      }
      finish(data?.alreadyApplied ? "Your decision was already recorded" : "Your order has been updated")
    } catch (e) {
      const body = e?.response?.data
      if (body?.code === "BILL_CHANGED" && body?.details) {
        setProposal(body.details)
        toast.warning("The bill changed while you were deciding. Please review the new amount.")
      } else {
        toast.error(errMsg(e, "Could not save your decision"))
      }
      setBusy(false)
      load(true)
      return
    }
    setBusy(false)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
  if (!view) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-gray-600">There are no unavailable items on this order.</p>
        <button onClick={() => navigate(`/food/user/orders/${orderId}`)} className="mt-4 rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white">View order</button>
      </div>
    )
  }

  const s = proposal?.settlement
  const cta = !proposal ? "Choose an option for every item" : s?.requiresPayment ? `Confirm & pay ${inr(s.extraAmount)} more` : "Confirm updated order"
  const canConfirm = view.open && !busy && !previewing && mode !== "cancel" && decided && proposal

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-gray-50 pb-40 dark:bg-[#0a0a0a]">
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-3 dark:border-white/10 dark:bg-[#111]">
        <button onClick={() => navigate(`/food/user/orders/${orderId}`)} className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold dark:text-white">Some items are unavailable</h1>
          <p className="text-xs text-gray-500">Order #{view.orderId}</p>
        </div>
        {view.open && left !== null && (
          <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${left > 0 ? "bg-orange-100 text-orange-700" : "bg-gray-200 text-gray-600"}`}>
            <Clock className="h-3.5 w-3.5" /> {left > 0 ? mmss(left) : "00:00"}
          </div>
        )}
      </div>

      <div className="space-y-4 px-4 pt-4">
        {!view.open && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {view.state === "resolved" ? "Your decision has been recorded. The store will confirm your updated order." : view.state === "cancelled" ? "This order was cancelled." : "This order can no longer be changed here."}
            <button onClick={() => navigate(`/food/user/orders/${orderId}`)} className="mt-2 block font-semibold underline">View order</button>
          </div>
        )}

        {view.open && left === 0 && (
          <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>The response time is over, but your order is <b>not cancelled</b>. The store and our team are waiting — please choose an option.</span>
          </div>
        )}

        {view.state === "awaiting_payment" && view.open && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            An additional payment of {inr(view.pending?.delta)} is pending. Confirm again below to pay, or choose another option. Nothing is charged until you pay.
          </div>
        )}

        {/* Unavailable items — all on one screen */}
        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-[#161616]">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-rose-600"><Ban className="h-4 w-4" /> Unavailable ({unavailable.length})</h2>
          <p className="mb-3 text-xs text-gray-500">The store could not fulfil these items. You will never be charged for them.</p>
          <div className="space-y-3">
            {unavailable.map((u) => {
              const c = choices[u.lineKey]
              return (
                <div key={u.lineKey} className="rounded-xl border border-gray-100 p-3 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 opacity-60 dark:bg-white/10">{u.image ? <img src={u.image} alt={u.name} className="h-full w-full object-cover grayscale" /> : null}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-500 line-through dark:text-gray-400">{u.quantity} × {u.name}</p>
                      {u.variantName && <p className="text-xs text-gray-400">{u.variantName}</p>}
                    </div>
                    <p className="text-sm font-semibold text-gray-400 line-through">{inr(u.price * u.quantity)}</p>
                  </div>

                  {view.open && mode === "replace" && (
                    <div className="mt-3">
                      {c?.action === "replace" ? (
                        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-2 dark:bg-emerald-500/10">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white">{c.image ? <img src={c.image} alt={c.name} className="h-full w-full object-cover" /> : null}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-emerald-800 dark:text-emerald-300">{c.quantity} × {c.name}</p>
                            <p className="text-xs text-emerald-700">{inr(c.price * c.quantity)}</p>
                          </div>
                          <button onClick={() => setPicker(u)} className="text-xs font-semibold text-emerald-700 underline">Change</button>
                          <button onClick={() => clearChoice(u.lineKey)} className="p-1 text-emerald-700" aria-label="Clear"><X className="h-4 w-4" /></button>
                        </div>
                      ) : c?.action === "remove" ? (
                        <div className="flex items-center justify-between rounded-xl bg-gray-100 px-3 py-2 text-sm dark:bg-white/10">
                          <span className="text-gray-700 dark:text-gray-300">Continue without this item</span>
                          <button onClick={() => clearChoice(u.lineKey)} className="text-xs font-semibold text-gray-600 underline">Undo</button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {view.replacementEnabled && (
                            <button onClick={() => setPicker(u)} className="rounded-xl bg-[color:var(--app-primary,#EB590E)] px-3 py-2 text-sm font-bold text-white">Choose replacement</button>
                          )}
                          <button onClick={() => setChoice(u.lineKey, { action: "remove" })} className={`rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 dark:border-white/20 dark:text-gray-200 ${view.replacementEnabled ? "" : "col-span-2"}`}>Remove it</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Your three options */}
        {view.open && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold dark:text-white">What would you like to do?</h2>
            {view.replacementEnabled && (
              <button onClick={() => setMode("replace")} className={`w-full rounded-2xl border p-3 text-left ${mode === "replace" ? "border-[color:var(--app-primary,#EB590E)] bg-orange-50 dark:bg-orange-500/10" : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#161616]"}`}>
                <p className="text-sm font-bold dark:text-white">A · Choose replacement items</p>
                <p className="text-xs text-gray-500">Pick a replacement from the same store for each item — or remove only some of them.</p>
              </button>
            )}
            <button onClick={() => setMode("remove")} disabled={allRemoved} className={`w-full rounded-2xl border p-3 text-left disabled:opacity-50 ${mode === "remove" ? "border-[color:var(--app-primary,#EB590E)] bg-orange-50 dark:bg-orange-500/10" : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#161616]"}`}>
              <p className="text-sm font-bold dark:text-white">B · Continue without unavailable items</p>
              <p className="text-xs text-gray-500">{allRemoved ? "Every item is unavailable, so there is nothing left to continue with." : "We remove them and process the rest of your order."}</p>
            </button>
            <button onClick={() => setMode("cancel")} className={`w-full rounded-2xl border p-3 text-left ${mode === "cancel" ? "border-rose-400 bg-rose-50 dark:bg-rose-500/10" : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#161616]"}`}>
              <p className="text-sm font-bold text-rose-600">C · Cancel entire order</p>
              <p className="text-xs text-gray-500">Cancel everything. Refund follows the existing cancellation policy.</p>
            </button>
          </section>
        )}

        {/* Available items that stay */}
        {view.availableItems.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-[#161616]">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-700"><Store className="h-4 w-4" /> Staying in your order</h2>
            <div className="space-y-2">
              {view.availableItems.map((a) => (
                <div key={a.lineKey} className="flex items-center justify-between text-sm dark:text-gray-200">
                  <span className="truncate pr-2">{a.quantity} × {a.name}</span><span>{inr(a.price * a.quantity)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live bill */}
        {view.open && mode !== "cancel" && (
          <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-[#161616]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold dark:text-white">Updated bill</h2>
              {previewing && <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />}
            </div>
            {!proposal ? (
              <p className="text-xs text-gray-500">Choose what to do with every unavailable item to see your new total.</p>
            ) : (
              <div className="space-y-1.5 text-sm dark:text-gray-200">
                {proposal.lines.map((l) => (
                  <div key={l.lineKey} className="flex justify-between text-xs">
                    <span className="pr-2 text-gray-500">{l.action === "replace" ? `${l.name} → ${l.replacement.quantity} × ${l.replacement.name}` : `${l.name} removed`}</span>
                    <span className={l.action === "replace" ? "text-gray-700 dark:text-gray-300" : "text-emerald-600"}>{l.action === "replace" ? `${inr(l.replacement.addedAmount - l.removedAmount) .replace("₹-", "-₹")}` : `-${inr(l.removedAmount)}`}</span>
                  </div>
                ))}
                <hr className="my-2 border-gray-100 dark:border-white/10" />
                <Row label="Items" before={proposal.before.subtotal} after={proposal.after.subtotal} />
                {proposal.after.discount > 0 && <Row label="Discount" before={-proposal.before.discount} after={-proposal.after.discount} />}
                <Row label="Delivery fee" before={proposal.before.deliveryFee} after={proposal.after.deliveryFee} />
                <Row label="Platform fee" before={proposal.before.platformFee} after={proposal.after.platformFee} />
                {(proposal.after.additionalChargesTotal > 0 || proposal.before.additionalChargesTotal > 0) && <Row label="Other charges" before={proposal.before.additionalChargesTotal} after={proposal.after.additionalChargesTotal} />}
                <Row label="Taxes (GST)" before={proposal.before.tax} after={proposal.after.tax} />
                <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-base font-black dark:border-white/10 dark:text-white">
                  <span>{s.prepaid ? "New order total" : "You pay on delivery"}</span>
                  <span>{inr(proposal.after.total)}</span>
                </div>
                {s.type === "refund" && <p className="rounded-lg bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">{inr(s.refundAmount)} will be refunded to your {s.method === "wallet" ? "wallet" : "original payment method"}.</p>}
                {s.type === "charge" && <p className="rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">Additional {inr(s.extraAmount)} is needed. You are only charged after you confirm and pay.</p>}
                {s.type === "cod_update" && <p className="rounded-lg bg-gray-100 p-2 text-xs text-gray-700">Nothing to pay now. Cash on delivery is now {inr(s.codPayable ?? proposal.after.total)} (was {inr(s.oldTotal)}).</p>}
                {s.type === "none" && <p className="text-xs text-gray-500">Your total stays the same.</p>}
              </div>
            )}
          </section>
        )}

        {view.open && mode !== "cancel" && (
          <label className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
            <span>If I don't reply in time next time, continue without unavailable items (I'm never charged extra without my approval).</span>
          </label>
        )}
      </div>

      {view.open && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-[#111]">
          <div className="mx-auto max-w-xl">
            {mode === "cancel" ? (
              <button onClick={confirmCancel} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3.5 text-sm font-bold text-white disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Cancel entire order
              </button>
            ) : (
              <button onClick={confirmApply} disabled={!canConfirm} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--app-primary,#EB590E)] py-3.5 text-sm font-bold text-white disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {cta}
              </button>
            )}
          </div>
        </div>
      )}

      {picker && (
        <ReplacementPicker
          unavailable={picker}
          candidates={view.candidates}
          onClose={() => setPicker(null)}
          onPick={(choice) => { setChoice(picker.lineKey, choice); setPicker(null) }}
        />
      )}
    </div>
  )
}

function Row({ label, before, after }) {
  const changed = Math.abs((before || 0) - (after || 0)) > 0.004
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="flex items-center gap-2">
        {changed && <span className="text-gray-400 line-through">{inr(before)}</span>}
        <span className="font-medium dark:text-gray-200">{inr(after)}</span>
      </span>
    </div>
  )
}
