"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/password-field";
import { ProfileExtras } from "@/components/profile-extras";
import { SecureChat } from "@/components/secure-chat";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";
import { inputClass, primaryButtonClass, quietButtonClass, StatusPill } from "@/components/ui";
import { formatMad, formatWhen } from "@/lib/format";
import { readReceipts, writeCheckout } from "@/lib/guest";
import { readJson } from "@/lib/read-json";
import type { CustomerOrder, OrderReceipt } from "@/lib/types";

export function AccountPanel() {
  const { t, lang } = useI18n();
  const { session, reload } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deviceOrders, setDeviceOrders] = useState<OrderReceipt[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDeviceOrders(readReceipts());
      if (window.location.hash === "#orders") {
        document.getElementById("orders")?.scrollIntoView({ behavior: "smooth" });
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [t]);

  useEffect(() => {
    const user = session?.user;
    if (!user || user.role !== "customer") return;
    const timeout = window.setTimeout(() => {
      setFullName(user.fullName);
      setPhone(user.phone ?? "");
      void fetch("/api/account/orders", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return;
          const body = await readJson<{ orders: CustomerOrder[] }>(response);
          setOrders(body.orders);
        })
        .catch(() => setOrders([]));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const creating = mode === "create";
      const response = await fetch(creating ? "/api/auth/customer/register" : "/api/auth/customer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          creating ? { fullName, phone, email, password, passwordConfirm } : { identifier, password },
        ),
      });
      await readJson(response);
      if (creating) writeCheckout({ name: fullName, phone, address: "" });
      await reload();
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message === "Those credentials were not recognized." ? t("auth.invalid") : message || t("order.failed"));
    } finally {
      setPending(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone }),
      });
      await readJson(response);
      setNotice(t("account.saved"));
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("order.failed"));
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await reload();
    router.push("/");
    router.refresh();
  }

  const customer = session?.user?.role === "customer" ? session.user : null;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10 sm:px-6">
      <p className="text-base font-medium text-olive">{t("account.signedIn")}</p>
      <h1 className="mt-2 font-display text-4xl">{t("account.title")}</h1>
      <p className="mt-3 text-base leading-8 text-muted">{t("account.body")}</p>
      {customer ? (
        <form onSubmit={saveProfile} className="lift-card mt-6 space-y-4 rounded-3xl border border-line bg-card p-5">
          <label className="block text-base">
            <span className="mb-1.5 block font-medium">{t("order.name")}</span>
            <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </label>
          <label className="block text-base">
            <span className="mb-1.5 block font-medium">{t("auth.phone")}</span>
            <input className={inputClass} inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </label>
          {error ? <p className="text-sm text-terracotta-deep">{error}</p> : null}
          {notice ? <p className="text-sm text-olive">{notice}</p> : null}
          <button className={`${primaryButtonClass} w-full`} disabled={pending}>
            {pending ? t("auth.checking") : t("account.saved")}
          </button>
          <button type="button" className={`${quietButtonClass} w-full`} onClick={() => void signOut()}>
            {t("menu.signOut")}
          </button>
        </form>
      ) : (
        <form onSubmit={submit} className="lift-card mt-6 space-y-4 rounded-3xl border border-line bg-card p-5">
          <div className="grid grid-cols-2 gap-2 rounded-full bg-background p-1">
            <button type="button" className={`min-h-11 rounded-lg ${mode === "signin" ? "bg-saffron text-foreground" : ""}`} onClick={() => setMode("signin")}>
              {t("account.signIn")}
            </button>
            <button type="button" className={`min-h-11 rounded-lg ${mode === "create" ? "bg-saffron text-foreground" : ""}`} onClick={() => setMode("create")}>
              {t("account.create")}
            </button>
          </div>
          {mode === "create" ? (
            <>
              <label className="block text-base">
                <span className="mb-1.5 block font-medium">{t("order.name")}</span>
                <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              </label>
              <label className="block text-base">
                <span className="mb-1.5 block font-medium">{t("auth.phone")}</span>
                <input className={inputClass} inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required />
              </label>
              <label className="block text-base">
                <span className="mb-1.5 block font-medium">{t("account.optionalEmail")}</span>
                <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <PasswordField label={t("auth.password")} value={password} onChange={setPassword} autoComplete="new-password" />
              <PasswordField label={t("auth.confirm")} value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" />
            </>
          ) : (
            <>
              <label className="block text-base">
                <span className="mb-1.5 block font-medium">{t("auth.phoneOrEmail")}</span>
                <input className={inputClass} value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
              </label>
              <PasswordField label={t("auth.password")} value={password} onChange={setPassword} autoComplete="current-password" />
            </>
          )}
          {error ? <p className="text-sm text-terracotta-deep">{error}</p> : null}
          <button className={`${primaryButtonClass} w-full`} disabled={pending}>
            {pending ? t("auth.checking") : mode === "create" ? t("auth.register") : t("auth.signIn")}
          </button>
        </form>
      )}
      {session?.user ? <ProfileExtras role={session.user.role} /> : null}
      <section id="orders" className="mt-8">
        <h2 className="font-display text-3xl">{t("menu.orders")}</h2>
        {orders && orders.length === 0 ? <p className="mt-3 text-base text-muted">{t("account.empty")}</p> : null}
        <ul className="mt-3 space-y-3">
          {(orders ?? []).map((order) => (
            <li key={order.id} className="lift-card rounded-3xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">
                  {order.quantity} × {order.mealTitle}
                </p>
                <StatusPill status={order.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {order.kitchenName} · {formatMad(order.totalMad + order.deliveryFeeMad, lang)} · {formatWhen(order.createdAt, lang)}
              </p>
              {order.deliveryCode ? <p className="mt-2 font-display text-3xl tracking-[0.25em]">{order.deliveryCode}</p> : null}
              {order.status === "assigned" || order.status === "picked_up" || order.status === "delivered" ? (
                <div className="mt-4">
                  <SecureChat orderId={order.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-lg font-medium">{t("account.device")}</h3>
        <p className="mt-1 text-sm text-muted">{t("account.guestHint")}</p>
        {deviceOrders.length === 0 ? <p className="mt-3 text-base text-muted">{t("account.empty")}</p> : null}
        <ul className="mt-3 space-y-3">
          {deviceOrders.map((order) => (
            <li key={order.id} className="rounded-3xl border border-line bg-card p-4">
              <p className="font-medium">
                {order.quantity} × {order.mealTitle}
              </p>
              <p className="mt-1 text-sm text-muted">
                {order.kitchenName} · {formatMad(order.totalMad + order.deliveryFeeMad, lang)}
              </p>
              {order.deliveryCode ? <p className="mt-2 font-display text-3xl tracking-[0.25em]">{order.deliveryCode}</p> : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
