/** Prep times longer than this (in minutes) need admin approval. */
export const PREP_TIME_APPROVAL_THRESHOLD_MINUTES = 30;

/**
 * Highest minute value in a prep-time string such as "25-35 mins", "40 min" or "45".
 * Returns null when no number can be read (e.g. empty string).
 */
export function getPrepTimeMaxMinutes(value) {
    const nums = String(value ?? '').match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length === 0) return null;
    return Math.max(...nums.map(Number));
}

export function prepTimeNeedsApproval(value) {
    const max = getPrepTimeMaxMinutes(value);
    return max !== null && max > PREP_TIME_APPROVAL_THRESHOLD_MINUTES;
}
