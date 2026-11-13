"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { DELIVERY_FEE_MAD } from "@/lib/constants";
import { addCasablancaDays, formatMad, formatServiceDate, formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { MealListResponse, OrderReceipt, PublicMeal } from "@/lib/types";
import { SecureChat } from "@/components/secure-chat";
import { LiveDot, inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { useI18n } from "@/components/language";
import { useLiveQuery } from "@/components/use-live-query";
import { readCheckout, rememberReceipt, writeCheckout } from "@/lib/guest";

export function MealBoard() {
  const { data, error, loading, reload } = useLiveQuery<MealListResponse>("/api/meals");
  const { t, lang } = useI18n();
  const [selected, setSelected] = useState<PublicMeal | null>(null);
  const [range, setRange] = useState<"today" | "yesterday" | "recent">("today");
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
    <section id="meals" className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-4xl">{t("board.title")}</h2>
            <LiveDot />
          </div>
          <p className="mt-1 text-base text-muted">
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
      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ["today", t("meal.today")],
          ["yesterday", t("meal.yesterday")],
          ["recent", t("board.lastDays")],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`min-h-10 rounded-full px-4 text-sm font-medium ${range === id ? "bg-terracotta text-white" : "border border-line bg-card"}`}
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
      {loading && !data ? <p className="mt-8 text-base text-muted">{t("board.loading")}</p> : null}
      {!loading && !error && meals.length === 0 ? (
        <p className="lift-card mt-8 rounded-3xl px-5 py-10 text-center text-base text-muted">{t("board.empty")}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            canOrder={canOrder}
            onOrder={(next) => {
              if (!canOrder || window.localStorage.getItem("wajbati_terms_accepted") !== "true") return;
              setSelected(next);
            }}
          />
        ))}
      </div>
      {currentMeal ? (
        <OrderDialog
          key={currentMeal.id}
          meal={currentMeal}
          onClose={() => setSelected(null)}
          onPlaced={() => void reload()}
        />
      ) : null}
    </section>
  );
}

function MealCard({ meal, canOrder, onOrder }: { meal: PublicMeal; canOrder: boolean; onOrder: (meal: PublicMeal) => void }) {
  const { t, lang } = useI18n();
  const soldOut = meal.remainingQuantity <= 0;
  const photos = meal.photoUrls?.length ? meal.photoUrls : meal.photoUrl ? [meal.photoUrl] : [];
  const [index, setIndex] = useState(0);
  const photo = photos[index] ?? null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[#E7E0D6] bg-card shadow-[0_1px_2px_rgba(30,26,21,0.06),0_10px_24px_-18px_rgba(30,26,21,0.45)]">
      <div className="relative aspect-square w-full overflow-hidden bg-[#F3EBE1]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-3xl text-[#C4B6A6]" aria-hidden="true">🍽</span>
        )}
        {photos.length > 1 ? (
          <span className="absolute inset-x-2 bottom-2 flex justify-between">
            <button type="button" className="size-7 rounded-full bg-white/90 text-sm" onClick={() => setIndex((current) => (current - 1 + photos.length) % photos.length)} aria-label={t("board.lastDays")}>‹</button>
            <button type="button" className="size-7 rounded-full bg-white/90 text-sm" onClick={() => setIndex((current) => (current + 1) % photos.length)} aria-label={t("board.lastDays")}>›</button>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h3 className="line-clamp-2 min-h-10 text-sm font-medium leading-5 text-foreground">{meal.title}</h3>
        <p className="truncate text-xs text-muted">{meal.kitchenName}</p>
        <p className="text-sm font-semibold text-foreground">{formatMad(meal.priceMad, lang)}</p>
        <button
          type="button"
          className="mt-auto inline-flex h-8 items-center justify-center rounded-full bg-[#D89B3D] px-3 text-xs font-semibold text-[#1E1A15] disabled:bg-[#E7E0D6] disabled:text-muted"
          disabled={soldOut || !canOrder}
          onClick={() => onOrder(meal)}
        >
          {soldOut ? t("board.soldOut") : t("board.add")}
        </button>
        {!canOrder ? <p className="text-[11px] leading-4 text-terracotta-deep">{t("meal.pastOrder")}</p> : null}
      </div>
    </article>
  );
}

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

  const mealTotal = meal.priceMad * (remaining > 0 ? safeQuantity : 0);
  const deliveryTotal = remaining > 0 ? DELIVERY_FEE_MAD : 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1E1A15]/45 p-3 backdrop-blur-md sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-title"
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-[0_12px_40px_rgba(30,26,21,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="text-sm text-terracotta">{meal.kitchenName}</p>
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
              <div className="aspect-video w-full overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meal.photoUrl} alt="" className="h-full w-full rounded-lg object-cover" />
              </div>
            ) : null}
            <p className="text-base leading-7 text-muted">{meal.description}</p>
            <div className="space-y-4 rounded-2xl bg-background p-4">
            <p className="font-medium text-olive">{t("order.placed")}</p>
            <p>{t("order.for", { quantity: receipt.quantity, meal: receipt.mealTitle, name: receipt.customerName })}</p>
            <p>{t("order.deliverTo", { address: receipt.deliveryAddress })}</p>
            <p>
              {t("order.payLine", {
                meal: formatMad(receipt.totalMad, lang),
                delivery: formatMad(receipt.deliveryFeeMad, lang),
                total: formatMad(receipt.totalMad + receipt.deliveryFeeMad, lang),
              })}
            </p>
            {receipt.customerNotes ? <p className="text-muted">{receipt.customerNotes}</p> : null}
            <div className="rounded-3xl bg-card px-4 py-5 text-center">
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
                <p className="font-medium">{t("order.emailTitle")}</p>
                <p className="text-muted">{t("order.emailHint")}</p>
                <label className="block">
                  <span className="mb-1.5 block font-medium">{t("order.email")}</span>
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
              <div className="aspect-video w-full overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={meal.photoUrl} alt="" className="h-full w-full rounded-lg object-cover" />
              </div>
            ) : null}
            <p className="text-base leading-7 text-muted">{meal.description}</p>
            <p className="text-base text-muted">
              {t("order.left", { count: remaining, price: formatMad(meal.priceMad, lang) })}
            </p>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("order.name")}</span>
              <input className={inputClass} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("order.phone")}</span>
              <input className={inputClass} autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("order.address")}</span>
              <input className={inputClass} autoComplete="street-address" value={address} onChange={(event) => setAddress(event.target.value)} required />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("order.notes")}</span>
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t("order.notesHint")}
                maxLength={280}
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="text-base font-medium">{t("order.quantity")}</span>
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
              <legend className="text-base font-medium">{t("order.payTitle")}</legend>
              <label className="lift-card flex items-start gap-3 rounded-2xl p-3">
                <input type="radio" name="payment" checked readOnly className="mt-1" />
                <span>
                  <span className="block font-medium">{t("order.cash")}</span>
                  <span className="block text-muted">{t("order.cashHint")}</span>
                </span>
              </label>
            </fieldset>
            <p className="text-base">
              {t("order.meal")} <span className="font-medium">{formatMad(mealTotal, lang)}</span>
              {" · "}
              {t("order.delivery")} <span className="font-medium">{formatMad(deliveryTotal, lang)}</span>
              {" · "}
              {t("order.toPay")} <span className="font-medium">{formatMad(mealTotal + deliveryTotal, lang)}</span>
            </p>
            {error ? (
              <p role="alert" className="text-base text-terracotta-deep">
                {error}
              </p>
            ) : null}
            <p className="text-sm leading-6 text-muted">
              {t("order.disclaimer")}{" "}
              <Link href="/terms" className="font-medium text-terracotta-deep underline">
                {t("footer.terms")}
              </Link>
              {" · "}
              <Link href="/privacy" className="font-medium text-terracotta-deep underline">
                {t("footer.privacy")}
              </Link>
            </p>
            </div>
            <div className="sticky bottom-0 border-t border-line bg-card/95 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
              <button className={`${primaryButtonClass} w-full`} type="submit" disabled={pending || remaining < 1}>
                {remaining < 1 ? t("board.soldOut") : pending ? t("order.placing") : t("order.place")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
