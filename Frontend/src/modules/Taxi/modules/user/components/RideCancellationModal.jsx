import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, Check, Loader2, ShieldAlert } from 'lucide-react';

export const TAXI_CANCELLATION_REASONS = [
  'I booked the ride by mistake',
  'I no longer need the ride',
  'I want to change my destination',
  'I entered the wrong pickup location',
  'I entered the wrong destination',
  'Driver is taking too long to arrive',
  'Driver is moving away from my pickup location',
  'Driver asked me to cancel the ride',
  'Driver is not responding',
  'Driver is not coming to the pickup location',
  'Driver asked for extra fare',
  'Fare is too high',
  'Estimated arrival time is too long',
  'I found another ride',
  "I don't feel comfortable with the driver",
  'I have an issue with the vehicle',
  'I want to change the vehicle type',
  'Emergency / urgent situation',
  'Other',
];

export default function RideCancellationModal({
  isOpen,
  onClose,
  onConfirm,
  isCancelling = false,
  stage = 'searching', // 'searching' | 'accepted' | 'arrived'
  cancellationPolicyText = '',
}) {
  const [selectedReason, setSelectedReason] = useState('');
  const [customComment, setCustomComment] = useState('');

  if (!isOpen) return null;

  const isOtherSelected = selectedReason === 'Other';
  const isFormValid =
    Boolean(selectedReason) &&
    (!isOtherSelected || Boolean(customComment.trim()));

  const handleConfirm = () => {
    if (!isFormValid || isCancelling) return;
    onConfirm({
      reason: selectedReason,
      cancellationReason: selectedReason,
      cancellationComment: customComment.trim(),
      comment: customComment.trim(),
    });
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-100 dark:border-zinc-800"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-zinc-900/50">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                Cancel Ride
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                {stage === 'searching'
                  ? 'No fee applies while searching for drivers'
                  : stage === 'arrived'
                  ? 'Driver has arrived at your pickup location'
                  : 'Driver is on the way'}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isCancelling}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-slate-700 dark:text-zinc-400 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body / Scrollable Reasons */}
          <div className="p-4 space-y-3 overflow-y-auto flex-1">
            {cancellationPolicyText && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl text-xs font-medium text-amber-800 dark:text-amber-300 leading-relaxed flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <span>{cancellationPolicyText}</span>
              </div>
            )}

            <p className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
              Please select a reason for cancellation <span className="text-red-500">*</span>
            </p>

            {/* Reasons list */}
            <div className="space-y-2">
              {TAXI_CANCELLATION_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(reason)}
                    disabled={isCancelling}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-xs font-semibold border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-600 dark:text-red-400 shadow-sm'
                        : 'bg-slate-50/80 dark:bg-zinc-800/50 border-slate-200/80 dark:border-zinc-700/80 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span>{reason}</span>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-red-500 bg-red-500'
                          : 'border-slate-300 dark:border-zinc-600'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Conditional "Other" custom text area */}
            {isOtherSelected && (
              <div className="pt-2 space-y-1.5 animate-in fade-in duration-200">
                <label className="text-xs font-bold text-slate-700 dark:text-zinc-200">
                  Please tell us why you want to cancel this ride <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={customComment}
                  onChange={(e) => setCustomComment(e.target.value)}
                  placeholder="Please tell us why you want to cancel this ride..."
                  disabled={isCancelling}
                  rows={3}
                  className="w-full resize-none border-2 border-slate-200 dark:border-zinc-700 dark:bg-zinc-800 rounded-2xl px-4 py-3 text-xs text-slate-800 dark:text-zinc-100 focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-100 dark:border-zinc-800 shrink-0 bg-slate-50/50 dark:bg-zinc-900/50 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isCancelling}
              className="flex-1 py-3 px-4 rounded-2xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!isFormValid || isCancelling}
              className="flex-1 py-3 px-4 rounded-2xl font-bold text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white shadow-lg shadow-red-500/20 transition-all flex items-center justify-center gap-2"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Confirm Cancellation'
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
