import type { AuthUser } from "@/lib/types";

/** The only account allowed to open the desk. The password stays in the local seed. */
export const SUPER_ADMIN_EMAIL = "admin@wajbati.ma";

export function isSuperAdmin(user: Pick<AuthUser, "email" | "role"> | null | undefined): boolean {
  return Boolean(user && user.role === "admin" && user.email.toLowerCase() === SUPER_ADMIN_EMAIL);
}
