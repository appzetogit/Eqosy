import mongoose from 'mongoose';

const orderConversationSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodOrder',
      required: true,
      unique: true,
      index: true,
    },
    displayOrderId: {
      type: String,
      default: '',
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodDeliveryPartner',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'WAITING_FOR_PARTNER',
        'PARTNER_ASSIGNED',
        'CHAT_ACTIVE',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'READ_ONLY',
        'EXPIRED',
        'ARCHIVED',
      ],
      default: 'CHAT_ACTIVE',
      index: true,
    },
    lastMessage: {
      type: String,
      default: '',
      trim: true,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastSenderRole: {
      type: String,
      enum: ['USER', 'DELIVERY_PARTNER', 'SYSTEM', ''],
      default: '',
    },
    userUnreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    partnerUnreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'food_order_conversations',
    timestamps: true,
  }
);

orderConversationSchema.index({ userId: 1, status: 1, updatedAt: -1 });
orderConversationSchema.index({ deliveryPartnerId: 1, status: 1, updatedAt: -1 });

export const OrderConversation = mongoose.model('OrderConversation', orderConversationSchema);
