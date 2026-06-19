import { useEffect, useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  FOOD_USER_THEME_KEY,
  THEME_CHANGE_EVENT,
  scheduleFoodThemeReassert,
  syncThemeForPath,
} from "../shared/utils/theme.js";

function applyThemeForLocation(pathname) {
  syncThemeForPath(pathname);

  if (pathname.startsWith("/food/")) {
    scheduleFoodThemeReassert();
  }
}

export default function ThemeSync() {
  const location = useLocation();

  useLayoutEffect(() => {
    applyThemeForLocation(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    applyThemeForLocation(location.pathname);

    const handlePageshow = () => {
      applyThemeForLocation(location.pathname);
    };

    const handleThemeChange = () => {
      if (location.pathname.startsWith("/food/")) {
        scheduleFoodThemeReassert();
      }
    };

    const handleStorage = (event) => {
      if (event.key && event.key !== FOOD_USER_THEME_KEY) return;
      if (location.pathname.startsWith("/food/")) {
        scheduleFoodThemeReassert();
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
  }, [location.pathname]);

  return null;
}
