"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/password-field";
import { SignatureCapture } from "@/components/signature-pad";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { SERVICE_CITIES } from "@/lib/constants";
import { localizeKnownError } from "@/lib/error-text";
import { readJson } from "@/lib/read-json";
import type { AuthUser } from "@/lib/types";

export function LoginCard({
  desk,
  onSuccess,
  startMode = "login",
}: {
  desk: "chef" | "admin";
  onSuccess: () => Promise<void> | void;
  startMode?: "login" | "register";
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">(startMode);
  const [step, setStep] = useState<"account" | "safety">("account");
  const [fullName, setFullName] = useState("");
  const [kitchenName, setKitchenName] = useState("");
  const [city, setCity] = useState<string>(SERVICE_CITIES[0]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [signature, setSignature] = useState("");
  const [foodSafety, setFoodSafety] = useState(false);
  const [cinFront, setCinFront] = useState<File | null>(null);
  const [autoNumber, setAutoNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [doneUrl, setDoneUrl] = useState<string | null>(null);
  const admin = desk === "admin";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin && mode === "register" && step === "account") {
      setStep("safety");
      return;
    }
    if (!admin && mode === "register" && !signature) {
      setError(t("chef.signature"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (!admin && mode === "register") {
        const form = new FormData();
        form.set("fullName", fullName);
        form.set("kitchenName", kitchenName);
        form.set("city", city);
        form.set("email", email);
        form.set("phone", phone);
        form.set("password", password);
        form.set("passwordConfirm", passwordConfirm);
        form.set("foodSafetyAccepted", foodSafety ? "true" : "");
        form.set("autoEntrepreneurNumber", autoNumber);
        if (cinFront) form.set("cinFront", cinFront);
        if (signature) form.set("signature", signature);
        const response = await fetch("/api/auth/chef/register", { method: "POST", body: form });
        const body = await readJson<{ dev_confirmation_url?: string }>(response);
        setRegistered(true);
        setDoneUrl(body.dev_confirmation_url ?? null);
        return;
      }
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, desk }),
      });
      const body = await readJson<{ user: AuthUser }>(response);
      await onSuccess();
      if (body.user?.role === "chef") {
        router.push("/chef");
        router.refresh();
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("login.failed");
      setError(localizeKnownError(lang, message));
    } finally {
      setPending(false);
    }
  }

  if (registered) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-12 sm:px-6">
        <h1 className="font-display text-4xl">{t("auth.registered")}</h1>
        <p className="mt-4 text-base leading-8">{t("chef.pendingNotice")}</p>
        {doneUrl ? (
          <a className="mt-4 text-base font-medium text-terracotta-deep underline" href={doneUrl}>
            {t("auth.devLink")}
          </a>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-12 sm:px-6">
      <p className="text-base font-medium text-olive">{admin ? t("admin.kicker") : t("nav.chef")}</p>
      <h1 className="mt-2 font-display text-4xl text-foreground">
        {admin ? t("admin.signInTitle") : mode === "register" ? t("chef.registerTitle") : t("login.kitchen")}
      </h1>
      <p className="mt-3 text-base leading-8 text-muted">
        {admin ? t("admin.signInBody") : mode === "register" ? t("chef.registerBody") : t("login.kitchenBody")}
      </p>
      {admin ? null : (
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-card p-1">
          <button type="button" className={`min-h-11 rounded-lg ${mode === "login" ? "bg-saffron text-foreground" : "text-muted"}`} onClick={() => { setMode("login"); setStep("account"); }}>
            {t("auth.signIn")}
          </button>
          <button type="button" className={`min-h-11 rounded-lg ${mode === "register" ? "bg-saffron text-foreground" : "text-muted"}`} onClick={() => { setMode("register"); setStep("account"); }}>
            {t("auth.createAccount")}
          </button>
        </div>
      )}
      <form onSubmit={submit} className="lift-card mt-4 space-y-4 rounded-3xl border border-line bg-card p-5">
        {!admin && mode === "register" && step === "account" ? (
          <>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("order.name")}</span>
              <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("chef.kitchen")}</span>
              <input className={inputClass} value={kitchenName} onChange={(event) => setKitchenName(event.target.value)} required />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("chef.city")}</span>
              <select className={inputClass} value={city} onChange={(event) => setCity(event.target.value)}>
                {SERVICE_CITIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("auth.phone")}</span>
              <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} required />
            </label>
          </>
        ) : null}
        {admin || mode === "login" || step === "account" ? (
          <>
            {admin || mode === "login" ? (
              <label className="block text-base">
                <span className="mb-1.5 block font-medium">{t("auth.email")}</span>
                <input className={inputClass} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
            ) : (
              <label className="block text-base">
                <span className="mb-1.5 block font-medium">{t("auth.email")}</span>
                <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
            )}
            <PasswordField label={t("auth.password")} value={password} onChange={setPassword} autoComplete={mode === "login" || admin ? "current-password" : "new-password"} />
            {!admin && mode === "register" ? (
              <PasswordField label={t("auth.confirm")} value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" />
            ) : null}
          </>
        ) : null}
        {!admin && mode === "register" && step === "safety" ? (
          <>
            <label className="flex items-start gap-3 text-base">
              <input type="checkbox" className="mt-1" checked={foodSafety} onChange={(event) => setFoodSafety(event.target.checked)} required />
              <span>{t("chef.pledge")}</span>
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("driver.docs.cinFront")}</span>
              <input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setCinFront(event.target.files?.[0] ?? null)} />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("chef.autoNumber")}</span>
              <input className={inputClass} value={autoNumber} onChange={(event) => setAutoNumber(event.target.value)} />
            </label>
            <SignatureCapture label={t("chef.signature")} onChange={setSignature} />
          </>
        ) : null}
        {error ? <p role="alert" className="text-sm text-terracotta-deep">{error}</p> : null}
        <button className={`${primaryButtonClass} w-full`} type="submit" disabled={pending}>
          {pending ? t("auth.checking") : !admin && mode === "register" && step === "account" ? t("chef.continue") : !admin && mode === "register" ? t("auth.createAccount") : t("auth.signIn")}
        </button>
      </form>
    </main>
  );
}
