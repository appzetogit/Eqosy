import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Star, ShoppingBasket, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import { publicGetOnce, restaurantAPI } from '@food/api';
import { API_BASE_URL } from '@food/api/config';
import { useLocation } from '@food/hooks/useLocation';
import { useZone } from '@food/hooks/useZone';

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

const GroceryBannerSlider = ({ zoneId }) => {
  const [banners, setBanners] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);
  const isSwiping = useRef(false);

  useEffect(() => {
    let active = true;
    publicGetOnce('/food/hero-banners/public')
      .then((res) => {
        if (!active) return;
        const list = res?.data?.data?.banners || res?.data?.data || [];
        if (Array.isArray(list) && list.length > 0) {
          setBanners(list);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const bannerImages = useMemo(() => {
    return banners
      .map((b) => (b && typeof b.imageUrl === 'string' ? b.imageUrl : ''))
      .filter(Boolean);
  }, [banners]);

  useEffect(() => {
    if (bannerImages.length <= 1) return;
    const interval = setInterval(() => {
      if (!isSwiping.current) {
        setCurrentIndex((prev) => (prev + 1) % bannerImages.length);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [bannerImages.length]);

  if (bannerImages.length === 0) return null;

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    isSwiping.current = true;
  };

  const handleTouchEnd = (e) => {
    if (!isSwiping.current || bannerImages.length <= 1) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        setCurrentIndex((prev) => (prev + 1) % bannerImages.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + bannerImages.length) % bannerImages.length);
      }
    }
    setTimeout(() => {
      isSwiping.current = false;
    }, 200);
  };

  return (
    <div className="mb-5">
      <div
        className="relative w-full overflow-hidden aspect-[2/1] sm:aspect-[2.4/1] rounded-2xl shadow-sm bg-gray-100 dark:bg-gray-800 cursor-pointer"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="absolute inset-0 z-0">
          {bannerImages.map((image, idx) => (
            <div
              key={`${idx}-${image}`}
              className="absolute inset-0 transition-opacity duration-700 ease-in-out"
              style={{
                opacity: currentIndex === idx ? 1 : 0,
                zIndex: currentIndex === idx ? 2 : 1,
              }}
            >
              <img
                src={image}
                alt={`Grocery Banner ${idx + 1}`}
                className="w-full h-full object-cover rounded-2xl"
              />
            </div>
          ))}
        </div>

        {/* Indicators */}
        {bannerImages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1 bg-black/30 backdrop-blur-md rounded-full z-10">
            {bannerImages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentIndex === idx ? 'bg-white w-5' : 'bg-white/40 w-1.5'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const normalizeImageUrl = (imageUrl) => {
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) return '';
  const trimmed = imageUrl.trim();
  if (/^(https?:)?\/\//i.test(trimmed) || /^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith('/')
    ? `${BACKEND_ORIGIN}${trimmed}`
    : `${BACKEND_ORIGIN}/${trimmed}`;
};

const pickStoreImage = (restaurant) => {
  const candidates = [
    restaurant?.coverImage?.url,
    restaurant?.coverImage,
    ...(Array.isArray(restaurant?.coverImages) ? restaurant.coverImages.map((img) => img?.url || img) : []),
    ...(Array.isArray(restaurant?.menuImages) ? restaurant.menuImages.map((img) => img?.url || img) : []),
    restaurant?.profileImage?.url,
    restaurant?.profileImage,
  ];
  const firstValid = candidates.find((value) => typeof value === 'string' && value.trim());
  return normalizeImageUrl(firstValid || '');
};

/** Compute "Closes in Xh Ym" from openingHours if available, else null */
function getClosesIn(restaurant) {
  try {
    const now = new Date();
    const hours = restaurant?.openingHours;
    if (!hours) return null;
    const closeStr = hours?.close || hours?.closingTime || hours?.closeTime;
    if (!closeStr) return null;
    const [hh, mm] = String(closeStr).split(':').map(Number);
    const close = new Date();
    close.setHours(hh, mm, 0, 0);
    const diffMs = close - now;
    if (diffMs <= 0) return null;
    const diffMins = Math.floor(diffMs / 60000);
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  } catch {
    return null;
  }
}

// Skeleton card matching the style
function StoreCardSkeleton() {
  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm animate-pulse mb-4">
      <div className="h-52 bg-gray-100 rounded-t-3xl" />
      <div className="p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-5 bg-gray-100 rounded-full w-2/5" />
          <div className="h-8 w-16 bg-gray-100 rounded-full" />
        </div>
        <div className="h-3.5 bg-gray-100 rounded-full w-1/3" />
        <div className="h-3.5 bg-gray-100 rounded-full w-1/4" />
        <div className="h-8 bg-gray-100 rounded-full w-2/5 mt-1" />
      </div>
    </div>
  );
}

const GroceryStoreImageSlider = ({ store, index }) => {
  const raw = store._raw || {};
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);
  const isSwiping = useRef(false);

  const productSlides = useMemo(() => {
    const slides = [];

    // 1. Recommended images / items with price & name
    if (Array.isArray(raw.recommendedImages) && raw.recommendedImages.length > 0) {
      raw.recommendedImages.forEach((item, idx) => {
        const img = normalizeImageUrl(item?.image || item?.url || item?.src || (typeof item === 'string' ? item : ''));
        if (img) {
          slides.push({
            id: item?.id || item?._id || `rec-${idx}`,
            image: img,
            name: item?.name || item?.itemName || store.name || 'Product',
            price: Number(item?.price || item?.originalPrice || 0),
          });
        }
      });
    }

    // 2. Cover / Menu images fallback
    const extraImgs = [
      ...(Array.isArray(raw.coverImages) ? raw.coverImages.map(i => i?.url || i) : []),
      ...(Array.isArray(raw.menuImages) ? raw.menuImages.map(i => i?.url || i) : []),
      ...(Array.isArray(raw.images) ? raw.images.map(i => i?.url || i) : []),
    ];
    extraImgs.forEach((rawImg, idx) => {
      const img = normalizeImageUrl(typeof rawImg === 'string' ? rawImg : '');
      if (img && !slides.find(s => s.image === img)) {
        slides.push({
          id: `extra-${idx}`,
          image: img,
          name: store.name,
          price: 0,
        });
      }
    });

    // 3. Store main image fallback
    if (slides.length === 0 && store.image) {
      slides.push({
        id: `main-${store.id}`,
        image: store.image,
        name: store.name,
        price: 0,
      });
    }

    return slides;
  }, [raw, store.image, store.name, store.id]);

  // Auto-slide every 3.5 seconds
  useEffect(() => {
    if (productSlides.length <= 1) return;
    const interval = setInterval(() => {
      if (!isSwiping.current) {
        setCurrentIndex((prev) => (prev + 1) % productSlides.length);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [productSlides.length]);

  const safeIndex = productSlides.length > 0 ? (currentIndex % productSlides.length + productSlides.length) % productSlides.length : 0;
  const activeSlide = productSlides[safeIndex] || productSlides[0];

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    isSwiping.current = true;
  };

  const handleTouchEnd = (e) => {
    if (!isSwiping.current || productSlides.length <= 1) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        setCurrentIndex((prev) => (prev + 1) % productSlides.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + productSlides.length) % productSlides.length);
      }
    }
    setTimeout(() => { isSwiping.current = false; }, 200);
  };

  if (!activeSlide?.image) {
    const fallbackGradients = [
      'from-green-100 to-emerald-200',
      'from-teal-100 to-cyan-200',
      'from-lime-100 to-green-200',
      'from-emerald-100 to-teal-200',
    ];
    return (
      <div className={`w-full h-52 bg-gradient-to-br ${fallbackGradients[index % fallbackGradients.length]} flex items-center justify-center`}>
        <ShoppingBasket className="w-14 h-14 text-green-300" />
      </div>
    );
  }

  return (
    <div 
      className="relative h-52 overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer group"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Product Images Slide Container */}
      <div className="absolute inset-0 z-0">
        {productSlides.map((slide, idx) => (
          <div
            key={slide.id || idx}
            className="absolute inset-0 transition-opacity duration-700 ease-in-out"
            style={{
              opacity: safeIndex === idx ? 1 : 0,
              zIndex: safeIndex === idx ? 2 : 1,
            }}
          >
            <img
              src={slide.image}
              alt={slide.name}
              className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
          </div>
        ))}
      </div>

      {/* Product Name & Price Badge (Top Left Overlay - matching food section) */}
      {activeSlide && activeSlide.name && activeSlide.name !== store.name && (
        <div className="absolute top-3 left-3 z-10 flex items-center pointer-events-none">
          <div className="bg-black/75 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold tracking-tight flex items-center gap-1.5 shadow-2xl border border-white/20">
            <span className="truncate max-w-[150px] sm:max-w-[200px]">{activeSlide.name}</span>
            {activeSlide.price > 0 && (
              <>
                <span className="opacity-50">·</span>
                <span className="font-extrabold text-amber-400">₹{Math.round(activeSlide.price)}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* OPEN NOW badge — bottom left */}
      <div className="absolute bottom-3 left-3 z-10">
        <span className="bg-[#1A9E5C] text-white text-[11px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-md">
          Open Now
        </span>
      </div>

      {/* Slide Dots Indicator */}
      {productSlides.length > 1 && (
        <div className="absolute bottom-3 right-3 flex gap-1 z-10">
          {productSlides.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(idx);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                safeIndex === idx ? 'w-4 bg-white shadow-md' : 'w-1.5 bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function StoreCard({ store, index }) {
  const closesIn = getClosesIn(store._raw);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.07, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="mb-4"
    >
      <Link to={`/food/user/restaurants/${store.slug}`} className="block">
        <div className="bg-white rounded-3xl overflow-hidden shadow-[0_2px_20px_rgba(0,0,0,0.08)] active:scale-[0.99] transition-transform duration-150">

          {/* Product/Store Image Slider */}
          <GroceryStoreImageSlider store={store} index={index} />

          {/* Info */}
          <div className="px-4 pt-4 pb-4">
            {/* Name + Rating */}
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <h3 className="text-[19px] font-black text-gray-900 leading-snug flex-1 line-clamp-1">
                {store.name}
              </h3>
              {store.rating > 0 && (
                <div className="flex-shrink-0 flex items-center gap-1.5 bg-[#E8F8F0] text-[#1A9E5C] text-sm font-bold px-3 py-1.5 rounded-full">
                  <Star className="w-3.5 h-3.5 fill-[#1A9E5C] text-[#1A9E5C]" />
                  <span>{store.rating.toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* Cuisine/category */}
            {store.cuisine && (
              <p className="text-[14px] text-gray-500 font-normal mb-2.5">{store.cuisine}</p>
            )}

            {/* Delivery time */}
            <div className="flex items-center gap-1.5 text-[14px] text-gray-600 mb-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>{store.deliveryTime}</span>
            </div>

            {/* Closes in */}
            {(closesIn || store.closesIn) && (
              <div className="inline-flex items-center gap-1.5 border border-orange-200 text-orange-600 text-[13px] font-semibold px-3 py-1.5 rounded-full bg-orange-50/60">
                <Timer className="w-3.5 h-3.5" />
                <span>Closes in {closesIn || store.closesIn}</span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export default function QuickSection() {
  const { location: userLocation } = useLocation();
  const { zoneId } = useZone(userLocation);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchGroceryStores = async () => {
      if (!zoneId) {
        setStores([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await restaurantAPI.getRestaurants({
          zoneId,
          isRestaurant: 'false',
        });
        if (cancelled) return;

        const list =
          response?.data?.data?.restaurants ||
          response?.data?.restaurants ||
          [];

        const transformed = list.map((restaurant) => {
          const name = restaurant?.name || restaurant?.restaurantName || 'Store';
          const slug =
            restaurant?.slug ||
            String(name).toLowerCase().trim().replace(/\s+/g, '-');

          const closesInVal = getClosesIn(restaurant);

          return {
            id: restaurant?._id || restaurant?.restaurantId || slug,
            slug,
            name,
            cuisine: restaurant?.cuisine || restaurant?.category || restaurant?.type || '',
            rating: Number(restaurant?.rating || 0) || 0,
            deliveryTime:
              restaurant?.estimatedDeliveryTime ||
              (restaurant?.estimatedDeliveryTimeMinutes
                ? `${restaurant.estimatedDeliveryTimeMinutes} mins`
                : '25-30 mins'),
            distance:
              restaurant?.distanceInKm != null
                ? `${Number(restaurant.distanceInKm).toFixed(1)} km`
                : restaurant?.distance || '1.2 km',
            offer: restaurant?.offer || '',
            closesIn: closesInVal,
            image: pickStoreImage(restaurant),
            _raw: restaurant,
          };
        });

        setStores(transformed);
      } catch {
        if (!cancelled) setStores([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchGroceryStores();
    return () => { cancelled = true; };
  }, [zoneId]);

  const hasStores = useMemo(() => stores.length > 0, [stores.length]);

  return (
    <div className="min-h-screen bg-white px-4 pt-5 pb-28">

      {/* Hero Banner Carousel */}
      <GroceryBannerSlider zoneId={zoneId} />

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.15em] mb-1">
            Grocery Stores
          </p>
          <h2 className="text-[26px] font-black text-gray-900 leading-tight">
            Grocery near you
          </h2>
        </div>

        {!loading && hasStores && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="mt-1 bg-[#E8F8F0] text-[#1A9E5C] text-sm font-bold px-4 py-2 rounded-full whitespace-nowrap"
          >
            {stores.length} stores
          </motion.div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <>
          <StoreCardSkeleton />
          <StoreCardSkeleton />
          <StoreCardSkeleton />
        </>
      ) : !zoneId ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <ShoppingBasket className="w-8 h-8 text-green-400" />
          </div>
          <h4 className="text-base font-bold text-gray-800 mb-1">Set your location</h4>
          <p className="text-sm text-gray-500 max-w-[220px] leading-relaxed">
            Enable location to see grocery stores delivering to you.
          </p>
        </div>
      ) : !hasStores ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <ShoppingBasket className="w-8 h-8 text-green-400" />
          </div>
          <h4 className="text-base font-bold text-gray-800 mb-1">No stores yet</h4>
          <p className="text-sm text-gray-500 max-w-[220px] leading-relaxed">
            No grocery stores available in your area right now. Check back soon!
          </p>
        </div>
      ) : (
        <div>
          {stores.map((store, index) => (
            <StoreCard key={store.id} store={store} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}
