import type { MessageKey } from "@/lib/i18n";

export type AdminSectionId =
  | "overview"
  | "buyers"
  | "sellers"
  | "listings"
  | "reports"
  | "categories"
  | "conversations"
  | "notifications"
  | "audit"
  | "content"
  | "settings"
  | "legacy-orders"
  | "legacy-drivers"
  | "legacy-history"
  | "legacy-messages"
  | "legacy-emails"
  | "legacy-users";

export type AdminNavGroup = "marketplace" | "legacy";

export type AdminNavItem = {
  id: AdminSectionId;
  labelKey: MessageKey;
  group: AdminNavGroup;
  /** ready = existing UI wired; soon = placeholder only */
  status: "ready" | "soon";
};

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { id: "overview", labelKey: "admin.cc.nav.overview", group: "marketplace", status: "ready" },
  { id: "buyers", labelKey: "admin.cc.nav.buyers", group: "marketplace", status: "soon" },
  { id: "sellers", labelKey: "admin.cc.nav.sellers", group: "marketplace", status: "ready" },
  { id: "listings", labelKey: "admin.cc.nav.listings", group: "marketplace", status: "ready" },
  { id: "reports", labelKey: "admin.cc.nav.reports", group: "marketplace", status: "ready" },
  { id: "categories", labelKey: "admin.cc.nav.categories", group: "marketplace", status: "soon" },
  { id: "conversations", labelKey: "admin.cc.nav.conversations", group: "marketplace", status: "soon" },
  { id: "notifications", labelKey: "admin.cc.nav.notifications", group: "marketplace", status: "soon" },
  { id: "audit", labelKey: "admin.cc.nav.audit", group: "marketplace", status: "soon" },
  { id: "content", labelKey: "admin.cc.nav.content", group: "marketplace", status: "soon" },
  { id: "settings", labelKey: "admin.cc.nav.settings", group: "marketplace", status: "ready" },
  { id: "legacy-orders", labelKey: "admin.cc.nav.legacyOrders", group: "legacy", status: "ready" },
  { id: "legacy-drivers", labelKey: "admin.cc.nav.legacyDrivers", group: "legacy", status: "ready" },
  { id: "legacy-history", labelKey: "admin.cc.nav.legacyHistory", group: "legacy", status: "ready" },
  { id: "legacy-messages", labelKey: "admin.cc.nav.legacyMessages", group: "legacy", status: "ready" },
  { id: "legacy-emails", labelKey: "admin.cc.nav.legacyEmails", group: "legacy", status: "ready" },
  { id: "legacy-users", labelKey: "admin.cc.nav.legacyUsers", group: "legacy", status: "ready" },
] as const;

export const DEFAULT_ADMIN_SECTION: AdminSectionId = "overview";

export function isAdminSectionId(value: string | null | undefined): value is AdminSectionId {
  return ADMIN_NAV_ITEMS.some((item) => item.id === value);
}

export function getAdminNavItem(id: AdminSectionId): AdminNavItem {
  const item = ADMIN_NAV_ITEMS.find((entry) => entry.id === id);
  if (!item) return ADMIN_NAV_ITEMS[0];
  return item;
}
