"use client";

import { motion, type Variants } from "framer-motion";
import { useI18n } from "@/components/language";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Compact customer hero — meals follow immediately. */
export function HomeIntro() {
  const { t } = useI18n();

  return (
    <section className="relative isolate overflow-hidden border-b border-line/70">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(90% 70% at 100% 0%, rgb(201 162 75 / 18%), transparent 55%), radial-gradient(70% 55% at 0% 20%, rgb(92 114 80 / 10%), transparent 50%), linear-gradient(180deg, #faf7f2 0%, #f3efe8 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-16 bg-gradient-to-t from-background to-transparent"
        aria-hidden="true"
      />
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto flex max-w-6xl flex-col justify-end gap-4 px-4 pb-7 pt-8 sm:gap-5 sm:px-6 sm:pb-9 sm:pt-10"
      >
        <motion.p
          variants={item}
          className="text-[0.7rem] font-bold tracking-[0.18em] text-gold-deep uppercase sm:text-xs"
        >
          {t("home.kicker")}
        </motion.p>
        <motion.h1
          variants={item}
          className="max-w-[18ch] font-display text-[1.75rem] leading-[1.18] text-ink sm:max-w-xl sm:text-[2.35rem] sm:leading-tight"
        >
          {t("home.title")}
        </motion.h1>
        <motion.p
          variants={item}
          className="max-w-md text-[0.95rem] leading-7 text-[color:var(--muted-strong)] sm:text-base sm:leading-8"
        >
          {t("home.body")}
        </motion.p>
        <motion.div variants={item} className="flex flex-wrap items-center gap-3">
          <a
            href="#meals"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition duration-200 hover:bg-ink/90 active:scale-[0.98]"
          >
            {t("home.ctaMeals")}
          </a>
          <p className="max-w-[18rem] text-xs leading-5 text-[color:var(--muted-strong)] sm:text-sm sm:leading-6">
            {t("home.codHint")}
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}

/** Customer guidance placed after the meal board. */
export function HomeGuide() {
  const { t } = useI18n();

  const reasons = [
    { title: t("home.why1Title"), body: t("home.why1Body") },
    { title: t("home.why2Title"), body: t("home.why2Body") },
    { title: t("home.why3Title"), body: t("home.why3Body") },
  ] as const;

  const steps = [t("home.step1"), t("home.step2"), t("home.step3")] as const;

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        <h2 className="font-display text-2xl text-ink sm:text-3xl">{t("home.how")}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step} className="rounded-2xl border border-line/80 bg-white/70 px-4 py-4 backdrop-blur-sm">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-gold/15 text-sm font-bold text-gold-deep">
                {index + 1}
              </span>
              <p className="mt-3 text-sm leading-6 text-[color:var(--muted-strong)] sm:text-[0.95rem] sm:leading-7">
                {step}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-2 sm:px-6">
        <h2 className="font-display text-2xl text-ink sm:text-3xl">{t("home.whyTitle")}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {reasons.map((reason) => (
            <li key={reason.title} className="rounded-2xl border border-line/80 bg-card px-4 py-4">
              <h3 className="text-base font-semibold text-ink">{reason.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-strong)]">{reason.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
        <div className="rounded-3xl border border-line/80 bg-surface/80 px-5 py-6 sm:px-7 sm:py-7">
          <h2 className="font-display text-xl text-ink sm:text-2xl">{t("home.trustTitle")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--muted-strong)] sm:text-base">
            {t("home.trustBody")}
          </p>
        </div>
      </section>
    </div>
  );
}
