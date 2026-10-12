import {
    listGroceryBanners,
    createGroceryBannersFromFiles,
    deleteGroceryBanner,
    updateGroceryBannerOrder,
    toggleGroceryBannerStatus
} from '../services/groceryBanner.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';

export const listGroceryBannersController = async (req, res, next) => {
    try {
        const data = await listGroceryBanners();
        return sendResponse(res, 200, 'Grocery banners fetched successfully', { banners: data });
    } catch (error) {
        next(error);
    }
};

export const uploadGroceryBannersController = async (req, res, next) => {
    try {
        const fileList = Array.isArray(req.files)
            ? req.files
            : req.files
            ? Object.values(req.files).flat()
            : [];

        if (!fileList || !fileList.length) {
            throw new ValidationError('No files uploaded');
        }

        const meta = {
            title: req.body.title,
            ctaText: req.body.ctaText,
            ctaLink: req.body.ctaLink,
        };

        const results = await createGroceryBannersFromFiles(fileList, meta);
        const uploadedBanners = results.filter(r => r.success).map(r => r.banner);
        return sendResponse(res, 201, 'Grocery banners uploaded', { banners: uploadedBanners, results });
    } catch (error) {
        next(error);
    }
};

export const deleteGroceryBannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const result = await deleteGroceryBanner(id);
        return sendResponse(res, 200, result.deleted ? 'Grocery banner deleted' : 'Grocery banner not found', result);
    } catch (error) {
        next(error);
    }
};

export const updateGroceryBannerOrderController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { order } = req.body;
        const sortOrder = Number(order);
        if (!id || Number.isNaN(sortOrder)) {
            throw new ValidationError('id and numeric order are required');
        }
        const updated = await updateGroceryBannerOrder(id, sortOrder);
        return sendResponse(res, 200, 'Grocery banner order updated', updated);
    } catch (error) {
        next(error);
    }
};

export const toggleGroceryBannerStatusController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const banners = await listGroceryBanners();
        const banner = banners.find(b => b._id.toString() === id);
        if (!banner) {
            throw new ValidationError('Grocery banner not found');
        }
        const updated = await toggleGroceryBannerStatus(id, !banner.isActive);
        return sendResponse(res, 200, 'Grocery banner status updated', updated);
    } catch (error) {
        next(error);
    }
};

