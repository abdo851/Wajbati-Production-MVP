"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { primaryButtonClass, quietButtonClass } from "@/components/ui";
import type { ListingReportRecord, MarketplaceListingRecord } from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";

export function MarketplaceAdminPanel({ view = "all" }: { view?: "all" | "listings" | "reports" }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<MarketplaceListingRecord[]>([]);
  const [reports, setReports] = useState<ListingReportRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const showListings = view === "all" || view === "listings";
  const showReports = view === "all" || view === "reports";

  async function reload() {
    const response = await fetch("/api/admin/marketplace", { cache: "no-store" });
    const body = await readJson<{ pending: MarketplaceListingRecord[]; reports: ListingReportRecord[] }>(response);
    setPending(body.pending);
    setReports(body.reports);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload().catch((caught) => setError(caught instanceof Error ? caught.message : "error"));
    }, 0);
    return () => window.clearTimeout(timer);
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

  async function resolveReport(reportId: string, action: "resolve" | "dismiss") {
    setError(null);
    try {
      const response = await fetch("/api/admin/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action }),
      });
      await readJson(response);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {view === "all" ? <h2 className="text-lg font-semibold text-slate-900">{t("admin.marketTitle")}</h2> : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {showListings ? (
        <>
          <h3 className={`${view === "all" ? "mt-4" : ""} text-sm font-semibold text-slate-500`}>{t("admin.marketPending")}</h3>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("admin.marketEmpty")}</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {pending.map((listing) => (
                <li key={listing.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium text-slate-900">{listing.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{listing.city || "—"}</p>
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
        </>
      ) : null}
      {showReports ? (
        <>
          <h3 className={`${showListings ? "mt-6" : ""} text-sm font-semibold text-slate-500`}>{t("admin.marketReports")}</h3>
          {reports.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("admin.marketEmpty")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {reports.map((report) => (
                <li key={report.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">
                    {t("admin.marketReportListing")}: <span dir="ltr">{report.listingId}</span>
                  </p>
                  <p className="mt-1 text-slate-500">{report.reason}</p>
                  <p className="mt-1 text-xs text-slate-400" dir="ltr">
                    {report.reporterUserId} · {new Date(report.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className={primaryButtonClass} onClick={() => void resolveReport(report.id, "resolve")}>
                      {t("admin.marketReportResolve")}
                    </button>
                    <button type="button" className={quietButtonClass} onClick={() => void resolveReport(report.id, "dismiss")}>
                      {t("admin.marketReportDismiss")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
