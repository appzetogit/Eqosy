import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Clock, Loader2, MapPin } from "lucide-react"
import { toast } from "sonner"
import { cancellationAPI } from "@food/api/cancellationAPI"
import { initRazorpayPayment } from "@food/utils/razorpay"
import { useProfile } from "@food/context/ProfileContext"

const inr = (v) => `₹${(Number(v) || 0).toFixed(2).replace(/\.00$/, "")}`

function Countdown({ to }) {
  const [left, setLeft] = useState(Math.max(0, Math.round((new Date(to).getTime() - Date.now()) / 1000)))
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.round((new Date(to).getTime() - Date.now()) / 1000))), 1000)
    return () => clearInterval(id)
  }, [to])
  return <span className="font-mono font-bold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
}

/** Nearby discounted food from cancelled orders (Eqosy Food Rescue). Server decides who wins a simultaneous claim. */
export default function FoodRescue() {
  const navigate = useNavigate()
  const { getDefaultAddress } = useProfile()
  const [pos, setPos] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState("")
  const timer = useRef(null)

  const load = useCallback(async (p) => {
    if (!p) return
    try {
      const res = await cancellationAPI.nearbyRescues(p.lat, p.lng)
      setItems(res?.data?.data || [])
    } catch (e) {
      toast.error(e?.response?.data?.message || "Could not load rescue food")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const addr = getDefaultAddress?.()
    const c = addr?.location?.coordinates
    const fallback = Array.isArray(c) && c.length === 2 ? { lat: c[1], lng: c[0] } : null
    if (!navigator.geolocation) { setPos(fallback); return }
    navigator.geolocation.getCurrentPosition(
      (g) => setPos({ lat: g.coords.latitude, lng: g.coords.longitude }),
      () => { setPos(fallback); if (!fallback) setLoading(false) },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [getDefaultAddress])

  useEffect(() => {
    if (!pos) return undefined
    load(pos)
    timer.current = setInterval(() => load(pos), 10000)
    return () => clearInterval(timer.current)
  }, [pos, load])

  const claim = async (item) => {
    const addr = getDefaultAddress?.()
    const c = addr?.location?.coordinates
    if (!addr || !Array.isArray(c)) { toast.error("Please add a delivery address with a map location first"); return }
    setBusyId(item.id)
    try {
      const res = await cancellationAPI.claimRescue(item.id, { address: { ...addr, location: { type: "Point", coordinates: c } }, paymentMethod: "razorpay" })
      const d = res?.data?.data
      await initRazorpayPayment({
        key: d.razorpay.key,
        amount: d.razorpay.amount,
        currency: d.razorpay.currency || "INR",
        order_id: d.razorpay.orderId,
        name: "Eqosy Food Rescue",
        description: `${item.restaurantName} - rescued food`,
        handler: async (response) => {
          try {
            await cancellationAPI.verifyRescue({
              orderId: d.orderId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })
            toast.success("Food rescued! Your order is on its way.")
            navigate(`/user/orders/${d.orderId}`)
          } catch (e) {
            toast.error(e?.response?.data?.message || "Could not confirm the order")
            load(pos)
          } finally {
            setBusyId("")
          }
        },
        onClose: () => { setBusyId(""); load(pos) },
        onError: (err) => { setBusyId(""); toast.error(err?.description || "Payment failed") },
      })
    } catch (e) {
      setBusyId("")
      toast.error(e?.response?.data?.message || "Sorry, this food is no longer available")
      load(pos)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-gray-50 pb-24 dark:bg-[#0a0a0a]">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 p-4 text-sm text-gray-600 dark:text-gray-300"><ArrowLeft className="h-4 w-4" /> Back</button>
      <div className="space-y-3 px-4">
        <h1 className="text-lg font-black">Eqosy Food Rescue</h1>
        <p className="text-xs text-gray-500">Freshly prepared food from cancelled orders, near you, at a discount. First to pay gets it.</p>
        {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : items.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 dark:bg-zinc-900">Nothing to rescue nearby right now. Check back soon.</p>
        ) : items.map((it) => (
          <div key={it.id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-black">{it.restaurantName || "Restaurant"}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500"><MapPin className="h-3 w-3" /> {it.distanceKm} km away</p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] text-red-600"><Clock className="h-3 w-3" /><Countdown to={it.expiresAt} /></span>
            </div>
            <ul className="mt-2 space-y-0.5 text-sm text-gray-700 dark:text-gray-200">
              {it.items.map((i, idx) => <li key={idx}>{i.quantity} × {i.name}</li>)}
            </ul>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <span className="text-xl font-black text-emerald-600">{inr(it.rescuePrice)}</span>
                <span className="ml-2 text-xs text-gray-400 line-through">{inr(it.originalPrice)}</span>
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">{it.discountPercent}% OFF</span>
                <p className="text-[10px] text-gray-400">Food price. Delivery, platform fee and taxes extra.</p>
              </div>
              <button onClick={() => claim(it)} disabled={busyId === it.id || it.status === "held"} className="flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {busyId === it.id && <Loader2 className="h-4 w-4 animate-spin" />}{it.status === "held" ? "Being claimed" : "Claim now"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
