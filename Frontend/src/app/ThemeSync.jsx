import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  FOOD_USER_THEME_KEY,
  THEME_CHANGE_EVENT,
  cancelScheduledFoodThemeReassert,
  reassertFoodUserTheme,
  scheduleFoodThemeReassert,
  syncThemeForPath,
} from "../shared/utils/theme.js";

export default function ThemeSync() {
  const location = useLocation();
  const pathname = location.pathname;

  useLayoutEffect(() => {
    cancelScheduledFoodThemeReassert();
    syncThemeForPath(pathname);

    if (pathname.startsWith("/food/")) {
      scheduleFoodThemeReassert(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    const handlePageshow = () => {
      cancelScheduledFoodThemeReassert();
      syncThemeForPath(pathname);

      if (pathname.startsWith("/food/")) {
        scheduleFoodThemeReassert(pathname);
      }
    };

    const handleThemeChange = () => {
      if (pathname.startsWith("/food/")) {
        scheduleFoodThemeReassert(pathname);
      }
    };

    const handleStorage = (event) => {
      if (event.key && event.key !== FOOD_USER_THEME_KEY) return;
      if (pathname.startsWith("/food/")) {
        reassertFoodUserTheme();
      }
    };

    window.addEventListener("pageshow", handlePageshow);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("pageshow", handlePageshow);
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [pathname]);

  return null;
}
