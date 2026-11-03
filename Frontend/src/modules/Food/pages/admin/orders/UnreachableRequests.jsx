import React, { useCallback, useEffect, useState } from "react";
import { PhoneOff, RefreshCw, Store, User, Bike, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";

const unwrapRows = (res) => {
  const data = res?.data?.data || res?.data || res;
  const rows = data?.orders || data?.items || (Array.isArray(data) ? data : []);
  return Array.isArray(rows) ? rows : [];
};

const timeAgo = (value) => {
  if (!value) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
};

/**
 * Admin: the delivery partner could not reach the customer and wants to bring the food back to the restaurant.
 * Approve (optionally with a penalty that is charged on the customer's next order) or reject.
 */
export default function UnreachableRequests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // order being decided
  const [mode, setMode] = useState("approve"); // approve | reject
  const [penalty, setPenalty] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(unwrapRows(await adminAPI.getPendingUndeliveredReturns()));
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  // New request while this page is open.
  useEffect(() => {
    const onNew = () => load();
    window.addEventListener("admin_undelivered_request", onNew);
    return () => window.removeEventListener("admin_undelivered_request", onNew);
  }, [load]);

  const openDialog = (order, nextMode) => {
    setActive(order);
    setMode(nextMode);
    setPenalty("");
    setNote("");
    setReason("");
  };

  const closeDialog = () => {
    if (!submitting) setActive(null);
  };

  const submit = async () => {
    if (!active) return;
    const orderKey = active._id || active.orderMongoId;
    setSubmitting(true);
    try {
      if (mode === "approve") {
        const amount = Number(penalty || 0);
        if (!Number.isFinite(amount) || amount < 0) {
          toast.error("Enter a valid penalty amount");
          setSubmitting(false);
          return;
        }
        await adminAPI.approveUndeliveredReturn(orderKey, { penaltyAmount: amount, note: note.trim() });
        toast.success(
          amount > 0
            ? `Approved. Rs ${amount} penalty will be charged on the customer's next order.`
            : "Approved. The delivery partner is returning the food to the restaurant.",
        );
      } else {
        await adminAPI.rejectUndeliveredReturn(orderKey, reason.trim());
        toast.success("Request rejected. The delivery partner was informed.");
      }
      setActive(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <PhoneOff className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Customer Unreachable Requests</h1>
            <p className="text-sm text-slate-500">
              Approve to send the food back to the restaurant. The delivery partner still gets their earning.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setLoading(true); load(); }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="py-20 text-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-500">No pending requests</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((order) => {
            const ret = order.undeliveredReturn || {};
            const partner = ret.requestedBy && typeof ret.requestedBy === "object" ? ret.requestedBy : {};
            const restaurant = order.restaurantId && typeof order.restaurantId === "object" ? order.restaurantId : {};
            const user = order.userId && typeof order.userId === "object" ? order.userId : {};
            const customerPhone = user.phone || order.customerPhone || order.deliveryAddress?.phone || "";
            return (
              <div key={order._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">Order #{order.order_id || order._id}</p>
                    <p className="text-xs text-slate-500">Requested {timeAgo(ret.requestedAt)}</p>
                  </div>
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800">
                    Approval needed
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Bike className="w-3.5 h-3.5" /> Delivery partner</p>
                    <p className="mt-1 font-semibold text-slate-900">{partner.name || partner.fullName || "Delivery Partner"}</p>
                    {partner.phone ? <a href={`tel:${partner.phone}`} className="text-xs font-semibold text-blue-600">{partner.phone}</a> : null}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><User className="w-3.5 h-3.5" /> Customer</p>
                    <p className="mt-1 font-semibold text-slate-900">{user.name || user.fullName || order.customerName || "Customer"}</p>
                    {customerPhone ? <a href={`tel:${customerPhone}`} className="text-xs font-semibold text-blue-600">{customerPhone}</a> : null}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Store className="w-3.5 h-3.5" /> Restaurant</p>
                    <p className="mt-1 font-semibold text-slate-900">{restaurant.restaurantName || restaurant.name || "Restaurant"}</p>
                    {restaurant.phone ? <a href={`tel:${restaurant.phone}`} className="text-xs font-semibold text-blue-600">{restaurant.phone}</a> : null}
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700">
                  <span className="font-semibold">Reason:</span> {ret.reason || "Customer not answering calls"}
                  {ret.note ? ` (${ret.note})` : ""}
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  <span className="font-semibold">Order total:</span> Rs {order.pricing?.total ?? "-"}
                  {" • "}
                  <span className="font-semibold">Payment:</span> {String(order.payment?.method || "").toUpperCase()} ({order.payment?.status || "-"})
                  {" • "}
                  <span className="font-semibold">Rider earning:</span> Rs {order.riderEarning ?? 0}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => openDialog(order, "approve")}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    <Check className="w-4 h-4" /> Approve return
                  </button>
                  <button
                    type="button"
                    onClick={() => openDialog(order, "reject")}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {active ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={closeDialog}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {mode === "approve" ? (
              <>
                <h2 className="text-lg font-bold text-slate-900">Approve return to restaurant</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Order #{active.order_id || active._id}. The restaurant will get an OTP, the delivery partner keeps their earning.
                </p>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Penalty for the customer (Rs)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={penalty}
                    onChange={(e) => setPenalty(e.target.value)}
                    placeholder="0 = no penalty"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  This amount is added to the same customer account's next order.
                </p>
                <label className="mt-4 block text-sm font-semibold text-slate-700">
                  Note (optional)
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-900">Reject request</h2>
                <p className="mt-1 text-sm text-slate-500">
                  The delivery partner will be told to keep trying to reach the customer.
                </p>
                <label className="mt-5 block text-sm font-semibold text-slate-700">
                  Reason
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Customer just replied, please deliver"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-rose-500"
                  />
                </label>
              </>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 ${mode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {mode === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
