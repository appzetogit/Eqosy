import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  MessageCircle,
  PhoneCall,
  Send,
  ShieldAlert,
  Smile,
  Star,
  Truck,
  User,
} from 'lucide-react';
import { API_BASE_URL, resolveSocketOrigin } from '@food/api/config';
import { userAPI } from '@food/api';
import { playChatNotificationSound } from '@/shared/utils/chatNotificationSound';

const QUICK_REPLIES_USER = [
  "I'm at the gate",
  'Please call me',
  'Leave the order at the door',
  "I'm coming outside",
  'Please wait 2 minutes',
];

const QUICK_REPLIES_PARTNER = [
  "I'm on the way",
  "I'm 2 minutes away",
  "I'm at the gate",
  'Please come outside',
  'Please share a nearby landmark',
];

const EMOJIS = ['👍', '👋', '🏃‍♂️', '🏠', '📦', '📞', '😊', '🙏', '🚀', '📍'];

export default function FoodOrderChatScreen({ isEmbedded = false, embeddedOrderId = null, onClose = null }) {
  const navigate = useNavigate();
  const routeParams = useParams();
  const orderId = embeddedOrderId || routeParams.orderId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chatSession, setChatSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState('USER');
  const [currentUserId, setCurrentUserId] = useState('');

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const currentUserRoleRef = useRef(currentUserRole);

  useEffect(() => {
    currentUserRoleRef.current = currentUserRole;
  }, [currentUserRole]);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const getAuthToken = () => {
    const isDeliveryApp = window.location.pathname.includes('/delivery') || window.location.pathname.includes('/driver');
    if (isDeliveryApp) {
      return (
        localStorage.getItem('delivery_accessToken') ||
        localStorage.getItem('deliveryToken') ||
        localStorage.getItem('driverToken') ||
        localStorage.getItem('accessToken') ||
        localStorage.getItem('user_accessToken')
      );
    }
    return (
      localStorage.getItem('user_accessToken') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('delivery_accessToken') ||
      localStorage.getItem('deliveryToken') ||
      localStorage.getItem('driverToken')
    );
  };

  const buildChatUrl = (path) => {
    const base = (API_BASE_URL || '/api/v1').replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (base.endsWith('/v1') && cleanPath.startsWith('/v1/')) {
      return `${base.slice(0, -3)}${cleanPath}`;
    }
    return `${base}${cleanPath}`;
  };

  // Determine current user info
  useEffect(() => {
    const isDeliveryApp = window.location.pathname.includes('/delivery') || window.location.pathname.includes('/driver');
    const role = isDeliveryApp ? 'DELIVERY_PARTNER' : 'USER';
    setCurrentUserRole(role);
    currentUserRoleRef.current = role;
  }, []);

  // Fetch Chat Conversation Metadata & Initial Messages
  const fetchChatData = async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      setError('');

      const token = getAuthToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await fetch(buildChatUrl(`/v1/food/orders/${orderId}/chat`), { headers });
      const resText = await response.text();
      let data = null;
      try {
        data = resText ? JSON.parse(resText) : null;
      } catch (parseErr) {
        throw new Error(response.ok ? 'Invalid response from server' : `Server error (${response.status})`);
      }

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || data?.error || `Failed to load delivery chat (${response.status})`);
      }

      setChatSession(data.data);

      if (data.data?.canChat || data.data?.conversation) {
        const msgResponse = await fetch(buildChatUrl(`/v1/food/orders/${orderId}/chat/messages`), { headers });
        const msgText = await msgResponse.text();
        let msgData = null;
        try {
          msgData = msgText ? JSON.parse(msgText) : null;
        } catch (_) {}
        if (msgData?.success && Array.isArray(msgData.data?.messages)) {
          setMessages(msgData.data.messages);
        }
      }
    } catch (err) {
      console.error('[FoodOrderChat] Fetch error:', err);
      setError(err.message || 'Could not load order chat');
    } finally {
      setLoading(false);
      setTimeout(() => scrollToBottom(false), 200);
    }
  };

  useEffect(() => {
    fetchChatData();
  }, [orderId]);

  // Setup Real-time Socket Connection
  useEffect(() => {
    if (!orderId) return;

    const token = getAuthToken();
    const socketUrl = resolveSocketOrigin(API_BASE_URL);

    if (!token) return;

    const socket = io(socketUrl, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-order-chat', orderId);
      socket.emit('mark-order-chat-read', { orderId });
    });

    socket.on('new-order-chat-message', (payload) => {
      if (payload && payload.message) {
        const msg = payload.message;
        if (msg.senderRole !== currentUserRoleRef.current) {
          playChatNotificationSound();
        }
        setMessages((prev) => {
          if (prev.some((m) => String(m._id) === String(msg._id))) {
            return prev;
          }
          const tempMatch = prev.find(
            (m) => String(m._id).startsWith('temp-') && m.senderRole === msg.senderRole && m.text === msg.text
          );
          if (tempMatch) {
            return prev.map((m) => (m._id === tempMatch._id ? msg : m));
          }
          const recentMatch = prev.find(
            (m) => m.senderRole === msg.senderRole && m.text === msg.text && Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 4000
          );
          if (recentMatch) {
            return prev.map((m) => (m._id === recentMatch._id ? msg : m));
          }
          return [...prev, msg];
        });
        setTimeout(() => scrollToBottom(), 100);
        socket.emit('mark-order-chat-read', { orderId });
      }
    });

    socket.on('partner-typing-order-chat', (payload) => {
      if (payload && String(payload.orderId) === String(orderId)) {
        setPartnerTyping(Boolean(payload.isTyping));
        if (payload.isTyping) {
          setTimeout(() => setPartnerTyping(false), 4000);
        }
      }
    });

    socket.on('order-chat-messages-read', () => {
      setMessages((prev) =>
        prev.map((msg) => ({
          ...msg,
          status: 'read',
          readAt: msg.readAt || new Date().toISOString(),
        }))
      );
    });

    return () => {
      socket.emit('leave-order-chat', orderId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    if (!socketRef.current || !orderId) return;

    if (!isTyping) {
      setIsTyping(true);
      socketRef.current.emit('typing-order-chat', { orderId, isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit('typing-order-chat', { orderId, isTyping: false });
    }, 1500);
  };

  const handleSendMessage = async (textToSend = null) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending || !orderId) return;

    try {
      setIsSending(true);

      const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const optimisticMsg = {
        _id: optimisticId,
        orderId,
        senderRole: currentUserRole,
        text,
        messageType: textToSend ? 'quick_reply' : 'text',
        status: 'sending',
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => {
        if (prev.some((m) => m.text === text && m.senderRole === currentUserRole && (Date.now() - new Date(m.createdAt).getTime()) < 2000)) {
          return prev;
        }
        return [...prev, optimisticMsg];
      });
      setInputText('');
      setShowEmojiPicker(false);
      setTimeout(() => scrollToBottom(), 50);

      const token = getAuthToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const response = await fetch(buildChatUrl(`/v1/food/orders/${orderId}/chat/messages`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          messageType: textToSend ? 'quick_reply' : 'text',
        }),
      });

      const resText = await response.text();
      let data = null;
      try {
        data = resText ? JSON.parse(resText) : null;
      } catch (_) {}

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || data?.error || 'Failed to send message');
      }

      const realMsg = data.data?.message;
      if (realMsg) {
        setMessages((prev) => {
          const existsById = prev.some((m) => String(m._id) === String(realMsg._id));
          if (existsById) {
            return prev.filter((m) => m._id !== optimisticId);
          }
          return prev.map((m) => (m._id === optimisticId ? realMsg : m));
        });
      }
    } catch (err) {
      console.error('Send chat error:', err);
    } finally {
      setIsSending(false);
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  const handleCall = () => {
    const phone = chatSession?.peer?.phone;
    if (!phone) {
      alert('Phone number not available');
      return;
    }
    window.open(`tel:${phone.replace(/[^\d+]/g, '')}`, '_self');
  };

  const handleReport = async () => {
    if (!window.confirm('Report this delivery conversation for review?')) return;
    try {
      const token = getAuthToken();
      await fetch(buildChatUrl(`/v1/food/orders/${orderId}/chat/report`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: 'User reported conversation' }),
      });
      alert('Report submitted. Our safety team will review this chat.');
    } catch {
      alert('Could not submit report.');
    }
  };

  const quickReplies = currentUserRole === 'DELIVERY_PARTNER' ? QUICK_REPLIES_PARTNER : QUICK_REPLIES_USER;
  const peer = chatSession?.peer;
  const canChat = chatSession?.canChat;
  const chatStatus = chatSession?.status;
  const displayOrderId = chatSession?.order?.orderId || orderId;

  const handleBackNavigation = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (onClose) {
      onClose();
      return;
    }
    const fromPath = location.state?.from;
    if (fromPath) {
      navigate(fromPath, { replace: true });
      return;
    }
    if (currentUserRole === 'DELIVERY_PARTNER') {
      navigate('/food/delivery/feed', { replace: true });
      return;
    }
    if (window.history.length > 1 && window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      const fallback = orderId ? `/food/user/orders/${orderId}` : '/food';
      navigate(fallback, { replace: true });
    }
  };

  return (
    <div className={`flex flex-col bg-white ${isEmbedded ? 'h-full rounded-2xl overflow-hidden shadow-lg border border-slate-200' : 'fixed inset-0 z-50 max-w-md mx-auto font-sans bg-white shadow-2xl'}`}>
      <div className="bg-slate-900 text-white px-4 py-3.5 shadow-md flex items-center justify-between shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={handleBackNavigation}
            className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white transition-colors active:scale-95"
          >
            <ArrowLeft size={18} strokeWidth={2.5} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-black tracking-tight text-white truncate">
                {peer?.name || (currentUserRole === 'DELIVERY_PARTNER' ? 'Customer' : 'Delivery Partner')}
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Online
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-400 truncate">
              {peer?.title || 'Food Delivery'} &middot; Order #{displayOrderId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {peer?.phone && (
            <button
              onClick={handleCall}
              className="w-9 h-9 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center hover:bg-orange-500/30 transition-colors"
              title="Call"
            >
              <PhoneCall size={16} strokeWidth={2.5} />
            </button>
          )}
          <button
            onClick={handleReport}
            className="w-9 h-9 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-red-400 transition-colors"
            title="Report"
          >
            <ShieldAlert size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {peer && (
        <div className="bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600 font-black text-sm shrink-0 shadow-xs">
              {peer.avatar ? (
                <img src={peer.avatar} alt={peer.name} className="w-full h-full object-cover rounded-xl" />
              ) : (
                peer.name?.charAt(0) || 'D'
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-slate-900 truncate">{peer.name}</p>
              <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                {peer.rating && (
                  <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                    <Star size={11} className="fill-amber-400 text-amber-400" /> {peer.rating}
                  </span>
                )}
                {peer.vehicleNumber && <span>&middot; {peer.vehicleNumber}</span>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black tracking-wider uppercase text-slate-400 block">Delivery Chat</span>
            <span className="text-[11px] font-black text-orange-500">#Order {displayOrderId}</span>
          </div>
        </div>
      )}

      {chatStatus === 'READ_ONLY' && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-center shrink-0">
          <p className="text-[11px] font-bold text-emerald-800 flex items-center justify-center gap-1.5">
            <CheckCheck size={14} /> Order delivered. This conversation is now read-only.
          </p>
        </div>
      )}
      {chatStatus === 'EXPIRED' && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-center shrink-0">
          <p className="text-[11px] font-bold text-rose-800 flex items-center justify-center gap-1.5">
            <AlertTriangle size={14} /> Order cancelled. Chat is closed.
          </p>
        </div>
      )}
      {chatStatus === 'WAITING_FOR_PARTNER' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center shrink-0">
          <p className="text-[11px] font-bold text-amber-800 flex items-center justify-center gap-1.5">
            <Truck size={14} /> 🚚 Finding a delivery partner... Chat will activate upon assignment.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-xs font-semibold">
            Loading order chat...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-rose-500 text-xs font-semibold gap-2">
            <AlertTriangle size={20} />
            <p>{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-10">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 mb-2 shadow-xs">
              <MessageCircle size={22} />
            </div>
            <p className="text-[13px] font-black text-slate-800">Order Delivery Chat</p>
            <p className="text-[11px] font-medium text-slate-500 max-w-[220px] mt-1">
              Send a quick message to coordinate pickup or delivery location.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderRole === currentUserRole;
            return (
              <motion.div
                key={msg._id || index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[78%] px-4 py-2.5 rounded-[18px] text-[13px] font-medium shadow-xs leading-relaxed ${isMe
                      ? 'bg-orange-500 text-white rounded-br-xs'
                      : 'bg-white text-slate-900 border border-slate-200 rounded-bl-xs'
                    }`}
                >
                  <p className="break-words font-medium">{msg.text}</p>
                  <div
                    className={`flex items-center justify-end gap-1 text-[9px] mt-1 font-bold ${isMe ? 'text-orange-100' : 'text-slate-400'
                      }`}
                  >
                    <span>
                      {msg.createdAt
                        ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                    {isMe && (
                      <span className="ml-0.5">
                        {msg.status === 'sending' ? (
                          <Clock size={10} className="animate-spin text-orange-200" />
                        ) : msg.status === 'read' ? (
                          <CheckCheck size={12} className="text-sky-200" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck size={12} className="text-orange-200" />
                        ) : (
                          <Check size={12} className="text-orange-200" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
        {partnerTyping && (
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-medium italic pt-1">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span>{peer?.name || 'Delivery Partner'} is typing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {canChat && (
        <div className="bg-white px-3 py-2 border-t border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-none flex gap-2 shrink-0">
          {quickReplies.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip)}
              disabled={isSending}
              className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all shadow-xs active:scale-95 shrink-0"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-white border-t border-slate-200 px-3 py-2 flex items-center gap-3 overflow-x-auto shrink-0"
          >
            {EMOJIS.map((emoji, idx) => (
              <button
                key={idx}
                onClick={() => setInputText((prev) => prev + emoji)}
                className="text-xl hover:scale-125 transition-transform p-1"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {canChat ? (
        <div className="bg-white p-3 border-t border-slate-200 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center hover:text-amber-500 hover:bg-slate-200 transition-colors shrink-0"
          >
            <Smile size={20} />
          </button>
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message..."
            maxLength={500}
            className="flex-1 h-10 px-3.5 bg-slate-100 border border-slate-200 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white transition-all font-medium"
          />
          <button
            type="button"
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isSending}
            className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-600 transition-colors shadow-md shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
      ) : (
        <div className="bg-white p-3.5 border-t border-slate-200 text-center text-xs font-semibold text-slate-500 shrink-0">
          {chatStatus === 'READ_ONLY' ? 'Chat read-only after delivery' : 'Chat disabled for this order'}
        </div>
      )}
    </div>
  );
}
