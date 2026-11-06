/**
 * Restaurant time and delivery-partner time for one order, computed from the server timestamps already on the
 * order row (no extra API call). `late` marks anything past the approved ready time / adjusted delivery ETA.
 */
const MIN = 60 * 1000
const d = (v) => (v ? new Date(v) : null)
const diff = (a, b) => (a && b ? Math.round(((b.getTime() - a.getTime()) / MIN) * 10) / 10 : null)
const clock = (v) => (v ? new Date(v).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "")

export function getOrderTimes(order, now = new Date()) {
  const o = order || {}
  const ds = o.deliveryState || {}
  const history = Array.isArray(o.statusHistory) ? o.statusHistory : []
  const firstAt = (...s) => d(history.find((h) => s.includes(h.to))?.at)
  const status = String(o.status || o.orderStatus || "").toLowerCase()
  const cancelled = status.includes("cancel")

  const placed = d(o.createdAt)
  const accepted = d(o.prep?.acceptedAt) || firstAt("confirmed", "preparing")
  const ready = d(ds.foodReadyAt) || firstAt("ready_for_pickup", "ready")
  const riderAccepted = d(o.dispatch?.acceptedAt)
  const reachedPickup = d(ds.reachedPickupAt)
  const pickedUp = d(ds.pickedUpAt) || d(o.deliveryEval?.pickedUpAt)
  const delivered = d(ds.deliveredAt) || d(o.deliveredAt)
  const approved = d(o.prep?.approvedEta)
  const adjusted = d(o.deliveryEval?.adjustedEta)

  // Restaurant
  let restaurant = { text: "-", sub: "", tone: "muted" }
  if (accepted) {
    const acceptIn = diff(placed, accepted)
    if (ready) {
      const prep = diff(accepted, ready)
      const late = approved ? Math.max(0, diff(approved, ready)) : 0
      restaurant = {
        text: `Prep ${prep} min`,
        sub: `Accepted in ${acceptIn} min${late > 0 ? ` · ${late} min late` : ""}`,
        tone: late > 0 ? "late" : "ok",
      }
    } else if (!cancelled) {
      const running = diff(accepted, now)
      const over = approved && now > approved ? Math.round(((now - approved) / MIN) * 10) / 10 : 0
      restaurant = {
        text: `Preparing ${running} min`,
        sub: approved ? (over > 0 ? `${over} min past ${clock(approved)}` : `Due ${clock(approved)}`) : `Accepted in ${acceptIn} min`,
        tone: over > 0 ? "late" : "progress",
      }
    }
  } else if (!cancelled && placed) {
    restaurant = { text: `Waiting ${diff(placed, now)} min`, sub: "Not accepted yet", tone: "progress" }
  }

  // Delivery partner
  let delivery = { text: "-", sub: "", tone: "muted" }
  if (delivered && pickedUp) {
    const took = diff(pickedUp, delivered)
    const late = adjusted ? Math.max(0, diff(adjusted, delivered)) : 0
    const toRest = diff(riderAccepted, reachedPickup)
    delivery = {
      text: `Delivery ${took} min`,
      sub: `${toRest != null ? `To restaurant ${toRest} min` : ""}${late > 0 ? `${toRest != null ? " · " : ""}${late} min late` : ""}`,
      tone: late > 0 ? "late" : "ok",
    }
  } else if (pickedUp && !cancelled) {
    const running = diff(pickedUp, now)
    const over = adjusted && now > adjusted ? Math.round(((now - adjusted) / MIN) * 10) / 10 : 0
    delivery = { text: `On the way ${running} min`, sub: adjusted ? (over > 0 ? `${over} min past ${clock(adjusted)}` : `ETA ${clock(adjusted)}`) : "", tone: over > 0 ? "late" : "progress" }
  } else if (riderAccepted && !cancelled) {
    const toRest = reachedPickup ? diff(riderAccepted, reachedPickup) : null
    delivery = {
      text: reachedPickup ? `At restaurant, waited ${diff(reachedPickup, now)} min` : `Going to restaurant ${diff(riderAccepted, now)} min`,
      sub: toRest != null ? `Reached in ${toRest} min` : "",
      tone: "progress",
    }
  } else if (!cancelled && accepted) {
    delivery = { text: "No delivery partner yet", sub: "", tone: "muted" }
  }

  const total = diff(placed, delivered || (cancelled ? d(o.cancelledAt) : null))
  return { restaurant, delivery, totalMin: total }
}

export const TIME_TONE = {
  late: "text-red-600",
  ok: "text-emerald-700",
  progress: "text-blue-700",
  muted: "text-slate-400",
}
