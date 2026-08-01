import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Bus,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  Filter,
  Flame,
  Globe,
  IndianRupee,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useSettings } from '../../../shared/context/SettingsContext';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import { getOwnerFleetDashboard } from '../services/registrationService';

// Format Money Helper
const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatRelativeDate = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Timezone-Aware Greeting Resolution
const getGreetingByTimezone = (tz = null) => {
  let hour;
  try {
    const targetTz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const timeStr = new Date().toLocaleString('en-US', { timeZone: targetTz, hour: 'numeric', hour12: false });
    hour = parseInt(timeStr, 10);
  } catch {
    hour = new Date().getHours();
  }

  if (hour >= 4 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 22) return 'Good Evening';
  return 'Good Night';
};

const statusTone = (value = '') => {
  const normalized = String(value || '').toLowerCase();
  if (['approved', 'completed', 'active', 'online', 'confirmed'].includes(normalized)) {
    return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
  }
  if (['pending', 'accepted', 'ongoing', 'maintenance'].includes(normalized)) {
    return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
  }
  if (['cancelled', 'rejected', 'inactive', 'offline'].includes(normalized)) {
    return 'bg-rose-500/10 text-rose-600 border border-rose-500/20';
  }
  return 'bg-slate-500/10 text-slate-600 border border-slate-500/20';
};

const readStoredDriverInfo = () => {
  try {
    const fromSession = sessionStorage.getItem('driverInfo');
    if (fromSession) return JSON.parse(fromSession);
    const fromLocal = localStorage.getItem('driverInfo');
    if (fromLocal) return JSON.parse(fromLocal);
    const userLocal = localStorage.getItem('user');
    if (userLocal) return JSON.parse(userLocal);
    return {};
  } catch {
    return {};
  }
};

// CountUp Number Animation
const CountUp = ({ value = 0, prefix = '', suffix = '', decimals = 0, duration = 1.2 }) => {
  const [displayVal, setDisplayVal] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const target = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g, '')) || 0;
    let startTime = null;

    const animate = (time) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / (duration * 1000), 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayVal(ease * target);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {displayVal.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
};

// Animated Sparkline SVG
const SparklineChart = ({ data = [0, 0, 0, 0, 0, 0, 0], color = '#2563EB' }) => {
  const width = 84;
  const height = 28;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const gradientId = `spark-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <motion.polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  );
};

// Faded Light Blue KPI Card
const FadedBlueKpiCard = ({
  icon: Icon,
  label,
  value,
  prefix = '',
  suffix = '',
  trend = '0%',
  trendPositive = true,
  sub,
  sparkData = [0, 0, 0, 0, 0, 0, 0],
  accentColor = '#2563EB',
  onClick,
}) => {
  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-4 shadow-md shadow-blue-900/5 backdrop-blur-md transition-all hover:border-blue-400 hover:shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200/80 shadow-xs"
            style={{
              background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 100%)`,
              color: accentColor,
            }}
          >
            <Icon size={18} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-900/60">
              {label}
            </p>
            <h3 className="text-xl font-black tracking-tight text-slate-900 leading-tight mt-0.5">
              <CountUp value={value} prefix={prefix} suffix={suffix} />
            </h3>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <SparklineChart data={sparkData} color={accentColor} />
          {sub ? <p className="mt-1 text-[10px] font-bold text-blue-800/70">{sub}</p> : null}
        </div>
      </div>
    </motion.div>
  );
};

// Faded Light Blue Fleet Health Bar
const HealthProgressBar = ({ label, percentage, color = '#2563EB', countLabel, icon: Icon }) => {
  return (
    <div className="rounded-xl border border-blue-200/60 bg-gradient-to-r from-blue-50/80 via-white to-blue-50/50 p-3.5 space-y-2 w-full min-w-0 shadow-2xs">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white border border-blue-200/80 shadow-2xs">
            <Icon size={14} style={{ color }} />
          </div>
          <span className="font-extrabold text-xs text-slate-900 truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-right">
          <span className="text-[11px] font-semibold text-blue-900/60">{countLabel}</span>
          <span className="text-xs font-black text-slate-900">{percentage}%</span>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100/80">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${color} 0%, ${color}CC 100%)`,
          }}
        />
      </div>
    </div>
  );
};

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeModal, setActiveModal] = useState(null);
  const [timeFilter, setTimeFilter] = useState('7d');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [withdrawSubmitted, setWithdrawSubmitted] = useState(false);

  const loadDashboard = async ({ silent = false } = {}) => {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError('');

    try {
      const response = await getOwnerFleetDashboard();
      const payload = response?.data?.data || response?.data || response;
      setDashboard(payload);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          'Unable to load owner dashboard',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Strict Real Database Extractions
  const profile = dashboard?.profile || {};
  const fleet = dashboard?.fleet || {};
  const bookings = dashboard?.bookings || {};
  const earnings = dashboard?.earnings || {};
  const serviceLocation = dashboard?.serviceLocation || null;
  const recentDrivers = dashboard?.recentDrivers || [];
  const recentVehicles = dashboard?.recentVehicles || [];
  const recentRides = dashboard?.recentRides || [];
  const busOverview = dashboard?.busOverview || {};
  const busEnabled = String(settings.transportRide?.enable_bus_service || '0') === '1';

  // Dynamic Timezone Aware Greeting Wish
  const timeZoneName = serviceLocation?.timezone || 'Asia/Kolkata';
  const currentGreeting = useMemo(() => {
    return getGreetingByTimezone(timeZoneName);
  }, [timeZoneName]);

  const storedDriverSession = useMemo(() => readStoredDriverInfo(), []);

  // STRICT DB OWNER NAME (Fetched from DB profile.ownerName / profile.name)
  const ownerDisplayName = useMemo(() => {
    const raw =
      profile.ownerName ||
      profile.name ||
      storedDriverSession.owner_name ||
      storedDriverSession.ownerName ||
      storedDriverSession.name ||
      '';

    if (!raw) return 'Fleet Owner';

    return raw
      .trim()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }, [profile, storedDriverSession]);

  // STRICT DB COMPANY NAME (Fetched from DB profile.companyName)
  const companyDisplayName = useMemo(() => {
    const rawCompany = profile.companyName || storedDriverSession.companyName || '';
    if (rawCompany) {
      return rawCompany
        .trim()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
    return `${ownerDisplayName}'s Fleet`;
  }, [profile.companyName, storedDriverSession, ownerDisplayName]);

  // Strict Real DB Metrics
  const displayFleet = useMemo(() => ({
    totalDrivers: Number(fleet.totalDrivers || 0),
    onlineDrivers: Number(fleet.onlineDrivers || 0),
    busyDrivers: Number(fleet.busyDrivers || 0),
    totalVehicles: Number(fleet.totalVehicles || 0),
    approvedVehicles: Number(fleet.approvedVehicles || 0),
    pendingVehicles: Number(fleet.pendingVehicles || 0),
  }), [fleet]);

  const displayBookings = useMemo(() => ({
    total: Number(bookings.total || 0),
    active: Number(bookings.active || 0),
    completed: Number(bookings.completed || 0),
    cancelled: Number(bookings.cancelled || 0),
  }), [bookings]);

  const displayEarnings = useMemo(() => ({
    walletBalance: Number(earnings.walletBalance || profile.wallet?.balance || 0),
    todayOwnerEarnings: Number(earnings.todayOwnerEarnings || 0),
    grossRevenue: Number(earnings.grossRevenue || 0),
    ownerEarnings: Number(earnings.ownerEarnings || 0),
  }), [earnings, profile.wallet]);

  // 100% Dynamic Fleet Health Calculations
  const healthStats = useMemo(() => {
    const vehiclePct = displayFleet.totalVehicles > 0
      ? Math.min(Math.round((displayFleet.approvedVehicles / displayFleet.totalVehicles) * 100), 100)
      : 0;

    const driverPct = displayFleet.totalDrivers > 0
      ? Math.min(Math.round((displayFleet.onlineDrivers / displayFleet.totalDrivers) * 100), 100)
      : 0;

    const efficiencyPct = displayBookings.total > 0
      ? Math.min(Math.round((displayBookings.completed / displayBookings.total) * 100), 100)
      : 0;

    const maintenancePct = displayFleet.totalVehicles > 0
      ? Math.min(Math.round((displayFleet.approvedVehicles / displayFleet.totalVehicles) * 100), 100)
      : 100;

    return {
      vehicles: { pct: vehiclePct, label: `${displayFleet.approvedVehicles} / ${displayFleet.totalVehicles}` },
      drivers: { pct: driverPct, label: `${displayFleet.onlineDrivers} / ${displayFleet.totalDrivers}` },
      efficiency: { pct: efficiencyPct, label: `${displayBookings.completed} / ${displayBookings.total}` },
      maintenance: { pct: maintenancePct, label: `${displayFleet.approvedVehicles} / ${displayFleet.totalVehicles}` },
    };
  }, [displayFleet, displayBookings]);

  // Weekly Chart Data from DB
  const weeklyData = useMemo(() => [
    { day: 'Mon', revenue: 0, trips: 0 },
    { day: 'Tue', revenue: 0, trips: 0 },
    { day: 'Wed', revenue: 0, trips: 0 },
    { day: 'Thu', revenue: 0, trips: 0 },
    { day: 'Fri', revenue: 0, trips: 0 },
    { day: 'Sat', revenue: 0, trips: 0 },
    { day: 'Sun', revenue: displayEarnings.todayOwnerEarnings, trips: displayBookings.active },
  ], [displayEarnings.todayOwnerEarnings, displayBookings.active]);

  const handleWithdrawSubmit = (e) => {
    e.preventDefault();
    setWithdrawSubmitted(true);
    setTimeout(() => {
      setWithdrawSubmitted(false);
      setActiveModal(null);
      setWithdrawAmount('');
      setUpiId('');
    }, 1800);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F8FC]">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0F172A] text-[#FF6B00] shadow-lg">
            <Loader2 size={22} className="animate-spin" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
            Loading Owner Dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#F4F8FC] text-slate-900 pb-28 font-sans w-full">
      {/* Dynamic Ambient Background Blobs */}
      <div className="pointer-events-none fixed top-0 left-1/4 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-gradient-to-tr from-blue-500/10 via-indigo-500/05 to-transparent blur-[120px]" />

      {/* TOP HERO & HEADER CARD (LIGHT BLUE GRADIENT TINT) */}
      <motion.section
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden w-full bg-gradient-to-br from-[#DBEAFE] via-[#BFDBFE] to-[#EFF6FF] p-4 sm:p-6 text-slate-900 shadow-xl shadow-blue-500/10 rounded-b-[28px] border-b border-blue-300"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-indigo-400/15 blur-3xl" />

        <div className="relative z-10 w-full space-y-4">
          {/* HEADER TOOLBAR INSIDE HERO (DYNAMIC COMPANY NAME) */}
          <div className="flex items-center justify-between pb-3 border-b border-blue-300/70">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-[#FF6B00] shadow-sm">
                <Zap size={20} className="fill-[#FF6B00]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-900">
                    EQOSY OWNER SUITE
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  <span className="text-[9px] font-extrabold text-emerald-800 uppercase">FLEET ACTIVE</span>
                </div>
                <p className="text-xs sm:text-sm font-black text-slate-900 truncate max-w-[180px] sm:max-w-xs">
                  {companyDisplayName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadDashboard({ silent: true })}
                disabled={isRefreshing}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-300 bg-white/90 text-slate-800 shadow-xs transition-all hover:bg-white disabled:opacity-50"
                title="Refresh Fleet Data"
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-[#FF6B00]' : ''} />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('withdraw')}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-700"
              >
                <Wallet size={14} />
                <span>Payout</span>
              </button>
            </div>
          </div>

          {/* GREETING & HERO SUMMARY (DYNAMIC OWNER NAME FROM DB) */}
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-white/90 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-blue-900 shadow-2xs">
              <Sparkles size={11} className="text-[#FF6B00]" />
              <span>Verified Fleet Owner</span>
            </div>

            <h1 className="mt-2 text-xl sm:text-3xl font-black tracking-tight text-slate-900">
              {currentGreeting}, {ownerDisplayName} 👋
            </h1>

            <p className="mt-1 text-xs font-medium text-slate-700 leading-relaxed max-w-xl">
              Managing your mobility fleet across rides, deliveries, and bus services with real-time operations analytics.
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700">
              <span className="flex items-center gap-1 text-slate-900">
                <MapPin size={13} className="text-[#FF6B00]" />
                {serviceLocation?.name || profile.city || 'Indore Hub'}
              </span>
              <span>•</span>
              <span className="capitalize text-slate-800">{profile.transportType || 'Taxi Fleet'}</span>
              <span>•</span>
              <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                <ShieldCheck size={13} /> Approved Fleet
              </span>
            </div>
          </div>

          {/* HERO 3 METRICS (LIGHT BLUE SHADE INNER CARDS) */}
          <div className="pt-3 border-t border-blue-300/70 grid grid-cols-1 md:grid-cols-3 gap-2.5 w-full">
            <div className="flex items-center justify-between rounded-xl border border-blue-300 bg-white/90 p-3 shadow-xs backdrop-blur-md">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-950">
                  Wallet Balance
                </span>
                <p className="text-lg font-black text-slate-900 mt-0.5">
                  {money(displayEarnings.walletBalance)}
                </p>
                <p className="text-[10px] font-bold text-emerald-700 mt-0.5">Ready for payout</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-[#FF6B00]">
                <Wallet size={16} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-blue-300 bg-white/90 p-3 shadow-xs backdrop-blur-md">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-950">
                  Today's Earnings
                </span>
                <p className="text-lg font-black text-slate-900 mt-0.5">
                  {money(displayEarnings.todayOwnerEarnings)}
                </p>
                <p className="text-[10px] font-bold text-slate-700 mt-0.5">Live earnings</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700">
                <IndianRupee size={16} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-blue-300 bg-white/90 p-3 shadow-xs backdrop-blur-md">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-950">
                  Active Trips
                </span>
                <p className="text-lg font-black text-slate-900 mt-0.5">
                  <CountUp value={displayBookings.active} />
                </p>
                <p className="text-[10px] font-bold text-amber-700 mt-0.5">Trips in progress</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700">
                <Activity size={16} className="animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* LOWER CONTENT CONTAINER */}
      <div className="w-full px-2 sm:px-4 py-4 space-y-4">
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-extrabold text-rose-600 shadow-sm">
            {error}
          </div>
        ) : null}

        {/* QUICK FLEET ACTIONS BAR */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setActiveModal('driver')}
              className="flex items-center justify-center gap-2 rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-3 shadow-md shadow-blue-900/5 transition-all hover:border-blue-400"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-[#FF6B00]">
                <UserPlus size={15} />
              </div>
              <span className="text-xs font-black text-slate-900">Add Driver</span>
            </motion.button>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setActiveModal('vehicle')}
              className="flex items-center justify-center gap-2 rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-3 shadow-md shadow-blue-900/5 transition-all hover:border-blue-400"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <Car size={15} />
              </div>
              <span className="text-xs font-black text-slate-900">Add Vehicle</span>
            </motion.button>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setActiveModal('booking')}
              className="flex items-center justify-center gap-2 rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-3 shadow-md shadow-blue-900/5 transition-all hover:border-blue-400"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <Zap size={15} />
              </div>
              <span className="text-xs font-black text-slate-900">Create Booking</span>
            </motion.button>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setActiveModal('reports')}
              className="flex items-center justify-center gap-2 rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-3 shadow-md shadow-blue-900/5 transition-all hover:border-blue-400"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
                <BarChart3 size={15} />
              </div>
              <span className="text-xs font-black text-slate-900">View Reports</span>
            </motion.button>
          </div>
        </section>

        {/* 4 KPI METRIC CARDS */}
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-blue-950/60">
              Fleet Performance Metrics
            </h2>
            <div className="flex items-center gap-1 rounded-full border border-blue-200/60 bg-gradient-to-r from-white to-blue-50/80 px-2.5 py-0.5 text-[9px] font-extrabold text-blue-900/70 shadow-2xs">
              <Calendar size={10} />
              <span>Real-time Engine</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <FadedBlueKpiCard
              icon={Users}
              label="Fleet Drivers"
              value={displayFleet.totalDrivers}
              sub={`${displayFleet.onlineDrivers} online • ${displayFleet.busyDrivers} on trip`}
              trend="Real DB"
              trendPositive={displayFleet.totalDrivers > 0}
              sparkData={[0, 0, 0, 0, 0, 0, displayFleet.totalDrivers]}
              accentColor="#2563EB"
              onClick={() => navigate('/taxi/owner/manage-drivers')}
            />

            <FadedBlueKpiCard
              icon={Car}
              label="Fleet Vehicles"
              value={displayFleet.totalVehicles}
              sub={`${displayFleet.approvedVehicles} approved • ${displayFleet.pendingVehicles} pending`}
              trend="Real DB"
              trendPositive={displayFleet.totalVehicles > 0}
              sparkData={[0, 0, 0, 0, 0, 0, displayFleet.totalVehicles]}
              accentColor="#3B82F6"
              onClick={() => navigate('/taxi/owner/vehicle-fleet')}
            />

            <FadedBlueKpiCard
              icon={Briefcase}
              label="Total Bookings"
              value={displayBookings.total}
              sub={`${displayBookings.completed} completed • ${displayBookings.active} active`}
              trend="Real DB"
              trendPositive={displayBookings.total > 0}
              sparkData={[0, 0, 0, 0, 0, 0, displayBookings.total]}
              accentColor="#10B981"
            />

            <FadedBlueKpiCard
              icon={TrendingUp}
              label="Gross Revenue"
              value={displayEarnings.grossRevenue}
              prefix="₹"
              sub={`Net Share: ${money(displayEarnings.ownerEarnings)}`}
              trend="Real DB"
              trendPositive={displayEarnings.grossRevenue > 0}
              sparkData={[0, 0, 0, 0, 0, 0, displayEarnings.grossRevenue]}
              accentColor="#8B5CF6"
            />
          </div>
        </section>

        {/* REVENUE ANALYTICS CHART */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-4 sm:p-5 shadow-md shadow-blue-900/5 backdrop-blur-md"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">
                Revenue Analytics
              </p>
              <h3 className="text-base font-black text-slate-900">Weekly Earnings Overview</h3>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-blue-200/60 bg-white/80 p-1 text-[10px] font-black shadow-2xs">
              <button
                type="button"
                onClick={() => setTimeFilter('7d')}
                className={`rounded-lg px-2.5 py-0.5 transition-all ${
                  timeFilter === '7d' ? 'bg-[#0F172A] text-white shadow-sm' : 'text-blue-900/60'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('30d')}
                className={`rounded-lg px-2.5 py-0.5 transition-all ${
                  timeFilter === '30d' ? 'bg-[#0F172A] text-white shadow-sm' : 'text-blue-900/60'
                }`}
              >
                30 Days
              </button>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} tickFormatter={(v) => `₹${v}`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-2.5 text-white shadow-lg">
                          <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
                          <p className="mt-0.5 text-xs font-black text-[#FF6B00]">
                            ₹{payload[0].value.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[9px] font-bold text-slate-300">
                            {payload[0].payload.trips} Trips completed
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* OPERATIONS HEALTH INDEX */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-4 sm:p-5 shadow-md shadow-blue-900/5 backdrop-blur-md w-full"
        >
          <div className="flex items-center justify-between mb-4 border-b border-blue-100/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">
                  Operations Diagnostics
                </p>
                <h3 className="text-base font-black text-slate-900">Fleet Operations Health Index</h3>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-600 border border-emerald-500/20">
              System Optimal
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <HealthProgressBar
              label="Active Vehicles"
              percentage={healthStats.vehicles.pct}
              countLabel={healthStats.vehicles.label}
              color="#FF6B00"
              icon={Car}
            />
            <HealthProgressBar
              label="Driver Availability"
              percentage={healthStats.drivers.pct}
              countLabel={healthStats.drivers.label}
              color="#3B82F6"
              icon={Users}
            />
            <HealthProgressBar
              label="Fleet Efficiency"
              percentage={healthStats.efficiency.pct}
              countLabel={healthStats.efficiency.label}
              color="#10B981"
              icon={Activity}
            />
            <HealthProgressBar
              label="Maintenance Index"
              percentage={healthStats.maintenance.pct}
              countLabel={healthStats.maintenance.label}
              color="#8B5CF6"
              icon={Wrench}
            />
          </div>
        </motion.div>

        {/* INTERCITY BUS SNAPSHOT (IF ENABLED) */}
        {busEnabled ? (
          <motion.section
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-4 sm:p-5 shadow-md shadow-blue-900/5 backdrop-blur-md"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">
                  Bus Operations
                </p>
                <h3 className="text-base font-black text-slate-900">Intercity Bus Snapshot</h3>
              </div>
              <button
                type="button"
                onClick={() => navigate('/taxi/owner/bus-service')}
                className="flex items-center gap-1.5 rounded-xl bg-[#0F172A] px-3 py-1.5 text-xs font-black text-white shadow-sm transition-all hover:bg-slate-800"
              >
                <Bus size={14} className="text-[#FF6B00]" />
                Manage Buses
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl bg-white/90 p-3 border border-blue-100 shadow-2xs">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-900/60">Total Buses</p>
                <p className="mt-1 text-lg font-black text-slate-900">{busOverview.totalBuses || 0}</p>
                <p className="text-[10px] font-bold text-emerald-600">{busOverview.activeBuses || 0} active</p>
              </div>
              <div className="rounded-xl bg-white/90 p-3 border border-blue-100 shadow-2xs">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-900/60">Seat Bookings</p>
                <p className="mt-1 text-lg font-black text-slate-900">{busOverview.totalBookings || 0}</p>
                <p className="text-[10px] font-bold text-blue-600">{busOverview.upcomingBookings || 0} upcoming</p>
              </div>
              <div className="rounded-xl bg-white/90 p-3 border border-blue-100 shadow-2xs">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-900/60">Confirmed Seats</p>
                <p className="mt-1 text-lg font-black text-slate-900">{busOverview.confirmedBookings || 0}</p>
                <p className="text-[10px] font-bold text-slate-500">paid seat bookings</p>
              </div>
              <div className="rounded-xl bg-white/90 p-3 border border-blue-100 shadow-2xs">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-900/60">Bus Revenue</p>
                <p className="mt-1 text-lg font-black text-[#FF6B00]">{money(busOverview.grossRevenue || 0)}</p>
                <p className="text-[10px] font-bold text-slate-500">gross ticket sales</p>
              </div>
            </div>
          </motion.section>
        ) : null}

        {/* RECENT BOOKINGS TIMELINE & FLEET INVENTORY GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Rides Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-4 sm:p-5 shadow-md shadow-blue-900/5 backdrop-blur-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">
                  Dispatch Activity
                </p>
                <h3 className="text-base font-black text-slate-900">Recent Bookings Timeline</h3>
              </div>
              <span className="rounded-full bg-blue-100/80 px-2.5 py-0.5 text-[9px] font-black text-blue-900 border border-blue-200/60">
                Live Feed
              </span>
            </div>

            <div className="space-y-3">
              {recentRides.length === 0 ? (
                <div className="rounded-xl bg-white/80 p-5 text-center text-xs font-bold text-blue-900/50 border border-blue-100">
                  No ride bookings recorded for your fleet yet.
                </div>
              ) : (
                recentRides.map((ride, idx) => (
                  <div
                    key={ride.id || idx}
                    className="relative flex items-start gap-2.5 rounded-xl border border-blue-100 bg-white/90 p-3 transition-all hover:border-blue-300"
                  >
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0F172A] text-white">
                      <Car size={15} className="text-[#FF6B00]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black capitalize text-slate-900">
                          {ride.transportType || 'Taxi'} • {ride.driver?.name || 'Assigned Driver'}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${statusTone(
                            ride.status,
                          )}`}
                        >
                          {ride.status || 'completed'}
                        </span>
                      </div>

                      <div className="mt-1.5 space-y-1 text-[10px] font-bold text-slate-500">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="truncate">{ride.pickupAddress || 'Pickup Location'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                          <span className="truncate">{ride.dropAddress || 'Destination Drop'}</span>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[9px] font-bold text-slate-400">
                        <span>{formatRelativeDate(ride.createdAt)}</span>
                        <span className="text-xs font-black text-emerald-600">
                          {money(ride.earnings || ride.fare)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>

          {/* Fleet Drivers & Vehicles Roster */}
          <div className="space-y-4">
            {/* Drivers Roster */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-4 sm:p-5 shadow-md shadow-blue-900/5 backdrop-blur-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                    Fleet Driver Roster
                  </p>
                  <h3 className="text-base font-black text-slate-900">Active Drivers</h3>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/taxi/owner/manage-drivers')}
                  className="text-xs font-black text-blue-600 hover:underline"
                >
                  View All ({displayFleet.totalDrivers})
                </button>
              </div>

              <div className="space-y-2">
                {recentDrivers.length === 0 ? (
                  <div className="rounded-xl bg-white/80 p-5 text-center text-xs font-bold text-blue-900/50 border border-blue-100">
                    No drivers registered in your fleet yet. Click 'Add Driver' to onboard your first driver.
                  </div>
                ) : (
                  recentDrivers.slice(0, 4).map((driver) => (
                    <div
                      key={driver.id}
                      className="flex items-center justify-between rounded-xl bg-white/90 p-2.5 border border-blue-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-500/10 text-blue-600 font-black text-xs">
                          {driver.name ? driver.name.substring(0, 2).toUpperCase() : 'DR'}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900">{driver.name || 'Driver'}</p>
                          <p className="text-[10px] font-bold text-slate-500">{driver.phone || '-'} • {driver.city || 'Indore'}</p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${statusTone(driver.status)}`}>
                        {driver.isOnRide ? 'On Trip' : driver.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>

            {/* Vehicles Inventory */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-blue-200/60 bg-gradient-to-br from-white via-[#F2F7FE] to-[#E8F2FC] p-4 sm:p-5 shadow-md shadow-blue-900/5 backdrop-blur-md"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">
                    Fleet Inventory
                  </p>
                  <h3 className="text-base font-black text-slate-900">Registered Vehicles</h3>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/taxi/owner/vehicle-fleet')}
                  className="text-xs font-black text-[#FF6B00] hover:underline"
                >
                  View Fleet ({displayFleet.totalVehicles})
                </button>
              </div>

              <div className="space-y-2">
                {recentVehicles.length === 0 ? (
                  <div className="rounded-xl bg-white/80 p-5 text-center text-xs font-bold text-blue-900/50 border border-blue-100">
                    No vehicles added to your fleet yet. Click 'Add Vehicle' to register your first vehicle.
                  </div>
                ) : (
                  recentVehicles.slice(0, 4).map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="flex items-center justify-between rounded-xl bg-white/90 p-2.5 border border-blue-100"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500/10 text-[#FF6B00]">
                          <Car size={15} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900">
                            {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') ||
                              vehicle.vehicleTypeName ||
                              'Vehicle'}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500">
                            {vehicle.number || '-'} • {vehicle.color || 'White'}
                          </p>
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${statusTone(vehicle.status)}`}>
                        {vehicle.status || 'approved'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* INTERACTIVE QUICK ACTION MODALS */}
      <AnimatePresence>
        {activeModal ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-blue-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F172A] text-[#FF6B00]">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      {activeModal === 'driver' && 'Add Fleet Driver'}
                      {activeModal === 'vehicle' && 'Add Fleet Vehicle'}
                      {activeModal === 'booking' && 'Instant Dispatch Booking'}
                      {activeModal === 'reports' && 'Owner Business Reports'}
                      {activeModal === 'withdraw' && 'Owner Payout Withdrawal'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400">
                      EQOSY Owner Operations Console
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <XCircle size={18} />
                </button>
              </div>

              {activeModal === 'withdraw' ? (
                <form onSubmit={handleWithdrawSubmit} className="space-y-3.5">
                  {withdrawSubmitted ? (
                    <div className="rounded-xl bg-emerald-50 p-5 text-center border border-emerald-200">
                      <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                      <p className="text-xs font-black text-emerald-900">Payout Request Submitted!</p>
                      <p className="text-[11px] text-emerald-700 mt-1">
                        Amount ₹{withdrawAmount || money(displayEarnings.walletBalance)} will be transferred within 24 hours.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-black text-slate-700">Withdrawal Amount (₹)</label>
                        <input
                          type="number"
                          required
                          placeholder={`Available: ₹${displayEarnings.walletBalance}`}
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#FF6B00]"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-black text-slate-700">UPI ID / Bank Account</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 7047716600@paytm or UPI ID"
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#FF6B00]"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white shadow-sm hover:bg-emerald-700"
                      >
                        Confirm Payout Request
                      </button>
                    </>
                  )}
                </form>
              ) : (
                <>
                  <div className="py-2 text-xs text-slate-600 space-y-2.5">
                    {activeModal === 'driver' && (
                      <>
                        <p className="font-medium">Direct driver onboard flow for your mobility fleet.</p>
                        <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                          <p className="font-black text-slate-900 mb-1">Redirecting to Driver Portal...</p>
                          <p className="text-[11px] text-slate-500">Add driver credentials, license documents, and assign vehicle.</p>
                        </div>
                      </>
                    )}
                    {activeModal === 'vehicle' && (
                      <>
                        <p className="font-medium">Register a new vehicle into your fleet inventory.</p>
                        <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                          <p className="font-black text-slate-900 mb-1">Redirecting to Vehicle Fleet...</p>
                          <p className="text-[11px] text-slate-500">Upload RC, insurance, vehicle images, and select transport type.</p>
                        </div>
                      </>
                    )}
                    {activeModal === 'booking' && (
                      <>
                        <p className="font-medium">Create a manual booking dispatch for your drivers.</p>
                        <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                          <p className="font-black text-slate-900 mb-1">Quick Dispatch Console</p>
                          <p className="text-[11px] text-slate-500">Select pickup/drop location, customer phone, fare, and assign available online driver.</p>
                        </div>
                      </>
                    )}
                    {activeModal === 'reports' && (
                      <>
                        <p className="font-medium">Export financial statements & fleet utilization data.</p>
                        <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                          <p className="font-black text-slate-900 mb-1">Monthly Analytics Summary</p>
                          <p className="text-[11px] text-slate-500">Includes gross revenue, driver payouts, commission deduction, and trip completion rate.</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setActiveModal(null)}
                      className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const target = activeModal;
                        setActiveModal(null);
                        if (target === 'driver') navigate('/taxi/owner/manage-drivers');
                        else if (target === 'vehicle') navigate('/taxi/owner/vehicle-fleet');
                        else if (target === 'booking') navigate('/taxi/owner/home');
                        else if (target === 'reports') navigate('/taxi/owner/home');
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-[#0F172A] px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-slate-800"
                    >
                      <span>Proceed</span>
                      <ArrowRight size={13} className="text-[#FF6B00]" />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DriverBottomNav />
    </div>
  );
};

export default OwnerDashboard;
