"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/language";
import { useSession } from "@/components/use-session";
import { primaryButtonClass, quietButtonClass } from "@/components/ui";
import { formatMad } from "@/lib/format";
import { readJson } from "@/lib/read-json";
import type { PublicChefProfile } from "@/lib/types";

export function ChefPublicProfile({ initial }: { initial: PublicChefProfile }) {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const [profile, setProfile] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleFollow() {
    if (!session?.user || session.user.role !== "customer") {
      window.location.href = "/account";
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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10">
      <div className="overflow-hidden rounded-3xl border border-line bg-card shadow-[0_8px_30px_rgba(30,26,21,0.08)]">
        <div className="relative h-40 bg-[#F3EBE1] sm:h-52">
          {profile.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="relative px-5 pb-6 pt-0 sm:px-8">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-3">
              <div className="size-20 overflow-hidden rounded-full border-4 border-card bg-[#E7E0D6] sm:size-24">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-3xl text-[#C4B6A6]" aria-hidden="true">
                    🍽
                  </span>
                )}
              </div>
              <div className="pb-1">
                <h1 className="font-display text-3xl leading-tight">{profile.kitchenName}</h1>
                <p className="text-sm text-muted">{profile.city || "—"}</p>
                <p className="mt-1 text-sm font-medium text-[#D89B3D]">
                  {t("chef.ratingLabel", { score: profile.averageRating > 0 ? profile.averageRating.toFixed(1) : "—" })}
                </p>
              </div>
            </div>
            <button type="button" className={profile.following ? quietButtonClass : primaryButtonClass} disabled={busy} onClick={() => void toggleFollow()}>
              {profile.following ? t("chef.publicFollowing") : t("chef.publicFollow")}
            </button>
          </div>
          <p className="mt-5 text-base leading-7 text-foreground">{profile.bio || "—"}</p>
          {error ? <p className="mt-3 text-sm text-terracotta-deep">{error}</p> : null}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-2xl">{t("chef.publicMeals")}</h2>
        {profile.meals.length === 0 ? (
          <p className="mt-3 text-base text-muted">{t("board.empty")}</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {profile.meals.map((meal) => (
              <li key={meal.id} className="overflow-hidden rounded-xl border border-line bg-card">
                <div className="aspect-square bg-[#F3EBE1]">
                  {meal.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meal.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-3xl text-[#C4B6A6]" aria-hidden="true">
                      🍽
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-2.5">
                  <p className="line-clamp-2 min-h-10 text-sm font-medium">{meal.title}</p>
                  <p className="text-sm font-semibold">{formatMad(meal.priceMad, lang)}</p>
                  <Link href="/#meals" className="text-xs font-medium text-terracotta-deep underline">
                    {t("board.add")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
