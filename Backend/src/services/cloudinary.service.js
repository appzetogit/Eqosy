import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';
import { isLocalStorageEnabled, saveBufferLocally } from './localStorage.service.js';

cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret
});

export const uploadImageBuffer = async (buffer, folder = 'uploads') => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }

    if (isLocalStorageEnabled()) {
        return (await saveBufferLocally(buffer, folder)).secure_url;
    }

    if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
        // Fallback if Cloudinary is not configured in env
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }

    return new Promise((resolve) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error || !result?.secure_url) {
                    console.warn('[Cloudinary Service] Upload stream failed, using base64 fallback:', error?.message || error);
                    return resolve(`data:image/jpeg;base64,${buffer.toString('base64')}`);
                }
                return resolve(result.secure_url);
            }
        );

        stream.end(buffer);
    });
};

export const uploadImageBufferDetailed = async (buffer, folder = 'uploads') => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }

    if (isLocalStorageEnabled()) {
        return saveBufferLocally(buffer, folder);
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                return resolve(result);
            }
        );

        stream.end(buffer);
    });
};

