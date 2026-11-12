"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";

const DISMISS_KEY = "wajbati_email_prompt_dismissed";
const SUBSCRIBED_KEY = "wajbati_email_subscribed";

export function EmailBanner() {
  const { t } = useI18n();
  const { session } = useSession();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [thanks, setThanks] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user || window.localStorage.getItem(SUBSCRIBED_KEY) === "true" || window.localStorage.getItem(DISMISS_KEY) === "true") {
      const timeout = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => setVisible(true), 0);
    return () => window.clearTimeout(timeout);
  }, [session?.user]);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "true");
    setVisible(false);
    setThanks(null);
  }

  if (session?.user || (!visible && !thanks)) return null;

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
    setThanks(t("banner.thanks"));
    setVisible(false);
  }

  return (
    <section className="bg-[#8C3E28] text-[#FAF6EF]">
      {visible ? (
        <form onSubmit={submit} className="mx-auto flex h-12 max-h-[60px] w-full max-w-6xl items-center gap-2 px-3">
          <p className="hidden min-w-0 max-w-[42%] truncate text-xs text-white sm:block">{error ?? t("banner.body")}</p>
          <input
            className="h-8 min-w-0 flex-1 rounded-full border border-white/25 bg-white/15 px-3 text-sm text-white outline-none placeholder:text-white/70"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder={error ?? t("auth.email")}
            aria-label={t("auth.email")}
            aria-invalid={error ? true : undefined}
          />
          <button className="h-8 shrink-0 rounded-full bg-white px-3 text-xs font-semibold text-[#8C3E28]" type="submit">
            {t("banner.send")}
          </button>
          <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-lg leading-none text-white" aria-label={t("banner.dismiss")} onClick={dismiss}>
            ×
          </button>
        </form>
      ) : (
        <div className="mx-auto flex h-12 max-h-[60px] w-full max-w-6xl items-center gap-2 px-3">
          <p className="min-w-0 flex-1 truncate text-sm text-white">{thanks}</p>
          <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-lg leading-none text-white" aria-label={t("banner.dismiss")} onClick={dismiss}>
            ×
          </button>
        </div>
      )}
    </section>
  );
}
