"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/language";
import { StatusPill, inputClass, primaryButtonClass } from "@/components/ui";
import { formatMad, formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { OrderTracking } from "@/lib/types";

export function TrackPanel({ token }: { token: string }) {
  const { t, lang } = useI18n();
  const [order, setOrder] = useState<OrderTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);
  const [rated, setRated] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch(`/api/track/${token}`, { cache: "no-store" })
        .then((response) => readJson<{ order: OrderTracking }>(response))
        .then((body) => {
          setOrder(body.order);
          if (typeof body.order.rating === "number" && body.order.rating >= 1) {
            setRated(true);
            setRating(body.order.rating);
          }
        })
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("track.missing")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [t, token]);

  async function sendRating(event: FormEvent) {
    event.preventDefault();
    if (rating < 1) return;
    setRatingBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, review }),
      });
      const body = await readJson<{ order: OrderTracking }>(response);
      setOrder(body.order);
      setRated(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("err.generic"));
    } finally {
      setRatingBusy(false);
    }
  }

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
          {order.status === "delivered" ? (
            <div className="rounded-3xl border border-line bg-background p-4">
              {rated ? (
                <p className="text-base font-medium text-olive">{t("rate.thanks")}</p>
              ) : (
                <form onSubmit={sendRating} className="space-y-3">
                  <p className="font-display text-2xl">{t("rate.title")}</p>
                  <p className="text-sm text-muted">{t("rate.hint")}</p>
                  <div className="flex gap-2" role="group" aria-label={t("rate.title")}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className={`size-11 rounded-full text-2xl ${rating >= star ? "text-[#D89B3D]" : "text-[#C4B6A6]"}`}
                        onClick={() => setRating(star)}
                        aria-label={`${star}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1.5 block font-medium">{t("rate.review")}</span>
                    <textarea className={`${inputClass} min-h-20 resize-y`} value={review} onChange={(event) => setReview(event.target.value)} maxLength={400} />
                  </label>
                  <button type="submit" className={primaryButtonClass} disabled={ratingBusy || rating < 1}>
                    {t("rate.send")}
                  </button>
                </form>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
