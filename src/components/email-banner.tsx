"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";

const DISMISS_KEY = "wajbati_email_prompt_dismissed";
const SUBSCRIBED_KEY = "wajbati_email_subscribed";

export function EmailBanner() {
  const { t, dir } = useI18n();
  const { session } = useSession();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user || window.localStorage.getItem(SUBSCRIBED_KEY) === "true") {
      const timeout = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(timeout);
    }
    const storedDismiss = window.localStorage.getItem(DISMISS_KEY);
    const dismissed = storedDismiss === "true" || storedDismiss === "1";
    const timeout = window.setTimeout(() => setVisible(true), dismissed ? 2000 : 0);
    return () => window.clearTimeout(timeout);
  }, [session?.user]);

  if (session?.user || !visible) {
    return toast ? <p className="mx-auto max-w-6xl px-4 pt-4 text-base text-olive sm:px-6">{toast}</p> : null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "home_banner" }),
    });
    const body = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      setError(body.error === "invalid_email" ? t("auth.email") : t("order.failed"));
      return;
    }
    window.localStorage.setItem(SUBSCRIBED_KEY, "true");
    setToast(t("banner.thanks"));
    setVisible(false);
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <form
        onSubmit={submit}
        className="relative overflow-hidden rounded-3xl bg-[#B85C3E] px-5 py-6 text-[#FAF6EF] shadow-[0_4px_20px_rgba(30,26,21,0.08)] sm:px-8"
      >
        <button
          type="button"
          className={`absolute top-3 ${dir === "rtl" ? "left-3" : "right-3"} inline-flex size-9 items-center justify-center rounded-full bg-[#FAF6EF]/15 text-lg`}
          aria-label={t("banner.dismiss")}
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "true");
            setVisible(false);
          }}
        >
          ×
        </button>
        <div className="flex items-start gap-4 pe-10">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#FAF6EF]/15" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 7 9-7" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl leading-snug sm:text-3xl">{t("banner.body")}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                className="min-h-12 w-full rounded-2xl border border-[#FAF6EF]/30 bg-[#FAF6EF] px-4 text-base text-foreground outline-none"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder={t("auth.email")}
              />
              <button className="min-h-12 rounded-2xl bg-[#FAF6EF] px-5 text-base font-medium text-[#8C3E28]" type="submit">
                {t("banner.send")}
              </button>
            </div>
            {error ? <p className="mt-2 text-sm text-[#FAF6EF]">{error}</p> : null}
          </div>
        </div>
      </form>
    </section>
  );
}
