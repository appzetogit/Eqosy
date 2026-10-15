import React, { useEffect, useMemo, useState } from 'react';
import { Bus, ChevronLeft, ChevronRight, Loader2, Search, Ticket, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import { Card, Chip, EmptyState, Input, Screen, SectionLabel, StatusPill, TopBar } from './ownerBus/ownerUi';
import {
  cancelOwnerBusBookingSeats,
  getOwnerBusBookingCalendar,
  getOwnerBusBookings,
} from '../services/registrationService';

const statusTone = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  failed: 'bg-slate-100 text-slate-600 border-slate-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
};

const formatCurrency = (amount = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const formatDateLabel = (value) => {
  if (!value) return 'No date';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const getTodayValue = () => new Date().toISOString().slice(0, 10);
const getMonthValue = (value = getTodayValue()) => String(value || '').slice(0, 7);

const buildCalendarCells = (month, dayLookup) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return [];
  const [year, monthIndexValue] = month.split('-').map(Number);
  const monthIndex = monthIndexValue - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingSlots = firstDay.getDay();
  const cells = [];

  for (let index = 0; index < leadingSlots; index += 1) {
    cells.push({ id: `blank-${index}`, isCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({
      id: date,
      date,
      isCurrentMonth: true,
      metrics: dayLookup.get(date) || null,
    });
  }

  return cells;
};

const OwnerBusBookingsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [filters, setFilters] = useState({
    busServiceId: location.state?.busServiceId || '',
    travelDate: getTodayValue(),
    status: 'all',
    search: '',
  });
  const [month, setMonth] = useState(getMonthValue());
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [bookingData, setBookingData] = useState({
    buses: [],
    bookings: [],
    summary: {},
  });
  const [calendarDays, setCalendarDays] = useState([]);

  const loadBookings = async (activeFilters) => {
    const response = await getOwnerBusBookings(activeFilters);
    return response?.data?.data || response?.data || {};
  };

  const loadCalendar = async (payload) => {
    const response = await getOwnerBusBookingCalendar(payload);
    return response?.data?.data?.days || response?.data?.days || [];
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const data = await loadBookings(filters);
        if (!active) return;
        setBookingData(data);
        if (!filters.busServiceId && Array.isArray(data?.buses) && data.buses[0]) {
          setFilters((current) => ({ ...current, busServiceId: data.buses[0].id }));
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus bookings');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [filters.busServiceId, filters.search, filters.status, filters.travelDate]);

  useEffect(() => {
    if (!filters.busServiceId) return undefined;
    let active = true;
    const run = async () => {
      setCalendarLoading(true);
      try {
        const days = await loadCalendar({
          busServiceId: filters.busServiceId,
          month,
        });
        if (!active) return;
        setCalendarDays(days);
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus calendar');
      } finally {
        if (active) setCalendarLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [filters.busServiceId, month]);

  const buses = bookingData.buses || [];
  const bookings = bookingData.bookings || [];
  const summary = bookingData.summary || {};
  const selectedBus = useMemo(
    () => buses.find((item) => item.id === filters.busServiceId) || null,
    [buses, filters.busServiceId],
  );
  const dayLookup = useMemo(
    () => new Map((calendarDays || []).map((item) => [item.date, item])),
    [calendarDays],
  );
  const calendarCells = useMemo(() => buildCalendarCells(month, dayLookup), [dayLookup, month]);

  const refreshData = async () => {
    const [data, days] = await Promise.all([
      loadBookings(filters),
      filters.busServiceId ? loadCalendar({ busServiceId: filters.busServiceId, month }) : Promise.resolve([]),
    ]);
    setBookingData(data);
    setCalendarDays(days);
  };

  const handleCancelSeats = async (bookingId, seatIds = []) => {
    setActionLoading(`${bookingId}-${seatIds.join(',') || 'all'}`);
    try {
      const response = await cancelOwnerBusBookingSeats(bookingId, {
        seatIds,
        ownerNote: seatIds.length > 0 ? 'Seat cancelled by owner panel' : 'Booking cancelled by owner panel',
      });
      await refreshData();
      toast.success(response?.data?.message || 'Cancellation processed');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to cancel booking seats');
    } finally {
      setActionLoading('');
    }
  };

  const shiftMonth = (delta) => {
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  const confirmCancel = (booking, seat = null) => {
    const message = seat
      ? `Cancel seat ${seat.seatLabel} for ${booking.passenger?.name || 'this passenger'}? Refund follows the bus cancellation rules.`
      : `Cancel the full booking ${booking.bookingCode || ''}? Refund follows the bus cancellation rules.`;
    if (window.confirm(message)) handleCancelSeats(booking.id, seat ? [seat.seatId] : []);
  };

  const monthLabel = (() => {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  })();

  return (
    <>
      <Screen>
        <TopBar title="Bus Bookings" subtitle="Passengers" onBack={() => navigate('/taxi/owner/bus-service')} />

        {buses.length > 0 ? (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {buses.map((bus) => (
              <Chip
                key={bus.id}
                active={filters.busServiceId === bus.id}
                onClick={() => setFilters((current) => ({ ...current, busServiceId: bus.id }))}
              >
                {bus.busName}
              </Chip>
            ))}
          </div>
        ) : null}

        {selectedBus ? (
          <p className="mt-2 px-1 text-[12px] font-bold text-slate-500">
            {selectedBus.route?.originCity || 'Origin'} → {selectedBus.route?.destinationCity || 'Destination'}
          </p>
        ) : null}

        {/* Calendar */}
        <SectionLabel
          right={
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm">
                <ChevronLeft size={15} />
              </button>
              <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm">
                <ChevronRight size={15} />
              </button>
            </div>
          }
        >
          {monthLabel}
        </SectionLabel>
        <Card className="p-3">
          <div className="grid grid-cols-7 gap-1 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <span key={`${day}-${index}`} className="pb-1 text-[10px] font-black text-slate-400">{day}</span>
            ))}
            {calendarCells.map((cell) =>
              cell.isCurrentMonth ? (
                <button
                  key={cell.id}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, travelDate: cell.date }))}
                  className={`relative flex h-10 flex-col items-center justify-center rounded-xl text-[13px] font-black transition active:scale-95 ${
                    filters.travelDate === cell.date ? 'bg-slate-950 text-white' : 'text-slate-700'
                  }`}
                >
                  {Number(cell.date.slice(-2))}
                  {cell.metrics?.totalBookings ? (
                    <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-orange-500" />
                  ) : null}
                </button>
              ) : (
                <span key={cell.id} />
              ),
            )}
          </div>
          {calendarLoading ? <p className="mt-2 text-center text-[11px] font-bold text-slate-400">Loading calendar...</p> : null}
        </Card>

        {/* Summary */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Bookings', summary.totalBookings || 0],
            ['Seats', summary.totalSeats || 0],
            ['Revenue', formatCurrency(summary.totalAmount || 0, selectedBus?.fareCurrency || 'INR')],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/80 bg-white px-3 py-3 text-center shadow-sm">
              <p className="truncate text-[17px] font-black leading-none text-slate-900">{value}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="relative mt-4">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search booking, passenger, phone"
            className="pl-11"
          />
        </div>
        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {[
            ['all', 'All'],
            ['confirmed', 'Confirmed'],
            ['pending', 'Pending'],
            ['cancelled', 'Cancelled'],
            ['failed', 'Failed'],
          ].map(([value, label]) => (
            <Chip key={value} active={filters.status === value} onClick={() => setFilters((current) => ({ ...current, status: value }))}>
              {label}
            </Chip>
          ))}
        </div>

        {/* Bookings */}
        <SectionLabel>{formatDateLabel(filters.travelDate)}</SectionLabel>
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-slate-400" size={26} /></div>
          ) : buses.length === 0 ? (
            <EmptyState icon={Bus} title="No buses yet" text="Add a bus first. Its bookings will show here." />
          ) : bookings.length === 0 ? (
            <EmptyState icon={Ticket} title="No bookings" text="No bookings for this bus on this date. Pick another date on the calendar." />
          ) : (
            bookings.map((booking) => (
              <Card key={booking.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-black text-slate-900">{booking.passenger?.name || booking.user?.name || 'Passenger'}</p>
                    <p className="text-[12px] font-bold text-slate-400">
                      {booking.passenger?.phone || booking.user?.phone || 'No phone'} · {booking.bookingCode || booking.id}
                    </p>
                  </div>
                  <StatusPill status={booking.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fare</p>
                    <p className="text-[14px] font-black text-slate-900">{formatCurrency(booking.amount, booking.currency)}</p>
                    <p className="text-[11px] font-bold text-slate-400">Payment {booking.payment?.status || 'pending'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Seats</p>
                    <p className="text-[14px] font-black text-slate-900">{booking.seatSummary?.active || 0} of {booking.seatSummary?.total || 0} active</p>
                    <p className="truncate text-[11px] font-bold text-slate-400">
                      {booking.routeSnapshot?.originCity || 'Origin'} → {booking.routeSnapshot?.destinationCity || 'Destination'}
                    </p>
                  </div>
                </div>

                {(booking.activeSeats || []).length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold text-slate-400">Tap a seat to cancel just that seat</p>
                    <div className="flex flex-wrap gap-1.5">
                      {booking.activeSeats.map((seat) => (
                        <button
                          key={`${booking.id}-${seat.seatId}`}
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => confirmCancel(booking, seat)}
                          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-black text-slate-700 active:bg-rose-50 active:text-rose-600 disabled:opacity-50"
                        >
                          {seat.seatLabel} <X size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(booking.cancelledSeats || []).length > 0 ? (
                  <div className="rounded-2xl bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700">
                    {booking.cancelledSeats.map((seat) => (
                      <p key={`${booking.id}-refund-${seat.seatId}`}>
                        {seat.seatLabel}: {formatCurrency(seat.refundAmount, booking.currency)} refunded
                      </p>
                    ))}
                  </div>
                ) : null}

                {(booking.activeSeats || []).length > 0 ? (
                  <button
                    type="button"
                    disabled={Boolean(actionLoading)}
                    onClick={() => confirmCancel(booking)}
                    className="flex h-11 w-full items-center justify-center rounded-2xl border border-rose-200 text-[13px] font-black text-rose-600 active:bg-rose-50 disabled:opacity-50"
                  >
                    {actionLoading.startsWith(booking.id) ? 'Processing...' : 'Cancel full booking'}
                  </button>
                ) : null}
              </Card>
            ))
          )}
        </div>
      </Screen>
      <DriverBottomNav />
    </>
  );
};


export default OwnerBusBookingsPage;
