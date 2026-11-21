"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { REPORT_CATEGORIES, CASE_PRIORITIES, CASE_STATUSES } from "@/lib/marketplace/case-rules";
import type {
  ListingReportRecord,
  ModerationCaseEventRecord,
  ModerationCaseMessageRecord,
  ModerationCaseNoteRecord,
} from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";

type CaseRow = ListingReportRecord & {
  listingTitle?: string | null;
  sellerUserId?: string | null;
  kitchenName?: string | null;
};

type CaseDetail = {
  case: ListingReportRecord;
  listing: { id: string; title: string; sellerUserId: string } | null;
  seller: { id: string; fullName: string; email: string; kitchenName: string | null } | null;
  reporter: { id: string; fullName: string | null; email: string | null };
  notes: ModerationCaseNoteRecord[];
  events: ModerationCaseEventRecord[];
  messages: ModerationCaseMessageRecord[];
  evidence: { available: boolean; note: string };
};

export function MarketplaceCasesPanel({ initialCaseId }: { initialCaseId?: string | null }) {
  const { t } = useI18n();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialCaseId ?? null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageTo, setMessageTo] = useState<"reporter" | "seller">("reporter");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionType, setDecisionType] = useState("resolved_with_action");

  const loadCases = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (category) params.set("category", category);
    const response = await fetch(`/api/admin/marketplace/cases?${params}`, { cache: "no-store" });
    const body = await readJson<{ cases: CaseRow[] }>(response);
    setCases(body.cases);
  }, [q, status, priority, category]);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/admin/marketplace/cases/${id}`, { cache: "no-store" });
    const body = await readJson<CaseDetail>(response);
    setDetail(body);
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

  async function mutate(action: string, extra: Record<string, unknown> = {}) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/marketplace/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: selectedId, action, ...extra }),
      });
      await readJson(response);
      await Promise.all([loadCases(), loadDetail(selectedId)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitNote() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/marketplace/cases/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody }),
      });
      await readJson(response);
      setNoteBody("");
      await loadDetail(selectedId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/marketplace/cases/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: messageBody, recipient: messageTo }),
      });
      await readJson(response);
      setMessageBody("");
      await loadDetail(selectedId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">{t("admin.cc.cases.title")}</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            className={inputClass}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("admin.cc.cases.search")}
          />
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("admin.cc.cases.anyStatus")}</option>
            {CASE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">{t("admin.cc.cases.anyPriority")}</option>
            {CASE_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("admin.cc.cases.anyCategory")}</option>
            {REPORT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={`${quietButtonClass} mt-3`} onClick={() => void loadCases()}>
          {t("admin.refresh")}
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <ul className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto">
          {cases.length === 0 ? (
            <li className="text-sm text-slate-500">{t("admin.cc.cases.empty")}</li>
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
                  <p className="font-medium text-slate-900">{row.listingTitle || row.listingId}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.status} · {row.category} · {row.priority}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{row.reason}</p>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        {!detail ? (
          <p className="text-sm text-slate-500">{t("admin.cc.cases.select")}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {detail.listing?.title || detail.case.listingId}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {t("admin.cc.cases.status")}: {detail.case.status} · {detail.case.category} · {detail.case.priority}
              </p>
              <p className="mt-2 text-sm text-slate-700">{detail.case.reason}</p>
              {detail.case.description ? (
                <p className="mt-1 text-sm text-slate-500">{detail.case.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-400">
                {t("admin.cc.cases.reporter")}: {detail.reporter.fullName || detail.reporter.email || detail.reporter.id}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {t("admin.cc.cases.seller")}:{" "}
                {detail.seller?.kitchenName || detail.seller?.fullName || detail.seller?.id || "—"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {t("admin.cc.cases.assigned")}: {detail.case.assignedAdminId || t("admin.cc.cases.unassigned")}
              </p>
              <p className="mt-2 text-xs text-slate-500">{detail.evidence.note}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={quietButtonClass} onClick={() => void mutate("assign")}>
                {t("admin.cc.cases.assignMe")}
              </button>
              <button
                type="button"
                disabled={busy}
                className={quietButtonClass}
                onClick={() => void mutate("start_review")}
              >
                {t("admin.cc.cases.startReview")}
              </button>
              <button
                type="button"
                disabled={busy}
                className={quietButtonClass}
                onClick={() => void mutate("wait_reporter")}
              >
                {t("admin.cc.cases.waitReporter")}
              </button>
              <button
                type="button"
                disabled={busy}
                className={quietButtonClass}
                onClick={() => void mutate("wait_seller")}
              >
                {t("admin.cc.cases.waitSeller")}
              </button>
              <button
                type="button"
                disabled={busy}
                className={quietButtonClass}
                onClick={() => void mutate("mark_action_required")}
              >
                {t("admin.cc.cases.actionRequired")}
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-800">{t("admin.cc.cases.decision")}</p>
              <select
                className={`${inputClass} mt-2`}
                value={decisionType}
                onChange={(e) => setDecisionType(e.target.value)}
              >
                <option value="resolved_with_action">resolved_with_action</option>
                <option value="no_violation">no_violation</option>
                <option value="insufficient_evidence">insufficient_evidence</option>
                <option value="duplicate">duplicate</option>
              </select>
              <textarea
                className={`${inputClass} mt-2 min-h-20`}
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                placeholder={t("admin.cc.cases.decisionReason")}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className={primaryButtonClass}
                  onClick={() => void mutate("resolve", { reason: decisionReason, decisionType })}
                >
                  {t("admin.cc.cases.resolve")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={quietButtonClass}
                  onClick={() => void mutate("dismiss", { reason: decisionReason, decisionType })}
                >
                  {t("admin.cc.cases.dismiss")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={quietButtonClass}
                  onClick={() => void mutate("reopen", { reason: decisionReason })}
                >
                  {t("admin.cc.cases.reopen")}
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-700">{t("admin.cc.cases.timeline")}</h4>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                {detail.events.map((event) => (
                  <li key={event.id}>
                    {new Date(event.createdAt).toLocaleString()} · {event.eventType}: {event.summary}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-700">{t("admin.cc.cases.notes")}</h4>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-sm text-slate-600">
                {detail.notes.length === 0 ? (
                  <li className="text-xs text-slate-400">{t("admin.cc.cases.noNotes")}</li>
                ) : (
                  detail.notes.map((note) => (
                    <li key={note.id} className="rounded border border-slate-100 p-2">
                      {note.body}
                    </li>
                  ))
                )}
              </ul>
              <textarea
                className={`${inputClass} mt-2 min-h-16`}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder={t("admin.cc.cases.notePlaceholder")}
              />
              <button type="button" disabled={busy} className={`${quietButtonClass} mt-2`} onClick={() => void submitNote()}>
                {t("admin.cc.cases.addNote")}
              </button>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-700">{t("admin.cc.cases.thread")}</h4>
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
                {detail.messages.length === 0 ? (
                  <li className="text-xs text-slate-400">{t("admin.cc.cases.noMessages")}</li>
                ) : (
                  detail.messages.map((message) => (
                    <li key={message.id} className="rounded border border-slate-100 p-2">
                      <p className="text-xs text-slate-400">
                        {message.senderRole} · {new Date(message.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-1 text-slate-800">{message.body}</p>
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  className={inputClass}
                  value={messageTo}
                  onChange={(e) => setMessageTo(e.target.value as "reporter" | "seller")}
                >
                  <option value="reporter">{t("admin.cc.cases.toReporter")}</option>
                  <option value="seller">{t("admin.cc.cases.toSeller")}</option>
                </select>
              </div>
              <textarea
                className={`${inputClass} mt-2 min-h-16`}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder={t("admin.cc.cases.messagePlaceholder")}
              />
              <button
                type="button"
                disabled={busy}
                className={`${primaryButtonClass} mt-2`}
                onClick={() => void submitMessage()}
              >
                {t("admin.cc.cases.sendMessage")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
