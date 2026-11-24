/** Default maximum COD order amount (Rs) for every restaurant until it sets its own. */
export const DEFAULT_COD_MAX_ORDER_AMOUNT = 300;

/** The restaurant's COD ceiling in Rs; restaurants saved before this setting existed get the 300 default. */
export const getRestaurantCodMaxOrderAmount = (restaurant) => {
    const raw = restaurant?.codMaxOrderAmount;
    if (raw === null || raw === undefined || raw === '') return DEFAULT_COD_MAX_ORDER_AMOUNT;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COD_MAX_ORDER_AMOUNT;
};

/** COD is allowed only up to the restaurant's maximum; 0 means the restaurant takes no COD orders. */
export const isWithinRestaurantCodLimit = (restaurant, orderTotal) => {
    const max = getRestaurantCodMaxOrderAmount(restaurant);
    if (max <= 0) return false;
    return Number(orderTotal || 0) <= max;
};
