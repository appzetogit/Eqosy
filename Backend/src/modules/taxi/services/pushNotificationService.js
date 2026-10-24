import { getFirebaseMessaging } from '../../../config/firebase.js';
import { Driver } from '../driver/models/Driver.js';
import { User } from '../user/models/User.js';
import { Ride } from '../user/models/Ride.js';
import { listEntityPushTokens } from './pushTokenService.js';

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

const chunk = (items, size) => {
  const groups = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
};

const collectAudienceTargets = async ({ sendTo, serviceLocationId }) => {
  const includeUsers = sendTo === 'all' || sendTo === 'users';
  const includeDrivers = sendTo === 'all' || sendTo === 'drivers';
  const targets = [];

  if (includeUsers) {
    const userQuery = {
      deletedAt: null,
      isActive: { $ne: false },
      active: { $ne: false },
    };

    if (serviceLocationId) {
      const userIds = await Ride.distinct('userId', { service_location_id: serviceLocationId });
      userQuery._id = { $in: userIds };
    }

    const users = await User.find(userQuery)
      .select('_id fcmTokens fcmTokenMobile')
      .lean();

    users.forEach((user) => {
      listEntityPushTokens(user, 'user').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(user._id),
        });
      });
    });
  }

  if (includeDrivers) {
    const driverQuery = {
      deletedAt: null,
      approve: { $ne: false },
      status: { $ne: 'pending' },
    };

    if (serviceLocationId) {
      driverQuery.service_location_id = serviceLocationId;
    }

    const drivers = await Driver.find(driverQuery)
      .select('_id fcmTokenWeb fcmTokenMobile')
      .lean();

    drivers.forEach((driver) => {
      listEntityPushTokens(driver, 'driver').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(driver._id),
        });
      });
    });
  }

  return targets;
};

const removeInvalidTokens = async (invalidTargets = []) => {
  if (invalidTargets.length === 0) {
    return 0;
  }

  const userIdsByField = { fcmTokens: new Set(), fcmTokenMobile: new Set() };
  const driverIdsByField = { fcmTokenWeb: new Set(), fcmTokenMobile: new Set() };

  invalidTargets.forEach((target) => {
    if (target.role === 'user') {
      userIdsByField[target.field]?.add(target.entityId);
    }

    if (target.role === 'driver') {
      driverIdsByField[target.field]?.add(target.entityId);
    }
  });

  const operations = [];

  Object.entries(userIdsByField).forEach(([field, ids]) => {
    if (ids.size > 0) {
      operations.push(
        User.updateMany(
          { _id: { $in: Array.from(ids) } },
          { $pull: { [field]: { $in: invalidTargets.filter((t) => t.role === 'user' && t.field === field).map((t) => t.token) } } },
        ),
      );
    }
  });

  Object.entries(driverIdsByField).forEach(([field, ids]) => {
    if (ids.size > 0) {
      operations.push(
        Driver.updateMany(
          { _id: { $in: Array.from(ids) } },
          { $set: { [field]: '' } },
        ),
      );
    }
  });

  await Promise.all(operations);
  return invalidTargets.length;
};

const sendPushToTargets = async ({
  targets = [],
  title,
  body,
  image = '',
  data = {},
}) => {
  const messaging = getFirebaseMessaging();

  if (!messaging) {
    return {
      attempted: false,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'Firebase messaging is not configured on the backend',
    };
  }

  const dedupedTargets = Array.from(
    new Map((Array.isArray(targets) ? targets : []).map((target) => [target.token, target])).values(),
  );

  if (dedupedTargets.length === 0) {
    return {
      attempted: true,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'No saved FCM tokens were found for the selected entities',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  const invalidTargets = [];
  const safeData = Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, String(value ?? '')]),
  );

  const dataType = String(safeData.type || '').toLowerCase();
  const isRing = safeData.ring === 'true' || dataType === 'ride_request' || dataType === 'new_ride' || Boolean(safeData.rideId);
  const isChat = dataType.includes('chat') || safeData.openChat === 'true';
  const ringChannelId = process.env.FCM_TAXI_RING_CHANNEL_ID || process.env.FCM_RING_CHANNEL_ID || 'ride_requests';
  const ringSound = process.env.FCM_TAXI_RING_SOUND || process.env.FCM_RING_SOUND || 'ride_request_alert';
  const channelId = isRing ? ringChannelId : (isChat ? 'chat_messages' : 'default');
  const soundName = isRing ? ringSound : 'default';
  const targetLink = safeData.targetUrl || safeData.link || safeData.click_action || '/taxi/driver/home';

  for (const batch of chunk(dedupedTargets, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((target) => target.token),
      notification: {
        title,
        body,
        ...(image ? { imageUrl: image } : {}),
      },
      data: {
        ...safeData,
        ring: isRing ? 'true' : 'false',
        sound: soundName,
        channel_id: channelId,
        android_channel_id: channelId,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId,
          sound: soundName,
          priority: isRing ? 'max' : 'high',
          defaultSound: !isRing,
          defaultVibrateTimings: true,
          visibility: 'public',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          ...(image ? { imageUrl: image } : {}),
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: isRing ? 'ride-request-alert.mp3' : 'default',
            badge: 1,
            'content-available': 1,
          },
        },
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title,
          body,
          icon: '/eqosy-logo.png',
          badge: '/eqosy-logo.png',
          sound: isRing ? '/ride-request-alert.mp3' : '/zomato_sms.mp3',
          silent: false,
          requireInteraction: isRing,
          ...(image ? { image } : {}),
        },
        data: {
          ...safeData,
          ring: isRing ? 'true' : 'false',
        },
        ...(targetLink ? { fcmOptions: { link: targetLink } } : {}),
      },
    });

    response.responses.forEach((item, index) => {
      if (item.success) {
        deliveredCount += 1;
        return;
      }

      failedCount += 1;
      if (INVALID_TOKEN_CODES.has(item.error?.code)) {
        invalidTargets.push(batch[index]);
      }
    });
  }

  const invalidTokenCount = await removeInvalidTokens(invalidTargets);

  return {
    attempted: true,
    deliveredCount,
    failedCount,
    invalidTokenCount,
    targetCount: dedupedTargets.length,
    reason: '',
  };
};

const collectDirectTargets = async ({ userIds = [], driverIds = [] }) => {
  const normalizedUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const normalizedDriverIds = [...new Set((Array.isArray(driverIds) ? driverIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const targets = [];

  if (normalizedUserIds.length) {
    const users = await User.find({ _id: { $in: normalizedUserIds } })
      .select('_id fcmTokens fcmTokenMobile')
      .lean();

    users.forEach((user) => {
      listEntityPushTokens(user, 'user').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(user._id),
        });
      });
    });
  }

  if (normalizedDriverIds.length) {
    const drivers = await Driver.find({ _id: { $in: normalizedDriverIds } })
      .select('_id fcmTokenWeb fcmTokenMobile')
      .lean();

    drivers.forEach((driver) => {
      listEntityPushTokens(driver, 'driver').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(driver._id),
        });
      });
    });
  }

  return targets;
};

export const sendPushNotificationToAudience = async ({
  notificationId,
  serviceLocationId,
  sendTo,
  title,
  body,
  image,
}) => {
  const messaging = getFirebaseMessaging();

  if (!messaging) {
    return {
      attempted: false,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'Firebase messaging is not configured on the backend',
    };
  }

  const targets = await collectAudienceTargets({ sendTo, serviceLocationId });
  const dedupedTargets = Array.from(
    new Map(targets.map((target) => [target.token, target])).values(),
  );

  if (dedupedTargets.length === 0) {
    return {
      attempted: true,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'No saved FCM tokens were found for the selected audience',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  const invalidTargets = [];

  const userTargets = dedupedTargets.filter((t) => t.role === 'user');
  const driverTargets = dedupedTargets.filter((t) => t.role === 'driver');
  const targetGroups = [
    { targets: userTargets, redirectUrl: '/taxi/user' },
    { targets: driverTargets, redirectUrl: '/taxi/driver/home' },
  ].filter((g) => g.targets.length > 0);

  for (const group of targetGroups) {
    for (const batch of chunk(group.targets, 500)) {
      const response = await messaging.sendEachForMulticast({
        tokens: batch.map((target) => target.token),
        notification: {
          title,
          body,
          ...(image ? { imageUrl: image } : {}),
        },
        data: {
          notificationId: String(notificationId || ''),
          serviceLocationId: String(serviceLocationId || 'all'),
          sendTo: String(sendTo || 'all'),
          redirect_url: group.redirectUrl,
          link: group.redirectUrl,
          targetUrl: group.redirectUrl,
          click_action: group.redirectUrl,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
            sound: 'default',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
            visibility: 'public',
            clickAction: group.redirectUrl,
            ...(image ? { imageUrl: image } : {}),
          },
        },
        webpush: {
          notification: {
            title,
            body,
            ...(image ? { image } : {}),
          },
          fcmOptions: {
            link: group.redirectUrl,
          },
        },
      });

      response.responses.forEach((item, index) => {
        if (item.success) {
          deliveredCount += 1;
          return;
        }

        failedCount += 1;
        if (INVALID_TOKEN_CODES.has(item.error?.code)) {
          invalidTargets.push(batch[index]);
        }
      });
    }
  }

  const invalidTokenCount = await removeInvalidTokens(invalidTargets);

  return {
    attempted: true,
    deliveredCount,
    failedCount,
    invalidTokenCount,
    targetCount: dedupedTargets.length,
    reason: '',
  };
};

export const sendPushNotificationToEntities = async ({
  userIds = [],
  driverIds = [],
  title,
  body,
  image = '',
  data = {},
}) => {
  const targets = await collectDirectTargets({ userIds, driverIds });
  return sendPushToTargets({
    targets,
    title,
    body,
    image,
    data,
  });
};
