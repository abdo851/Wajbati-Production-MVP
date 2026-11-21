"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { LanguageMenu, useI18n } from "@/components/language";
import {
  ADMIN_NAV_ITEMS,
  type AdminNavGroup,
  type AdminSectionId,
} from "@/components/admin/admin-nav";
import { adminQuietButtonClass } from "@/components/admin/admin-chrome";

type AdminShellProps = {
  section: AdminSectionId;
  onSectionChange: (section: AdminSectionId) => void;
  adminName: string;
  onLogout: () => void;
  onRefresh: () => void;
  reconnecting?: boolean;
  children: ReactNode;
};

function NavButton({
  active,
  label,
  soon,
  legacy,
  onClick,
}: {
  active: boolean;
  label: string;
  soon?: boolean;
  legacy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm transition",
        active
          ? legacy
            ? "bg-amber-100/80 font-semibold text-amber-950"
            : "bg-[#7a1a28]/10 font-semibold text-[#5c121c]"
          : legacy
            ? "text-slate-600 hover:bg-amber-50/70"
            : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      {soon ? (
        <span className="shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          ···
        </span>
      ) : null}
    </button>
  );
}

function NavGroup({
  group,
  section,
  onSelect,
  title,
  hint,
}: {
  group: AdminNavGroup;
  section: AdminSectionId;
  onSelect: (id: AdminSectionId) => void;
  title: string;
  hint?: string;
}) {
  const { t } = useI18n();
  const items = ADMIN_NAV_ITEMS.filter((item) => item.group === group);
  const legacy = group === "legacy";

  return (
    <div className={legacy ? "mt-6 rounded-xl border border-amber-200/80 bg-amber-50/40 p-2" : "mt-2"}>
      <div className="px-2 pb-2 pt-1">
        <p
          className={[
            "text-[11px] font-semibold uppercase tracking-[0.14em]",
            legacy ? "text-amber-800/80" : "text-slate-400",
          ].join(" ")}
        >
          {title}
        </p>
        {hint ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <NavButton
              active={section === item.id}
              label={t(item.labelKey)}
              soon={item.status === "soon"}
              legacy={legacy}
              onClick={() => onSelect(item.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SidebarBody({
  section,
  onSelect,
  adminName,
  onLogout,
  onRefresh,
  reconnecting,
}: {
  section: AdminSectionId;
  onSelect: (id: AdminSectionId) => void;
  adminName: string;
  onLogout: () => void;
  onRefresh: () => void;
  reconnecting?: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7a1a28]">{t("admin.cc.brand")}</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{t("admin.cc.title")}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{adminName}</p>
        {reconnecting ? <p className="mt-2 text-xs text-amber-700">{t("live.reconnecting")}</p> : null}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={t("admin.cc.navLabel")}>
        <NavGroup
          group="marketplace"
          section={section}
          onSelect={onSelect}
          title={t("admin.cc.group.marketplace")}
        />
        <NavGroup
          group="legacy"
          section={section}
          onSelect={onSelect}
          title={t("admin.cc.group.legacy")}
          hint={t("admin.cc.group.legacyHint")}
        />
      </nav>

      <div className="space-y-2 border-t border-slate-200 p-3">
        <div className="px-1">
          <LanguageMenu />
        </div>
        <button type="button" className={`${adminQuietButtonClass} w-full`} onClick={onRefresh}>
          {t("admin.refresh")}
        </button>
        <button type="button" className={`${adminQuietButtonClass} w-full`} onClick={onLogout}>
          {t("menu.signOut")}
        </button>
      </div>
    </div>
  );
}

export function AdminShell({
  section,
  onSectionChange,
  adminName,
  onLogout,
  onRefresh,
  reconnecting,
  children,
}: AdminShellProps) {
  const { t, dir } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  function select(id: AdminSectionId) {
    setMobileOpen(false);
    onSectionChange(id);
  }

  return (
    <div className="min-h-dvh bg-[#f3f4f6] text-slate-900">
      {/* Desktop sidebar */}
      <aside
        className={[
          "fixed inset-y-0 z-40 hidden w-72 border-slate-200 bg-white lg:flex lg:flex-col",
          dir === "rtl" ? "right-0 border-l" : "left-0 border-r",
        ].join(" ")}
      >
        <SidebarBody
          section={section}
          onSelect={select}
          adminName={adminName}
          onLogout={onLogout}
          onRefresh={onRefresh}
          reconnecting={reconnecting}
        />
      </aside>

      {/* Mobile top bar */}
      <div
        className={[
          "sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden",
          "pt-[max(0.75rem,env(safe-area-inset-top))]",
        ].join(" ")}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{t("admin.cc.title")}</p>
          <p className="truncate text-xs text-slate-500">{t("admin.cc.brand")}</p>
        </div>
        <button
          type="button"
          className={adminQuietButtonClass}
          aria-expanded={mobileOpen}
          aria-controls={titleId}
          onClick={() => setMobileOpen(true)}
        >
          {t("admin.cc.menu")}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label={t("admin.cc.closeMenu")}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            id={titleId}
            className={[
              "absolute inset-y-0 flex w-[min(20rem,88vw)] flex-col bg-white shadow-xl",
              dir === "rtl" ? "right-0" : "left-0",
            ].join(" ")}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{t("admin.cc.menu")}</p>
              <button type="button" className={adminQuietButtonClass} onClick={() => setMobileOpen(false)}>
                {t("admin.cc.closeMenu")}
              </button>
            </div>
            <SidebarBody
              section={section}
              onSelect={select}
              adminName={adminName}
              onLogout={onLogout}
              onRefresh={onRefresh}
              reconnecting={reconnecting}
            />
          </aside>
        </div>
      ) : null}

      <div className="lg:ms-72">
        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
