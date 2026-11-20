"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { primaryButtonClass, quietButtonClass } from "@/components/ui";
import type { ListingReportRecord, MarketplaceListingRecord } from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";

export function MarketplaceAdminPanel() {
  const { t } = useI18n();
  const [pending, setPending] = useState<MarketplaceListingRecord[]>([]);
  const [reports, setReports] = useState<ListingReportRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const response = await fetch("/api/admin/marketplace", { cache: "no-store" });
    const body = await readJson<{ pending: MarketplaceListingRecord[]; reports: ListingReportRecord[] }>(response);
    setPending(body.pending);
    setReports(body.reports);
  }

  useEffect(() => {
    void reload().catch((caught) => setError(caught instanceof Error ? caught.message : "error"));
  }, []);

  async function moderate(listingId: string, action: "approve" | "hide" | "reject") {
    setError(null);
    try {
      const response = await fetch("/api/admin/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, action }),
      });
      await readJson(response);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-line bg-card p-5">
      <h2 className="font-display text-2xl">{t("admin.marketTitle")}</h2>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-terracotta-deep">
          {error}
        </p>
      ) : null}
      <h3 className="mt-4 text-sm font-semibold text-muted">{t("admin.marketPending")}</h3>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("admin.marketEmpty")}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {pending.map((listing) => (
            <li key={listing.id} className="rounded-2xl border border-line p-3">
              <p className="font-medium">{listing.title}</p>
              <p className="mt-1 text-xs text-muted">{listing.city || "—"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={primaryButtonClass} onClick={() => void moderate(listing.id, "approve")}>
                  {t("admin.marketApprove")}
                </button>
                <button type="button" className={quietButtonClass} onClick={() => void moderate(listing.id, "hide")}>
                  {t("admin.marketHide")}
                </button>
                <button type="button" className={quietButtonClass} onClick={() => void moderate(listing.id, "reject")}>
                  {t("admin.marketReject")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-6 text-sm font-semibold text-muted">{t("admin.marketReports")}</h3>
      {reports.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t("admin.marketEmpty")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {reports.map((report) => (
            <li key={report.id} className="rounded-2xl border border-line p-3 text-sm">
              <p className="font-medium">{report.listingId}</p>
              <p className="mt-1 text-muted">{report.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
