"use client";

import { motion, type Variants } from "framer-motion";
import { useI18n } from "@/components/language";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export function HomeIntro() {
  const { t } = useI18n();

  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-3 pt-4 pb-1 sm:px-6 sm:pt-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.p variants={item} className="gold-text text-sm font-bold tracking-wide">
          {t("home.kicker")}
        </motion.p>
        <motion.h1
          variants={item}
          className="mt-1 max-w-xl font-display text-3xl leading-tight text-foreground sm:text-5xl"
        >
          {t("home.title")}
        </motion.h1>
        <motion.p variants={item} className="mt-2 max-w-lg text-sm leading-6 text-muted sm:text-base">
          {t("home.body")}
        </motion.p>
      </motion.div>
      <motion.aside
        variants={item}
        initial="hidden"
        animate="show"
        className="lift-card rounded-3xl p-5 text-base leading-7 text-muted"
      >
        <p className="font-display text-2xl text-foreground">{t("home.how")}</p>
        <ol className="mt-3 list-decimal space-y-2 ps-5">
          <li>{t("home.step1")}</li>
          <li>{t("home.step2")}</li>
          <li>{t("home.step3")}</li>
        </ol>
      </motion.aside>
    </section>
  );
}
