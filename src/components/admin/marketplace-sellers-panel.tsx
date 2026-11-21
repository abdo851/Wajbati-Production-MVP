"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import type { ListingReportRecord, MarketplaceListingRecord } from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";

type SellerRow = {
  id: string;
  fullName: string;
  email: string;
  approvalStatus: string;
  isActive: boolean;
  kitchenName: string;
  city: string;
  chefProfileId: string | null;
  listingCounts: Array<{ status: string; count: number }>;
};

type SellerDetail = {
  seller: SellerRow & {
    bio: string | null;
    hasCin: boolean;
    hasAutoEntrepreneur: boolean;
    gallery: string[];
    averageRating: number;
  };
  listings: Array<MarketplaceListingRecord | null>;
  reports: ListingReportRecord[];
};

export function MarketplaceSellersPanel({ initialSellerId }: { initialSellerId?: string | null }) {
  const { t } = useI18n();
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSellerId ?? null);
  const [detail, setDetail] = useState<SellerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    const response = await fetch(`/api/admin/marketplace/sellers?${params}`, { cache: "no-store" });
    const body = await readJson<{ sellers: SellerRow[] }>(response);
    setSellers(body.sellers);
  }, [q, status]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/admin/marketplace/sellers/${id}`, { cache: "no-store" });
    const body = await readJson<SellerDetail>(response);
    setDetail(body);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((caught) => setError(caught instanceof Error ? caught.message : "error"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedId) {
        setDetail(null);
        return;
      }
      void loadDetail(selectedId).catch((caught) => setError(caught instanceof Error ? caught.message : "error"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, loadDetail]);

  async function setActive(action: "suspend" | "reactivate") {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/marketplace/sellers/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const body = await readJson<SellerDetail>(response);
      setDetail(body);
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">{t("admin.cc.sellers.title")}</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className={inputClass}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("admin.cc.sellers.search")}
            />
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("admin.cc.sellers.anyStatus")}</option>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
              <option value="suspended">suspended</option>
            </select>
          </div>
          <button type="button" className={`${quietButtonClass} mt-3`} onClick={() => void load()}>
            {t("admin.refresh")}
          </button>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <ul className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto">
            {sellers.length === 0 ? (
              <li className="text-sm text-slate-500">{t("admin.cc.sellers.empty")}</li>
            ) : (
              sellers.map((seller) => (
                <li key={seller.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-start text-sm ${
                      selectedId === seller.id ? "border-[#7a1a28] bg-[#7a1a28]/5" : "border-slate-200"
                    }`}
                    onClick={() => setSelectedId(seller.id)}
                  >
                    <p className="font-medium text-slate-900">{seller.kitchenName || seller.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {seller.approvalStatus} · {seller.isActive ? "active" : "suspended"} · {seller.city || "—"}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          {!detail ? (
            <p className="text-sm text-slate-500">{t("admin.cc.sellers.select")}</p>
          ) : (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">
                {detail.seller.kitchenName || detail.seller.fullName}
              </h3>
              <p className="text-sm text-slate-600">{detail.seller.email}</p>
              <p className="text-xs text-slate-500">
                {detail.seller.approvalStatus} · {detail.seller.isActive ? "active" : "suspended"} ·{" "}
                {detail.seller.city || "—"}
              </p>
              <p className="text-xs text-slate-500">
                {t("admin.cc.sellers.docs")}: CIN {detail.seller.hasCin ? "✓" : "—"} · AE{" "}
                {detail.seller.hasAutoEntrepreneur ? "✓" : "—"}
              </p>
              <p className="text-sm text-slate-600">
                {t("admin.cc.sellers.listings")}: {detail.listings.filter(Boolean).length} ·{" "}
                {t("admin.cc.sellers.reports")}: {detail.reports.length}
              </p>
              <textarea
                className={`${inputClass} min-h-20`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("admin.cc.sellers.reasonPlaceholder")}
              />
              <div className="flex flex-wrap gap-2">
                {detail.seller.isActive ? (
                  <button
                    type="button"
                    disabled={busy}
                    className={primaryButtonClass}
                    onClick={() => void setActive("suspend")}
                  >
                    {t("admin.cc.sellers.suspend")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    className={primaryButtonClass}
                    onClick={() => void setActive("reactivate")}
                  >
                    {t("admin.cc.sellers.reactivate")}
                  </button>
                )}
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                {detail.listings.filter(Boolean).map((listing) =>
                  listing ? (
                    <li key={listing.id}>
                      {listing.title} · {listing.moderationStatus}
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
