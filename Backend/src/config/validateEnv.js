import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

const getServiceAccountProjectId = () => {
    try {
        const pathValue = String(config.firebaseServiceAccountPath || '').trim();
        if (pathValue) {
            const filePath = resolve(process.cwd(), pathValue);
            if (existsSync(filePath)) {
                const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
                return String(parsed?.project_id || '').trim() || null;
            }
        }
        const raw = config.firebaseServiceAccount;
        if (raw) {
            const parsed = JSON.parse(String(raw));
            return String(parsed?.project_id || '').trim() || null;
        }
    } catch {
        return null;
    }
    return null;
};

const validateFirebasePushProjectAlignment = () => {
    const webProjectId = String(config.firebaseProjectId || '').trim();
    const serviceAccountProjectId = getServiceAccountProjectId();
    if (!webProjectId || !serviceAccountProjectId) return;

    if (webProjectId !== serviceAccountProjectId) {
        logger.error(
            `[FCM] CRITICAL project mismatch: frontend/web project="${webProjectId}" but FIREBASE_SERVICE_ACCOUNT project="${serviceAccountProjectId}". Push notifications will fail with SenderId mismatch until both use the same Firebase project.`,
        );
    }
};

/**
 * Validates required environment configuration on startup.
 * Logs clear errors and exits if critical variables are missing.
 */
export const validateConfig = () => {
    const missing = [];

    if (!config.mongodbUri) {
        missing.push('MONGO_URI or MONGODB_URI');
    }
    if (!config.jwtAccessSecret) {
        missing.push('JWT_ACCESS_SECRET or JWT_SECRET');
    }
    if (!config.jwtRefreshSecret) {
        missing.push('JWT_REFRESH_SECRET');
    }
    if (config.redisEnabled && !config.redisUrl) {
        missing.push('REDIS_URL (required when REDIS_ENABLED=true)');
    }
    if (config.bullmqEnabled && !config.redisEnabled) {
        missing.push('REDIS_ENABLED=true (required when BULLMQ_ENABLED=true)');
    }

    if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }

    validateFirebasePushProjectAlignment();
};
