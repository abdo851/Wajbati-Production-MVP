"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/language";
import { formatMad, formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { WalletView } from "@/lib/types";

export function WalletPanel() {
  const { t } = useI18n();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch("/api/wallet", { cache: "no-store" })
        .then((response) => readJson<{ wallet: WalletView }>(response))
        .then((payload) => setWallet(payload.wallet))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("wallet.failed")));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [t]);

  return (
    <section className="mt-6 rounded-3xl border border-line bg-card p-5">
      <h2 className="font-display text-2xl">{t("wallet.title")}</h2>
      <p className="mt-2 font-display text-4xl">{formatMad(wallet?.balanceMad ?? 0)}</p>
      <p className="mt-1 text-sm text-muted">{t("wallet.balance")}</p>
      {wallet && wallet.balanceMad <= 0 ? (
        <p role="alert" className="mt-3 rounded-2xl bg-terracotta/15 px-3 py-2 text-sm font-medium text-terracotta-deep">{t("wallet.blocked")}</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-terracotta-deep">{error}</p> : null}
      <h3 className="mt-4 text-sm font-medium">{t("wallet.history")}</h3>
      {(wallet?.transactions.length ?? 0) === 0 ? <p className="mt-2 text-sm text-muted">{t("wallet.empty")}</p> : null}
      <ul className="mt-2 space-y-2">
        {(wallet?.transactions ?? []).map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span>{item.note === "commission" ? t("wallet.commission") : t("wallet.adjusted")} · {formatWhen(item.createdAt)}</span>
            <span>{formatMad(item.amountMad)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
