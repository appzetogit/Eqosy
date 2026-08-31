import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Clock, Bookmark, ChevronLeft, ChevronRight, Zap, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';

const DEFAULT_DISH_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";
const DEFAULT_RESTAURANT_IMAGE = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80";

export default function CategoryDishCardSlider({
  restaurant,
  dishes = [],
  isFavorite = false,
  onFavoriteClick,
  onCardClick,
  backendOrigin = "",
  className = ""
}) {
  // Construct slide items from category dishes or fallback to restaurant image
  const slides = useMemo(() => {
    if (Array.isArray(dishes) && dishes.length > 0) {
      return dishes.map((dish, idx) => ({
        id: dish.itemId || dish._id || dish.id || `dish-${idx}`,
        name: dish.name || dish.categoryDishName || "Special Dish",
        price: dish.price ?? dish.categoryDishPrice ?? dish.originalPrice ?? 149,
        image: dish.image || dish.categoryDishImage || restaurant.categoryDishImage || restaurant.image || DEFAULT_DISH_IMAGE,
        foodType: dish.foodType || dish.categoryDishFoodType || (restaurant.pureVegRestaurant ? 'Veg' : 'Non-Veg'),
        dishObj: dish
      }));
    }

    // Fallback single slide
    return [{
      id: `rest-${restaurant._id || restaurant.id || 'single'}`,
      name: restaurant.categoryDishName || restaurant.featuredDish || restaurant.name || "Featured Item",
      price: restaurant.categoryDishPrice || restaurant.featuredPrice || 149,
      image: restaurant.categoryDishImage || restaurant.image || DEFAULT_RESTAURANT_IMAGE,
      foodType: restaurant.categoryDishFoodType || (restaurant.pureVegRestaurant ? 'Veg' : 'Non-Veg'),
      dishObj: null
    }];
  }, [dishes, restaurant]);

  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);
  const isSwiping = useRef(false);
  const autoSlideTimerRef = useRef(null);

  const safeIndex = slides.length > 0 ? (activeIndex % slides.length + slides.length) % slides.length : 0;
  const currentSlide = slides[safeIndex] || slides[0];

  // Reset slider index when restaurant or dishes change
  useEffect(() => {
    setActiveIndex(0);
  }, [restaurant?._id, restaurant?.id, dishes?.length]);

  // Auto-slide effect
  useEffect(() => {
    if (slides.length <= 1) return;

    autoSlideTimerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 3800);

    return () => {
      if (autoSlideTimerRef.current) clearInterval(autoSlideTimerRef.current);
    };
  }, [slides.length]);

  const handlePrev = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleNext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    isSwiping.current = false;
  };

  const handleTouchMove = (e) => {
    const currentX = e.touches[0].clientX;
    const diff = touchStartX.current - currentX;
    if (Math.abs(diff) > 10) {
      isSwiping.current = true;
    }
  };

  const handleTouchEnd = (e) => {
    if (!isSwiping.current) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    const minSwipeDistance = 40;
    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        setActiveIndex((prev) => (prev + 1) % slides.length);
      } else {
        setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
      }
    }
  };

  const restaurantName = restaurant.restaurantName || restaurant.name || "Restaurant";
  const restaurantSlug = restaurant.slug || restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const targetUrl = currentSlide?.dishObj?.itemId 
    ? `/food/user/restaurants/${restaurantSlug}?dish=${encodeURIComponent(String(currentSlide.dishObj.itemId))}`
    : `/food/user/restaurants/${restaurantSlug}`;

  const isVeg = currentSlide.foodType === 'Veg' || (currentSlide.foodType !== 'Non-Veg' && restaurant.pureVegRestaurant);

  return (
    <div 
      className={`group relative bg-white dark:bg-[#1a1a1a] rounded-3xl overflow-hidden border border-slate-100 dark:border-zinc-800 shadow-md hover:shadow-2xl transition-all duration-300 flex flex-col h-full ${className}`}
      onClick={onCardClick}
    >
      <Link to={targetUrl} className="block flex-1 flex flex-col">
        {/* Top Image Slider Area */}
        <div 
          className="relative w-full aspect-[16/10] sm:aspect-[16/9] overflow-hidden bg-slate-100 dark:bg-zinc-900 flex-shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Animated Slide Image */}
          <AnimatePresence mode="wait">
            <motion.img
              key={currentSlide.id}
              src={currentSlide.image}
              alt={currentSlide.name}
              initial={{ opacity: 0.6, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.4 }}
              transition={{ duration: 0.35 }}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = restaurant.image || DEFAULT_RESTAURANT_IMAGE;
              }}
            />
          </AnimatePresence>

          {/* Vignette Overlay Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

          {/* Floating Zomato-Style Overlay Badge (Top Left) */}
          <div className="absolute top-3 left-3 z-20 flex items-center max-w-[80%] pointer-events-none">
            <div className="bg-slate-950/85 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-xs font-bold tracking-tight flex items-center gap-2 shadow-2xl border border-white/20">
              {/* Veg / Non-Veg Indicator Icon */}
              <span className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${
                isVeg ? 'border-emerald-500 bg-emerald-950/80' : 'border-rose-500 bg-rose-950/80'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isVeg ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              </span>

              {/* Dish Name */}
              <span className="font-bold text-white text-xs sm:text-sm truncate max-w-[110px] sm:max-w-[160px]">
                {currentSlide.name}
              </span>

              <span className="text-white/40">·</span>

              {/* Dish Price */}
              <span className="font-black text-amber-400 text-xs sm:text-sm">
                ₹{Math.round(currentSlide.price)}
              </span>
            </div>
          </div>

          {/* Bookmark Button (Top Right) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFavoriteClick?.(restaurant._id || restaurant.id);
            }}
            className="absolute top-3 right-3 z-20 p-2 bg-slate-950/60 backdrop-blur-md rounded-full text-white hover:bg-slate-900 hover:scale-110 transition-all shadow-md"
          >
            <Bookmark className={`w-4 h-4 ${isFavorite ? "fill-amber-400 text-amber-400" : "text-white"}`} />
          </button>

          {/* Desktop Hover Chevron Controls */}
          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="hidden group-hover:flex absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/50 text-white items-center justify-center backdrop-blur-sm hover:bg-black/70 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="hidden group-hover:flex absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/50 text-white items-center justify-center backdrop-blur-sm hover:bg-black/70 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Bottom Dot Pagination Indicators */}
          {slides.length > 1 && (
            <div className="absolute bottom-2.5 left-0 right-0 flex justify-center items-center gap-1.5 z-20 pointer-events-none">
              {slides.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === safeIndex 
                      ? 'w-5 bg-white shadow-md' 
                      : 'w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Card Footer (Restaurant Info) */}
        <div className="p-4 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg line-clamp-1 group-hover:text-rose-600 transition-colors">
                {restaurantName}
              </h3>

              {/* Rating Badge */}
              <div className="bg-emerald-600 text-white px-2 py-0.5 rounded-lg text-xs font-black flex items-center gap-1 shadow-sm flex-shrink-0">
                <span>{restaurant.rating ? Number(restaurant.rating).toFixed(1) : "4.1"}</span>
                <Star className="w-3 h-3 fill-current" />
              </div>
            </div>

            {/* Cuisines / Subtitle */}
            <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1 mb-3">
              {Array.isArray(restaurant.cuisines) 
                ? restaurant.cuisines.join(", ") 
                : restaurant.cuisine || restaurant.area || "Popular Eatery"}
            </p>
          </div>

          {/* Sub-info: Delivery Time & Offers */}
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-zinc-800 text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-300">
              <Zap className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
              <span>{restaurant.deliveryTime || restaurant.estimatedDeliveryTime || "25-30 mins"}</span>
              {restaurant.distanceKm && (
                <span className="text-slate-400">• {restaurant.distanceKm} km</span>
              )}
            </div>

            {(restaurant.offer || restaurant.discount || restaurant.offerText || restaurant.discountText) ? (
              <div className="flex items-center gap-1.5 text-[#2563EB] dark:text-blue-300 font-bold text-[11px] bg-[#F4F7FE] dark:bg-blue-950/40 border border-[#DCE4F7] dark:border-blue-900/50 px-2 py-0.5 rounded-lg">
                <span className="w-3.5 h-3.5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[9px] font-black shrink-0">
                  %
                </span>
                <span className="truncate max-w-[140px]">{restaurant.offer || restaurant.discount || restaurant.offerText || restaurant.discountText}</span>
              </div>
            ) : null}
          </div>
        </div>
      </Link>
    </div>
  );
}
