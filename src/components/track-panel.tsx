"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { StatusPill } from "@/components/ui";
import { formatMad, formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { OrderTracking } from "@/lib/types";

export function TrackPanel({ token }: { token: string }) {
  const { t, lang } = useI18n();
  const [order, setOrder] = useState<OrderTracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch(`/api/track/${token}`, { cache: "no-store" })
        .then((response) => readJson<{ order: OrderTracking }>(response))
        .then((body) => setOrder(body.order))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("track.missing")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [t, token]);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:px-6">
      <p className="text-base font-medium text-olive">{t("track.kicker")}</p>
      <h1 className="mt-2 font-display text-4xl">{t("track.title")}</h1>
      {error ? <p className="mt-6 text-base text-terracotta-deep">{error}</p> : null}
      {!order && !error ? <p className="mt-6 text-base text-muted">{t("track.loading")}</p> : null}
      {order ? (
        <section className="lift-card mt-6 space-y-4 rounded-3xl border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base text-muted">{order.kitchenName}</p>
              <p className="font-display text-3xl">
                {order.quantity} × {order.mealTitle}
              </p>
            </div>
            <StatusPill status={order.status} />
          </div>
          <p className="text-base text-muted">{order.deliveryAddress}</p>
          <p className="text-base">
            {t("order.payLine", {
              meal: formatMad(order.totalMad, lang),
              delivery: formatMad(order.deliveryFeeMad, lang),
              total: formatMad(order.totalMad + order.deliveryFeeMad, lang),
            })}
          </p>
          {order.customerNotes ? <p className="text-base">{order.customerNotes}</p> : null}
          <div className="rounded-3xl bg-background px-4 py-5 text-center">
            <p className="text-base text-muted">{t("track.codeLabel")}</p>
            <p className="mt-2 font-display text-6xl tracking-[0.28em]">{order.deliveryCode}</p>
            <p className="mt-3 text-base leading-7 text-muted">{t("track.hint")}</p>
          </div>
          <p className="text-sm text-muted">{formatWhen(order.createdAt, lang)}</p>
        </section>
      ) : null}
    </main>
  );
}
