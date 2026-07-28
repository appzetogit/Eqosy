import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car, Bike, Bus, Package, Utensils, MapPin, Sparkles } from 'lucide-react';

const EcosystemStorytelling = () => {
  const [activeHover, setActiveHover] = useState(null);
  const [autoActive, setAutoActive] = useState('ride');

  const services = [
    { id: 'ride', label: 'Ride', icon: Car, color: '#FF6B00', desc: 'Book cabs & autos' },
    { id: 'food', label: 'Food', icon: Utensils, color: '#E53935', desc: 'Order delicious meals' },
    { id: 'parcel', label: 'Parcel', icon: Package, color: '#FFB300', desc: 'Send items instantly' },
    { id: 'bus', label: 'Bus', icon: Bus, color: '#7C3AED', desc: 'Reserve bus seats' },
  ];

  const backgrounds = {
    ride: '/bg_ride.png',
    food: '/bg_food.png',
    parcel: '/bg_parcel.png',
    bus: '/bg_bus.png',
  };

  // Automatically cycle through background images every 4 seconds when not hovered
  useEffect(() => {
    if (activeHover !== null) return;
    const interval = setInterval(() => {
      setAutoActive((prev) => {
        const currentIndex = services.findIndex(s => s.id === prev);
        const nextIndex = (currentIndex + 1) % services.length;
        return services[nextIndex].id;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [activeHover]);

  const currentActive = activeHover || autoActive;
  const activeBg = backgrounds[currentActive] || backgrounds.ride;

  return (
    <div className="px-5 mb-6 select-none">
      <div className="relative w-full h-[390px] overflow-hidden bg-gradient-to-br from-[#EBF1FA] via-[#F3F7FC] to-[#F8FAFC] rounded-[28px] border border-blue-100/30 shadow-[0_16px_36px_rgba(30,41,59,0.04)]">
      
      {/* 1. Backdrop Skyline Image Carousel with Smooth Fade Transitions */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <AnimatePresence mode="wait">
          <motion.img
            key={activeBg}
            src={activeBg}
            alt=""
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 0.22, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="w-full h-full object-cover mix-blend-multiply"
          />
        </AnimatePresence>
        {/* Soft Radial Gradient Overlay to ease edges */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#F8FAFC]/90 via-transparent to-[#EBF1FA]/60" />
      </div>

      {/* 2. Headline & Storytelling Text */}
      <div className="relative z-10 px-6 pt-7 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <Sparkles size={11} className="text-[#FF6B00]" />
          <span className="text-[8px] font-black uppercase tracking-[0.25em] text-[#FF6B00]">
            One App. Every Journey.
          </span>
        </div>
        <h2 className="text-[20px] font-black text-slate-800 tracking-tight leading-tight">
          Your City. Connected by <span className="text-[#FF6B00] drop-shadow-[0_4px_10px_rgba(255,107,0,0.15)]">Eqosy</span>.
        </h2>
        <p className="mt-1 text-[10.5px] font-bold text-slate-500 leading-snug max-w-[280px] mx-auto">
          Ride, Food, and Parcel delivery — everything you need in one place.
        </p>

        {/* Dynamic Interactive Service Chips */}
        <div className="flex justify-center gap-2 mt-4">
          {services.map((s) => {
            const Icon = s.icon;
            const isActive = currentActive === s.id;
            return (
              <motion.button
                key={s.id}
                onMouseEnter={() => {
                  setActiveHover(s.id);
                  setAutoActive(s.id);
                }}
                onMouseLeave={() => setActiveHover(null)}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black tracking-wide transition-all ${
                  isActive 
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                    : 'bg-white/80 text-slate-700 border-slate-200/50 backdrop-blur-md shadow-sm'
                }`}
              >
                <Icon size={11} style={{ color: isActive ? s.color : '#64748B' }} />
                <span>{s.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* 3. Interactive Smart City SVG Canvas */}
      <div className="absolute inset-0 pointer-events-none z-10 overflow-visible mt-20">
        <svg className="w-full h-full" viewBox="0 0 450 240" fill="none">
          {/* Neon Grid Layout Lines */}
          <path d="M0,130 L450,130" stroke="rgba(15,23,42,0.02)" strokeWidth="1" />
          <path d="M0,165 L450,165" stroke="rgba(15,23,42,0.02)" strokeWidth="1" />
          
          {/* Animated Glowing Roads */}
          {/* Route 1: Upper Road (Delivery Route) */}
          <path
            d="M-50,140 C100,120 300,160 500,140"
            stroke="rgba(15,23,42,0.07)"
            strokeWidth="3.5"
            fill="none"
          />
          <motion.path
            d="M-50,140 C100,120 300,160 500,140"
            stroke="url(#route-glow-orange)"
            strokeWidth="3.5"
            strokeDasharray="6 30"
            fill="none"
            animate={{ strokeDashoffset: [-100, 100] }}
            transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
          />

          {/* Route 2: Lower Road (Taxi Highway) */}
          <path
            d="M500,185 C350,175 100,205 -50,195"
            stroke="rgba(15,23,42,0.07)"
            strokeWidth="4"
            fill="none"
          />
          <motion.path
            d="M500,185 C350,175 100,205 -50,195"
            stroke="url(#route-glow-blue)"
            strokeWidth="4"
            strokeDasharray="8 40"
            fill="none"
            animate={{ strokeDashoffset: [120, -120] }}
            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
          />

          {/* Glowing Smart City Location Node Pins */}
          {/* Node 1: Restaurant Pin (Food) */}
          <g className="transition-all duration-300" opacity={currentActive === 'food' ? 1 : 0.7}>
            <circle cx="85" cy="132" r="12" fill="#E53935" fillOpacity="0.15" />
            <circle cx="85" cy="132" r="5" fill="#E53935" />
            <circle cx="85" cy="132" r="2" fill="white" />
            {currentActive === 'food' && (
              <motion.circle cx="85" cy="132" r="16" stroke="#E53935" strokeWidth="1.5" fill="none" animate={{ scale: [1, 1.4], opacity: [0.8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} />
            )}
          </g>

          {/* Node 2: Office Hub Pin (Parcel) */}
          <g className="transition-all duration-300" opacity={currentActive === 'parcel' ? 1 : 0.7}>
            <circle cx="210" cy="148" r="12" fill="#FFB300" fillOpacity="0.15" />
            <circle cx="210" cy="148" r="5" fill="#FFB300" />
            <circle cx="210" cy="148" r="2" fill="white" />
            {currentActive === 'parcel' && (
              <motion.circle cx="210" cy="148" r="16" stroke="#FFB300" strokeWidth="1.5" fill="none" animate={{ scale: [1, 1.4], opacity: [0.8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} />
            )}
          </g>

          {/* Node 3: Home/Station Pin (Ride/Bus) */}
          <g className="transition-all duration-300" opacity={currentActive === 'ride' || currentActive === 'bus' ? 1 : 0.7}>
            <circle cx="340" cy="183" r="12" fill="#FF6B00" fillOpacity="0.15" />
            <circle cx="340" cy="183" r="5" fill="#FF6B00" />
            <circle cx="340" cy="183" r="2" fill="white" />
            {(currentActive === 'ride' || currentActive === 'bus') && (
              <motion.circle cx="340" cy="183" r="16" stroke="#FF6B00" strokeWidth="1.5" fill="none" animate={{ scale: [1, 1.4], opacity: [0.8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} />
            )}
          </g>

          {/* SVG Gradient Definitions */}
          <defs>
            <linearGradient id="route-glow-orange" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#FF6B00" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#E53935" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="route-glow-blue" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#2563EB" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>

        {/* 4. Vehicles Overview Badges */}
        <div className="absolute z-20 bottom-4 left-4 right-4 flex justify-between items-center gap-1.5">
          <div className="flex items-center gap-1 bg-gradient-to-r from-red-500 to-orange-500 text-white px-2 py-0.5 rounded-full border border-white/20 shadow-md">
            <Bike size={10} />
            <span className="text-[7px] font-black uppercase tracking-wider">EQOSY Delivery</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 text-[#FFB300] px-2 py-0.5 rounded-full border border-[#FFB300]/40 shadow-lg">
            <Car size={10} />
            <span className="text-[7px] font-black uppercase tracking-wider">EQOSY Cab</span>
          </div>

          <div className="flex items-center gap-1 bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 shadow-md">
            <Bus size={10} />
            <span className="text-[7px] font-black uppercase tracking-wider">Transit Bus</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default EcosystemStorytelling;
