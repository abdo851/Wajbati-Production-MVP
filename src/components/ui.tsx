"use client";

import { useI18n } from "@/components/language";
import type { MessageKey } from "@/lib/i18n";
import type { OrderStatus } from "@/lib/types";

const statusTone: Record<OrderStatus, string> = {
  pending: "bg-gold/15 text-gold-deep",
  confirmed: "bg-olive/15 text-olive",
  assigned: "bg-olive/15 text-olive",
  picked_up: "bg-gold/20 text-foreground",
  delivered: "bg-surface text-muted",
  cancelled: "bg-terracotta/10 text-terracotta-deep",
  refused: "bg-terracotta/15 text-terracotta-deep",
  not_reachable: "bg-terracotta/15 text-terracotta-deep",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const key = `status.${status}` as MessageKey;
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusTone[status]}`}>
      {t(key)}
    </span>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-foreground outline-none transition placeholder:text-muted/60 focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/15";

export const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2.5 text-base font-semibold text-white shadow-[0_10px_22px_-12px_rgba(23,19,15,0.55)] transition duration-200 hover:bg-ink/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export const quietButtonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-4 py-2 text-base font-semibold text-foreground transition duration-200 hover:border-gold/50 hover:bg-gold/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export function LiveDot() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-olive/10 px-3 py-1 text-sm font-semibold text-olive">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full rounded-full bg-olive opacity-40 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-olive" />
      </span>
      {t("live")}
    </span>
  );
}
