"use client";

import { useEffect, useState } from "react";
import { ChefPublicProfile } from "@/components/chef-public-profile";
import { useI18n } from "@/components/language";
import type { PublicMarketplaceListing } from "@/lib/marketplace/types";
import { readJson } from "@/lib/read-json";
import type { PublicChefProfile } from "@/lib/types";

export function ChefProfileLoader({ chefId }: { chefId: string }) {
  const { t } = useI18n();
  const [chef, setChef] = useState<PublicChefProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/chefs/${encodeURIComponent(chefId)}`, { cache: "no-store" });
          const body = await readJson<{ chef: PublicChefProfile }>(response);
          setChef(body.chef);
          setError(null);
          return;
        } catch {
          // Marketplace sellers may exist as listing owners before a legacy chef row is present.
        }
        try {
          const response = await fetch(`/api/marketplace/search?chefProfileId=${encodeURIComponent(chefId)}`, {
            cache: "no-store",
          });
          const body = await readJson<{ items: PublicMarketplaceListing[] }>(response);
          const items = body.items ?? [];
          if (items.length === 0) {
            setError(t("err.kitchenMissing"));
            return;
          }
          const first = items[0];
          setChef({
            id: chefId,
            userId: first.sellerUserId,
            kitchenName: first.kitchenName?.trim() || t("market.storeIdentity"),
            bio: "",
            city: first.city || "",
            avatarUrl: null,
            coverUrl: first.images[0] ?? null,
            gallery: [],
            averageRating: 0,
            following: false,
            meals: [],
          });
          setError(null);
        } catch (caught: unknown) {
          setError(caught instanceof Error ? caught.message : t("err.kitchenMissing"));
        }
      })();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [chefId, t]);

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-base text-terracotta-deep">{error}</p>
      </main>
    );
  }
  if (!chef) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <p className="text-base text-muted">{t("board.loading")}</p>
      </main>
    );
  }
  return <ChefPublicProfile initial={chef} />;
}
