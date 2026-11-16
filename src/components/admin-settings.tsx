"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { readJson } from "@/lib/read-json";

export function AdminSettings() {
  const { t } = useI18n();
  const { session, reload } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState(session?.user?.email ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newEmail, newPassword }),
      });
      await readJson(response);
      setCurrentPassword("");
      setNewPassword("");
      toast.success(t("admin.updated"));
      await reload();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("order.failed");
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="lift-card mt-6 max-w-xl rounded-3xl p-6">
      <h2 className="font-display text-2xl">{t("admin.settingsTitle")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{t("admin.emailNote")}</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="mb-1.5 block font-semibold">{t("admin.currentPassword")}</span>
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-semibold">{t("admin.newEmail")}</span>
          <input
            className={inputClass}
            type="email"
            dir="ltr"
            autoComplete="email"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-semibold">{t("admin.newPassword")}</span>
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
          />
        </label>
        {error ? <p className="text-sm text-terracotta-deep">{error}</p> : null}
        <button className={primaryButtonClass} type="submit" disabled={pending}>
          {pending ? t("order.placing") : t("admin.update")}
        </button>
      </form>
    </section>
  );
}
