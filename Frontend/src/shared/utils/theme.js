export const FOOD_USER_THEME_KEY = "foodUserTheme";
export const APP_THEME_KEY = "appTheme";
export const THEME_CHANGE_EVENT = "eqosy:theme-change";

const THEME_CSS_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--border",
  "--input",
  "--ring",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-ring",
];

const LIGHT_THEME_VALUES = {
  "--background": "#ffffff",
  "--foreground": "oklch(0.2 0.05 50)",
  "--card": "oklch(1 0 0)",
  "--card-foreground": "oklch(0.2 0.05 50)",
  "--popover": "oklch(1 0 0)",
  "--popover-foreground": "oklch(0.2 0.05 50)",
  "--primary": "oklch(0.7 0.15 85)",
  "--primary-foreground": "oklch(0.15 0.05 50)",
  "--secondary": "oklch(0.95 0.02 90)",
  "--secondary-foreground": "oklch(0.3 0.08 60)",
  "--muted": "oklch(0.96 0.01 90)",
  "--muted-foreground": "oklch(0.5 0.05 50)",
  "--accent": "oklch(0.92 0.08 75)",
  "--accent-foreground": "oklch(0.25 0.06 55)",
  "--destructive": "oklch(0.577 0.245 27.325)",
  "--border": "oklch(0.9 0.02 85)",
  "--input": "oklch(0.95 0.01 90)",
  "--ring": "oklch(0.7 0.15 85)",
  "--sidebar": "oklch(0.98 0.01 90)",
  "--sidebar-foreground": "oklch(0.2 0.05 50)",
  "--sidebar-primary": "oklch(0.7 0.15 85)",
  "--sidebar-primary-foreground": "oklch(0.15 0.05 50)",
  "--sidebar-accent": "oklch(0.95 0.02 90)",
  "--sidebar-accent-foreground": "oklch(0.3 0.08 60)",
  "--sidebar-border": "oklch(0.9 0.02 85)",
  "--sidebar-ring": "oklch(0.7 0.15 85)",
};

let reassertGeneration = 0;
let pendingRaf1 = null;
let pendingRaf2 = null;
let pendingTimeout = null;

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

function applyInlineThemeVars(root, useDarkTheme) {
  if (useDarkTheme) {
    for (const varName of THEME_CSS_VARS) {
      root.style.removeProperty(varName);
    }
    return;
  }

  for (const [varName, value] of Object.entries(LIGHT_THEME_VALUES)) {
    root.style.setProperty(varName, value);
  }
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
  applyInlineThemeVars(root, useDarkTheme);
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

export function cancelScheduledFoodThemeReassert() {
  reassertGeneration += 1;

  if (pendingRaf1 !== null) {
    cancelAnimationFrame(pendingRaf1);
    pendingRaf1 = null;
  }

  if (pendingRaf2 !== null) {
    cancelAnimationFrame(pendingRaf2);
    pendingRaf2 = null;
  }

  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
}

export function scheduleFoodThemeReassert(pathname) {
  if (typeof window === "undefined") return;

  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");

  if (!String(path).startsWith("/food/")) return;

  cancelScheduledFoodThemeReassert();
  const generation = reassertGeneration;

  const runIfValid = () => {
    if (generation !== reassertGeneration) return;
    if (!window.location.pathname.startsWith("/food/")) return;
    reassertFoodUserTheme();
  };

  reassertFoodUserTheme();

  pendingRaf1 = window.requestAnimationFrame(() => {
    pendingRaf1 = null;
    runIfValid();
    pendingRaf2 = window.requestAnimationFrame(() => {
      pendingRaf2 = null;
      runIfValid();
    });
  });

  pendingTimeout = window.setTimeout(() => {
    pendingTimeout = null;
    runIfValid();
  }, 0);
}
