import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Custom hook to detect scroll direction and show/hide bottom bars.
 * - Scroll DOWN (niche aane par) -> hides bottom bar (isVisible: false)
 * - Scroll UP (uppar jaane par) -> shows bottom bar (isVisible: true)
 * - Near top of page (scrollY <= topOffset) -> always shows bottom bar (isVisible: true)
 *
 * @param {Object} options
 * @param {number} [options.threshold=6] Minimum scroll delta (px) to trigger visibility change.
 * @param {number} [options.topOffset=20] Near-top scroll threshold where bar is always shown.
 * @returns {boolean} isVisible
 */
export function useHideOnScroll({ threshold = 6, topOffset = 20 } = {}) {
  const [isVisible, setIsVisible] = useState(true);
  const location = useLocation();
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const getScrollY = () => {
    if (typeof window === 'undefined') return 0;
    return (
      window.pageYOffset ||
      document.documentElement?.scrollTop ||
      window.scrollY ||
      document.body?.scrollTop ||
      0
    );
  };

  // Reset to visible on route / query change
  useEffect(() => {
    setIsVisible(true);
    lastScrollY.current = getScrollY();
  }, [location.pathname, location.search]);

  useEffect(() => {
    lastScrollY.current = getScrollY();

    const updateScrollDirection = () => {
      const currentScrollY = getScrollY();

      // Always show when near the top of the page
      if (currentScrollY <= topOffset) {
        setIsVisible(true);
        lastScrollY.current = currentScrollY;
        ticking.current = false;
        return;
      }

      // Ignore iOS rubber-band overscroll
      const scrollHeight = document.documentElement?.scrollHeight || document.body?.scrollHeight || 0;
      const maxScrollY = scrollHeight - window.innerHeight;

      if (currentScrollY < 0) {
        setIsVisible(true);
        lastScrollY.current = 0;
        ticking.current = false;
        return;
      }
      if (maxScrollY > 0 && currentScrollY > maxScrollY) {
        ticking.current = false;
        return;
      }

      const diff = currentScrollY - lastScrollY.current;

      // Only toggle if scroll difference exceeds threshold
      if (Math.abs(diff) >= threshold) {
        if (diff > 0) {
          // Scrolling DOWN (niche aane par) -> Hide bottom bar
          setIsVisible(false);
        } else {
          // Scrolling UP (uppar jaane par) -> Show bottom bar
          setIsVisible(true);
        }
        lastScrollY.current = currentScrollY;
      }

      ticking.current = false;
    };

    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(updateScrollDirection);
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
    };
  }, [threshold, topOffset]);

  return isVisible;
}

export default useHideOnScroll;
