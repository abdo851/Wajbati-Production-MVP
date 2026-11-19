/**
 * FROZEN / NOT OWNER-APPROVED as final production rules.
 * Do not treat these numbers as business truth. Wallet deductions and delivery-fee
 * application must go through src/lib/financial-rules.ts (currently fail-closed).
 */
export const PLATFORM_COMMISSION_MAD = 3;

/** FROZEN — not an owner-approved separate delivery fee. */
export const DELIVERY_FEE_MAD = 15;

/** FROZEN — not an owner-approved driver commission constant. */
export const DRIVER_COMMISSION_MAD = 3;

export const SERVICE_CITIES = ["Casablanca", "Rabat", "Marrakech"] as const;

export const SESSION_COOKIE = "wajbati_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 48;
