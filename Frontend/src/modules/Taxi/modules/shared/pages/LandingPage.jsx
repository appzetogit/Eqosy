import React, { useState } from "react";
import { useNavigate } from "react-router-dom";


import Hero from "./components/Hero";
import {
  Stats,
  Showcase,
  CityScene,
  Partners,
  Faq,
  SiteFooter,
} from "./components/Sections";
import "./LandingPage.css";

export default function LandingPage() {
  const navigate = useNavigate();

  const handleScroll = (id) => (e) => {
    e.preventDefault();
    const el = document.querySelector(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="landing-root min-h-screen w-full bg-[#F7F5F0] text-[#172033] selection:bg-[#FF6B1A] selection:text-white">

      {/* ── STICKY NAVBAR (always on top) ── */}
      <header className="fixed inset-x-0 top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB] shadow-xs transition-all duration-200">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5">

          {/* Left: Brand Logo + Brand Name + SUPER APP badge */}
          <div className="flex items-center">
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <img
                src="/eqosy-logo.png"
                alt="Eqosy Logo"
                className="h-8 sm:h-9 w-auto object-contain"
              />
              <span className="font-display text-2xl sm:text-3xl font-black tracking-tight inline-flex items-center">
                <span className="text-[#74D000]">E</span>
                <span className="text-[#FF6000]">q</span>
                <span className="text-[#1E2A38]">osy</span>
              </span>
              <span className="hidden sm:inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#FFF5EF] text-[#FF6B1A] border border-[#FFE0CC]">
                SUPER APP
              </span>
            </div>
          </div>

          {/* Center Navigation Links */}
          <div className="hidden md:flex items-center gap-8 text-xs font-bold uppercase tracking-wider text-[#667085]">
            <a href="#ecosystem" onClick={handleScroll("#ecosystem")} className="hover:text-[#FF6B1A] transition-colors">
              OFFERS
            </a>
            <a href="#partners" onClick={handleScroll("#partners")} className="hover:text-[#18B981] transition-colors">
              PARTNER WITH US
            </a>
            <a href="#faq" onClick={handleScroll("#faq")} className="hover:text-[#172033] transition-colors">
              HELP & FAQ
            </a>
          </div>

          {/* Right: Get App CTA only */}
          <div className="flex items-center gap-3">
            <a
              href="#get"
              onClick={handleScroll("#get")}
              className="rounded-xl bg-[#FF6B1A] hover:bg-[#E5580C] px-5 py-2 text-xs font-bold text-white shadow-sm transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            >
              Get App
            </a>
          </div>
        </nav>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          STACKED CARD SCROLL
          Each section is wrapped in a sticky container with increasing z-index.
          As the user scrolls, each new section rises from below and slides
          over the previous one — exactly like k9bharat.com's effect.
          The .stack-card class adds rounded-top corners + top shadow.
      ══════════════════════════════════════════════════════════════════════ */}

      {/* LAYER 1 — Hero (base, no card rounding needed) */}
      <div className="stack-layer" style={{ zIndex: 1 }}>
        <Hero />
      </div>

      {/* LAYER 2 — Trending Near You */}
      <div className="stack-layer stack-card" style={{ zIndex: 2 }}>
        <Stats />
      </div>

      {/* LAYER 3 — Four Core Services */}
      <div className="stack-layer stack-card" style={{ zIndex: 3 }}>
        <Showcase />
      </div>

      {/* LAYER 4 — Unified App / CityScene (dark) */}
      <div className="stack-layer stack-card" style={{ zIndex: 4 }}>
        <CityScene />
      </div>

      {/* LAYER 5 — Partner / Join Section */}
      <div className="stack-layer stack-card" style={{ zIndex: 5 }}>
        <Partners />
      </div>

      {/* LAYER 6 — FAQ (dark) */}
      <div className="stack-layer stack-card" style={{ zIndex: 6 }}>
        <Faq />
      </div>

      {/* FOOTER — sits below all sticky layers, normal flow */}
      <div style={{ position: "relative", zIndex: 7 }}>
        <SiteFooter />
      </div>

    </div>
  );
}
