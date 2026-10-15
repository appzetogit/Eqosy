import React from 'react';

/**
 * Wraps desktop/CRM-style screens so they render like the rest of the captain app:
 * a phone-width column on a soft cream gradient, big rounded white cards, bold micro-labels.
 *
 * Tailwind's `sm:/md:/lg:/xl:` variants follow the *browser* width, so on a wide screen the CRM
 * layouts (multi-column grids, side-by-side rows) would still appear. The scoped rules below keep
 * those layouts in a single mobile column regardless of viewport. Plain `grid-cols-N` (e.g. the
 * seat map) has no breakpoint prefix and is left untouched.
 */
const APP_SKIN_CSS = `
.app-skin { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
.app-skin h1, .app-skin h2 { font-family: 'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif; letter-spacing: -0.03em; }
.app-skin [class*="sm:grid-cols-"], .app-skin [class*="md:grid-cols-"] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
.app-skin [class*="lg:grid-cols-"], .app-skin [class*="xl:grid-cols-"], .app-skin [class*="2xl:grid-cols-"] { grid-template-columns: minmax(0, 1fr) !important; }
.app-skin [class*="sm:flex-row"], .app-skin [class*="md:flex-row"], .app-skin [class*="lg:flex-row"], .app-skin [class*="xl:flex-row"] { flex-direction: column !important; align-items: stretch !important; }
.app-skin [class*="lg:col-span-"], .app-skin [class*="xl:col-span-"], .app-skin [class*="md:col-span-"] { grid-column: auto !important; }
.app-skin [class*="lg:w-"], .app-skin [class*="xl:w-"], .app-skin [class*="md:w-"] { width: 100% !important; }
.app-skin [class*="max-w-3xl"], .app-skin [class*="max-w-2xl"] { max-width: 100% !important; }
.app-skin button, .app-skin select, .app-skin input:not([type="checkbox"]):not([type="radio"]) { min-height: 44px; }
.app-skin section { border-radius: 2rem; }
`;

const AppSkin = ({ children, className = '' }) => (
  <div
    className={`app-skin min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] pb-32 ${className}`}
  >
    <style>{APP_SKIN_CSS}</style>
    <div className="mx-auto w-full max-w-md px-5 pb-8 pt-8">{children}</div>
  </div>
);

export default AppSkin;
