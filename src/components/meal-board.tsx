"use client";

import { memo, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { cashMealTotalMad } from "@/lib/financial-rules";
import { addCasablancaDays, formatMad, formatServiceDate, formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { MealListResponse, OrderReceipt, PublicMeal } from "@/lib/types";
import { SecureChat } from "@/components/secure-chat";
import { LiveDot, inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { useI18n } from "@/components/language";
import { useLiveQuery } from "@/components/use-live-query";
import { readCheckout, rememberReceipt, writeCheckout } from "@/lib/guest";
import { SplashScreen } from "@/components/splash-screen";

const LocationPicker = dynamic(() => import("@/components/location-picker").then((mod) => mod.LocationPicker), { ssr: false });

export function MealBoard() {
  const { data, error, loading, reload } = useLiveQuery<MealListResponse>("/api/meals");
  const { t, lang } = useI18n();
  const [selected, setSelected] = useState<PublicMeal | null>(null);
  const [range, setRange] = useState<"today" | "yesterday" | "recent">("today");
  const [minSplashPassed, setMinSplashPassed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinSplashPassed(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  const today = data?.serviceDate ?? "";
  const meals = (data?.meals ?? []).filter((meal) => {
    if (!today) return false;
    if (range === "today") return meal.serviceDate === today;
    if (range === "yesterday") return meal.serviceDate === addCasablancaDays(today, -1);
    return meal.serviceDate >= addCasablancaDays(today, -3) && meal.serviceDate <= today;
  });
  const canOrder = range === "today";
  const currentMeal = meals.find((meal) => meal.id === selected?.id) ?? selected;
  const portions = meals.reduce((sum, meal) => sum + meal.remainingQuantity, 0);
  const kitchens = new Set(meals.map((meal) => meal.kitchenName)).size;

  return (
    <section id="meals" className="mx-auto max-w-6xl scroll-mt-20 px-3 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-[1.65rem] leading-tight text-ink sm:text-3xl">{t("board.title")}</h2>
            <LiveDot />
          </div>
          <p className="mt-2 text-sm leading-7 text-[color:var(--muted-strong)] sm:text-base">
            {data
              ? t("board.summary", {
                  date: formatServiceDate(data.serviceDate, lang),
                  kitchens,
                  portions,
                })
              : loading
                ? t("board.loadingDate")
                : error
                  ? t("live.failed")
                  : t("board.empty")}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {([
          ["today", t("meal.today")],
          ["yesterday", t("meal.yesterday")],
          ["recent", t("board.lastDays")],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`min-h-10 rounded-full px-4 text-sm font-semibold transition duration-200 ${
              range === id
                ? "bg-ink text-white shadow-[0_8px_18px_-10px_rgba(23,19,15,0.45)]"
                : "border border-line bg-card text-foreground hover:border-gold/45 hover:bg-gold/5"
            }`}
            onClick={() => setRange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-base text-terracotta-deep">
          {error}
        </p>
      ) : null}
      <AnimatePresence>
        {(loading && !data) || !minSplashPassed ? <SplashScreen key="splash" /> : null}
      </AnimatePresence>
      {!loading && !error && meals.length === 0 ? (
        <div className="mt-8 rounded-[1.35rem] border border-dashed border-line/90 bg-gradient-to-b from-white/80 to-surface/80 px-5 py-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          <p className="font-display text-xl text-ink sm:text-2xl">{t("board.emptyTitle")}</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[color:var(--muted-strong)] sm:text-[0.95rem]">
            {t("board.emptyBody")}
          </p>
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {meals.map((meal, index) => (
          <MealCard
            key={meal.id}
            meal={meal}
            index={index}
            canOrder={canOrder}
            onOrder={(next) => {
              if (!canOrder || window.localStorage.getItem("wajbati_terms_accepted") !== "true") return;
              setSelected(next);
            }}
          />
        ))}
      </div>
      <AnimatePresence>
        {currentMeal ? (
          <OrderDialog
            key={currentMeal.id}
            meal={currentMeal}
            onClose={() => setSelected(null)}
            onPlaced={() => void reload()}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}

const MealCard = memo(
  function MealCard({ meal, index, canOrder, onOrder }: { meal: PublicMeal; index: number; canOrder: boolean; onOrder: (meal: PublicMeal) => void }) {
  const { t, lang } = useI18n();
  const soldOut = meal.remainingQuantity <= 0;
  const photos = meal.photoUrls?.length ? meal.photoUrls : meal.photoUrl ? [meal.photoUrl] : [];
  const [indexPhoto, setIndexPhoto] = useState(0);
  const photo = photos[indexPhoto] ?? null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.35), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      className="group flex flex-col overflow-hidden rounded-[1.25rem] border border-line bg-card shadow-[0_1px_2px_rgb(23_19_15_/0.04),0_14px_32px_-22px_rgb(23_19_15_/0.2)] transition-shadow duration-300 hover:shadow-lux"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-surface">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <span className="flex h-full items-center justify-center bg-[linear-gradient(160deg,#f3eee6,#e8e0d4)] text-sm font-medium text-[color:var(--muted-strong)]" aria-hidden="true">
            Righ
          </span>
        )}
        {!soldOut ? (
          <span className="absolute start-2 top-2 rounded-full bg-white/92 px-2 py-0.5 text-[10px] font-bold text-olive shadow-sm">
            {t("board.left", { left: meal.remainingQuantity, max: meal.maxQuantity })}
          </span>
        ) : null}
        {soldOut ? (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/45 backdrop-blur-[2px]">
            <span className="rounded-full bg-white/92 px-3 py-1 text-xs font-bold text-ink">{t("board.soldOut")}</span>
          </span>
        ) : null}
        {photos.length > 1 ? (
          <span className="absolute inset-x-2 bottom-2 flex justify-between opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button type="button" className="size-7 rounded-full bg-white/90 text-sm shadow transition hover:scale-110" onClick={() => setIndexPhoto((current) => (current - 1 + photos.length) % photos.length)} aria-label={t("board.lastDays")}>‹</button>
            <button type="button" className="size-7 rounded-full bg-white/90 text-sm shadow transition hover:scale-110" onClick={() => setIndexPhoto((current) => (current + 1) % photos.length)} aria-label={t("board.lastDays")}>›</button>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-ink">{meal.title}</h3>
        {meal.chefId ? (
          <Link href={`/chef/${meal.chefId}`} className="truncate text-xs font-medium text-gold-deep underline-offset-2 hover:underline">
            {meal.kitchenName}
          </Link>
        ) : (
          <p className="truncate text-xs text-[color:var(--muted-strong)]">{meal.kitchenName}</p>
        )}
        <p className="text-base font-bold text-ink">{formatMad(meal.priceMad, lang)}</p>
        <button
          type="button"
          className="mt-auto inline-flex h-9 items-center justify-center rounded-full bg-ink px-3 text-xs font-bold text-white transition duration-200 hover:bg-ink/90 active:scale-[0.97] disabled:bg-line disabled:text-muted"
          disabled={soldOut || !canOrder}
          onClick={() => onOrder(meal)}
        >
          {soldOut ? t("board.soldOut") : t("board.add")}
        </button>
        {!canOrder ? <p className="text-[11px] leading-4 text-terracotta-deep">{t("meal.pastOrder")}</p> : null}
      </div>
    </motion.article>
  );
  },
  (previous, next) =>
    previous.meal.id === next.meal.id &&
    previous.canOrder === next.canOrder &&
    previous.meal.title === next.meal.title &&
    previous.meal.priceMad === next.meal.priceMad &&
    previous.meal.remainingQuantity === next.meal.remainingQuantity &&
    previous.meal.kitchenName === next.meal.kitchenName &&
    previous.meal.photoUrl === next.meal.photoUrl &&
    (previous.meal.photoUrls?.length ?? 0) === (next.meal.photoUrls?.length ?? 0),
);

function OrderDialog({
  meal,
  onClose,
  onPlaced,
}: {
  meal: PublicMeal;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"ask" | "saving" | "saved" | "hidden">("ask");
  const [mapOpen, setMapOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const { t, lang } = useI18n();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = readCheckout();
      if (!saved) return;
      setName(saved.name);
      setPhone(saved.phone);
      setAddress(saved.address);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const remaining = meal.remainingQuantity;
  const safeQuantity = Math.min(quantity, Math.max(remaining, 1));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (remaining < 1) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealId: meal.id,
          customerName: name,
          customerPhone: phone,
          deliveryAddress: address,
          customerNotes: notes,
          quantity: safeQuantity,
          deliveryLat: coords?.lat ?? null,
          deliveryLng: coords?.lng ?? null,
        }),
      });
      const body = await readJson<{ order: OrderReceipt }>(response);
      writeCheckout({ name, phone, address });
      rememberReceipt(body.order);
      setReceipt(body.order);
      onPlaced();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("order.failed"));
      onPlaced();
    } finally {
      setPending(false);
    }
  }

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt) return;
    setEmailState("saving");
    setError(null);
    try {
      const response = await fetch("/api/orders/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: receipt.id, email }),
      });
      await readJson(response);
      setEmailState("saved");
    } catch (caught) {
      setEmailState("ask");
      setError(caught instanceof Error ? caught.message : t("order.failed"));
    }
  }

  // COD meal cash only — no separate delivery fee is owner-approved.
  const mealTotal = remaining > 0 ? cashMealTotalMad(meal.priceMad, safeQuantity) : 0;

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-3 backdrop-blur-md sm:p-6"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-title"
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line/70 bg-card/95 shadow-lux-lg backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gold-deep">{meal.kitchenName}</p>
            <p className="text-sm text-olive">{t("chef.rating")}</p>
            <h2 id="order-title" className="mt-1 font-display text-3xl">
              {meal.title}
            </h2>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button type="button" className={quietButtonClass} onClick={() => setChatOpen(true)}>
              {t("chat.contact")}
            </button>
            <button type="button" className={quietButtonClass} onClick={onClose}>
              {t("order.close")}
            </button>
          </div>
        </div>
        {chatOpen ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <button type="button" className={quietButtonClass} onClick={() => setChatOpen(false)}>
              {t("chat.back")}
            </button>
            <SecureChat mealId={meal.id} />
          </div>
        ) : receipt ? (
          <div className="mt-4 space-y-4 overflow-y-auto px-5 pb-5 text-base leading-7">
            {meal.photoUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meal.photoUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
              </div>
            ) : null}
            <p className="text-base leading-7 text-muted">{meal.description}</p>
            <div className="space-y-4 rounded-2xl bg-surface/70 p-4">
            <p className="font-semibold text-olive">{t("order.placed")}</p>
            <p>{t("order.for", { quantity: receipt.quantity, meal: receipt.mealTitle, name: receipt.customerName })}</p>
            <p>{t("order.deliverTo", { address: receipt.deliveryAddress })}</p>
            <p>
              {t("order.payLine", {
                meal: formatMad(receipt.totalMad, lang),
                total: formatMad(receipt.totalMad, lang),
              })}
            </p>
            {receipt.customerNotes ? <p className="text-muted">{receipt.customerNotes}</p> : null}
            <div className="rounded-3xl bg-card px-4 py-5 text-center shadow-lux">
              <p className="text-base text-muted">{t("track.codeLabel")}</p>
              <p className="mt-2 font-display text-5xl tracking-[0.28em]">{receipt.deliveryCode}</p>
              <p className="mt-3 text-base leading-7 text-muted">{t("track.hint")}</p>
              <Link href={`/track/${receipt.trackToken}`} className={`${quietButtonClass} mt-4`}>
                {t("track.open")}
              </Link>
            </div>
            <p className="text-muted">{formatWhen(receipt.createdAt, lang)} · {receipt.kitchenName}</p>
            {emailState === "saved" ? <p className="text-olive">{t("order.emailSaved")}</p> : null}
            {emailState === "ask" || emailState === "saving" ? (
              <form onSubmit={saveEmail} className="space-y-3 border-t border-line pt-4">
                <p className="font-semibold">{t("order.emailTitle")}</p>
                <p className="text-muted">{t("order.emailHint")}</p>
                <label className="block">
                  <span className="mb-1.5 block font-semibold">{t("order.email")}</span>
                  <input className={inputClass} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </label>
                {error ? <p className="text-terracotta-deep">{error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button className={primaryButtonClass} type="submit" disabled={emailState === "saving"}>
                    {t("order.saveEmail")}
                  </button>
                  <button className={quietButtonClass} type="button" onClick={() => setEmailState("hidden")}>
                    {t("order.skip")}
                  </button>
                </div>
              </form>
            ) : null}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
            {meal.photoUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meal.photoUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
              </div>
            ) : null}
            <p className="text-base leading-7 text-muted">{meal.description}</p>
            <p className="text-base text-muted">
              {t("order.left", { count: remaining, price: formatMad(meal.priceMad, lang) })}
            </p>
            <label className="block text-base">
              <span className="mb-1.5 block font-semibold">{t("order.name")}</span>
              <input className={inputClass} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-semibold">{t("order.phone")}</span>
              <input className={inputClass} autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-semibold">{t("order.address")}</span>
              <input className={inputClass} autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} required />
            </label>
            <button
              type="button"
              className={`${quietButtonClass} w-full`}
              onClick={() => {
                if (!navigator.geolocation) {
                  setMapOpen(true);
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
                    setMapOpen(true);
                  },
                  () => setMapOpen(true),
                  { enableHighAccuracy: true, timeout: 8000 },
                );
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12 21s-7-5.1-7-11a7 7 0 1 1 14 0c0 5.9-7 11-7 11z" />
                  <circle cx="12" cy="10" r="2.6" />
                </svg>
                {t("order.mapButton")}
              </span>
            </button>
            {coords ? (
              <p className="text-xs font-bold text-gold-deep" dir="ltr">
                📍 {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </p>
            ) : null}
            <label className="block text-base">
              <span className="mb-1.5 block font-semibold">{t("order.notes")}</span>
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t("order.notesHint")}
                maxLength={280}
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold">{t("order.quantity")}</span>
              <div className="flex items-center gap-2">
                <button type="button" className={quietButtonClass} onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={safeQuantity <= 1}>
                  {t("order.less")}
                </button>
                <span className="w-6 text-center text-base">{remaining > 0 ? safeQuantity : 0}</span>
                <button type="button" className={quietButtonClass} onClick={() => setQuantity((value) => Math.min(remaining, value + 1))} disabled={safeQuantity >= remaining}>
                  {t("order.more")}
                </button>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-base font-semibold">{t("order.payTitle")}</legend>
              <label className="lift-card flex items-start gap-3 rounded-2xl p-3">
                <input type="radio" name="payment" checked readOnly className="mt-1" />
                <span>
                  <span className="block font-semibold">{t("order.cash")}</span>
                  <span className="block text-muted">{t("order.cashHint")}</span>
                </span>
              </label>
            </fieldset>
            <p className="text-base">
              {t("order.meal")} <span className="font-semibold">{formatMad(mealTotal, lang)}</span>
              {" · "}
              {t("order.toPay")} <span className="font-semibold">{formatMad(mealTotal, lang)}</span>
            </p>
            {error ? (
              <p role="alert" className="text-base text-terracotta-deep">
                {error}
              </p>
            ) : null}
            <p className="text-sm leading-6 text-muted">
              {t("order.disclaimer")}{" "}
              <Link href="/terms" className="font-semibold text-gold-deep underline underline-offset-2">
                {t("footer.terms")}
              </Link>
              {" · "}
              <Link href="/privacy" className="font-semibold text-gold-deep underline underline-offset-2">
                {t("footer.privacy")}
              </Link>
            </p>
            </div>
            <div className="sticky bottom-0 border-t border-line/70 bg-card/90 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
              <button className={`${primaryButtonClass} w-full`} type="submit" disabled={pending || remaining < 1}>
                {remaining < 1 ? t("board.soldOut") : pending ? t("order.placing") : t("order.place")}
              </button>
            </div>
          </form>
        )}
        <LocationPicker
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          onConfirm={(lat, lng) => setCoords({ lat, lng })}
          initialLat={coords?.lat}
          initialLng={coords?.lng}
        />
      </motion.div>
    </motion.div>
  );
}
