import * as diningService from '../services/dining.service.js';
import * as bookingService from '../services/diningBooking.service.js';

export async function getPublicDiningCategories(req, res, next) {
    try {
        const categories = await diningService.listDiningCategoriesPublic();
        res.status(200).json({ success: true, message: 'Dining categories fetched successfully', data: categories });
    } catch (error) {
        next(error);
    }
}

export async function getPublicDiningRestaurants(req, res, next) {
    try {
        const restaurants = await diningService.listDiningRestaurantsPublic(req.query || {});
        res.status(200).json({ success: true, message: 'Dining restaurants fetched successfully', data: restaurants });
    } catch (error) {
        next(error);
    }
}

export async function getPublicDiningRestaurantReviews(req, res, next) {
    try {
        const data = await bookingService.getDiningRestaurantReviews(req.params.id, { limit: req.query?.limit });
        res.status(200).json({ success: true, message: 'Dining reviews fetched successfully', data });
    } catch (error) {
        next(error);
    }
}
