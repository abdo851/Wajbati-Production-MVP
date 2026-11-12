"use client";

import { useI18n } from "@/components/language";

export function HomeIntro() {
  const { t } = useI18n();

  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-3 pt-4 pb-1 sm:px-6 sm:pt-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
      <div>
        <p className="text-sm font-medium text-olive">{t("home.kicker")}</p>
        <h1 className="mt-1 max-w-xl font-display text-3xl leading-tight text-foreground sm:text-5xl">{t("home.title")}</h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted sm:text-base">{t("home.body")}</p>
      </div>
      <aside className="lift-card rounded-3xl p-5 text-base leading-7 text-muted">
        <p className="font-display text-2xl text-foreground">{t("home.how")}</p>
        <ol className="mt-3 list-decimal space-y-2 ps-5">
          <li>{t("home.step1")}</li>
          <li>{t("home.step2")}</li>
          <li>{t("home.step3")}</li>
        </ol>
      </aside>
    </section>
  );
}
