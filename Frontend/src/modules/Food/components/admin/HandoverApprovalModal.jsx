import React, { useState } from "react";
import {
  ShieldAlert,
  X,
  User,
  Phone,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Package,
  Store,
  MapPin,
  Loader2,
  Bike
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog";

export default function HandoverApprovalModal({
  isOpen,
  onClose,
  notification,
  onApprove,
  onReject,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [actionType, setActionType] = useState(null);

  if (!notification) return null;

  const rawOrder = notification?.rawOrder || {};
  const orderDisplayId = notification?.orderId || notification?.orderMongoId || rawOrder?.order_id || rawOrder?.orderId || "N/A";

  const partnerName =
    notification?.partnerName ||
    rawOrder?.dispatch?.handoverRequest?.requestedBy?.name ||
    rawOrder?.dispatch?.handoverRequest?.requestedBy?.fullName ||
    rawOrder?.deliveryPartnerName ||
    "Delivery Partner";

  const partnerPhone =
    notification?.partnerPhone ||
    rawOrder?.dispatch?.handoverRequest?.requestedBy?.phone ||
    rawOrder?.dispatch?.handoverRequest?.requestedBy?.phoneNumber ||
    rawOrder?.deliveryPartnerPhone ||
    "N/A";

  const partnerVehicle =
    notification?.partnerVehicle ||
    rawOrder?.dispatch?.handoverRequest?.requestedBy?.vehicleNumber ||
    rawOrder?.dispatch?.handoverRequest?.requestedBy?.vehicleType ||
    "";

  const reason =
    notification?.reason ||
    rawOrder?.dispatch?.handoverRequest?.reason ||
    "Emergency";

  const note =
    notification?.note ||
    rawOrder?.dispatch?.handoverRequest?.note ||
    "";

  const requestedAt = notification?.timeLabel || "Recently";

  // Additional order metadata
  const restaurantName =
    notification?.restaurantName ||
    rawOrder?.restaurantId?.restaurantName ||
    rawOrder?.restaurantName ||
    "Restaurant";

  const zoneName =
    notification?.zoneName ||
    rawOrder?.restaurantId?.zoneId?.name ||
    rawOrder?.restaurantId?.city ||
    rawOrder?.restaurantId?.area ||
    rawOrder?.zoneName ||
    "Zone";

  const customerName =
    notification?.customerName ||
    rawOrder?.userId?.name ||
    rawOrder?.userId?.fullName ||
    rawOrder?.deliveryAddress?.name ||
    rawOrder?.customerName ||
    "Customer";

  const customerPhone =
    notification?.customerPhone ||
    rawOrder?.userId?.phone ||
    rawOrder?.userId?.phoneNumber ||
    rawOrder?.deliveryAddress?.phone ||
    rawOrder?.deliveryAddress?.phoneNumber ||
    "N/A";

  const customerAddress =
    notification?.customerAddress ||
    rawOrder?.deliveryAddress?.formattedAddress ||
    rawOrder?.deliveryAddress?.addressLine1 ||
    rawOrder?.deliveryAddress?.street ||
    "N/A";

  const totalAmount = rawOrder?.totalAmount || rawOrder?.pricing?.total || 0;
  const items = rawOrder?.items || [];

  const handleApprove = async () => {
    setSubmitting(true);
    setActionType("approve");
    try {
      const ok = await onApprove(notification.orderMongoId || notification.orderId);
      if (ok) {
        onClose();
      }
    } finally {
      setSubmitting(false);
      setActionType(null);
    }
  };

  const handleReject = async () => {
    const rejectReason = prompt("Enter reason for rejecting handover:", "Rejected by admin") || "Rejected by admin";
    if (!rejectReason) return;

    setSubmitting(true);
    setActionType("reject");
    try {
      const ok = await onReject(notification.orderMongoId || notification.orderId, rejectReason);
      if (ok) {
        onClose();
      }
    } finally {
      setSubmitting(false);
      setActionType(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl p-0 bg-white border border-neutral-200 rounded-3xl overflow-hidden shadow-2xl z-[500]">
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-600 to-amber-600 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black tracking-tight text-white">
                Delivery Order Handover Request
              </DialogTitle>
              <p className="text-xs text-rose-100 font-medium">
                Admin Approval Required • Order #{orderDisplayId} {zoneName ? `(${zoneName})` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Emergency Alert Banner */}
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-900 leading-relaxed">
              <p className="font-bold">Driver has requested an emergency order handover!</p>
              <p className="mt-0.5 text-rose-700">
                Approving this request will set driver <span className="font-bold">{partnerName}</span> to <span className="font-bold uppercase text-rose-900">Offline</span> and unassign this order for automatic re-dispatch to available nearby drivers.
              </p>
            </div>
          </div>

          {/* Requesting Driver Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Bike className="w-3.5 h-3.5 text-rose-600" />
                Requesting Delivery Partner {partnerVehicle ? `(${partnerVehicle})` : ""}
              </span>
              <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {requestedAt}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center border border-slate-300">
                  {partnerName?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">{partnerName}</h4>
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    {partnerPhone}
                  </p>
                </div>
              </div>

              {partnerPhone && partnerPhone !== "N/A" && (
                <a
                  href={`tel:${partnerPhone}`}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors shadow-sm flex items-center gap-1"
                >
                  <Phone className="w-3 h-3 text-slate-500" />
                  Call Driver
                </a>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <p className="text-xs font-bold text-slate-700">Reason for Handover:</p>
              <p className="text-xs font-medium text-rose-700 bg-rose-100/50 p-2.5 rounded-xl mt-1 border border-rose-200">
                "{reason}" {note ? `— ${note}` : ""}
              </p>
            </div>
          </div>

          {/* Customer & Restaurant Brief */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-amber-600" />
              Order Summary & Details
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-slate-700">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Restaurant</span>
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  {restaurantName}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">Zone: {zoneName}</span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Customer</span>
                  {customerPhone && customerPhone !== "N/A" && (
                    <a href={`tel:${customerPhone}`} className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-0.5">
                      <Phone className="w-2.5 h-2.5" /> Call
                    </a>
                  )}
                </div>
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  {customerName}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">{customerPhone}</span>
                {customerAddress && customerAddress !== "N/A" && (
                  <span className="text-[10px] text-slate-400 flex items-start gap-1 mt-1 truncate">
                    <MapPin className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
                    {customerAddress}
                  </span>
                )}
              </div>
            </div>

            {items.length > 0 && (
              <div className="pt-2 border-t border-slate-200/80">
                <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Items</span>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((it, idx) => (
                    <span key={idx} className="bg-white border border-slate-200 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-800">
                      {it.quantity || 1}x {it.name || it.itemName || "Item"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={handleReject}
            className="flex-1 py-3 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && actionType === "reject" ? (
              <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>Reject Request</span>
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={handleApprove}
            className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && actionType === "approve" ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-white" />
            )}
            <span>Approve & Re-assign</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
