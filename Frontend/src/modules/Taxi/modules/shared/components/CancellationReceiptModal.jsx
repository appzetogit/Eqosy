import React from 'react';
import { X, CheckCircle2, AlertCircle, ShieldAlert, FileText, Wallet } from 'lucide-react';

export default function CancellationReceiptModal({ isOpen, onClose, cancellationBill, currency = '₹' }) {
  if (!isOpen || !cancellationBill) return null;

  const {
    rideId,
    cancelledBy,
    cancelledAt,
    cancellationStage,
    cancellationReason,
    billBreakdown = {},
    driverBreakdown = {},
    paymentDetails = {},
  } = cancellationBill;

  const isWaived = Boolean(billBreakdown.isWaived);
  const feeAmount = Number(billBreakdown.cancellationFee || 0);
  const taxAmount = Number(billBreakdown.taxAmount || 0);
  const totalAmount = Number(billBreakdown.totalAmount || 0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className={`p-6 text-white text-center relative ${isWaived ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-amber-500 to-orange-600'}`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition"
          >
            <X size={20} />
          </button>
          
          <div className="w-14 h-14 mx-auto mb-3 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30 shadow-inner">
            {isWaived ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
          </div>

          <h2 className="text-xl font-bold tracking-tight">Cancellation Receipt</h2>
          <p className="text-xs text-white/90 mt-1 font-medium">
            {isWaived ? 'Fee Waived (₹0 Charged)' : `Cancellation Fee Applied (${currency}${totalAmount.toFixed(2)})`}
          </p>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-gray-700">
          
          {/* Status & Stage */}
          <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-2xl border border-gray-100 text-xs">
            <div>
              <span className="text-gray-400 block font-medium uppercase tracking-wider text-[10px]">Cancelled By</span>
              <span className="font-bold text-gray-900 capitalize">{cancelledBy || 'User'}</span>
            </div>
            <div>
              <span className="text-gray-400 block font-medium uppercase tracking-wider text-[10px]">Stage</span>
              <span className="font-bold text-gray-900 capitalize">{cancellationStage || 'Searching'}</span>
            </div>
            {cancellationReason && (
              <div className="col-span-2 pt-2 border-t border-gray-200/60">
                <span className="text-gray-400 block font-medium uppercase tracking-wider text-[10px]">Reason</span>
                <span className="font-semibold text-gray-800">{cancellationReason}</span>
              </div>
            )}
          </div>

          {/* Itemized Bill Breakdown */}
          <div>
            <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider mb-2.5 flex items-center gap-1.5">
              <FileText size={14} className="text-gray-500" /> Bill Breakdown
            </h3>
            
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2.5 shadow-sm text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Free Limit</span>
                <span className="font-semibold">{billBreakdown.freeCancellationLimitMins || 0} mins</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Elapsed Time</span>
                <span className="font-semibold">{billBreakdown.elapsedMinutes || 0} mins</span>
              </div>

              {isWaived ? (
                <div className="pt-2 border-t border-gray-100 flex justify-between items-center text-emerald-600 font-bold">
                  <span>Reason</span>
                  <span>{billBreakdown.feeWaivedReason || 'Within free window'}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Base Cancellation Charge</span>
                    <span className="font-semibold">{currency}{feeAmount.toFixed(2)}</span>
                  </div>
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Service Tax (GST)</span>
                      <span className="font-semibold">{currency}{taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-2.5 border-t border-gray-100 flex justify-between items-center text-sm font-bold text-gray-900">
                    <span>Total Amount</span>
                    <span className="text-orange-600">{currency}{totalAmount.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Driver Payout & Penalty (if applicable) */}
          {(Number(driverBreakdown.driverPayout || 0) > 0 || Number(driverBreakdown.driverPenalty || 0) > 0) && (
            <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3.5 space-y-2 text-xs">
              <span className="text-blue-900 font-bold flex items-center gap-1.5">
                <Wallet size={14} /> Driver Wallet Settlement
              </span>
              {Number(driverBreakdown.driverPayout || 0) > 0 && (
                <div className="flex justify-between text-blue-800">
                  <span>Driver Compensation Payout</span>
                  <span className="font-bold text-emerald-600">+{currency}{Number(driverBreakdown.driverPayout).toFixed(2)}</span>
                </div>
              )}
              {Number(driverBreakdown.driverPenalty || 0) > 0 && (
                <div className="flex justify-between text-blue-800">
                  <span>Driver Penalty Deduction</span>
                  <span className="font-bold text-red-600">-{currency}{Number(driverBreakdown.driverPenalty).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Payment Notice */}
          <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed flex gap-2.5 items-start ${isWaived ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-900'}`}>
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-bold mb-0.5">{isWaived ? 'No Amount Due' : 'Payment Status'}</p>
              <p>{paymentDetails.note || (isWaived ? 'No fee charged.' : 'This charge will be added to your next booking.')}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
          <button
            onClick={onClose}
            className="w-full py-3 px-6 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold text-sm shadow-md transition"
          >
            Okay, Got It
          </button>
        </div>

      </div>
    </div>
  );
}
