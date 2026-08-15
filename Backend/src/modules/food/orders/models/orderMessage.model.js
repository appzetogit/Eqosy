import mongoose from 'mongoose';

const orderMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OrderConversation',
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodOrder',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    senderRole: {
      type: String,
      enum: ['USER', 'DELIVERY_PARTNER', 'SYSTEM'],
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    messageType: {
      type: String,
      enum: ['text', 'quick_reply', 'system'],
      default: 'text',
    },
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read'],
      default: 'sent',
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'food_order_messages',
    timestamps: true,
  }
);

orderMessageSchema.index({ conversationId: 1, createdAt: 1 });
orderMessageSchema.index({ orderId: 1, createdAt: 1 });

export const OrderMessage = mongoose.model('OrderMessage', orderMessageSchema);
