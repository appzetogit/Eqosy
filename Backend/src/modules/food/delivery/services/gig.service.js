import mongoose from 'mongoose';
import { FoodGig } from '../models/foodGig.model.js';
import { FoodGigBooking } from '../models/foodGigBooking.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { logger } from '../../../../utils/logger.js';
import { notifyOwnerSafely } from '../../../../core/notifications/firebase.service.js';

const parseDateTime = (dateStr, timeStr) => {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0);
};

const addDaysToStrDate = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const escapeRegex = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createGig = async (payload, adminId = null) => {
  const {
    title,
    date,
    startTime,
    endTime,
    zoneId,
    zoneName,
    capacity,
    cancellationCutoffMinutes,
    repeatOption, // 'single', 'everyday', '7_days', '30_days', 'custom_range'
    endDate
  } = payload;

  if (!date || !startTime || !endTime) {
    throw new ValidationError('Date, start time, and end time are required');
  }

  // Determine dates list to create gigs for
  let datesToCreate = [date];

  if (repeatOption === '7_days') {
    datesToCreate = [];
    for (let i = 0; i < 7; i++) {
      datesToCreate.push(addDaysToStrDate(date, i));
    }
  } else if (repeatOption === '30_days' || repeatOption === 'everyday') {
    datesToCreate = [];
    for (let i = 0; i < 30; i++) {
      datesToCreate.push(addDaysToStrDate(date, i));
    }
  } else if (repeatOption === 'custom_range' && endDate && endDate >= date) {
    datesToCreate = [];
    let curDate = date;
    let daysCount = 0;
    while (curDate <= endDate && daysCount < 365) {
      datesToCreate.push(curDate);
      daysCount++;
      curDate = addDaysToStrDate(date, daysCount);
    }
  }

  const createdGigs = [];
  const normalizedZoneName = zoneName?.trim() || 'All Zones';
  const validZoneId = zoneId && mongoose.Types.ObjectId.isValid(zoneId) ? zoneId : null;

  for (const targetDate of datesToCreate) {
    const startDateTime = parseDateTime(targetDate, startTime);
    const endDateTime = parseDateTime(targetDate, endTime);

    if (endDateTime <= startDateTime) {
      throw new ValidationError(`End time must be after start time for date ${targetDate}`);
    }

    const gigData = {
      title: title?.trim() || 'Delivery Shift',
      date: targetDate,
      startTime,
      endTime,
      startDateTime,
      endDateTime,
      zoneId: validZoneId,
      zoneName: normalizedZoneName,
      capacity: Math.max(1, Number(capacity) || 20),
      cancellationCutoffMinutes: Math.max(0, Number(cancellationCutoffMinutes) ?? 60),
      status: 'active',
      createdByAdmin: adminId
    };

    // Check if gig already exists for same title, date, startTime, endTime and zoneName
    const existing = await FoodGig.findOne({
      title: gigData.title,
      date: gigData.date,
      startTime: gigData.startTime,
      endTime: gigData.endTime,
      zoneName: gigData.zoneName,
      status: 'active'
    });

    if (existing) {
      existing.capacity = gigData.capacity;
      existing.cancellationCutoffMinutes = gigData.cancellationCutoffMinutes;
      await existing.save();
      createdGigs.push(existing.toObject());
    } else {
      const newGig = await FoodGig.create(gigData);
      createdGigs.push(newGig.toObject());
    }
  }

  return createdGigs.length === 1
    ? createdGigs[0]
    : { success: true, count: createdGigs.length, gigs: createdGigs };
};

export const updateGig = async (gigId, payload) => {
  const gig = await FoodGig.findById(gigId);
  if (!gig) {
    throw new NotFoundError('Gig not found');
  }

  const { title, date, startTime, endTime, zoneId, zoneName, capacity, cancellationCutoffMinutes, status, isActive } = payload;

  if (title !== undefined) gig.title = title.trim();
  if (capacity !== undefined) gig.capacity = Math.max(gig.bookedCount, Number(capacity) || 1);
  if (cancellationCutoffMinutes !== undefined) gig.cancellationCutoffMinutes = Math.max(0, Number(cancellationCutoffMinutes) || 0);
  if (status !== undefined && ['active', 'inactive', 'cancelled'].includes(status)) gig.status = status;
  if (isActive !== undefined) gig.status = isActive === false ? 'inactive' : 'active';
  if (zoneName !== undefined) gig.zoneName = zoneName.trim();
  if (zoneId !== undefined) gig.zoneId = zoneId && mongoose.Types.ObjectId.isValid(zoneId) ? zoneId : null;

  if (date || startTime || endTime) {
    const newDate = date || gig.date;
    const newStart = startTime || gig.startTime;
    const newEnd = endTime || gig.endTime;
    const startDT = parseDateTime(newDate, newStart);
    const endDT = parseDateTime(newDate, newEnd);
    if (endDT <= startDT) {
      throw new ValidationError('End time must be after start time');
    }
    gig.date = newDate;
    gig.startTime = newStart;
    gig.endTime = newEnd;
    gig.startDateTime = startDT;
    gig.endDateTime = endDT;
  }

  await gig.save();
  return gig.toObject();
};

export const deleteGig = async (gigId) => {
  const gig = await FoodGig.findById(gigId);
  if (!gig) {
    throw new NotFoundError('Gig not found');
  }
  gig.status = 'inactive';
  await gig.save();
  return { success: true, message: 'Gig deactivated successfully' };
};

export const listAdminGigs = async (query = {}) => {
  const { date, status, zoneId, page = 1, limit = 50 } = query;
  const match = {};

  if (date) match.date = date;
  if (status && status !== 'all') match.status = status;
  if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) match.zoneId = new mongoose.Types.ObjectId(zoneId);

  const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));

  const [gigs, total] = await Promise.all([
    FoodGig.find(match).sort({ startDateTime: 1 }).skip(skip).limit(Number(limit)).lean(),
    FoodGig.countDocuments(match)
  ]);

  const gigIds = gigs.map(g => g._id);
  const bookingsAgg = await FoodGigBooking.aggregate([
    { $match: { gigId: { $in: gigIds } } },
    {
      $group: {
        _id: '$gigId',
        booked: { $sum: { $cond: [{ $eq: ['$status', 'booked'] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        noShow: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } }
      }
    }
  ]);

  const bookingMap = new Map(bookingsAgg.map(b => [String(b._id), b]));

  const enrichedGigs = gigs.map(g => {
    const stats = bookingMap.get(String(g._id)) || { booked: 0, completed: 0, cancelled: 0, noShow: 0 };
    return {
      ...g,
      bookedCount: stats.booked + stats.completed,
      remainingSlots: Math.max(0, g.capacity - (stats.booked + stats.completed)),
      stats
    };
  });

  return {
    gigs: enrichedGigs,
    pagination: { total, page: Number(page), limit: Number(limit) }
  };
};

const resolvePartnerAndIds = async (deliveryPartnerId) => {
  if (!deliveryPartnerId) return { partner: null, partnerIds: [] };
  let partner = null;
  if (mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
    const objId = new mongoose.Types.ObjectId(deliveryPartnerId);
    partner = await FoodDeliveryPartner.findOne({
      $or: [{ _id: objId }, { userId: objId }]
    });
  }
  const partnerIds = partner
    ? [partner._id, partner._id.toString(), partner.userId, partner.userId?.toString()].filter(Boolean)
    : (mongoose.Types.ObjectId.isValid(deliveryPartnerId) ? [new mongoose.Types.ObjectId(deliveryPartnerId), String(deliveryPartnerId)] : [deliveryPartnerId]);
  return { partner, partnerIds };
};

export const listAvailableGigsForPartner = async (deliveryPartnerId, query = {}) => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const { date = todayStr } = query;

  // Fetch delivery partner to check assigned area/zone
  const { partner, partnerIds } = await resolvePartnerAndIds(deliveryPartnerId);

  const match = {
    status: 'active',
    date: date
  };

  // STRICT ZONE FILTERING:
  // Delivery partners can ONLY see gigs for their specific assigned zone/area OR 'All Zones'.
  // Drivers from two different zones cannot see each other's area gigs!
  if (partner) {
    const partnerZoneId = partner.zoneId ? String(partner.zoneId) : null;
    const partnerZoneName = (partner.zoneName || '').trim();

    const zoneConditions = [
      { zoneName: 'All Zones' },
      { zoneName: '' },
      { zoneName: null }
    ];

    if (partnerZoneId && mongoose.Types.ObjectId.isValid(partnerZoneId)) {
      zoneConditions.push({ zoneId: new mongoose.Types.ObjectId(partnerZoneId) });
    }

    if (partnerZoneName && partnerZoneName.toLowerCase() !== 'all zones') {
      zoneConditions.push({ zoneName: { $regex: new RegExp(`^${escapeRegex(partnerZoneName)}$`, 'i') } });
    } else if (partner.city && partner.city.toLowerCase() !== 'all zones') {
      zoneConditions.push({ zoneName: { $regex: new RegExp(`^${escapeRegex(partner.city.trim())}$`, 'i') } });
    }

    match.$or = zoneConditions;
  }

  // Active gigs matching zone on or after selected date
  const gigs = await FoodGig.find(match).sort({ startDateTime: 1 }).lean();

  const gigIds = gigs.map(g => g._id);
  const partnerBookings = await FoodGigBooking.find({
    deliveryPartnerId: { $in: partnerIds },
    gigId: { $in: gigIds },
    status: { $in: ['booked', 'completed'] }
  }).lean();

  const bookedGigMap = new Map(partnerBookings.map(b => [String(b.gigId), b]));

  const result = gigs.map(gig => {
    const isBooked = bookedGigMap.has(String(gig._id));
    const remainingSlots = Math.max(0, gig.capacity - gig.bookedCount);
    const isFull = remainingSlots <= 0;
    const isExpired = new Date(gig.endDateTime) < now;

    const gigStartMs = new Date(gig.startDateTime).getTime();
    const cutoffMins = gig.cancellationCutoffMinutes || 60;
    const cutoffMs = cutoffMins * 60 * 1000;
    const canCancel = now.getTime() <= (gigStartMs - cutoffMs);

    let partnerStatus = 'available';
    if (isBooked) partnerStatus = 'booked';
    else if (isExpired) partnerStatus = 'expired';
    else if (isFull) partnerStatus = 'full';

    return {
      ...gig,
      remainingSlots,
      isBooked,
      isFull,
      isExpired,
      canCancel,
      cancellationCutoffMinutes: cutoffMins,
      partnerStatus
    };
  });

  return result;
};

export const bookGigForPartner = async (deliveryPartnerId, gigId) => {
  const { partner, partnerIds } = await resolvePartnerAndIds(deliveryPartnerId);
  if (!partner) throw new NotFoundError('Delivery partner not found');
  if (partner.status !== 'approved') {
    throw new ValidationError('Your delivery partner account is not approved yet');
  }

  const gig = await FoodGig.findById(gigId);
  if (!gig || gig.status !== 'active') {
    throw new ValidationError('This gig is no longer available');
  }

  const now = new Date();
  if (new Date(gig.endDateTime) <= now) {
    throw new ValidationError('This gig has already expired');
  }

  // Strict Zone check: Partner can only book gigs for their assigned zone or 'All Zones'
  if (gig.zoneName && gig.zoneName.toLowerCase() !== 'all zones') {
    const partnerZoneIdStr = partner.zoneId ? String(partner.zoneId) : null;
    const partnerZoneNameClean = (partner.zoneName || partner.city || '').trim().toLowerCase();
    const gigZoneIdStr = gig.zoneId ? String(gig.zoneId) : null;
    const gigZoneNameClean = (gig.zoneName || '').trim().toLowerCase();

    let isZoneMatch = false;
    if (gigZoneIdStr && partnerZoneIdStr && gigZoneIdStr === partnerZoneIdStr) {
      isZoneMatch = true;
    } else if (gigZoneNameClean && partnerZoneNameClean && gigZoneNameClean === partnerZoneNameClean) {
      isZoneMatch = true;
    }

    if (!isZoneMatch) {
      throw new ValidationError(`This gig is restricted to "${gig.zoneName}". You are listed in "${partner.zoneName || partner.city || 'a different zone'}".`);
    }
  }

  // Check if already booked
  const existingBooking = await FoodGigBooking.findOne({
    gigId: gig._id,
    deliveryPartnerId: { $in: partnerIds },
    status: { $in: ['booked', 'completed'] }
  });

  if (existingBooking) {
    throw new ValidationError('You have already booked this gig');
  }

  // Capacity check
  if (gig.bookedCount >= gig.capacity) {
    throw new ValidationError('This gig is already FULL');
  }

  // Overlap Check: Find all active bookings of this partner and check for overlapping time range
  const activeBookings = await FoodGigBooking.find({
    deliveryPartnerId: { $in: partnerIds },
    status: { $in: ['booked', 'completed'] }
  }).populate('gigId').lean();

  const targetStart = new Date(gig.startDateTime).getTime();
  const targetEnd = new Date(gig.endDateTime).getTime();

  for (const booking of activeBookings) {
    if (!booking.gigId || booking.gigId.status !== 'active') continue;
    const bStart = new Date(booking.gigId.startDateTime).getTime();
    const bEnd = new Date(booking.gigId.endDateTime).getTime();

    // Overlap condition: start1 < end2 AND start2 < end1
    if (targetStart < bEnd && bStart < targetEnd) {
      throw new ValidationError(
        `Overlapping gig exists! You are already booked for ${booking.gigId.startTime} - ${booking.gigId.endTime} on ${booking.gigId.date}.`
      );
    }
  }

  // Atomically reserve slot
  const updatedGig = await FoodGig.findOneAndUpdate(
    { _id: gig._id, bookedCount: { $lt: gig.capacity } },
    { $inc: { bookedCount: 1 } },
    { new: true }
  );

  if (!updatedGig) {
    throw new ValidationError('Gig became FULL just now. Please select another slot.');
  }

  const booking = await FoodGigBooking.create({
    gigId: gig._id,
    deliveryPartnerId: partner._id,
    status: 'booked',
    bookedAt: new Date()
  });

  return {
    success: true,
    booking: booking.toObject(),
    gig: updatedGig.toObject()
  };
};

export const cancelGigBooking = async (deliveryPartnerId, gigId) => {
  const { partnerIds } = await resolvePartnerAndIds(deliveryPartnerId);
  const targetGigId = mongoose.Types.ObjectId.isValid(gigId) ? new mongoose.Types.ObjectId(gigId) : gigId;

  // Search booking by gigId OR booking._id, matching partnerId or userId
  const booking = await FoodGigBooking.findOne({
    $or: [
      { gigId: targetGigId },
      { _id: targetGigId }
    ],
    deliveryPartnerId: { $in: partnerIds },
    status: 'booked'
  });

  if (!booking) {
    throw new NotFoundError('No active booking found for this gig');
  }

  const gig = await FoodGig.findById(booking.gigId || targetGigId);
  if (!gig) {
    throw new NotFoundError('Gig not found');
  }

  const now = Date.now();
  const gigStartMs = new Date(gig.startDateTime).getTime();
  const cutoffMs = (gig.cancellationCutoffMinutes || 60) * 60 * 1000;

  if (now > gigStartMs - cutoffMs) {
    const cutoffMins = gig.cancellationCutoffMinutes || 60;
    throw new ValidationError(
      `Cancellation is not allowed within ${cutoffMins} minutes before gig start time`
    );
  }

  booking.status = 'cancelled';
  booking.cancelledAt = new Date();
  await booking.save();

  await FoodGig.findByIdAndUpdate(gig.id || gig._id, {
    $inc: { bookedCount: -1 }
  });

  return { success: true, message: 'Gig booking cancelled successfully' };
};

export const getActiveGigForPartner = async (deliveryPartnerId) => {
  const now = new Date();
  const nowMs = now.getTime();
  const todayStr = now.toISOString().slice(0, 10);
  const { partnerIds } = await resolvePartnerAndIds(deliveryPartnerId);

  // Find booking for a gig where current time falls within gig window (starts within 30 mins or currently running + 30 mins grace period)
  const bookings = await FoodGigBooking.find({
    deliveryPartnerId: { $in: partnerIds },
    status: { $in: ['booked', 'completed'] }
  }).populate('gigId').lean();

  const THIRTY_MIN_BEFORE_MS = 30 * 60 * 1000; // Allow logging in online 30 minutes before gig start time
  const THIRTY_MIN_AFTER_MS = 30 * 60 * 1000;  // 30 minute grace period after gig end time to complete work & wrap up

  const activeBooking = bookings.find(b => {
    if (!b.gigId || b.gigId.status !== 'active') return false;
    // CRITICAL: Only count gigs scheduled for TODAY — daily re-booking is mandatory
    if (b.gigId.date && b.gigId.date !== todayStr) return false;
    const startMs = new Date(b.gigId.startDateTime).getTime();
    const endMs = new Date(b.gigId.endDateTime).getTime();

    // Rider can log in starting 30 minutes before gig start time up until 30 minutes after gig end time
    const isInTimeWindow = (nowMs >= startMs - THIRTY_MIN_BEFORE_MS) && (nowMs <= endMs + THIRTY_MIN_AFTER_MS);
    return isInTimeWindow;
  });

  if (activeBooking) return activeBooking.gigId;

  // Fallback: If partner has an active ongoing order right now, consider their shift active
  try {
    const { FoodOrder } = await import('../../orders/models/order.model.js');
    const activeOrder = await FoodOrder.findOne({
      'dispatch.deliveryPartnerId': { $in: partnerIds },
      orderStatus: { $in: ['confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop'] }
    }).select('_id').lean();

    if (activeOrder) {
      const latestTodayBooking = bookings.find(b => b.gigId && b.gigId.date === todayStr);
      return latestTodayBooking ? latestTodayBooking.gigId : { title: 'Active Delivery Shift', _id: 'active_order_shift', status: 'active' };
    }
  } catch (err) {
    // quiet fallback
  }

  return null;
};

export const getUpcomingGigLoginDetails = async (deliveryPartnerId) => {
  const now = new Date();
  const nowMs = now.getTime();
  const todayStr = now.toISOString().slice(0, 10);
  const { partnerIds } = await resolvePartnerAndIds(deliveryPartnerId);

  const bookings = await FoodGigBooking.find({
    deliveryPartnerId: { $in: partnerIds },
    status: 'booked'
  }).populate('gigId').lean();

  for (const b of bookings) {
    if (!b.gigId || b.gigId.status !== 'active') continue;
    // Only show upcoming gigs for TODAY — tomorrow's gig is irrelevant, partner must re-book daily
    if (b.gigId.date && b.gigId.date !== todayStr) continue;
    const startMs = new Date(b.gigId.startDateTime).getTime();
    const endMs = new Date(b.gigId.endDateTime).getTime();

    // If gig is starting in the future (more than 30 minutes from now)
    if (nowMs < startMs - (30 * 60 * 1000) && nowMs < endMs) {
      const minutesUntilStart = Math.ceil((startMs - nowMs) / (60 * 1000));
      const minutesUntilAllowed = Math.ceil((startMs - (30 * 60 * 1000) - nowMs) / (60 * 1000));
      return {
        gig: b.gigId,
        startTime: b.gigId.startTime || 'scheduled time',
        minutesUntilStart,
        minutesUntilAllowed,
        allowedTimeMs: startMs - (30 * 60 * 1000)
      };
    }
  }
  return null;
};

export const getGigAttendanceStats = async () => {
  const statsAgg = await FoodGigBooking.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const map = new Map(statsAgg.map(s => [s._id, s.count]));
  const booked = map.get('booked') || 0;
  const completed = map.get('completed') || 0;
  const cancelled = map.get('cancelled') || 0;
  const noShow = map.get('no_show') || 0;

  const totalCompletedOrNoShow = completed + noShow;
  const attendanceRate = totalCompletedOrNoShow > 0 ? ((completed / totalCompletedOrNoShow) * 100).toFixed(1) : 100;

  return {
    totalBookings: booked + completed + cancelled + noShow,
    booked,
    completed,
    cancelled,
    noShow,
    attendanceRate: `${attendanceRate}%`
  };
};

export const processNoShows = async () => {
  const now = new Date();

  // Find expired bookings that are still marked as 'booked'
  const expiredBookings = await FoodGigBooking.find({
    status: 'booked'
  }).populate('gigId');

  let updatedCount = 0;
  for (const b of expiredBookings) {
    if (b.gigId && new Date(b.gigId.endDateTime) < now) {
      b.status = 'no_show';
      await b.save();
      updatedCount++;
    }
  }

  return { processed: updatedCount };
};

export const checkAndAutoOfflineExpiredGigs = async () => {
  const now = new Date();
  const nowMs = now.getTime();
  const THIRTY_MIN_GRACE_MS = 30 * 60 * 1000;
  const GPS_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes — if no GPS update in 10 mins, consider GPS inactive

  // Find all online delivery partners
  const onlinePartners = await FoodDeliveryPartner.find({
    availabilityStatus: 'online',
  })
    .select('_id name lastLat lastLng lastLocationAt')
    .lean();

  if (!onlinePartners.length) return { processed: 0 };

  let processedCount = 0;

  for (const partner of onlinePartners) {
    const partnerIds = [partner._id, partner._id.toString()];

    // Check 1: Does this partner have an active gig booking right now?
    const bookings = await FoodGigBooking.find({
      deliveryPartnerId: { $in: partnerIds },
      status: { $in: ['booked', 'completed'] }
    }).populate('gigId').lean();

    const hasActiveGig = bookings.some(b => {
      if (!b.gigId || b.gigId.status !== 'active') return false;
      // CRITICAL: Only count gigs for TODAY — each day requires a fresh booking
      if (b.gigId.date && b.gigId.date !== now.toISOString().slice(0, 10)) return false;
      const startMs = new Date(b.gigId.startDateTime).getTime();
      const endMs = new Date(b.gigId.endDateTime).getTime();
      return (nowMs >= startMs - THIRTY_MIN_GRACE_MS) && (nowMs <= endMs + THIRTY_MIN_GRACE_MS);
    });

    if (hasActiveGig) {
      // Check 2: GPS still active? If location is stale > 10 minutes, auto-offline
      const lastLocationAt = partner.lastLocationAt ? new Date(partner.lastLocationAt).getTime() : 0;
      const hasValidGps = partner.lastLat != null && partner.lastLng != null;
      const isGpsStale = !hasValidGps || (nowMs - lastLocationAt > GPS_STALE_THRESHOLD_MS);

      if (isGpsStale) {
        // GPS is stale but gig is active — skip auto-offline for now (gig is still valid)
        // The GPS check on dispatch will handle filtering them out anyway
        continue;
      }
      continue; // Active gig + GPS active = keep online
    }

    // No active gig — check if partner has an active order in progress
    try {
      const { FoodOrder } = await import('../../orders/models/order.model.js');
      const activeOrder = await FoodOrder.findOne({
        'dispatch.deliveryPartnerId': { $in: partnerIds },
        orderStatus: { $in: ['confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop'] }
      }).select('_id').lean();

      if (activeOrder) continue; // Has active order, keep online until delivery completes
    } catch (err) {
      logger.warn(`[AutoOffline] Error checking active orders for partner ${partner._id}: ${err.message}`);
      continue;
    }

    // No active gig AND no active order — auto-offline this partner
    try {
      await FoodDeliveryPartner.updateOne(
        { _id: partner._id },
        { $set: { availabilityStatus: 'offline' } }
      );
      processedCount++;

      logger.info(`[AutoOffline] Partner ${partner.name || partner._id} auto-offlined (gig expired, no active orders).`);

      // Notify partner via socket
      try {
        const io = getIO();
        if (io) {
          io.to(rooms.delivery(partner._id)).emit('availability_status_changed', {
            availabilityStatus: 'offline',
            reason: 'gig_expired',
            message: 'Aapki shift khatam ho gayi hai. Dubara online aane ke liye nayi gig book karein.'
          });
        }
      } catch (socketErr) {
        // ignore socket errors
      }

      // Push notification
      try {
        await notifyOwnerSafely(
          { ownerType: 'DELIVERY_PARTNER', ownerId: partner._id },
          {
            title: 'Shift Ended — You are now Offline ⏰',
            body: 'Your gig shift has ended. To go online again, please book a new gig slot.',
            data: { type: 'auto_offline', reason: 'gig_expired' }
          }
        );
      } catch (pushErr) {
        // ignore push errors
      }
    } catch (updateErr) {
      logger.warn(`[AutoOffline] Failed to auto-offline partner ${partner._id}: ${updateErr.message}`);
    }
  }

  return { processed: processedCount };
};

export const listGigBookingsForAdmin = async (query = {}) => {
  const { date, gigId, zoneId, status = 'all', page = 1, limit = 200 } = query;
  const now = new Date();

  const match = {};
  if (gigId && mongoose.Types.ObjectId.isValid(gigId)) {
    match.gigId = new mongoose.Types.ObjectId(gigId);
  }

  const bookings = await FoodGigBooking.find(match)
    .populate({
      path: 'gigId',
      select: 'title date startTime endTime startDateTime endDateTime zoneName zoneId capacity status'
    })
    .populate({
      path: 'deliveryPartnerId',
      select: 'name phone email profilePhoto onlineSelfie availabilityStatus zoneName city address lastLat lastLng updatedAt'
    })
    .sort({ bookedAt: -1 })
    .lean();

  let filtered = bookings.filter(b => b.gigId && b.deliveryPartnerId);

  // Date filter
  if (date) {
    filtered = filtered.filter(b => b.gigId.date === date);
  }

  // Zone filter
  if (zoneId) {
    filtered = filtered.filter(b =>
      String(b.gigId.zoneId || '') === String(zoneId) ||
      String(b.gigId.zoneName || '').toLowerCase().includes(String(zoneId).toLowerCase())
    );
  }

  const enriched = filtered.map(b => {
    const gig = b.gigId;
    const partner = b.deliveryPartnerId;
    const isOnline = partner.availabilityStatus === 'online';

    let workStatus = 'Booked';
    if (b.status === 'completed') {
      workStatus = 'Completed';
    } else if (b.status === 'cancelled') {
      workStatus = 'Cancelled';
    } else if (b.status === 'no_show') {
      workStatus = 'No-show';
    } else if (isOnline) {
      workStatus = 'Working / Online';
    } else {
      workStatus = 'Booked but Offline';
    }

    return {
      _id: b._id,
      bookingId: b._id,
      gigId: gig._id,
      gigTitle: gig.title,
      gigDate: gig.date,
      gigTime: `${gig.startTime} - ${gig.endTime}`,
      zoneName: gig.zoneName || partner.zoneName || partner.city || 'All Zones',
      bookedAt: b.bookedAt || b.createdAt,
      partnerId: partner._id,
      partnerName: partner.name,
      partnerPhone: partner.phone,
      partnerEmail: partner.email || '',
      profilePhoto: partner.profilePhoto || partner.onlineSelfie?.imageUrl || '',
      availabilityStatus: partner.availabilityStatus || 'offline',
      bookingStatus: b.status,
      workStatus,
      isOnline,
      lastLat: partner.lastLat ?? null,
      lastLng: partner.lastLng ?? null,
      lastActiveAt: partner.updatedAt
    };
  });

  // Ensure all currently online delivery partners appear in admin view even if they didn't book an explicit gig slot
  const onlinePartners = await FoodDeliveryPartner.find({
    availabilityStatus: 'online',
    status: { $in: ['approved', 'pending'] }
  })
    .select('_id name phone email profilePhoto onlineSelfie availabilityStatus zoneName city address lastLat lastLng updatedAt')
    .lean();

  const partnerIdsInEnriched = new Set(enriched.map(e => String(e.partnerId)));

  for (const p of onlinePartners) {
    if (!partnerIdsInEnriched.has(String(p._id))) {
      enriched.unshift({
        _id: `online-${p._id}`,
        bookingId: `online-${p._id}`,
        gigId: p._id,
        gigTitle: 'Online Shift',
        gigDate: date || new Date().toISOString().slice(0, 10),
        gigTime: 'Active Now',
        zoneName: p.zoneName || p.city || 'All Zones',
        bookedAt: p.updatedAt || new Date(),
        partnerId: p._id,
        partnerName: p.name || 'Delivery Partner',
        partnerPhone: p.phone || '',
        partnerEmail: p.email || '',
        profilePhoto: p.profilePhoto || p.onlineSelfie?.imageUrl || '',
        availabilityStatus: 'online',
        bookingStatus: 'booked',
        workStatus: 'Working / Online',
        isOnline: true,
        lastLat: p.lastLat ?? null,
        lastLng: p.lastLng ?? null,
        lastActiveAt: p.updatedAt
      });
      partnerIdsInEnriched.add(String(p._id));
    } else {
      const existing = enriched.find(e => String(e.partnerId) === String(p._id));
      if (existing) {
        existing.availabilityStatus = 'online';
        existing.workStatus = 'Working / Online';
        existing.isOnline = true;
        if (p.lastLat != null) existing.lastLat = p.lastLat;
        if (p.lastLng != null) existing.lastLng = p.lastLng;
      }
    }
  }

  // Calculate summary counts
  const totalBooked = enriched.length;
  const currentlyWorking = enriched.filter(b => b.workStatus === 'Working / Online').length;
  const bookedButOffline = enriched.filter(b => b.workStatus === 'Booked but Offline').length;
  const completedCount = enriched.filter(b => b.workStatus === 'Completed').length;
  const noShowCount = enriched.filter(b => b.workStatus === 'No-show').length;

  // Filter by status tab
  let finalBookings = enriched;
  if (status === 'working' || status === 'online') {
    finalBookings = enriched.filter(b => b.workStatus === 'Working / Online');
  } else if (status === 'offline') {
    finalBookings = enriched.filter(b => b.workStatus === 'Booked but Offline');
  } else if (status === 'no_show') {
    finalBookings = enriched.filter(b => b.workStatus === 'No-show');
  } else if (status === 'completed') {
    finalBookings = enriched.filter(b => b.workStatus === 'Completed');
  } else if (status === 'cancelled') {
    finalBookings = enriched.filter(b => b.workStatus === 'Cancelled');
  }

  const skip = (Math.max(1, Number(page)) - 1) * Math.min(200, Number(limit));
  const paginated = finalBookings.slice(skip, skip + Number(limit));

  return {
    bookings: paginated,
    summary: {
      totalBooked,
      currentlyWorking,
      bookedButOffline,
      completedCount,
      noShowCount
    },
    pagination: {
      total: finalBookings.length,
      page: Number(page),
      limit: Number(limit)
    }
  };
};

export const remindGigBookingForAdmin = async (bookingId, payload = {}) => {
  const { partnerId: bodyPartnerId, customMessage } = payload || {};
  let booking = null;
  let partner = null;

  if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) {
    booking = await FoodGigBooking.findById(bookingId)
      .populate({
        path: 'gigId',
        select: 'title date startTime endTime'
      })
      .populate({
        path: 'deliveryPartnerId',
        select: 'name phone email fcmTokens fcmTokenMobile fcmTokenWeb'
      });
  }

  if (booking) {
    partner = booking.deliveryPartnerId;
  } else if (bodyPartnerId && mongoose.Types.ObjectId.isValid(bodyPartnerId)) {
    partner = await FoodDeliveryPartner.findById(bodyPartnerId).select('name phone email fcmTokens fcmTokenMobile fcmTokenWeb');
  }

  if (!partner) {
    throw new NotFoundError('Delivery partner or booking record not found');
  }

  const gig = booking?.gigId;
  const targetPartnerId = partner._id;
  const partnerName = partner.name || 'Delivery Partner';
  const gigTitle = gig?.title || 'Shift';
  const gigTime = gig?.startTime && gig?.endTime ? `${gig.startTime} - ${gig.endTime}` : '';

  const notifTitle = `🔔 Shift Reminder: ${gigTitle}`;
  const notifBody = customMessage?.trim() || `Hi ${partnerName}, reminder for your booked gig shift (${gigTime || 'today'}). Please log in and go online!`;

  // 1. FCM Push Notification
  try {
    await notifyOwnerSafely(
      { ownerType: 'DELIVERY_PARTNER', ownerId: String(targetPartnerId) },
      {
        title: notifTitle,
        body: notifBody,
        data: {
          type: 'gig_reminder',
          bookingId: String(bookingId || ''),
          link: '/food/delivery',
          targetUrl: '/food/delivery'
        }
      }
    );
  } catch (pushErr) {
    logger.warn(`FCM push for gig reminder failed: ${pushErr?.message || pushErr}`);
  }

  // 2. Realtime Socket Notification
  try {
    const io = getIO();
    if (io) {
      const deliveryRoom = `delivery:${targetPartnerId}`;
      io.to(deliveryRoom).emit('admin_notification', {
        title: notifTitle,
        message: notifBody,
        type: 'gig_reminder',
        timestamp: new Date().toISOString()
      });
    }
  } catch (socketErr) {
    logger.warn(`Socket notification for gig reminder failed: ${socketErr?.message || socketErr}`);
  }

  return {
    success: true,
    message: `Reminder notification sent successfully to ${partnerName}`,
    partnerName,
    partnerId: targetPartnerId
  };
};
