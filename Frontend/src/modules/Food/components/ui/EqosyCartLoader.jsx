import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Utensils, Flame, Sparkles, ShoppingCart } from "lucide-react";
import eqosyLogo from "@food/assets/eqosy-logo.png";

export default function EqosyCartLoader({
  show = false,
  message = "Adding to Cart...",
  subMessage = "Preparing your fresh delicacies with Eqosy",
  fullScreen = true,
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className={`${
            fullScreen
              ? "fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
              : "absolute inset-0 z-[999] flex items-center justify-center bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-sm p-4 rounded-3xl"
          }`}
        >
          {/* Main Card Container */}
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl bg-white dark:bg-[#161618] p-6 sm:p-8 text-center shadow-2xl border border-orange-500/20 dark:border-orange-500/10"
          >
            {/* Glowing Background Radial */}
            <div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-gradient-to-br from-orange-500/30 to-pink-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-gradient-to-tl from-pink-500/30 to-orange-500/20 blur-3xl" />

            {/* Central Animated Logo Container */}
            <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
              {/* Outer Spinning Gradient Ring */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-[#EB590E] via-[#FA0272] to-[#FF9100] p-[3px] shadow-lg shadow-orange-500/30"
              >
                <div className="h-full w-full rounded-full bg-white dark:bg-[#161618]" />
              </motion.div>

              {/* Pulsing Glow Effect Behind Logo */}
              <motion.div
                animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="absolute h-16 w-16 rounded-full bg-gradient-to-r from-[#EB590E] to-[#FA0272] blur-md sm:h-20 sm:w-20"
              />

              {/* Eqosy Logo Image */}
              <motion.img
                src={eqosyLogo}
                alt="Eqosy Logo"
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                className="relative z-10 h-14 w-14 object-contain drop-shadow-md sm:h-16 sm:w-16"
              />

              {/* Orbiting Floating Icons */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 z-20 pointer-events-none"
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-[#EB590E] p-1.5 text-white shadow-md">
                  <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#FA0272] p-1.5 text-white shadow-md">
                  <Utensils className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="absolute top-1/2 -right-1 -translate-y-1/2 rounded-full bg-amber-500 p-1.5 text-white shadow-md">
                  <Flame className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 rounded-full bg-orange-600 p-1.5 text-white shadow-md">
                  <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
              </motion.div>
            </div>

            {/* Brand Name & Messages */}
            <div className="relative z-10 space-y-1.5">
              <div className="flex items-center justify-center gap-1.5">
                <span className="bg-gradient-to-r from-[#EB590E] via-[#FA0272] to-[#FF6B00] bg-clip-text text-xl font-black tracking-widest text-transparent sm:text-2xl">
                  EQOSY
                </span>
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:bg-orange-950/60 dark:text-orange-400">
                  FOOD
                </span>
              </div>

              <h3 className="text-base font-bold text-gray-900 dark:text-white sm:text-lg">
                {message}
              </h3>

              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {subMessage}
              </p>
            </div>

            {/* Sleek Animated Shimmer Progress Bar */}
            <div className="relative mt-5 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <motion.div
                animate={{
                  x: ["-100%", "100%"],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="h-full w-2/3 rounded-full bg-gradient-to-r from-[#EB590E] via-[#FA0272] to-[#FF9100] shadow-sm"
              />
            </div>

            {/* Bottom Branded Badge */}
            <div className="mt-4 flex items-center justify-center gap-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
              <ShoppingCart className="h-3 w-3 text-orange-500" />
              <span>Eqosy Express Cart</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
