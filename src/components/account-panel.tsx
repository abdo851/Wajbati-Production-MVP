"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CustomerOrders } from "@/components/customer-orders";
import { PasswordField } from "@/components/password-field";
import { ProfileExtras } from "@/components/profile-extras";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";
import { inputClass, primaryButtonClass, quietButtonClass } from "@/components/ui";
import { writeCheckout } from "@/lib/guest";
import { readJson } from "@/lib/read-json";

export function AccountPanel() {
  const { t } = useI18n();
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

  const customer = session?.user?.role === "customer" ? session.user : null;
  const staff =
    session?.user?.role === "chef" || session?.user?.role === "driver" || session?.user?.role === "admin"
      ? session.user
      : null;
  const deskHref =
    staff?.role === "chef"
      ? "/chef"
      : staff?.role === "driver"
        ? "/driver/dashboard"
        : staff?.role === "admin"
          ? "/admin"
          : null;

  useEffect(() => {
    if (!deskHref) return;
    router.replace(deskHref);
  }, [deskHref, router]);

  useEffect(() => {
    const user = session?.user;
    if (!user || user.role !== "customer") return;
    const timeout = window.setTimeout(() => {
      setFullName(user.fullName);
      setPhone(user.phone ?? "");
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

  if (staff && deskHref) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <p className="text-sm text-[color:var(--muted-strong)]">{t("account.redirecting")}</p>
        <Link href={deskHref} className={`${primaryButtonClass} mt-4 inline-flex`}>
          {t("account.openDesk")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6 sm:py-10">
      {customer ? (
        <p className="text-sm font-semibold text-olive">{t("account.signedIn")}</p>
      ) : null}
      <h1 className="mt-1 font-display text-[1.85rem] leading-tight text-ink sm:text-4xl">{t("account.title")}</h1>
      <p className="mt-3 text-sm leading-7 text-[color:var(--muted-strong)] sm:text-base sm:leading-8">
        {customer ? t("account.body") : t("account.guestLead")}
      </p>

      {customer ? (
        <form onSubmit={saveProfile} className="mt-6 space-y-4 rounded-[1.35rem] border border-line bg-card p-5">
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
      ) : null}

      {!session?.user ? (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-[1.35rem] border border-line bg-card p-5">
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
            <button
              type="button"
              className={`min-h-11 rounded-xl text-sm font-semibold transition ${
                mode === "signin" ? "bg-white text-ink shadow-sm" : "text-[color:var(--muted-strong)]"
              }`}
              onClick={() => setMode("signin")}
            >
              {t("account.signIn")}
            </button>
            <button
              type="button"
              className={`min-h-11 rounded-xl text-sm font-semibold transition ${
                mode === "create" ? "bg-white text-ink shadow-sm" : "text-[color:var(--muted-strong)]"
              }`}
              onClick={() => setMode("create")}
            >
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
          <div className="border-t border-line/80 pt-4 text-center">
            <p className="text-sm text-[color:var(--muted-strong)]">{t("account.joinRoles")}</p>
            <Link
              href="/join"
              className="mt-2 inline-flex min-h-10 items-center justify-center text-sm font-semibold text-gold-deep underline-offset-4 hover:underline"
            >
              {t("account.joinRolesCta")}
            </Link>
          </div>
        </form>
      ) : null}

      {customer ? <ProfileExtras role={session!.user!.role} /> : null}
      {customer ? (
        <div className="mt-8">
          <CustomerOrders compact />
        </div>
      ) : null}
    </main>
  );
}
