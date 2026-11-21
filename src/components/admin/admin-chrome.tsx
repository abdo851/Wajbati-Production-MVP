"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/language";
import type { MessageKey } from "@/lib/i18n";
import { getAdminNavItem, type AdminSectionId } from "@/components/admin/admin-nav";

export const adminSurfaceClass =
  "rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export const adminQuietButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export const adminPrimaryButtonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-[#7a1a28] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#631520] disabled:cursor-not-allowed disabled:opacity-50";

export function AdminPageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl ${className}`}>{children}</div>;
}

export function AdminSectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function AdminBreadcrumbs({ section }: { section: AdminSectionId }) {
  const { t } = useI18n();
  const item = getAdminNavItem(section);
  const groupLabel =
    item.group === "legacy" ? t("admin.cc.group.legacy") : t("admin.cc.group.marketplace");

  return (
    <nav aria-label={t("admin.cc.breadcrumbs")} className="text-xs text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>{t("admin.cc.brand")}</li>
        <li aria-hidden="true" className="text-slate-300">
          /
        </li>
        <li>{groupLabel}</li>
        <li aria-hidden="true" className="text-slate-300">
          /
        </li>
        <li className="font-medium text-slate-700">{t(item.labelKey)}</li>
      </ol>
    </nav>
  );
}

export function AdminPageHeader({
  section,
  subtitle,
  actions,
}: {
  section: AdminSectionId;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const item = getAdminNavItem(section);

  return (
    <header className="mb-6 border-b border-slate-200 pb-4">
      <AdminBreadcrumbs section={section} />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
            {item.group === "legacy" ? t("admin.cc.group.legacy") : t("admin.cc.group.marketplace")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{t(item.labelKey)}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function AdminStateBlock({
  tone,
  title,
  body,
}: {
  tone: "loading" | "empty" | "error" | "soon";
  title: string;
  body?: string;
}) {
  const toneClass =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "soon"
        ? "border-slate-200 bg-slate-50 text-slate-700"
        : "border-slate-200 bg-white text-slate-600";

  return (
    <div className={`rounded-xl border px-4 py-8 text-center ${toneClass}`} role={tone === "error" ? "alert" : undefined}>
      <p className="text-sm font-semibold">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm opacity-90">{body}</p> : null}
    </div>
  );
}

export function AdminComingSoon({ descriptionKey }: { descriptionKey?: MessageKey }) {
  const { t } = useI18n();
  return (
    <AdminStateBlock
      tone="soon"
      title={t("admin.cc.soonTitle")}
      body={descriptionKey ? t(descriptionKey) : t("admin.cc.soonBody")}
    />
  );
}
