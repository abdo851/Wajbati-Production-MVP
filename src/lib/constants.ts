/** Platform fee taken on every portion sold. Stored on the order at checkout. */
export const PLATFORM_COMMISSION_MAD = 3;

/** Flat fee for one delivery trip. The driver keeps this minus the trip commission. */
export const DELIVERY_FEE_MAD = 15;

/** Platform fee taken on every completed delivery trip. */
export const DRIVER_COMMISSION_MAD = 3;

export const SERVICE_CITIES = ["Casablanca", "Rabat", "Marrakech"] as const;

export const SESSION_COOKIE = "wajbati_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 48;
