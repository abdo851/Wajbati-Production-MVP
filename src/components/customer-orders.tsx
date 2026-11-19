"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SecureChat } from "@/components/secure-chat";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";
import { StatusPill, primaryButtonClass } from "@/components/ui";
import { formatMad, formatWhen } from "@/lib/format";
import { readReceipts } from "@/lib/guest";
import { readJson } from "@/lib/read-json";
import type { CustomerOrder, OrderReceipt } from "@/lib/types";

function OtpBlock({ code, hint }: { code: string; hint: string }) {
  return (
    <div className="mt-3 rounded-2xl border border-gold/25 bg-gold/8 px-3 py-3">
      <p className="text-xs font-semibold tracking-wide text-gold-deep uppercase">{hint}</p>
      <p className="mt-1 font-display text-3xl tracking-[0.28em] text-ink">{code}</p>
    </div>
  );
}

export function CustomerOrders({ compact = false }: { compact?: boolean }) {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const [deviceOrders, setDeviceOrders] = useState<OrderReceipt[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const customer = session?.user?.role === "customer" ? session.user : null;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDeviceOrders(readReceipts()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (compact) return;
    document.title = `${t("nav.orders")} · Righ`;
  }, [compact, t]);

  useEffect(() => {
    if (!customer?.phone) {
      setOrders(null);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void fetch("/api/account/orders", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(t("orders.loadFailed"));
          const body = await readJson<{ orders: CustomerOrder[] }>(response);
          if (!cancelled) {
            setOrders(body.orders);
            setError(null);
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setOrders([]);
            setError(caught instanceof Error ? caught.message : t("orders.loadFailed"));
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [customer?.phone, t]);

  return (
    <section id="orders" className={compact ? "" : "mt-2"}>
      {!compact ? (
        <>
          <h1 className="font-display text-[1.85rem] leading-tight text-ink sm:text-4xl">{t("orders.title")}</h1>
          <p className="mt-3 text-sm leading-7 text-[color:var(--muted-strong)] sm:text-base">
            {customer ? t("orders.body") : t("orders.guestBody")}
          </p>
        </>
      ) : (
        <h2 className="font-display text-2xl text-ink sm:text-3xl">{t("menu.orders")}</h2>
      )}

      {!customer ? (
        <div className="mt-5 rounded-[1.35rem] border border-line bg-card p-5">
          <p className="text-sm leading-6 text-[color:var(--muted-strong)]">{t("orders.signInHint")}</p>
          <Link href="/account" className={`${primaryButtonClass} mt-4 inline-flex w-full`}>
            {t("account.signIn")}
          </Link>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-terracotta-deep">{error}</p> : null}

      {customer && orders === null ? (
        <p className="mt-4 text-sm text-[color:var(--muted-strong)]">{t("orders.loading")}</p>
      ) : null}

      {customer && orders && orders.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--muted-strong)]">{t("account.empty")}</p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {(orders ?? []).map((order) => {
          const showOtp =
            Boolean(order.deliveryCode) &&
            (order.status === "assigned" || order.status === "picked_up" || order.status === "confirmed" || order.status === "pending");
          const showDriverChat =
            order.status === "assigned" || order.status === "picked_up" || order.status === "delivered";
          return (
            <li key={order.id} className="rounded-[1.25rem] border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">
                  {order.quantity} × {order.mealTitle}
                </p>
                <StatusPill status={order.status} />
              </div>
              <p className="mt-1 text-sm text-[color:var(--muted-strong)]">
                {order.kitchenName} · {formatMad(order.totalMad, lang)} · {formatWhen(order.createdAt, lang)}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-strong)]">{order.deliveryAddress}</p>
              {showOtp && order.deliveryCode ? (
                <OtpBlock code={order.deliveryCode} hint={t("orders.otpHint")} />
              ) : null}
              {order.trackToken ? (
                <Link
                  href={`/track/${order.trackToken}`}
                  className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-gold-deep underline-offset-4 hover:underline"
                >
                  {t("orders.openDetails")}
                </Link>
              ) : null}
              <div className="mt-4 space-y-3">
                <SecureChat orderId={order.id} peer="chef" />
                {showDriverChat ? <SecureChat orderId={order.id} peer="driver" /> : null}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-8 text-lg font-medium text-ink">{t("account.device")}</h3>
      <p className="mt-1 text-sm text-[color:var(--muted-strong)]">{t("account.guestHint")}</p>
      {deviceOrders.length === 0 ? (
        <p className="mt-3 text-sm text-[color:var(--muted-strong)]">{t("account.empty")}</p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {deviceOrders.map((order) => (
          <li key={order.id} className="rounded-[1.25rem] border border-line bg-card p-4">
            <p className="font-medium">
              {order.quantity} × {order.mealTitle}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted-strong)]">
              {order.kitchenName} · {formatMad(order.totalMad, lang)}
            </p>
            {order.deliveryCode ? <OtpBlock code={order.deliveryCode} hint={t("orders.otpHint")} /> : null}
            {order.trackToken ? (
              <Link
                href={`/track/${order.trackToken}`}
                className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-gold-deep underline-offset-4 hover:underline"
              >
                {t("orders.openDetails")}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
