"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import type { AdminSectionId } from "@/components/admin/admin-nav";
import { readJson } from "@/lib/read-json";

type OverviewPayload = {
  metrics: {
    activeListings: number;
    pendingListings: number;
    openCases: number;
    activeSellers: number;
    pendingChefs: number;
    newBuyers: number | null;
  };
  queues: {
    casesActionRequired: number;
    casesWaitingReporter: number;
    casesWaitingSeller: number;
    pendingListings: number;
    pendingChefs: number;
  };
  recentAudit: Array<{
    id: string;
    actorEmail: string;
    action: string;
    entityType: string;
    entityId: string;
    createdAt: string;
  }>;
};

export function MarketplaceOverviewPanel({ onOpen }: { onOpen: (section: AdminSectionId) => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch("/api/admin/marketplace/overview", { cache: "no-store" });
        const body = await readJson<OverviewPayload>(response);
        setData(body);
      })().catch((caught) => setError(caught instanceof Error ? caught.message : "error"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm leading-relaxed text-slate-600">{t("admin.cc.overviewBody")}</p>
        <p className="mt-3 text-sm text-slate-500">{t("admin.cc.overviewLegacyNote")}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label={t("admin.cc.overview.activeListings")} value={data.metrics.activeListings} />
            <Metric label={t("admin.cc.overview.pendingListings")} value={data.metrics.pendingListings} />
            <Metric label={t("admin.cc.overview.openCases")} value={data.metrics.openCases} />
            <Metric label={t("admin.cc.overview.activeSellers")} value={data.metrics.activeSellers} />
            <Metric label={t("admin.cc.overview.pendingChefs")} value={data.metrics.pendingChefs} />
            <Metric
              label={t("admin.cc.overview.newBuyers")}
              value={data.metrics.newBuyers}
              unavailableLabel={t("admin.cc.overview.unavailable")}
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700">{t("admin.cc.overview.queues")}</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              <QueueButton
                label={t("admin.cc.overview.queueActionRequired")}
                count={data.queues.casesActionRequired}
                onClick={() => onOpen("reports")}
              />
              <QueueButton
                label={t("admin.cc.overview.queueWaitingReporter")}
                count={data.queues.casesWaitingReporter}
                onClick={() => onOpen("reports")}
              />
              <QueueButton
                label={t("admin.cc.overview.queueWaitingSeller")}
                count={data.queues.casesWaitingSeller}
                onClick={() => onOpen("reports")}
              />
              <QueueButton
                label={t("admin.cc.overview.queuePendingListings")}
                count={data.queues.pendingListings}
                onClick={() => onOpen("listings")}
              />
              <QueueButton
                label={t("admin.cc.overview.queuePendingChefs")}
                count={data.queues.pendingChefs}
                onClick={() => onOpen("sellers")}
              />
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-700">{t("admin.cc.overview.recentAudit")}</h3>
            {data.recentAudit.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">{t("admin.cc.overview.noAudit")}</p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600">
                {data.recentAudit.map((row) => (
                  <li key={row.id}>
                    {new Date(row.createdAt).toLocaleString()} · {row.action} · {row.entityType}/{row.entityId} ·{" "}
                    {row.actorEmail}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">{t("admin.loading")}</p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  unavailableLabel,
}: {
  label: string;
  value: number | null;
  unavailableLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">
        {value === null ? unavailableLabel || "—" : value}
      </p>
    </div>
  );
}

function QueueButton({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-start text-sm font-medium text-slate-800 hover:border-[#7a1a28]/30"
        onClick={onClick}
      >
        <span>{label}</span>
        <span className="text-xs font-normal text-slate-500">{count}</span>
      </button>
    </li>
  );
}
