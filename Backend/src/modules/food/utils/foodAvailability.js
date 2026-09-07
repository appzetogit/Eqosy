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
