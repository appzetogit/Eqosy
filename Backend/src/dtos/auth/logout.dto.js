import { z } from 'zod';
import { ValidationError } from '../../core/auth/errors.js';

const schema = z.object({
    refreshToken: z.string().optional().nullable(),
    fcmToken: z.string().optional().nullable(),
    platform: z.enum(['web', 'mobile']).optional().nullable()
});

export const validateLogoutDto = (body) => {
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return result.data;
};
