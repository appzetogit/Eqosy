import { v2 as cloudinary } from 'cloudinary';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { DeliverySelfieLog } from '../models/deliverySelfieLog.model.js';
import { logger } from '../../../../utils/logger.js';
// Importing this module makes cloudinary.uploader.destroy() work for VPS-disk files too.
import '../../../../services/localStorage.service.js';

/**
 * Delivery-partner verification selfies are deleted automatically after SELFIE_RETENTION_DAYS (default 2):
 *   - the image file (VPS disk or Cloudinary)
 *   - the selfie log rows
 *   - the partner's "today's selfie" copy, including base64 images that were stored inside MongoDB
 * Only files under food/delivery/selfies/ are ever deleted, so KYC / profile uploads are never touched.
 */
const SELFIE_FOLDER = 'food/delivery/selfies/';
const retentionMs = () => Math.max(1, Number(process.env.SELFIE_RETENTION_DAYS) || 2) * 24 * 60 * 60 * 1000;

/** Public id of a selfie file from its stored URL, or null (data: URIs, foreign URLs, other folders). */
export function selfiePublicIdFromUrl(url) {
    const value = String(url || '').trim();
    if (!value || value.startsWith('data:')) return null;
    let id = null;

    const base = String(process.env.UPLOAD_BASE_URL || '').trim().replace(/\/+$/, '');
    if (base && value.startsWith(`${base}/`)) {
        id = value.slice(base.length + 1);
    } else {
        const m = value.match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(food\/delivery\/selfies\/[^?#]+)/);
        if (m) id = m[1].replace(/\.[a-zA-Z0-9]+$/, '');
    }
    if (!id) return null;
    try { id = decodeURIComponent(id.split('?')[0]); } catch { /* keep raw */ }
    return id.startsWith(SELFIE_FOLDER) && !id.includes('..') ? id : null;
}

/** true = nothing is left to delete (deleted, already gone, or not a file); false = try again next run. */
async function destroySelfieFile(url) {
    const publicId = selfiePublicIdFromUrl(url);
    if (!publicId) return true;
    try {
        const res = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
        return ['ok', 'not found'].includes(String(res?.result || '').toLowerCase());
    } catch (err) {
        logger.warn(`[SelfieCleanup] could not delete ${publicId}: ${err?.message}`);
        return false;
    }
}

export async function runSelfieCleanup({ batch = 200 } = {}) {
    const cutoff = new Date(Date.now() - retentionMs());
    const stats = { logsDeleted: 0, partnersCleared: 0, filesFailed: 0 };

    // 1. Selfie log rows (and their files) older than the retention window.
    const logs = await DeliverySelfieLog.find({ createdAt: { $lt: cutoff } })
        .select('_id selfieUrl deliveryPartnerId')
        .limit(batch)
        .lean();
    const deletable = [];
    for (const log of logs) {
        if (await destroySelfieFile(log.selfieUrl)) {
            deletable.push(log._id);
            // The first-ever selfie can have become the baseline profile photo: never leave a dead link behind.
            if (log.selfieUrl) {
                await FoodDeliveryPartner.updateOne(
                    { _id: log.deliveryPartnerId, profilePhoto: log.selfieUrl },
                    { $set: { profilePhoto: '' } }
                );
            }
        } else {
            stats.filesFailed += 1;
        }
    }
    if (deletable.length) {
        const res = await DeliverySelfieLog.deleteMany({ _id: { $in: deletable } });
        stats.logsDeleted = res.deletedCount || 0;
    }

    // 2. The partner's own "today's selfie" copy.
    const partners = await FoodDeliveryPartner.find({
        'onlineSelfie.imageUrl': { $exists: true, $nin: ['', null] },
        $or: [
            { 'onlineSelfie.capturedAt': { $lt: cutoff } },
            { 'onlineSelfie.capturedAt': null, 'onlineSelfie.uploadedAt': { $lt: cutoff } },
            { 'onlineSelfie.capturedAt': null, 'onlineSelfie.uploadedAt': null },
        ],
    })
        .select('_id profilePhoto onlineSelfie')
        .limit(batch)
        .lean();

    for (const p of partners) {
        const url = p.onlineSelfie?.imageUrl;
        if (!(await destroySelfieFile(url))) {
            stats.filesFailed += 1;
            continue;
        }
        const stillLocked = p.onlineSelfie?.lockedUntil && new Date(p.onlineSelfie.lockedUntil) > new Date();
        const $set = {
            'onlineSelfie.imageUrl': '',
            'onlineSelfie.capturedAt': null,
            'onlineSelfie.uploadedAt': null,
            'onlineSelfie.forDate': '',
            ...(stillLocked ? {} : { 'onlineSelfie.verifiedStatus': 'unverified' }),
        };
        // Only if it is still the same image, so a selfie taken a moment ago is never wiped.
        const res = await FoodDeliveryPartner.updateOne({ _id: p._id, 'onlineSelfie.imageUrl': url }, { $set });
        if (res.modifiedCount) stats.partnersCleared += 1;
        if (p.profilePhoto && p.profilePhoto === url) {
            await FoodDeliveryPartner.updateOne({ _id: p._id, profilePhoto: url }, { $set: { profilePhoto: '' } });
        }
    }

    if (stats.logsDeleted || stats.partnersCleared || stats.filesFailed) {
        logger.info(`[SelfieCleanup] logs deleted: ${stats.logsDeleted}, partner copies cleared: ${stats.partnersCleared}, file errors: ${stats.filesFailed}`);
    }
    return stats;
}
