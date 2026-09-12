import { config } from '../../../../config/env.js';

const sanitize = (value) => (value ? String(value).trim().replace(/^['"]|['"]$/g, '') : '');

/**
 * Public environment variables for frontend runtime.
 * IMPORTANT: Only expose non-secret keys safe for clients.
 */
export const getPublicEnvController = async (_req, res, next) => {
    try {
        const googleMapsKey =
            sanitize(process.env.VITE_GOOGLE_MAPS_API_KEY) ||
            sanitize(process.env.GOOGLE_MAPS_API_KEY);

        let saProjectId = '';
        let saSenderId = '';
        try {
            const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT;
            if (rawSa) {
                const parsedSa = typeof rawSa === 'string' ? JSON.parse(rawSa) : rawSa;
                saProjectId = sanitize(parsedSa.project_id);
                saSenderId = sanitize(parsedSa.client_id);
            }
        } catch {
            // ignore
        }

        const projectId = sanitize(process.env.VITE_FIREBASE_PROJECT_ID) || saProjectId || '';
        const messagingSenderId = sanitize(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || saSenderId || '';
        const apiKey = sanitize(process.env.VITE_FIREBASE_API_KEY) || '';
        const authDomain = sanitize(process.env.VITE_FIREBASE_AUTH_DOMAIN) || (projectId ? `${projectId}.firebaseapp.com` : '');
        const appId = sanitize(process.env.VITE_FIREBASE_APP_ID) || '';
        const vapidKey = sanitize(process.env.VITE_FIREBASE_VAPID_KEY) || '';

        return res.status(200).json({
            success: true,
            message: 'Public environment variables fetched',
            data: {
                VITE_GOOGLE_MAPS_API_KEY: googleMapsKey || '',
                VITE_FIREBASE_API_KEY: apiKey,
                VITE_FIREBASE_AUTH_DOMAIN: authDomain,
                VITE_FIREBASE_PROJECT_ID: projectId,
                VITE_FIREBASE_STORAGE_BUCKET: sanitize(process.env.VITE_FIREBASE_STORAGE_BUCKET) || (projectId ? `${projectId}.appspot.com` : ''),
                VITE_FIREBASE_MESSAGING_SENDER_ID: messagingSenderId,
                VITE_FIREBASE_APP_ID: appId,
                VITE_FIREBASE_MEASUREMENT_ID: sanitize(process.env.VITE_FIREBASE_MEASUREMENT_ID) || '',
                VITE_FIREBASE_VAPID_KEY: vapidKey,
                FIREBASE_API_KEY: apiKey,
                FIREBASE_AUTH_DOMAIN: authDomain,
                FIREBASE_PROJECT_ID: projectId,
                FIREBASE_STORAGE_BUCKET: sanitize(process.env.VITE_FIREBASE_STORAGE_BUCKET) || (projectId ? `${projectId}.appspot.com` : ''),
                FIREBASE_MESSAGING_SENDER_ID: messagingSenderId,
                FIREBASE_APP_ID: appId,
                FIREBASE_MEASUREMENT_ID: sanitize(process.env.VITE_FIREBASE_MEASUREMENT_ID) || '',
                FIREBASE_VAPID_KEY: vapidKey,
                NODE_ENV: config.nodeEnv || 'development'
            }
        });
    } catch (error) {
        next(error);
    }
};

