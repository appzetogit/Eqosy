import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../../config/env.js';
import { ADMIN_LEVELS, ADMIN_MODULES } from './adminHierarchy.constants.js';

const adminSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        name: { type: String, trim: true, default: '' },
        phone: { type: String, trim: true, default: '' },
        profileImage: { type: String, trim: true, default: '' },
        fcmTokens: {
            type: [String],
            default: []
        },
        fcmTokenMobile: {
            type: [String],
            default: []
        },
        role: {
            type: String,
            default: 'ADMIN'
        },
        adminLevel: {
            type: String,
            enum: Object.values(ADMIN_LEVELS),
            default: ADMIN_LEVELS.PLATFORM_SUPERADMIN,
        },
        module: {
            type: String,
            enum: [...Object.values(ADMIN_MODULES), null],
            default: null,
        },
        parentAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodAdmin',
            default: null,
            index: true,
        },
        admin_type: {
            type: String,
            enum: ['superadmin', 'subadmin'],
            default: 'superadmin',
            trim: true,
        },
        permissions: {
            type: [String],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true
        },
        active: {
            type: Boolean,
            default: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            trim: true,
        },
        servicesAccess: {
            type: [String],
            enum: ['food', 'quickCommerce', 'taxi'],
            default: ['food']
        },
        service_location_ids: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'TaxiServiceLocation',
                },
            ],
            default: [],
        },
        zone_ids: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'TaxiZone',
                },
            ],
            default: [],
        },
        food_zone_ids: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'FoodZone',
                },
            ],
            default: [],
        },
        resetPasswordOtp: {
            type: String,
            select: false,
        },
        resetPasswordExpires: {
            type: Date,
            select: false,
        },
    },
    {
        collection: 'admins',
        timestamps: true
    }
);

adminSchema.index({ servicesAccess: 1 });
adminSchema.index({ adminLevel: 1, module: 1 });
adminSchema.index({ parentAdminId: 1, module: 1 });

adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }

    const salt = await bcrypt.genSalt(config.bcryptSaltRounds);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

adminSchema.methods.comparePassword = function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

export const FoodAdmin = mongoose.models.FoodAdmin || mongoose.model('FoodAdmin', adminSchema);

export default FoodAdmin;
