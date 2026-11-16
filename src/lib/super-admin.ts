import type { AuthUser } from "@/lib/types";

/** Accounts allowed to open the desk. Override with WAJBATI_ADMIN_EMAIL. Both the current and the legacy admin emails work during the credential transition. */
const SUPER_ADMIN_EMAILS = [
  process.env.WAJBATI_ADMIN_EMAIL,
  "abderrahimallali92@gmail.com",
  "admin@wajbati.ma",
]
  .filter((email): email is string => Boolean(email))
  .map((email) => email.toLowerCase());

export const SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0];

export function isSuperAdmin(user: Pick<AuthUser, "email" | "role"> | null | undefined): boolean {
  return Boolean(user && user.role === "admin" && SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase()));
}
