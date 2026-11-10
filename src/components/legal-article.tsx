"use client";

import Link from "next/link";
import { useI18n } from "@/components/language";
import type { MessageKey } from "@/lib/i18n";

const privacy: Array<[MessageKey, MessageKey]> = [
  ["privacy.collectTitle", "privacy.collect"],
  ["privacy.purposeTitle", "privacy.purpose"],
  ["privacy.keepTitle", "privacy.keep"],
  ["privacy.cndpTitle", "privacy.cndp"],
  ["privacy.rightsTitle", "privacy.rights"],
];

const terms: Array<[MessageKey, MessageKey]> = [
  ["terms.acceptTitle", "terms.accept"],
  ["terms.chefTitle", "terms.chef"],
  ["terms.driverTitle", "terms.driver"],
  ["terms.customerTitle", "terms.customer"],
  ["terms.codTitle", "terms.cod"],
  ["terms.cancelTitle", "terms.cancel"],
  ["terms.disputeTitle", "terms.dispute"],
];

export function PrivacyArticle() {
  const { t } = useI18n();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl">{t("privacy.title")}</h1>
      <div className="mt-6 space-y-5">
        {privacy.map(([title, body]) => (
          <section key={title}>
            <h2 className="font-display text-2xl">{t(title)}</h2>
            <p className="mt-2 text-base leading-8 text-muted">{t(body)}</p>
          </section>
        ))}
        <p className="text-base">{t("privacy.contact")}</p>
        <Link href="/terms" className="inline-flex text-base font-medium text-terracotta-deep underline">
          {t("footer.terms")}
        </Link>
      </div>
    </main>
  );
}

export function TermsArticle() {
  const { t } = useI18n();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl">{t("terms.title")}</h1>
      <section className="lift-card mt-6 rounded-3xl border-2 border-terracotta/50 bg-card p-5">
        <h2 className="font-display text-3xl">{t("terms.serviceTitle")}</h2>
        <p className="mt-3 text-lg leading-8">{t("terms.serviceBody")}</p>
      </section>
      <div className="mt-6 space-y-5">
        {terms.map(([title, body]) => (
          <section key={title}>
            <h2 className="font-display text-2xl">{t(title)}</h2>
            <p className="mt-2 text-base leading-8 text-muted">{t(body)}</p>
          </section>
        ))}
        <Link href="/privacy" className="inline-flex text-base font-medium text-terracotta-deep underline">
          {t("footer.privacy")}
        </Link>
      </div>
    </main>
  );
}

export function ChefGuideArticle() {
  const { t } = useI18n();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl leading-tight">{t("guide.title")}</h1>
      <ol className="mt-6 space-y-3 text-lg leading-8">
        <li>1. {t("guide.step1")}</li>
        <li>2. {t("guide.step2")}</li>
        <li>3. {t("guide.step3")}</li>
      </ol>
      <p className="lift-card mt-6 rounded-3xl border-2 border-olive/40 bg-card p-5 text-lg leading-8">{t("guide.note")}</p>
    </main>
  );
}
