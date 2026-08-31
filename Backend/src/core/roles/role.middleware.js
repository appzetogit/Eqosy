import { sendError } from '../../utils/response.js';

export const requireRoles = (...allowedRoles) => {
    return (req, res, next) => {
        const rawRole = req.user?.role || req.user?.userType || req.user?.type;
        if (!req.user || !rawRole) {
            return sendError(res, 401, 'Not authenticated');
        }

        const userRole = String(rawRole).toUpperCase();
        const allowedSet = new Set(allowedRoles.map((r) => String(r).toUpperCase()));

        const isDeliveryUser = ['DELIVERY_PARTNER', 'DELIVERY', 'DRIVER', 'PARTNER', 'RIDER'].includes(userRole);
        const allowsDelivery = Array.from(allowedSet).some((r) => ['DELIVERY_PARTNER', 'DELIVERY', 'DRIVER', 'PARTNER', 'RIDER'].includes(r));

        if (!allowedSet.has(userRole) && !(isDeliveryUser && allowsDelivery)) {
            return sendError(res, 403, 'Forbidden: insufficient permissions');
        }

        next();
    };
};

