export const FOOD_USER_THEME_KEY = "foodUserTheme";
export const APP_THEME_KEY = "appTheme";
export const THEME_CHANGE_EVENT = "eqosy:theme-change";

export function normalizeTheme(theme) {
  return String(theme || "").trim().toLowerCase() === "dark" ? "dark" : "light";
}

export function getFoodUserTheme() {
  if (typeof localStorage === "undefined") return "light";
  return normalizeTheme(localStorage.getItem(FOOD_USER_THEME_KEY));
}

function clearNestedThemeClasses() {
  if (typeof document === "undefined") return;

  document.body?.classList.remove("dark", "light");
  document.getElementById("root")?.classList.remove("dark", "light");
}

export function applyTheme(theme) {
  if (typeof document === "undefined") return;

  const resolvedTheme = normalizeTheme(theme);
  const useDarkTheme = resolvedTheme === "dark";
  const root = document.documentElement;

  clearNestedThemeClasses();

  root.classList.remove("dark", "light");
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = useDarkTheme ? "dark" : "light";

  root.classList.add(useDarkTheme ? "dark" : "light");
}

export function applyFoodUserTheme() {
  const theme = getFoodUserTheme();
  applyTheme(theme);
  return theme;
}

export function saveFoodUserTheme(theme) {
  const normalizedTheme = normalizeTheme(theme);

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(FOOD_USER_THEME_KEY, normalizedTheme);
    localStorage.setItem(APP_THEME_KEY, normalizedTheme);
  }

  applyTheme(normalizedTheme);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: normalizedTheme } }),
    );
  }

  return normalizedTheme;
}

export function applySavedTheme() {
  const savedTheme =
    typeof localStorage !== "undefined"
      ? normalizeTheme(localStorage.getItem(APP_THEME_KEY))
      : "light";

  applyTheme(savedTheme);
  return savedTheme;
}

export function reassertFoodUserTheme() {
  const theme = getFoodUserTheme();
  applyTheme(theme);

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(APP_THEME_KEY, theme);
  }

  return theme;
}

export function syncThemeForPath(pathname = "") {
  const path = String(pathname || "");

  if (path.startsWith("/taxi/user")) {
    applyTheme("light");
    return "light";
  }

  if (path.startsWith("/food/")) {
    return reassertFoodUserTheme();
  }

  return applySavedTheme();
}

export function scheduleFoodThemeReassert() {
  if (typeof window === "undefined") return;

  reassertFoodUserTheme();

  window.requestAnimationFrame(() => {
    reassertFoodUserTheme();
    window.requestAnimationFrame(() => {
      reassertFoodUserTheme();
    });
  });

  window.setTimeout(() => {
    reassertFoodUserTheme();
  }, 0);
}
