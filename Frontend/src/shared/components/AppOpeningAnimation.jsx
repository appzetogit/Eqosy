import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import eqosyLogo from '@food/assets/eqosy-logo.png';

/**
 * AppOpeningAnimation - Premium 1:1 Super App Launch & Opening Animation
 * Features smooth logo scale, glowing pulse ambient lighting, tagline shimmer,
 * and high-end split door opening reveal.
 */
export default function AppOpeningAnimation() {
  const [showAnimation, setShowAnimation] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Show opening animation once per session or on app launch
    const hasSeenSession = sessionStorage.getItem('eqosy_opened_animation');
    return !hasSeenSession;
  });

  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    if (!showAnimation) return;

    // Phase 1: Hold splash & expand logo (0ms to 1400ms)
    // Phase 2: Trigger split door opening transition (1400ms)
    const openTimer = setTimeout(() => {
      setIsOpening(true);
    }, 1400);

    // Phase 3: Unmount opening animation completely (2400ms)
    const dismissTimer = setTimeout(() => {
      setShowAnimation(false);
      try {
        sessionStorage.setItem('eqosy_opened_animation', 'true');
      } catch {
        // ignore
      }
    }, 2400);

    return () => {
      clearTimeout(openTimer);
      clearTimeout(dismissTimer);
    };
  }, [showAnimation]);

  if (!showAnimation) return null;

  return (
    <AnimatePresence>
      <div 
        onClick={() => {
          setIsOpening(true);
          setTimeout(() => setShowAnimation(false), 600);
        }}
        className="fixed inset-0 z-[99999] overflow-hidden pointer-events-auto cursor-pointer select-none"
      >
        {/* Left Curtain / Door */}
        <motion.div
          initial={{ x: '0%' }}
          animate={{ x: isOpening ? '-100%' : '0%' }}
          transition={{ duration: 0.85, ease: [0.77, 0, 0.175, 1] }}
          className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-br from-[#0B172A] via-[#0F172A] to-[#1E293B] border-r border-amber-500/20 shadow-2xl flex items-center justify-end pr-6 z-20"
        >
          {/* Subtle Background Radial Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.15)_0%,transparent_60%)] pointer-events-none" />
        </motion.div>

        {/* Right Curtain / Door */}
        <motion.div
          initial={{ x: '0%' }}
          animate={{ x: isOpening ? '100%' : '0%' }}
          transition={{ duration: 0.85, ease: [0.77, 0, 0.175, 1] }}
          className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-bl from-[#0B172A] via-[#0F172A] to-[#1E293B] border-l border-amber-500/20 shadow-2xl flex items-center justify-start pl-6 z-20"
        >
          {/* Subtle Background Radial Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.15)_0%,transparent_60%)] pointer-events-none" />
        </motion.div>

        {/* Center Animated Logo & Branding Content */}
        <motion.div
          initial={{ opacity: 1, scale: 1 }}
          animate={{ 
            opacity: isOpening ? 0 : 1, 
            scale: isOpening ? 1.15 : 1 
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6"
        >
          {/* Ambient Pulsing Aura */}
          <div className="relative flex flex-col items-center">
            <motion.div 
              animate={{ 
                scale: [1, 1.25, 1],
                opacity: [0.4, 0.7, 0.4] 
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -inset-8 rounded-full bg-gradient-to-r from-amber-500/30 via-yellow-400/20 to-orange-500/30 blur-2xl"
            />

            {/* Main Brand Logo */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 flex flex-col items-center"
            >
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white/10 backdrop-blur-xl p-3 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-center mb-4">
                <img 
                  src={eqosyLogo} 
                  alt="Eqosy Super App Logo" 
                  className="w-full h-full object-contain filter drop-shadow-md"
                />
              </div>

              {/* Brand Title */}
              <h1 className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 tracking-tight uppercase drop-shadow-lg leading-none">
                EQOSY
              </h1>

              {/* Super App Tagline */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="mt-3 flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-md"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.25em] text-amber-200">
                  Super App • Food • Taxi • Delivery
                </span>
              </motion.div>
            </motion.div>
          </div>

          {/* Bottom Loading Progress Indicator */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute bottom-10 inset-x-0 flex flex-col items-center gap-2"
          >
            <div className="w-36 h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: '0%' }}
                transition={{ duration: 1.3, ease: "easeInOut" }}
                className="w-full h-full bg-gradient-to-r from-amber-400 to-yellow-300 rounded-full"
              />
            </div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Starting Eqosy...
            </span>
          </motion.div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
