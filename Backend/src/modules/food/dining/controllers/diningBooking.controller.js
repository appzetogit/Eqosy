import { sendResponse } from '../../../../utils/response.js';
import * as bookingService from '../services/diningBooking.service.js';

const wrap = (handler, status = 200, message = 'OK') => async (req, res, next) => {
    try {
        const data = await handler(req);
        return sendResponse(res, status, message, data);
    } catch (error) {
        next(error);
    }
};

export const createDiningBookingController = wrap(
    (req) => bookingService.createDiningBooking(req.user?.userId, req.body || {}),
    201,
    'Booking created successfully'
);
export const listMyDiningBookingsController = wrap((req) => bookingService.listUserDiningBookings(req.user?.userId));
export const cancelMyDiningBookingController = wrap(
    (req) => bookingService.cancelUserDiningBooking(req.user?.userId, req.params.id),
    200,
    'Booking cancelled'
);
export const reviewMyDiningBookingController = wrap(
    (req) => bookingService.reviewUserDiningBooking(req.user?.userId, req.params.id, req.body || {}),
    200,
    'Review saved'
);
export const listRestaurantDiningBookingsController = wrap((req) => bookingService.listRestaurantDiningBookings(req.user?.userId));
export const updateRestaurantDiningBookingStatusController = wrap(
    (req) => bookingService.updateRestaurantDiningBookingStatus(req.user?.userId, req.params.id, req.body?.status),
    200,
    'Booking updated'
);
