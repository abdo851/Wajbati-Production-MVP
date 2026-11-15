"use client";

import { useEffect, useState } from "react";
import { ChefPublicProfile } from "@/components/chef-public-profile";
import { useI18n } from "@/components/language";
import { readJson } from "@/lib/read-json";
import type { PublicChefProfile } from "@/lib/types";

export function ChefProfileLoader({ chefId }: { chefId: string }) {
  const { t } = useI18n();
  const [chef, setChef] = useState<PublicChefProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch(`/api/chefs/${chefId}`, { cache: "no-store" })
        .then((response) => readJson<{ chef: PublicChefProfile }>(response))
        .then((body) => setChef(body.chef))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("err.kitchenMissing")));
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
