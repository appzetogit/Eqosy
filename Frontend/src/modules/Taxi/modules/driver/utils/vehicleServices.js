// Two-wheelers can only do Taxi (Ride) and Delivery. Outstation and Pooling are for 4-wheelers,
// and the driver chooses them himself.
const TWO_WHEELER_ICONS = ['bike', 'motorbike', 'motor_bike', 'cycle', 'scooter', 'electric_scooty', 'scooty'];
const TWO_WHEELER_NAME_PATTERN = /\b(bike|bikes|scooter|scooty|moped|cycle|2[\s-]?wheel(er)?s?|two[\s-]?wheel(er)?s?)\b/i;

export const isTwoWheelerVehicle = (vehicle = {}) => {
  const icon = String(vehicle?.icon_types || vehicle?.vehicleIconType || '').trim().toLowerCase();
  if (icon) {
    return TWO_WHEELER_ICONS.includes(icon);
  }
  return TWO_WHEELER_NAME_PATTERN.test(String(vehicle?.name || vehicle?.vehicleType || ''));
};

export const FOUR_WHEELER_ONLY_CATEGORIES = ['outstation', 'pooling'];

export const filterServiceCategoriesForVehicle = (categories = [], vehicle = null) => {
  if (!vehicle || !isTwoWheelerVehicle(vehicle)) return categories;
  return categories.filter((item) => !FOUR_WHEELER_ONLY_CATEGORIES.includes(item));
};
