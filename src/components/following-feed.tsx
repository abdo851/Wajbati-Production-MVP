"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "@/components/language";
import { useLiveQuery } from "@/components/use-live-query";
import { useSession } from "@/components/use-session";
import { inputClass, primaryButtonClass } from "@/components/ui";
import { formatMad, formatServiceDate } from "@/lib/format";
import type { Lang, MessageKey } from "@/lib/i18n";
import { readJson } from "@/lib/read-json";
import type { MealListResponse } from "@/lib/types";

const EMAIL_KEY = "wajbati_following_email";

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; board: MealListResponse }
  | { kind: "error"; message: string };

export function FollowingFeed() {
  const { t, lang } = useI18n();
  const { session, error: sessionError } = useSession();
  const signedIn = Boolean(session?.user && session.user.role === "customer");
  const live = useLiveQuery<MealListResponse>(signedIn ? "/api/following/meals" : null, 8000);

  const [email, setEmail] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(EMAIL_KEY);
        if (saved) setEmail(saved);
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
      setLookup({ kind: "error", message: t("auth.email") });
      return;
    }
    setLookup({ kind: "loading" });
    try {
      const response = await fetch("/api/following/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const board = await readJson<MealListResponse & { customerName?: string }>(response);
      try {
        window.localStorage.setItem(EMAIL_KEY, trimmed);
      } catch {
        /* ignore */
      }
      setLookup({ kind: "ready", board });
    } catch (caught) {
      setLookup({ kind: "error", message: caught instanceof Error ? caught.message : t("live.failed") });
    }
  }

  if (!session && !sessionError) {
    return <p className="mt-8 text-base text-muted">{t("board.loading")}</p>;
  }

  if (signedIn) {
    return <FeedView board={live.data} loading={live.loading && !live.data} error={live.error} lang={lang} t={t} />;
  }

  return (
    <div className="mt-8">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="lift-card mx-auto max-w-md rounded-3xl p-6 text-center"
      >
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-gradient-to-l from-gold to-gold-deep text-white shadow-[0_10px_24px_-10px_rgba(169,127,44,0.8)]" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="mt-4 font-display text-2xl">{t("following.title")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{t("following.emailHint")}</p>
        <label className="mt-5 block text-start text-sm">
          <span className="mb-1.5 block font-semibold">{t("following.emailLabel")}</span>
          <input
            className={inputClass}
            type="email"
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        {lookup.kind === "error" ? <p className="mt-3 text-sm text-terracotta-deep">{lookup.message}</p> : null}
        <button className={`${primaryButtonClass} mt-4 w-full`} type="submit" disabled={lookup.kind === "loading"}>
          {lookup.kind === "loading" ? t("board.loading") : t("following.emailButton")}
        </button>
      </motion.form>

      {lookup.kind === "ready" ? (
        <div className="mt-10">
          <FeedView board={lookup.board} loading={false} error={null} lang={lang} t={t} />
        </div>
      ) : null}
    </div>
  );
}

function FeedView({
  board,
  loading,
  error,
  lang,
  t,
}: {
  board: MealListResponse | null;
  loading: boolean;
  error: string | null;
  lang: Lang;
  t: (key: MessageKey) => string;
}) {
  const meals = board?.meals ?? [];
  return (
    <div>
      {error ? <p className="mt-6 text-base text-terracotta-deep">{error}</p> : null}
      {loading ? <p className="mt-6 text-base text-muted">{t("board.loading")}</p> : null}
      {!loading && !error && board && meals.length === 0 ? (
        <p className="lift-card mt-6 rounded-3xl px-5 py-10 text-center text-base text-muted">{t("following.empty")}</p>
      ) : null}
      {board ? (
        <p className="mb-4 mt-6 text-sm font-semibold text-muted">{formatServiceDate(board.serviceDate, lang)}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {meals.map((meal, index) => (
          <motion.li
            key={meal.id}
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.35), ease: [0.22, 1, 0.36, 1] }}
            className="group overflow-hidden rounded-3xl border border-line bg-card shadow-lux transition-shadow duration-300 hover:shadow-lux-lg"
          >
            <div className="relative aspect-square overflow-hidden bg-surface">
              {meal.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={meal.photoUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-3xl text-muted/40" aria-hidden="true">
                  🍽
                </span>
              )}
            </div>
            <div className="space-y-1 p-3">
              <p className="line-clamp-2 min-h-10 text-sm font-semibold">{meal.title}</p>
              {meal.chefId ? (
                <Link href={`/chef/${meal.chefId}`} className="block truncate text-xs font-semibold text-gold-deep underline-offset-2 hover:underline">
                  {meal.kitchenName}
                </Link>
              ) : (
                <p className="truncate text-xs text-muted">{meal.kitchenName}</p>
              )}
              <p className="text-sm font-bold">{formatMad(meal.priceMad, lang)}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
