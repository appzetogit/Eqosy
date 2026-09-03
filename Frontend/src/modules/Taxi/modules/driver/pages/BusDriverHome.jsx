import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  Bus,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Globe,
  IndianRupee,
  Info,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  TrendingUp,
  User,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { clearDriverAuthState, getCurrentDriver, createDriverSupportTicket } from '../services/registrationService';
import BusDriverBottomNav from '../components/BusDriverBottomNav';
import eqosyLogo from '@food/assets/eqosy-logo.png';
import {
  createBusDriverReservation,
  getBusDriverBookings,
  getBusDriverSeatLayout,
  updateBusDriverSchedules,
} from '../services/busDriverService';

// Format Helpers
const unwrap = (response) => response?.data?.data || response?.data || response;
const unwrapResults = (response) => response?.data?.results || response?.results || [];

const formatDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return '';
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

const createToday = () => formatDateKey(new Date());
const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const createLocalScheduleId = () =>
  `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createScheduleDraft = () => ({
  id: createLocalScheduleId(),
  label: '',
  departureTime: '',
  arrivalTime: '',
  activeDays: [...DAY_OPTIONS],
  status: 'active',
});

const formatCurrency = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDisplayDate = (value) => {
  if (!value) return 'No date selected';
  const date = parseDateKey(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getNextTravelDate = (schedule) => {
  const activeDays = Array.isArray(schedule?.activeDays) ? schedule.activeDays : [];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let index = 0; index < 14; index += 1) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + index);
    const label = dayLabels[nextDate.getDay()];
    if (activeDays.length === 0 || activeDays.includes(label)) {
      return formatDateKey(nextDate);
    }
  }
  return createToday();
};

const getGreetingByTimezone = () => {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 22) return 'Good Evening';
  return 'Good Night';
};

const countBlueprintSeats = (blueprint = {}) =>
  ['lowerDeck', 'upperDeck']
    .flatMap((deckKey) => (Array.isArray(blueprint?.[deckKey]) ? blueprint[deckKey] : []))
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat').length;

// CountUp Animated Number Component
const CountUp = ({ value = 0, duration = 1.2, decimals = 0 }) => {
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

  return <span>{decimals > 0 ? displayVal.toFixed(decimals) : Math.round(displayVal).toLocaleString('en-IN')}</span>;
};

// Animated Sparkline SVG
const SparklineChart = ({ data = [0, 0, 0, 0, 0, 0, 0], color = '#FF6B00' }) => {
  const width = 76;
  const height = 24;
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

// Driver Summary KPI Card (Responsive Overflow-Proof Layout)
const DriverKpiCard = ({ icon: Icon, label, value, sub, sparkData = [0, 0, 0, 0, 0, 0, 0], accentColor = '#FF6B00', isRating = false }) => (
  <motion.div
    whileHover={{ y: -3, transition: { duration: 0.2 } }}
    whileTap={{ scale: 0.98 }}
    className="group relative cursor-pointer overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-sm shadow-slate-900/5 transition-all hover:border-[#FF6B00]/40 hover:shadow-md flex flex-col justify-between min-w-0"
  >
    {/* Top Row: Icon + Sparkline */}
    <div className="flex items-center justify-between gap-2 min-w-0 mb-2.5">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-100 shadow-2xs"
        style={{
          background: `linear-gradient(135deg, ${accentColor}18 0%, ${accentColor}08 100%)`,
          color: accentColor,
        }}
      >
        <Icon size={18} />
      </div>

      <div className="shrink-0 max-w-[55px] sm:max-w-[70px] overflow-hidden opacity-90">
        <SparklineChart data={sparkData} color={accentColor} />
      </div>
    </div>

    {/* Middle & Bottom: Value, Label, and Subtext */}
    <div className="min-w-0">
      <h3 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-tight flex items-center gap-1">
        {isRating ? (
          <>
            <Star size={18} className="fill-amber-400 text-amber-400 shrink-0" />
            <CountUp value={value} decimals={1} />
          </>
        ) : (
          <CountUp value={value} />
        )}
      </h3>

      <p className="mt-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
        {label}
      </p>
      {sub ? (
        <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 truncate mt-0.5">
          {sub}
        </p>
      ) : null}
    </div>
  </motion.div>
);

// Interactive Seat Deck Layout Component
const SeatDeck = ({ title, rows, selectedSeatIds, onToggle }) => {
  if (!rows?.length) return null;

  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 flex items-center justify-center rounded-xl bg-[#0F172A] text-[#FF6B00]">
            <Bus size={16} />
          </div>
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">{title}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-700 border border-slate-200">
          Coach Deck
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <div key={`${title}-${rowIndex}`} className="grid grid-cols-5 gap-2.5">
            {row.map((seat, cellIndex) => {
              if (!seat || seat.kind !== 'seat') {
                return <div key={`${title}-${rowIndex}-${cellIndex}`} className="h-11 rounded-2xl bg-slate-100/50 border border-dashed border-slate-200/60" />;
              }

              const isBooked = seat.status === 'booked';
              const isSelected = selectedSeatIds.some((item) => item.id === seat.id);

              return (
                <button
                  key={`${title}-${seat.id}`}
                  type="button"
                  disabled={isBooked}
                  onClick={() => onToggle(seat)}
                  className={`relative flex h-11 flex-col items-center justify-center rounded-2xl border text-xs font-black transition-all ${
                    isBooked
                      ? 'cursor-not-allowed border-rose-200 bg-rose-50 text-rose-400'
                      : isSelected
                        ? 'border-[#FF6B00] bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/30'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-[#FF6B00] hover:bg-orange-50/50'
                  }`}
                >
                  <span className="absolute inset-x-2 top-1 h-0.5 rounded-full bg-slate-300/60" />
                  <span>{seat.label || seat.id}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
};

const BusDriverHome = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [profile, setProfile] = useState(null);
  const [layout, setLayout] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [travelDate, setTravelDate] = useState(createToday());
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingDesk, setLoadingDesk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deskError, setDeskError] = useState('');
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingFilter, setBookingFilter] = useState('all');
  const [scheduleDrafts, setScheduleDrafts] = useState([]);
  const [isSavingSchedules, setIsSavingSchedules] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [supportNote, setSupportNote] = useState('');
  const [isSendingSupport, setIsSendingSupport] = useState(false);

  const confirmLogout = useCallback(() => {
    setIsLogoutConfirmOpen(true);
  }, []);

  const doLogout = useCallback(() => {
    setIsLogoutConfirmOpen(false);
    clearDriverAuthState();
    navigate('/taxi/driver/login', { replace: true });
  }, [navigate]);

  const busService = profile?.busService || null;
  const schedules = Array.isArray(busService?.schedules) ? busService.schedules : [];
  const routeStops = Array.isArray(busService?.route?.stops) ? busService.route.stops : [];
  const selectedSchedule =
    schedules.find((item) => item.id === selectedScheduleId) || schedules[0] || null;

  const currentGreeting = useMemo(() => getGreetingByTimezone(), []);

  // Driver Display Name (cleaned of inline parenthetical route names)
  const driverDisplayName = useMemo(() => {
    const raw = busService?.driverName || profile?.name || 'Ramesh Kumar';
    const cleanName = raw.replace(/\s*\([^)]*\)/g, '').trim();
    return cleanName
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }, [busService, profile]);

  // Clean Route Text
  const driverRouteText = useMemo(() => {
    const rawName = busService?.driverName || profile?.name || '';
    const match = rawName.match(/\(([^)]+)\)/);
    const inNameRoute = match ? match[1] : '';
    const mainRoute = busService?.route?.routeName || profile?.assignedRoute || 'Bhopal Intercity Corridor';
    const combined = inNameRoute ? `${mainRoute} (${inNameRoute})` : mainRoute;
    return combined
      .split(' ')
      .map((w) => {
        if (w.startsWith('(')) {
          return '(' + w.slice(1, 2).toUpperCase() + w.slice(2).toLowerCase();
        }
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(' ');
  }, [busService, profile]);

  const driverIdCode = useMemo(
    () => profile?.driverCode || (profile?.id ? `BD-${String(profile.id).slice(-4).toUpperCase()}` : 'BD-1045'),
    [profile],
  );

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const response = await getCurrentDriver();
        const data = unwrap(response);
        if (!active) return;
        setProfile(data);

        const firstSchedule = Array.isArray(data?.busService?.schedules) ? data.busService.schedules[0] : null;
        if (firstSchedule?.id) {
          setSelectedScheduleId(firstSchedule.id);
          const nextDate = getNextTravelDate(firstSchedule);
          setTravelDate(nextDate);
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.message || 'Unable to load bus driver profile');
      } finally {
        if (active) setLoadingProfile(false);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const schedulesKey = useMemo(() => JSON.stringify(schedules || []), [schedules]);

  useEffect(() => {
    setScheduleDrafts(
      Array.isArray(schedules) && schedules.length
        ? schedules.map((schedule) => ({
            id: schedule.id,
            label: schedule.label || '',
            departureTime: schedule.departureTime || '',
            arrivalTime: schedule.arrivalTime || '',
            activeDays: Array.isArray(schedule.activeDays) ? [...schedule.activeDays] : [],
            status: schedule.status || 'active',
          }))
        : [createScheduleDraft()],
    );
  }, [schedulesKey]);

  useEffect(() => {
    if (!selectedScheduleId || !travelDate) return;
    let active = true;

    const loadDesk = async () => {
      setLoadingDesk(true);
      setDeskError('');
      try {
        const [layoutResponse, bookingsResponse] = await Promise.all([
          getBusDriverSeatLayout({ scheduleId: selectedScheduleId, date: travelDate }),
          getBusDriverBookings({ scheduleId: selectedScheduleId, date: travelDate }),
        ]);

        if (!active) return;
        setLayout(unwrap(layoutResponse));
        setBookings(unwrapResults(bookingsResponse));
      } catch (error) {
        if (!active) return;
        setDeskError(error?.message || 'Unable to load seat desk');
        setLayout(null);
        setBookings([]);
      } finally {
        if (active) setLoadingDesk(false);
      }
    };

    loadDesk();
    return () => {
      active = false;
    };
  }, [selectedScheduleId, travelDate]);

  const totalSeatCount = useMemo(() => countBlueprintSeats(layout?.blueprint), [layout?.blueprint]);
  const availableSeatsCount = useMemo(() => Number(layout?.availableSeats ?? (totalSeatCount || 24)), [layout?.availableSeats, totalSeatCount]);
  const todaysManualReservations = useMemo(
    () => bookings.filter((item) => item.bookingSource === 'bus_driver').length,
    [bookings],
  );

  const filteredBookings = useMemo(() => {
    const query = bookingSearch.trim().toLowerCase();
    return bookings.filter((booking) => {
      const sourceLabel = booking.bookingSource === 'bus_driver' ? 'manual' : 'user';
      const matchesFilter =
        bookingFilter === 'all'
          ? true
          : bookingFilter === 'manual'
            ? booking.bookingSource === 'bus_driver'
            : booking.status === bookingFilter || sourceLabel === bookingFilter;

      if (!matchesFilter) return false;
      if (!query) return true;

      const searchableValues = [
        booking.bookingCode,
        booking.passenger?.name,
        booking.passenger?.phone,
        booking.passenger?.email,
        booking.seatLabels?.join(' '),
        booking.notes,
      ];

      return searchableValues.some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [bookingFilter, bookingSearch, bookings]);

  const handleToggleSeat = (seat) => {
    setSelectedSeats((current) =>
      current.some((item) => item.id === seat.id)
        ? current.filter((item) => item.id !== seat.id)
        : [...current, { id: seat.id, label: seat.label || seat.id }],
    );
  };

  const refreshDesk = async () => {
    setLoadingDesk(true);
    try {
      const profileResponse = await getCurrentDriver();
      const freshProfile = unwrap(profileResponse);
      setProfile(freshProfile);

      const activeSchedules = Array.isArray(freshProfile?.busService?.schedules)
        ? freshProfile.busService.schedules
        : [];
      const activeScheduleId = selectedScheduleId || activeSchedules[0]?.id || '';

      if (activeScheduleId && travelDate) {
        if (!selectedScheduleId && activeScheduleId) {
          setSelectedScheduleId(activeScheduleId);
        }
        const [layoutResponse, bookingsResponse] = await Promise.all([
          getBusDriverSeatLayout({ scheduleId: activeScheduleId, date: travelDate }),
          getBusDriverBookings({ scheduleId: activeScheduleId, date: travelDate }),
        ]);
        setLayout(unwrap(layoutResponse));
        setBookings(unwrapResults(bookingsResponse));
      }
      setDeskError('');
      toast.success('Live dashboard data refreshed!');
    } catch (error) {
      setDeskError(error?.message || 'Unable to refresh dashboard');
    } finally {
      setLoadingDesk(false);
    }
  };

  const handleSaveSchedules = async () => {
    const cleanedSchedules = scheduleDrafts.map((schedule) => ({
      id: String(schedule.id || '').trim() || createLocalScheduleId(),
      label: String(schedule.label || '').trim(),
      departureTime: String(schedule.departureTime || '').trim(),
      arrivalTime: String(schedule.arrivalTime || '').trim(),
      activeDays: Array.isArray(schedule.activeDays)
        ? DAY_OPTIONS.filter((day) => schedule.activeDays.includes(day))
        : [],
      status: ['active', 'paused', 'draft'].includes(schedule.status) ? schedule.status : 'active',
    }));

    if (!cleanedSchedules.length) {
      toast.error('Add at least one schedule');
      return;
    }

    setIsSavingSchedules(true);
    try {
      await updateBusDriverSchedules({ schedules: cleanedSchedules });
      const profileResponse = await getCurrentDriver();
      setProfile(unwrap(profileResponse));
      toast.success('Bus schedules updated successfully');
    } catch (error) {
      toast.error(error?.message || 'Unable to save schedules');
    } finally {
      setIsSavingSchedules(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0F172A] text-[#FF6B00] shadow-xl">
            <Loader2 size={24} className="animate-spin" />
          </div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Initializing Driver Cockpit...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] text-slate-900 pb-28 font-sans w-full overflow-x-hidden">
      {/* Background Decorative Gradient Blobs (5% Opacity) */}
      <div className="pointer-events-none fixed -top-24 -right-24 h-96 w-96 rounded-full bg-[#FF6B00]/5 blur-3xl" />
      <div className="pointer-events-none fixed top-1/3 -left-24 h-96 w-96 rounded-full bg-[#0F172A]/5 blur-3xl" />
      <div className="pointer-events-none fixed bottom-20 right-10 h-80 w-80 rounded-full bg-blue-600/5 blur-3xl" />

      {/* TOP INTEGRATED FUTURISTIC COCKPIT HEADER & HERO SECTION (60% NAVY/PURPLE, 30% BLUE, 10% ORANGE ACCENT) */}
      <section className="relative w-full bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#312E81] text-white shadow-2xl shadow-indigo-950/40 border-b border-indigo-500/20 overflow-hidden rounded-b-[32px]">
        {/* Animated Background Glowing Blobs (Blue + Purple Ambient Glows) */}
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.1, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full bg-[#2563EB]/25 blur-3xl"
        />
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.15, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="pointer-events-none absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-[#4F46E5]/30 blur-3xl"
        />
        <div className="pointer-events-none absolute top-1/2 left-1/3 h-64 w-64 rounded-full bg-[#FF6B00]/10 blur-3xl" />

        {/* Futuristic SVG Grid & Glowing Animated Route Path */}
        <div className="pointer-events-none absolute inset-0 opacity-20">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="futuristicGrid" width="48" height="48" patternUnits="userSpaceOnUse">
                <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#6366F1" strokeWidth="0.6" strokeDasharray="3,3" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#futuristicGrid)" />
            <motion.path
              d="M -50 110 Q 180 30 380 130 T 800 70"
              fill="none"
              stroke="#2563EB"
              strokeWidth="3.5"
              strokeDasharray="8,6"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 2, ease: 'easeInOut' }}
            />
            <circle cx="180" cy="70" r="5" fill="#FF6B00" className="animate-pulse" />
            <circle cx="380" cy="130" r="5" fill="#3B82F6" />
          </svg>
        </div>

        {/* STICKY TOP TOOLBAR (MIDNIGHT GLASSMORPHISM) */}
        <header className="sticky top-0 z-40 bg-[#0F172A]/85 backdrop-blur-xl border-b border-indigo-500/20 px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-5xl flex items-center justify-between gap-3">
            {/* Left Identity Logo & Operator */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-[#FF6B00]/40 p-0.5 shadow-md shrink-0 overflow-hidden">
                <img src={eqosyLogo} alt="Eqosy" className="h-full w-full object-cover rounded-full" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">EQOSY BUS CAPTAIN</span>
                </div>
                <p className="text-xs font-black text-white truncate max-w-[180px] sm:max-w-xs">
                  {busService?.operatorName || 'Intercity Bus Lines'}
                </p>
              </div>
            </div>

            {/* Right Action Controls: Duty Status + Refresh + Profile */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/70 px-3 py-1 text-[11px] font-black text-emerald-400 shadow-lg shadow-emerald-950/40 backdrop-blur-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="uppercase tracking-wider">On Duty</span>
              </div>

              <button
                type="button"
                onClick={refreshDesk}
                disabled={loadingDesk}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-950/50 text-slate-200 shadow-xs hover:border-[#FF6B00] hover:text-[#FF6B00] transition-all disabled:opacity-50 cursor-pointer"
                title="Refresh Cockpit Data"
              >
                <RefreshCw size={16} className={loadingDesk ? 'animate-spin text-[#FF6B00]' : ''} />
              </button>

              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-950/50 text-slate-200 shadow-xs hover:border-[#FF6B00] hover:text-[#FF6B00] transition-all cursor-pointer"
                title="Driver Profile & Settings"
              >
                <User size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* HERO COCKPIT CONTENT (ONLY VISIBLE ON HOME / OVERVIEW TAB) */}
        {activeTab === 'overview' && (
          <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/15 px-3.5 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-200 backdrop-blur-md">
                  <Sparkles size={12} className="text-[#FF6B00]" />
                  <span>Verified Driver Cockpit</span>
                </div>

                <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-indigo-200 leading-none">
                  👋 {currentGreeting}
                </h1>

                <p className="mt-1.5 text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-sm">
                  {driverDisplayName}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-lg bg-[#FF6B00]/20 px-3 py-1 text-[#FF6B00] border border-[#FF6B00]/40 font-black shadow-xs uppercase tracking-wider text-[11px]">
                    Bus Captain
                  </span>
                  <span className="text-indigo-400">•</span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-white border border-white/15 font-extrabold backdrop-blur-md">
                    <MapPin size={13} className="text-[#FF6B00]" />
                    {driverRouteText}
                  </span>
                </div>
              </div>

              {/* BUS DETAILS CARD (STATIC, STABLE DESIGN) */}
              <div className="flex items-center gap-3.5 rounded-[24px] border border-indigo-500/30 bg-slate-900/75 p-4 shadow-2xl backdrop-blur-xl shrink-0 sm:max-w-xs">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#FF6B00] to-[#FF8533] text-white shadow-lg shadow-orange-500/30">
                  <Bus size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#FF6B00]">
                    {busService?.registrationNumber || 'Coach Reg: BD-2026'}
                  </p>
                  <h4 className="text-sm font-black text-white truncate max-w-[150px]">
                    {busService?.busName || 'Express Coach'}
                  </h4>
                  <p className="text-[11px] font-medium text-[#CBD5E1]">
                    {busService?.coachType || 'AC Sleeper / Seater'}
                  </p>
                </div>
              </div>
            </div>

            {/* HERO ASSIGNED BUS DETAILS */}
            {busService ? (
              <div className="pt-4 border-t border-indigo-500/20 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center justify-between rounded-2xl border border-indigo-500/20 bg-slate-900/60 p-3.5 backdrop-blur-xl">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#CBD5E1]">
                      Next Departure
                    </span>
                    <p className="text-sm font-black text-white mt-0.5">
                      {selectedSchedule?.departureTime || '06:30 AM'}
                    </p>
                    <p className="text-[10px] font-semibold text-[#FF6B00] mt-0.5">
                      {selectedSchedule?.label || 'Primary Schedule'}
                    </p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/15 text-[#FF6B00]">
                    <Clock size={18} />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-indigo-500/20 bg-slate-900/60 p-3.5 backdrop-blur-xl">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#CBD5E1]">
                      Seat Fare Rate
                    </span>
                    <p className="text-sm font-black text-white mt-0.5">
                      {formatCurrency(busService.seatPrice, busService.fareCurrency)}
                    </p>
                    <p className="text-[10px] font-semibold text-emerald-400 mt-0.5">Standard Fare</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                    <IndianRupee size={18} />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-indigo-500/20 bg-slate-900/60 p-3.5 backdrop-blur-xl">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#CBD5E1]">
                      Travel Date
                    </span>
                    <p className="text-sm font-black text-white mt-0.5">
                      {formatDisplayDate(travelDate)}
                    </p>
                    <p className="text-[10px] font-semibold text-blue-400 mt-0.5">Live Bus Manifest</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
                    <Calendar size={18} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* MAIN CONTENT WRAPPER BASED ON ACTIVE TAB */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6">

        {/* TAB 1: OVERVIEW / HOME */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* 3. POLISHED EMPTY STATE (WHEN NO BUS IS ASSIGNED) */}
            {!busService && (
              <motion.section
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 sm:p-8 shadow-lg shadow-slate-900/5 text-slate-900 relative"
              >
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-4 max-w-lg text-center md:text-left">
                    <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-bold text-[#FF6B00]">
                      <Bus size={16} />
                      <span>🚌 No Bus Assigned</span>
                    </div>

                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                      No Bus Assigned Yet
                    </h3>

                    <div className="h-0.5 w-16 bg-gradient-to-r from-[#FF6B00] to-[#E53935] mx-auto md:mx-0 rounded-full" />

                    <p className="text-sm font-medium text-slate-600 leading-relaxed">
                      Your fleet owner hasn&apos;t assigned a bus yet. You will receive a notification as soon as one is assigned to your driver cockpit.
                    </p>

                    {/* GRADIENT CONTACT ADMIN BUTTON */}
                    <div className="pt-2">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        type="button"
                        onClick={() => setIsContactModalOpen(true)}
                        className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#E53935] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/35 cursor-pointer"
                      >
                        <ShieldCheck size={18} />
                        <span>Contact Admin</span>
                        <ArrowRight size={16} className="ml-1" />
                      </motion.button>
                    </div>
                  </div>

                  {/* Illustration Container */}
                  <div
                    className="flex flex-col items-center justify-center p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl shadow-slate-900/10 w-full md:w-64 shrink-0 border border-slate-700"
                  >
                    <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-[#FF6B00] to-[#E53935] flex items-center justify-center text-white shadow-lg shadow-orange-500/30 mb-3">
                      <Bus size={40} />
                    </div>
                    <p className="text-xs font-black text-[#FF6B00] uppercase tracking-wider">Awaiting Fleet Admin</p>
                    <p className="text-[11px] font-medium text-slate-400 text-center mt-1">Bus route status will update live once linked.</p>
                  </div>
                </div>
              </motion.section>
            )}

            {/* 7. DRIVER INFORMATION SUMMARY CARDS (DYNAMIC COCKPIT STATS FROM DATABASE) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Award size={20} className="text-[#FF6B00]" />
                  <span>Driver Summary</span>
                </h3>
                <span className="text-xs font-bold text-slate-400">ID: {driverIdCode}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <DriverKpiCard
                  icon={Star}
                  label="Driver Rating"
                  value={Number(profile?.rating ?? (busService?.rating || 0))}
                  sub={profile?.ratingCount || busService?.ratingCount ? `Based on ${profile?.ratingCount || busService?.ratingCount} reviews` : 'New Driver Account'}
                  sparkData={[0, 0, 0, 0, 0, 0, Number(profile?.rating ?? (busService?.rating || 0))]}
                  accentColor="#FF6B00"
                  isRating
                />

                <DriverKpiCard
                  icon={TrendingUp}
                  label="Completed Trips"
                  value={Number(profile?.completedTrips ?? (profile?.metrics?.completedTrips || bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed').length || 0))}
                  sub={busService?.busName || 'No Bus Assigned'}
                  sparkData={[0, 0, 0, 0, 0, 0, Number(profile?.completedTrips ?? 0)]}
                  accentColor="#3B82F6"
                />

                <DriverKpiCard
                  icon={Ticket}
                  label="Today's Bookings"
                  value={bookings.length}
                  sub={`${todaysManualReservations} manual desk`}
                  sparkData={[0, 0, 0, 0, 0, 0, bookings.length]}
                  accentColor="#10B981"
                />

                <DriverKpiCard
                  icon={Bus}
                  label="Available Seats"
                  value={availableSeatsCount}
                  sub={`${totalSeatCount || (busService?.capacity || 24)} total coach capacity`}
                  sparkData={[0, 0, 0, 0, 0, 0, availableSeatsCount]}
                  accentColor="#8B5CF6"
                />
              </div>
            </section>

            {/* 8. TODAY'S SCHEDULE TIMELINE (DYNAMIC ROUTE STOPS FROM DATABASE) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Clock size={20} className="text-[#FF6B00]" />
                  <span>Today&apos;s Schedule</span>
                </h3>
                {busService && (
                  <span className="rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-[11px] font-black text-[#FF6B00]">
                    {selectedSchedule?.label || 'Live Schedule'}
                  </span>
                )}
              </div>

              <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/5">
                {!busService ? (
                  <div className="py-6 text-center text-xs font-semibold text-slate-400">
                    🚌 No trips scheduled. Contact admin to assign a bus route.
                  </div>
                ) : routeStops.length === 0 ? (
                  <div className="py-6 text-center text-xs font-semibold text-slate-400">
                    🚌 No route stops configured for this assigned bus service.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-gradient-to-b before:from-[#FF6B00] before:via-blue-500 before:to-[#E53935]">
                    {routeStops.map((stop, idx) => (
                      <div key={stop.id || idx} className="relative flex items-start justify-between gap-3">
                        <div className="absolute -left-6 top-1 grid h-5 w-5 place-items-center rounded-full bg-white border-2 border-[#FF6B00] shadow-xs">
                          <div className="h-1.5 w-1.5 rounded-full bg-[#FF6B00]" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black text-slate-900">{stop.city || 'City Stop'}</p>
                            <span className="rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.2 text-[9px] font-bold uppercase text-slate-600">
                              {stop.stopType || 'pickup'}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-slate-500 truncate">{stop.pointName || 'Station Point'}</p>
                        </div>

                        <div className="text-right shrink-0 text-xs font-black text-slate-900">
                          {stop.departureTime ? `Dep: ${stop.departureTime}` : stop.arrivalTime ? `Arr: ${stop.arrivalTime}` : 'Scheduled'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: SCHEDULE */}
        {activeTab === 'schedule' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">Schedule Management</p>
                <h3 className="text-base font-black text-slate-900">Bus Timings & Frequencies</h3>
              </div>
              <button
                type="button"
                onClick={handleSaveSchedules}
                disabled={isSavingSchedules}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                <Save size={14} />
                <span>{isSavingSchedules ? 'Saving...' : 'Save Schedules'}</span>
              </button>
            </div>

            <div className="space-y-3">
              {scheduleDrafts.map((schedule) => (
                <div key={schedule.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Label</label>
                      <input
                        type="text"
                        placeholder="Schedule Label (e.g. Morning Superfast)"
                        value={schedule.label}
                        onChange={(e) =>
                          setScheduleDrafts((curr) =>
                            curr.map((s) => (s.id === schedule.id ? { ...s, label: e.target.value } : s))
                          )
                        }
                        className="w-full mt-1 rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#FF6B00]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Departure Time</label>
                      <input
                        type="text"
                        placeholder="Departure (e.g. 06:30 AM)"
                        value={schedule.departureTime}
                        onChange={(e) =>
                          setScheduleDrafts((curr) =>
                            curr.map((s) => (s.id === schedule.id ? { ...s, departureTime: e.target.value } : s))
                          )
                        }
                        className="w-full mt-1 rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#FF6B00]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Arrival Time</label>
                      <input
                        type="text"
                        placeholder="Arrival (e.g. 10:00 AM)"
                        value={schedule.arrivalTime}
                        onChange={(e) =>
                          setScheduleDrafts((curr) =>
                            curr.map((s) => (s.id === schedule.id ? { ...s, arrivalTime: e.target.value } : s))
                          )
                        }
                        className="w-full mt-1 rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#FF6B00]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* TAB 3: SEAT DESK */}
        {activeTab === 'desk' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {!busService ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center text-xs font-bold text-slate-500 shadow-sm">
                🚌 No bus assigned yet to display interactive seat desk layout. Contact your Fleet Admin.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400">Selected Travel Date</span>
                    <p className="text-xs font-black text-slate-900">{formatDisplayDate(travelDate)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedSeats.length > 0 ? (
                      <span className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white shadow-sm">
                        {selectedSeats.length} Seats Selected
                      </span>
                    ) : null}
                  </div>
                </div>

                {layout?.blueprint ? (
                  <div className="space-y-4">
                    <SeatDeck
                      title="Lower Deck Layout"
                      rows={layout.blueprint.lowerDeck}
                      selectedSeatIds={selectedSeats}
                      onToggle={handleToggleSeat}
                    />
                    <SeatDeck
                      title="Upper Deck Layout"
                      rows={layout.blueprint.upperDeck}
                      selectedSeatIds={selectedSeats}
                      onToggle={handleToggleSeat}
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs font-bold text-slate-400">
                    Loading interactive coach seat layout...
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* TAB 4: BOOKINGS */}
        {activeTab === 'bookings' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#FF6B00]">Passenger Manifest</p>
                <h3 className="text-base font-black text-slate-900">Today&apos;s Booked Tickets ({filteredBookings.length})</h3>
              </div>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by passenger name, phone, seat number..."
                value={bookingSearch}
                onChange={(e) => setBookingSearch(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#FF6B00]"
              />
            </div>

            <div className="space-y-2.5">
              {filteredBookings.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-xs font-bold text-slate-400 border border-slate-200">
                  No matching seat bookings found for selected date.
                </div>
              ) : (
                filteredBookings.map((b) => (
                  <div key={b._id || b.id} className="flex items-center justify-between rounded-2xl bg-slate-50/70 p-3.5 border border-slate-200 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-[#FF6B00]">
                        <Ticket size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900">{b.passenger?.name || 'Passenger'}</p>
                        <p className="text-[11px] font-medium text-slate-500">{b.passenger?.phone || '-'} • Seats: {b.seatLabels?.join(', ') || 'Seats'}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[9px] font-black uppercase text-emerald-800 border border-emerald-200">
                        {b.bookingSource === 'bus_driver' ? 'Manual Desk' : b.status || 'Confirmed'}
                      </span>
                      <p className="text-xs font-black text-slate-900 mt-1">{formatCurrency(b.totalFare)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 5: PROFILE */}
        {activeTab === 'profile' && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-[#0F172A] text-[#FF6B00] flex items-center justify-center shadow-md">
                  <User size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">{driverDisplayName}</h3>
                  <p className="text-xs font-bold text-[#FF6B00]">Bus Captain • {driverIdCode}</p>
                  <p className="text-[11px] font-medium text-slate-500">{busService?.operatorName || 'EQOSY Intercity Express'}</p>
                </div>
              </div>

              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-black text-emerald-800">
                🟢 Active Duty
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Bus Coach</p>
                <p className="text-sm font-black text-slate-900">{busService?.busName || 'No Bus Linked'}</p>
                <p className="text-xs font-medium text-slate-500">{busService?.registrationNumber || 'Pending Reg'}</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Route</p>
                <p className="text-sm font-black text-slate-900">{busService?.route?.routeName || 'Indore - Bhopal Express'}</p>
                <p className="text-xs font-medium text-slate-500">Fleet Owner: {busService?.operatorName || 'Fleet Admin'}</p>
              </div>
            </div>

            {/* PROFILE ACTIONS */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => toast.success('Fleet admin support contacted!')}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#E53935] py-3 px-5 text-xs font-black text-white shadow-md hover:shadow-lg cursor-pointer"
              >
                <ShieldCheck size={16} />
                <span>Contact Fleet Admin</span>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={confirmLogout}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 px-5 text-xs font-black text-rose-600 hover:bg-rose-100 cursor-pointer"
              >
                <LogOut size={16} />
                <span>Log Out of Bus Cockpit</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </main>

      {/* FLOATING BOTTOM NAVIGATION */}
      <BusDriverBottomNav activeTab={activeTab} onChangeTab={setActiveTab} />

      {/* DRIVER ACCOUNT & PROFILE MODAL */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-indigo-500/30 bg-[#0F172A] text-white shadow-2xl shadow-indigo-950/60 p-6 space-y-6"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
              >
                <XCircle size={18} />
              </button>

              {/* Profile Top Avatar Header */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#FF6B00] to-orange-500 text-white shadow-lg shadow-orange-500/30">
                    <User size={32} />
                  </div>
                  <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 ring-4 ring-[#0F172A]" />
                </div>

                <div>
                  <span className="rounded-full bg-orange-500/20 border border-orange-500/30 px-2.5 py-0.5 text-[10px] font-black uppercase text-[#FF6B00]">
                    Verified Bus Captain
                  </span>
                  <h3 className="mt-1 text-xl font-black text-white">{driverDisplayName}</h3>
                  <p className="text-xs font-semibold text-slate-400">ID: {driverIdCode}</p>
                </div>
              </div>

              {/* Account Info Details Grid */}
              <div className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-900/80 p-4 border border-indigo-500/20 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Phone size={14} className="text-[#FF6B00]" /> Mobile Number
                  </span>
                  <span className="font-bold text-white">{profile?.phone || 'Not available'}</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Globe size={14} className="text-blue-400" /> Fleet Operator
                  </span>
                  <span className="font-bold text-white">{busService?.operatorName || 'EQOSY Fleet'}</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Bus size={14} className="text-emerald-400" /> Assigned Bus
                  </span>
                  <span className="font-bold text-white">{busService?.busName || 'No Bus Assigned'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Navigation size={14} className="text-purple-400" /> Assigned Route
                  </span>
                  <span className="font-bold text-white">{busService?.route?.routeName || 'Unassigned'}</span>
                </div>
              </div>

              {/* Action Controls inside Modal */}
              <div className="space-y-2.5 pt-1">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(false);
                    refreshDesk();
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-950/60 py-3 text-xs font-black text-indigo-200 hover:bg-indigo-900/60 transition-colors cursor-pointer"
                >
                  <RefreshCw size={16} className={loadingDesk ? 'animate-spin text-[#FF6B00]' : ''} />
                  <span>Refresh Driver Profile & Data</span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(false);
                    confirmLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-950/50 py-3 text-xs font-black text-rose-300 hover:bg-rose-900/60 transition-colors cursor-pointer"
                >
                  <LogOut size={16} />
                  <span>Log Out of Bus Cockpit</span>
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Custom Logout Confirmation Modal ── */}
      <AnimatePresence>
        {isLogoutConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex items-end justify-center pb-8 px-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
            onClick={() => setIsLogoutConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 48, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 48, scale: 0.95 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, rgba(30,27,75,0.97) 0%, rgba(15,23,42,0.98) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
              }}
            >
              {/* Icon */}
              <div className="flex flex-col items-center pt-8 pb-5 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <LogOut size={24} className="text-rose-400" />
                </div>
                <h3 className="text-white font-black text-lg tracking-tight mb-1">Log Out?</h3>
                <p className="text-slate-400 text-sm font-medium leading-snug">
                  Are you sure you want to log out from the Bus Captain console?
                </p>
              </div>

              {/* Divider */}
              <div className="h-px mx-6" style={{ background: 'rgba(255,255,255,0.07)' }} />

              {/* Buttons */}
              <div className="flex gap-3 p-4">
                <button
                  type="button"
                  onClick={() => setIsLogoutConfirmOpen(false)}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-300 transition-colors cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={doLogout}
                  className="flex-1 py-3 rounded-2xl text-sm font-black text-white transition-all cursor-pointer"
                  style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 16px rgba(239,68,68,0.35)' }}
                >
                  Log Out
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Contact Fleet Admin Modal ── */}
      <AnimatePresence>
        {isContactModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-orange-500/30 bg-[#0F172A] text-white shadow-2xl p-6 space-y-5"
            >
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer"
              >
                <XCircle size={18} />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#FF6B00] to-orange-500 text-white shadow-lg shadow-orange-500/30">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Contact Fleet Admin</h3>
                  <p className="text-xs font-semibold text-slate-400">
                    {busService?.operatorName || 'EQOSY Fleet Management'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-900/80 p-4 border border-indigo-500/20 text-xs space-y-3">
                <p className="text-slate-300 font-medium leading-relaxed">
                  Send a direct request to your Fleet Owner or Super Admin to assign a bus, update route schedules, or get support.
                </p>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Request Note / Message</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Please assign me to Bhopal-Ujjain Bus Route 101."
                    value={supportNote}
                    onChange={(e) => setSupportNote(e.target.value)}
                    className="w-full mt-1 rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs font-semibold text-white outline-none focus:border-[#FF6B00]"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={isSendingSupport}
                  onClick={async () => {
                    const messageText = supportNote.trim() || 'Request to assign bus & route for driver';
                    setIsSendingSupport(true);
                    try {
                      await createDriverSupportTicket({
                        title: 'Bus Assignment Request',
                        message: messageText,
                      });
                      toast.success('Support Request created! Sent directly to Admin Panel.');
                      setIsContactModalOpen(false);
                      setSupportNote('');
                    } catch (err) {
                      const displayMsg = typeof err === 'string'
                        ? err
                        : (err?.response?.data?.message || err?.error || err?.message || 'Unable to submit support ticket');
                      toast.error(String(displayMsg).slice(0, 100));
                    } finally {
                      setIsSendingSupport(false);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#E53935] py-3.5 text-xs font-black text-white shadow-lg shadow-orange-500/30 cursor-pointer disabled:opacity-50"
                >
                  <Send size={16} />
                  <span>{isSendingSupport ? 'Sending Request...' : 'Send Request to Admin Panel'}</span>
                </motion.button>

                <div className="flex gap-2">
                  <a
                    href="tel:18001234567"
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
                  >
                    <Phone size={14} className="text-emerald-400" />
                    <span>Call Admin</span>
                  </a>
                  <a
                    href="https://wa.me/919876543210"
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
                  >
                    <MessageSquare size={14} className="text-emerald-400" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BusDriverHome;
