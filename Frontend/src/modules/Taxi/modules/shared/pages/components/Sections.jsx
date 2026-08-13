import React, { useState, useEffect, useRef } from "react";
import { motion, useInView, useReducedMotion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  UtensilsCrossed,
  Car,
  ShoppingBasket,
  Package,
  Users,
  Wallet,
  ShieldCheck,
  Zap,
  MapPin,
  ArrowRight,
  Sparkles,
  Star,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Award,
  Smartphone,
  Flame,
  Globe,
  Radio,
  Send,
  HeartHandshake,
  Check,
  Compass,
  Store,
  Truck,
  Percent,
  QrCode,
  Download,
  Gift,
  Leaf,
  Navigation,
} from "lucide-react";

import phonesImg from "@/assets/eqosy-3d-phones.jpg";
import mapImg from "@/assets/eqosy-3d-map.jpg";
import cityImg from "@/assets/eqosy-3d-city.jpg";
import realBurgerImg from "@/assets/real-burger.png";
import taxi3dImg from "@/assets/3d images/AutoCab/taxi.png";
import grocery3dImg from "@/assets/3d images/grocery.png";
import gifts3dImg from "@/assets/3d images/gifts.png";
import groceryFoodVideo from "@/assets/grocery-food-promo.mp4";

/* ==========================================================================
   SHARED SCROLL-REVEAL HOOK
   ========================================================================== */
function useScrollReveal(options = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px", ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}

/* Reusable animated wrapper */
function RevealSection({ children, delay = 0, className = "" }) {
  const [ref, visible] = useScrollReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0px) scale(1)" : "translateY(36px) scale(0.97)",
        transition: `opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.65s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/* ==========================================================================
   CATEGORY CARD — internal component for premium micro-interactions
   ========================================================================== */
function CategoryCard({ cat, cardVariants, prefersReducedMotion, navigate, i }) {
  const [hovered, setHovered] = useState(false);

  // Continuous subtle float — only on non-reduced-motion desktops
  const floatTransition = prefersReducedMotion
    ? {}
    : { duration: 2.7 + i * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 };

  const floatAnimate = prefersReducedMotion
    ? {}
    : { y: [0, -3, 0] };

  return (
    <motion.div
      variants={cardVariants}
      onClick={() => navigate(cat.route)}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={prefersReducedMotion ? {} : {
        y: -7,
        scale: 1.03,
        boxShadow: "0 14px 36px rgba(0,0,0,0.11), 0 2px 8px rgba(0,0,0,0.06)",
        transition: { duration: 0.25, ease: "easeOut" },
      }}
      className="warm-card p-3.5 sm:p-4 flex flex-col items-center justify-center text-center cursor-pointer relative overflow-hidden"
      style={{ backgroundColor: hovered ? cat.color + "0E" : cat.color + "06", borderColor: cat.color + "30", willChange: "transform", backfaceVisibility: "hidden" }}
    >
      {/* Radial glow — category-specific color, appears on hover */}
      <motion.div
        className="absolute inset-0 pointer-events-none rounded-[inherit]"
        animate={{
          opacity: hovered ? 1 : 0,
          background: `radial-gradient(circle at 50% 38%, ${cat.color}1A 0%, transparent 68%)`,
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />

      {/* Icon wrapper — float + hover rotate */}
      <motion.div
        className="size-14 sm:size-16 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl mb-2 relative z-10"
        style={{ backgroundColor: `${cat.color}12` }}
        animate={floatAnimate}
        transition={floatTransition}
        whileHover={prefersReducedMotion ? {} : {
          scale: 1.09,
          rotate: 4,
          transition: { duration: 0.22, ease: "easeOut" },
        }}
      >
        <span className="select-none">{cat.emoji}</span>
      </motion.div>

      {/* Label */}
      <motion.span
        className="text-xs font-bold leading-tight relative z-10 block"
        animate={{ color: hovered ? cat.color : "#172033" }}
        transition={{ duration: 0.2 }}
      >
        {cat.name}
      </motion.span>

      {/* Bottom accent indicator — animated width 0 → 24px */}
      <motion.div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 h-[2px] rounded-full"
        style={{ backgroundColor: cat.color }}
        animate={{ width: hovered ? 24 : 0, opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
    </motion.div>
  );
}

/* ==========================================================================
   1. TRENDING SECTION — bg: #F1EEE7 (Soft Warm Cream)
   ========================================================================== */
export function Stats() {
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-60px 0px" });
  const prefersReducedMotion = useReducedMotion();

  const categories = [
    { name: "Dum Biryani",       emoji: "🍗", tag: "Food",    color: "#FF6B1A", route: "/food" },
    { name: "Cheese Pizza",      emoji: "🍕", tag: "Food",    color: "#FF6B1A", route: "/food" },
    { name: "Burgers & Fries",   emoji: "🍔", tag: "Food",    color: "#FF6B1A", route: "/food" },
    { name: "Pure Veg Thali",    emoji: "🍛", tag: "Food",    color: "#FF6B1A", route: "/food" },
    { name: "Instant City Cab",  emoji: "🚕", tag: "Taxi",    color: "#3977FF", route: "/taxi/user" },
    { name: "Ride Pooling",      emoji: "👥", tag: "Taxi",    color: "#3977FF", route: "/taxi/user" },
    { name: "Fresh Milk & Dairy",emoji: "🥛", tag: "Grocery", color: "#18B981", route: "/food" },
    { name: "Organic Veggies",   emoji: "🥦", tag: "Grocery", color: "#18B981", route: "/food" },
    { name: "Express Courier",   emoji: "📦", tag: "Parcel",  color: "#7657E8", route: "/taxi/user" },
  ];

  /* ── Variants ─────────────────────────────────────────────────────────── */
  const reduced = prefersReducedMotion;

  const badgeVariants = {
    hidden:  { opacity: 0, y: reduced ? 0 : 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
  };
  const headingVariants = {
    hidden:  { opacity: 0, y: reduced ? 0 : 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut", delay: 0.08 } },
  };
  const exploreVariants = {
    hidden:  { opacity: 0, x: reduced ? 0 : 16 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut", delay: 0.18 } },
  };
  const gridVariants = {
    hidden:  {},
    visible: { transition: { staggerChildren: reduced ? 0 : 0.065, delayChildren: 0.25 } },
  };
  const cardVariants = {
    hidden:  { opacity: 0, y: reduced ? 0 : 24, scale: reduced ? 1 : 0.96 },
    visible: {
      opacity: 1, y: 0, scale: 1,
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    },
  };

  const animate = isInView ? "visible" : "hidden";

  return (
    <section
      ref={sectionRef}
      className="w-full bg-[#F1EEE7] py-16 border-y border-[#E5E7EB] relative overflow-hidden"
    >
      {/* ── Very slow animated radial gradient behind cards ─────────────── */}
      {!reduced && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            background: [
              "radial-gradient(ellipse 65% 55% at 18% 50%, rgba(255,107,26,0.05) 0%, transparent 70%)",
              "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(57,119,255,0.04) 0%, transparent 70%)",
              "radial-gradient(ellipse 65% 55% at 82% 50%, rgba(24,185,129,0.04) 0%, transparent 70%)",
              "radial-gradient(ellipse 65% 55% at 18% 50%, rgba(255,107,26,0.05) 0%, transparent 70%)",
            ],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">

        {/* ── Section header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <motion.span
              variants={badgeVariants}
              initial="hidden"
              animate={animate}
              className="text-xs font-bold uppercase tracking-wider text-[#FF6B1A] bg-[#FFF5EF] px-3 py-1 rounded-full border border-[#FFE0CC] mb-2 inline-block"
            >
              Trending Near You
            </motion.span>
            <motion.h2
              variants={headingVariants}
              initial="hidden"
              animate={animate}
              className="text-2xl sm:text-3xl font-extrabold text-[#172033]"
            >
              What are you looking for today?
            </motion.h2>
          </div>

          {/* Explore All — arrow slides right on hover */}
          <motion.button
            variants={exploreVariants}
            initial="hidden"
            animate={animate}
            type="button"
            onClick={() => navigate("/food")}
            className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-[#FF6B1A] hover:text-[#E5580C] transition-colors cursor-pointer group"
          >
            <span>Explore All</span>
            <motion.span
              className="inline-flex items-center"
              whileHover={reduced ? {} : { x: 5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <ArrowRight size={14} />
            </motion.span>
          </motion.button>
        </div>

        {/* ── Staggered category cards ───────────────────────────────────── */}
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate={animate}
          className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3 sm:gap-4"
        >
          {categories.map((cat, i) => (
            <CategoryCard
              key={cat.name}
              cat={cat}
              i={i}
              cardVariants={cardVariants}
              prefersReducedMotion={reduced}
              navigate={navigate}
            />
          ))}
        </motion.div>

      </div>
    </section>
  );
}

/* ==========================================================================
   SERVICE CARD — internal component with full micro-interactions
   ========================================================================== */
function ServiceCard({ v, cardVariants, reduced, navigate }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      variants={cardVariants}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={reduced ? {} : {
        y: -6,
        scale: 1.015,
        boxShadow: "0 20px 48px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)",
        transition: { duration: 0.27, ease: "easeOut" },
      }}
      className="warm-card p-8 sm:p-10 flex flex-col justify-between overflow-hidden relative h-full"
      style={{ backgroundColor: v.bgTint || "#FFFFFF", borderColor: v.borderTint || "#E5E7EB", willChange: "transform" }}
    >
      {/* Per-category hover glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none rounded-[inherit]"
        animate={{
          opacity: hovered ? 1 : 0,
          background: `radial-gradient(ellipse 70% 55% at 75% 20%, ${v.color}12 0%, transparent 65%)`,
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-bold px-3 py-1 rounded-full border"
            style={{
              backgroundColor: v.bgTint,
              borderColor: v.borderTint,
              color: v.color,
            }}
          >
            {v.badge}
          </span>
          <span className="text-xs font-semibold text-[#98A2B3]">
            Live 24/7 🟢
          </span>
        </div>

        <div className="mt-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-[#172033]">
              {v.title}
            </h3>
            <p className="text-sm font-bold mt-1" style={{ color: v.color }}>
              {v.subtitle}
            </p>
            <p className="text-xs sm:text-sm text-[#667085] font-medium mt-2.5 leading-relaxed max-w-md">
              {v.desc}
            </p>
          </div>

          {/* Icon with hover scale + rotate */}
          <motion.img
            src={v.image}
            alt={v.title}
            className="size-20 sm:size-24 object-contain shrink-0 drop-shadow-sm"
            whileHover={reduced ? {} : { scale: 1.08, rotate: 3 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        </div>

        {/* 3 Key Benefits */}
        <ul className="mt-6 space-y-2 border-t border-[#E5E7EB] pt-4">
          {v.benefits.map((b) => (
            <li key={b} className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#172033]">
              <CheckCircle2 size={15} style={{ color: v.color, flexShrink: 0 }} />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA button with arrow micro-interaction */}
      <div className="relative z-10 mt-8 pt-5 border-t border-[#E5E7EB] flex items-center justify-between">
        <motion.button
          type="button"
          onClick={() => navigate(v.route)}
          style={{ backgroundColor: v.color }}
          className="px-6 py-3 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs active:scale-95 transition-shadow cursor-pointer"
          whileHover={reduced ? {} : {
            y: -2,
            boxShadow: `0 8px 20px ${v.color}40`,
            transition: { duration: 0.2, ease: "easeOut" },
          }}
        >
          <span>{v.cta}</span>
          <motion.span
            className="inline-flex items-center"
            whileHover={reduced ? {} : { x: 4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <ArrowRight size={14} />
          </motion.span>
        </motion.button>
        <span className="text-xs font-semibold text-[#667085]">
          Shared Wallet Cashback
        </span>
      </div>
    </motion.div>
  );
}

/* ==========================================================================
   2. FOUR SERVICES SECTION — bg: #FFFFFF (Pure White)
   Overlaps bottom of Trending section with negative margin-top
   ========================================================================== */
export function Showcase() {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const reduced = prefersReducedMotion;

  const verticals = [
    {
      id: "food",
      title: "EqosyFood",
      subtitle: "Fresh meals, delivered fast.",
      desc: "From top local restaurants to cloud kitchens — hot meals delivered in 15 minutes.",
      badge: "🍔 15-MIN DELIVERY",
      color: "#FF6B1A",
      bgTint: "#FFF5EF",
      borderTint: "#FFE0CC",
      route: "/food",
      cta: "Order Food",
      image: realBurgerImg,
      benefits: ["5,000+ restaurants", "Fast 15m delivery", "Live order tracking"],
    },
    {
      id: "taxi",
      title: "EqosyTaxi",
      subtitle: "Instant city rides & pooling.",
      desc: "Sub-2 minute driver arrival, ride-pooling to save up to 40%, and fixed outstation quotes.",
      badge: "🚕 SUB-2 MIN PICKUP",
      color: "#3977FF",
      bgTint: "#F0F5FF",
      borderTint: "#CCE0FF",
      route: "/taxi/user",
      cta: "Book Ride",
      image: taxi3dImg,
      benefits: ["Sub-2 min driver arrival", "Save up to 40% pooling", "24/7 SOS safety shield"],
    },
    {
      id: "grocery",
      title: "EqosyGrocery",
      subtitle: "Farm-fresh daily essentials.",
      desc: "Organic fruits, vegetables, dairy milk, and daily snacks delivered in 15 minutes.",
      badge: "🛒 15M EXPRESS",
      color: "#18B981",
      bgTint: "#F0FDF8",
      borderTint: "#CCF5E5",
      route: "/food",
      cta: "Shop Grocery",
      image: grocery3dImg,
      benefits: ["Express 15m delivery", "Farm fresh guarantee", "Zero minimum order"],
    },
    {
      id: "parcel",
      title: "EqosyParcel",
      subtitle: "Citywide package handover.",
      desc: "Send documents, keys, gifts, and packages securely with 4-digit OTP verification.",
      badge: "📦 SECURE OTP",
      color: "#7657E8",
      bgTint: "#F6F3FF",
      borderTint: "#E0D6FF",
      route: "/taxi/user",
      cta: "Send Parcel",
      image: gifts3dImg,
      benefits: ["Doorstep pickup in mins", "4-digit OTP handover", "Live real-time tracking"],
    },
  ];

  /* ── Variants ─────────────────────────────────────────────────────────── */

  // Section-level entrance (the whole section slides up from 60px)
  const sectionVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : 60 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
    },
  };

  // Badge
  const badgeVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : 15, scale: reduced ? 1 : 0.96 },
    visible: {
      opacity: 1, y: 0, scale: 1,
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
    },
  };

  // Heading
  const headingVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : 25 },
    visible: {
      opacity: 1, y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.12 },
    },
  };

  // Description
  const descVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : 15 },
    visible: {
      opacity: 1, y: 0,
      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 },
    },
  };

  // Cards grid — stagger container
  const gridVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduced ? 0 : 0.13,
        delayChildren: 0.44,
      },
    },
  };

  // Individual card
  const cardVariants = {
    hidden: { opacity: 0, y: reduced ? 0 : 35, scale: reduced ? 1 : 0.97 },
    visible: {
      opacity: 1, y: 0, scale: 1,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <motion.section
      id="ecosystem"
      className="w-full bg-[#FFFFFF] border-b border-[#E5E7EB] relative z-10 overflow-hidden"
      style={{
        // Overlap: desktop ~80px, keeps content readable via extra top padding
        marginTop: "clamp(-30px, -5vw, -80px)",
        borderRadius: "24px 24px 0 0",
        paddingTop: "clamp(80px, 8vw, 120px)",
        paddingBottom: "80px",
        boxShadow: "0 -4px 32px rgba(0,0,0,0.06), 0 -1px 0 rgba(0,0,0,0.03)",
      }}
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <motion.span
            variants={badgeVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            className="text-xs font-bold uppercase tracking-wider text-[#667085] bg-[#F7F5F0] px-3.5 py-1 rounded-full border border-[#E5E7EB] inline-block mb-3"
          >
            FOUR CORE SERVICES
          </motion.span>

          <motion.h2
            variants={headingVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#172033] tracking-tight"
          >
            Everything your city needs,{" "}
            <br className="hidden sm:inline" />
            in one simple account.
          </motion.h2>

          <motion.p
            variants={descVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            className="mt-3 text-base text-[#667085] font-medium leading-relaxed"
          >
            Food, rides, groceries and parcels — connected through one seamless experience.
          </motion.p>
        </div>

        {/* ── Staggered service cards ──────────────────────────────── */}
        <motion.div
          className="grid gap-8 md:grid-cols-2"
          variants={gridVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
        >
          {verticals.map((v) => (
            <ServiceCard
              key={v.id}
              v={v}
              cardVariants={cardVariants}
              reduced={reduced}
              navigate={navigate}
            />
          ))}
        </motion.div>

      </div>
    </motion.section>
  );
}



/* ==========================================================================
   3. UNIFIED APP & PHONE MOCKUP — bg: #1E2A3A (Deep Navy — DARK section)
   ========================================================================== */
export function CityScene() {
  const pillars = [
    {
      title: "Single Unified Wallet",
      desc: "Earn cashbacks on taxi rides and use them directly for dinner or groceries.",
      icon: Wallet,
      color: "#FF6B1A",
      bg: "rgba(255,107,26,0.15)",
    },
    {
      title: "Live GPS Fleet Tracking",
      desc: "Watch your food arriving hot or your cab navigating with sub-second accuracy.",
      icon: MapPin,
      color: "#60A5FA",
      bg: "rgba(96,165,250,0.15)",
    },
    {
      title: "Ride Pooling",
      desc: "Share empty seats with commuters along your route and cut travel costs by 40%.",
      icon: Users,
      color: "#A78BFA",
      bg: "rgba(167,139,250,0.15)",
    },
    {
      title: "Verified Partners",
      desc: "Background-checked cab drivers and FSSAI certified restaurants for total trust.",
      icon: ShieldCheck,
      color: "#34D399",
      bg: "rgba(52,211,153,0.15)",
    },
  ];

  return (
    <section className="w-full bg-[#1A2332] py-20 border-b border-[#2D3748]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Left Feature Cards */}
          <RevealSection>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider px-3.5 py-1 rounded-full bg-white/10 text-[#60A5FA] border border-white/10 inline-block mb-3">
                INTELLIGENT SUPER APP
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                One account for your entire daily routine.
              </h2>
              <p className="mt-3 text-base text-[#94A3B8] font-medium leading-relaxed">
                No need to switch between four separate apps. Eqosy keeps your experience connected in one place.
              </p>

              <div className="mt-8 grid sm:grid-cols-2 gap-4">
                {pillars.map((p, i) => (
                  <RevealSection key={p.title} delay={i * 80}>
                    <div
                      className="p-5 rounded-2xl border border-white/10"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <div
                        className="size-10 rounded-xl flex items-center justify-center mb-3"
                        style={{ backgroundColor: p.bg, color: p.color }}
                      >
                        <p.icon size={20} />
                      </div>
                      <h4 className="text-sm font-bold text-white">{p.title}</h4>
                      <p className="text-xs text-[#94A3B8] font-medium mt-1 leading-relaxed">{p.desc}</p>
                    </div>
                  </RevealSection>
                ))}
              </div>
            </div>
          </RevealSection>

          {/* Right Video & Device Showcase Section */}
          <RevealSection delay={200}>
            <div className="relative p-4 sm:p-6 text-center flex flex-col items-center justify-center rounded-3xl border border-white/10 overflow-hidden"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              <div className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-[#0F172A] shadow-md">
                <video
                  src={groceryFoodVideo}
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls={false}
                  className="w-full h-[240px] sm:h-[300px] object-cover block select-none"
                />
                <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 text-white backdrop-blur-md text-[10px] font-bold tracking-wider uppercase border border-white/20 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-[#34D399] animate-pulse" />
                  <span>Food & Grocery Dark Stores</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between w-full p-3.5 rounded-xl border border-white/10"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <div className="text-left">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#60A5FA]">
                    Unified Multi-Module Canvas
                  </p>
                  <p className="text-sm font-bold text-white">
                    Switch instantly between food, cabs & groceries
                  </p>
                </div>
                <span className="size-2.5 rounded-full bg-[#34D399] animate-pulse shrink-0" />
              </div>
            </div>
          </RevealSection>

        </div>

      </div>
    </section>
  );
}

/* ==========================================================================
   4. PARTNER SECTION — bg: #F7F5F0 (Warm Ivory — LIGHT section)
   ========================================================================== */
export function Partners() {
  const navigate = useNavigate();

  return (
    <section id="partners" className="w-full bg-[#F7F5F0] py-20 border-b border-[#E5E7EB]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        <RevealSection className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider px-3.5 py-1 rounded-full bg-white text-[#667085] border border-[#E5E7EB] inline-block mb-3 shadow-xs">
            JOIN EQOSY
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#172033] tracking-tight">
            Be part of Eqosy's city network
          </h2>
          <p className="mt-2 text-sm text-[#667085] font-medium">
            Choose your path — whether you deliver, drive, cook, or sell.
          </p>
        </RevealSection>

        <div className="grid md:grid-cols-2 gap-8">

          {/* ── CARD 1: DRIVERS ─────────────────────────────────────────── */}
          <RevealSection delay={0}>
            <div className="warm-card overflow-hidden h-full flex flex-col" style={{ backgroundColor: "#FAFCFF" }}>
              {/* Card Header */}
              <div className="px-8 pt-8 pb-5">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#EEF3FF] text-[#3977FF] border border-[#C7D9FF]">
                  🚗 Drive & Deliver
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#172033] mt-4">
                  Earn on your schedule
                </h3>
                <p className="text-sm text-[#667085] font-medium mt-2 leading-relaxed">
                  Two ways to earn with Eqosy — city cab rides or package & food deliveries. Pick what suits you.
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-[#E5E7EB] mx-8" />

              {/* Two sub-options */}
              <div className="flex flex-col sm:flex-row flex-1">

                {/* Option A: Taxi Driver */}
                <div className="flex-1 px-7 py-6 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-[#E5E7EB]">
                  <div>
                    <div className="size-11 rounded-2xl bg-[#EEF3FF] flex items-center justify-center text-xl mb-3">
                      🚕
                    </div>
                    <h4 className="text-base font-extrabold text-[#172033]">Taxi Driver</h4>
                    <p className="text-xs text-[#667085] font-medium mt-1.5 leading-relaxed">
                      City cab, ride-pooling & outstation trips. Sub-2 min dispatch, daily payouts.
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {["Car, Auto or Bike", "Daily bank settlements", "24/7 driver support"].map(b => (
                        <li key={b} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#172033]">
                          <CheckCircle2 size={12} className="text-[#3977FF] shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/taxi/driver/welcome")}
                    className="mt-5 w-full px-4 py-2.5 rounded-xl bg-[#3977FF] hover:bg-[#2563EB] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    Register as Taxi Driver
                    <ArrowRight size={13} />
                  </button>
                </div>

                {/* Option B: Delivery Driver */}
                <div className="flex-1 px-7 py-6 flex flex-col justify-between">
                  <div>
                    <div className="size-11 rounded-2xl bg-[#F0FDF8] flex items-center justify-center text-xl mb-3">
                      🛵
                    </div>
                    <h4 className="text-base font-extrabold text-[#172033]">Delivery Partner</h4>
                    <p className="text-xs text-[#667085] font-medium mt-1.5 leading-relaxed">
                      Deliver food, groceries & parcels on your bike or scooter. Flexible shifts.
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {["Bike or Scooter", "Per-order earnings", "Instant weekly payouts"].map(b => (
                        <li key={b} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#172033]">
                          <CheckCircle2 size={12} className="text-[#18B981] shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/taxi/driver/welcome")}
                    className="mt-5 w-full px-4 py-2.5 rounded-xl bg-[#18B981] hover:bg-[#10A372] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    Register as Delivery Partner
                    <ArrowRight size={13} />
                  </button>
                </div>

              </div>
            </div>
          </RevealSection>

          {/* ── CARD 2: BUSINESSES ──────────────────────────────────────── */}
          <RevealSection delay={120}>
            <div className="warm-card overflow-hidden h-full flex flex-col" style={{ backgroundColor: "#FFFDFB" }}>
              {/* Card Header */}
              <div className="px-8 pt-8 pb-5">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#FFF5EF] text-[#FF6B1A] border border-[#FFE0CC]">
                  🏪 Merchants & Stores
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#172033] mt-4">
                  Grow your business with Eqosy
                </h3>
                <p className="text-sm text-[#667085] font-medium mt-2 leading-relaxed">
                  List your restaurant or grocery store and reach thousands of customers across Madhya Pradesh.
                </p>
              </div>

              {/* Divider */}
              <div className="border-t border-[#E5E7EB] mx-8" />

              {/* Two sub-options */}
              <div className="flex flex-col sm:flex-row flex-1">

                {/* Option A: Restaurant */}
                <div className="flex-1 px-7 py-6 flex flex-col justify-between border-b sm:border-b-0 sm:border-r border-[#E5E7EB]">
                  <div>
                    <div className="size-11 rounded-2xl bg-[#FFF5EF] flex items-center justify-center text-xl mb-3">
                      🍽️
                    </div>
                    <h4 className="text-base font-extrabold text-[#172033]">Restaurant</h4>
                    <p className="text-xs text-[#667085] font-medium mt-1.5 leading-relaxed">
                      Cloud kitchen or dine-in? List your menu, get orders, and track earnings live.
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {["Digital menu in minutes", "FSSAI compliant dashboard", "Weekly auto-settlements"].map(b => (
                        <li key={b} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#172033]">
                          <CheckCircle2 size={12} className="text-[#FF6B1A] shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/food/partner")}
                    className="mt-5 w-full px-4 py-2.5 rounded-xl bg-[#FF6B1A] hover:bg-[#E5580C] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    Register Restaurant
                    <ArrowRight size={13} />
                  </button>
                </div>

                {/* Option B: Grocery Mart */}
                <div className="flex-1 px-7 py-6 flex flex-col justify-between">
                  <div>
                    <div className="size-11 rounded-2xl bg-[#F0FDF8] flex items-center justify-center text-xl mb-3">
                      🛒
                    </div>
                    <h4 className="text-base font-extrabold text-[#172033]">Grocery Mart</h4>
                    <p className="text-xs text-[#667085] font-medium mt-1.5 leading-relaxed">
                      Kirana stores & supermarkets — list your inventory for 15-min express delivery.
                    </p>
                    <ul className="mt-3 space-y-1.5">
                      {["Easy inventory upload", "Hyperlocal 15m delivery", "Real-time stock sync"].map(b => (
                        <li key={b} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#172033]">
                          <CheckCircle2 size={12} className="text-[#7657E8] shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/food/partner")}
                    className="mt-5 w-full px-4 py-2.5 rounded-xl bg-[#7657E8] hover:bg-[#6244D0] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    Register Grocery Mart
                    <ArrowRight size={13} />
                  </button>
                </div>

              </div>
            </div>
          </RevealSection>

        </div>

      </div>
    </section>
  );
}


/* ==========================================================================
   5. FAQ SECTION — bg: #0F172A (Deep Charcoal-Blue — DARK section)
   ========================================================================== */
export function Faq() {
  const [openIdx, setOpenIdx] = useState(0);

  const faqs = [
    {
      q: "How does the single Eqosy unified wallet work?",
      a: "With Eqosy, you only create one account. Your single wallet balance, saved addresses, and payment methods apply across food orders, taxi rides, grocery shopping, and parcel deliveries.",
    },
    {
      q: "How fast is Eqosy Food delivery and grocery dispatch?",
      a: "Hyperlocal dark stores and restaurant partners ensure most food deliveries arrive in 15 to 25 minutes, and express groceries in 15 minutes flat.",
    },
    {
      q: "Can I book outstation cabs and schedule intercity trips?",
      a: "Yes! Eqosy provides fixed-quote outstation rides, pilgrimage routes (such as Ujjain Mahakal & Omkareshwar circuits), and ride-pooling across cities.",
    },
    {
      q: "What safety features are available during taxi rides?",
      a: "All drivers are background-checked. Every ride includes live GPS link sharing with family, 24/7 in-app emergency SOS, and 24/7 safety command center.",
    },
  ];

  return (
    <section id="faq" className="w-full bg-[#0F172A] py-20 border-b border-[#1E293B]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">

        <RevealSection className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-wider px-3.5 py-1 rounded-full bg-white/10 text-[#94A3B8] border border-white/10 inline-block mb-3">
            HELP & SUPPORT
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Frequently Asked Questions
          </h2>
        </RevealSection>

        <div className="space-y-3">
          {faqs.map((f, i) => {
            const isOpen = openIdx === i;
            return (
              <RevealSection key={f.q} delay={i * 80}>
                <div className="overflow-hidden rounded-2xl border border-white/10 transition-all">
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? -1 : i)}
                    className="w-full p-5 text-left flex items-center justify-between font-bold text-white text-sm sm:text-base cursor-pointer"
                    style={{ background: isOpen ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)" }}
                  >
                    <span>{f.q}</span>
                    <ChevronDown
                      size={18}
                      className={`text-[#94A3B8] transition-transform shrink-0 ml-4 ${isOpen ? "rotate-180 text-[#60A5FA]" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="p-5 text-xs sm:text-sm text-[#94A3B8] font-medium leading-relaxed border-t border-white/10"
                      style={{ background: "rgba(255,255,255,0.02)" }}
                    >
                      {f.a}
                    </div>
                  )}
                </div>
              </RevealSection>
            );
          })}
        </div>

      </div>
    </section>
  );
}

/* ==========================================================================
   6. APP DOWNLOAD CTA — bg: #FF6B1A (Brand Orange — ACCENT section)
   ========================================================================== */
export function Newsletter() {
  const navigate = useNavigate();

  return (
    <section id="get" className="w-full bg-[#F7F5F0] py-20 px-4 sm:px-6 lg:px-8 border-b border-[#E5E7EB]">
      <RevealSection>
        <div className="mx-auto max-w-6xl rounded-[32px] bg-gradient-to-br from-[#FF6B1A] via-[#FF7E33] to-[#E55A0C] text-white p-8 sm:p-14 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-10 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-56 h-56 rounded-full bg-black/10 blur-2xl" />
          </div>

          <div className="relative z-10">
            <span className="text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/20 text-white border border-white/30">
              DOWNLOAD EQOSY SUPER APP
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mt-4 leading-tight">
              Your city, one tap away.
            </h2>
            <p className="text-sm sm:text-base text-white/90 font-medium mt-3 max-w-lg leading-relaxed">
              Food, rides, groceries and parcel delivery — all in one app. Available on Android & iOS.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={() => window.open("https://play.google.com", "_blank")}
                className="px-6 py-3 rounded-xl bg-white text-[#172033] font-bold text-xs sm:text-sm shadow-sm hover:bg-slate-50 transition-all cursor-pointer"
              >
                Google Play
              </button>
              <button
                type="button"
                onClick={() => window.open("https://apple.com", "_blank")}
                className="px-6 py-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm border border-white/30 transition-colors cursor-pointer"
              >
                Apple App Store
              </button>
              <button
                type="button"
                onClick={() => navigate("/taxi/user/login")}
                className="px-6 py-3 rounded-xl bg-black/25 hover:bg-black/35 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Launch Web App →
              </button>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white text-[#172033] text-center shrink-0 shadow-lg relative z-10">
            <QrCode size={120} className="mx-auto text-[#172033]" />
            <p className="text-xs font-bold text-[#172033] mt-3">Scan to Download</p>
            <span className="text-[10px] font-bold text-[#FF6B1A]">eqosy.app</span>
          </div>
        </div>
      </RevealSection>
    </section>
  );
}

/* ==========================================================================
   7. SITE FOOTER — bg: #172033 (Deep Charcoal)
   ========================================================================== */
export function SiteFooter() {
  return (
    <footer className="w-full bg-[#172033] text-white pt-16 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5 pb-12 border-b border-white/10">

          {/* Logo Col */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src="/eqosy-logo.png"
                alt="Eqosy Logo"
                className="h-8 sm:h-9 w-auto object-contain"
              />
              <span className="font-display text-2xl sm:text-3xl font-black tracking-tight inline-flex items-center">
                <span className="text-[#74D000]">E</span>
                <span className="text-[#FF6000]">q</span>
                <span className="text-white">osy</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#FF6B1A] text-white">
                Super App
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#98A2B3] font-medium leading-relaxed max-w-sm">
              India's leading unified super app for restaurant food delivery, instant cab mobility, 15-minute groceries, and package courier.
            </p>
            <p className="text-xs font-bold text-[#18B981] pt-2">
              🟢 All Systems Live & Operational
            </p>
          </div>

          {/* Verticals */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Services</h4>
            <ul className="mt-4 space-y-2.5 text-xs sm:text-sm text-[#98A2B3] font-medium">
              <li><Link to="/food" className="hover:text-white transition-colors">EqosyFood Delivery</Link></li>
              <li><Link to="/taxi/user" className="hover:text-white transition-colors">EqosyTaxi & Cabs</Link></li>
              <li><Link to="/food" className="hover:text-white transition-colors">EqosyGrocery 15m</Link></li>
              <li><Link to="/taxi/user" className="hover:text-white transition-colors">EqosyParcel Courier</Link></li>
              <li><Link to="/taxi/user" className="hover:text-white transition-colors">Ride Pooling</Link></li>
              <li><Link to="/taxi/user" className="hover:text-white transition-colors">Outstation Cabs</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Company</h4>
            <ul className="mt-4 space-y-2.5 text-xs sm:text-sm text-[#98A2B3] font-medium">
              <li><Link to="/taxi/about" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link to="/taxi/services" className="hover:text-white transition-colors">All Services</Link></li>
              <li><Link to="/taxi/contact" className="hover:text-white transition-colors">Contact & Support</Link></li>
              <li><Link to="/taxi/faq" className="hover:text-white transition-colors">Help & FAQs</Link></li>
              <li><Link to="/taxi/driver/welcome" className="hover:text-white transition-colors">Partner Portal</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Legal</h4>
            <ul className="mt-4 space-y-2.5 text-xs sm:text-sm text-[#98A2B3] font-medium">
              <li><Link to="/taxi/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link to="/taxi/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/taxi/refund" className="hover:text-white transition-colors">Refund Policy</Link></li>
              <li><Link to="/taxi/cancellation" className="hover:text-white transition-colors">Cancellation Rules</Link></li>
            </ul>
          </div>

        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#98A2B3] font-medium">
          <p>© {new Date().getFullYear()} Eqosy Technologies Inc. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/taxi/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/taxi/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/taxi/contact" className="hover:text-white transition-colors">Support</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
