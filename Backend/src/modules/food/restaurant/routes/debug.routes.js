import express from 'express';
import mongoose from 'mongoose';
import { FoodRestaurant } from '../../models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';

const router = express.Router();

router.get('/debug', async (req, res) => {
    try {
        const rest = await FoodRestaurant.findOne({ restaurantName: { $regex: 'Fresh Bite', $options: 'i' } });
        if (!rest) return res.json({ error: 'Not found' });
        
        const items = await FoodItem.find({ restaurantId: rest._id }).lean();
        res.json({
            restaurant: rest.restaurantName,
            restaurantId: rest._id,
            isActive: rest.isActive,
            items: items.map(i => ({
                name: i.name,
                image: i.image,
                isActive: i.isActive,
                isAvailable: i.isAvailable,
                approvalStatus: i.approvalStatus,
                isRecommended: i.isRecommended
            }))
        });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
