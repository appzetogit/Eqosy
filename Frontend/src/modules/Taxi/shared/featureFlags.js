/**
 * Master switch for the Taxi Rental end-to-end product surface.
 * Code-level only (not admin-panel configurable).
 *
 * When false:
 * - Admin "Rental" submenu is hidden
 * - User rental routes / home grid entry are disabled
 * - Service-center driver panel routes / login landing are disabled
 *
 * Kept for Pooling / Set Price: RentalVehicleType APIs, SetPrice package routes.
 * Flip to true to re-enable without hunting commented blocks.
 */
export const RENTAL_ENABLED = false

/**
 * Master switch for the Taxi Car Pooling end-to-end product surface.
 * Code-level only (not admin-panel configurable).
 *
 * When false:
 * - Admin "Car Pooling" submenu is hidden
 * - User pooling routes / home grid entry are disabled
 * - Activity "Pooling" tab and reminder sync are disabled
 * - Driver onboarding cannot select pooling as a service category
 *
 * Flip to true to re-enable without hunting commented blocks.
 */
export const POOLING_ENABLED = false
