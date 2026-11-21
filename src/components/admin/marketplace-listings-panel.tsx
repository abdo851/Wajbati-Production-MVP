"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import type { MarketplaceListingRecord } from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";

export function MarketplaceListingsPanel({ initialListingId }: { initialListingId?: string | null }) {
  const { t } = useI18n();
  const [listings, setListings] = useState<MarketplaceListingRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialListingId ?? null);
  const [selected, setSelected] = useState<MarketplaceListingRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [moderationStatus, setModerationStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (moderationStatus) params.set("moderationStatus", moderationStatus);
    const response = await fetch(`/api/admin/marketplace/listings?${params}`, { cache: "no-store" });
    const body = await readJson<{ listings: MarketplaceListingRecord[] }>(response);
    setListings(body.listings);
  }, [q, moderationStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((caught) => setError(caught instanceof Error ? caught.message : "error"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedId) {
        setSelected(null);
        return;
      }
      const found = listings.find((row) => row.id === selectedId);
      if (found) {
        setSelected(found);
        return;
      }
      void (async () => {
        const response = await fetch(`/api/admin/marketplace/listings/${selectedId}`, { cache: "no-store" });
        const body = await readJson<{ listing: MarketplaceListingRecord }>(response);
        setSelected(body.listing);
      })().catch((caught) => setError(caught instanceof Error ? caught.message : "error"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedId, listings]);

  async function moderate(action: "approve" | "reject" | "hide" | "restore") {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/marketplace/listings/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const body = await readJson<{ listing: MarketplaceListingRecord }>(response);
      setSelected(body.listing);
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">{t("admin.cc.listings.title")}</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("admin.cc.listings.search")}
          />
          <select
            className={inputClass}
            value={moderationStatus}
            onChange={(e) => setModerationStatus(e.target.value)}
          >
            <option value="">{t("admin.cc.listings.anyStatus")}</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="hidden">hidden</option>
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
          {listings.length === 0 ? (
            <li className="text-sm text-slate-500">{t("admin.cc.listings.empty")}</li>
          ) : (
            listings.map((listing) => (
              <li key={listing.id}>
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-start text-sm ${
                    selectedId === listing.id ? "border-[#7a1a28] bg-[#7a1a28]/5" : "border-slate-200"
                  }`}
                  onClick={() => setSelectedId(listing.id)}
                >
                  <p className="font-medium text-slate-900">{listing.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {listing.moderationStatus} · {listing.city || "—"} ·{" "}
                    {listing.isPublished ? "published" : "unpublished"}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        {!selected ? (
          <p className="text-sm text-slate-500">{t("admin.cc.listings.select")}</p>
        ) : (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">{selected.title}</h3>
            <p className="text-sm text-slate-600">{selected.description.slice(0, 280)}</p>
            <p className="text-xs text-slate-500">
              {selected.moderationStatus} · {selected.kind} · {selected.priceMode} · {selected.availability}
            </p>
            <p className="text-xs text-slate-400" dir="ltr">
              seller: {selected.sellerUserId}
            </p>
            {selected.moderationReason ? (
              <p className="text-sm text-amber-800">
                {t("admin.cc.listings.reason")}: {selected.moderationReason}
              </p>
            ) : null}
            {selected.previouslyApprovedAt ? (
              <p className="text-xs text-slate-500">
                {t("admin.cc.listings.previouslyApproved")}:{" "}
                {new Date(selected.previouslyApprovedAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-xs text-slate-500">{t("admin.cc.listings.neverApproved")}</p>
            )}
            <textarea
              className={`${inputClass} min-h-20`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("admin.cc.listings.reasonPlaceholder")}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={primaryButtonClass}
                onClick={() => void moderate("approve")}
              >
                {t("admin.marketApprove")}
              </button>
              <button type="button" disabled={busy} className={quietButtonClass} onClick={() => void moderate("reject")}>
                {t("admin.marketReject")}
              </button>
              <button type="button" disabled={busy} className={quietButtonClass} onClick={() => void moderate("hide")}>
                {t("admin.marketHide")}
              </button>
              <button type="button" disabled={busy} className={quietButtonClass} onClick={() => void moderate("restore")}>
                {t("admin.cc.listings.restore")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
