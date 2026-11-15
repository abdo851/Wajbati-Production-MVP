"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";
import { primaryButtonClass, quietButtonClass } from "@/components/ui";
import { formatMad } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { PublicChefProfile } from "@/lib/types";

export function ChefPublicProfile({ initial }: { initial: PublicChefProfile }) {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleFollow() {
    if (!session?.user || session.user.role !== "customer") {
      router.push("/account");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chefId: profile.id }),
      });
      const body = await readJson<{ following: boolean }>(response);
      setProfile((current) => ({ ...current, following: body.following }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("err.generic"));
    } finally {
      setBusy(false);
    }
  }

  const stats = [
    { value: String(profile.meals.length), label: t("chef.publicMeals") },
    { value: profile.averageRating > 0 ? profile.averageRating.toFixed(1) : "—", label: t("chef.statRating") },
    { value: profile.city || "—", label: t("chef.city") },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-3xl border border-line bg-card shadow-lux"
      >
        <div className="relative h-44 bg-gradient-to-l from-gold/30 via-surface to-terracotta/15 sm:h-56">
          {profile.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="relative px-5 pb-6 pt-0 sm:px-8">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="size-24 rounded-full bg-gradient-to-l from-gold to-gold-deep p-[3px] sm:size-28">
                <div className="size-full overflow-hidden rounded-full border-4 border-card bg-surface">
                  {profile.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl text-muted/50" aria-hidden="true">
                      🍽
                    </span>
                  )}
                </div>
              </div>
              <div className="pb-1">
                <h1 className="font-display text-3xl leading-tight">{profile.kitchenName}</h1>
                <p className="text-sm text-muted">{profile.city || "—"}</p>
              </div>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              className={profile.following ? quietButtonClass : primaryButtonClass}
              disabled={busy}
              onClick={() => void toggleFollow()}
            >
              {profile.following ? t("chef.publicFollowing") : t("chef.publicFollow")}
            </motion.button>
          </div>

          <div className="mt-6 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface/60 py-3 text-center rtl:divide-x-reverse">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-xl leading-7">{stat.value}</p>
                <p className="mt-0.5 text-xs font-semibold text-muted">{stat.label}</p>
              </div>
            ))}
          </div>

          <p className="mt-5 text-base leading-7 text-foreground">{profile.bio || "—"}</p>
          {error ? <p className="mt-3 text-sm text-terracotta-deep">{error}</p> : null}
        </div>
      </motion.div>

      <section className="mt-8">
        <h2 className="font-display text-2xl">{t("chef.publicMeals")}</h2>
        {profile.meals.length === 0 ? (
          <p className="mt-3 text-base text-muted">{t("board.empty")}</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {profile.meals.map((meal, index) => (
              <motion.li
                key={meal.id}
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.35), ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -4 }}
                className="group overflow-hidden rounded-2xl border border-line bg-card shadow-lux transition-shadow duration-300 hover:shadow-lux-lg"
              >
                <div className="aspect-square overflow-hidden bg-surface">
                  {meal.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={meal.photoUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.08]"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl text-muted/40" aria-hidden="true">
                      🍽
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-2.5">
                  <p className="line-clamp-2 min-h-10 text-sm font-semibold">{meal.title}</p>
                  <p className="text-sm font-bold">{formatMad(meal.priceMad, lang)}</p>
                  <Link href="/#meals" className="text-xs font-bold text-gold-deep underline-offset-2 hover:underline">
                    {t("board.add")}
                  </Link>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
