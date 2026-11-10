"use client";

import { useI18n } from "@/components/language";
import type { MessageKey } from "@/lib/i18n";
import type { OrderStatus } from "@/lib/types";

const statusTone: Record<OrderStatus, string> = {
  pending: "bg-saffron/20 text-foreground",
  confirmed: "bg-olive/15 text-olive",
  assigned: "bg-olive/15 text-olive",
  picked_up: "bg-saffron/25 text-foreground",
  delivered: "bg-line text-muted",
  cancelled: "bg-terracotta/10 text-terracotta-deep",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const key = `status.${status}` as MessageKey;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-sm font-medium ${statusTone[status]}`}>
      {t(key)}
    </span>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-line bg-white px-3.5 py-3 text-base text-foreground outline-none placeholder:text-muted/70 focus-visible:border-terracotta";

export const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-saffron px-4 py-2.5 text-base font-medium text-foreground shadow-[0_4px_20px_rgba(30,26,21,0.08)] transition hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export const quietButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2 text-base font-medium text-foreground shadow-[0_4px_20px_rgba(30,26,21,0.08)] hover:border-terracotta active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";

export function LiveDot() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-olive">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full rounded-full bg-olive opacity-40 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-olive" />
      </span>
      {t("live")}
    </span>
  );
}
