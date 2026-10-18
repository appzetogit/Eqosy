import mongoose from 'mongoose';
import { FoodDiningBooking } from '../models/diningBooking.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { notifyOwnersSafely } from '../../../../core/notifications/firebase.service.js';
import { logger } from '../../../../utils/logger.js';

const IST_OFFSET_MS = 330 * 60 * 1000;
const BOOKING_STATUSES = ['pending', 'confirmed', 'accepted', 'checked-in', 'completed', 'cancelled', 'rejected', 'no_show'];
const CLOSED_STATUSES = ['completed', 'cancelled', 'rejected', 'no_show'];

const toObjectId = (value, label) => {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
        throw new ValidationError(`Invalid ${label}`);
    }
    return new mongoose.Types.ObjectId(String(value));
};

const buildBookingId = () => `TB${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

/** "7:30 PM" / "19:30" -> minutes after midnight, or null if unreadable. */
const parseTimeToMinutes = (value) => {
    const raw = String(value || '').trim();
    const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
    const meridiem = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (!meridiem) return null;
    let hour = Number(meridiem[1]);
    const minute = Number(meridiem[2] || 0);
    const isPm = meridiem[3].toUpperCase() === 'PM';
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return hour * 60 + minute;
};

/** Shape returned to the apps (matches what the old local-storage bookings looked like). */
const serialize = (doc) => {
    if (!doc) return null;
    const b = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const populated = b.restaurantId && typeof b.restaurantId === 'object' && b.restaurantId.restaurantName
        ? {
            _id: b.restaurantId._id,
            id: b.restaurantId._id,
            restaurantId: b.restaurantId._id,
            name: b.restaurantId.restaurantName,
            restaurantName: b.restaurantId.restaurantName,
            slug: b.restaurantId.slug || '',
            profileImage: b.restaurantId.profileImage || null,
            coverImages: b.restaurantId.coverImages || [],
            location: b.restaurantId.location || null,
            offer: String(b.restaurantId.diningSettings?.offer || '').trim()
        }
        : null;
    return {
        ...b,
        id: String(b._id),
        restaurantId: String(b.restaurantId?._id || b.restaurantId || ''),
        userId: String(b.userId?._id || b.userId || ''),
        ...(populated ? { restaurant: populated } : {})
    };
};

const notifyRestaurant = async (restaurantId, booking, { title, body, type }) => {
    try {
        const io = getIO();
        if (io) {
            io.to(rooms.restaurant(restaurantId)).emit(
                type === 'dining_booking_cancelled' ? 'dining_booking' : 'new_dining_order',
                { type, booking }
            );
        }
        await notifyOwnersSafely([{ ownerType: 'RESTAURANT', ownerId: restaurantId }], {
            title,
            body,
            data: { type, bookingId: String(booking.bookingId), link: '/food/restaurant/dining-reservations' }
        });
    } catch (err) {
        logger.warn(`Dining booking notification failed: ${err?.message || err}`);
    }
};

export async function createDiningBooking(userId, body = {}) {
    const restaurantId = toObjectId(body.restaurantId || body.restaurant, 'restaurant');
    const uid = toObjectId(userId, 'user');

    const guests = Math.floor(Number(body.guests));
    if (!Number.isFinite(guests) || guests < 1) throw new ValidationError('Number of guests must be at least 1');
    const timeSlot = String(body.timeSlot || '').trim();
    if (!timeSlot) throw new ValidationError('Please select a time slot');

    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) throw new ValidationError('Please select a valid date');

    // Past-date / past-slot checks, evaluated in IST (the operating timezone).
    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    const bookingIst = new Date(date.getTime() + IST_OFFSET_MS);
    const todayKey = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
    const bookingKey = Date.UTC(bookingIst.getUTCFullYear(), bookingIst.getUTCMonth(), bookingIst.getUTCDate());
    if (bookingKey < todayKey) throw new ValidationError('Cannot book a table for a past date.');
    if (bookingKey === todayKey) {
        const slotMins = parseTimeToMinutes(timeSlot);
        const nowMins = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
        if (slotMins !== null && slotMins <= nowMins) {
            throw new ValidationError('Selected time slot has already passed. Please select a future time slot.');
        }
    }

    const restaurant = await FoodRestaurant.findById(restaurantId).select('restaurantName diningSettings').lean();
    if (!restaurant) throw new NotFoundError('Restaurant not found');

    const user = await FoodUser.findById(uid).select('name phone email').lean();
    if (!user) throw new NotFoundError('User not found');

    const booking = await FoodDiningBooking.create({
        bookingId: buildBookingId(),
        restaurantId,
        userId: uid,
        user: { name: user.name || '', phone: user.phone || '', email: user.email || '' },
        guests,
        date,
        timeSlot,
        specialRequest: String(body.specialRequest || '').trim(),
        status: 'confirmed'
    });

    const out = serialize(booking);
    const when = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
    void notifyRestaurant(String(restaurantId), out, {
        type: 'dining_booking',
        title: `New Table Booking #${out.bookingId}`,
        body: `${user.name || 'Guest'} reserved a table for ${guests} guest(s) on ${when} at ${timeSlot}.`
    });

    return {
        ...out,
        restaurant: {
            _id: restaurantId,
            id: restaurantId,
            restaurantId,
            name: restaurant.restaurantName,
            restaurantName: restaurant.restaurantName,
            offer: String(restaurant.diningSettings?.offer || '').trim()
        }
    };
}

export async function listUserDiningBookings(userId) {
    const docs = await FoodDiningBooking.find({ userId: toObjectId(userId, 'user') })
        .populate({ path: 'restaurantId', select: 'restaurantName slug profileImage coverImages location diningSettings' })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
    return docs.map(serialize);
}

export async function cancelUserDiningBooking(userId, bookingId) {
    const booking = await FoodDiningBooking.findOne({
        _id: toObjectId(bookingId, 'booking id'),
        userId: toObjectId(userId, 'user')
    });
    if (!booking) throw new NotFoundError('Booking not found');
    if (CLOSED_STATUSES.includes(booking.status)) {
        throw new ValidationError(`Booking is already ${booking.status}`);
    }
    booking.status = 'cancelled';
    await booking.save();

    const out = serialize(booking);
    void notifyRestaurant(String(booking.restaurantId), out, {
        type: 'dining_booking_cancelled',
        title: `Table Booking Cancelled #${out.bookingId}`,
        body: `${booking.user?.name || 'Guest'} cancelled the reservation for ${booking.guests} guest(s) at ${booking.timeSlot}.`
    });
    return out;
}

export async function reviewUserDiningBooking(userId, bookingId, body = {}) {
    const rating = Number(body.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        throw new ValidationError('Rating must be between 1 and 5');
    }
    const existing = await FoodDiningBooking.findOne({
        _id: toObjectId(bookingId, 'booking id'),
        userId: toObjectId(userId, 'user')
    }).select('status review');
    if (!existing) throw new NotFoundError('Booking not found');
    // Only a guest who actually dined (booking checked out/completed) can rate, and only once,
    // so the restaurant's dining rating is made of real visits.
    if (existing.status !== 'completed') {
        throw new ValidationError('You can rate this restaurant after your booking is completed');
    }
    if (existing.review?.rating) {
        throw new ValidationError('You have already rated this booking');
    }
    const booking = await FoodDiningBooking.findOneAndUpdate(
        { _id: existing._id, 'review.rating': { $exists: false } },
        { $set: { review: { rating: Math.round(rating), comment: String(body.comment || '').trim(), createdAt: new Date() } } },
        { new: true }
    );
    if (!booking) throw new ValidationError('You have already rated this booking');
    return serialize(booking);
}

/** Real dining rating of one restaurant: average of guest reviews + the latest written reviews. */
export async function getDiningRestaurantReviews(restaurantId, { limit = 20 } = {}) {
    const rid = toObjectId(restaurantId, 'restaurant');
    const [stats] = await FoodDiningBooking.aggregate([
        { $match: { restaurantId: rid, 'review.rating': { $gte: 1 } } },
        { $group: { _id: '$restaurantId', avg: { $avg: '$review.rating' }, count: { $sum: 1 } } }
    ]);
    const docs = await FoodDiningBooking.find({ restaurantId: rid, 'review.rating': { $gte: 1 } })
        .sort({ 'review.createdAt': -1 })
        .limit(Math.min(Math.max(Number(limit) || 20, 1), 50))
        .select('user.name review')
        .lean();

    const maskName = (name) => {
        const first = String(name || '').trim().split(/\s+/)[0];
        return first ? `${first.slice(0, 1).toUpperCase()}${first.slice(1)}` : 'Guest';
    };

    return {
        rating: stats ? Math.round(stats.avg * 10) / 10 : 0,
        reviewCount: stats?.count || 0,
        reviews: docs.map((d) => ({
            name: maskName(d.user?.name),
            rating: d.review.rating,
            comment: d.review.comment || '',
            createdAt: d.review.createdAt
        }))
    };
}

export async function listRestaurantDiningBookings(restaurantId) {
    const docs = await FoodDiningBooking.find({ restaurantId: toObjectId(restaurantId, 'restaurant') })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
    return docs.map(serialize);
}

export async function updateRestaurantDiningBookingStatus(restaurantId, bookingId, status) {
    const next = String(status || '').trim().toLowerCase();
    if (!BOOKING_STATUSES.includes(next)) throw new ValidationError('Invalid booking status');

    const booking = await FoodDiningBooking.findOne({
        _id: toObjectId(bookingId, 'booking id'),
        restaurantId: toObjectId(restaurantId, 'restaurant')
    });
    if (!booking) throw new NotFoundError('Booking not found');
    booking.status = next;
    await booking.save();

    const out = serialize(booking);
    try {
        const io = getIO();
        if (io) io.to(rooms.user(booking.userId)).emit('dining_booking_updated', { booking: out });
        if (['accepted', 'confirmed', 'rejected', 'cancelled', 'completed'].includes(next)) {
            await notifyOwnersSafely([{ ownerType: 'USER', ownerId: booking.userId }], {
                title: `Table booking ${next}`,
                body: `Your table booking #${booking.bookingId} is ${next}.`,
                data: { type: 'dining_booking_status', bookingId: String(booking.bookingId), link: '/food/user/dining/my-bookings' }
            });
        }
    } catch (err) {
        logger.warn(`Dining booking status notification failed: ${err?.message || err}`);
    }
    return out;
}
