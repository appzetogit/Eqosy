import mongoose from 'mongoose';
import { FoodGig } from '../models/foodGig.model.js';
import { FoodGigBooking } from '../models/foodGigBooking.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { logger } from '../../../../utils/logger.js';

const parseDateTime = (dateStr, timeStr) => {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0);
};

export const createGig = async (payload, adminId = null) => {
  const { title, date, startTime, endTime, zoneId, zoneName, capacity, cancellationCutoffMinutes } = payload;

  if (!date || !startTime || !endTime) {
    throw new ValidationError('Date, start time, and end time are required');
  }

  const startDateTime = parseDateTime(date, startTime);
  const endDateTime = parseDateTime(date, endTime);

  if (endDateTime <= startDateTime) {
    throw new ValidationError('End time must be after start time');
  }

  const gig = await FoodGig.create({
    title: title?.trim() || 'Delivery Shift',
    date,
    startTime,
    endTime,
    startDateTime,
    endDateTime,
    zoneId: zoneId && mongoose.Types.ObjectId.isValid(zoneId) ? zoneId : null,
    zoneName: zoneName?.trim() || 'All Zones',
    capacity: Math.max(1, Number(capacity) || 20),
    cancellationCutoffMinutes: Math.max(0, Number(cancellationCutoffMinutes) ?? 60),
    status: 'active',
    createdByAdmin: adminId
  });

  return gig.toObject();
};

export const updateGig = async (gigId, payload) => {
  const gig = await FoodGig.findById(gigId);
  if (!gig) {
    throw new NotFoundError('Gig not found');
  }

  const { title, date, startTime, endTime, zoneId, zoneName, capacity, cancellationCutoffMinutes, status } = payload;

  if (title !== undefined) gig.title = title.trim();
  if (capacity !== undefined) gig.capacity = Math.max(gig.bookedCount, Number(capacity) || 1);
  if (cancellationCutoffMinutes !== undefined) gig.cancellationCutoffMinutes = Math.max(0, Number(cancellationCutoffMinutes) || 0);
  if (status !== undefined && ['active', 'inactive', 'cancelled'].includes(status)) gig.status = status;
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

export const listAvailableGigsForPartner = async (deliveryPartnerId, query = {}) => {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const { date = todayStr } = query;

  // Active gigs on or after selected date
  const gigs = await FoodGig.find({
    status: 'active',
    date: { $gte: date }
  }).sort({ startDateTime: 1 }).lean();

  const gigIds = gigs.map(g => g._id);
  const partnerBookings = await FoodGigBooking.find({
    deliveryPartnerId: new mongoose.Types.ObjectId(deliveryPartnerId),
    gigId: { $in: gigIds },
    status: { $in: ['booked', 'completed'] }
  }).lean();

  const bookedGigMap = new Map(partnerBookings.map(b => [String(b.gigId), b]));

  const result = gigs.map(gig => {
    const isBooked = bookedGigMap.has(String(gig._id));
    const remainingSlots = Math.max(0, gig.capacity - gig.bookedCount);
    const isFull = remainingSlots <= 0;
    const isExpired = new Date(gig.endDateTime) < now;

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
      partnerStatus
    };
  });

  return result;
};

export const bookGigForPartner = async (deliveryPartnerId, gigId) => {
  const partner = await FoodDeliveryPartner.findById(deliveryPartnerId);
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

  // Check if already booked
  const existingBooking = await FoodGigBooking.findOne({
    gigId: gig._id,
    deliveryPartnerId: partner._id,
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
    deliveryPartnerId: partner._id,
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
  const booking = await FoodGigBooking.findOne({
    gigId: new mongoose.Types.ObjectId(gigId),
    deliveryPartnerId: new mongoose.Types.ObjectId(deliveryPartnerId),
    status: 'booked'
  });

  if (!booking) {
    throw new NotFoundError('No active booking found for this gig');
  }

  const gig = await FoodGig.findById(gigId);
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

  await FoodGig.findByIdAndUpdate(gigId, {
    $inc: { bookedCount: -1 }
  });

  return { success: true, message: 'Gig booking cancelled successfully' };
};

export const getActiveGigForPartner = async (deliveryPartnerId) => {
  const now = new Date();
  const nowMs = now.getTime();

  // Find booking for a gig where current time falls within gig window (starts within 30 mins or currently running)
  const bookings = await FoodGigBooking.find({
    deliveryPartnerId: new mongoose.Types.ObjectId(deliveryPartnerId),
    status: { $in: ['booked', 'completed'] }
  }).populate('gigId').lean();

  const THIRTY_MIN_BEFORE_MS = 30 * 60 * 1000; // Allow logging in online 30 minutes before gig start time

  const activeBooking = bookings.find(b => {
    if (!b.gigId || b.gigId.status !== 'active') return false;
    const startMs = new Date(b.gigId.startDateTime).getTime();
    const endMs = new Date(b.gigId.endDateTime).getTime();

    // Rider can log in starting 30 minutes before gig start time up until gig end time
    const isInTimeWindow = (nowMs >= startMs - THIRTY_MIN_BEFORE_MS) && (nowMs <= endMs);
    return isInTimeWindow;
  });

  return activeBooking ? activeBooking.gigId : null;
};

export const getUpcomingGigLoginDetails = async (deliveryPartnerId) => {
  const now = new Date();
  const nowMs = now.getTime();

  const bookings = await FoodGigBooking.find({
    deliveryPartnerId: new mongoose.Types.ObjectId(deliveryPartnerId),
    status: 'booked'
  }).populate('gigId').lean();

  for (const b of bookings) {
    if (!b.gigId || b.gigId.status !== 'active') continue;
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
  try {
    const onlinePartners = await FoodDeliveryPartner.find({
      availabilityStatus: 'online'
    }).select('_id name availabilityStatus');

    if (!onlinePartners || !onlinePartners.length) return { processed: 0 };

    let offlinedCount = 0;
    for (const partner of onlinePartners) {
      const activeGig = await getActiveGigForPartner(partner._id);
      if (!activeGig) {
        partner.availabilityStatus = 'offline';
        await partner.save();
        offlinedCount++;

        logger.info(
          `[Gig Auto-Offline] Partner ${partner.name} (${partner._id}) set offline automatically because active gig ended with no next gig.`
        );

        const io = getIO();
        if (io) {
          io.to(rooms.delivery(partner._id)).emit('gig:auto_offline', {
            reason: 'GIG_ENDED',
            message: 'Your shift has ended and you have no upcoming active gig. You are now offline.'
          });
          io.to(rooms.delivery(partner._id)).emit('delivery:status_changed', {
            availabilityStatus: 'offline'
          });
        }
      }
    }
    return { processed: offlinedCount };
  } catch (error) {
    logger.error(`[Gig Auto-Offline Error] ${error.message}`);
    return { processed: 0, error: error.message };
  }
};
