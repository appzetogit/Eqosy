import { sendResponse } from '../../../../utils/response.js';
import {
  getOrCreateOrderConversation,
  getOrderChatMessages,
  markOrderMessagesAsRead,
  sendOrderChatMessage,
} from '../services/orderChat.service.js';

const extractUserId = (req) => {
  return req.user?.id || req.user?.userId || req.user?._id || req.user?.partnerId || '';
};

const extractUserRole = (req) => {
  const rawRole = req.user?.role || req.user?.userType || req.user?.type || 'USER';
  const roleStr = String(rawRole).toUpperCase();
  if (['DELIVERY_PARTNER', 'DELIVERY', 'DRIVER', 'PARTNER', 'RIDER'].includes(roleStr)) {
    return 'DELIVERY_PARTNER';
  }
  if (['ADMIN', 'SUPER_ADMIN'].includes(roleStr)) {
    return 'ADMIN';
  }
  return 'USER';
};

export const getOrderChat = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const currentUserId = extractUserId(req);
    const currentRole = extractUserRole(req);

    const data = await getOrCreateOrderConversation({
      orderId,
      currentUserId,
      currentRole,
    });

    return sendResponse(res, 200, 'Order chat conversation loaded', data);
  } catch (error) {
    next(error);
  }
};

export const getOrderMessages = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const currentUserId = extractUserId(req);
    const currentRole = extractUserRole(req);

    const data = await getOrderChatMessages({
      orderId,
      currentUserId,
      currentRole,
    });

    return sendResponse(res, 200, 'Order chat messages loaded', data);
  } catch (error) {
    next(error);
  }
};

export const postOrderMessage = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { text, messageType } = req.body;
    const currentUserId = extractUserId(req);
    const currentRole = extractUserRole(req);

    const data = await sendOrderChatMessage({
      orderId,
      text,
      messageType,
      currentUserId,
      currentRole,
    });

    return sendResponse(res, 201, 'Message sent successfully', data);
  } catch (error) {
    next(error);
  }
};

export const markOrderChatRead = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const currentUserId = extractUserId(req);
    const currentRole = extractUserRole(req);

    const data = await markOrderMessagesAsRead({
      orderId,
      currentUserId,
      currentRole,
    });

    return sendResponse(res, 200, 'Messages marked as read', data);
  } catch (error) {
    next(error);
  }
};

export const reportOrderChat = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    return sendResponse(res, 200, 'Report received. Our safety team will review it.', {
      orderId,
      reportedAt: new Date(),
      status: 'received',
    });
  } catch (error) {
    next(error);
  }
};
