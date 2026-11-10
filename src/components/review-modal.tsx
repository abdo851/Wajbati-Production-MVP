"use client";

import { useState } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { formatMad } from "@/lib/format";
import { readJson } from "@/lib/read-json";

export type ReviewView = {
  name: string;
  phone: string;
  city: string;
  bio: string;
  ownerId: string;
  balanceMad: number;
  documents: Array<{ id: string; kind: string; href: string }>;
  signatureUrl?: string | null;
};

export function ReviewModal({
  view,
  busy,
  onClose,
  onAccept,
  onReject,
  onPostpone,
  onBalance,
}: {
  view: ReviewView;
  busy: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onPostpone: () => void;
  onBalance: (balanceMad: number) => void;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(view.balanceMad);
  const [editing, setEditing] = useState(false);

  async function adjust(direction: 1 | -1) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setError(null);
    try {
      const response = await fetch("/api/admin/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: view.ownerId, amountMad: direction * value }),
      });
      const payload = await readJson<{ wallet: { balanceMad: number } }>(response);
      setBalance(payload.wallet.balanceMad);
      onBalance(payload.wallet.balanceMad);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("wallet.failed"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E1A15]/50 px-4 py-6" role="dialog" aria-modal="true">
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-3xl border border-line bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-3xl">{t("admin.review")}</h2>
          <button type="button" className="inline-flex size-11 items-center justify-center rounded-lg text-xl" onClick={onClose} aria-label={t("order.close")}>×</button>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">{t("order.name")}</dt><dd className="font-medium">{view.name}</dd></div>
          <div><dt className="text-muted">{t("order.phone")}</dt><dd className="font-medium">{view.phone || "—"}</dd></div>
          <div><dt className="text-muted">{t("chef.city")}</dt><dd className="font-medium">{view.city}</dd></div>
          <div>
            <dt className="text-muted">{t("wallet.balance")}</dt>
            <dd className="flex items-center gap-2 font-medium">
              {formatMad(balance)}
              <button type="button" className="inline-flex size-9 items-center justify-center rounded-lg border border-line" aria-label={t("wallet.edit")} onClick={() => setEditing((open) => !open)}>
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 20h4l10-10-4-4L4 16v4z" />
                  <path d="M13 7l4 4" />
                </svg>
              </button>
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-7">{view.bio || "—"}</p>
        {view.signatureUrl ? (
          <div className="mt-4">
            <p className="text-sm font-medium">{t("admin.signature")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.signatureUrl} alt={t("admin.signature")} className="mt-2 h-32 max-w-full rounded-2xl border border-line bg-white object-contain p-2" />
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {view.documents.length === 0 ? <p className="text-sm text-muted">{t("admin.documentsMissing")}</p> : null}
          {view.documents.map((document) => (
            <a key={document.id} href={document.href} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={document.href} alt={document.kind} className="h-56 w-full rounded-2xl object-cover" />
              <span className="mt-1 block text-xs text-muted">{document.kind.replaceAll("_", " ")}</span>
            </a>
          ))}
        </div>
        {editing ? <div className="mt-5 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t("wallet.amount")}</span>
            <input className={`${inputClass} w-28`} type="number" min={1} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <button type="button" className={quietButtonClass} onClick={() => void adjust(1)}>{t("wallet.add")}</button>
          <button type="button" className={quietButtonClass} onClick={() => void adjust(-1)}>{t("wallet.subtract")}</button>
        </div> : null}
        {error ? <p className="mt-2 text-sm text-terracotta-deep">{error}</p> : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={onAccept}>{t("admin.approve")}</button>
          <button type="button" className={quietButtonClass} disabled={busy} onClick={onReject}>{t("admin.reject")}</button>
          <button type="button" className={quietButtonClass} disabled={busy} onClick={onPostpone}>{t("admin.postpone")}</button>
        </div>
      </div>
    </div>
  );
}
