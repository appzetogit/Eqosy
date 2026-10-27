import React from 'react';
import { BadgeCheck, Banknote } from 'lucide-react';

/** Reads paid/COD state from any rider-facing order payload (backend sends `paymentSummary`). */
export const getRiderPaymentInfo = (order) => {
  const summary = order?.paymentSummary;
  if (summary) {
    return {
      isPaid: Boolean(summary.isPaid),
      amount: Number(summary.collectAmount) || 0,
      method: String(summary.paymentMethod || '').toLowerCase(),
    };
  }
  const method = String(order?.paymentMethod || order?.payment?.method || 'cash').toLowerCase();
  const status = String(order?.paymentStatus || order?.payment?.status || '').toLowerCase();
  const isPaid =
    ['wallet', 'razorpay', 'online', 'upi', 'card'].includes(method) ||
    ['paid', 'captured', 'settled', 'completed'].includes(status);
  const total = Number(order?.pricing?.total ?? order?.total ?? 0) || 0;
  return { isPaid, amount: isPaid ? 0 : total, method };
};

const methodLabel = (method) => {
  if (method === 'wallet') return 'WALLET';
  if (method.startsWith('razorpay') || method === 'online') return 'ONLINE';
  return method.toUpperCase();
};

/**
 * Tells the rider at a glance: PAID (collect nothing) or COLLECT CASH ₹X.
 */
export const PaymentBadge = ({ order, className = '' }) => {
  const { isPaid, amount, method } = getRiderPaymentInfo(order);
  const billTotal = Number(order?.pricing?.total ?? order?.total ?? order?.amounts?.totalCustomerPaid ?? 0) || 0;
  const gstAmount = Number(order?.pricing?.tax ?? 0) || 0;
  const gstRate = Number(order?.pricing?.gstRate ?? 0) || 0;
  const gstNote = gstAmount > 0
    ? `Bill includes GST ₹${gstAmount.toFixed(2)}${gstRate > 0 ? ` (${gstRate}%)` : ''}`
    : '';

  if (isPaid) {
    return (
      <div className={`flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 ${className}`}>
        <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-emerald-600">
          <BadgeCheck className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
            Paid {method ? `via ${methodLabel(method)}` : 'online'}
          </span>
          <span className="text-sm font-black text-emerald-900 leading-tight">
            {billTotal > 0 ? `Bill ₹${Math.round(billTotal)} already paid — collect ₹0` : 'Already paid — do not collect cash'}
          </span>
          {gstNote && <span className="text-[11px] font-bold text-emerald-700">{gstNote}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 ${className}`}>
      <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-amber-600">
        <Banknote className="w-5 h-5" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">Cash on delivery</span>
        <span className="text-sm font-black text-amber-900 leading-tight">Collect ₹{Math.round(amount)} from customer</span>
        {gstNote && <span className="text-[11px] font-bold text-amber-700">{gstNote}</span>}
      </div>
    </div>
  );
};

export default PaymentBadge;
