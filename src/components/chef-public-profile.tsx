"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/components/language";
import { MarketplaceAuthGate, type MarketplaceAuthVariant } from "@/components/marketplace-auth-gate";
import { MarketplaceListingMedia } from "@/components/marketplace-listing-media";
import { useSession } from "@/components/use-session";
import { primaryButtonClass, quietButtonClass } from "@/components/ui";
import { formatMad } from "@/lib/format";
import { consumeMarketplaceIntent } from "@/lib/marketplace-intent";
import type { PublicMarketplaceListing } from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";
import type { PublicChefProfile } from "@/lib/types";

export function ChefPublicProfile({ initial }: { initial: PublicChefProfile }) {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState(initial);
  const [listings, setListings] = useState<PublicMarketplaceListing[]>([]);
  const [online, setOnline] = useState(false);
  const [presenceKnown, setPresenceKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authAction, setAuthAction] = useState<"contact_seller" | "follow_seller">("contact_seller");
  const [authVariant, setAuthVariant] = useState<MarketplaceAuthVariant>("chat");
  const [accepting, setAccepting] = useState(true);
  const [selectedListing, setSelectedListing] = useState<PublicMarketplaceListing | null>(null);
  const resumedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/marketplace/search?chefProfileId=${encodeURIComponent(profile.id)}`, {
          cache: "no-store",
        });
        const body = await readJson<{ items: PublicMarketplaceListing[] }>(response);
        setListings(body.items);
      } catch {
        setListings([]);
      }
      try {
        const presence = await fetch(`/api/marketplace/presence?sellerUserId=${encodeURIComponent(profile.userId)}`, {
          cache: "no-store",
        });
        const body = await readJson<{ online: boolean; acceptingInquiries?: boolean }>(presence);
        setOnline(body.online);
        setAccepting(body.acceptingInquiries !== false);
        setPresenceKnown(true);
      } catch {
        setOnline(false);
        setPresenceKnown(false);
      }
    })();
  }, [profile.id, profile.userId]);

  useEffect(() => {
    if (resumedRef.current || session?.user?.role !== "customer") return;
    const intent = consumeMarketplaceIntent();
    if (!intent) return;
    if (intent.chefProfileId && intent.chefProfileId !== profile.id) return;
    if (intent.sellerUserId !== profile.userId) return;
    resumedRef.current = true;
    if (intent.action === "follow_seller") {
      void toggleFollow(true);
    } else if (intent.action === "contact_seller" || intent.action === "contact_listing") {
      void messageSeller(true, intent.listingId, intent.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.role, profile.id, profile.userId]);

  function requireCustomer(action: "contact_seller" | "follow_seller", variant: MarketplaceAuthVariant) {
    if (session?.user?.role === "customer") return true;
    setAuthAction(action);
    setAuthVariant(variant);
    setAuthOpen(true);
    return false;
  }

  async function toggleFollow(skipGate = false) {
    if (!skipGate && !requireCustomer("follow_seller", "follow")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chefId: profile.id }),
      });
      const body = await readJson<{ following: boolean }>(response);
      setProfile((current) => ({ ...current, following: body.following }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("err.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function messageSeller(skipGate = false, listingId?: string, title?: string) {
    if (!skipGate && !requireCustomer("contact_seller", "chat")) return;
    setBusy(true);
    setError(null);
    try {
      const open = await fetch("/api/marketplace/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerUserId: profile.userId,
          ...(listingId ? { listingId } : {}),
        }),
      });
      const opened = await readJson<{ conversation: { id: string } }>(open);
      await fetch(`/api/marketplace/conversations/${opened.conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: t("market.contactFirstMessage", { title: title || profile.kitchenName }),
        }),
      }).then((response) => readJson(response));
      router.push(`/inbox?c=${opened.conversation.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("err.generic"));
    } finally {
      setBusy(false);
    }
  }

  const stats = [
    { value: String(listings.length || profile.meals.length), label: t("market.storefrontTitle") },
    { value: profile.averageRating > 0 ? profile.averageRating.toFixed(1) : "—", label: t("chef.statRating") },
    { value: profile.city || "—", label: t("chef.city") },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-3xl border border-line bg-card shadow-lux"
      >
        <div className="relative h-44 bg-gradient-to-l from-brand/30 via-brand/[0.08] to-surface sm:h-56">
          {profile.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="relative px-5 pb-6 pt-0 sm:px-8">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="size-24 rounded-full bg-gradient-to-l from-brand to-brand-deep p-[3px] sm:size-28">
                <div className="size-full overflow-hidden rounded-full border-4 border-card bg-surface">
                  {profile.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl text-muted/50" aria-hidden="true">
                      ·
                    </span>
                  )}
                </div>
              </div>
              <div className="pb-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gold-deep">{t("market.storeIdentity")}</p>
                <h1 className="font-display text-3xl leading-tight">{profile.kitchenName}</h1>
                <p className="text-sm text-muted">{profile.city || "—"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {presenceKnown ? (
                <>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold ${
                      online ? "bg-olive/15 text-olive" : "bg-surface text-muted"
                    }`}
                  >
                    {online ? t("market.online") : t("market.offline")}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold ${
                      accepting ? "bg-olive/10 text-olive" : "bg-surface text-muted"
                    }`}
                  >
                    {accepting ? t("market.sellerAccepting") : t("market.sellerNotAccepting")}
                  </span>
                </>
              ) : null}
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                className={quietButtonClass}
                disabled={busy}
                onClick={() => void messageSeller()}
              >
                {t("market.contactStore")}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                className={profile.following ? quietButtonClass : primaryButtonClass}
                disabled={busy}
                onClick={() => void toggleFollow()}
              >
                {profile.following ? t("chef.publicFollowing") : t("chef.publicFollow")}
              </motion.button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface/60 py-3 text-center rtl:divide-x-reverse">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-xl leading-7">{stat.value}</p>
                <p className="mt-0.5 text-xs font-semibold text-muted">{stat.label}</p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-base leading-7 text-foreground">{profile.bio || "—"}</p>
          {error ? <p className="mt-3 text-sm text-terracotta-deep">{error}</p> : null}
        </div>
      </motion.div>

      {listings.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{t("market.storefrontTitle")}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {listings.map((listing) => (
              <li key={listing.id}>
                <button
                  type="button"
                  className="w-full overflow-hidden rounded-2xl border border-line bg-card text-start shadow-lux"
                  onClick={() => setSelectedListing(listing)}
                >
                  <div className="relative aspect-[4/3] bg-surface">
                    <MarketplaceListingMedia src={listing.images[0]} className="absolute inset-0" label={t("market.photoSoon")} />
                    <span className="absolute start-2 top-2 rounded-full bg-card/95 px-2 py-0.5 text-[0.65rem] font-semibold">
                      {listing.availability === "preorder"
                        ? t("market.avail.preorder")
                        : listing.availability === "unavailable"
                          ? t("market.avail.unavailable")
                          : listing.availability === "sold_out"
                            ? t("market.avail.sold_out")
                            : t("market.avail.available")}
                    </span>
                  </div>
                  <div className="space-y-1 p-2.5">
                    <p className="line-clamp-2 min-h-10 text-sm font-semibold">{listing.title}</p>
                    <p className="text-sm font-bold text-brand">
                      {listing.priceMode === "fixed" && listing.priceMad != null
                        ? formatMad(listing.priceMad, lang)
                        : listing.priceMode === "negotiable"
                          ? t("market.price.negotiable")
                          : t("market.price.hidden")}
                    </p>
                    <p className="text-xs font-semibold text-gold-deep">
                      {listing.priceMode === "negotiable"
                        ? t("market.discussPrice")
                        : listing.priceMode === "hidden"
                          ? t("market.askPrice")
                          : t("market.openListing")}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {profile.meals.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{t("chef.publicMeals")}</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {profile.meals.map((meal, index) => (
              <motion.li
                key={meal.id}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.35), ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -4 }}
                className="group overflow-hidden rounded-2xl border border-line bg-card shadow-lux transition-shadow duration-300 hover:shadow-lux-lg"
              >
                <div className="aspect-square overflow-hidden bg-surface">
                  {meal.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={meal.photoUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl text-muted/40" aria-hidden="true">
                      ·
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-2.5">
                  <p className="line-clamp-2 min-h-10 text-sm font-semibold">{meal.title}</p>
                  <p className="text-sm font-bold">{formatMad(meal.priceMad, lang)}</p>
                  <Link href="/#meals" className="text-xs font-bold text-gold-deep underline-offset-2 hover:underline">
                    {t("board.add")}
                  </Link>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>
      ) : null}

      <AnimatePresence>
        {selectedListing ? (
          <StoreListingDetail
            listing={selectedListing}
            storeName={profile.kitchenName}
            signedIn={Boolean(session?.user)}
            isCustomer={session?.user?.role === "customer"}
            onClose={() => setSelectedListing(null)}
            onNeedAuth={(variant) => {
              setAuthAction("contact_seller");
              setAuthVariant(variant);
              setAuthOpen(true);
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {authOpen ? (
          <MarketplaceAuthGate
            open={authOpen}
            onClose={() => setAuthOpen(false)}
            sellerName={profile.kitchenName}
            variant={authVariant}
            intent={{
              action: authAction,
              sellerUserId: profile.userId,
              chefProfileId: profile.id,
              listingId: selectedListing?.id,
              title: selectedListing?.title || profile.kitchenName,
              returnPath: pathname || `/chef/${profile.id}`,
            }}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function StoreListingDetail({
  listing,
  storeName,
  signedIn,
  isCustomer,
  onClose,
  onNeedAuth,
}: {
  listing: PublicMarketplaceListing;
  storeName: string;
  signedIn: boolean;
  isCustomer: boolean;
  onClose: () => void;
  onNeedAuth: (variant: MarketplaceAuthVariant) => void;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function contact() {
    if (!signedIn || !isCustomer) {
      onNeedAuth(
        listing.priceMode === "negotiable" ? "negotiate" : listing.priceMode === "hidden" ? "askPrice" : "chat",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const open = await fetch("/api/marketplace/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerUserId: listing.sellerUserId, listingId: listing.id }),
      });
      const opened = await readJson<{ conversation: { id: string } }>(open);
      const messageKey =
        listing.priceMode === "negotiable"
          ? "market.contactFirstNegotiate"
          : listing.priceMode === "hidden"
            ? "market.contactFirstAskPrice"
            : "market.contactFirstMessage";
      await fetch(`/api/marketplace/conversations/${opened.conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: t(messageKey, { title: listing.title }) }),
      }).then((response) => readJson(response));
      router.push(`/inbox?c=${opened.conversation.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("err.generic"));
    } finally {
      setBusy(false);
    }
  }

  const cta =
    listing.priceMode === "negotiable"
      ? t("market.discussPrice")
      : listing.priceMode === "hidden"
        ? t("market.askPrice")
        : t("market.contactSeller");

  return (
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
            <p className="text-sm font-semibold text-brand">{storeName}</p>
            <h2 className="mt-1 font-display text-3xl leading-tight text-ink">{listing.title}</h2>
          </div>
          <p className="text-base leading-7 text-[color:var(--muted-strong)]">{listing.description}</p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-bold text-brand">
              {listing.priceMode === "fixed" && listing.priceMad != null
                ? formatMad(listing.priceMad, lang)
                : listing.priceMode === "negotiable"
                  ? t("market.price.negotiable")
                  : t("market.price.hidden")}
            </span>
            <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold">
              {listing.availability === "preorder"
                ? t("market.avail.preorder")
                : listing.availability === "unavailable"
                  ? t("market.avail.unavailable")
                  : listing.availability === "sold_out"
                    ? t("market.avail.sold_out")
                    : t("market.avail.available")}
            </span>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-terracotta-deep">
              {error}
            </p>
          ) : null}
          <button type="button" className={`${primaryButtonClass} w-full`} disabled={busy} onClick={() => void contact()}>
            {busy ? t("market.contactSending") : cta}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
