import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MapPinOff, Navigation, AlertTriangle, X, RefreshCw, Smartphone, ShieldAlert } from "lucide-react"

export default function GpsEnableModal({
  isOpen,
  errorInfo,
  onClose,
  onRetry,
}) {
  if (!isOpen) return null

  const isGpsOff = !errorInfo || errorInfo.isGpsOff || errorInfo.type === "GPS_OFF"
  const isPermissionDenied = errorInfo?.isPermissionDenied || errorInfo?.type === "PERMISSION_DENIED"

  const title = errorInfo?.title || (isGpsOff ? "Phone Ki Location (GPS) Chalu Karein" : "Location Permission Allow Karein")
  const subtitle = errorInfo?.subtitle || (isGpsOff ? "Turn On Device Location" : "Location Permission Required")
  const message =
    errorInfo?.message ||
    (isGpsOff
      ? "Aapke mobile ki location (GPS) band hai. Sahi location fetch karne ke liye kripya pehle apne device ki location chalu karein."
      : "Browser me location permission band hai. Kripya browser settings se location allow karein.")

  const steps = errorInfo?.instructionSteps || [
    "Apne mobile ka notification panel (Quick Settings) upar se niche swipe karein.",
    "'Location' ya 'GPS' icon ko tap karke Turn ON karein.",
    "Wapas aakar 'Dobara Koshish Karein' button dabayein.",
  ]

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-all">
        {/* Backdrop click */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0"
          onClick={onClose}
        />

        {/* Modal / Bottom Sheet Box */}
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 280 }}
          className="relative w-full sm:max-w-md bg-white dark:bg-[#141414] rounded-t-[28px] sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-10 p-6 max-h-[90vh] overflow-y-auto"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>

          {/* Icon Header */}
          <div className="flex flex-col items-center text-center mt-2">
            <div className="relative mb-4">
              <div
                className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shadow-lg transition-transform ${
                  isGpsOff
                    ? "bg-rose-50 dark:bg-rose-950/40 text-rose-500 border border-rose-100 dark:border-rose-900/50"
                    : isPermissionDenied
                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-500 border border-amber-100 dark:border-amber-900/50"
                    : "bg-blue-50 dark:bg-blue-950/40 text-blue-500 border border-blue-100 dark:border-blue-900/50"
                }`}
              >
                {isGpsOff ? (
                  <MapPinOff size={36} className="animate-bounce" />
                ) : isPermissionDenied ? (
                  <ShieldAlert size={36} className="animate-pulse" />
                ) : (
                  <AlertTriangle size={36} />
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
              </span>
            </div>

            <div className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase mb-1 bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300">
              {subtitle}
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-50 tracking-tight leading-snug">
              {title}
            </h3>

            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed font-medium">
              {message}
            </p>
          </div>

          {/* Quick Steps Guide */}
          <div className="mt-5 bg-gray-50 dark:bg-gray-900/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
              <Smartphone size={14} /> Kaise On Karein:
            </p>
            <div className="space-y-2.5">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-semibold">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-black mt-0.5 shadow-sm">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col gap-2.5">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="w-full h-13 rounded-2xl bg-[#EB590E] hover:bg-[#d44d08] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-all"
              >
                <RefreshCw size={17} className="animate-spin-hover" />
                Location On Kar Li - Dobara Koshish Karein
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm transition-colors"
            >
              Theek Hai, Baad Me Karenge
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
