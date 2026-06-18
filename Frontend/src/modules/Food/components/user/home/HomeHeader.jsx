import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronDown, Search, Mic, Bell, CheckCircle2, Tag, AlertCircle, BellOff, X, ShoppingBag } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@food/components/ui/popover";
import { Badge } from "@food/components/ui/badge";
import foodIcon from "@food/assets/category-icons/food.png";
import quickIcon from "@food/assets/category-icons/quick.png";
import hotelIcon from "@food/assets/category-icons/hotel.png";
import { useCart } from "@food/context/CartContext";
import useNotificationInbox from "@food/hooks/useNotificationInbox";
import { getVerticalTheme } from "@/shared/constants/superAppVerticalTheme";

const ICON_MAP = {
  CheckCircle2,
  Tag,
  AlertCircle
};

const LOCATION_STORAGE_KEY = 'eqosy:lastLocation';
const LOCATION_UPDATED_EVENT = 'eqosy:location-updated';

const FOOD_PLACEHOLDERS = [
  'Search "burger"',
  'Search "biryani"',
  'Search "pizza"',
  'Search "chinese"',
  'Search "momos"',
];

const TAXI_PLACEHOLDERS = [
  'Search "airport cab"',
  'Search "shared taxi"',
  'Search "bike taxi"',
  'Search "rental ride"',
  'Search "outstation"',
];

const GROCERY_PLACEHOLDERS = [
  'Search "bread"',
  'Search "milk"',
  'Search "fruits"',
  'Search "snacks"',
];

function readEqosyLocation() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(LOCATION_STORAGE_KEY) || '{}');
    const address = String(saved?.address || '').trim();
    if (!address) return null;
    const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
    return {
      formattedAddress: address,
      area: parts[0] || address,
      city: parts.length > 2 ? parts[parts.length - 2] : parts[1] || '',
      state: parts.length > 1 ? parts[parts.length - 1] : '',
      address,
    };
  } catch {
    return null;
  }
}

const FALLBACK_BANNER_IMAGES = [
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&h=500&fit=crop",
  "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=900&h=500&fit=crop",
  "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=900&h=500&fit=crop",
];

function BurgerIcon({ isActive }) {
  if (isActive) {
    return (
      <svg className="w-8 h-8 filter drop-shadow-sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 30C12 18 20 12 32 12C44 12 52 18 52 30H12Z" fill="#F4A261" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 32C10 32 14 36 21 36C28 36 30 32 35 32C40 32 43 36 48 36C53 36 54 32 54 32" fill="#2A9D8F" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 36L14 40L50 40L54 36" fill="#E9C46A" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="14" y="40" width="36" height="6" rx="3" fill="#8B5E3C" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 46C16 52 22 54 32 54C42 54 48 52 48 46H16Z" fill="#F4A261" stroke="#2D1B00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 opacity-65 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 30C12 18 20 12 32 12C44 12 52 18 52 30H12Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 32C10 32 14 36 21 36C28 36 30 32 35 32C40 32 43 36 48 36C53 36 54 32 54 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 36L14 40L50 40L54 36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="14" y="40" width="36" height="6" rx="3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 46C16 52 22 54 32 54C42 54 48 52 48 46H16Z" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TaxiIcon({ isActive }) {
  if (isActive) {
    return (
      <svg className="w-8 h-8 filter drop-shadow-sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="22" y="10" width="20" height="7" rx="2" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <rect x="26" y="11.5" width="12" height="4" rx="1" fill="#FBBF24" />
        <path d="M14 24H50L46 17H18L14 24Z" fill="#2563EB" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M12 24H52C54.2 24 56 25.8 56 28V38C56 40.2 54.2 42 52 42H12C9.8 42 8 40.2 8 38V28C8 25.8 9.8 24 12 24Z" fill="#3B82F6" stroke="#0F172A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M18 28H46" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
        <rect x="20" y="30" width="10" height="6" rx="1" fill="#DBEAFE" stroke="#0F172A" strokeWidth="1.5" />
        <rect x="34" y="30" width="10" height="6" rx="1" fill="#DBEAFE" stroke="#0F172A" strokeWidth="1.5" />
        <circle cx="18" cy="42" r="5" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <circle cx="46" cy="42" r="5" fill="#1E293B" stroke="#0F172A" strokeWidth="2" />
        <circle cx="18" cy="42" r="2" fill="#E2E8F0" />
        <circle cx="46" cy="42" r="2" fill="#E2E8F0" />
        <rect x="28" y="44" width="8" height="3" rx="1" fill="#64748B" />
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 opacity-70 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="10" width="20" height="7" rx="2" stroke="currentColor" strokeWidth="2.5" />
      <path d="M14 24H50L46 17H18L14 24Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M12 24H52C54.2 24 56 25.8 56 28V38C56 40.2 54.2 42 52 42H12C9.8 42 8 40.2 8 38V28C8 25.8 9.8 24 12 24Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="18" cy="42" r="5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="46" cy="42" r="5" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function GroceryIcon({ isActive }) {
  if (isActive) {
    return (
      <svg className="w-8 h-8 filter drop-shadow-sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 18H14L18 44H48L52 18H58" stroke="#14532D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 44H48L46 50C45.4 52.2 43.5 54 41 54H25C22.5 54 20.6 52.2 20 50L18 44Z" fill="#86EFAC" stroke="#14532D" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="24" cy="58" r="3" fill="#14532D" />
        <circle cx="42" cy="58" r="3" fill="#14532D" />
        <path d="M22 26H42C43.1 26 44 26.9 44 28V34C44 35.1 43.1 36 42 36H22C20.9 36 20 35.1 20 34V28C20 26.9 20.9 26 22 26Z" fill="#FEF9C3" stroke="#14532D" strokeWidth="2" />
        <path d="M28 22C28 19 30 16 33 16C36 16 38 19 38 22" fill="#EF4444" stroke="#14532D" strokeWidth="2" />
        <path d="M33 16V22" stroke="#14532D" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M46 30C48 28 50 28 52 30C54 32 54 34 52 36" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 opacity-70 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 18H14L18 44H48L52 18H58" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 44H48L46 50C45.4 52.2 43.5 54 41 54H25C22.5 54 20.6 52.2 20 50L18 44Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="24" cy="58" r="3" fill="currentColor" />
      <circle cx="42" cy="58" r="3" fill="currentColor" />
      <path d="M28 22C28 19 30 16 33 16C36 16 38 19 38 22" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

const renderVerticalIcon = (id, isActive) => {
  if (id === 'food') return <BurgerIcon isActive={isActive} />;
  if (id === 'taxi') return <TaxiIcon isActive={isActive} />;
  if (id === 'grocery') return <GroceryIcon isActive={isActive} />;
  return null;
};

const foodTheme = getVerticalTheme('food');
const taxiTheme = getVerticalTheme('taxi');
const groceryTheme = getVerticalTheme('grocery');

const VERTICALS = [
  {
    id: 'food',
    name: 'EqosyFood',
    path: '/food/user',
    icon: foodIcon,
    themeBg: foodTheme.themeBg,
    activeTabBg: foodTheme.activeTabBg,
    inactiveTabBg: foodTheme.inactiveTabBg,
  },
  {
    id: 'taxi',
    name: 'EqosyTaxi',
    path: '/food/user?vertical=taxi',
    icon: quickIcon,
    themeBg: taxiTheme.themeBg,
    activeTabBg: taxiTheme.activeTabBg,
    inactiveTabBg: taxiTheme.inactiveTabBg,
  },
  {
    id: 'grocery',
    name: 'EqosyGrocery',
    path: '/food/user?vertical=grocery',
    icon: hotelIcon,
    themeBg: groceryTheme.themeBg,
    activeTabBg: groceryTheme.activeTabBg,
    inactiveTabBg: groceryTheme.inactiveTabBg,
  },
];

export default function HomeHeader({
  activeVertical: activeVerticalProp,
  onVerticalChange,
  location: locationProp,
  savedAddressText,
  locationTitle,
  locationSubtitle,
  handleLocationClick,
  handleSearchFocus,
  placeholderIndex: placeholderIndexProp,
  placeholders: placeholdersProp,
  handleVegModeChange,
  isVegMode,
  vegModeToggleRef,
  isCategoryStuck = false,
  heroBannerImages = [],
}) {
  const navigate = useNavigate();
  const reactLocation = useLocation();
  const locationPath = reactLocation.pathname;
  const { itemCount } = useCart();

  const isControlled = typeof onVerticalChange === 'function';

  let routeVertical = 'food';
  if (locationPath.includes('/food/user/grocery') || locationPath.includes('/grocery')) {
    routeVertical = 'grocery';
  } else if (locationPath.includes('/taxi')) {
    routeVertical = 'taxi';
  } else if (['food', 'taxi', 'grocery'].includes(activeVerticalProp)) {
    routeVertical = activeVerticalProp;
  }

  const activeVertical = isControlled
    ? (['food', 'taxi', 'grocery'].includes(activeVerticalProp) ? activeVerticalProp : 'food')
    : (activeVerticalProp ?? routeVertical);
  const isFood = activeVertical === 'food';
  const isTaxi = activeVertical === 'taxi';
  const isGrocery = activeVertical === 'grocery';

  const handleVerticalTabClick = useCallback((verticalId) => {
    if (isControlled) {
      onVerticalChange(verticalId);
      return;
    }
    if (verticalId === 'food') {
      navigate('/food/user');
      return;
    }
    navigate(`/food/user?vertical=${verticalId}`);
  }, [isControlled, onVerticalChange, navigate]);

  const currentVertical = VERTICALS.find((v) => v.id === activeVertical) || VERTICALS[0];
  const verticalTheme = getVerticalTheme(activeVertical);
  const bannerImages = heroBannerImages.length > 0 ? heroBannerImages : FALLBACK_BANNER_IMAGES;

  const [storedLocation, setStoredLocation] = useState(() => readEqosyLocation());
  const [internalPlaceholderIndex, setInternalPlaceholderIndex] = useState(0);

  useEffect(() => {
    const syncLocation = () => setStoredLocation(readEqosyLocation());
    syncLocation();
    window.addEventListener('storage', syncLocation);
    window.addEventListener(LOCATION_UPDATED_EVENT, syncLocation);
    return () => {
      window.removeEventListener('storage', syncLocation);
      window.removeEventListener(LOCATION_UPDATED_EVENT, syncLocation);
    };
  }, []);

  const location = locationProp ?? storedLocation;

  const resolvedPlaceholders = useMemo(() => {
    if (placeholdersProp?.length) return placeholdersProp;
    if (isTaxi) return TAXI_PLACEHOLDERS;
    if (isGrocery) return GROCERY_PLACEHOLDERS;
    return FOOD_PLACEHOLDERS;
  }, [placeholdersProp, isTaxi, isGrocery]);

  const placeholderIndex = placeholderIndexProp ?? internalPlaceholderIndex;

  useEffect(() => {
    if (placeholderIndexProp !== undefined && placeholderIndexProp !== null) return undefined;
    const timer = setInterval(() => {
      setInternalPlaceholderIndex((prev) => (prev + 1) % resolvedPlaceholders.length);
    }, 3500);
    return () => clearInterval(timer);
  }, [placeholderIndexProp, resolvedPlaceholders.length]);

  const onLocationClick = useCallback(() => {
    if (handleLocationClick) {
      handleLocationClick();
      return;
    }
    if (isTaxi) {
      navigate('/taxi/user/ride/select-location');
      return;
    }
    if (isGrocery) {
      navigate('/food/user/grocery');
    }
  }, [handleLocationClick, isTaxi, isGrocery, navigate]);

  const onSearchFocus = useCallback(() => {
    if (handleSearchFocus) {
      handleSearchFocus();
      return;
    }
    if (isTaxi) {
      navigate('/taxi/user/ride/select-location');
      return;
    }
    if (isFood) {
      navigate('/food/user/search');
    }
  }, [handleSearchFocus, isTaxi, isFood, navigate]);

  const walletPath = isTaxi ? '/taxi/user/wallet' : '/food/user/wallet';

  const displayTitle = useMemo(() => {
    if (locationTitle?.trim()) return locationTitle.trim();
    if (savedAddressText?.trim()) {
      const firstPart = savedAddressText.split(',')[0]?.trim();
      return firstPart || savedAddressText;
    }
    if (location?.area && location?.city) return `${location.area}, ${location.city}`;
    return location?.area || location?.city || location?.formattedAddress?.split(',')[0] || "Select Location";
  }, [locationTitle, savedAddressText, location]);

  const displaySubtitle = useMemo(() => {
    if (locationSubtitle?.trim()) return locationSubtitle.trim();
    const parts = [location?.state, location?.zipCode || location?.postalCode].filter(Boolean);
    return parts.join(", ");
  }, [locationSubtitle, location]);

  const [notifications, setNotifications] = useState(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('food_user_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    dismiss: dismissBroadcastNotification,
  } = useNotificationInbox(isFood ? "user" : null, { limit: 20 });

  useEffect(() => {
    if (!isFood) return undefined;
    const syncNotifications = () => {
      const saved = localStorage.getItem('food_user_notifications');
      setNotifications(saved ? JSON.parse(saved) : []);
    };
    window.addEventListener('notificationsUpdated', syncNotifications);
    return () => window.removeEventListener('notificationsUpdated', syncNotifications);
  }, [isFood]);

  const mergedNotifications = useMemo(() => {
    const localItems = Array.isArray(notifications)
      ? notifications.map((item) => ({ ...item, source: "local" }))
      : [];
    const broadcastItems = (broadcastNotifications || []).map((item) => ({
      ...item,
      source: "broadcast",
      time: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "Just now",
      type: "broadcast",
      icon: "Bell",
      iconColor: "text-blue-600",
    }));

    return [...broadcastItems, ...localItems].sort(
      (a, b) =>
        new Date(b.createdAt || b.timestamp || 0).getTime() -
        new Date(a.createdAt || a.timestamp || 0).getTime()
    );
  }, [broadcastNotifications, notifications]);

  const unreadCount = notifications.filter(n => !n.read).length + broadcastUnreadCount;

  const handleDeleteNotification = (id, source = "local") => {
    if (source === "broadcast") {
      dismissBroadcastNotification(id);
      return;
    }
    setNotifications((prev) => {
      const next = prev.filter((notification) => notification.id !== id);
      localStorage.setItem('food_user_notifications', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('notificationsUpdated', { detail: { count: next.filter((n) => !n.read).length } }));
      return next;
    });
  };

  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (!isFood) return undefined;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % Math.max(bannerImages.length, 3));
    }, 4000);
    return () => clearInterval(timer);
  }, [bannerImages.length, isFood]);

  const slideBanners = [
    {
      id: 0,
      content: (
        <div className="px-4 pt-5 pb-1">
          <h2 className="text-white text-[26px] font-black leading-[1.05] drop-shadow-lg">
            FLAT <br />
            <span className="text-[40px]">50% OFF</span>
          </h2>
          <p className="text-white text-[16px] font-bold mt-1 drop-shadow-md">with FREE delivery</p>
        </div>
      ),
    },
    {
      id: 1,
      content: (
        <div className="px-4 pt-5 pb-1">
          <h2 className="text-white text-[26px] font-black leading-[1.05] drop-shadow-lg">
            FLAT <br />
            <span className="text-[40px]">₹150 OFF</span>
          </h2>
          <p className="text-white text-[16px] font-bold mt-1 drop-shadow-md">on Premium Dining</p>
        </div>
      ),
    },
    {
      id: 2,
      content: (
        <div className="px-4 pt-5 pb-1">
          <h2 className="text-white text-[26px] font-black leading-[1.05] drop-shadow-lg">
            FREE <br />
            <span className="text-[40px]">Delivery</span>
          </h2>
          <p className="text-white text-[16px] font-bold mt-1 drop-shadow-md">on orders above ₹199</p>
        </div>
      ),
    },
  ];

  return (
    <>
      <div
        className={`relative z-10 w-full overflow-hidden rounded-b-[1.75rem] shadow-[0_10px_40px_rgba(0,0,0,0.18)] transition-colors duration-500 ease-in-out ${currentVertical.themeBg}`}
        style={{ backgroundColor: verticalTheme.theme }}
      >
        <div className="relative z-20 px-4 pt-4 pb-2 flex items-center justify-between gap-3">
          <button
            type="button"
            className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
            onClick={onLocationClick}
          >
            <MapPin className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} style={{ color: verticalTheme.accent, fill: verticalTheme.accent }} />
            <div className="flex flex-col min-w-0 text-white">
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-[14px] font-bold truncate drop-shadow-sm">
                  {displayTitle}
                </span>
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
              </div>
              {displaySubtitle ? (
                <span className="text-[11px] font-medium truncate opacity-80 max-w-[210px]">
                  {displaySubtitle}
                </span>
              ) : null}
            </div>
          </button>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              type="button"
              className="h-10 w-10 relative flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50 transition-all"
              onClick={() => navigate(walletPath)}
              aria-label="Wallet"
            >
              <div className="w-5 h-5 border-2 border-gray-800 rounded flex items-center justify-center">
                <span className="text-gray-800 text-[10px] font-bold font-serif">₹</span>
              </div>
            </button>

            {!isTaxi && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-10 w-10 relative flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5 text-gray-800" />
                  {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-yellow-400 rounded-full border-2 border-white" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 overflow-hidden border-none shadow-2xl rounded-2xl mt-2" align="end">
                <div className="bg-white dark:bg-gray-900">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      Notifications
                      {unreadCount > 0 && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-600 border-none text-[10px] h-4">
                          {unreadCount} New
                        </Badge>
                      )}
                    </h3>
                    <Link to="/food/user/notifications" className="text-xs font-bold text-orange-600 hover:text-orange-700">
                      {mergedNotifications.length > 0 ? "View All" : ""}
                    </Link>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {mergedNotifications.length > 0 ? (
                      mergedNotifications.slice(0, 5).map((notif) => {
                        const Icon = ICON_MAP[notif.icon] || Bell;
                        return (
                          <div
                            key={notif.id}
                            className={`p-4 flex items-start gap-3 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${!notif.read ? 'bg-orange-50/20' : ''}`}
                          >
                            <div className={`mt-1 p-2 rounded-full ${notif.type === "order" ? "bg-green-100/50 text-green-600" : "bg-orange-100/50 text-orange-600"}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{notif.title}</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{notif.time}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDeleteNotification(notif.id, notif.source);
                                    }}
                                    className="rounded-full p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                                {notif.message}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center flex flex-col items-center gap-2">
                        <BellOff className="h-10 w-10 text-gray-200" />
                        <p className="text-xs text-gray-400 font-medium">All caught up!</p>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            )}

            {!isTaxi && (
            <button
              type="button"
              className="h-10 w-10 relative flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50 transition-all"
              onClick={() => navigate('/food/user/cart')}
              aria-label="Cart"
            >
              <ShoppingBag className="h-5 w-5 text-gray-800" />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border-2 border-white" style={{ backgroundColor: verticalTheme.accent }}>
                  <span className="text-[9px] font-bold text-white leading-none">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                </span>
              )}
            </button>
            )}
          </div>
        </div>

        <div className="relative z-20 px-3 pb-0">
          <div className="flex w-full gap-1">
            {VERTICALS.map((vertical) => {
              const isActive = vertical.id === activeVertical;
              return (
                <div key={vertical.id} className={`flex-1 relative flex flex-col items-center ${isActive ? 'z-20' : 'z-10'}`}>
                  <button
                    type="button"
                    onClick={() => handleVerticalTabClick(vertical.id)}
                    style={isActive ? { '--active-tab-bg': verticalTheme.activeTab } : {}}
                    className={`w-full flex flex-col items-center justify-center px-2 transition-all duration-300 ${
                      isActive
                        ? `${currentVertical.activeTabBg} curvy-active-tab pt-2.5 pb-2.5 rounded-t-[1.75rem] shadow-sm`
                        : `${currentVertical.inactiveTabBg} rounded-t-[1.25rem] mt-1.5 pt-2.5 pb-2`
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-center">
                      {renderVerticalIcon(vertical.id, isActive)}
                    </div>
                    <span className={`text-[10px] font-bold leading-none ${isActive ? 'text-white' : 'text-white/75'}`}>
                      {vertical.name}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Search row */}
        <div
          className={`relative z-30 px-3 pt-3 flex items-center gap-2.5 ${
            isFood ? 'pb-0' : 'pb-4'
          } ${isCategoryStuck && isFood ? `sticky top-0 z-50 ${currentVertical.themeBg}` : ''}`}
          style={isCategoryStuck && isFood ? { backgroundColor: verticalTheme.theme } : undefined}
        >
          {isTaxi ? (
            <button
              type="button"
              onClick={onSearchFocus}
              className="flex w-full items-center gap-2 rounded-[18px] border border-white/80 bg-white/92 px-3.5 py-3 text-left shadow-[0_12px_26px_rgba(15,23,42,0.06)] active:scale-[0.99] transition-transform"
            >
              <Search className="h-4 w-4 text-slate-500 flex-shrink-0" strokeWidth={2.5} />
              <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-500">
                Search destination
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 flex-shrink-0">
                Go
              </span>
            </button>
          ) : (
          <>
          <div
            className="flex-1 min-w-0 rounded-[14px] flex items-center px-3 py-2 bg-white dark:bg-[#1a1a1a] shadow-[0_4px_16px_rgba(0,0,0,0.15)] cursor-pointer active:scale-[0.99] transition-all duration-200 overflow-hidden"
            onClick={onSearchFocus}
            onTouchStart={onSearchFocus}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSearchFocus();
              }
            }}
          >
            <Search className="h-[18px] w-[18px] mr-2 flex-shrink-0" strokeWidth={2.5} style={{ color: verticalTheme.accent }} />
            <div className="flex-1 relative h-5 min-w-0">
              <AnimatePresence mode="wait">
                <motion.span
                  key={placeholderIndex}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -12, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="absolute inset-0 text-[14px] font-medium text-gray-400 truncate"
                >
                  {resolvedPlaceholders?.[placeholderIndex] || 'Search "chinese"'}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="h-5 w-px bg-gray-200 mx-2.5 flex-shrink-0" />
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-all"
              style={{ backgroundColor: verticalTheme.accentSoft }}
            >
              <Mic className="h-[18px] w-[18px]" strokeWidth={2.5} style={{ color: verticalTheme.accent }} />
            </div>
          </div>

          {isFood && (
          <div
            className="flex flex-col items-center justify-center cursor-pointer flex-shrink-0 w-[52px]"
            onClick={() => handleVegModeChange && handleVegModeChange(!isVegMode)}
            ref={vegModeToggleRef}
          >
            <span className="text-[9px] font-black uppercase tracking-wide leading-tight text-white text-center">
              Veg
            </span>
            <span className="text-[9px] font-black uppercase tracking-wide leading-tight text-white text-center mb-1">
              Mode
            </span>
            <div className={`w-9 h-[18px] rounded-full relative transition-colors ${isVegMode ? 'bg-[#065f46]' : 'bg-white/40'}`}>
              <div className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white transition-transform ${isVegMode ? 'translate-x-[18px]' : 'translate-x-[2px]'} shadow-sm`} />
            </div>
          </div>
          )}
          </>
          )}
        </div>

        {isFood && (
        <div className="relative z-10 mt-3">
          <div className="relative w-full h-[168px] overflow-hidden">
            <div
              className="absolute inset-0 flex transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {slideBanners.map((banner, index) => {
                const image = bannerImages[index % bannerImages.length];
                return (
                  <div key={banner.id} className="relative w-full h-full shrink-0">
                    <img
                      src={image}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading={index === 0 ? "eager" : "lazy"}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
                    <div className="relative z-10 h-full flex items-center">
                      {banner.content}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="absolute bottom-2.5 inset-x-0 flex justify-center gap-1.5 z-20">
              {slideBanners.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === currentSlide ? 'bg-white w-5' : 'bg-white/45 w-1.5'}`}
                />
              ))}
            </div>
          </div>
        </div>
        )}
      </div>
    </>
  );
}
