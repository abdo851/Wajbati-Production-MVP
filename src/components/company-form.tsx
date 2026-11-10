"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/components/language";
import { inputClass, primaryButtonClass } from "@/components/ui";

export function CompanyForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "company_interest" }),
    });
    const body = (await response.json()) as { ok?: boolean };
    if (!response.ok || !body.ok) {
      setError(t("order.failed"));
      return;
    }
    setNotice(t("company.thanks"));
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl">{t("company.title")}</h1>
      <p className="mt-3 text-base leading-8 text-muted">{t("company.body")}</p>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-line bg-card p-5 shadow-[0_4px_20px_rgba(30,26,21,0.08)]">
        <label className="block text-base">
          <span className="mb-1.5 block font-medium">{t("auth.email")}</span>
          <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {error ? <p className="text-sm text-terracotta-deep">{error}</p> : null}
        {notice ? <p className="text-sm text-olive">{notice}</p> : null}
        <button className={primaryButtonClass}>{t("company.send")}</button>
      </form>
    </main>
  );
}
