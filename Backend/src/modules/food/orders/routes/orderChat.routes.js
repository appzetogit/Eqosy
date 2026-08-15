import express from 'express';

import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import {
  getOrderChat,
  getOrderMessages,
  markOrderChatRead,
  postOrderMessage,
  reportOrderChat,
} from '../controllers/orderChat.controller.js';

const router = express.Router({ mergeParams: true });

router.use(authMiddleware);
router.use(requireRoles('USER', 'DELIVERY_PARTNER', 'ADMIN'));

router.get('/:orderId/chat', getOrderChat);
router.get('/:orderId/chat/messages', getOrderMessages);
router.post('/:orderId/chat/messages', postOrderMessage);
router.post('/:orderId/chat/read', markOrderChatRead);
router.post('/:orderId/chat/report', reportOrderChat);

export default router;
