import { TripInstance } from '../user/models/TripInstance.js';
import { TripSeatInventory } from '../user/models/TripSeatInventory.js';
import { ApiError } from '../../../utils/ApiError.js';

const BUS_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toCleanString = (value = '') => String(value || '').trim();

export const normalizeTravelDateString = (value) => {
  const rawValue = toCleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const leadingDateMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (leadingDateMatch) {
    return leadingDateMatch[1];
  }

  const parsed = new Date(rawValue);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  throw new ApiError(400, 'travelDate must be in YYYY-MM-DD format');
};

export const getTravelDayLabel = (travelDate) => {
  const normalized = normalizeTravelDateString(travelDate);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, 'Invalid travelDate');
  }

  return BUS_DAY_LABELS[parsed.getUTCDay()];
};

export const parseTripDateTime = (travelDate, timeValue) => {
  const dateStr = normalizeTravelDateString(travelDate);
  const rawTime = toCleanString(timeValue);

  if (!dateStr || !rawTime) {
    return null;
  }

  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const monthIndex = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);

  const createIstDate = (h, m, addDays = 0) => {
    const utcMillis = Date.UTC(year, monthIndex, day + addDays, h, m) - ((5 * 60) + 30) * 60 * 1000;
    const parsed = new Date(utcMillis);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const time24Match = rawTime.match(/^(\d{1,2}):(\d{2})$/);
  if (time24Match) {
    const hours = Number(time24Match[1]);
    const minutes = Number(time24Match[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return createIstDate(hours, minutes);
    }
  }

  const time12Match = rawTime.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (time12Match) {
    let hours = Number(time12Match[1]);
    const minutes = Number(time12Match[2]);
    const meridiem = time12Match[3].toUpperCase();

    if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      return createIstDate(hours, minutes);
    }
  }

  return null;
};

const extractBlueprintSeatCells = (blueprint = {}) => {
  const lowerSeats = (Array.isArray(blueprint?.lowerDeck) ? blueprint.lowerDeck : [])
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat' && cell?.id)
    .map((cell) => ({ ...cell, deck: 'lower' }));

  const upperSeats = (Array.isArray(blueprint?.upperDeck) ? blueprint.upperDeck : [])
    .flatMap((row) => (Array.isArray(row) ? row : []))
    .filter((cell) => cell?.kind === 'seat' && cell?.id)
    .map((cell) => ({ ...cell, deck: 'upper' }));

  return [...lowerSeats, ...upperSeats];
};

const resolveSeatPrice = (busService = {}, seatCell = {}) => {
  const variantPricing = busService?.variantPricing || {};
  const defaultPrice = Number(busService?.seatPrice || 0);
  const variantKey = String(seatCell?.variant || 'seat').trim().toLowerCase();
  const resolvedPrice = variantPricing?.[variantKey] ?? variantPricing?.seat ?? defaultPrice;

  return Number.isFinite(Number(resolvedPrice)) ? Number(resolvedPrice) : defaultPrice;
};

export const ensureTripInstance = async ({ busService, scheduleId, travelDate }) => {
  if (!busService || !scheduleId || !travelDate) {
    throw new ApiError(400, 'busService, scheduleId, and travelDate are required to ensure TripInstance');
  }

  const normalizedDate = normalizeTravelDateString(travelDate);
  const schedule = (Array.isArray(busService.schedules) ? busService.schedules : []).find(
    (item) => String(item?.id || '') === String(scheduleId || ''),
  );

  if (!schedule || String(schedule.status || 'active') !== 'active') {
    throw new ApiError(404, 'Schedule not found or inactive');
  }

  let trip = await TripInstance.findOne({
    busServiceId: busService._id,
    scheduleId,
    travelDate: normalizedDate,
  });

  if (trip && trip.generationStatus === 'ready') {
    return trip;
  }

  const departureDateTime = parseTripDateTime(normalizedDate, schedule.departureTime);
  let arrivalDateTime = parseTripDateTime(normalizedDate, schedule.arrivalTime);

  if (!departureDateTime) {
    throw new ApiError(400, 'Invalid departure time configured in bus schedule');
  }

  if (arrivalDateTime && arrivalDateTime.getTime() < departureDateTime.getTime()) {
    const nextDayDate = new Date(departureDateTime.getTime() + 24 * 60 * 60 * 1000);
    arrivalDateTime = parseTripDateTime(
      `${nextDayDate.getFullYear()}-${String(nextDayDate.getMonth() + 1).padStart(2, '0')}-${String(nextDayDate.getDate()).padStart(2, '0')}`,
      schedule.arrivalTime,
    ) || new Date(departureDateTime.getTime() + 8 * 60 * 60 * 1000);
  }

  if (!arrivalDateTime) {
    arrivalDateTime = new Date(departureDateTime.getTime() + 8 * 60 * 60 * 1000);
  }

  if (!trip) {
    trip = await TripInstance.create({
      busServiceId: busService._id,
      scheduleId,
      travelDate: normalizedDate,
      departureDateTime,
      arrivalDateTime,
      status: 'scheduled',
      generationStatus: 'generating',
      busId: busService._id,
      busSnapshot: {
        registrationNumber: busService.registrationNumber || '',
        model: busService.coachType || busService.busCategory || '',
        capacity: Number(busService.capacity || 0),
        operatorId: busService.ownerId || null,
        operatorName: busService.operatorName || '',
      },
      assignedDriverId: busService.busDriverId || busService.ownerDriverId || null,
      driverSnapshot: {
        name: busService.driverName || '',
        phone: busService.driverPhone || '',
      },
      blueprintSnapshot: {
        templateKey: busService.blueprint?.templateKey || 'seater_2_2',
        lowerDeck: busService.blueprint?.lowerDeck || [],
        upperDeck: busService.blueprint?.upperDeck || [],
      },
    });
  }

  const seatCells = extractBlueprintSeatCells(busService.blueprint);
  const bulkOps = seatCells.map((cell) => {
    const isBlocked = String(cell.status || 'available') === 'blocked';
    const price = resolveSeatPrice(busService, cell);

    return {
      updateOne: {
        filter: { tripId: trip._id, seatId: String(cell.id) },
        update: {
          $setOnInsert: {
            tripId: trip._id,
            busServiceId: busService._id,
            scheduleId,
            travelDate: normalizedDate,
            seatId: String(cell.id),
            seatLabel: cell.label || cell.id,
            deck: cell.deck || 'lower',
            seatType: ['seat', 'window', 'aisle', 'sleeper'].includes(String(cell.variant || '').toLowerCase())
              ? String(cell.variant).toLowerCase()
              : 'seat',
            price,
            status: isBlocked ? 'blocked' : 'available',
          },
        },
        upsert: true,
      },
    };
  });

  if (bulkOps.length > 0) {
    await TripSeatInventory.bulkWrite(bulkOps);
  }

  const seededCount = await TripSeatInventory.countDocuments({ tripId: trip._id });
  if (seededCount >= seatCells.length) {
    trip.generationStatus = 'ready';
    await trip.save();
  } else {
    trip.generationStatus = 'failed';
    await trip.save();
    throw new ApiError(500, 'Failed to seed full trip seat inventory');
  }

  return trip;
};
