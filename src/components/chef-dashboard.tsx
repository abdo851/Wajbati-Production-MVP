"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { LoginCard } from "@/components/login-card";
import { ProfileExtras } from "@/components/profile-extras";
import { ProfilePhoto } from "@/components/site-header";
import { SecureInbox } from "@/components/secure-chat";
import { WalletPanel } from "@/components/wallet-panel";
import { inputClass, LiveDot, primaryButtonClass, quietButtonClass, StatusPill } from "@/components/ui";
import { useI18n } from "@/components/language";
import { useLiveQuery } from "@/components/use-live-query";
import { useSession } from "@/components/use-session";
import { formatMad, formatServiceDate, formatWhen } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { ChefBoard, ChefOrder, OrderStatus } from "@/lib/types";

export function ChefDashboard() {
  const { t } = useI18n();
  const { session, error, reload } = useSession();
  const user = session?.user ?? null;
  const [reapply, setReapply] = useState(false);

  useEffect(() => {
    document.title = `${t("login.kitchen")} · Wajbati`;
  }, [t]);

  useEffect(() => {
    if (window.sessionStorage.getItem("wajbati_chef_reapply") !== "1") return;
    window.sessionStorage.removeItem("wajbati_chef_reapply");
    setReapply(true);
  }, []);

  if (!session) {
    return <p className="px-4 py-16 text-sm text-muted">{error ?? t("gate.checking")}</p>;
  }
  if (!user) {
    return <LoginCard desk="chef" onSuccess={reload} startMode={reapply ? "register" : "login"} />;
  }
  if (user.role !== "chef") {
    const href = user.role === "customer" ? "/account" : "/";
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-4xl">{t("gate.notChef")}</h1>
        <p className="mt-3 text-base leading-7 text-muted">{t("gate.notChefBody")}</p>
        <Link href={href} className={`${primaryButtonClass} mt-6`}>
          {t("gate.openDashboard")}
        </Link>
      </main>
    );
  }
  return (
    <Kitchen
      userName={user.fullName || user.email}
      kitchen={user.kitchenName}
      city={user.city}
      bio={user.bio ?? ""}
      approval={user.approvalStatus ?? user.chefApprovalStatus}
      avatar={user.avatarDataUrl ?? null}
      onAvatarSaved={reload}
      onLogout={reload}
    />
  );
}

function AvatarPicker({ initialSrc, onSaved }: { initialSrc: string | null; onSaved: () => Promise<void> }) {
  const { t } = useI18n();
  const [src, setSrc] = useState(initialSrc);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSrc(initialSrc);
  }, [initialSrc]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 400 * 1024) {
      setError(t("photo.quality"));
      return;
    }
    const dataUrl = await new Promise<string | null>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(new Error(t("chef.updateFailed")));
      reader.readAsDataURL(file);
    });
    if (!dataUrl?.startsWith("data:image/")) return;
    setError(null);
    try {
      const body = new FormData();
      body.set("avatar", dataUrl);
      const response = await fetch("/api/profile/extras", { method: "POST", body });
      await readJson(response);
      setSrc(dataUrl);
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("chef.updateFailed"));
    }
  }

  return (
    <div className="mt-4">
      <label className="inline-flex aspect-square size-32 cursor-pointer items-center justify-center overflow-hidden rounded-full border-4 border-white bg-card shadow-[0_8px_30px_rgba(30,26,21,0.12)]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <ProfilePhoto label={t("profile.avatar")} className="size-32 border-0 shadow-none" />
        )}
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void choose(event)} />
      </label>
      {error ? <p className="mt-2 text-sm text-terracotta-deep">{error}</p> : null}
    </div>
  );
}

function Kitchen({
  userName,
  kitchen,
  city,
  bio,
  approval,
  avatar,
  onAvatarSaved,
  onLogout,
}: {
  userName: string;
  kitchen: string | null;
  city: string | null;
  bio: string;
  approval: ChefBoard["approvalStatus"] | null;
  avatar: string | null;
  onAvatarSaved: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLiveQuery<ChefBoard>("/api/chef/board");
  const status = data?.approvalStatus ?? approval;
  const approved = status !== "pending" && status !== "rejected";
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const photo = form.get("photo");
    setPending(true);
    setFormError(null);
    setNotice(null);
    try {
      const title = String(form.get("title") ?? "");
      const description = String(form.get("description") ?? "");
      const priceMad = Number(form.get("priceMad"));
      const maxQuantity = Number(form.get("maxQuantity"));
      const hasPhoto = photo instanceof File && photo.size > 0;
      if (hasPhoto && (photo.size < 100 * 1024 || photo.size > 5 * 1024 * 1024)) {
        throw new Error(t("photo.quality"));
      }
      let response: Response;
      if (hasPhoto && photo instanceof File) {
        const body = new FormData();
        body.set("title", title);
        body.set("description", description);
        body.set("priceMad", String(priceMad));
        body.set("maxQuantity", String(maxQuantity));
        body.set("photo", photo);
        response = await fetch("/api/chef/meals", { method: "POST", body });
      } else {
        response = await fetch("/api/chef/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, priceMad, maxQuantity }),
        });
      }
      await readJson(response);
      formElement.reset();
      setPreview(null);
      setNotice(t("chef.published"));
      await reload();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("chef.publishFailed");
      setFormError(message.includes("high-quality") ? t("photo.quality") : message.includes("under review") ? t("chef.pendingNotice") : message);
    } finally {
      setPending(false);
    }
  }

  async function saveMeal(event: FormEvent<HTMLFormElement>, mealId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFormError(null);
    try {
      const response = await fetch("/api/chef/meals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealId,
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
          priceMad: Number(form.get("priceMad")),
          maxQuantity: Number(form.get("maxQuantity")),
        }),
      });
      await readJson(response);
      setEditing(null);
      setNotice(t("chef.mealSaved"));
      await reload();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : t("chef.updateFailed"));
    }
  }

  async function removeMeal(mealId: string) {
    setFormError(null);
    try {
      const response = await fetch("/api/chef/meals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mealId }),
      });
      await readJson(response);
      await reload();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : t("chef.updateFailed"));
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await onLogout();
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <section className="rounded-3xl border border-line bg-card p-5 shadow-[0_8px_30px_rgba(30,26,21,0.08)] sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-olive">{kitchen ?? t("chef.kitchenFallback")}</p>
          <div className="flex items-center gap-3">
            <LiveDot />
            <button type="button" className={quietButtonClass} onClick={() => void logout()}>
              {t("menu.signOut")}
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <AvatarPicker initialSrc={avatar} onSaved={onAvatarSaved} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl leading-tight">{userName}</h1>
            <p className="mt-1 text-sm text-muted">{data?.serviceDate ? formatServiceDate(data.serviceDate) : t("chef.tabProfile")}</p>
            <button type="button" className={`${quietButtonClass} mt-4`} onClick={() => setEditingProfile((open) => !open)}>
              {t("profile.edit")}
            </button>
          </div>
        </div>
        <p className="mt-6 text-sm font-medium text-muted">{t("profile.bio")}</p>
        <p className="mt-1 text-base leading-7">{bio || "—"}</p>
        <p className="mt-3 text-sm font-medium text-muted">{t("chef.city")}</p>
        <p className="mt-1 text-base text-terracotta">{city || "—"}</p>
        {editingProfile ? <ProfileExtras role="chef" onSaved={onAvatarSaved} /> : null}
        <WalletPanel />
      </section>

      <section className="mt-8 rounded-3xl border border-line bg-card p-5 shadow-[0_8px_30px_rgba(30,26,21,0.08)]">
        <div className="mb-4 flex items-center gap-3">
          <ProfilePhoto src={avatar} label={userName} />
          <h2 className="font-display text-3xl">{t("chef.cookingTitle")}</h2>
        </div>
        <form onSubmit={publish} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("chef.photo")}</span>
            <span className="flex min-h-52 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed border-[#B85C3E]/50 bg-[#B85C3E]/10 px-4 py-6 text-center">
              {preview ? (
                <span className="mb-3 block aspect-video w-full overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="" className="h-full w-full rounded-lg object-cover" />
                </span>
              ) : (
                <span className="mb-2 inline-flex size-12 items-center justify-center rounded-2xl bg-[#B85C3E] text-[#FAF6EF]" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 16l4.5-4.5a2 2 0 012.8 0L16 16" />
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <circle cx="9" cy="9" r="1.2" fill="currentColor" />
                  </svg>
                </span>
              )}
              <span className="text-base font-medium">{t("chef.photo")}</span>
              <span className="mt-1 text-sm text-muted">{t("chef.photoHint")}</span>
              <input
                className="sr-only"
                name="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    setPreview(null);
                    return;
                  }
                  if (file.size < 100 * 1024 || file.size > 5 * 1024 * 1024) {
                    setFormError(t("photo.quality"));
                    event.target.value = "";
                    setPreview(null);
                    return;
                  }
                  setFormError(null);
                  setPreview(URL.createObjectURL(file));
                }}
              />
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("chef.fieldTitle")}</span>
            <input className={inputClass} name="title" required minLength={3} maxLength={80} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium">{t("chef.fieldDescription")}</span>
            <textarea className={`${inputClass} min-h-28 resize-y`} name="description" required minLength={10} maxLength={400} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">{t("chef.fieldPrice")}</span>
              <input className={inputClass} name="priceMad" type="number" min={1} max={500} step="0.5" required />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">{t("chef.fieldQuantity")}</span>
              <input className={inputClass} name="maxQuantity" type="number" min={1} max={200} step={1} required />
            </label>
          </div>
          {formError ? (
            <p role="alert" className="text-sm text-terracotta-deep">
              {formError}
            </p>
          ) : null}
          {notice ? <p className="text-sm text-olive">{notice}</p> : null}
          <button className={`${primaryButtonClass} w-full text-lg`} type="submit" disabled={pending || !approved}>
            {pending ? t("chef.publishing") : t("chef.publish")}
          </button>
        </form>
      </section>

      <div className="mt-10 space-y-6">
          {error ? (
            <p role="alert" className="text-sm text-terracotta-deep">
              {error}
            </p>
          ) : null}
          <section>
            <h2 className="font-display text-2xl">{t("chef.onBoard")}</h2>
            {loading && !data ? <p className="mt-3 text-sm text-muted">{t("chef.loading")}</p> : null}
            <ul className="mt-3 space-y-3">
              {(data?.meals ?? []).map((meal) => (
                <li key={meal.id} className="rounded-3xl border border-line bg-card px-4 py-3">
                  {meal.photoUrl ? (
                    <span className="mb-3 block aspect-video w-full overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={meal.photoUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                    </span>
                  ) : null}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{meal.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {formatMad(meal.priceMad)} · {t("chef.portionsLeft", { left: meal.remainingQuantity, max: meal.maxQuantity })}
                        {meal.isPublished ? "" : ` · ${t("chef.hidden")}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={quietButtonClass} onClick={() => setEditing(editing === meal.id ? null : meal.id)}>
                        {t("chef.edit")}
                      </button>
                      <button type="button" className={quietButtonClass} onClick={() => void removeMeal(meal.id)}>
                        {t("chef.delete")}
                      </button>
                    </div>
                  </div>
                  {editing === meal.id ? (
                    <form className="mt-3 grid gap-2" onSubmit={(event) => void saveMeal(event, meal.id)}>
                      <input className={inputClass} name="title" defaultValue={meal.title} required minLength={3} maxLength={80} />
                      <textarea className={`${inputClass} min-h-24`} name="description" defaultValue={meal.description} required minLength={10} maxLength={400} />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inputClass} name="priceMad" type="number" min={1} max={500} step="0.5" defaultValue={meal.priceMad} required />
                        <input className={inputClass} name="maxQuantity" type="number" min={1} max={200} step={1} defaultValue={meal.maxQuantity} required />
                      </div>
                      <button className={primaryButtonClass} type="submit">{t("chef.mealSaved")}</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {data && data.meals.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("chef.emptyToday")}</p>
            ) : null}
          </section>
          <OrderList orders={data?.orders ?? []} onChanged={() => void reload()} />
          <SecureInbox />
      </div>
    </main>
  );
}

function OrderList({ orders, onChanged }: { orders: ChefOrder[]; onChanged: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function update(order: ChefOrder, status: OrderStatus) {
    if (status === "cancelled" && !window.confirm(t("chef.cancelAsk"))) {
      return;
    }
    setBusy(order.id);
    setError(null);
    try {
      const response = await fetch("/api/chef/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, status }),
      });
      await readJson(response);
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("chef.orderFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="font-display text-2xl">{t("chef.orders")}</h2>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-terracotta-deep">
          {error}
        </p>
      ) : null}
      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("chef.ordersEmpty")}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="rounded-3xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {order.quantity} × {order.mealTitle}
                  </p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div>
                      <dt className="text-xs text-muted">{t("order.name")}</dt>
                      <dd className="font-medium">{order.customerName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("order.phone")}</dt>
                      <dd>{order.customerPhone}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("order.address")}</dt>
                      <dd>{order.deliveryAddress}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t("order.notes")}</dt>
                      <dd>{order.customerNotes || "—"}</dd>
                    </div>
                  </dl>
                  <p className="mt-1 text-sm text-muted">{t("pay.cash")}</p>
                  <p className="mt-1 text-xs text-muted">{formatWhen(order.createdAt)}</p>
                </div>
                <div className="text-end">
                  <StatusPill status={order.status} />
                  <p className="mt-2 text-sm">{formatMad(order.totalMad)}</p>
                  <p className="text-xs text-muted">{t("chef.youKeep", { amount: formatMad(order.netMad) })}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {order.status === "pending" ? (
                  <button type="button" className={quietButtonClass} disabled={busy === order.id} onClick={() => void update(order, "confirmed")}>
                    {t("chef.confirm")}
                  </button>
                ) : null}
                {order.status === "confirmed" ? (
                  <p className="self-center text-sm text-muted">{t("chef.readyDriver")}</p>
                ) : null}
                {order.status === "assigned" || order.status === "picked_up" ? (
                  <p className="self-center text-sm text-muted">{t("chef.driverHas")}</p>
                ) : null}
                {order.status === "pending" || order.status === "confirmed" ? (
                  <button type="button" className={quietButtonClass} disabled={busy === order.id} onClick={() => void update(order, "cancelled")}>
                    {t("chef.cancel")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
