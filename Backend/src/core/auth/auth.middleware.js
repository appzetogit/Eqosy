import { verifyAccessToken } from './token.util.js';
import { sendError } from '../../utils/response.js';
import { FoodUser } from '../users/user.model.js';
import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../../modules/food/delivery/models/deliveryPartner.model.js';

export const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return sendError(res, 403, 'Admin access required');
    }
    next();
};

export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
        return sendError(res, 401, 'Authentication token missing');
    }

    try {
        const decoded = verifyAccessToken(token);
        const userId = decoded.userId || decoded.id || decoded._id || decoded.sub || decoded.partnerId || '';
        const rawRole = decoded.role || decoded.userType || decoded.type || (decoded.partnerId || decoded.vehicleNumber || decoded.driverId ? 'DELIVERY_PARTNER' : 'USER');
        const role = String(rawRole).toUpperCase();

        req.user = {
            ...decoded,
            userId,
            id: userId,
            role
        };

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendError(res, 401, 'Invalid user token');
        }

        if (role === 'USER') {
            // Enforce active status in real-time - deactivated users are logged out on next request.
            FoodUser.findById(userId).select('isActive').lean().then((doc) => {
                if (res.headersSent) return;
                if (!doc || doc.isActive === false) {
                    return sendError(res, 401, doc ? 'User account is deactivated' : 'User account not found');
                }
                next();
            }).catch(() => {
                if (!res.headersSent) {
                    sendError(res, 401, 'Invalid user token');
                }
            });
            return;
        }
        if (role === 'DELIVERY_PARTNER') {
            // Real-time account status: a terminated partner is logged out on the very next request.
            FoodDeliveryPartner.findOne({ $or: [{ _id: userId }, { userId }] }).select('status terminationReason').lean().then((doc) => {
                if (res.headersSent) return;
                if (doc?.status === 'terminated') {
                    return res.status(401).json({
                        success: false,
                        code: 'ACCOUNT_TERMINATED',
                        message: `Your account has been terminated.${doc.terminationReason ? ` Reason: ${doc.terminationReason}` : ''}`,
                    });
                }
                next();
            }).catch(() => { if (!res.headersSent) next(); });
            return;
        }
        return next();
    } catch (error) {
        return sendError(res, 401, 'Invalid or expired token');
    }
};
