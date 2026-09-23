import React from 'react';

// Lightweight skeleton base element
export function SkeletonPulse({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 dark:bg-slate-800/80 rounded-xl ${className}`}
    />
  );
}

/**
 * 🚖 Taxi App Skeleton
 * Matches the Taxi home screen layout: Top header, Live Map / Destination Card, Vehicle Type Chips, Recent Places
 */
export function TaxiAppSkeleton() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto relative overflow-hidden select-none">
      {/* Background map grid effect */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <SkeletonPulse className="w-10 h-10 rounded-full !bg-slate-800" />
          <div className="space-y-1.5">
            <SkeletonPulse className="w-24 h-4 !bg-slate-800" />
            <SkeletonPulse className="w-16 h-3 !bg-slate-800/60" />
          </div>
        </div>
        <SkeletonPulse className="w-10 h-10 rounded-full !bg-slate-800" />
      </div>

      {/* Hero Destination Box */}
      <div className="relative z-10 bg-slate-800/90 backdrop-blur-md border border-slate-700/60 rounded-3xl p-5 shadow-2xl space-y-4 my-auto">
        <div className="flex items-center justify-between mb-1">
          <SkeletonPulse className="w-28 h-5 !bg-slate-700" />
          <SkeletonPulse className="w-14 h-4 rounded-full !bg-amber-500/30" />
        </div>

        {/* Pickup Input */}
        <div className="flex items-center gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-700/40">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
          <SkeletonPulse className="w-3/4 h-4 !bg-slate-700" />
        </div>

        {/* Drop Input */}
        <div className="flex items-center gap-3 bg-slate-900/80 p-3.5 rounded-2xl border border-slate-700/40">
          <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
          <SkeletonPulse className="w-4/5 h-4 !bg-slate-700" />
        </div>

        {/* Ride Option Pills */}
        <div className="grid grid-cols-4 gap-2 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-2.5 bg-slate-900/50 rounded-2xl border border-slate-700/30">
              <SkeletonPulse className="w-8 h-8 rounded-xl !bg-slate-700" />
              <SkeletonPulse className="w-10 h-3 !bg-slate-700" />
            </div>
          ))}
        </div>

        {/* Search Button */}
        <SkeletonPulse className="w-full h-12 rounded-2xl !bg-amber-500/80 mt-2" />
      </div>

      {/* Bottom Nav */}
      <div className="relative z-10 flex items-center justify-around bg-slate-800/90 border border-slate-700/50 p-3 rounded-3xl mt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonPulse key={i} className="w-10 h-10 rounded-2xl !bg-slate-700" />
        ))}
      </div>
    </div>
  );
}

/**
 * 🛵 Delivery Partner App Skeleton
 * Matches Delivery Partner layout: Top status bar, Duty toggle, Today stats, Pending Gigs / Orders
 */
export function DeliveryAppSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 max-w-md mx-auto space-y-4 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-white border border-slate-200/80 p-4 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <SkeletonPulse className="w-12 h-12 rounded-2xl !bg-slate-200" />
          <div className="space-y-2">
            <SkeletonPulse className="w-28 h-4 !bg-slate-200" />
            <SkeletonPulse className="w-20 h-3 !bg-emerald-500/20" />
          </div>
        </div>
        <SkeletonPulse className="w-16 h-8 rounded-full !bg-emerald-500/20" />
      </div>

      {/* Duty Earnings Summary Card */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-3xl space-y-4 shadow-md">
        <div className="flex justify-between items-center">
          <SkeletonPulse className="w-24 h-4 !bg-white/30" />
          <SkeletonPulse className="w-16 h-4 !bg-white/30" />
        </div>
        <SkeletonPulse className="w-36 h-9 !bg-white/40 rounded-xl" />
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/20">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5 text-center">
              <SkeletonPulse className="w-12 h-3 mx-auto !bg-white/30" />
              <SkeletonPulse className="w-14 h-4 mx-auto !bg-white/40" />
            </div>
          ))}
        </div>
      </div>

      {/* Orders List Header */}
      <div className="flex justify-between items-center px-1">
        <SkeletonPulse className="w-32 h-5 !bg-slate-200" />
        <SkeletonPulse className="w-12 h-4 !bg-slate-200" />
      </div>

      {/* Order Cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200/80 p-4 rounded-2xl space-y-3 shadow-sm">
            <div className="flex justify-between items-center">
              <SkeletonPulse className="w-24 h-4 !bg-slate-200" />
              <SkeletonPulse className="w-16 h-6 rounded-full !bg-amber-500/20" />
            </div>
            <SkeletonPulse className="w-full h-3 !bg-slate-200" />
            <SkeletonPulse className="w-3/4 h-3 !bg-slate-200" />
            <div className="flex justify-between items-center pt-2">
              <SkeletonPulse className="w-20 h-5 !bg-slate-200" />
              <SkeletonPulse className="w-24 h-8 rounded-xl !bg-emerald-500/20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 👨‍🍳 Restaurant Panel Skeleton
 * Matches Restaurant Dashboard layout: Top Header, Status filter tabs, Orders grid/list
 */
export function RestaurantAppSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 max-w-4xl mx-auto space-y-4 select-none">
      {/* Top Navbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <SkeletonPulse className="w-10 h-10 rounded-xl" />
          <div className="space-y-1.5">
            <SkeletonPulse className="w-36 h-4" />
            <SkeletonPulse className="w-24 h-3" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonPulse className="w-20 h-8 rounded-full" />
          <SkeletonPulse className="w-9 h-9 rounded-xl" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-hidden py-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonPulse key={i} className={`h-9 rounded-full shrink-0 ${i === 0 ? 'w-20 !bg-orange-500/30' : 'w-24'}`} />
        ))}
      </div>

      {/* Order Cards */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-3 shadow-sm">
            <div className="flex justify-between items-start">
              <div className="space-y-1.5">
                <SkeletonPulse className="w-28 h-5" />
                <SkeletonPulse className="w-20 h-3" />
              </div>
              <SkeletonPulse className="w-24 h-7 rounded-full" />
            </div>
            <div className="py-2 border-y border-slate-100 dark:border-slate-800 space-y-2">
              <SkeletonPulse className="w-full h-4" />
              <SkeletonPulse className="w-2/3 h-4" />
            </div>
            <div className="flex justify-between items-center pt-1">
              <SkeletonPulse className="w-20 h-4" />
              <div className="flex gap-2">
                <SkeletonPulse className="w-24 h-9 rounded-xl" />
                <SkeletonPulse className="w-24 h-9 rounded-xl !bg-orange-500/30" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 👑 Admin App Skeleton
 * Matches Admin Dashboard: Navbar, 4 Stat summary cards, Table view
 */
export function AdminAppSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-6 space-y-6 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="space-y-2">
          <SkeletonPulse className="w-48 h-6 !bg-slate-200" />
          <SkeletonPulse className="w-32 h-3 !bg-slate-200" />
        </div>
        <div className="flex items-center gap-3">
          <SkeletonPulse className="w-40 h-10 rounded-xl !bg-slate-200" />
          <SkeletonPulse className="w-10 h-10 rounded-full !bg-slate-200" />
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 shadow-sm p-5 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <SkeletonPulse className="w-24 h-4 !bg-slate-200" />
              <SkeletonPulse className="w-8 h-8 rounded-xl !bg-slate-200" />
            </div>
            <SkeletonPulse className="w-32 h-7 !bg-slate-300" />
            <SkeletonPulse className="w-20 h-3 !bg-emerald-500/20" />
          </div>
        ))}
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden space-y-3 p-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-200">
          <SkeletonPulse className="w-36 h-5 !bg-slate-200" />
          <SkeletonPulse className="w-28 h-8 rounded-xl !bg-slate-200" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center py-2.5 border-b border-slate-100">
            <SkeletonPulse className="w-1/4 h-4 !bg-slate-200" />
            <SkeletonPulse className="w-1/5 h-4 !bg-slate-200" />
            <SkeletonPulse className="w-1/6 h-4 !bg-slate-200" />
            <SkeletonPulse className="w-16 h-6 rounded-full !bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 🔐 Auth App Skeleton
 * Sleek login/signup card container
 */
export function AuthAppSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl space-y-6 shadow-2xl">
        <div className="text-center space-y-3">
          <SkeletonPulse className="w-16 h-16 rounded-2xl mx-auto !bg-slate-800" />
          <SkeletonPulse className="w-40 h-6 mx-auto !bg-slate-800" />
          <SkeletonPulse className="w-56 h-4 mx-auto !bg-slate-800/60" />
        </div>
        <div className="space-y-4 pt-2">
          <SkeletonPulse className="w-full h-12 rounded-2xl !bg-slate-800" />
          <SkeletonPulse className="w-full h-12 rounded-2xl !bg-slate-800" />
          <SkeletonPulse className="w-full h-12 rounded-2xl !bg-orange-500/50 mt-4" />
        </div>
      </div>
    </div>
  );
}
