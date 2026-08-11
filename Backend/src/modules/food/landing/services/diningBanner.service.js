import { FoodDiningBanner } from '../models/diningBanner.model.js';
import { v2 as cloudinary } from 'cloudinary';

export const listDiningBanners = async () => {
    return FoodDiningBanner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
};

export const createDiningBannersFromFiles = async (files, meta = {}) => {
    if (!files || !files.length) {
        return [];
    }

    const results = [];

    for (const file of files) {
        try {
            let imageUrl = '';
            let publicId = `dining_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            try {
                const uploadResult = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: 'food/dining-banners', resource_type: 'image' },
                        (error, result) => {
                            if (error) return reject(error);
                            return resolve(result);
                        }
                    );
                    stream.end(file.buffer);
                });
                imageUrl = uploadResult.secure_url;
                publicId = uploadResult.public_id;
            } catch (cloudErr) {
                if (file.buffer) {
                    const mime = file.mimetype || 'image/jpeg';
                    imageUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
                } else {
                    throw cloudErr;
                }
            }

            const banner = await FoodDiningBanner.create({
                imageUrl,
                publicId,
                title: meta.title || '',
                ctaText: meta.ctaText || '',
                ctaLink: meta.ctaLink || '',
                diningType: meta.diningType || 'all',
                sortOrder: meta.sortOrder ?? 0,
                isActive: true,
            });

            results.push({ success: true, banner: banner.toObject() });
        } catch (error) {
            results.push({ success: false, error: error.message });
        }
    }

    return results;
};

export const deleteDiningBanner = async (id) => {
    const doc = await FoodDiningBanner.findById(id);
    if (!doc) {
        return { deleted: false };
    }

    if (doc.publicId) {
        try {
            await cloudinary.uploader.destroy(doc.publicId);
        } catch {
            // ignore cloudinary deletion errors
        }
    }

    await doc.deleteOne();
    return { deleted: true };
};

export const updateDiningBannerOrder = async (id, sortOrder) => {
    const updated = await FoodDiningBanner.findByIdAndUpdate(
        id,
        { sortOrder },
        { new: true }
    ).lean();
    return updated;
};

export const toggleDiningBannerStatus = async (id, isActive) => {
    const updated = await FoodDiningBanner.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
    ).lean();
    return updated;
};

