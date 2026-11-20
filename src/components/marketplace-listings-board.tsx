"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/components/language";
import { MarketplaceAuthGate, type MarketplaceAuthVariant } from "@/components/marketplace-auth-gate";
import { MarketplaceListingMedia } from "@/components/marketplace-listing-media";
import { useSession } from "@/components/use-session";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { formatMad } from "@/lib/format";
import { LAUNCH_CITIES, neighborhoodsForCity } from "@/lib/marketplace/launch-geography";
import { consumeMarketplaceIntent } from "@/lib/marketplace-intent";
import { readJson } from "@/lib/read-json";
import type { PublicMarketplaceListing } from "@/lib/marketplace/types";

const MarketplaceDiscoveryMap = dynamic(
  () => import("@/components/marketplace-discovery-map").then((mod) => mod.MarketplaceDiscoveryMap),
  { ssr: false },
);

type LoadState = "idle" | "loading" | "ready" | "error";

function categoryLabel(raw: string, t: ReturnType<typeof useI18n>["t"]) {
  if (raw === "home") return t("market.category.home");
  if (raw === "tajine") return t("market.category.tajine");
  if (raw === "couscous") return t("market.category.couscous");
  if (raw === "pastilla") return t("market.category.pastilla");
  return raw;
}

export function MarketplaceListingsBoard() {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const [items, setItems] = useState<PublicMarketplaceListing[]>([]);
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");
  const [neighborhood, setNeighborhood] = useState("all");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<PublicMarketplaceListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [mounted, setMounted] = useState(false);
  const [resumeListingId, setResumeListingId] = useState<string | null>(null);
  const failedMessage = useRef(t("live.failed"));
  const resumedRef = useRef(false);

  useEffect(() => {
    failedMessage.current = t("live.failed");
  }, [t]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setNeighborhood("all");
  }, [city]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    setLoadState((previous) => (previous === "ready" ? "ready" : "loading"));
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams();
          if (query.trim()) params.set("q", query.trim());
          if (city !== "all") params.set("city", city);
          if (neighborhood !== "all") params.set("neighborhood", neighborhood);
          if (category !== "all") params.set("category", category);
          const response = await fetch(`/api/marketplace/search?${params}`, { cache: "no-store" });
          const body = await readJson<{ items: PublicMarketplaceListing[] }>(response);
          if (cancelled) return;
          const next = body.items ?? [];
          const seen = new Set<string>();
          setItems(next.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true))));
          setError(null);
          setLoadState("ready");
        } catch (caught) {
          if (cancelled) return;
          setError(caught instanceof Error ? caught.message : failedMessage.current);
          setLoadState("error");
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [category, city, mounted, neighborhood, query]);

  useEffect(() => {
    if (!mounted || loadState !== "ready" || resumedRef.current) return;
    if (session?.user?.role !== "customer") return;
    const intent = consumeMarketplaceIntent();
    if (!intent || intent.action !== "contact_listing" || !intent.listingId) return;
    const match = items.find((item) => item.id === intent.listingId);
    if (!match) return;
    resumedRef.current = true;
    setResumeListingId(match.id);
    setSelected(match);
  }, [items, loadState, mounted, session?.user?.role]);

  const neighborhoods = neighborhoodsForCity(city === "all" ? null : city);
  const categories = useMemo(() => {
    const values = new Set(items.map((item) => item.category.trim()).filter(Boolean));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [items]);
  const showEmpty = loadState === "ready" && items.length === 0 && !error;

  return (
    <section id="marketplace-listings" className="mx-auto max-w-6xl scroll-mt-20 px-3 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[1.65rem] leading-tight text-ink sm:text-3xl">{t("market.listingsTitle")}</h2>
          <p className="mt-2 text-sm text-[color:var(--muted-strong)]">{t("market.listingsHint")}</p>
        </div>
        <div className="flex rounded-full border border-line bg-card p-1">
          <button
            type="button"
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${view === "list" ? "bg-brand text-white" : "text-muted"}`}
            onClick={() => setView("list")}
          >
            {t("market.viewList")}
          </button>
          <button
            type="button"
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${view === "map" ? "bg-brand text-white" : "text-muted"}`}
            onClick={() => setView("map")}
          >
            {t("market.viewMap")}
          </button>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">{t("market.searchPlaceholder")}</span>
        <input
          className={inputClass}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("market.searchPlaceholder")}
          autoComplete="off"
        />
      </label>

      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-gold-deep">{t("market.launchCities")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <FilterChip active={city === "all"} onClick={() => setCity("all")} label={t("market.allCities")} />
        {LAUNCH_CITIES.map((entry) => (
          <FilterChip key={entry.id} active={city === entry.name} onClick={() => setCity(entry.name)} label={entry.name} />
        ))}
      </div>

      {neighborhoods.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <FilterChip active={neighborhood === "all"} onClick={() => setNeighborhood("all")} label={t("market.allNeighborhoods")} />
          {neighborhoods.map((entry) => (
            <FilterChip
              key={entry.id}
              active={neighborhood === entry.name}
              onClick={() => setNeighborhood(entry.name)}
              label={entry.name}
            />
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-muted">{t("market.streetHint")}</p>

      {categories.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterChip active={category === "all"} onClick={() => setCategory("all")} label={t("market.fieldCategory")} />
          {categories.map((name) => (
            <FilterChip
              key={name}
              active={category === name}
              onClick={() => setCategory(name)}
              label={categoryLabel(name, t)}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-terracotta-deep">
          {error}
        </p>
      ) : null}
      {loadState === "loading" && items.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{t("market.listingsLoading")}</p>
      ) : null}
      {showEmpty ? <p className="mt-6 text-sm text-muted">{t("market.listingsEmpty")}</p> : null}

      {view === "map" && items.length > 0 ? (
        <MarketplaceDiscoveryMap
          items={items}
          cityFilter={city}
          onSelect={setSelected}
          emptyLabel={t("market.mapEmpty")}
          approxLabel={t("market.mapApprox")}
        />
      ) : null}

      {view === "list" && items.length > 0 ? (
        <ul className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map((listing) => (
            <li key={listing.id}>
              <button
                type="button"
                className="flex w-full flex-col overflow-hidden rounded-[1.25rem] border border-line bg-card text-start shadow-[0_1px_2px_rgba(31,20,18,0.05),0_14px_28px_-20px_rgba(111,20,32,0.28)] transition duration-200 hover:-translate-y-0.5 hover:shadow-lux"
                onClick={() => setSelected(listing)}
              >
                <div className="relative aspect-[4/3] w-full">
                  <MarketplaceListingMedia src={listing.images[0]} className="absolute inset-0" label={t("market.photoSoon")} />
                  <span className="absolute start-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[0.65rem] font-semibold text-ink shadow-sm">
                    {availabilityLabel(listing.availability, t)}
                  </span>
                </div>
                <div className="space-y-1 p-2.5">
                  <p className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{listing.title}</p>
                  {listing.kitchenName ? (
                    <p className="truncate text-xs font-semibold text-[color:var(--muted-strong)]">{listing.kitchenName}</p>
                  ) : null}
                  <p className="text-sm font-semibold text-brand">{priceLabel(listing, lang, t)}</p>
                  <p className="text-xs font-semibold text-gold-deep">{actionLabel(listing.priceMode, t)}</p>
                  <p className="text-xs text-muted">
                    {[listing.city, listing.neighborhood].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <AnimatePresence>
        {selected ? (
          <ListingDetail
            key={selected.id}
            listing={selected}
            signedIn={Boolean(session?.user)}
            isCustomer={session?.user?.role === "customer"}
            autoContact={resumeListingId === selected.id && session?.user?.role === "customer"}
            onClose={() => {
              setSelected(null);
              setResumeListingId(null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`min-h-10 rounded-full px-4 text-sm font-semibold transition duration-200 ${
        active
          ? "bg-brand text-white shadow-[0_8px_18px_-10px_rgba(111,20,32,0.55)]"
          : "border border-line bg-card text-foreground hover:border-brand/35 hover:bg-brand/[0.04]"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function availabilityLabel(
  availability: PublicMarketplaceListing["availability"],
  t: ReturnType<typeof useI18n>["t"],
) {
  if (availability === "preorder") return t("market.avail.preorder");
  if (availability === "unavailable") return t("market.avail.unavailable");
  if (availability === "sold_out") return t("market.avail.sold_out");
  return t("market.avail.available");
}

function priceLabel(listing: PublicMarketplaceListing, lang: "ar" | "en" | "fr", t: ReturnType<typeof useI18n>["t"]) {
  if (listing.priceMode === "hidden") return t("market.price.hidden");
  if (listing.priceMode === "negotiable") return t("market.price.negotiable");
  return listing.priceMad != null ? formatMad(listing.priceMad, lang) : t("market.price.hidden");
}

function actionLabel(priceMode: PublicMarketplaceListing["priceMode"], t: ReturnType<typeof useI18n>["t"]) {
  if (priceMode === "negotiable") return t("market.discussPrice");
  if (priceMode === "hidden") return t("market.askPrice");
  return t("market.contactSeller");
}

function authVariantFor(priceMode: PublicMarketplaceListing["priceMode"]): MarketplaceAuthVariant {
  if (priceMode === "negotiable") return "negotiate";
  if (priceMode === "hidden") return "askPrice";
  return "chat";
}

function firstMessageKey(priceMode: PublicMarketplaceListing["priceMode"]) {
  if (priceMode === "negotiable") return "market.contactFirstNegotiate" as const;
  if (priceMode === "hidden") return "market.contactFirstAskPrice" as const;
  return "market.contactFirstMessage" as const;
}

function ListingDetail({
  listing,
  signedIn,
  isCustomer,
  autoContact,
  onClose,
}: {
  listing: PublicMarketplaceListing;
  signedIn: boolean;
  isCustomer: boolean;
  autoContact: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const autoStarted = useRef(false);

  async function contactSeller() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!signedIn || !isCustomer) {
        setAuthOpen(true);
        return;
      }
      const open = await fetch("/api/marketplace/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerUserId: listing.sellerUserId, listingId: listing.id }),
      });
      const opened = await readJson<{ conversation: { id: string } }>(open);
      const send = await fetch(`/api/marketplace/conversations/${opened.conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: t(firstMessageKey(listing.priceMode), { title: listing.title }) }),
      });
      await readJson(send);
      setNotice(t("market.contactOpened"));
      router.push("/messages");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("live.failed"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoContact || autoStarted.current) return;
    autoStarted.current = true;
    void contactSeller();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoContact]);

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-burgundy/45 p-0 backdrop-blur-md sm:items-center sm:p-6"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          className="flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-line/70 bg-card shadow-lux-lg sm:rounded-3xl"
          onClick={(event) => event.stopPropagation()}
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
        >
          <div className="relative">
            <MarketplaceListingMedia src={listing.images[0]} className="aspect-[16/10] w-full" label={t("market.photoSoon")} />
            <button type="button" className={`${quietButtonClass} absolute end-3 top-3 min-h-10 bg-white/95 px-3`} onClick={onClose}>
              {t("order.close")}
            </button>
          </div>
          <div className="space-y-4 overflow-y-auto px-5 py-5">
            <div>
              <Link href={`/chef/${listing.chefProfileId}`} className="text-sm font-semibold text-brand underline-offset-2 hover:underline">
                {listing.kitchenName || t("market.visitStore")}
              </Link>
              <h2 className="mt-1 font-display text-3xl leading-tight text-ink">{listing.title}</h2>
            </div>
            <p className="text-base leading-7 text-[color:var(--muted-strong)]">{listing.description}</p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-bold text-brand">{priceLabel(listing, lang, t)}</span>
              <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold">{availabilityLabel(listing.availability, t)}</span>
              {listing.sellerOnline ? (
                <span className="rounded-full bg-olive/15 px-3 py-1 text-sm font-semibold text-olive">{t("market.online")}</span>
              ) : (
                <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-muted">{t("market.offline")}</span>
              )}
              {listing.sellerAcceptingInquiries === false ? (
                <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-muted">{t("market.sellerNotAccepting")}</span>
              ) : (
                <span className="rounded-full bg-olive/10 px-3 py-1 text-sm font-semibold text-olive">{t("market.sellerAccepting")}</span>
              )}
            </div>
            {error ? (
              <p role="alert" className="text-sm text-terracotta-deep">
                {error}
              </p>
            ) : null}
            {notice ? <p className="text-sm text-olive">{notice}</p> : null}
            <button type="button" className={`${primaryButtonClass} w-full`} disabled={busy} onClick={() => void contactSeller()}>
              {busy ? t("market.contactSending") : actionLabel(listing.priceMode, t)}
            </button>
            <Link href={`/chef/${listing.chefProfileId}`} className={`${quietButtonClass} w-full`}>
              {t("market.visitStore")}
            </Link>
          </div>
        </motion.div>
      </motion.div>
      <AnimatePresence>
        {authOpen ? (
          <MarketplaceAuthGate
            open={authOpen}
            onClose={() => setAuthOpen(false)}
            sellerName={listing.kitchenName}
            variant={authVariantFor(listing.priceMode)}
            intent={{
              action: "contact_listing",
              sellerUserId: listing.sellerUserId,
              listingId: listing.id,
              chefProfileId: listing.chefProfileId,
              title: listing.title,
              returnPath: "/",
            }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
