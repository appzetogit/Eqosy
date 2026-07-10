import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, ChevronDown, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useLocationSelector } from "@food/components/user/UserLayout";
import { useProfile } from "@food/context/ProfileContext";
import notAvailableImg from "@food/assets/not-available.webp";

export default function OutOfServiceView() {
  const { openLocationSelector } = useLocationSelector();
  const profileContext = useProfile() || {};
  const { getDefaultAddress, userProfile } = profileContext;

  const defaultSavedAddress = getDefaultAddress?.() || null;
  const deliveryAddressMode = localStorage.getItem("deliveryAddressMode") || "saved";
  const [showToast, setShowToast] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowToast(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const savedLocationCache = useMemo(() => {
    try {
      const raw = localStorage.getItem("userLocation");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const locationTitle = useMemo(() => {
    if (deliveryAddressMode === "saved" && defaultSavedAddress) {
      return defaultSavedAddress.label || "Home";
    }
    return savedLocationCache?.city || "Select Location";
  }, [deliveryAddressMode, defaultSavedAddress, savedLocationCache]);

  const locationSubtitle = useMemo(() => {
    if (deliveryAddressMode === "saved" && defaultSavedAddress) {
      return defaultSavedAddress.street || defaultSavedAddress.formattedAddress || "";
    }
    return savedLocationCache?.formattedAddress || savedLocationCache?.area || "";
  }, [deliveryAddressMode, defaultSavedAddress, savedLocationCache]);

  const userInitial = useMemo(() => {
    if (userProfile?.name) {
      return String(userProfile.name).charAt(0).toUpperCase();
    }
    return "U";
  }, [userProfile]);

  useEffect(() => {
    // Disable body scroll when OutOfServiceView is mounted (full screen)
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen z-[9999] flex flex-col items-center justify-center px-4 select-none">
      {/* Full-screen Background Image */}
      <div className="absolute inset-0 z-0">
        <img
          src={notAvailableImg}
          alt="Not available background"
          className="w-full h-full object-cover"
          loading="eager"
        />
        {/* Soft dark overlay to guarantee text legibility */}
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
      </div>

      {/* Top Header */}
      <div className="absolute top-0 inset-x-0 z-20 px-4 py-4 flex items-center justify-between gap-3 bg-transparent">
        {/* Left: Location Pin + Location info */}
        <button
          type="button"
          className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
          onClick={openLocationSelector}
        >
          <MapPin className="h-6 w-6 text-white flex-shrink-0" strokeWidth={2} />
          <div className="flex flex-col min-w-0 text-white">
            <div className="flex items-center gap-0.5">
              <span className="text-[16px] font-bold truncate drop-shadow-md">
                {locationTitle}
              </span>
              <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-90" />
            </div>
            {locationSubtitle ? (
              <span className="text-[12px] font-medium truncate opacity-85 drop-shadow-sm max-w-[240px]">
                {locationSubtitle}
              </span>
            ) : null}
          </div>
        </button>

        {/* Right Action Icons */}
        <div className="flex items-center gap-3.5 flex-shrink-0">
          <Link to="/food/user/wallet" className="flex items-center justify-center h-9 w-9 rounded-full hover:bg-white/10 active:scale-95 transition-all">
            <Wallet className="h-5.5 w-5.5 text-white" strokeWidth={2} />
          </Link>
          <Link to="/food/user/profile" className="flex items-center justify-center">
            <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-[#dc2626] text-sm font-extrabold shadow-sm border border-white/20 hover:opacity-90 active:scale-95 transition-all">
              {userInitial}
            </div>
          </Link>
        </div>
      </div>

      {/* Top Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -80 }}
            transition={{ type: "spring", stiffness: 120, damping: 14 }}
            onClick={openLocationSelector}
            className="absolute top-4 left-4 right-4 mx-auto max-w-sm bg-white dark:bg-[#181818] rounded-[24px] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.2)] flex items-center gap-3.5 border border-gray-100 dark:border-gray-800 z-50 cursor-pointer hover:scale-[1.01] transition-transform select-none"
          >
            <div className="h-12 w-12 rounded-2xl overflow-hidden flex items-center justify-center flex-shrink-0">
              <img
                src="/eqosy-logo.png"
                alt="Eqosy Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[14px] font-bold text-gray-900 dark:text-white leading-tight">
                Restaurants are unavailable here right now.
              </span>
              <span className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">
                Please choose a different location
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Central Announcement Text */}
      <div className="relative z-10 text-center px-6 mt-16 max-w-md">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight drop-shadow-md">
          We'll be there soon – hang tight!
        </h2>
        <p className="text-[15px] md:text-[17px] text-gray-200 mt-4 leading-relaxed max-w-xs mx-auto drop-shadow-sm">
          Looks like online ordering isn't available at your location yet.
        </p>
      </div>

      {/* Semi-transparent Branding Logo */}
      <div className="absolute bottom-10 left-6 z-10 select-none opacity-20 pointer-events-none">
        <span className="text-[32px] font-black text-white tracking-tighter uppercase">
          Eqosy
        </span>
      </div>
    </div>
  );
}
