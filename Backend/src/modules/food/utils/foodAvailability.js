/**
 * Normalizes time string to standard 24-hour HH:mm format.
 * Supports "08:30", "8:30", "08:30 AM", "8:30 PM", etc.
 */
export function normalizeTimeString(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return '';
    const str = timeStr.trim();
    if (/^\d{2}:\d{2}$/.test(str)) return str;
    if (/^\d{1}:\d{2}$/.test(str)) return '0' + str;

    const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
        let hrs = parseInt(match[1], 10);
        const mins = match[2];
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && hrs < 12) hrs += 12;
        if (ampm === 'AM' && hrs === 12) hrs = 0;
        return `${String(hrs).padStart(2, '0')}:${mins}`;
    }

    return str;
}

/**
 * Evaluates whether a food/grocery item is currently available based on:
 * - isActive and isAvailable flags
 * - stockQuantity
 * - availableTime time window (isAllDay, startTime, endTime)
 * 
 * @param {Object} food 
 * @param {Date} [referenceDate] 
 * @returns {boolean}
 */
export function isFoodItemAvailableNow(food, referenceDate = new Date()) {
    if (!food) return false;
    if (food.isActive === false || food.isAvailable === false) return false;

    // Check stock if defined as a number
    if (typeof food.stockQuantity === 'number' && food.stockQuantity !== null && food.stockQuantity <= 0) {
        return false;
    }

    const availableTime = food.availableTime;
    if (!availableTime || availableTime.isAllDay !== false) {
        return true;
    }

    const startTime = normalizeTimeString(availableTime.startTime);
    const endTime = normalizeTimeString(availableTime.endTime);

    if (!startTime || !endTime) {
        return true; // Fallback to available if time range not properly set
    }

    const hrs = String(referenceDate.getHours()).padStart(2, '0');
    const mins = String(referenceDate.getMinutes()).padStart(2, '0');
    const currentTime = `${hrs}:${mins}`;

    if (startTime <= endTime) {
        // Standard same-day range (e.g. 08:00 to 11:30)
        return currentTime >= startTime && currentTime <= endTime;
    } else {
        // Overnight range (e.g. 22:00 to 04:00)
        return currentTime >= startTime || currentTime <= endTime;
    }
}

const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const normalizeDay = (value) => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim().toLowerCase();
    const match = DAY_NAMES.find((day) => day.toLowerCase() === trimmed);
    if (match) return match;
    const abbreviatedMatch = DAY_NAMES.find(
        (day) => day.toLowerCase().startsWith(trimmed.slice(0, 3))
    );
    return abbreviatedMatch || null;
};

const parseTimeToMinutes = (timeValue) => {
    if (!timeValue || typeof timeValue !== "string") return null;
    const raw = timeValue.trim();
    if (!raw) return null;

    const normalized = raw.toLowerCase();
    const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/);
    if (meridiemMatch) {
        let hour = Number(meridiemMatch[1]);
        const minute = Number(meridiemMatch[2]);
        const period = meridiemMatch[3];
        if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59)
            return null;
        if (period === "pm" && hour < 12) hour += 12;
        if (period === "am" && hour === 12) hour = 0;
        if (hour < 0 || hour > 23) return null;
        return hour * 60 + minute;
    }

    const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
    if (!twentyFourHourMatch) return null;

    const hour = Number(twentyFourHourMatch[1]);
    const minute = Number(twentyFourHourMatch[2]);
    if (
        Number.isNaN(hour) ||
        Number.isNaN(minute) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    return hour * 60 + minute;
};

const isWithinTimeWindow = (nowMinutes, openingMinutes, closingMinutes) => {
    if (openingMinutes === null || closingMinutes === null) return true;
    if (openingMinutes === closingMinutes) return true;

    if (closingMinutes > openingMinutes) {
        return nowMinutes >= openingMinutes && nowMinutes <= closingMinutes;
    }

    return nowMinutes >= openingMinutes || nowMinutes <= closingMinutes;
};

const getTodayTiming = (restaurant, dayName) => {
    const outletTimingsArray = restaurant?.outletTimings?.timings;
    if (Array.isArray(outletTimingsArray)) {
        const exact = outletTimingsArray.find(
            (entry) => normalizeDay(entry?.day) === dayName
        );
        if (exact) return exact;
    }

    const outletTimingsObject = restaurant?.outletTimings;
    if (
        outletTimingsObject &&
        typeof outletTimingsObject === "object" &&
        !Array.isArray(outletTimingsObject)
    ) {
        const direct = outletTimingsObject[dayName];
        if (direct && typeof direct === "object") return direct;
    }

    return null;
};

/**
 * Checks whether a restaurant is open at referenceDate based on:
 * - status ("approved")
 * - isActive (boolean)
 * - isAcceptingOrders (boolean)
 * - openingTime / closingTime / outletTimings / openDays
 */
export function getRestaurantAvailabilityStatusServer(restaurant, now = new Date()) {
    if (!restaurant) {
        return { isOpen: false, reason: "missing-restaurant", message: "Restaurant not found" };
    }

    if (restaurant.status && restaurant.status !== "approved") {
        return { isOpen: false, reason: "unapproved", message: "Restaurant is not accepting orders" };
    }

    if (restaurant.isActive === false) {
        return { isOpen: false, reason: "inactive", message: "Restaurant is currently inactive" };
    }

    if (restaurant.isAcceptingOrders === false) {
        return { isOpen: false, reason: "not-accepting-orders", message: "Restaurant is currently not accepting orders" };
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const checkDayWindow = (targetDate) => {
        const dayName = DAY_NAMES[targetDate.getDay()];
        const timing = getTodayTiming(restaurant, dayName);
        const openDays = Array.isArray(restaurant.openDays) ? restaurant.openDays : [];

        if (timing && timing.isOpen === false) return { isWithin: false, hasWindow: true, timing };

        const openingTime = timing?.openingTime || restaurant?.deliveryTimings?.openingTime || restaurant?.openingTime || null;
        const closingTime = timing?.closingTime || restaurant?.deliveryTimings?.closingTime || restaurant?.closingTime || null;
        const openingMinutes = parseTimeToMinutes(openingTime);
        const closingMinutes = parseTimeToMinutes(closingTime);
        const hasExplicitWindow = Boolean(openingTime || closingTime);

        if (!timing && openDays.length > 0) {
            const normalizedOpenDays = new Set(openDays.map((d) => normalizeDay(d)).filter(Boolean));
            if (normalizedOpenDays.size > 0 && !normalizedOpenDays.has(dayName)) {
                return { isWithin: false, hasWindow: true, reason: "closed-day" };
            }
        }

        const isWithin = hasExplicitWindow
            ? (openingMinutes !== null && closingMinutes !== null
                ? isWithinTimeWindow(nowMinutes, openingMinutes, closingMinutes)
                : true)
            : true;

        return { isWithin, hasWindow: hasExplicitWindow, openingTime, closingTime, openingMinutes, closingMinutes };
    };

    const today = checkDayWindow(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = checkDayWindow(yesterdayDate);

    const yesterdayCrossesMidnight = yesterday.openingMinutes !== null && yesterday.closingMinutes !== null && yesterday.closingMinutes < yesterday.openingMinutes;
    const isYesterdayStillOpen = yesterdayCrossesMidnight && nowMinutes <= yesterday.closingMinutes;
    const isTodayOpen = today.isWithin;

    const isOpenNow = isTodayOpen || isYesterdayStillOpen;
    const activeWindow = isTodayOpen ? today : (isYesterdayStillOpen ? yesterday : today);

    const formatTimeLabel = (tStr) => {
        if (!tStr) return "";
        const mins = parseTimeToMinutes(tStr);
        if (mins === null) return tStr;
        const h24 = Math.floor(mins / 60);
        const m = mins % 60;
        const period = h24 >= 12 ? "PM" : "AM";
        const h12 = h24 % 12 || 12;
        return `${h12}:${String(m).padStart(2, "0")} ${period}`;
    };

    const openLabel = formatTimeLabel(activeWindow.openingTime);
    const closeLabel = formatTimeLabel(activeWindow.closingTime);
    const hoursText = (openLabel && closeLabel) ? ` (${openLabel} - ${closeLabel})` : "";

    return {
        isOpen: isOpenNow,
        openingTime: openLabel,
        closingTime: closeLabel,
        reason: isOpenNow ? "open" : "outside-hours",
        message: isOpenNow ? "Open" : `Restaurant is currently closed${hoursText}. Not accepting orders.`
    };
}

