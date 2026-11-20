"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "@/components/language";
import { primaryButtonClass, quietButtonClass } from "@/components/ui";
import { saveMarketplaceIntent, type MarketplaceIntentAction } from "@/lib/marketplace-intent";

export type MarketplaceAuthVariant = "follow" | "chat" | "negotiate" | "askPrice" | "contact";

type MarketplaceAuthGateProps = {
  open: boolean;
  onClose: () => void;
  sellerName?: string;
  variant: MarketplaceAuthVariant;
  intent: {
    action: MarketplaceIntentAction;
    sellerUserId: string;
    listingId?: string;
    chefProfileId?: string;
    title?: string;
    returnPath: string;
  };
};

function copyForVariant(
  variant: MarketplaceAuthVariant,
  t: ReturnType<typeof useI18n>["t"],
  sellerName?: string,
) {
  if (variant === "follow") {
    return {
      kicker: t("market.auth.follow.kicker"),
      title: t("market.auth.follow.title"),
      body: t("market.auth.follow.body"),
    };
  }
  if (variant === "negotiate") {
    return {
      kicker: t("market.auth.kicker"),
      title: sellerName ? t("market.auth.negotiate.titleNamed", { name: sellerName }) : t("market.auth.negotiate.title"),
      body: t("market.auth.negotiate.body"),
    };
  }
  if (variant === "askPrice") {
    return {
      kicker: t("market.auth.kicker"),
      title: sellerName ? t("market.auth.askPrice.titleNamed", { name: sellerName }) : t("market.auth.askPrice.title"),
      body: t("market.auth.askPrice.body"),
    };
  }
  return {
    kicker: t("market.auth.kicker"),
    title: sellerName ? t("market.auth.chat.titleNamed", { name: sellerName }) : t("market.auth.chat.title"),
    body: t("market.auth.chat.body"),
  };
}

export function MarketplaceAuthGate({ open, onClose, sellerName, variant, intent }: MarketplaceAuthGateProps) {
  const { t } = useI18n();
  if (!open) return null;

  const next = encodeURIComponent(intent.returnPath);
  const signInHref = `/account?mode=signin&next=${next}`;
  const registerHref = `/account?mode=create&next=${next}`;
  const copy = copyForVariant(variant, t, sellerName);

  function remember() {
    saveMarketplaceIntent(intent);
  }

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-burgundy/50 p-0 backdrop-blur-md sm:items-center sm:p-6"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-auth-title"
        className="w-full max-w-md overflow-hidden rounded-t-[1.75rem] border border-line/70 bg-card p-6 shadow-lux-lg sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">{copy.kicker}</p>
        <h2 id="market-auth-title" className="mt-2 font-display text-2xl leading-tight text-ink">
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--muted-strong)]">{copy.body}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href={signInHref} className={`${primaryButtonClass} w-full`} onClick={remember}>
            {t("account.signIn")}
          </Link>
          <Link href={registerHref} className={`${quietButtonClass} w-full`} onClick={remember}>
            {t("account.create")}
          </Link>
          <button type="button" className="mt-1 min-h-10 text-sm font-semibold text-muted underline-offset-2 hover:underline" onClick={onClose}>
            {t("market.auth.continueBrowsing")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
