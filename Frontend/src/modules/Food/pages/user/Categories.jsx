import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, Grid2x2, ShoppingBasket } from "lucide-react";
import { motion } from "framer-motion";
import { adminAPI } from "@food/api";
import { foodImages } from "@food/constants/images";
import OptimizedImage from "@food/components/OptimizedImage";
import { useProfile } from "@food/context/ProfileContext";
import { useLocation } from "@food/hooks/useLocation";
import { useZone } from "@food/hooks/useZone";
import useAppBackNavigation from "@food/hooks/useAppBackNavigation";
import { API_BASE_URL } from "@food/api/config";

// Grocery category icon colours (Blinkit/Zepto style pastel backgrounds)
const GROCERY_PALETTE = [
  { bg: "#FFF3E0", icon: "#F57C00" },
  { bg: "#E8F5E9", icon: "#2E7D32" },
  { bg: "#E3F2FD", icon: "#1565C0" },
  { bg: "#FCE4EC", icon: "#C62828" },
  { bg: "#F3E5F5", icon: "#6A1B9A" },
  { bg: "#E0F7FA", icon: "#00838F" },
  { bg: "#FFF8E1", icon: "#F9A825" },
  { bg: "#EFEBE9", icon: "#4E342E" },
  { bg: "#E8EAF6", icon: "#283593" },
  { bg: "#FAFAFA", icon: "#424242" },
];

export default function Categories() {
  const navigate = useNavigate();
  const goBack = useAppBackNavigation();
  const [searchParams] = useSearchParams();

  // Detect grocery / quick-mart mode
  const isGrocery = searchParams.get("vertical") === "grocery";

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { getDefaultAddress } = useProfile();
  const { location } = useLocation();
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(() => {
    try {
      return window.localStorage.getItem("deliveryAddressMode") || "saved";
    } catch {
      return "saved";
    }
  });
  const defaultSavedAddress = useMemo(
    () => getDefaultAddress?.() || null,
    [getDefaultAddress],
  );
  const defaultSavedAddressLocation = useMemo(() => {
    const coords = defaultSavedAddress?.location?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng };
      }
    }
    const lat = Number(defaultSavedAddress?.latitude || defaultSavedAddress?.lat);
    const lng = Number(defaultSavedAddress?.longitude || defaultSavedAddress?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
    return null;
  }, [defaultSavedAddress]);

  const effectiveLocation = useMemo(() => {
    const useSavedAddress =
      deliveryAddressMode === "saved" &&
      Number.isFinite(defaultSavedAddressLocation?.latitude) &&
      Number.isFinite(defaultSavedAddressLocation?.longitude);
    return useSavedAddress ? defaultSavedAddressLocation : location;
  }, [deliveryAddressMode, defaultSavedAddressLocation, location]);

  const { zoneId, zoneStatus, loading: zoneLoading } = useZone(effectiveLocation);
  const [cachedZoneId, setCachedZoneId] = useState(() => {
    try {
      return window.localStorage.getItem("userZoneId") || "";
    } catch {
      return "";
    }
  });
  const resolvedZoneId = zoneId || cachedZoneId || "";

  const BACKEND_ORIGIN = useMemo(() => API_BASE_URL.replace(/\/api\/?$/, ""), []);
  const hasEffectiveCoordinates = useMemo(
    () =>
      Number.isFinite(effectiveLocation?.latitude) &&
      Number.isFinite(effectiveLocation?.longitude),
    [effectiveLocation],
  );

  useEffect(() => {
    const readMode = () => {
      try {
        setDeliveryAddressMode(window.localStorage.getItem("deliveryAddressMode") || "saved");
        setCachedZoneId(window.localStorage.getItem("userZoneId") || "");
      } catch {
        setDeliveryAddressMode("saved");
        setCachedZoneId("");
      }
    };
    window.addEventListener("deliveryAddressModeChanged", readMode);
    return () => {
      window.removeEventListener("deliveryAddressModeChanged", readMode);
    };
  }, []);

  useEffect(() => {
    if (zoneId) {
      setCachedZoneId(zoneId);
      return;
    }
    try {
      setCachedZoneId(window.localStorage.getItem("userZoneId") || "");
    } catch {
      setCachedZoneId("");
    }
  }, [zoneId, deliveryAddressMode, effectiveLocation?.latitude, effectiveLocation?.longitude]);

  const normalizeImageUrl = (imageUrl) => {
    if (typeof imageUrl !== "string") return "";
    const trimmed = imageUrl.trim();
    if (!trimmed) return "";
    if (/^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) return trimmed;
    // Fix single-slash protocol (http:/ → http://) without lookahead
    let normalizedInput = trimmed.replace(/\\/g, "/");
    normalizedInput = normalizedInput.replace(/^(https?):\/([^/])/i, "$1://$2");
    normalizedInput = normalizedInput.replace(/^(https?:\/\/)(https?:\/\/)/i, "$1");
    if (/^(https?:)?\/\//i.test(normalizedInput)) return normalizedInput;
    return normalizedInput.startsWith("/")
      ? `${BACKEND_ORIGIN}${normalizedInput}`
      : `${BACKEND_ORIGIN}/${normalizedInput.replace(/^\.?\/*/, "")}`;
  };

  useEffect(() => {
    const fetchCategories = async () => {
      if (hasEffectiveCoordinates && (zoneLoading || zoneStatus === "loading") && !resolvedZoneId) {
        return;
      }
      if (hasEffectiveCoordinates && !resolvedZoneId) {
        setCategories([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // KEY FIX: For grocery mode, pass isRestaurant: 'false' to get grocery categories only
        const params = resolvedZoneId ? { zoneId: resolvedZoneId } : {};
        if (isGrocery) {
          params.isRestaurant = "false";
        }
        const response = await adminAPI.getPublicCategories(params);
        const list =
          response?.data?.data?.categories ||
          response?.data?.categories ||
          [];
        if (Array.isArray(list)) {
          const transformed = list.map((cat, idx) => ({
            id: String(cat?.id || cat?._id || cat?.slug || idx),
            name: cat?.name || "",
            slug: cat?.slug || String(cat?.name || "").toLowerCase().replace(/\s+/g, "-"),
            image: normalizeImageUrl(cat?.image || cat?.imageUrl) || (isGrocery ? "" : foodImages[idx % foodImages.length]),
            type: cat?.type || "",
          }));
          setCategories(transformed);
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, [resolvedZoneId, zoneStatus, zoneLoading, hasEffectiveCoordinates, BACKEND_ORIGIN, isGrocery]);

  const filteredCategories = categories.filter((cat) =>
    (cat.name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── GROCERY MODE UI ───────────────────────────────────────────────────────
  if (isGrocery) {
    return (
      <div className="min-h-screen pb-24" style={{ background: "#f8fdf9" }}>
        {/* Green Header */}
        <div
          className="sticky top-0 z-50 px-4 py-4"
          style={{ background: "#16A34A" }}
        >
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={goBack}
              className="p-2 rounded-full active:scale-95 transition-all"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
            <div>
              <h1 className="text-lg font-extrabold text-white tracking-tight leading-none">
                Shop by Category
              </h1>
              <p className="text-[11px] text-white/70 font-medium mt-0.5">
                Fresh groceries delivered in minutes
              </p>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl text-sm font-medium focus:outline-none placeholder:text-gray-400 shadow-sm"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="px-4 pt-5">
          {loading ? (
            <div className="grid grid-cols-3 gap-3">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 p-4 bg-white rounded-2xl animate-pulse shadow-sm">
                  <div className="w-14 h-14 rounded-full bg-gray-100" />
                  <div className="h-2.5 w-14 bg-gray-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="py-20 flex flex-col items-center text-center px-6">
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center mb-6"
                style={{ background: "#E8F5E9" }}
              >
                <ShoppingBasket className="h-10 w-10" style={{ color: "#16A34A" }} />
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {searchQuery ? "No results found" : "No grocery categories yet"}
              </h3>
              <p className="text-sm text-gray-500 mt-2 max-w-[240px]">
                {searchQuery
                  ? "Try another keyword!"
                  : "Vendor hasn't added grocery categories for your zone yet."}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-8 px-8 py-3 text-white rounded-2xl text-sm font-bold active:scale-95 transition-all shadow-lg"
                  style={{ background: "#16A34A" }}
                >
                  Show all categories
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filteredCategories.map((category, index) => {
                const palette = GROCERY_PALETTE[index % GROCERY_PALETTE.length];
                return (
                  <motion.div
                    key={category.id || index}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04, duration: 0.25 }}
                  >
                    <Link
                      to={`/food/user/category/${category.slug}?vertical=grocery`}
                      className="flex flex-col items-center gap-2 p-2.5 bg-white rounded-2xl shadow-sm active:scale-95 transition-all duration-200"
                      style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}
                    >
                      {/* Category image (full tile) / icon fallback */}
                      {category.image ? (
                        <div className="w-full aspect-square rounded-xl overflow-hidden" style={{ background: palette.bg }}>
                          <OptimizedImage
                            src={category.image}
                            alt={category.name}
                            className="w-full h-full object-cover"
                            sizes="110px"
                          />
                        </div>
                      ) : (
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden"
                          style={{ background: palette.bg }}
                        >
                          <ShoppingBasket className="h-6 w-6" style={{ color: palette.icon }} />
                        </div>
                      )}
                      <span className="text-[11px] font-bold text-gray-800 text-center leading-tight line-clamp-2">
                        {category.name}
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── FOOD MODE UI (original) ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white pb-10">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-100 px-4 py-4 flex items-center gap-4">
        <button onClick={goBack} className="p-2 hover:bg-neutral-100 rounded-full transition-colors active:scale-95">
          <ArrowLeft className="h-6 w-6 text-neutral-800" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">All Categories</h1>
          <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest leading-none mt-1">What's on your mind?</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-4 py-6">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400 group-focus-within:text-[color:var(--app-primary,#EB590E)] transition-colors" />
          <input
            type="text"
            placeholder="Search specialties, cuisines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-[color:var(--app-primary,#EB590E)]/5 focus:border-[color:var(--app-primary,#EB590E)] transition-all placeholder:text-neutral-400"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="px-4">
        {loading ? (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-x-4 gap-y-10">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-3 animate-pulse">
                <div className="w-full aspect-square rounded-full bg-neutral-100 border border-neutral-50" />
                <div className="h-2 w-12 bg-neutral-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-x-4 gap-y-10">
            {filteredCategories.map((category, index) => {
              return (
                <motion.div
                  key={category.id || index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Link
                    to={`/food/user/category/${category.slug}`}
                    className="flex flex-col items-center gap-2.5 group"
                  >
                    <div className="relative w-full aspect-square rounded-full overflow-hidden shadow-sm border border-neutral-100 bg-white group-active:scale-90 transition-all duration-300">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/5 opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                      <OptimizedImage
                        src={category.image}
                        alt={category.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        sizes="(max-width: 640px) 25vw, 15vw"
                      />
                    </div>
                    <span className="text-[11px] font-bold text-neutral-700 text-center leading-tight">
                      {category.name}
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}

        {filteredCategories.length === 0 && !loading && (
          <div className="py-20 flex flex-col items-center text-center px-6">
            <div className="h-20 w-20 bg-neutral-50 rounded-full flex items-center justify-center mb-6">
              <Grid2x2 className="h-10 w-10 text-neutral-300" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900">No results found</h3>
            <p className="text-sm text-neutral-500 mt-2 max-w-[240px]">We couldn't find any categories matching your search. Try another keyword!</p>
            <button
              onClick={() => setSearchQuery("")}
              className="mt-8 px-8 py-3 bg-neutral-900 text-white rounded-2xl text-sm font-bold active:scale-95 transition-all shadow-lg"
            >
              Show all categories
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
