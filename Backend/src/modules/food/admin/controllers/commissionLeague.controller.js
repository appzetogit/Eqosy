import { isSuperAdminLike, normalizeObjectIdList } from '../../../../core/admin/adminHierarchy.service.js';
import * as league from '../services/commissionLeague.service.js';
import { sendError } from '../../../../utils/response.js';

const ok = (res, message, data) => res.status(200).json({ success: true, message, data });

const actorOf = (req) => ({
    adminId: req.user?.userId || req.user?.id || req.user?._id || null,
    name: req.adminContext?.name || req.adminContext?.email || req.user?.email || 'Admin'
});

const scopeOf = (req) => league.buildAdminScope(req.adminContext, isSuperAdminLike, normalizeObjectIdList);

const wrap = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (e) {
        next(e);
    }
};

/* ---------------- Admin ---------------- */

export const getLeagueSettings = wrap(async (_req, res) => {
    ok(res, 'League settings fetched', await league.getLeagueSettings({ fresh: true }));
});

export const updateLeagueSettings = wrap(async (req, res) => {
    ok(res, 'League settings updated', await league.updateLeagueSettings(req.body || {}, actorOf(req)));
});

export const listLeagueRestaurants = wrap(async (req, res) => {
    ok(res, 'Restaurants fetched', await league.listRestaurantsByLeague(req.query || {}, scopeOf(req)));
});

export const setRestaurantCommissionMode = wrap(async (req, res) => {
    ok(res, 'Commission updated', await league.setRestaurantCommissionMode(req.params.id, req.body || {}, actorOf(req)));
});

export const getRestaurantPerformance = wrap(async (req, res) => {
    ok(res, 'Performance fetched', await league.getRestaurantPerformance(req.params.id, req.query || {}));
});

export const getZoneComparison = wrap(async (req, res) => {
    ok(res, 'Zone comparison fetched', await league.getZoneComparison(req.query || {}, scopeOf(req)));
});

export const listAudit = wrap(async (req, res) => {
    ok(res, 'Audit log fetched', await league.listCommissionAudit(req.query || {}));
});

/* ---------------- Restaurant ---------------- */

export const getMyLeagueDashboard = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId) return sendError(res, 401, 'Restaurant authentication required');
        ok(res, 'Commission & performance fetched', await league.getRestaurantLeagueDashboard(restaurantId, req.query || {}));
    } catch (e) {
        next(e);
    }
};
