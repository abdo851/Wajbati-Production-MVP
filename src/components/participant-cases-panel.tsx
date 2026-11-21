"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import type { ListingReportRecord, ModerationCaseMessageRecord } from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";

type ParticipantDetail = {
  case: ListingReportRecord;
  listing: { id: string; title: string; city: string; moderationStatus: string } | null;
  role: "reporter" | "seller";
  messages: ModerationCaseMessageRecord[];
};

export function ParticipantCasesPanel() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const initialCaseId = searchParams.get("caseId");
  const [cases, setCases] = useState<ListingReportRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialCaseId);
  const [detail, setDetail] = useState<ParticipantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCases = useCallback(async () => {
    const response = await fetch("/api/account/moderation-cases", { cache: "no-store" });
    const payload = await readJson<{ cases: ListingReportRecord[] }>(response);
    setCases(payload.cases);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/account/moderation-cases/${id}`, { cache: "no-store" });
    const payload = await readJson<ParticipantDetail>(response);
    setDetail(payload);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCases().catch((caught) => setError(caught instanceof Error ? caught.message : "error"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCases]);

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

  async function sendReply() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/account/moderation-cases/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      await readJson(response);
      setBody("");
      await loadDetail(selectedId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display text-2xl text-slate-900">{t("account.cases.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("account.cases.subtitle")}</p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">{t("account.cases.list")}</h2>
          <ul className="mt-3 space-y-2">
            {cases.length === 0 ? (
              <li className="text-sm text-slate-500">{t("account.cases.empty")}</li>
            ) : (
              cases.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-start text-sm ${
                      selectedId === row.id ? "border-[#7a1a28] bg-[#7a1a28]/5" : "border-slate-200"
                    }`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <p className="font-medium text-slate-900">{row.reason}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.status} · {row.category}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button type="button" className={`${quietButtonClass} mt-3`} onClick={() => void loadCases()}>
            {t("admin.refresh")}
          </button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          {!detail ? (
            <p className="text-sm text-slate-500">{t("account.cases.select")}</p>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {detail.listing?.title || detail.case.listingId}
              </h2>
              <p className="text-sm text-slate-600">
                {t("account.cases.role")}: {detail.role} · {detail.case.status}
              </p>
              <p className="text-sm text-slate-700">{detail.case.reason}</p>
              {detail.case.description ? (
                <p className="text-sm text-slate-500">{detail.case.description}</p>
              ) : null}
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {detail.messages.length === 0 ? (
                  <li className="text-xs text-slate-400">{t("account.cases.noMessages")}</li>
                ) : (
                  detail.messages.map((message) => (
                    <li key={message.id} className="rounded border border-slate-100 p-2 text-sm">
                      <p className="text-xs text-slate-400">
                        {message.senderRole} · {new Date(message.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-1 text-slate-800">{message.body}</p>
                    </li>
                  ))
                )}
              </ul>
              <textarea
                className={`${inputClass} min-h-20`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("account.cases.replyPlaceholder")}
              />
              <button type="button" disabled={busy} className={primaryButtonClass} onClick={() => void sendReply()}>
                {t("account.cases.sendReply")}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
