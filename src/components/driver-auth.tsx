"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/language";
import { PasswordField } from "@/components/password-field";
import { SignatureCapture } from "@/components/signature-pad";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { SERVICE_CITIES } from "@/lib/constants";
import { requiredDocumentKinds, sharpPhotoSize } from "@/lib/documents";
import { readJson } from "@/lib/read-json";
import type { DocumentKind, Vehicle } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n";

const labels: Record<DocumentKind, MessageKey> = {
  cin_front: "driver.docs.cinFront",
  cin_back: "driver.docs.cinBack",
  license: "driver.docs.license",
  vehicle_papers: "driver.docs.papers",
};

export function DriverAuth() {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "apply">("login");
  const [step, setStep] = useState<"account" | "documents">("account");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [city, setCity] = useState<string>(SERVICE_CITIES[0]);
  const [vehicle, setVehicle] = useState<Vehicle>("motorbike");
  const [files, setFiles] = useState<Partial<Record<DocumentKind, File>>>({});
  const [signature, setSignature] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [doneUrl, setDoneUrl] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const kinds = requiredDocumentKinds(vehicle);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (mode === "apply" && step === "account") {
      setStep("documents");
      return;
    }
    if (mode === "apply") {
      if (!signature || kinds.some((kind) => !files[kind])) {
        setError(t("driver.docs.need"));
        return;
      }
      if (kinds.some((kind) => files[kind] && !sharpPhotoSize(files[kind].size))) {
        setError(t("photo.quality"));
        return;
      }
    }
    setPending(true);
    try {
      if (mode === "login") {
        const response = await fetch("/api/auth/driver/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password }),
        });
        await readJson(response);
        router.push("/driver/dashboard");
        return;
      }
      const form = new FormData();
      form.set("fullName", fullName);
      form.set("email", email);
      form.set("phone", phone);
      form.set("password", password);
      form.set("passwordConfirm", passwordConfirm);
      form.set("city", city);
      form.set("vehicle", vehicle);
      form.set("signature", signature);
      for (const kind of kinds) {
        const file = files[kind];
        if (file) form.set(kind, file);
      }
      const response = await fetch("/api/auth/driver/register", { method: "POST", body: form });
      const body = await readJson<{ dev_confirmation_url?: string }>(response);
      setRegistered(true);
      setDoneUrl(body.dev_confirmation_url ?? null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("driver.updateFailed");
      setError(
        message.includes("high-quality")
          ? t("photo.quality")
          : message === "Please confirm your email first."
            ? t("auth.confirmEmail")
            : message === "Those credentials were not recognized."
              ? t("auth.invalid")
              : message,
      );
    } finally {
      setPending(false);
    }
  }

  if (registered) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-12 sm:px-6">
        <h1 className="font-display text-4xl">{t("auth.registered")}</h1>
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
      <p className="text-base font-medium text-olive">{t("nav.drive")}</p>
      <h1 className="mt-2 font-display text-4xl">{mode === "apply" ? t("driver.applyTitle") : t("driver.signInTitle")}</h1>
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-card p-1">
        <button type="button" className={`min-h-11 rounded-lg ${mode === "login" ? "bg-saffron text-foreground" : "text-muted"}`} onClick={() => { setMode("login"); setStep("account"); }}>
          {t("auth.signIn")}
        </button>
        <button type="button" className={`min-h-11 rounded-lg ${mode === "apply" ? "bg-saffron text-foreground" : "text-muted"}`} onClick={() => { setMode("apply"); setStep("account"); }}>
          {t("auth.createAccount")}
        </button>
      </div>
      <form onSubmit={submit} className="lift-card mt-4 space-y-4 rounded-3xl border border-line bg-card p-5">
        {mode === "apply" && step === "account" ? (
          <>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("order.name")}</span>
              <input className={inputClass} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("auth.email")}</span>
              <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
          </>
        ) : null}
        {step === "account" || mode === "login" ? (
          <>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{mode === "login" ? t("auth.phoneOrEmail") : t("auth.phone")}</span>
              <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} required />
            </label>
            <PasswordField label={t("auth.password")} value={password} onChange={setPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {mode === "apply" ? <PasswordField label={t("auth.confirm")} value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" /> : null}
          </>
        ) : null}
        {mode === "apply" && step === "documents" ? (
          <>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("chef.city")}</span>
              <select className={inputClass} value={city} onChange={(event) => setCity(event.target.value)}>
                {SERVICE_CITIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="block text-base">
              <span className="mb-1.5 block font-medium">{t("driver.vehicle")}</span>
              <select className={inputClass} value={vehicle} onChange={(event) => setVehicle(event.target.value as Vehicle)}>
                <option value="bike">{t("driver.vehicle.bike")}</option>
                <option value="motorbike">{t("driver.vehicle.motorbike")}</option>
                <option value="car">{t("driver.vehicle.car")}</option>
              </select>
            </label>
            <p className="text-base leading-7 text-muted">{vehicle === "bike" ? t("driver.docsBike") : t("driver.docsLicensed")}</p>
            {kinds.map((kind) => (
              <label key={kind} className="block text-base">
                <span className="mb-1.5 block font-medium">{t(labels[kind])}</span>
                <input
                  className={inputClass}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && !sharpPhotoSize(file.size)) {
                      setError(t("photo.quality"));
                      event.target.value = "";
                      setFiles((current) => ({ ...current, [kind]: undefined }));
                      return;
                    }
                    setError(null);
                    setFiles((current) => ({ ...current, [kind]: file }));
                  }}
                />
              </label>
            ))}
            <SignatureCapture label={t("driver.signature")} onChange={setSignature} />
          </>
        ) : null}
        {error ? <p role="alert" className="text-sm text-terracotta-deep">{error}</p> : null}
        <button className={`${primaryButtonClass} w-full`} type="submit" disabled={pending}>
          {pending ? t("auth.checking") : mode === "apply" && step === "account" ? t("chef.continue") : mode === "apply" ? t("auth.createAccount") : t("auth.signIn")}
        </button>
      </form>
    </main>
  );
}
