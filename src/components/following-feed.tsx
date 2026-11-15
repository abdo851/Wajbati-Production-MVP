"use client";

import Link from "next/link";
import { useI18n } from "@/components/language";
import { useLiveQuery } from "@/components/use-live-query";
import { useSession } from "@/components/use-session";
import { formatMad, formatServiceDate } from "@/lib/format";
import type { MealListResponse } from "@/lib/types";

export function FollowingFeed() {
  const { t, lang } = useI18n();
  const { session, error: sessionError } = useSession();
  const signedIn = Boolean(session?.user && session.user.role === "customer");
  const { data, error, loading } = useLiveQuery<MealListResponse>(signedIn ? "/api/following/meals" : null, 8000);

  if (!session && !sessionError) {
    return <p className="mt-8 text-base text-muted">{t("board.loading")}</p>;
  }
  if (!signedIn) {
    return (
      <div className="mt-8 space-y-4">
        <p className="text-base text-muted">{t("following.signIn")}</p>
        <Link href="/account" className="inline-flex min-h-11 items-center font-medium text-terracotta-deep underline">
          {t("nav.profile")}
        </Link>
      </div>
    );
  }

  const meals = data?.meals ?? [];

  return (
    <div className="mt-6">
      {error ? <p className="text-base text-terracotta-deep">{error}</p> : null}
      {loading && !data ? <p className="text-base text-muted">{t("board.loading")}</p> : null}
      {!loading && !error && meals.length === 0 ? (
        <p className="lift-card rounded-3xl px-5 py-10 text-center text-base text-muted">{t("following.empty")}</p>
      ) : null}
      {data ? (
        <p className="mb-4 text-sm text-muted">{formatServiceDate(data.serviceDate, lang)}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {meals.map((meal) => (
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
              {meal.chefId ? (
                <Link href={`/chef/${meal.chefId}`} className="block truncate text-xs text-terracotta-deep underline">
                  {meal.kitchenName}
                </Link>
              ) : (
                <p className="truncate text-xs text-muted">{meal.kitchenName}</p>
              )}
              <p className="text-sm font-semibold">{formatMad(meal.priceMad, lang)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
