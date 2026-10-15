import React from 'react';
import { ArrowLeft } from 'lucide-react';

// Small app-style building blocks shared by the owner Bus screens (list, form, details, bookings),
// so they all match the Owner Home look: cream gradient, phone-width column, big rounded white cards.

export const Screen = ({ children, footer = null }) => (
  <div
    className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] pb-36"
    style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
  >
    <div className="mx-auto w-full max-w-md px-5 pt-6">{children}</div>
    {footer}
  </div>
);

export const TopBar = ({ title, subtitle, onBack, action = null }) => (
  <header className="mb-5 flex items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      {onBack ? (
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-800 shadow-sm active:scale-95"
        >
          <ArrowLeft size={19} />
        </button>
      ) : null}
      <div className="min-w-0">
        {subtitle ? (
          <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{subtitle}</p>
        ) : null}
        <h1
          className="truncate text-[24px] font-black leading-tight tracking-tight text-slate-900"
          style={{ fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" }}
        >
          {title}
        </h1>
      </div>
    </div>
    {action}
  </header>
);

export const Card = ({ children, className = '', onClick }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`block w-full rounded-[1.75rem] border border-white/80 bg-white p-4 text-left shadow-[0_10px_30px_rgba(15,23,42,0.06)] ${
        onClick ? 'transition active:scale-[0.99]' : ''
      } ${className}`}
    >
      {children}
    </Tag>
  );
};

export const SectionLabel = ({ children, right = null }) => (
  <div className="mb-2.5 mt-6 flex items-center justify-between px-1">
    <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{children}</h2>
    {right}
  </div>
);

export const Field = ({ label, required = false, hint, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-[12px] font-black text-slate-600">
      {label}
      {required ? <span className="text-rose-500"> *</span> : null}
    </span>
    {children}
    {hint ? <span className="mt-1 block text-[11px] font-semibold text-slate-400">{hint}</span> : null}
  </label>
);

const controlClass =
  'h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[15px] font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:bg-white';

export const Input = (props) => <input {...props} className={`${controlClass} ${props.className || ''}`} />;

export const Select = ({ children, ...props }) => (
  <select {...props} className={`${controlClass} appearance-none ${props.className || ''}`}>
    {children}
  </select>
);

export const Chip = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`shrink-0 rounded-full border px-4 py-2 text-[12px] font-black transition active:scale-95 ${
      active ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600'
    }`}
  >
    {children}
  </button>
);

export const PrimaryButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-[15px] font-black text-white shadow-[0_16px_40px_rgba(15,23,42,0.22)] transition active:scale-[0.98] disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

export const SecondaryButton = ({ children, className = '', ...props }) => (
  <button
    type="button"
    {...props}
    className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-[15px] font-black text-slate-800 transition active:scale-[0.98] disabled:opacity-50 ${className}`}
  >
    {children}
  </button>
);

/** Sticky action bar that sits above the bottom navigation. */
export const StickyActions = ({ children }) => (
  <div className="fixed inset-x-0 bottom-[84px] z-30 px-5">
    <div className="mx-auto flex max-w-md gap-3 rounded-[1.75rem] border border-white/80 bg-white/95 p-2.5 shadow-[0_-10px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      {children}
    </div>
  </div>
);

const STATUS_STYLES = {
  active: ['Active', 'bg-emerald-50 text-emerald-700'],
  approved: ['Approved', 'bg-emerald-50 text-emerald-700'],
  pending_approval: ['In review', 'bg-amber-50 text-amber-700'],
  pending: ['Pending', 'bg-amber-50 text-amber-700'],
  draft: ['Draft', 'bg-slate-100 text-slate-600'],
  paused: ['Paused', 'bg-slate-100 text-slate-600'],
  rejected: ['Rejected', 'bg-rose-50 text-rose-700'],
  confirmed: ['Confirmed', 'bg-emerald-50 text-emerald-700'],
  cancelled: ['Cancelled', 'bg-rose-50 text-rose-700'],
  failed: ['Failed', 'bg-slate-100 text-slate-600'],
  expired: ['Expired', 'bg-slate-100 text-slate-600'],
};

export const StatusPill = ({ status }) => {
  const key = String(status || 'draft').toLowerCase();
  const [label, tone] = STATUS_STYLES[key] || [key.replace(/_/g, ' '), 'bg-slate-100 text-slate-600'];
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${tone}`}>
      {label}
    </span>
  );
};

export const EmptyState = ({ icon: Icon, title, text, action = null }) => (
  <Card className="flex flex-col items-center px-6 py-10 text-center">
    {Icon ? (
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-slate-100 text-slate-500">
        <Icon size={28} />
      </span>
    ) : null}
    <p className="text-[17px] font-black text-slate-900">{title}</p>
    {text ? <p className="mt-1.5 max-w-[28ch] text-[13px] font-semibold leading-relaxed text-slate-500">{text}</p> : null}
    {action ? <div className="mt-5 w-full">{action}</div> : null}
  </Card>
);

export const formatMoney = (amount = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount || 0));
