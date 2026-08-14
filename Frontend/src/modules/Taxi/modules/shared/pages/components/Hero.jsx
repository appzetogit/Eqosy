import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ArrowRight,
  MapPin,
  Navigation,
  ShieldCheck,
  Zap,
  Star,
  CheckCircle2,
  Sparkles,
  Clock,
  TrendingUp,
} from "lucide-react";

import heroPromoVideo from "@/assets/hero-promo.mp4";

// Dynamic search placeholders & suggested quick chips per service
const SERVICE_CONFIG = {
  food: {
    id: "food",
    name: "Food",
    emoji: "🍔",
    badge: "15m Prep",
    tagline: "Gourmet Meals & Street Food",
    cta: "Order Food",
    color: "#FF641F",
    bgTint: "#FFF5EF",
    glowSpotlight: "rgba(255, 100, 31, 0.12)",
    route: "/food",
    placeholders: [
      "Search 5,000+ dishes, biryani, pizzas...",
      "Craving a delicious burger or rolls?",
      "Find your favourite local restaurant...",
    ],
    quickChips: ["🔥 Biryani", "🍕 Cheese Pizza", "🍔 Burgers", "🥗 Pure Veg"],
    statusCard: {
      title: "Food On The Way",
      subtitle: "Bistro Cafe • Chef Prep Done",
      eta: "14 min",
      status: "Live Kitchen GPS",
      icon: "🍔",
      color: "#FF641F",
    },
  },
  taxi: {
    id: "taxi",
    name: "Rides",
    emoji: "🚕",
    badge: "Zero Surge",
    tagline: "City Cabs & Ride Pooling",
    cta: "Book Ride",
    color: "#377CF6",
    bgTint: "#F0F5FF",
    glowSpotlight: "rgba(55, 124, 246, 0.12)",
    route: "/taxi/user",
    placeholders: [
      "Where do you want to go today?",
      "Book city cab, ride pooling or outstation trip...",
      "Fixed transparent fares, zero surge...",
    ],
    quickChips: ["🚖 Instant Ride", "👥 Ride Pooling", "🏙️ Outstation Trip", "⚡ Fast Pickup"],
    statusCard: {
      title: "Driver Arriving",
      subtitle: "White Sedan • Verified Driver",
      eta: "2 min",
      status: "Live Fleet GPS",
      icon: "🚕",
      color: "#377CF6",
    },
  },
  grocery: {
    id: "grocery",
    name: "Grocery",
    emoji: "🛒",
    badge: "Instant 15m",
    tagline: "Daily Essentials & Fresh Farm",
    cta: "Shop Now",
    color: "#16B981",
    bgTint: "#F0FDF8",
    glowSpotlight: "rgba(22, 185, 129, 0.12)",
    route: "/food",
    placeholders: [
      "Search groceries, dairy & organic fruits...",
      "Fresh milk, butter, bread & snacks...",
      "Delivered direct from local dark stores...",
    ],
    quickChips: ["🥛 Fresh Milk", "🥦 Organic Veggies", "🍞 Daily Bread", "🥑 Avocados"],
    statusCard: {
      title: "Grocery Dispatched",
      subtitle: "Express Dark Store",
      eta: "11 min",
      status: "15-Min Delivery",
      icon: "🛍️",
      color: "#16B981",
    },
  },
  parcel: {
    id: "parcel",
    name: "Parcel",
    emoji: "📦",
    badge: "Secure OTP",
    tagline: "Express Citywide Couriers",
    cta: "Send Parcel",
    color: "#7657E8",
    bgTint: "#F6F3FF",
    glowSpotlight: "rgba(118, 87, 232, 0.12)",
    route: "/taxi/user",
    placeholders: [
      "Enter pickup & delivery address...",
      "Send keys, documents, chargers & gifts safely...",
      "Secure handover with 4-digit secret OTP...",
    ],
    quickChips: ["📄 Documents", "🔑 Keys & Laptop", "🎁 Gift Box", "⚡ Express Courier"],
    statusCard: {
      title: "Courier On Route",
      subtitle: "Live Delivery Partner Assigned",
      eta: "18 min",
      status: "OTP Verified",
      icon: "📦",
      color: "#7657E8",
    },
  },
};

const SERVICE_KEYS = ["food", "taxi", "grocery", "parcel"];

export default function Hero() {
  const navigate = useNavigate();
  const [activeVertical, setActiveVertical] = useState("food");
  const [userInteracted, setUserInteracted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // Video Ref
  const videoRef = useRef(null);

  // 1. AUTOMATIC SERVICE ROTATION (Pauses upon user interaction)
  const [autoIdx, setAutoIdx] = useState(0);
  useEffect(() => {
    if (userInteracted) return;
    const interval = setInterval(() => {
      setAutoIdx((prev) => {
        const next = (prev + 1) % SERVICE_KEYS.length;
        setActiveVertical(SERVICE_KEYS[next]);
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [userInteracted]);

  // 2. DYNAMIC SEARCH PLACEHOLDER ROTATION
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % 3);
    }, 2800);
    return () => clearInterval(interval);
  }, [activeVertical]);

  // 3. MOUSE PARALLAX (Desktop only: subtle ±4–6px)
  const heroRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e) => {
    if (!heroRef.current || window.innerWidth < 1024) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const y = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  const current = SERVICE_CONFIG[activeVertical];

  const handleSelectService = (id) => {
    setUserInteracted(true);
    setActiveVertical(id);
  };

  const handleAction = (e) => {
    e.preventDefault();
    navigate(current.route);
  };

  const handleChipClick = (chipText) => {
    setUserInteracted(true);
    setSearchQuery(chipText.replace(/^[^\s]+\s/, "")); // strip emoji for input
  };

  const [heroVideoSrc, setHeroVideoSrc] = useState(heroPromoVideo);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("eqosy_landing_page_settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.hero_video) setHeroVideoSrc(parsed.hero_video);
      }
    } catch {}
  }, []);

  return (
    <section
      ref={heroRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative min-h-[90vh] lg:min-h-screen w-full bg-[#FAF8F4] pt-16 pb-12 sm:pt-24 sm:pb-16 flex items-center overflow-hidden text-[#172033] selection:bg-[#FF641F] selection:text-white max-w-full box-border"
    >
      {/* =========================================================================
          1. DYNAMIC COLOR AURA LIGHTING (Changes ambient glow per selected service)
          ========================================================================= */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Orange Ambient Aura (Food) */}
        <motion.div
          animate={{
            x: [0, -15, 0] + mousePos.x * 3,
            y: [0, 10, 0] + mousePos.y * 3,
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 -left-32 size-[400px] sm:size-[500px] rounded-full blur-[140px] opacity-40"
          style={{
            background: "radial-gradient(circle, rgba(255, 100, 31, 0.15) 0%, transparent 70%)",
          }}
        />
        {/* Blue Aura (Taxi) */}
        <motion.div
          animate={{
            x: [0, 20, 0] + mousePos.x * 4,
            y: [0, -15, 0] + mousePos.y * 4,
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 -right-32 size-[400px] sm:size-[550px] rounded-full blur-[150px] opacity-35"
          style={{
            background: "radial-gradient(circle, rgba(55, 124, 246, 0.12) 0%, transparent 75%)",
          }}
        />
        {/* Green Aura (Grocery) */}
        <motion.div
          animate={{
            x: [0, 10, 0] + mousePos.x * 2,
            y: [0, 15, 0] + mousePos.y * 2,
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-20 left-1/4 size-[400px] sm:size-[480px] rounded-full blur-[130px] opacity-35"
          style={{
            background: "radial-gradient(circle, rgba(22, 185, 129, 0.12) 0%, transparent 70%)",
          }}
        />
        {/* Purple Aura (Parcel) */}
        <motion.div
          animate={{
            x: [0, -10, 0] + mousePos.x * 2.5,
            y: [0, -12, 0] + mousePos.y * 2.5,
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 right-1/4 size-[380px] sm:size-[450px] rounded-full blur-[140px] opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(118, 87, 232, 0.10) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* =========================================================================
          2. MAIN HERO CONTAINER: 46% LEFT CONTENT vs 54% CINEMATIC VIDEO STAGE
          ========================================================================= */}
      <div className="relative mx-auto max-w-7xl w-full px-3 sm:px-6 lg:px-8 z-10 overflow-hidden">
        
        <div className="grid lg:grid-cols-[46%_54%] items-center gap-6 sm:gap-8 lg:gap-12">
          
          {/* ==================== LEFT COLUMN: HEADLINE, INTERACTIVE CARD & PROOF ==================== */}
          <div className="flex flex-col justify-center w-full max-w-full lg:max-w-[540px] overflow-hidden">
            
            {/* Top Eyebrow Badge */}
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-[#E5E7EB] bg-white px-2.5 sm:px-3.5 py-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider shadow-xs text-[#172033] w-max max-w-full truncate mb-2.5 sm:mb-3.5"
            >
              <span className="size-2 rounded-full bg-[#FF641F] animate-pulse shrink-0" />
              <span className="truncate">INDIA'S #1 UNIFIED SUPER APP</span>
              <span className="text-[#D1D5DB]">•</span>
              <span className="text-[#667085] font-bold lowercase shrink-0">live 24/7</span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
              className="font-display text-[26px] xs:text-3xl sm:text-4xl lg:text-[52px] font-black tracking-tight text-[#172033] leading-[1.12] max-w-full break-words"
            >
              <span>Move, Eat & Shop </span>
              <br className="hidden sm:inline" />
              <span>in </span>
              <span className="bg-gradient-to-r from-[#FF641F] via-[#377CF6] to-[#16B981] bg-clip-text text-transparent">
                One Unified App.
              </span>
            </motion.h1>

            {/* Supporting Description */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mt-2 sm:mt-3 text-xs sm:text-base text-[#667085] font-medium leading-relaxed max-w-full"
            >
              Fast food delivery, instant rides, 15-min groceries and express parcels — seamlessly connected in one app.
            </motion.p>

            {/* =========================================================================
                3. INTEGRATED INTERACTIVE SUPER CARD (Tabs + Search + Quick Chips)
                ========================================================================= */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.3 }}
              style={{ backgroundColor: current.bgTint }}
              className="mt-3.5 sm:mt-6 w-full max-w-full p-2 sm:p-3.5 rounded-[18px] sm:rounded-[24px] border border-[#E5E7EB] shadow-[0_12px_36px_rgba(23,32,51,0.06)] transition-colors duration-300 overflow-hidden box-border"
            >
              {/* 4 Rich Service Tabs with Micro Badges */}
              <div className="grid grid-cols-4 gap-1 p-1 rounded-xl sm:rounded-2xl bg-[#FAF8F4] border border-[#E5E7EB]/70 w-full overflow-hidden box-border">
                {Object.values(SERVICE_CONFIG).map((tab) => {
                  const isActive = activeVertical === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSelectService(tab.id)}
                      className={`relative flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 px-0.5 rounded-lg sm:rounded-xl font-extrabold text-[10px] sm:text-xs transition-all duration-200 cursor-pointer overflow-hidden text-center ${
                        isActive ? "text-[#172033]" : "text-[#667085] hover:text-[#172033]"
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeServiceHeroSuperTab"
                          className="absolute inset-0 rounded-lg sm:rounded-xl shadow-xs bg-white"
                          style={{
                            border: `1.5px solid ${tab.color}35`,
                          }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 text-sm sm:text-lg shrink-0">{tab.emoji}</span>
                      <span className="relative z-10 font-bold tracking-tight text-[9px] sm:text-xs truncate w-full text-center">{tab.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Integrated Search Input & CTA Button */}
              <form onSubmit={handleAction} className="mt-2.5 sm:mt-3 flex flex-col sm:flex-row items-center gap-2 w-full">
                <div className="relative flex-1 w-full min-w-0 flex items-center bg-[#FAF8F4] rounded-xl border border-[#E5E7EB] focus-within:border-[#FF641F]/60 focus-within:bg-white transition-all overflow-hidden">
                  <MapPin
                    size={15}
                    className="ml-2.5 sm:ml-3 text-[#FF641F] shrink-0"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-9 sm:h-11 pl-2 pr-2 text-xs sm:text-sm font-semibold text-[#172033] placeholder:text-transparent focus:outline-none bg-transparent"
                  />
                  {!searchQuery && (
                    <div className="absolute left-7 sm:left-9 pointer-events-none overflow-hidden h-5 flex items-center text-[10px] sm:text-sm font-medium text-[#98A2B3] pr-2 max-w-[calc(100%-35px)]">
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={`${activeVertical}-${placeholderIdx}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.25 }}
                          className="block truncate"
                        >
                          {current.placeholders[placeholderIdx]}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ backgroundColor: current.color }}
                  className="w-full sm:w-auto h-9 sm:h-11 px-4 sm:px-5 rounded-xl text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs hover:brightness-105 transition-all cursor-pointer shrink-0"
                >
                  <span>{current.cta}</span>
                  <ArrowRight size={14} />
                </motion.button>
              </form>

              {/* Instant Quick Suggestion Chips */}
              <div className="mt-2 pt-2 border-t border-[#E5E7EB]/70 flex items-center gap-1.5 w-full overflow-x-auto no-scrollbar max-w-full">
                <span className="text-[10px] sm:text-[11px] font-bold text-[#98A2B3] uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <TrendingUp size={11} className="text-[#FF641F]" />
                  <span>Popular:</span>
                </span>
                <div className="flex items-center gap-1.5 flex-nowrap">
                  {current.quickChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-lg bg-[#FAF8F4] hover:bg-white text-[#172033] border border-[#E5E7EB] transition-colors whitespace-nowrap cursor-pointer shrink-0"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Honest Brand Trust Strip */}
            <div className="mt-3.5 flex flex-wrap items-center justify-start gap-1.5 sm:gap-3 text-[10px] sm:text-xs font-semibold text-[#667085] max-w-full overflow-hidden">
              <div className="flex items-center gap-1 text-[#16B981] font-bold shrink-0">
                <ShieldCheck size={13} />
                <span>Verified Drivers & Kitchens</span>
              </div>
              <span className="hidden sm:inline text-[#D1D5DB]">•</span>
              <span className="text-[#667085] font-medium shrink-0">FSSAI Certified</span>
              <span className="hidden sm:inline text-[#D1D5DB]">•</span>
              <span className="text-[#667085] font-medium shrink-0">OTP Secured</span>
            </div>

          </div>

          {/* ==================== RIGHT COLUMN: CINEMATIC SHOWCASE STAGE ==================== */}
          <div className="relative flex flex-col items-center justify-center w-full mt-4 lg:mt-0 overflow-hidden">
            
            {/* VIDEO DEVICE CONTAINER: 480-520px Height, 32px Radius, Rich Glow */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
              style={{
                x: mousePos.x * 2,
                y: mousePos.y * 2,
              }}
              className="relative w-full rounded-[24px] sm:rounded-[32px] overflow-hidden border border-black/[0.08] bg-[#172033] shadow-[0_24px_60px_rgba(23,32,51,0.12)] z-10"
            >
              <video
                ref={videoRef}
                src={heroVideoSrc || heroPromoVideo}
                autoPlay
                muted
                loop
                playsInline
                controls={false}
                className="w-full h-[220px] sm:h-[380px] lg:h-[480px] object-cover object-center block select-none"
              />

              {/* Inner Glossy Frame Highlight */}
              <div className="absolute inset-0 pointer-events-none rounded-[24px] sm:rounded-[32px] ring-1 ring-inset ring-white/20" />
            </motion.div>

            {/* LIVE OVERLAY STATUS CARD (Bottom-Left) */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeVertical + "-live-status"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-auto absolute -bottom-2 sm:-bottom-4 left-2 sm:left-6 z-20 bg-white/95 border border-[#E5E7EB] rounded-2xl p-2.5 sm:p-3.5 shadow-xl max-w-[190px] xs:max-w-[210px] sm:max-w-[240px] backdrop-blur-md"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-xl shrink-0">{current.statusCard.icon}</span>
                  <div className="overflow-hidden">
                    <h4 className="text-[11px] sm:text-xs font-bold text-[#172033] leading-tight truncate">
                      {current.statusCard.title}
                    </h4>
                    <p className="text-[9px] sm:text-[10px] text-[#667085] font-medium leading-tight mt-0.5 truncate">
                      {current.statusCard.subtitle}
                    </p>
                  </div>
                </div>
                <div className="mt-2 pt-1.5 border-t border-[#E5E7EB] flex items-center justify-between text-[9px] sm:text-[10px] font-bold">
                  <span className="flex items-center gap-1 shrink-0" style={{ color: current.color }}>
                    <span className="size-1.5 rounded-full bg-[#16B981] animate-live-dot" />
                    <span className="truncate max-w-[90px]">{current.statusCard.status}</span>
                  </span>
                  <span className="text-[#172033] bg-[#FAF8F4] px-1.5 py-0.5 rounded font-bold border border-[#E5E7EB] shrink-0">
                    {current.statusCard.eta}
                  </span>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* LIVE TOP BADGE (Top-Right) */}
            <motion.div
              className="absolute top-3 right-3 z-20 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/90 border border-white/80 shadow-md backdrop-blur-md flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-black text-[#172033]"
            >
              <span className="size-1.5 sm:size-2 rounded-full bg-[#16B981] animate-pulse shrink-0" />
              <span>Active Fleet</span>
            </motion.div>

          </div>

        </div>

      </div>
    </section>
  );
}
