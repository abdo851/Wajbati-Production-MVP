"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { DELIVERY_FEE_MAD } from "@/lib/constants";
import { formatMad, formatServiceDate, formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { MealListResponse, OrderReceipt, PublicMeal } from "@/lib/types";
import { LiveDot, inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { useI18n } from "@/components/language";
import { useLiveQuery } from "@/components/use-live-query";
import { readCheckout, rememberReceipt, writeCheckout } from "@/lib/guest";

export function MealBoard() {
  const { data, error, loading, reload } = useLiveQuery<MealListResponse>("/api/meals");
  const { t, lang } = useI18n();
  const [selected, setSelected] = useState<PublicMeal | null>(null);
  const meals = data?.meals ?? [];
  const currentMeal = meals.find((meal) => meal.id === selected?.id) ?? selected;
  const portions = meals.reduce((sum, meal) => sum + meal.remainingQuantity, 0);
  const kitchens = new Set(meals.map((meal) => meal.kitchenName)).size;

  return (
    <section id="meals" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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
              : t("board.loadingDate")}
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-4 text-base text-terracotta-deep">
          {error}
        </p>
      ) : null}
      {loading && !data ? <p className="mt-8 text-base text-muted">{t("board.loading")}</p> : null}
      {data && meals.length === 0 ? (
        <p className="lift-card mt-8 rounded-3xl px-5 py-10 text-center text-base text-muted">{t("board.empty")}</p>
      ) : null}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {meals.map((meal) => (
          <MealCard key={meal.id} meal={meal} onOrder={setSelected} />
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

function MealCard({ meal, onOrder }: { meal: PublicMeal; onOrder: (meal: PublicMeal) => void }) {
  const { t, lang } = useI18n();
  const soldOut = meal.remainingQuantity <= 0;
  const width = Math.max(0, Math.min(100, (meal.remainingQuantity / meal.maxQuantity) * 100));

  return (
    <article className="lift-card flex flex-col overflow-hidden rounded-3xl">
      {meal.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meal.photoUrl} alt="" className="h-52 w-full object-cover" />
      ) : null}
      <div className="flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-terracotta">{meal.city}</p>
        <p className="font-display text-3xl">{formatMad(meal.priceMad, lang)}</p>
      </div>
      <h3 className="mt-3 font-display text-3xl leading-tight">{meal.title}</h3>
      <p className="mt-3 flex-1 text-base leading-7 text-muted">{meal.description}</p>
      <p className="mt-4 text-base">
        {meal.kitchenName}
        <span className="text-muted"> · {t("board.perPortion")}</span>
      </p>
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span>{t("board.left", { left: meal.remainingQuantity, max: meal.maxQuantity })}</span>
          <span className={soldOut ? "text-terracotta-deep" : "text-olive"}>
            {soldOut ? t("board.soldOut") : t("board.available")}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full rounded-full bg-olive" style={{ width: `${width}%` }} />
        </div>
      </div>
      <button type="button" className={`${primaryButtonClass} mt-5`} disabled={soldOut} onClick={() => onOrder(meal)}>
        {soldOut ? t("board.soldOut") : t("board.order")}
      </button>
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
      className="fixed inset-0 z-30 flex items-end justify-center bg-foreground/45 p-3 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-title"
        className="lift-card max-h-[min(92dvh,44rem)] w-full max-w-lg overflow-y-auto rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-terracotta">{meal.kitchenName}</p>
            <p className="text-sm text-olive">{t("chef.rating")}</p>
            <h2 id="order-title" className="mt-1 font-display text-3xl">
              {meal.title}
            </h2>
          </div>
          <button type="button" className={quietButtonClass} onClick={onClose}>
            {t("order.close")}
          </button>
        </div>
        {meal.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meal.photoUrl} alt="" className="mt-4 h-56 w-full rounded-3xl object-cover" />
        ) : null}
        <p className="mt-3 text-base leading-7 text-muted">{meal.description}</p>
        {receipt ? (
          <div className="mt-5 space-y-4 rounded-2xl bg-background p-4 text-base leading-7">
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
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
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
            <button className={`${primaryButtonClass} w-full`} type="submit" disabled={pending || remaining < 1}>
              {remaining < 1 ? t("board.soldOut") : pending ? t("order.placing") : t("order.place")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
