"use client";

import Link from "next/link";
import { useI18n } from "@/components/language";
import { primaryButtonClass } from "@/components/ui";

export function RegistrationSuccess() {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-1 items-center justify-center px-4 py-16">
      <section className="w-full rounded-3xl border border-[#E7E0D6] bg-card px-6 py-12 text-center shadow-[0_12px_40px_rgba(30,26,21,0.08)]">
        <p className="font-display text-2xl leading-10 text-foreground">{t("auth.reviewReady")}</p>
        <Link href="/" className={`${primaryButtonClass} mt-8 inline-flex`}>
          {t("auth.backHome")}
        </Link>
      </section>
    </main>
  );
}
