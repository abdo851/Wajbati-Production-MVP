"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { SERVICE_CITIES } from "@/lib/constants";
import type { Role } from "@/lib/types";

function readFile(file: File | undefined): Promise<string | null> {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => reject(new Error("upload"));
    reader.readAsDataURL(file);
  });
}

export function ProfileExtras({ role }: { role: Role }) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const avatar = await readFile(form.get("avatarFile") instanceof File ? (form.get("avatarFile") as File) : undefined);
      const kitchen = await readFile(form.get("kitchenFile") instanceof File ? (form.get("kitchenFile") as File) : undefined);
      const vehicle = await readFile(form.get("vehicleFile") instanceof File ? (form.get("vehicleFile") as File) : undefined);
      const license = await readFile(form.get("licenseFile") instanceof File ? (form.get("licenseFile") as File) : undefined);
      const body = new FormData();
      if (avatar) body.set("avatar", avatar);
      if (kitchen) body.set("kitchenPhoto", kitchen);
      if (vehicle) body.set("vehiclePhoto", vehicle);
      if (license) body.set("licensePhoto", license);
      body.set("bio", String(form.get("bio") ?? ""));
      body.set("notes", String(form.get("notes") ?? ""));
      body.set("city", String(form.get("city") ?? ""));
      const response = await fetch("/api/profile/extras", { method: "POST", body });
      if (!response.ok) throw new Error("save");
      setNotice(t("profile.saved"));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message === "upload" ? t("profile.uploadFailed") : t("profile.saveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-lg border border-line bg-card p-5 shadow-[0_4px_20px_rgba(30,26,21,0.08)]">
      <h2 className="font-display text-2xl">{t("profile.extras")}</h2>
      <p className="text-base text-muted">{t("profile.optional")}</p>
      <label className="block text-base">
        <span className="mb-1.5 block font-medium">{t("profile.avatar")}</span>
        <input className={inputClass} name="avatarFile" type="file" accept="image/*" />
      </label>
      {role === "chef" ? (
        <>
          <label className="block text-base">
            <span className="mb-1.5 block font-medium">{t("profile.kitchenPhoto")}</span>
            <input className={inputClass} name="kitchenFile" type="file" accept="image/*" />
          </label>
          <label className="block text-base">
            <span className="mb-1.5 block font-medium">{t("profile.bio")}</span>
            <textarea className={`${inputClass} min-h-24`} name="bio" maxLength={280} />
          </label>
          <label className="block text-base">
            <span className="mb-1.5 block font-medium">{t("chef.city")}</span>
            <select className={inputClass} name="city" defaultValue={SERVICE_CITIES[0]}>
              {SERVICE_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      {role === "driver" ? (
        <>
          <label className="block text-base">
            <span className="mb-1.5 block font-medium">{t("profile.vehiclePhoto")}</span>
            <input className={inputClass} name="vehicleFile" type="file" accept="image/*" />
          </label>
          <label className="block text-base">
            <span className="mb-1.5 block font-medium">{t("profile.license")}</span>
            <input className={inputClass} name="licenseFile" type="file" accept="image/*" />
          </label>
          <label className="block text-base">
            <span className="mb-1.5 block font-medium">{t("profile.notes")}</span>
            <textarea className={`${inputClass} min-h-24`} name="notes" maxLength={400} />
          </label>
        </>
      ) : null}
      {error ? <p className="text-sm text-terracotta-deep">{error}</p> : null}
      {notice ? <p className="text-sm text-olive">{notice}</p> : null}
      <button className={primaryButtonClass} disabled={pending}>
        {t("profile.save")}
      </button>
    </form>
  );
}
