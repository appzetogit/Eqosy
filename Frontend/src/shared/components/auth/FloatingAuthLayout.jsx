import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  Bike,
  Car,
  ChefHat,
  Coffee,
  Cookie,
  Croissant,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Pizza,
  Receipt,
  Route,
  Soup,
  Store,
  Timer,
  Truck,
  UtensilsCrossed,
  Wallet,
  Zap,
} from 'lucide-react';

// One theme per app, every one drawn from the Eqosy logo (navy base, orange, lime, yellow).
// `gradient` paints the dark hero, `glow` / `glow2` are the two blurred lights behind the logo,
// `accent` -> `accent2` paints buttons, `accentDark` is the readable accent used for text on the cream sheet,
// `accentSoft` is the pale tint behind small chips and the +91 block.
export const AUTH_THEMES = {
  // Food customer: logo navy with orange + lime lights.
  food: {
    gradient: 'linear-gradient(180deg, #060A22 0%, #0C1336 55%, #16204F 100%)',
    glow: '#F7931E',
    glow2: '#7ED321',
    accent: '#F7931E',
    accent2: '#E85D04',
    accentDark: '#B84A06',
    accentSoft: '#FFF0CF',
    Icons: [UtensilsCrossed, Pizza, Coffee, Cookie],
  },
  // Restaurant partner: deep plum with a pink + orange mix.
  restaurant: {
    gradient: 'linear-gradient(180deg, #1F0716 0%, #4A0F33 55%, #7A1B3F 100%)',
    glow: '#F472B6',
    glow2: '#FB923C',
    accent: '#EC4899',
    accent2: '#F97316',
    accentDark: '#BE185D',
    accentSoft: '#FDEBF3',
    Icons: [Store, ChefHat, Receipt, Soup],
  },
  // Taxi driver: navy blue running into royal blue.
  driver: {
    gradient: 'linear-gradient(180deg, #040920 0%, #0A1A57 55%, #14308A 100%)',
    glow: '#3B82F6',
    glow2: '#818CF8',
    accent: '#3B6BF0',
    accent2: '#1E3A8A',
    accentDark: '#1E3A8A',
    accentSoft: '#E8EEFF',
    Icons: [Car, MapPin, Navigation, Route],
  },
  // Delivery partner: the green of the delivery jacket in the logo.
  delivery: {
    gradient: 'linear-gradient(180deg, #03160B 0%, #0A3A1C 55%, #136B30 100%)',
    glow: '#7ED321',
    glow2: '#FFC400',
    accent: '#1F9D4B',
    accent2: '#5FB410',
    accentDark: '#157A38',
    accentSoft: '#E9F8EC',
    Icons: [Bike, Package, Truck, Timer],
  },
};

const FLOATERS = [
  { top: '22%', left: '9%', size: 40, delay: 0, duration: 6.5 },
  { top: '16%', right: '9%', size: 46, delay: 0.8, duration: 7.5 },
  { top: '62%', left: '5%', size: 34, delay: 1.6, duration: 8 },
  { top: '58%', right: '6%', size: 38, delay: 0.4, duration: 6 },
];

function HeroBackground({ theme }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute -top-24 left-1/4 h-72 w-72 -translate-x-1/2 rounded-full blur-[90px]"
        style={{ background: theme.glow, opacity: 0.35 }}
      />
      <div
        className="absolute right-0 top-10 h-60 w-60 rounded-full blur-[90px]"
        style={{ background: theme.glow2, opacity: 0.25 }}
      />
      <div className="absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 rounded-full border border-white/10" />
      <div className="absolute left-1/2 top-4 h-96 w-96 -translate-x-1/2 rounded-full border border-white/5" />

      {FLOATERS.map(({ size, delay, duration, ...position }, index) => {
        const Icon = theme.Icons[index % theme.Icons.length];
        return (
          <motion.div
            key={index}
            className="absolute flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white/80 backdrop-blur-sm"
            style={{ ...position, width: size, height: size }}
            animate={reduceMotion ? undefined : { y: [0, -10, 0], rotate: [-5, 5, -5] }}
            transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Icon size={Math.round(size * 0.46)} strokeWidth={1.8} />
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Shared login shell: a dark themed hero (logo, brand, role chip) with a cream bottom sheet that
 * holds the title, the form (`children`) and the legal `footer`, pinned to the bottom of the screen.
 * `logo` is an image URL (falls back to the theme's first icon), `badge` is the small role chip.
 * `bottomInset` is the on-screen keyboard height on pages that track it.
 */
export default function FloatingAuthLayout({
  theme,
  logo,
  logoAlt = 'Logo',
  brand,
  badge,
  BadgeIcon,
  title,
  subtitle,
  onBack,
  bottomInset = 0,
  children,
  footer,
}) {
  const FallbackIcon = theme.Icons[0];
  const ChipIcon = BadgeIcon || FallbackIcon;

  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden font-sans"
      style={{ background: theme.gradient, paddingBottom: bottomInset || undefined }}
    >
      <HeroBackground theme={theme} />

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="absolute left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition-transform active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      ) : null}

      {/* Hero */}
      <div className="pointer-events-none relative z-10 flex select-none flex-col items-center px-6 pb-12 pt-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-[25px] p-[3px]"
          style={{
            background: `linear-gradient(135deg, ${theme.glow2}, ${theme.glow}, ${theme.accent})`,
            boxShadow: `0 18px 40px -12px ${theme.glow}b3`,
          }}
        >
          <div className="flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-[22px] bg-white">
            {logo ? (
              <img src={logo} alt={logoAlt} className="h-full w-full scale-110 object-cover" />
            ) : (
              <FallbackIcon size={30} style={{ color: theme.accent }} />
            )}
          </div>
        </motion.div>

        {brand ? <p className="mt-3 text-[20px] font-black leading-none tracking-tight text-white">{brand}</p> : null}

        {badge ? (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/90 backdrop-blur">
            <ChipIcon className="h-3.5 w-3.5" style={{ color: theme.glow }} strokeWidth={2.2} />
            {badge}
          </span>
        ) : null}
      </div>

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col rounded-t-[32px] bg-[#FFFDF6] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.6)]"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#D9DEEE]" />

        <div className="mb-4">
          <h1 className="text-[22px] font-black leading-tight text-[#0C1336]">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[14px] font-medium text-[#5E678A]">{subtitle}</p> : null}
        </div>

        <div className="mb-6 space-y-4">{children}</div>

        {footer ? <div className="mt-auto border-t border-[#E4E8F4] pt-3 text-center">{footer}</div> : null}
      </motion.div>
    </div>
  );
}

export function AuthPhoneField({
  theme,
  value,
  onChange,
  inputRef,
  hasError = false,
  label = 'Mobile Number',
  placeholder = 'Mobile number',
  prefix = '+91',
  ...inputProps
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = hasError ? '#F87171' : focused ? theme.accent : '#E4E8F4';
  const ring = hasError ? '#FEE2E2' : `${theme.accent}2e`;

  return (
    <div className="space-y-2">
      {label ? (
        <label className="ml-1 text-[10px] font-black uppercase tracking-[0.25em] text-[#8A93B2]">{label}</label>
      ) : null}
      <div
        className="flex h-16 items-stretch overflow-hidden rounded-2xl bg-white transition-all"
        style={{
          border: `1.5px solid ${borderColor}`,
          boxShadow: focused || hasError ? `0 0 0 4px ${ring}` : 'none',
        }}
      >
        <div
          className="flex items-center px-5 text-[18px] font-black"
          style={{ color: theme.accentDark, background: theme.accentSoft }}
        >
          {prefix}
        </div>
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          maxLength={10}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-4 text-[22px] font-extrabold tracking-[0.14em] text-[#0C1336] outline-none ring-0 placeholder:text-[17px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-[#AEB5CE]"
          {...inputProps}
        />
      </div>
    </div>
  );
}

export function AuthError({ message }) {
  if (!message) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-600"
    >
      <AlertCircle className="mt-px h-4 w-4 shrink-0" />
      <span>{message}</span>
    </motion.div>
  );
}

export function AuthButton({ theme, children, loading = false, loadingLabel, disabled = false, ...buttonProps }) {
  const inactive = disabled || loading;
  const off = disabled && !loading;

  return (
    <motion.button
      type="button"
      whileTap={inactive ? undefined : { scale: 0.98 }}
      disabled={inactive}
      className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-black tracking-wide transition-all disabled:cursor-not-allowed"
      style={{
        background: off ? '#E9ECF6' : `linear-gradient(135deg, ${theme.accent}, ${theme.accent2 || theme.accentDark})`,
        color: off ? '#A3AAC6' : '#fff',
        boxShadow: off ? 'none' : `0 14px 26px -10px ${theme.accent}cc`,
      }}
      {...buttonProps}
    >
      {loading ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{loadingLabel || 'Please wait...'}</span>
        </>
      ) : (
        children
      )}
    </motion.button>
  );
}
