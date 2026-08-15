import mongoose from 'mongoose';

import { ApiError } from '../../../../utils/ApiError.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodOrder } from '../models/order.model.js';
import { OrderConversation } from '../models/orderConversation.model.js';
import { OrderMessage } from '../models/orderMessage.model.js';

const TERMINAL_CANCELLED_STATUSES = new Set([
  'cancelled_by_user',
  'cancelled_by_restaurant',
  'cancelled_by_admin',
]);

const resolveOrderId = (orderIdOrCode) => {
  if (!orderIdOrCode) return null;
  const str = String(orderIdOrCode).trim();
  if (mongoose.Types.ObjectId.isValid(str)) {
    return { _id: new mongoose.Types.ObjectId(str) };
  }
  return { $or: [{ orderId: str }, { order_id: str }] };
};

export const getOrCreateOrderConversation = async ({ orderId, currentUserId, currentRole }) => {
  const query = resolveOrderId(orderId);
  if (!query) {
    throw new ApiError(400, 'Invalid orderId provided');
  }

  const order = await FoodOrder.findOne(query).lean();
  if (!order) {
    throw new ApiError(404, 'Food order not found');
  }

  const orderMongoId = order._id;
  const orderUserId = String(order.userId || '');
  const deliveryPartnerId = order.dispatch?.deliveryPartnerId ? String(order.dispatch.deliveryPartnerId) : null;

  const normalizedRole = String(currentRole || 'USER').toUpperCase();
  const normalizedUserId = String(currentUserId || '');

  // Authorization check
  const isUserOwner = orderUserId === normalizedUserId;
  const isPartnerOwner = deliveryPartnerId && deliveryPartnerId === normalizedUserId;
  const isAdmin = normalizedRole === 'ADMIN';

  if (!isUserOwner && !isPartnerOwner && !isAdmin) {
    throw new ApiError(403, 'You are not authorized to access this delivery chat');
  }

  if (!deliveryPartnerId) {
    return {
      conversation: null,
      order,
      peer: null,
      status: 'WAITING_FOR_PARTNER',
      canChat: false,
      message: 'Delivery partner not assigned yet. Chat will activate when partner is assigned.',
    };
  }

  // Fetch partner details
  const partnerDoc = await FoodDeliveryPartner.findById(deliveryPartnerId)
    .select('fullName name phone vehicleNumber vehicleType rating avatar profileImage')
    .lean();

  // Fetch user details
  const userDoc = await FoodUser.findById(order.userId)
    .select('name phone avatar')
    .lean();

  // Determine chat lifecycle status
  let lifecycleStatus = 'CHAT_ACTIVE';
  if (order.orderStatus === 'delivered') {
    lifecycleStatus = 'READ_ONLY';
  } else if (TERMINAL_CANCELLED_STATUSES.has(order.orderStatus)) {
    lifecycleStatus = 'EXPIRED';
  } else if (['picked_up', 'reached_drop'].includes(order.orderStatus)) {
    lifecycleStatus = 'OUT_FOR_DELIVERY';
  }

  let conversation = await OrderConversation.findOne({ orderId: orderMongoId });

  if (!conversation) {
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48-hour retention
    conversation = await OrderConversation.create({
      orderId: orderMongoId,
      displayOrderId: order.order_id || order.orderId || String(orderMongoId),
      userId: order.userId,
      deliveryPartnerId: order.dispatch.deliveryPartnerId,
      status: lifecycleStatus,
      expiresAt,
    });
  } else if (conversation.status !== lifecycleStatus && conversation.status !== 'ARCHIVED') {
    conversation.status = lifecycleStatus;
    await conversation.save();
  }

  const isUserView = normalizedRole === 'USER' || (isUserOwner && !isPartnerOwner);
  const peer = isUserView
    ? {
        id: deliveryPartnerId,
        name: partnerDoc?.fullName || partnerDoc?.name || 'Delivery Partner',
        phone: partnerDoc?.phone || '',
        avatar: partnerDoc?.profileImage || partnerDoc?.avatar || '',
        rating: partnerDoc?.rating || 4.8,
        vehicleNumber: partnerDoc?.vehicleNumber || '',
        vehicleType: partnerDoc?.vehicleType || 'Bike',
        role: 'DELIVERY_PARTNER',
        title: 'Delivery Partner',
      }
    : {
        id: orderUserId,
        name: order.customerName || userDoc?.name || 'Customer',
        phone: order.customerPhone || userDoc?.phone || '',
        avatar: userDoc?.avatar || '',
        role: 'USER',
        title: 'Customer',
      };

  const canChat = ['CHAT_ACTIVE', 'OUT_FOR_DELIVERY', 'PARTNER_ASSIGNED'].includes(conversation.status);

  return {
    conversation: conversation.toObject(),
    order: {
      orderId: order.order_id || order.orderId,
      mongoId: order._id,
      orderStatus: order.orderStatus,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
    },
    peer,
    status: conversation.status,
    canChat,
  };
};

export const sendOrderChatMessage = async ({ orderId, text, messageType = 'text', currentUserId, currentRole }) => {
  const cleanText = String(text || '').trim();
  if (!cleanText) {
    throw new ApiError(400, 'Message text cannot be empty');
  }
  if (cleanText.length > 500) {
    throw new ApiError(400, 'Message cannot exceed 500 characters');
  }

  const chatSession = await getOrCreateOrderConversation({ orderId, currentUserId, currentRole });
  const { conversation, canChat, status } = chatSession;

  if (!conversation) {
    throw new ApiError(400, 'Delivery partner is not assigned to this order yet');
  }

  if (!canChat) {
    if (status === 'READ_ONLY') {
      throw new ApiError(400, 'This order has been delivered. The conversation is now read-only.');
    }
    if (status === 'EXPIRED') {
      throw new ApiError(400, 'This order has been cancelled. Chat is closed.');
    }
    throw new ApiError(400, 'Chat is not active for this order');
  }

  const senderRole = String(currentRole || '').toUpperCase() === 'DELIVERY_PARTNER' ? 'DELIVERY_PARTNER' : 'USER';
  const message = await OrderMessage.create({
    conversationId: conversation._id,
    orderId: conversation.orderId,
    senderId: currentUserId,
    senderRole,
    text: cleanText,
    messageType: ['quick_reply', 'system'].includes(messageType) ? messageType : 'text',
    status: 'sent',
  });

  const isUserSender = senderRole === 'USER';
  const updatedConversation = await OrderConversation.findByIdAndUpdate(
    conversation._id,
    {
      lastMessage: cleanText,
      lastMessageAt: new Date(),
      lastSenderRole: senderRole,
      $inc: {
        userUnreadCount: isUserSender ? 0 : 1,
        partnerUnreadCount: isUserSender ? 1 : 0,
      },
    },
    { new: true }
  ).lean();

  return {
    message: message.toObject(),
    conversationId: conversation._id,
    orderId: conversation.orderId,
    conversation: updatedConversation,
  };
};

export const getOrderChatMessages = async ({ orderId, currentUserId, currentRole }) => {
  const chatSession = await getOrCreateOrderConversation({ orderId, currentUserId, currentRole });
  const { conversation } = chatSession;

  if (!conversation) {
    return {
      conversation: null,
      messages: [],
      chatSession,
    };
  }

  const messages = await OrderMessage.find({ conversationId: conversation._id })
    .sort({ createdAt: 1 })
    .lean();

  return {
    conversation,
    messages,
    chatSession,
  };
};

export const markOrderMessagesAsRead = async ({ orderId, currentUserId, currentRole }) => {
  const chatSession = await getOrCreateOrderConversation({ orderId, currentUserId, currentRole });
  const { conversation } = chatSession;

  if (!conversation) {
    return { success: true };
  }

  const isUser = String(currentRole || '').toUpperCase() !== 'DELIVERY_PARTNER';
  const updateField = isUser ? { userUnreadCount: 0 } : { partnerUnreadCount: 0 };
  const peerRole = isUser ? 'DELIVERY_PARTNER' : 'USER';

  await Promise.all([
    OrderConversation.findByIdAndUpdate(conversation._id, updateField),
    OrderMessage.updateMany(
      {
        conversationId: conversation._id,
        senderRole: peerRole,
        status: { $ne: 'read' },
      },
      {
        $set: { status: 'read', readAt: new Date() },
      }
    ),
  ]);

  return { success: true, conversationId: conversation._id };
};
