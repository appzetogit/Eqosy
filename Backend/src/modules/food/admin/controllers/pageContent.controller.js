import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import {
    getPublicPageByKey,
    getAdminPageByKey,
    upsertLegalPage,
    upsertAboutPage,
    upsertHomePage
} from '../services/pageContent.service.js';

const parseKeyFromParam = (req) => String(req.params?.key || '').trim().toLowerCase();

const VALID_LEGAL_KEYS = [
    'terms', 'restaurant-terms', 'delivery-terms', 'driver-terms', 'seller-terms',
    'privacy', 'restaurant-privacy', 'delivery-privacy', 'driver-privacy', 'seller-privacy',
    'refund', 'shipping', 'cancellation'
];

export const getPublicPageController = async (req, res, next) => {
    try {
        let key = parseKeyFromParam(req);
        const userType = String(req.query?.userType || '').trim().toLowerCase();
        if (userType && ['terms', 'privacy'].includes(key)) {
            const roleKey = `${userType}-${key}`;
            if (VALID_LEGAL_KEYS.includes(roleKey)) {
                const rolePage = await getPublicPageByKey(roleKey);
                if (rolePage?.data?.content && rolePage.data.content.trim()) {
                    key = roleKey;
                }
            }
        }
        const result = await getPublicPageByKey(key);
        return sendResponse(res, 200, 'Page fetched successfully', result.data);
    } catch (error) {
        next(error);
    }
};

export const getAdminPageController = async (req, res, next) => {
    try {
        const key = parseKeyFromParam(req);
        const result = await getAdminPageByKey(key);
        return sendResponse(res, 200, 'Page fetched successfully', result.data);
    } catch (error) {
        next(error);
    }
};

export const upsertAdminPageController = async (req, res, next) => {
    try {
        const key = parseKeyFromParam(req);
        const updatedBy = req.user?.userId || null;

        if (key === 'home') {
            const result = await upsertHomePage(req.body ?? {}, updatedBy);
            return sendResponse(res, 200, 'Page updated successfully', result.data);
        }
        if (key === 'about') {
            const result = await upsertAboutPage(req.body ?? {}, updatedBy);
            return sendResponse(res, 200, 'Page updated successfully', result.data);
        }
        if (VALID_LEGAL_KEYS.includes(key)) {
            const result = await upsertLegalPage(key, req.body ?? {}, updatedBy);
            return sendResponse(res, 200, 'Page updated successfully', result.data);
        }
        throw new ValidationError('Invalid page key');
    } catch (error) {
        next(error);
    }
};

