import { AnimatePresence, motion } from "framer-motion"
import { Mic, X } from "lucide-react"

// Full-screen "listening" sheet: pulsing rings, live waveform and the words as they are heard.
export default function VoiceSearchOverlay({ open, isListening, transcript, error, onClose, onRetry }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10001] flex flex-col items-center justify-end bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="relative w-full max-w-md rounded-t-3xl bg-white px-6 pb-10 pt-6 text-center shadow-2xl dark:bg-[#1a1a1a]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close voice search"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>

            <p className="text-sm font-semibold text-slate-500">
              {error ? "Something went wrong" : isListening ? "Listening…" : transcript ? "Searching…" : "Tap the mic to speak"}
            </p>

            <div className="relative mx-auto my-8 flex h-32 w-32 items-center justify-center">
              {isListening &&
                [0, 1, 2].map((ring) => (
                  <motion.span
                    key={ring}
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: "var(--app-primary,#EB590E)" }}
                    initial={{ scale: 0.6, opacity: 0.35 }}
                    animate={{ scale: 1.7, opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: ring * 0.55, ease: "easeOut" }}
                  />
                ))}
              <motion.button
                type="button"
                onClick={!isListening ? onRetry : undefined}
                animate={isListening ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 1.1, repeat: isListening ? Infinity : 0 }}
                className="relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg"
                style={{ backgroundColor: "var(--app-primary,#EB590E)" }}
                aria-label="Start listening"
              >
                <Mic className="h-8 w-8" />
              </motion.button>
            </div>

            <div className="mb-4 flex h-8 items-end justify-center gap-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <motion.span
                  key={i}
                  className="w-1 rounded-full"
                  style={{ backgroundColor: "var(--app-primary,#EB590E)" }}
                  animate={isListening ? { height: [6, 8 + ((i * 7) % 22), 6] } : { height: 6 }}
                  transition={{ duration: 0.7 + (i % 3) * 0.15, repeat: isListening ? Infinity : 0, delay: i * 0.06 }}
                />
              ))}
            </div>

            <p className="min-h-[3rem] text-lg font-bold text-slate-900 dark:text-white">
              {transcript || (error ? "" : 'Try "pizza", "biryani" or "milk"')}
              {isListening && transcript && (
                <motion.span
                  className="ml-0.5 inline-block"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity }}
                >
                  |
                </motion.span>
              )}
            </p>
            {error && <p className="mt-1 text-sm font-medium text-rose-600">{error}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
