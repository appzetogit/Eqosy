import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Car, Package, Search, Compass, MapPin, ArrowRight, Sparkles,
  Users, Bus, Send, Truck
} from 'lucide-react';

export default function SuperAppHero({ onSearchFocus }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Trigger the split door animation automatically on load
  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  // Service chips data
  const services = [
    { id: 'taxi', label: 'Taxi', Icon: Car, color: 'from-blue-500 to-indigo-600', path: '/taxi/user/ride/select-location' },
    { id: 'outstation', label: 'Outstation', Icon: Compass, color: 'from-blue-600 to-cyan-500', path: '/taxi/user/intercity' },
    { id: 'pooling', label: 'Pooling', Icon: Users, color: 'from-indigo-500 to-blue-600', path: '/taxi/user/pooling' },
    { id: 'parcel', label: 'Parcel', Icon: Package, color: 'from-violet-500 to-purple-600', path: '/taxi/user/parcel/type' },
    { id: 'bus', label: 'Bus', Icon: Bus, color: 'from-sky-500 to-blue-500', path: '/taxi/user/bus' }
  ];

  return (
    <div 
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="w-full relative h-[255px] overflow-hidden rounded-b-none bg-slate-950 shadow-xl select-none"
    >
      {/* 1. Animated Background Blobs & Morphing Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{
            scale: [1, 1.15, 1],
            x: [0, 20, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-24 -left-20 w-56 h-56 rounded-full bg-indigo-600/15 blur-3xl"
        />
        <motion.div 
          animate={{
            scale: [1.15, 1, 1.15],
            x: [0, -30, 0],
            y: [0, 20, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-24 -right-20 w-60 h-60 rounded-full bg-blue-500/10 blur-3xl"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.04)_0%,transparent_70%)]" />
      </div>

      {/* 2. Floating Subtle Background Particles */}
      <div className="absolute inset-0 pointer-events-none opacity-30">
        {[...Array(4)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ y: 255, x: Math.random() * 320, opacity: 0.1 }}
            animate={{
              y: -50,
              opacity: [0.1, 0.5, 0.1],
            }}
            transition={{
              duration: 7 + Math.random() * 3,
              repeat: Infinity,
              delay: i * 2,
              ease: "linear"
            }}
            className="absolute w-1 h-1 rounded-full bg-indigo-300"
          />
        ))}
      </div>

      {/* 3. Center Revealed Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-between py-4.5 px-6 z-10">
        {/* Top: Header Intro */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={isOpen ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1 rounded-full backdrop-blur-md mt-1"
        >
          <Sparkles size={10} className="text-amber-400 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-indigo-200">
            EQOSY Super App Experience
          </span>
        </motion.div>

        {/* Center: Glowing EQOSY Logo & Search Bar */}
        <div className="w-full flex flex-col items-center gap-3.5 my-auto">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={isOpen ? { scale: 1, opacity: 1 } : {}}
            transition={{ type: "spring", stiffness: 100, delay: 0.5 }}
            style={{
              x: mousePos.x * 10,
              y: mousePos.y * 10,
            }}
            className="relative"
          >
            {/* Soft Glow behind Logo */}
            <div className="absolute -inset-3 rounded-full bg-amber-400/20 blur-lg animate-pulse" />
            <h1 className="relative text-[36px] font-black tracking-[-0.04em] text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 leading-none select-none">
              eqosy
            </h1>
          </motion.div>

          {/* Sleek Glassmorphic Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={isOpen ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="w-full max-w-[260px]"
          >
            <button
              type="button"
              onClick={onSearchFocus}
              className="w-full flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl px-3.5 py-2 text-left shadow-xl transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:shadow-indigo-500/5 group"
            >
              <Search className="h-3.5 w-3.5 text-indigo-300/80 group-hover:text-indigo-200" />
              <span className="flex-1 truncate text-[11px] font-semibold text-indigo-200/60 group-hover:text-indigo-200/80">
                Where are we going today?
              </span>
              <div className="h-4.5 w-4.5 rounded bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
                <ArrowRight size={9} className="text-indigo-300" />
              </div>
            </button>
          </motion.div>
        </div>

        {/* Bottom: Staggered Animated Service Chips */}
        <div className="w-full flex justify-center gap-2 px-1 mb-1">
          {services.map((item, idx) => {
            const Icon = item.Icon;
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={isOpen ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.9 + idx * 0.08, type: "spring", stiffness: 120 }}
                whileHover={{ y: -3, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1 flex-1 max-w-[50px] focus:outline-none group"
              >
                <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${item.color} shadow-md border border-white/10 flex items-center justify-center text-white relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Icon size={15} className="transform group-hover:scale-110 transition-transform" />
                </div>
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 4. Left Sliding Panel (Dark Luxury Theme - Taxi & Maps) */}
      <motion.div
        animate={{
          x: isOpen ? '-100%' : '0%',
        }}
        transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.3 }}
        className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 border-r border-white/5 z-20 flex flex-col justify-between p-4 overflow-hidden origin-right"
      >
        {/* Shiny route line design decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
            <motion.path 
              d="M-20,50 Q20,20 50,60 T120,30" 
              stroke="url(#luxury-grad)" 
              strokeWidth="2"
              strokeDasharray="3 3"
              animate={{ strokeDashoffset: [0, -15] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
            <defs>
              <linearGradient id="luxury-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#6366F1" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Top: Luxury branding */}
        <div className="flex items-center gap-1.5">
          <div className="h-5 w-5 rounded bg-blue-600 flex items-center justify-center text-white border border-blue-400/30">
            <Car size={10} />
          </div>
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-400">
            Luxury Ride
          </span>
        </div>

        {/* Center: wireframe map graphic */}
        <div className="my-auto relative flex items-center justify-center h-20">
          <motion.div 
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10"
          >
            <Compass className="w-12 h-12 text-indigo-400/70 stroke-[1.2]" />
            <motion.div 
              animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="absolute -inset-2.5 rounded-full border border-indigo-400/20"
            />
          </motion.div>
          <MapPin className="absolute top-2 left-8 text-blue-500 w-4 h-4 fill-blue-500/10 drop-shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
          <MapPin className="absolute bottom-4 right-10 text-indigo-500 w-3.5 h-3.5 fill-indigo-500/10" />
        </div>

        {/* Bottom: Luxury subtext */}
        <div>
          <p className="text-[12px] font-black text-white tracking-tight leading-tight">
            Premium Transport
          </p>
          <p className="text-[8px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">
            Safe, reliable mobility
          </p>
        </div>
      </motion.div>

      {/* 5. Right Sliding Panel (Blue-Cyan Gradient Theme - Parcel Express) */}
      <motion.div
        animate={{
          x: isOpen ? '100%' : '0%',
        }}
        transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.3 }}
        className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-700 border-l border-white/5 z-20 flex flex-col justify-between p-4 overflow-hidden origin-left"
      >
        {/* Floating parcel box particles decoration */}
        <div className="absolute inset-0 pointer-events-none opacity-15">
          <motion.div 
            animate={{ y: [0, -6, 0], rotate: [0, 8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-6 right-4"
          >
            <Send size={24} className="text-white" />
          </motion.div>
          <motion.div 
            animate={{ y: [0, 6, 0], rotate: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-8 left-4"
          >
            <Truck size={24} className="text-white" />
          </motion.div>
        </div>

        {/* Top: Delivery branding */}
        <div className="flex items-center gap-1.5 self-end">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-blue-100">
            EXPRESS PARCEL
          </span>
          <div className="h-5 w-5 rounded bg-white flex items-center justify-center text-blue-600 shadow-sm">
            <Package size={10} />
          </div>
        </div>

        {/* Center: floating box illustration */}
        <div className="my-auto flex items-center justify-center h-20">
          <motion.div 
            animate={{ 
              y: [0, -8, 0],
              rotate: [0, 3, 0]
            }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex items-center justify-center"
          >
            <Package className="w-12 h-12 text-white stroke-[1.2] drop-shadow-2xl" />
            <div className="absolute -bottom-1.5 w-8 h-1.5 bg-black/20 rounded-full blur-sm" />
          </motion.div>
        </div>

        {/* Bottom: Delivery subtext */}
        <div className="text-right">
          <p className="text-[12px] font-black text-white tracking-tight leading-tight">
            Courier & Parcel
          </p>
          <p className="text-[8px] font-bold text-blue-100 mt-0.5 uppercase tracking-wider">
            Send packages anywhere
          </p>
        </div>
      </motion.div>

      {/* 6. Click-to-Reset Door Animation button (subtle top right inside hero container) */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="absolute top-3 right-3 z-30 h-7 w-7 rounded-full border border-white/10 bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/50 hover:text-white transition-colors"
        aria-label="Toggle Door Animation"
      >
        <motion.div
          animate={{ rotate: isOpen ? 0 : 180 }}
          transition={{ duration: 0.3 }}
        >
          <ArrowRight size={12} className={isOpen ? "rotate-180" : ""} />
        </motion.div>
      </button>
    </div>
  );
}
