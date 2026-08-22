import { toast } from 'sonner';

const CHAT_NOTIFY_SOUND_PATH = '/notification_message-notify-8-313753.mp3';

let audioInstance = null;

export const playChatNotificationSound = () => {
  try {
    if (!audioInstance) {
      audioInstance = new Audio(CHAT_NOTIFY_SOUND_PATH);
      audioInstance.volume = 0.8;
    }
    audioInstance.currentTime = 0;
    const playPromise = audioInstance.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback: Synthesize notification chime using Web Audio API if HTML5 audio play fails
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now); // A5 note
            osc.frequency.setValueAtTime(1174.66, now + 0.12); // D6 note
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.4);
          }
        } catch {
          // Ignore Web Audio API fallback errors
        }
      });
    }

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([150, 80, 150]);
    }
  } catch (err) {
    console.warn('Chat notification sound error:', err);
  }
};

const processedNotifications = new Set();
let lastNotificationTime = 0;
const DUP_WINDOW_MS = 6000;
const SOUND_THROTTLE_MS = 1500;

export const showChatNotification = (senderName, messageText, notifId = null) => {
  const text = String(messageText || '').trim();
  const name = String(senderName || '').trim();
  const now = Date.now();

  const uniqueKey = notifId ? String(notifId) : `${name}:${text}`;

  if (processedNotifications.has(uniqueKey)) {
    return false;
  }

  processedNotifications.add(uniqueKey);
  setTimeout(() => {
    processedNotifications.delete(uniqueKey);
  }, DUP_WINDOW_MS);

  if (now - lastNotificationTime >= SOUND_THROTTLE_MS) {
    lastNotificationTime = now;
    playChatNotificationSound();
  }

  const title = name ? `💬 Message from ${name}` : '💬 New Chat Message';
  
  if (typeof toast !== 'undefined' && typeof toast.info === 'function') {
    toast.info(title, {
      description: text || 'You have received a new message.',
      duration: 5000,
    });
  }

  return true;
};
