import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Briefcase,
  Bus,
  Car,
  ChevronRight,
  FileText,
  Gift,
  Globe,
  HeadphonesIcon,
  History,
  IndianRupee,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldAlert,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { useSettings } from '../../../shared/context/SettingsContext';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import { clearDriverAuthState, getOwnerFleetDashboard } from '../services/registrationService';
import eqosyLogo from '@food/assets/eqosy-logo.png';

const ROUTE = '/taxi/owner';

const money = (value, symbol = '₹') =>
  `${symbol}${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const greetingFor = (timeZone = 'Asia/Kolkata') => {
  let hour = new Date().getHours();
  try {
    hour = Number(
      new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone }).format(new Date()),
    ) % 24;
  } catch {
    /* fall back to device time */
  }
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const toneStyles = {
  indigo: 'bg-indigo-50 text-indigo-600',
  orange: 'bg-orange-50 text-orange-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  slate: 'bg-slate-100 text-slate-600',
};

const SectionCard = ({ icon: Icon, title, hint, tone = 'indigo', badge, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group relative flex min-h-[132px] flex-col justify-between rounded-[1.75rem] border border-white/80 bg-white p-4 text-left shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all active:scale-[0.97]"
  >
    <div className="flex items-start justify-between">
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneStyles[tone]}`}>
        <Icon size={22} strokeWidth={2.4} />
      </span>
      {badge ? (
        <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white">{badge}</span>
      ) : (
        <ChevronRight size={16} className="mt-1 text-slate-300 transition group-active:translate-x-0.5" />
      )}
    </div>
    <div>
      <p className="text-[15px] font-black leading-tight tracking-tight text-slate-900">{title}</p>
      <p className="mt-1 text-[11px] font-bold leading-snug text-slate-400">{hint}</p>
    </div>
  </button>
);

const OwnerHome = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setError('');

    try {
      const response = await getOwnerFleetDashboard();
      setDashboard(response?.data?.data || response?.data || response);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message || requestError?.message || 'Unable to load your fleet data',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const profile = dashboard?.profile || {};
  const fleet = dashboard?.fleet || {};
  const bookings = dashboard?.bookings || {};
  const earnings = dashboard?.earnings || {};
  const busOverview = dashboard?.busOverview || {};
  const symbol = dashboard?.serviceLocation?.currencySymbol || '₹';
  const busEnabled = String(settings.transportRide?.enable_bus_service ?? '1') !== '0';
  const appName = settings.general?.app_name || 'Eqosy';
  const ownerName = profile.ownerName || profile.companyName || 'Owner';
  const greeting = useMemo(() => greetingFor(dashboard?.serviceLocation?.timezone), [dashboard]);

  const go = (path) => () => navigate(`${ROUTE}/${path}`);

  const handleLogout = () => {
    if (!window.confirm('Log out of your owner account?')) return;
    clearDriverAuthState();
    navigate(`${ROUTE}/login`, { replace: true });
  };

  const cards = [
    {
      icon: Users,
      title: 'Drivers',
      hint: dashboard
        ? `${fleet.totalDrivers || 0} total · ${fleet.onlineDrivers || 0} online`
        : 'Add and manage drivers',
      tone: 'indigo',
      badge: fleet.pendingDrivers > 0 ? `${fleet.pendingDrivers} pending` : '',
      path: 'manage-drivers',
    },
    {
      icon: Car,
      title: 'Vehicles',
      hint: dashboard
        ? `${fleet.totalVehicles || 0} total · ${fleet.approvedVehicles || 0} approved`
        : 'Your fleet vehicles',
      tone: 'orange',
      badge: fleet.pendingVehicles > 0 ? `${fleet.pendingVehicles} pending` : '',
      path: 'vehicle-fleet',
    },
    ...(busEnabled
      ? [
          {
            icon: Bus,
            title: 'Bus Services',
            hint: dashboard
              ? `${busOverview.totalBuses || 0} buses · ${busOverview.activeBuses || 0} active`
              : 'Routes, seats and prices',
            tone: 'emerald',
            path: 'bus-service',
          },
          {
            icon: Briefcase,
            title: 'Bus Bookings',
            hint: dashboard
              ? `${busOverview.upcomingBookings || 0} upcoming bookings`
              : 'Passenger bookings',
            tone: 'sky',
            path: 'bus-bookings',
          },
        ]
      : []),
    {
      icon: Wallet,
      title: 'Wallet',
      hint: dashboard ? `Balance ${money(profile.walletBalance, symbol)}` : 'Balance and payouts',
      tone: 'violet',
      path: 'wallet',
    },
    {
      icon: IndianRupee,
      title: 'Earnings',
      hint: dashboard ? `Today ${money(earnings.todayOwnerEarnings, symbol)}` : 'Daily and total earnings',
      tone: 'emerald',
      path: 'earnings',
    },
    {
      icon: History,
      title: 'Trip History',
      hint: dashboard ? `${bookings.completed || 0} completed trips` : 'All fleet trips',
      tone: 'amber',
      path: 'history',
    },
    {
      icon: BarChart3,
      title: 'Fleet Analytics',
      hint: 'Detailed reports and charts',
      tone: 'slate',
      path: 'analytics',
    },
    { icon: FileText, title: 'Documents', hint: 'Upload and verify papers', tone: 'sky', path: 'documents' },
    { icon: Bell, title: 'Notifications', hint: 'Alerts and updates', tone: 'rose', path: 'notifications' },
    { icon: Gift, title: 'Refer & Earn', hint: 'Invite owners and drivers', tone: 'orange', path: 'referral' },
    { icon: ShieldAlert, title: 'Safety', hint: 'SOS and emergency contacts', tone: 'rose', path: 'security' },
    { icon: HeadphonesIcon, title: 'Help & Support', hint: 'Chat and tickets', tone: 'indigo', path: 'help-support' },
    { icon: User, title: 'My Account', hint: 'Profile and settings', tone: 'slate', path: 'profile' },
  ];

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)]">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-xl">
            <Loader2 size={24} className="animate-spin" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Loading your fleet...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] pb-32"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <div className="mx-auto w-full max-w-md px-5 pt-6">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={settings.general?.logo || settings.customization?.logo || eqosyLogo}
              alt={appName}
              className="h-11 w-11 rounded-2xl bg-white object-contain p-1 shadow-sm"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = eqosyLogo;
              }}
            />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Owner Suite</p>
              <p className="text-base font-black tracking-tight text-slate-900">{appName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Change language"
              onClick={() => window.dispatchEvent(new Event('eqosy:open-language'))}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm active:scale-95"
            >
              <Globe size={18} />
            </button>
            <button
              type="button"
              aria-label="Refresh"
              onClick={() => loadDashboard({ silent: true })}
              disabled={isRefreshing}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm active:scale-95 disabled:opacity-60"
            >
              <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              aria-label="Log out"
              onClick={handleLogout}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-rose-500 shadow-sm active:scale-95"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Page title */}
        <section className="mt-7">
          <h1
            className="text-[32px] font-black leading-tight tracking-tight text-slate-900"
            style={{ fontFamily: "'Outfit', 'Plus Jakarta Sans', system-ui, sans-serif" }}
          >
            Home
          </h1>
          <p className="mt-1 truncate text-[14px] font-bold text-slate-500">
            {greeting}, <span className="text-slate-900">{ownerName}</span>
            {profile.companyName && profile.companyName !== ownerName ? ` · ${profile.companyName}` : ''}
          </p>
        </section>

        {error ? (
          <div className="mt-5 flex items-start justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
            <p className="text-[13px] font-bold leading-snug text-rose-600">{error}</p>
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="shrink-0 rounded-xl bg-rose-600 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Live fleet strip */}
        <section className="mt-6 grid grid-cols-3 gap-2">
          {[
            ['Online', fleet.onlineDrivers || 0, 'text-emerald-600'],
            ['On trip', fleet.busyDrivers || 0, 'text-orange-600'],
            ['Active rides', bookings.active || 0, 'text-indigo-600'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-2xl border border-white/80 bg-white px-3 py-3 text-center shadow-sm">
              <p className={`text-[20px] font-black leading-none ${tone}`}>{value}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            </div>
          ))}
        </section>

        {/* Section cards */}
        <section className="mt-7">
          <h2 className="mb-3 px-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
            Manage your business
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {cards.map((card) => (
              <SectionCard
                key={card.path}
                icon={card.icon}
                title={card.title}
                hint={card.hint}
                tone={card.tone}
                badge={card.badge}
                onClick={go(card.path)}
              />
            ))}
          </div>
        </section>
      </div>

      <DriverBottomNav />
    </div>
  );
};

export default OwnerHome;
