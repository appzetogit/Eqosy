import mongoose from 'mongoose';
import { FoodRestaurantSupportTicket } from '../models/supportTicket.model.js';
import { sendError, sendResponse } from '../../../../utils/response.js';

const ALLOWED_CATEGORIES = ['orders', 'payments', 'menu', 'restaurant', 'technical', 'other'];
const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];
const ALLOWED_STATUSES = ['open', 'in-progress', 'resolved'];

export const createRestaurantSupportTicketController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const body = req.body || {};
        const category = String(body.category || '').trim().toLowerCase();
        const issueType = String(body.issueType || '').trim();
        const subject = String(body.subject || '').trim();
        const description = String(body.description || '').trim();
        const orderRef = String(body.orderRef || body.orderId || '').trim();
        const priority = String(body.priority || 'medium').trim().toLowerCase();

        if (!ALLOWED_CATEGORIES.includes(category)) {
            return sendError(res, 400, 'Invalid category');
        }
        if (!issueType) {
            return sendError(res, 400, 'issueType required');
        }
        if (!ALLOWED_PRIORITIES.includes(priority)) {
            return sendError(res, 400, 'Invalid priority');
        }

        const created = await FoodRestaurantSupportTicket.create({
            restaurantId: new mongoose.Types.ObjectId(restaurantId),
            category,
            issueType,
            subject,
            description,
            orderRef,
            priority
        });

        return sendResponse(res, 201, 'Support ticket created successfully', {
            ticket: created.toObject()
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Public: a restaurant that is onboarding (or wants to onboard) contacts support.
 * POST /food/restaurant/support/onboarding  (no auth: applicants have no restaurant record yet)
 */
export const createOnboardingSupportRequestController = async (req, res, next) => {
    try {
        const body = req.body || {};
        const contactName = String(body.name || '').trim().slice(0, 100);
        const contactPhone = String(body.phone || '').replace(/\D/g, '').slice(-10);
        const contactEmail = String(body.email || '').trim().slice(0, 150);
        const subject = String(body.subject || '').trim().slice(0, 150);
        const description = String(body.message || '').trim().slice(0, 2000);

        if (!contactName) return sendError(res, 400, 'Name is required');
        if (contactPhone.length !== 10) return sendError(res, 400, 'Enter a valid 10 digit phone number');
        if (!description) return sendError(res, 400, 'Please describe your problem');
        if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
            return sendError(res, 400, 'Enter a valid email address');
        }

        // Simple spam guard: max 5 open requests per phone number.
        const openCount = await FoodRestaurantSupportTicket.countDocuments({
            contactPhone,
            category: 'onboarding',
            status: { $ne: 'resolved' }
        });
        if (openCount >= 5) {
            return sendError(res, 429, 'We already have your requests. Our team will contact you soon.');
        }

        await FoodRestaurantSupportTicket.create({
            category: 'onboarding',
            issueType: String(body.issueType || 'Onboarding help').trim().slice(0, 100),
            subject: subject || 'Restaurant onboarding help',
            description,
            priority: 'high',
            contactName,
            contactPhone,
            contactEmail
        });

        return sendResponse(res, 201, 'Your request has been sent to our support team. We will contact you soon.', {});
    } catch (error) {
        next(error);
    }
};

export const listRestaurantSupportTicketsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 100);
        const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
        const skip = (page - 1) * limit;

        const filter = { restaurantId: new mongoose.Types.ObjectId(restaurantId) };
        const status = String(req.query?.status || '').trim().toLowerCase();
        if (ALLOWED_STATUSES.includes(status)) {
            filter.status = status;
        }

        const searchText = String(req.query?.search || '').trim();
        if (searchText) {
            const rx = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [
                { subject: rx },
                { issueType: rx },
                { description: rx },
                { orderRef: rx }
            ];
        }

        const [tickets, total] = await Promise.all([
            FoodRestaurantSupportTicket.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            FoodRestaurantSupportTicket.countDocuments(filter)
        ]);

        return sendResponse(res, 200, 'Support tickets fetched successfully', {
            tickets,
            total,
            page,
            limit
        });
    } catch (error) {
        next(error);
    }
};
