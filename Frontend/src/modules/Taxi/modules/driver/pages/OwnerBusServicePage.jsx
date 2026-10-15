import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Armchair,
  Bus,
  CalendarDays,
  Camera,
  Check,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Ticket,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useSettings } from '../../../shared/context/SettingsContext';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import {
  BUS_BLUEPRINT_TEMPLATES,
  countTotalSeats,
  createBlueprintFromTemplate,
  createBusDraft,
  normalizeBusCatalog,
} from '../../admin/services/busService';
import {
  getOwnerFleetDrivers,
  createOwnerBusService,
  deleteOwnerBusService,
  getOwnerBusServices,
  updateOwnerBusService,
} from '../services/registrationService';
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionLabel,
  Select,
  StatusPill,
  StickyActions,
  TopBar,
  formatMoney,
} from './ownerBus/ownerUi';

const BASE = '/taxi/owner/bus-service';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COACH_TYPES = ['AC Sleeper', 'Non-AC Sleeper', 'AC Seater', 'Non-AC Seater', 'AC Semi Sleeper', 'Volvo Multi-Axle'];
const AMENITIES = ['Charging Port', 'WiFi', 'Blanket', 'Water Bottle', 'Live Tracking', 'Reading Light', 'Snacks', 'CCTV'];
const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'pending_approval', label: 'In review' },
  { id: 'rejected', label: 'Rejected' },
];
const STEPS = ['Bus', 'Route', 'Seats', 'Schedule'];

const newId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const routeLabel = (bus) => {
  const from = bus?.route?.originCity || 'Origin';
  const to = bus?.route?.destinationCity || 'Destination';
  return `${from} → ${to}`;
};

/* ------------------------------- API ------------------------------- */

const fetchBuses = async () => {
  const response = await getOwnerBusServices();
  const raw = response?.data?.data || response?.data?.results || response?.data || [];
  return normalizeBusCatalog(Array.isArray(raw) ? raw : []);
};

const fetchDrivers = async () => {
  const response = await getOwnerFleetDrivers();
  const raw = response?.data?.data?.results || response?.data?.results || [];
  return Array.isArray(raw) ? raw : [];
};

const saveBus = async (payload) => {
  const isNew = String(payload.id || '').startsWith('bus-');
  const response = isNew ? await createOwnerBusService(payload) : await updateOwnerBusService(payload.id, payload);
  return normalizeBusCatalog([response?.data?.data || {}])[0];
};

const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

/* --------------------------- Seat map --------------------------- */

const SeatMap = ({ title, deck = [], onToggle }) => {
  if (!deck.length) return null;
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-3">
      <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-wider text-slate-400">{title}</p>
      <div className="space-y-1.5">
        {deck.map((row, rowIndex) => (
          <div key={rowIndex} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
            {row.map((cell, cellIndex) =>
              cell?.kind === 'seat' ? (
                <button
                  key={cell.id || cellIndex}
                  type="button"
                  onClick={() => onToggle?.(cell.id)}
                  className={`flex h-9 items-center justify-center rounded-lg text-[10px] font-black transition active:scale-95 ${
                    cell.status === 'blocked'
                      ? 'bg-slate-300 text-slate-500 line-through'
                      : cell.variant === 'sleeper'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-white text-slate-700 shadow-sm'
                  }`}
                >
                  {cell.label}
                </button>
              ) : (
                <span key={cellIndex} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------ List ------------------------------ */

const BusList = ({ buses, loading, onOpen, onCreate, onBookings, onBack }) => {
  const [tab, setTab] = useState('all');
  const visible = tab === 'all' ? buses : buses.filter((bus) => bus.status === tab);

  return (
    <Screen
      footer={
        buses.length > 0 ? (
          <StickyActions>
            <SecondaryButton onClick={onBookings} className="h-12 text-[14px]">
              <Ticket size={17} /> Bookings
            </SecondaryButton>
            <PrimaryButton onClick={onCreate} className="h-12 text-[14px]">
              <Plus size={17} /> Add bus
            </PrimaryButton>
          </StickyActions>
        ) : null
      }
    >
      <TopBar title="My Buses" subtitle="Bus services" onBack={onBack} />

      <div className="grid grid-cols-3 gap-2">
        {[
          ['Buses', buses.length],
          ['Active', buses.filter((b) => b.status === 'active').length],
          ['In review', buses.filter((b) => b.status === 'pending_approval').length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/80 bg-white px-3 py-3 text-center shadow-sm">
            <p className="text-[20px] font-black leading-none text-slate-900">{value}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {STATUS_TABS.map((item) => (
          <Chip key={item.id} active={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </Chip>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-slate-400" size={28} />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Bus}
            title={buses.length === 0 ? 'No buses yet' : 'Nothing here'}
            text={
              buses.length === 0
                ? 'Add your first bus with its route, seats and timings. Admin will review it before it goes live.'
                : 'No buses match this filter.'
            }
            action={buses.length === 0 ? <PrimaryButton onClick={onCreate}><Plus size={18} /> Add your first bus</PrimaryButton> : null}
          />
        ) : (
          visible.map((bus) => (
            <Card key={bus.id} onClick={() => onOpen(bus.id)} className="p-3">
              <div className="flex gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                  {bus.coverImage || bus.image ? (
                    <img src={bus.coverImage || bus.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <Bus size={28} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[15px] font-black text-slate-900">{bus.busName || 'Untitled bus'}</p>
                    <StatusPill status={bus.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[12px] font-bold text-slate-500">{routeLabel(bus)}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-400">
                    <span className="flex items-center gap-1"><Armchair size={12} />{bus.capacity || countTotalSeats(bus.blueprint)} seats</span>
                    <span className="flex items-center gap-1"><Clock size={12} />{bus.schedules?.[0]?.departureTime || '--:--'}</span>
                    <span>{formatMoney(bus.seatPrice, bus.fareCurrency)}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </Screen>
  );
};

/* ----------------------------- Details ----------------------------- */

const BusDetails = ({ bus, onBack, onEdit, onDelete, onBookings, deleting }) => {
  if (!bus) {
    return (
      <Screen>
        <TopBar title="Bus not found" onBack={onBack} />
        <EmptyState icon={Bus} title="This bus is not available" text="It may have been removed." />
      </Screen>
    );
  }

  const stops = bus.route?.stops || [];

  return (
    <Screen
      footer={
        <StickyActions>
          <SecondaryButton onClick={onDelete} disabled={deleting} className="h-12 w-14 shrink-0 text-rose-600">
            {deleting ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
          </SecondaryButton>
          <SecondaryButton onClick={onBookings} className="h-12 text-[14px]">
            <Ticket size={17} /> Bookings
          </SecondaryButton>
          <PrimaryButton onClick={onEdit} className="h-12 text-[14px]">
            <Pencil size={16} /> Edit
          </PrimaryButton>
        </StickyActions>
      }
    >
      <TopBar title={bus.busName || 'Bus'} subtitle={bus.operatorName || 'Bus service'} onBack={onBack} />

      <div className="relative h-44 overflow-hidden rounded-[1.75rem] bg-slate-900">
        {bus.coverImage || bus.image ? (
          <img src={bus.coverImage || bus.image} alt="" className="h-full w-full object-cover opacity-90" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-600">
            <Bus size={56} />
          </div>
        )}
        <div className="absolute left-3 top-3"><StatusPill status={bus.status} /></div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <p className="text-[18px] font-black text-white">{routeLabel(bus)}</p>
          <p className="text-[12px] font-bold text-white/70">{bus.coachType} · {bus.registrationNumber || 'No reg. number'}</p>
        </div>
      </div>

      {bus.status === 'rejected' && bus.rejectionReason ? (
        <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-bold text-rose-700">
          Rejected: {bus.rejectionReason}. Edit the bus and save to send it for review again.
        </div>
      ) : null}
      {bus.status === 'pending_approval' ? (
        <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-700">
          Waiting for admin approval. It will show to passengers once approved.
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['Seats', bus.capacity || countTotalSeats(bus.blueprint)],
          ['From', formatMoney(bus.seatPrice, bus.fareCurrency)],
          ['Trips', bus.schedules?.length || 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/80 bg-white px-3 py-3 text-center shadow-sm">
            <p className="truncate text-[17px] font-black leading-none text-slate-900">{value}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      <SectionLabel>Route & stops</SectionLabel>
      <Card>
        <div className="space-y-3">
          {stops.map((stop, index) => (
            <div key={stop.id || index} className="flex items-start gap-3">
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${stop.stopType === 'drop' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-black text-slate-900">{stop.city || 'City'}{stop.pointName ? ` · ${stop.pointName}` : ''}</p>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {stop.stopType === 'drop' ? 'Drop' : 'Pickup'}{stop.departureTime || stop.arrivalTime ? ` · ${stop.departureTime || stop.arrivalTime}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SectionLabel>Timings</SectionLabel>
      <div className="space-y-2">
        {(bus.schedules || []).map((schedule) => (
          <Card key={schedule.id}>
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-black text-slate-900">{schedule.label || 'Trip'}</p>
              <p className="text-[13px] font-black text-slate-700">{schedule.departureTime} → {schedule.arrivalTime}</p>
            </div>
            <p className="mt-1 text-[11px] font-bold text-slate-400">{(schedule.activeDays || []).join(', ') || 'No days selected'}</p>
          </Card>
        ))}
      </div>

      <SectionLabel>Driver & amenities</SectionLabel>
      <Card>
        <p className="flex items-center gap-2 text-[14px] font-black text-slate-900">
          <User size={16} className="text-slate-400" />
          {bus.driverName ? `${bus.driverName}${bus.driverPhone ? ` · ${bus.driverPhone}` : ''}` : 'No driver assigned'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(bus.amenities || []).map((item) => (
            <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{item}</span>
          ))}
        </div>
      </Card>
    </Screen>
  );
};

/* ------------------------------ Form ------------------------------ */

const BusForm = ({ initialBus, drivers, onBack, onSaved }) => {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(initialBus)));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const isNew = String(draft.id || '').startsWith('bus-');
  const totalSeats = useMemo(() => countTotalSeats(draft.blueprint), [draft.blueprint]);
  const usedVariants = useMemo(() => {
    const cells = [...(draft.blueprint?.lowerDeck || []), ...(draft.blueprint?.upperDeck || [])].flat();
    return Array.from(new Set(cells.filter((c) => c?.kind === 'seat').map((c) => c.variant || 'seat')));
  }, [draft.blueprint]);

  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));
  const setRoute = (field, value) => setDraft((d) => ({ ...d, route: { ...d.route, [field]: value } }));
  const setStop = (id, field, value) =>
    setDraft((d) => ({ ...d, route: { ...d.route, stops: d.route.stops.map((s) => (s.id === id ? { ...s, [field]: value } : s)) } }));
  const setSchedule = (id, field, value) =>
    setDraft((d) => ({ ...d, schedules: d.schedules.map((s) => (s.id === id ? { ...s, [field]: value } : s)) }));

  const toggleSeat = (seatId) =>
    setDraft((d) => {
      const blueprint = JSON.parse(JSON.stringify(d.blueprint));
      ['lowerDeck', 'upperDeck'].forEach((key) => {
        blueprint[key] = (blueprint[key] || []).map((row) =>
          row.map((cell) =>
            cell?.kind === 'seat' && cell.id === seatId
              ? { ...cell, status: cell.status === 'blocked' ? 'available' : 'blocked' }
              : cell,
          ),
        );
      });
      return { ...d, blueprint };
    });

  const handleCover = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Please choose a photo smaller than 3 MB');
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setDraft((d) => ({ ...d, image: url, coverImage: url }));
    } catch {
      toast.error('Could not read that photo');
    }
  };

  const validateStep = (index) => {
    const fail = (message) => {
      toast.error(message);
      return false;
    };
    if (index === 0) {
      if (!draft.busName?.trim()) return fail('Enter the bus name');
      if (!draft.operatorName?.trim()) return fail('Enter the operator / travels name');
      if (!draft.registrationNumber?.trim()) return fail('Enter the registration number');
    }
    if (index === 1) {
      if (!draft.route?.originCity?.trim()) return fail('Enter the starting city');
      if (!draft.route?.destinationCity?.trim()) return fail('Enter the destination city');
      if (draft.route.stops.some((s) => !s.city?.trim())) return fail('Every stop needs a city, or remove the empty stop');
    }
    if (index === 2) {
      if (totalSeats === 0) return fail('Choose a seat layout');
      if (!(Number(draft.seatPrice) > 0)) return fail('Enter a seat price');
    }
    if (index === 3) {
      if (draft.schedules.length === 0) return fail('Add at least one trip timing');
      if (draft.schedules.some((s) => !s.departureTime || !s.arrivalTime)) return fail('Set departure and arrival time for every trip');
      if (draft.schedules.some((s) => !(s.activeDays || []).length)) return fail('Pick at least one day for every trip');
    }
    return true;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    for (let i = 0; i < STEPS.length; i += 1) {
      if (!validateStep(i)) {
        setStep(i);
        return;
      }
    }
    setSaving(true);
    try {
      const variantPricing = { ...draft.variantPricing };
      ['seat', 'window', 'aisle', 'sleeper'].forEach((key) => {
        if (!(Number(variantPricing[key]) > 0)) variantPricing[key] = draft.seatPrice;
      });
      const saved = await saveBus({
        ...draft,
        route: {
          ...draft.route,
          routeName: draft.route.routeName?.trim() || `${draft.route.originCity} - ${draft.route.destinationCity}`,
        },
        variantPricing,
        capacity: totalSeats,
        status: draft.status || 'pending_approval',
      });
      toast.success(isNew ? 'Bus added and sent for approval' : 'Bus updated');
      onSaved(saved);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the bus'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <StickyActions>
          {step > 0 ? (
            <SecondaryButton onClick={() => setStep((s) => s - 1)} className="h-12 w-28 shrink-0 text-[14px]">
              Back
            </SecondaryButton>
          ) : null}
          {step < STEPS.length - 1 ? (
            <PrimaryButton onClick={next} className="h-12 text-[14px]">Continue</PrimaryButton>
          ) : (
            <PrimaryButton onClick={save} disabled={saving} className="h-12 text-[14px]">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
              {isNew ? 'Add bus' : 'Save changes'}
            </PrimaryButton>
          )}
        </StickyActions>
      }
    >
      <TopBar title={isNew ? 'Add a bus' : 'Edit bus'} subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`} onBack={onBack} />

      {/* Stepper */}
      <div className="mb-5 grid grid-cols-4 gap-1.5">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => index < step && setStep(index)}
            className="text-left"
          >
            <span className={`block h-1.5 rounded-full ${index <= step ? 'bg-slate-950' : 'bg-slate-200'}`} />
            <span className={`mt-1.5 block text-[10px] font-black uppercase tracking-wider ${index <= step ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="space-y-4">
          <label className="relative block h-40 cursor-pointer overflow-hidden rounded-[1.75rem] border-2 border-dashed border-slate-200 bg-white">
            {draft.coverImage || draft.image ? (
              <img src={draft.coverImage || draft.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-slate-400">
                <Camera size={28} />
                <span className="mt-2 text-[13px] font-black">Add bus photo</span>
              </div>
            )}
            {draft.coverImage || draft.image ? (
              <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-black text-white">Change</span>
            ) : null}
            <input type="file" accept="image/*" className="hidden" onChange={handleCover} />
          </label>

          <Card className="space-y-4">
            <Field label="Bus name" required>
              <Input value={draft.busName} onChange={(e) => set('busName', e.target.value)} placeholder="e.g. Indore Express" />
            </Field>
            <Field label="Operator / travels name" required>
              <Input value={draft.operatorName} onChange={(e) => set('operatorName', e.target.value)} placeholder="e.g. Malwa Travels" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reg. number" required>
                <Input value={draft.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value.toUpperCase())} placeholder="MP09AB1234" />
              </Field>
              <Field label="Service no.">
                <Input value={draft.serviceNumber} onChange={(e) => set('serviceNumber', e.target.value)} placeholder="Optional" />
              </Field>
            </div>
            <Field label="Coach type">
              <Select value={draft.coachType} onChange={(e) => set('coachType', e.target.value)}>
                {Array.from(new Set([...COACH_TYPES, draft.coachType].filter(Boolean))).map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
            </Field>
          </Card>

          <Card className="space-y-3">
            <Field label="Driver" hint={drivers.length ? 'Pick one of your fleet drivers.' : 'Add drivers from the Drivers section to assign one.'}>
              <Select value={draft.ownerDriverId || ''} onChange={(e) => set('ownerDriverId', e.target.value)}>
                <option value="">No driver for now</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>{driver.name} · {driver.phone}</option>
                ))}
              </Select>
            </Field>
          </Card>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" required>
                <Input value={draft.route.originCity} onChange={(e) => setRoute('originCity', e.target.value)} placeholder="Indore" />
              </Field>
              <Field label="To" required>
                <Input value={draft.route.destinationCity} onChange={(e) => setRoute('destinationCity', e.target.value)} placeholder="Bhopal" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Distance (km)">
                <Input inputMode="decimal" value={draft.route.distanceKm} onChange={(e) => setRoute('distanceKm', e.target.value.replace(/[^\d.]/g, ''))} placeholder="190" />
              </Field>
              <Field label="Duration (hrs)">
                <Input inputMode="decimal" value={draft.route.durationHours} onChange={(e) => setRoute('durationHours', e.target.value.replace(/[^\d.]/g, ''))} placeholder="4" />
              </Field>
            </div>
          </Card>

          <SectionLabel
            right={
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    route: { ...d.route, stops: [...d.route.stops, { id: newId('stop'), city: '', pointName: '', stopType: 'pickup', arrivalTime: '', departureTime: '' }] },
                  }))
                }
                className="flex items-center gap-1 text-[12px] font-black text-slate-900"
              >
                <Plus size={14} /> Add stop
              </button>
            }
          >
            Pickup & drop points
          </SectionLabel>
          <div className="space-y-3">
            {draft.route.stops.map((stop, index) => (
              <Card key={stop.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-[13px] font-black text-slate-900">
                    <MapPin size={15} className={stop.stopType === 'drop' ? 'text-rose-500' : 'text-emerald-500'} /> Stop {index + 1}
                  </p>
                  {draft.route.stops.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Remove stop"
                      onClick={() => setDraft((d) => ({ ...d, route: { ...d.route, stops: d.route.stops.filter((s) => s.id !== stop.id) } }))}
                      className="rounded-xl p-1.5 text-slate-400 active:bg-rose-50 active:text-rose-600"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Chip active={stop.stopType !== 'drop'} onClick={() => setStop(stop.id, 'stopType', 'pickup')}>Pickup</Chip>
                  <Chip active={stop.stopType === 'drop'} onClick={() => setStop(stop.id, 'stopType', 'drop')}>Drop</Chip>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input value={stop.city} onChange={(e) => setStop(stop.id, 'city', e.target.value)} placeholder="City" />
                  <Input type="time" value={stop.departureTime || stop.arrivalTime || ''} onChange={(e) => {
                    setStop(stop.id, 'departureTime', e.target.value);
                    setStop(stop.id, 'arrivalTime', e.target.value);
                  }} />
                </div>
                <Input value={stop.pointName} onChange={(e) => setStop(stop.id, 'pointName', e.target.value)} placeholder="Point, e.g. Vijay Nagar Square" />
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {BUS_BLUEPRINT_TEMPLATES.map((template) => {
              const active = draft.blueprint?.templateKey === template.key;
              return (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => set('blueprint', createBlueprintFromTemplate(template.key))}
                  className={`rounded-2xl border p-3 text-left transition active:scale-95 ${active ? 'border-slate-950 bg-slate-950 text-white' : 'border-white/80 bg-white text-slate-800 shadow-sm'}`}
                >
                  <Armchair size={18} />
                  <p className="mt-2 text-[12px] font-black leading-tight">{template.label}</p>
                  <p className={`text-[10px] font-bold ${active ? 'text-white/60' : 'text-slate-400'}`}>{template.category}</p>
                </button>
              );
            })}
          </div>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-black text-slate-900">{totalSeats} seats</p>
              <p className="text-[11px] font-bold text-slate-400">Tap a seat to block it</p>
            </div>
            <SeatMap title="Lower deck" deck={draft.blueprint?.lowerDeck} onToggle={toggleSeat} />
            <SeatMap title="Upper deck" deck={draft.blueprint?.upperDeck} onToggle={toggleSeat} />
          </Card>

          <Card className="space-y-4">
            <Field label="Seat price (₹)" required hint="Used for every seat type you don't set below.">
              <Input inputMode="numeric" value={draft.seatPrice} onChange={(e) => set('seatPrice', e.target.value.replace(/[^\d]/g, ''))} placeholder="899" />
            </Field>
            {usedVariants.length > 1 || usedVariants.includes('sleeper') ? (
              <div className="grid grid-cols-2 gap-3">
                {usedVariants.map((variant) => (
                  <Field key={variant} label={`${variant.charAt(0).toUpperCase()}${variant.slice(1)} (₹)`}>
                    <Input
                      inputMode="numeric"
                      value={draft.variantPricing?.[variant] ?? ''}
                      onChange={(e) => set('variantPricing', { ...draft.variantPricing, [variant]: e.target.value.replace(/[^\d]/g, '') })}
                    />
                  </Field>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <SectionLabel
            right={
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    schedules: [...d.schedules, { id: newId('schedule'), label: 'New trip', departureTime: '', arrivalTime: '', activeDays: [...DAYS], status: 'active' }],
                  }))
                }
                className="flex items-center gap-1 text-[12px] font-black text-slate-900"
              >
                <Plus size={14} /> Add trip
              </button>
            }
          >
            Trip timings
          </SectionLabel>
          <div className="space-y-3">
            {draft.schedules.map((schedule) => (
              <Card key={schedule.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input value={schedule.label} onChange={(e) => setSchedule(schedule.id, 'label', e.target.value)} placeholder="Trip name" />
                  {draft.schedules.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Remove trip"
                      onClick={() => setDraft((d) => ({ ...d, schedules: d.schedules.filter((s) => s.id !== schedule.id) }))}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Departs">
                    <Input type="time" value={schedule.departureTime} onChange={(e) => setSchedule(schedule.id, 'departureTime', e.target.value)} />
                  </Field>
                  <Field label="Arrives">
                    <Input type="time" value={schedule.arrivalTime} onChange={(e) => setSchedule(schedule.id, 'arrivalTime', e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {DAYS.map((day) => {
                    const on = (schedule.activeDays || []).includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          setSchedule(
                            schedule.id,
                            'activeDays',
                            on ? schedule.activeDays.filter((d) => d !== day) : [...(schedule.activeDays || []), day],
                          )
                        }
                        className={`h-10 rounded-xl text-[11px] font-black ${on ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {day.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>

          <SectionLabel>Amenities</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set([...AMENITIES, ...(draft.amenities || [])])).map((item) => {
              const on = (draft.amenities || []).includes(item);
              return (
                <Chip
                  key={item}
                  active={on}
                  onClick={() => set('amenities', on ? draft.amenities.filter((a) => a !== item) : [...(draft.amenities || []), item])}
                >
                  {on ? '✓ ' : ''}{item}
                </Chip>
              );
            })}
          </div>

          <Card className="mt-2 flex items-start gap-3 bg-amber-50/60">
            <CalendarDays size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-[12px] font-bold leading-relaxed text-amber-800">
              New buses and changes go to admin for review before passengers can book them.
            </p>
          </Card>
        </div>
      ) : null}
    </Screen>
  );
};

/* ------------------------------ Page ------------------------------ */

const OwnerBusServicePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { settings } = useSettings();
  const busEnabled = String(settings.transportRide?.enable_bus_service ?? '1') !== '0';
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const path = location.pathname.replace(/\/$/, '');
  const mode = path === `${BASE}/create` ? 'create' : path.startsWith(`${BASE}/edit/`) ? 'edit' : id ? 'details' : 'list';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [busList, driverList] = await Promise.all([fetchBuses(), fetchDrivers().catch(() => [])]);
      setBuses(busList);
      setDrivers(driverList);
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load your buses'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (busEnabled) load();
  }, [busEnabled, load]);

  const currentBus = useMemo(() => buses.find((bus) => String(bus.id) === String(id)) || null, [buses, id]);

  const handleSaved = (saved) => {
    setBuses((list) => {
      const index = list.findIndex((bus) => bus.id === saved.id);
      if (index < 0) return [saved, ...list];
      const copy = [...list];
      copy[index] = saved;
      return copy;
    });
    navigate(`${BASE}/${saved.id}`, { replace: true });
  };

  const handleDelete = async () => {
    if (!currentBus || !window.confirm(`Delete "${currentBus.busName || 'this bus'}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteOwnerBusService(currentBus.id);
      setBuses((list) => list.filter((bus) => bus.id !== currentBus.id));
      toast.success('Bus deleted');
      navigate(BASE, { replace: true });
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete the bus'));
    } finally {
      setDeleting(false);
    }
  };

  let content;
  if (!busEnabled) {
    content = (
      <Screen>
        <TopBar title="Bus services" onBack={() => navigate('/taxi/owner/home')} />
        <EmptyState icon={Bus} title="Bus service is turned off" text="Bus services are disabled in admin settings right now." />
      </Screen>
    );
  } else if (loading && mode !== 'list') {
    content = (
      <Screen>
        <div className="flex justify-center py-24"><Loader2 className="animate-spin text-slate-400" size={30} /></div>
      </Screen>
    );
  } else if (mode === 'create') {
    content = (
      <BusForm
        key="create"
        initialBus={{ ...createBusDraft(), status: 'pending_approval' }}
        drivers={drivers}
        onBack={() => navigate(BASE)}
        onSaved={handleSaved}
      />
    );
  } else if (mode === 'edit') {
    content = currentBus ? (
      <BusForm key={currentBus.id} initialBus={currentBus} drivers={drivers} onBack={() => navigate(`${BASE}/${currentBus.id}`)} onSaved={handleSaved} />
    ) : (
      <BusDetails bus={null} onBack={() => navigate(BASE)} />
    );
  } else if (mode === 'details') {
    content = (
      <BusDetails
        bus={currentBus}
        deleting={deleting}
        onBack={() => navigate(BASE)}
        onEdit={() => navigate(`${BASE}/edit/${currentBus.id}`)}
        onDelete={handleDelete}
        onBookings={() => navigate('/taxi/owner/bus-bookings', { state: { busServiceId: currentBus?.id } })}
      />
    );
  } else {
    content = (
      <BusList
        buses={buses}
        loading={loading}
        onBack={() => navigate('/taxi/owner/home')}
        onOpen={(busId) => navigate(`${BASE}/${busId}`)}
        onCreate={() => navigate(`${BASE}/create`)}
        onBookings={() => navigate('/taxi/owner/bus-bookings')}
      />
    );
  }

  return (
    <>
      {content}
      <DriverBottomNav />
    </>
  );
};

export default OwnerBusServicePage;
